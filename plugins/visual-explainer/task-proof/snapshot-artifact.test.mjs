import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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
  finalizeReviewStrict,
  probeRepositoryEvidenceStrict,
} from './hardening.mjs';
import {
  createRepositorySnapshotStrict,
  parseNameStatusZ,
  parsePorcelainV1Z,
  validateRepositorySnapshotStrict,
} from './snapshot.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function repository() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'task-proof-snapshot-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Task Proof');
  git(repo, 'config', 'user.email', 'task-proof@example.invalid');
  writeFileSync(path.join(repo, 'old.txt'), 'content\n');
  git(repo, 'add', 'old.txt');
  git(repo, 'commit', '-qm', 'base');
  git(repo, 'mv', 'old.txt', 'new.txt');
  git(repo, 'commit', '-qm', 'rename');
  return repo;
}

function claimFor(snapshot) {
  const claim = {
    protocolVersion: PROTOCOL_VERSION,
    kind: CLAIM_KIND,
    id: 'claim:TASK-ARTIFACT:claimant-artifact',
    generatedAt: '2026-08-26T00:00:00.000Z',
    producer: { runId: 'claimant-artifact', role: 'claimant' },
    repository: {
      branch: snapshot.repository.branch,
      baseSha: snapshot.repository.baseSha,
      headSha: snapshot.repository.headSha,
      dirty: snapshot.repository.dirty,
      snapshotDigest: snapshot.snapshotDigest,
    },
    task: {
      id: 'TASK-ARTIFACT',
      title: 'Immutable Task Proof artifact',
      objective: 'Store a digest-bound one-screen claim without overwriting prior evidence.',
      acceptanceCriteria: [{ id: 'AC-rename', text: 'The rename is represented.', requiredEvidenceKinds: ['diffstat'] }],
    },
    change: {
      thesis: 'Replace mutable flat output with immutable digest-addressed artifact directories.',
      before: ['Flat files can be overwritten'],
      after: ['Digest directory is immutable', 'LATEST is only a pointer'],
    },
    claims: [{
      id: 'C-artifact',
      statement: 'The immutable artifact store is represented.',
      declaredStatus: 'declared_done',
      acceptanceCriteriaIds: ['AC-rename'],
      evidenceIds: ['E-head'],
    }],
    evidence: [{
      id: 'E-head', kind: 'commit', locator: snapshot.repository.headSha,
      digest: sha256(snapshot.repository.headSha), producerRunId: 'claimant-artifact', trust: 'artifact',
    }],
  };
  const validation = validateClaim(claim);
  assert.equal(validation.ok, true);
  claim.artifactDigest = validation.digest;
  return claim;
}

test('NUL-delimited parsers preserve rename source and destination', () => {
  const worktree = parsePorcelainV1Z(Buffer.from('R  new.txt\0old.txt\0', 'utf8'));
  assert.deepEqual(worktree, [{ status: 'R ', path: 'new.txt', originalPath: 'old.txt' }]);
  const committed = parseNameStatusZ(Buffer.from('R100\0old.txt\0new.txt\0', 'utf8'));
  assert.deepEqual(committed, [{ status: 'R100', originalPath: 'old.txt', path: 'new.txt' }]);
});

test('strict snapshot is deterministic and rename-safe', () => {
  const repo = repository();
  const first = createRepositorySnapshotStrict({ repositoryPath: repo });
  const second = createRepositorySnapshotStrict({ repositoryPath: repo });
  assert.equal(first.snapshotDigest, second.snapshotDigest);
  assert.equal(validateRepositorySnapshotStrict(first).ok, true);
  assert.ok(first.repository.committedChanges.some((item) => item.originalPath === 'old.txt' && item.path === 'new.txt'));
  assert.match(first.repository.treeSha, /^[0-9a-f]{40}$/);
});

test('strict snapshot rejects revision expressions as base refs', () => {
  const repo = repository();
  assert.throws(
    () => createRepositorySnapshotStrict({ repositoryPath: repo, baseRef: 'HEAD~1' }),
    (error) => error instanceof TaskProofError && error.code === 'UNSAFE_REF',
  );
});

test('immutable artifact writer is idempotent and digest-addressed', () => {
  const repo = repository();
  const claim = claimFor(createRepositorySnapshotStrict({ repositoryPath: repo }));
  const first = writeTaskProofArtifactsStrict({ artifact: claim, repositoryPath: repo, basename: '../../claim' });
  const second = writeTaskProofArtifactsStrict({ artifact: claim, repositoryPath: repo, basename: '../../claim' });
  assert.equal(first.outputDirectory, second.outputDirectory);
  assert.ok(first.outputDirectory.includes(claim.artifactDigest.slice('sha256:'.length)));
  for (const relative of [first.json, first.svg, first.html, first.manifest, first.latestPointer]) {
    assert.equal(relative.includes('..'), false);
    assert.equal(existsSync(path.join(repo, relative)), true);
  }
  const latest = readFileSync(path.join(repo, first.latestPointer), 'utf8').trim();
  assert.equal(latest, claim.artifactDigest.slice('sha256:'.length));
});

test('review writer recomputes gate and validates every receipt', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  const claim = claimFor(snapshot);
  const observed = probeRepositoryEvidenceStrict({
    repositoryPath: repo,
    reviewerRunId: 'reviewer-artifact',
    probes: [{
      id: 'R-rename', type: 'changed_path', path: 'new.txt',
      supportsClaimIds: ['C-artifact'], supportsCriterionIds: ['AC-rename'],
    }],
  });
  const review = finalizeReviewStrict({
    claim,
    reviewer: { runId: 'reviewer-artifact', role: 'reviewer' },
    snapshot: observed.snapshot,
    findings: [{
      claimId: 'C-artifact', verdict: 'verified', rationale: 'The rename is present at the pinned snapshot.', reviewEvidenceIds: ['R-rename'],
    }],
    reviewEvidence: observed.evidence,
  });
  assert.equal(validateReviewArtifact(review).ok, true);
  const files = writeTaskProofArtifactsStrict({ artifact: review, repositoryPath: repo, basename: 'review' });
  assert.equal(existsSync(path.join(repo, files.manifest)), true);
  review.gate.status = 'FAIL';
  assert.equal(validateReviewArtifact(review).ok, false);
});

test('artifact output rejects a symlinked output root', { skip: process.platform === 'win32' }, () => {
  const repo = repository();
  const outside = mkdtempSync(path.join(os.tmpdir(), 'task-proof-output-outside-'));
  mkdirSync(path.join(repo, '.artifacts'));
  symlinkSync(outside, path.join(repo, '.artifacts', 'task-proof'));
  const claim = claimFor(createRepositorySnapshotStrict({ repositoryPath: repo }));
  assert.throws(
    () => writeTaskProofArtifactsStrict({ artifact: claim, repositoryPath: repo, basename: 'claim' }),
    (error) => error instanceof TaskProofError && error.code === 'OUTPUT_ESCAPE',
  );
});
