import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
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
import {
  validateReviewArtifact,
  writeTaskProofArtifactsStrict,
} from './artifact-store.mjs';
import {
  computeStrictGateStatus,
  finalizeReviewStrict,
  probeRepositoryEvidenceStrict,
  validateClaimEvidencePolicy,
} from './hardening.mjs';
import { renderTaskProofSvgV2 } from './renderer-v2.mjs';
import { createRepositorySnapshotStrict } from './snapshot.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function repository() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'task-proof-gate-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Task Proof');
  git(repo, 'config', 'user.email', 'task-proof@example.invalid');
  writeFileSync(path.join(repo, 'app.txt'), 'base\n');
  git(repo, 'add', 'app.txt');
  git(repo, 'commit', '-qm', 'base');
  writeFileSync(path.join(repo, 'app.txt'), 'changed\n');
  git(repo, 'add', 'app.txt');
  git(repo, 'commit', '-qm', 'change');
  return repo;
}

function claimFor(snapshot, twoClaims = false) {
  const claims = [{
    id: 'C-one',
    statement: 'The source change and behavior are complete.',
    declaredStatus: 'declared_done',
    acceptanceCriteriaIds: ['AC-source', 'AC-behavior'],
    evidenceIds: ['E-head'],
  }];
  if (twoClaims) claims.push({
    id: 'C-two',
    statement: 'A second completion claim is applicable.',
    declaredStatus: 'declared_done',
    acceptanceCriteriaIds: ['AC-second'],
    evidenceIds: ['E-head'],
  });
  return {
    protocolVersion: PROTOCOL_VERSION,
    kind: CLAIM_KIND,
    id: 'claim:TASK-GATE:claimant-gate',
    generatedAt: '2026-08-26T00:00:00.000Z',
    producer: { runId: 'claimant-gate', role: 'claimant' },
    repository: {
      branch: snapshot.repository.branch,
      baseSha: snapshot.repository.baseSha,
      headSha: snapshot.repository.headSha,
      dirty: snapshot.repository.dirty,
      snapshotDigest: snapshot.snapshotDigest,
    },
    task: {
      id: 'TASK-GATE',
      title: 'Strict partial completion gate',
      objective: 'Require criterion-level evidence for full and partial completion.',
      acceptanceCriteria: [
        { id: 'AC-source', text: 'Source path changed.', requiredEvidenceKinds: ['diffstat'] },
        { id: 'AC-behavior', text: 'Behavior is tested.', requiredEvidenceKinds: ['test'] },
        { id: 'AC-second', text: 'Second claim has evidence.', requiredEvidenceKinds: ['test'] },
      ],
    },
    change: {
      thesis: 'Replace assertion-based partial completion with criterion-bound evidence.',
      before: ['Partial status can be asserted without proof'],
      after: ['At least one criterion must be reproduced', 'Uncovered criteria remain visible'],
    },
    claims,
    evidence: [{
      id: 'E-head', kind: 'commit', locator: snapshot.repository.headSha,
      digest: sha256(snapshot.repository.headSha), producerRunId: 'claimant-gate', trust: 'artifact',
    }],
    risks: ['External deployment is not tested.'],
    unknowns: ['Cross-platform process-tree cleanup remains environment-dependent.'],
    nextSteps: ['Run the independent behavior check.'],
  };
}

test('claim top-level self-approval fields are rejected', () => {
  const claim = claimFor(createRepositorySnapshotStrict({ repositoryPath: repository() }));
  claim.gate = { status: 'PASS' };
  const result = validateClaimEvidencePolicy(claim);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'SELF_VERIFICATION' && error.pointer === '/gate'));
});

test('partial verification without any covered criterion is downgraded to FAIL', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  const review = finalizeReviewStrict({
    claim: claimFor(snapshot),
    reviewer: { runId: 'reviewer-gate', role: 'reviewer' },
    snapshot,
    findings: [{
      claimId: 'C-one', verdict: 'partially_verified', rationale: 'No evidence was reproduced.', reviewEvidenceIds: [],
    }],
    reviewEvidence: [],
  });
  assert.equal(review.findings[0].verdict, 'unsupported');
  assert.equal(review.gate.status, 'FAIL');
});

test('partial verification with one covered criterion yields PASS_WITH_LIMITS', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  const observed = probeRepositoryEvidenceStrict({
    repositoryPath: repo,
    reviewerRunId: 'reviewer-gate',
    probes: [{
      id: 'R-source', type: 'changed_path', path: 'app.txt',
      supportsClaimIds: ['C-one'], supportsCriterionIds: ['AC-source'],
    }],
  });
  const review = finalizeReviewStrict({
    claim: claimFor(snapshot),
    reviewer: { runId: 'reviewer-gate', role: 'reviewer' },
    snapshot: observed.snapshot,
    findings: [{
      claimId: 'C-one', verdict: 'partially_verified', rationale: 'Source change reproduced; behavior test absent.', reviewEvidenceIds: ['R-source'],
    }],
    reviewEvidence: observed.evidence,
  });
  assert.equal(review.findings[0].verdict, 'partially_verified');
  assert.equal(review.gate.status, 'PASS_WITH_LIMITS');
  assert.equal(validateReviewArtifact(review).ok, true);
});

test('partial plus not-applicable declared-done claim is INCONCLUSIVE, not PASS_WITH_LIMITS', () => {
  const claims = [
    { id: 'C-one', declaredStatus: 'declared_done' },
    { id: 'C-two', declaredStatus: 'declared_done' },
  ];
  const findings = [
    { claimId: 'C-one', verdict: 'partially_verified' },
    { claimId: 'C-two', verdict: 'not_applicable' },
  ];
  assert.equal(computeStrictGateStatus(claims, findings), 'INCONCLUSIVE');
});

test('changed_path supports a filename containing a newline', { skip: process.platform === 'win32' }, () => {
  const repo = repository();
  const weird = 'line\nbreak.txt';
  writeFileSync(path.join(repo, weird), 'value\n');
  git(repo, 'add', weird);
  git(repo, 'commit', '-qm', 'add newline filename');
  const result = probeRepositoryEvidenceStrict({
    repositoryPath: repo,
    reviewerRunId: 'reviewer-weird',
    probes: [{
      id: 'R-weird', type: 'changed_path', path: weird,
      supportsClaimIds: ['C-one'], supportsCriterionIds: ['AC-source'],
    }],
  });
  assert.equal(result.evidence[0].locator, weird);
  assert.equal(result.evidence[0].result.exitCode, 0);
});

test('parent output symlink is rejected before creating directories outside the repository', { skip: process.platform === 'win32' }, () => {
  const repo = repository();
  const outside = mkdtempSync(path.join(os.tmpdir(), 'task-proof-parent-output-'));
  symlinkSync(outside, path.join(repo, '.artifacts'));
  const claim = claimFor(createRepositorySnapshotStrict({ repositoryPath: repo }));
  claim.artifactDigest = validateClaim(claim).digest;
  assert.throws(
    () => writeTaskProofArtifactsStrict({ artifact: claim, repositoryPath: repo, basename: 'claim' }),
    (error) => error instanceof TaskProofError && ['OUTPUT_COLLISION', 'OUTPUT_ESCAPE'].includes(error.code),
  );
  assert.equal(existsSync(path.join(outside, 'task-proof')), false);
});

test('existing immutable artifacts are rehashed and tampering is rejected', () => {
  const repo = repository();
  const claim = claimFor(createRepositorySnapshotStrict({ repositoryPath: repo }));
  claim.artifactDigest = validateClaim(claim).digest;
  const files = writeTaskProofArtifactsStrict({ artifact: claim, repositoryPath: repo, basename: 'claim' });
  writeFileSync(path.join(repo, files.svg), '<svg>tampered</svg>');
  assert.throws(
    () => writeTaskProofArtifactsStrict({ artifact: claim, repositoryPath: repo, basename: 'claim' }),
    (error) => error instanceof TaskProofError && error.code === 'OUTPUT_TAMPERED',
  );
});

test('one-screen renderer exposes remaining work, risks, evidence boundary, and text alternative', () => {
  const claim = claimFor(createRepositorySnapshotStrict({ repositoryPath: repository() }));
  claim.claims.push({
    id: 'C-blocked', statement: 'Hardware acceptance is pending.', declaredStatus: 'blocked', acceptanceCriteriaIds: [], evidenceIds: [],
  });
  claim.artifactDigest = validateClaim(claim).digest;
  const svg = renderTaskProofSvgV2(claim);
  assert.match(svg, /Remaining · blocked · risk/);
  assert.match(svg, /Hardware acceptance is pending/);
  assert.match(svg, /Run the independent behavior check/);
  assert.match(svg, /UNVERIFIED/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /<desc id="task-proof-desc">/);
});
