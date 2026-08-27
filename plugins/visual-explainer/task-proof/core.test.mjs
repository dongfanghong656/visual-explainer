import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CLAIM_KIND,
  PROTOCOL_VERSION,
  TaskProofError,
  createRepositorySnapshot,
  finalizeReview,
  probeRepositoryEvidence,
  renderTaskProofSvg,
  sha256,
  stableStringify,
  validateClaim,
  validateSnapshot,
  writeTaskProofArtifacts,
} from './core.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function makeRepository() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'task-proof-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Task Proof Test');
  git(repo, 'config', 'user.email', 'task-proof@example.invalid');
  writeFileSync(path.join(repo, 'app.txt'), 'before\n');
  git(repo, 'add', 'app.txt');
  git(repo, 'commit', '-qm', 'initial');
  writeFileSync(path.join(repo, 'app.txt'), 'after\n');
  git(repo, 'add', 'app.txt');
  git(repo, 'commit', '-qm', 'change');
  return repo;
}

function makeClaim(snapshot) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    kind: CLAIM_KIND,
    id: 'claim:TASK-1:run-claimant',
    generatedAt: '2026-08-26T00:00:00.000Z',
    producer: { runId: 'run-claimant', role: 'claimant', agent: 'test-agent' },
    repository: {
      branch: snapshot.repository.branch,
      baseSha: snapshot.repository.baseSha,
      headSha: snapshot.repository.headSha,
      dirty: snapshot.repository.dirty,
      snapshotDigest: snapshot.snapshotDigest,
    },
    task: {
      id: 'TASK-1',
      title: 'Prove a change',
      objective: 'Make completion claims independently auditable.',
      acceptanceCriteria: [{ id: 'AC-1', text: 'The repository contains the change.' }],
    },
    change: {
      thesis: 'Replace self-attestation with an evidence-bound claim/review gate.',
      before: ['AI says done', 'No independent check'],
      after: ['Claim artifact', 'Independent review', 'Computed gate'],
    },
    claims: [{
      id: 'C-1',
      statement: 'The change is implemented.',
      declaredStatus: 'declared_done',
      acceptanceCriteriaIds: ['AC-1'],
      evidenceIds: ['E-1'],
    }],
    evidence: [{
      id: 'E-1',
      kind: 'commit',
      locator: snapshot.repository.headSha,
      observedAt: '2026-08-26T00:00:00.000Z',
      digest: sha256(snapshot.repository.headSha),
      producerRunId: 'run-claimant',
      trust: 'artifact',
    }],
  };
}

test('canonical JSON and digest are deterministic', () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(sha256({ a: 1, b: 2 }), sha256({ b: 2, a: 1 }));
});

test('repository snapshot is deterministic for the same state', () => {
  const repo = makeRepository();
  const first = createRepositorySnapshot({ repositoryPath: repo });
  const second = createRepositorySnapshot({ repositoryPath: repo });
  assert.equal(first.snapshotDigest, second.snapshotDigest);
  assert.equal(first.repository.headSha, git(repo, 'rev-parse', 'HEAD'));
  assert.equal(validateSnapshot(first).ok, true);
});

test('unsafe Git refs are rejected without a shell', () => {
  const repo = makeRepository();
  assert.throws(
    () => createRepositorySnapshot({ repositoryPath: repo, baseRef: '--upload-pack=evil' }),
    (error) => error instanceof TaskProofError && error.code === 'UNSAFE_REF',
  );
});

test('safe probes create deterministic reviewer receipts', () => {
  const repo = makeRepository();
  const result = probeRepositoryEvidence({
    repositoryPath: repo,
    reviewerRunId: 'run-reviewer',
    probes: [
      { id: 'R-file', type: 'file_digest', path: 'app.txt' },
      { id: 'R-commit', type: 'commit_exists', sha: git(repo, 'rev-parse', 'HEAD') },
      { id: 'R-change', type: 'changed_path', path: 'app.txt' },
    ],
  });
  assert.equal(result.evidence.length, 3);
  assert.ok(result.evidence.every((entry) => entry.producerRunId === 'run-reviewer'));
  assert.ok(result.evidence.every((entry) => entry.trust === 'deterministic'));
  assert.ok(result.evidence.every((entry) => entry.result.exitCode === 0));
});

test('safe probes reject path traversal', () => {
  const repo = makeRepository();
  assert.throws(
    () => probeRepositoryEvidence({
      repositoryPath: repo,
      reviewerRunId: 'run-reviewer',
      probes: [{ id: 'R-escape', type: 'file_digest', path: '../outside.txt' }],
    }),
    (error) => error instanceof TaskProofError && error.code === 'PATH_ESCAPE',
  );
});

test('claimants may declare done but may not self-verify', () => {
  const claim = makeClaim(createRepositorySnapshot({ repositoryPath: makeRepository() }));
  assert.equal(validateClaim(claim).ok, true);
  claim.claims[0].verified = true;
  const result = validateClaim(claim);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'SELF_VERIFICATION'));
});

test('declared-done requires criteria and evidence', () => {
  const claim = makeClaim(createRepositorySnapshot({ repositoryPath: makeRepository() }));
  claim.claims[0].acceptanceCriteriaIds = [];
  claim.claims[0].evidenceIds = [];
  const result = validateClaim(claim);
  assert.ok(result.errors.some((entry) => entry.code === 'DONE_WITHOUT_CRITERIA'));
  assert.ok(result.errors.some((entry) => entry.code === 'DONE_WITHOUT_EVIDENCE'));
});

test('reviewer-produced deterministic evidence can produce PASS', () => {
  const repo = makeRepository();
  const snapshot = createRepositorySnapshot({ repositoryPath: repo });
  const claim = makeClaim(snapshot);
  const review = finalizeReview({
    claim,
    reviewer: { runId: 'run-reviewer', role: 'reviewer', agent: 'review-agent' },
    snapshot,
    findings: [{ claimId: 'C-1', verdict: 'verified', rationale: 'Reproduced at the pinned snapshot.', reviewEvidenceIds: ['R-1'] }],
    reviewEvidence: [{
      id: 'R-1', kind: 'test', locator: 'node --test', observedAt: '2026-08-26T00:10:00.000Z',
      digest: sha256('tests passed'), producerRunId: 'run-reviewer', trust: 'deterministic',
      result: { exitCode: 0, summary: 'All tests passed.' },
    }],
  });
  assert.equal(review.gate.status, 'PASS');
  assert.deepEqual(review.gate.verifiedClaimIds, ['C-1']);
});

test('verification without reviewer evidence is downgraded and fails', () => {
  const repo = makeRepository();
  const snapshot = createRepositorySnapshot({ repositoryPath: repo });
  const review = finalizeReview({
    claim: makeClaim(snapshot),
    reviewer: { runId: 'run-reviewer', role: 'reviewer' },
    snapshot,
    findings: [{ claimId: 'C-1', verdict: 'verified', rationale: 'Looks plausible.', reviewEvidenceIds: [] }],
    reviewEvidence: [],
  });
  assert.equal(review.findings[0].verdict, 'unsupported');
  assert.equal(review.gate.status, 'FAIL');
});

test('claimant and reviewer run ids must differ', () => {
  const repo = makeRepository();
  const snapshot = createRepositorySnapshot({ repositoryPath: repo });
  assert.throws(
    () => finalizeReview({
      claim: makeClaim(snapshot), reviewer: { runId: 'run-claimant', role: 'reviewer' }, snapshot,
      findings: [], reviewEvidence: [],
    }),
    (error) => error instanceof TaskProofError && error.code === 'INVALID_REVIEW',
  );
});

test('repository change makes a prior claim stale', () => {
  const repo = makeRepository();
  const claimSnapshot = createRepositorySnapshot({ repositoryPath: repo });
  const claim = makeClaim(claimSnapshot);
  writeFileSync(path.join(repo, 'later.txt'), 'later\n');
  git(repo, 'add', 'later.txt');
  git(repo, 'commit', '-qm', 'later change');
  const reviewSnapshot = createRepositorySnapshot({ repositoryPath: repo, baseRef: claim.repository.baseSha });
  const review = finalizeReview({
    claim,
    reviewer: { runId: 'run-reviewer', role: 'reviewer' },
    snapshot: reviewSnapshot,
    findings: [{ claimId: 'C-1', verdict: 'verified', rationale: 'Attempted reproduction.', reviewEvidenceIds: ['R-1'] }],
    reviewEvidence: [{
      id: 'R-1', kind: 'test', locator: 'node --test', producerRunId: 'run-reviewer', trust: 'deterministic',
      digest: sha256('pass'), result: { exitCode: 0 },
    }],
  });
  assert.equal(review.findings[0].verdict, 'stale');
  assert.equal(review.gate.status, 'INCONCLUSIVE');
});

test('SVG escapes untrusted text and labels claims UNVERIFIED', () => {
  const claim = makeClaim(createRepositorySnapshot({ repositoryPath: makeRepository() }));
  claim.task.title = '<script>alert(1)</script>';
  claim.artifactDigest = validateClaim(claim).digest;
  const svg = renderTaskProofSvg(claim);
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('UNVERIFIED'));
});

test('artifacts are confined to .artifacts/task-proof', () => {
  const repo = makeRepository();
  const claim = makeClaim(createRepositorySnapshot({ repositoryPath: repo }));
  claim.artifactDigest = validateClaim(claim).digest;
  const files = writeTaskProofArtifacts({ artifact: claim, repositoryPath: repo, basename: '../../escape' });
  assert.equal(files.outputDir, path.join('.artifacts', 'task-proof'));
  assert.ok(!files.json.includes('..'));
  assert.ok(existsSync(path.join(repo, files.json)));
  const manifest = JSON.parse(readFileSync(path.join(repo, files.manifest), 'utf8'));
  assert.match(manifest.manifestDigest, /^sha256:[0-9a-f]{64}$/);
});
