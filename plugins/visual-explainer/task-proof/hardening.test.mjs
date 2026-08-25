import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CLAIM_KIND,
  PROTOCOL_VERSION,
  TaskProofError,
  createRepositorySnapshot,
  sha256,
} from './core.mjs';
import {
  finalizeReviewStrict,
  probeRepositoryEvidenceStrict,
  validateClaimEvidencePolicy,
  verifyMcpReceipt,
} from './hardening.mjs';
import { runNamedChecksStrict } from './named-checks.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function repository() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'task-proof-hardening-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Task Proof');
  git(repo, 'config', 'user.email', 'task-proof@example.invalid');
  writeFileSync(path.join(repo, 'app.txt'), 'before\n');
  git(repo, 'add', 'app.txt');
  git(repo, 'commit', '-qm', 'base');
  writeFileSync(path.join(repo, 'app.txt'), 'after\n');
  git(repo, 'add', 'app.txt');
  git(repo, 'commit', '-qm', 'implementation');
  return repo;
}

function claim(snapshot) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    kind: CLAIM_KIND,
    id: 'claim:TASK-2:claimant-run',
    generatedAt: '2026-08-26T00:00:00.000Z',
    producer: { runId: 'claimant-run', role: 'claimant' },
    repository: {
      branch: snapshot.repository.branch,
      baseSha: snapshot.repository.baseSha,
      headSha: snapshot.repository.headSha,
      dirty: snapshot.repository.dirty,
      snapshotDigest: snapshot.snapshotDigest,
    },
    task: {
      id: 'TASK-2',
      title: 'Evidence-bound review',
      objective: 'Only relevant reviewer evidence may verify completion.',
      acceptanceCriteria: [
        { id: 'AC-file', text: 'Implementation file changed.', requiredEvidenceKinds: ['diffstat'] },
        { id: 'AC-test', text: 'Named acceptance check passes.', requiredEvidenceKinds: ['test'] },
      ],
    },
    change: {
      thesis: 'Replace free-form review evidence with MCP-produced criterion-bound receipts.',
      before: ['Reviewer submits prose'],
      after: ['MCP observes repository', 'Gate checks criterion coverage'],
    },
    claims: [{
      id: 'C-implementation',
      statement: 'The implementation and acceptance check are complete.',
      declaredStatus: 'declared_done',
      acceptanceCriteriaIds: ['AC-file', 'AC-test'],
      evidenceIds: ['E-claim'],
    }],
    evidence: [{
      id: 'E-claim',
      kind: 'commit',
      locator: snapshot.repository.headSha,
      digest: sha256(snapshot.repository.headSha),
      producerRunId: 'claimant-run',
      trust: 'artifact',
    }],
  };
}

function allowlistedPolicy(repo, exitCode = 0) {
  mkdirSync(path.join(repo, '.task-proof'));
  writeFileSync(path.join(repo, '.task-proof', 'checks.json'), JSON.stringify({
    version: 1,
    checks: [{ id: 'acceptance', command: process.execPath, args: ['-e', `process.exit(${exitCode})`], cwd: '.' }],
  }));
}

test('criterion evidence policy rejects unknown or duplicate kinds', () => {
  const value = claim(createRepositorySnapshot({ repositoryPath: repository() }));
  value.task.acceptanceCriteria[0].requiredEvidenceKinds = ['diffstat', 'diffstat', 'imaginary'];
  const result = validateClaimEvidencePolicy(value);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'DUPLICATE_REQUIRED_EVIDENCE_KIND'));
  assert.ok(result.errors.some((item) => item.code === 'REQUIRED_EVIDENCE_KIND'));
});

test('strict file probe rejects parent-directory symlink escape', () => {
  const repo = repository();
  const outside = mkdtempSync(path.join(os.tmpdir(), 'task-proof-outside-'));
  writeFileSync(path.join(outside, 'secret.txt'), 'secret\n');
  symlinkSync(outside, path.join(repo, 'linked'));
  assert.throws(
    () => probeRepositoryEvidenceStrict({
      repositoryPath: repo,
      reviewerRunId: 'reviewer-run',
      probes: [{
        id: 'R-secret', type: 'file_digest', path: 'linked/secret.txt',
        supportsClaimIds: ['C-implementation'], supportsCriterionIds: ['AC-file'],
      }],
    }),
    (error) => error instanceof TaskProofError && error.code === 'PHYSICAL_PATH_ESCAPE',
  );
});

test('strict probes issue tamper-evident criterion-bound receipts', () => {
  const repo = repository();
  const result = probeRepositoryEvidenceStrict({
    repositoryPath: repo,
    reviewerRunId: 'reviewer-run',
    probes: [{
      id: 'R-change', type: 'changed_path', path: 'app.txt',
      supportsClaimIds: ['C-implementation'], supportsCriterionIds: ['AC-file'],
    }],
  });
  assert.equal(verifyMcpReceipt(result.evidence[0], result.snapshot.snapshotDigest), true);
  result.evidence[0].receipt.supportsCriterionIds.push('AC-test');
  assert.equal(verifyMcpReceipt(result.evidence[0], result.snapshot.snapshotDigest), false);
});

test('unrelated evidence cannot verify an uncovered criterion', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshot({ repositoryPath: repo });
  const observed = probeRepositoryEvidenceStrict({
    repositoryPath: repo,
    reviewerRunId: 'reviewer-run',
    probes: [{
      id: 'R-change', type: 'changed_path', path: 'app.txt',
      supportsClaimIds: ['C-implementation'], supportsCriterionIds: ['AC-file'],
    }],
  });
  const review = finalizeReviewStrict({
    claim: claim(snapshot),
    reviewer: { runId: 'reviewer-run', role: 'reviewer' },
    snapshot: observed.snapshot,
    findings: [{
      claimId: 'C-implementation', verdict: 'verified', rationale: 'Only the file change was reproduced.', reviewEvidenceIds: ['R-change'],
    }],
    reviewEvidence: observed.evidence,
  });
  assert.equal(review.findings[0].verdict, 'unsupported');
  assert.equal(review.gate.status, 'FAIL');
  assert.match(review.findings[0].rationale, /AC-test/);
});

test('named check execution is disabled by default', () => {
  const repo = repository();
  allowlistedPolicy(repo);
  const previous = process.env.TASK_PROOF_ALLOW_EXECUTION;
  delete process.env.TASK_PROOF_ALLOW_EXECUTION;
  try {
    assert.throws(
      () => runNamedChecksStrict({
        repositoryPath: repo,
        reviewerRunId: 'reviewer-run',
        requests: [{
          id: 'R-test', checkId: 'acceptance', kind: 'test',
          supportsClaimIds: ['C-implementation'], supportsCriterionIds: ['AC-test'],
        }],
      }),
      (error) => error instanceof TaskProofError && error.code === 'EXECUTION_DISABLED',
    );
  } finally {
    if (previous === undefined) delete process.env.TASK_PROOF_ALLOW_EXECUTION;
    else process.env.TASK_PROOF_ALLOW_EXECUTION = previous;
  }
});

test('allowlisted check plus changed-path evidence can produce PASS', () => {
  const repo = repository();
  allowlistedPolicy(repo, 0);
  const previous = process.env.TASK_PROOF_ALLOW_EXECUTION;
  process.env.TASK_PROOF_ALLOW_EXECUTION = '1';
  try {
    const fileResult = probeRepositoryEvidenceStrict({
      repositoryPath: repo,
      reviewerRunId: 'reviewer-run',
      probes: [{
        id: 'R-change', type: 'changed_path', path: 'app.txt',
        supportsClaimIds: ['C-implementation'], supportsCriterionIds: ['AC-file'],
      }],
    });
    const checkResult = runNamedChecksStrict({
      repositoryPath: repo,
      reviewerRunId: 'reviewer-run',
      requests: [{
        id: 'R-test', checkId: 'acceptance', kind: 'test',
        supportsClaimIds: ['C-implementation'], supportsCriterionIds: ['AC-test'],
      }],
    });
    assert.equal(fileResult.snapshot.snapshotDigest, checkResult.snapshot.snapshotDigest);
    const review = finalizeReviewStrict({
      claim: claim(fileResult.snapshot),
      reviewer: { runId: 'reviewer-run', role: 'reviewer' },
      snapshot: fileResult.snapshot,
      findings: [{
        claimId: 'C-implementation', verdict: 'verified', rationale: 'Both criteria were reproduced.', reviewEvidenceIds: ['R-change', 'R-test'],
      }],
      reviewEvidence: [...fileResult.evidence, ...checkResult.evidence],
    });
    assert.equal(review.gate.status, 'PASS');
  } finally {
    if (previous === undefined) delete process.env.TASK_PROOF_ALLOW_EXECUTION;
    else process.env.TASK_PROOF_ALLOW_EXECUTION = previous;
  }
});

test('failing named check cannot support PASS', () => {
  const repo = repository();
  allowlistedPolicy(repo, 7);
  const previous = process.env.TASK_PROOF_ALLOW_EXECUTION;
  process.env.TASK_PROOF_ALLOW_EXECUTION = '1';
  try {
    const checkResult = runNamedChecksStrict({
      repositoryPath: repo,
      reviewerRunId: 'reviewer-run',
      requests: [{
        id: 'R-test', checkId: 'acceptance', kind: 'test',
        supportsClaimIds: ['C-implementation'], supportsCriterionIds: ['AC-test'],
      }],
    });
    assert.equal(checkResult.evidence[0].result.exitCode, 7);
    const review = finalizeReviewStrict({
      claim: claim(checkResult.snapshot),
      reviewer: { runId: 'reviewer-run', role: 'reviewer' },
      snapshot: checkResult.snapshot,
      findings: [{
        claimId: 'C-implementation', verdict: 'verified', rationale: 'Attempted check.', reviewEvidenceIds: ['R-test'],
      }],
      reviewEvidence: checkResult.evidence,
    });
    assert.equal(review.gate.status, 'FAIL');
  } finally {
    if (previous === undefined) delete process.env.TASK_PROOF_ALLOW_EXECUTION;
    else process.env.TASK_PROOF_ALLOW_EXECUTION = previous;
  }
});

test('named check that mutates the repository invalidates the review', () => {
  const repo = repository();
  mkdirSync(path.join(repo, '.task-proof'));
  writeFileSync(path.join(repo, '.task-proof', 'mutate.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('mutation.txt', 'x');\n");
  writeFileSync(path.join(repo, '.task-proof', 'checks.json'), JSON.stringify({
    version: 1,
    checks: [{ id: 'mutate', command: process.execPath, args: ['.task-proof/mutate.mjs'], cwd: '.' }],
  }));
  const previous = process.env.TASK_PROOF_ALLOW_EXECUTION;
  process.env.TASK_PROOF_ALLOW_EXECUTION = '1';
  try {
    assert.throws(
      () => runNamedChecksStrict({
        repositoryPath: repo,
        reviewerRunId: 'reviewer-run',
        requests: [{
          id: 'R-mutate', checkId: 'mutate', kind: 'test',
          supportsClaimIds: ['C-implementation'], supportsCriterionIds: ['AC-test'],
        }],
      }),
      (error) => error instanceof TaskProofError && error.code === 'CHECK_MUTATED_REPOSITORY',
    );
  } finally {
    if (previous === undefined) delete process.env.TASK_PROOF_ALLOW_EXECUTION;
    else process.env.TASK_PROOF_ALLOW_EXECUTION = previous;
  }
});
