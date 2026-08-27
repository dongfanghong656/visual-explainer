import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CLAIM_KIND,
  PROTOCOL_VERSION,
  TaskProofError,
  sha256,
  validateClaim,
} from './core.mjs';
import { writeTaskProofArtifactsStrict } from './artifact-store.mjs';
import {
  finalizeReviewStrict,
  probeRepositoryEvidenceStrict,
} from './hardening.mjs';
import { runNamedChecksStrict } from './named-checks.mjs';
import { createRepositorySnapshotStrict } from './snapshot.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function repository() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'task-proof-entrypoint-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Task Proof');
  git(repo, 'config', 'user.email', 'task-proof@example.invalid');
  writeFileSync(path.join(repo, 'app.txt'), 'before\n');
  git(repo, 'add', 'app.txt');
  git(repo, 'commit', '-qm', 'base');
  writeFileSync(path.join(repo, 'app.txt'), 'after\n');
  git(repo, 'add', 'app.txt');
  git(repo, 'commit', '-qm', 'change');
  return repo;
}

function claimFor(snapshot) {
  const claim = {
    protocolVersion: PROTOCOL_VERSION,
    kind: CLAIM_KIND,
    id: 'claim:TASK-ENTRY:claimant-entry',
    generatedAt: '2026-08-26T00:00:00.000Z',
    producer: { runId: 'claimant-entry', role: 'claimant' },
    repository: {
      branch: snapshot.repository.branch,
      baseSha: snapshot.repository.baseSha,
      headSha: snapshot.repository.headSha,
      dirty: snapshot.repository.dirty,
      snapshotDigest: snapshot.snapshotDigest,
    },
    task: {
      id: 'TASK-ENTRY',
      title: 'Harden direct review entrypoints',
      objective: 'Reject forged roles, modified claims, and unrelated findings.',
      acceptanceCriteria: [{
        id: 'AC-app',
        text: 'app.txt changed in the reviewed scope.',
        requiredEvidenceKinds: ['diffstat'],
        requiredEvidenceLocators: ['app.txt'],
      }],
    },
    change: {
      thesis: 'Move trust checks into the strict core instead of relying only on MCP schemas.',
      before: ['Direct callers may bypass outer schemas'],
      after: ['Core validates role, claim digest, finding IDs, and evidence coverage'],
    },
    claims: [{
      id: 'C-app',
      statement: 'The required source path changed.',
      declaredStatus: 'declared_done',
      acceptanceCriteriaIds: ['AC-app'],
      evidenceIds: ['E-head'],
    }],
    evidence: [{
      id: 'E-head',
      kind: 'commit',
      locator: snapshot.repository.headSha,
      digest: sha256(snapshot.repository.headSha),
      producerRunId: 'claimant-entry',
      trust: 'artifact',
    }],
  };
  const validation = validateClaim(claim);
  assert.equal(validation.ok, true);
  claim.artifactDigest = validation.digest;
  return claim;
}

function reviewedEvidence(repo) {
  return probeRepositoryEvidenceStrict({
    repositoryPath: repo,
    reviewerRunId: 'reviewer-entry',
    probes: [{
      id: 'R-app',
      type: 'changed_path',
      path: 'app.txt',
      supportsClaimIds: ['C-app'],
      supportsCriterionIds: ['AC-app'],
    }],
  });
}

test('direct strict review rejects a non-reviewer role', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  assert.throws(
    () => finalizeReviewStrict({
      claim: claimFor(snapshot),
      reviewer: { runId: 'different-run', role: 'claimant' },
      snapshot,
      findings: [],
      reviewEvidence: [],
    }),
    (error) => error instanceof TaskProofError && error.code === 'REVIEWER_ROLE',
  );
});

test('direct strict review rejects a claim changed after its digest was issued', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  const claim = claimFor(snapshot);
  claim.claims[0].statement = 'Tampered after digest.';
  assert.throws(
    () => finalizeReviewStrict({
      claim,
      reviewer: { runId: 'reviewer-entry', role: 'reviewer' },
      snapshot,
      findings: [],
      reviewEvidence: [],
    }),
    (error) => error instanceof TaskProofError && error.code === 'INVALID_CLAIM',
  );
});

test('direct strict review rejects findings for unknown claims', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  assert.throws(
    () => finalizeReviewStrict({
      claim: claimFor(snapshot),
      reviewer: { runId: 'reviewer-entry', role: 'reviewer' },
      snapshot,
      findings: [{
        claimId: 'C-unknown',
        verdict: 'verified',
        rationale: 'Should not be accepted.',
        reviewEvidenceIds: [],
      }],
      reviewEvidence: [],
    }),
    (error) => error instanceof TaskProofError && error.code === 'UNKNOWN_FINDING',
  );
});

test('a valid direct strict review still produces PASS', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  const observed = reviewedEvidence(repo);
  const review = finalizeReviewStrict({
    claim: claimFor(snapshot),
    reviewer: { runId: 'reviewer-entry', role: 'reviewer' },
    snapshot: observed.snapshot,
    findings: [{
      claimId: 'C-app',
      verdict: 'verified',
      rationale: 'The exact required path was independently observed.',
      reviewEvidenceIds: ['R-app'],
    }],
    reviewEvidence: observed.evidence,
  });
  assert.equal(review.gate.status, 'PASS');
});

test('immutable artifact reuse rejects an unmanifested extra file', () => {
  const repo = repository();
  const claim = claimFor(createRepositorySnapshotStrict({ repositoryPath: repo }));
  const files = writeTaskProofArtifactsStrict({ artifact: claim, repositoryPath: repo, basename: 'claim' });
  writeFileSync(path.join(repo, files.outputDirectory, 'extra.txt'), 'not in manifest\n');
  assert.throws(
    () => writeTaskProofArtifactsStrict({ artifact: claim, repositoryPath: repo, basename: 'claim' }),
    (error) => error instanceof TaskProofError && error.code === 'OUTPUT_TAMPERED',
  );
});

test('named checks use an isolated HOME and bind executable content', () => {
  const repo = repository();
  mkdirSync(path.join(repo, '.task-proof'));
  const script = [
    "const path = require('node:path');",
    `if (process.env.HOME === ${JSON.stringify(process.env.HOME ?? '')}) process.exit(21);`,
    "if (!path.basename(process.env.HOME || '').startsWith('task-proof-check-home-')) process.exit(22);",
    "if (process.env.USERPROFILE !== process.env.HOME) process.exit(23);",
    "process.exit(0);",
  ].join(' ');
  writeFileSync(path.join(repo, '.task-proof', 'checks.json'), JSON.stringify({
    version: 1,
    checks: [{ id: 'isolated-home', kind: 'test', command: 'node', args: ['-e', script], cwd: '.' }],
  }));
  const previous = process.env.TASK_PROOF_ALLOW_EXECUTION;
  process.env.TASK_PROOF_ALLOW_EXECUTION = '1';
  try {
    const result = runNamedChecksStrict({
      repositoryPath: repo,
      reviewerRunId: 'reviewer-isolated-home',
      requests: [{
        id: 'R-isolated-home',
        checkId: 'isolated-home',
        supportsClaimIds: ['C-app'],
        supportsCriterionIds: ['AC-app'],
      }],
    });
    const observation = result.evidence[0].receipt.observation;
    assert.equal(result.evidence[0].result.exitCode, 0);
    assert.equal(observation.isolatedHome, true);
    assert.match(observation.executableDigest, /^sha256:[0-9a-f]{64}$/);
    assert.ok(observation.executableSizeBytes > 0);
  } finally {
    if (previous === undefined) delete process.env.TASK_PROOF_ALLOW_EXECUTION;
    else process.env.TASK_PROOF_ALLOW_EXECUTION = previous;
  }
});
