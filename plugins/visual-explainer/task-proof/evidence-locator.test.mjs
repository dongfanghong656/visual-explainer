import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CLAIM_KIND,
  PROTOCOL_VERSION,
  TaskProofError,
  sha256,
} from './core.mjs';
import {
  finalizeReviewStrict,
  probeRepositoryEvidenceStrict,
} from './hardening.mjs';
import { createRepositorySnapshotStrict } from './snapshot.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function repository() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'task-proof-locator-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Task Proof');
  git(repo, 'config', 'user.email', 'task-proof@example.invalid');
  writeFileSync(path.join(repo, 'required.txt'), 'base\n');
  writeFileSync(path.join(repo, 'unrelated.txt'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'base');
  writeFileSync(path.join(repo, 'required.txt'), 'changed\n');
  writeFileSync(path.join(repo, 'unrelated.txt'), 'changed\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'change');
  return repo;
}

function claim(snapshot) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    kind: CLAIM_KIND,
    id: 'claim:TASK-LOCATOR:claimant-locator',
    generatedAt: '2026-08-26T00:00:00.000Z',
    producer: { runId: 'claimant-locator', role: 'claimant' },
    repository: {
      branch: snapshot.repository.branch,
      baseSha: snapshot.repository.baseSha,
      headSha: snapshot.repository.headSha,
      dirty: snapshot.repository.dirty,
      snapshotDigest: snapshot.snapshotDigest,
    },
    task: {
      id: 'TASK-LOCATOR',
      title: 'Evidence locator constraint',
      objective: 'Prevent unrelated evidence from satisfying a criterion.',
      acceptanceCriteria: [{
        id: 'AC-required',
        text: 'The required source path changed.',
        requiredEvidenceKinds: ['diffstat'],
        requiredEvidenceLocators: ['required.txt'],
      }],
    },
    change: {
      thesis: 'Pin acceptance evidence to the intended path.',
      before: ['Any changed path may be attached'],
      after: ['Only required.txt can satisfy AC-required'],
    },
    claims: [{
      id: 'C-required',
      statement: 'The required path changed.',
      declaredStatus: 'declared_done',
      acceptanceCriteriaIds: ['AC-required'],
      evidenceIds: ['E-head'],
    }],
    evidence: [{
      id: 'E-head', kind: 'commit', locator: snapshot.repository.headSha,
      digest: sha256(snapshot.repository.headSha), producerRunId: 'claimant-locator', trust: 'artifact',
    }],
  };
}

test('an unrelated changed path cannot satisfy an exact locator constraint', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  const observed = probeRepositoryEvidenceStrict({
    repositoryPath: repo,
    reviewerRunId: 'reviewer-locator',
    probes: [{
      id: 'R-unrelated', type: 'changed_path', path: 'unrelated.txt',
      supportsClaimIds: ['C-required'], supportsCriterionIds: ['AC-required'],
    }],
  });
  const review = finalizeReviewStrict({
    claim: claim(snapshot),
    reviewer: { runId: 'reviewer-locator', role: 'reviewer' },
    snapshot: observed.snapshot,
    findings: [{
      claimId: 'C-required', verdict: 'verified', rationale: 'Observed only an unrelated path.', reviewEvidenceIds: ['R-unrelated'],
    }],
    reviewEvidence: observed.evidence,
  });
  assert.equal(review.findings[0].verdict, 'unsupported');
  assert.equal(review.gate.status, 'FAIL');
});

test('the exact required locator can satisfy the criterion', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  const observed = probeRepositoryEvidenceStrict({
    repositoryPath: repo,
    reviewerRunId: 'reviewer-locator',
    probes: [{
      id: 'R-required', type: 'changed_path', path: 'required.txt',
      supportsClaimIds: ['C-required'], supportsCriterionIds: ['AC-required'],
    }],
  });
  const review = finalizeReviewStrict({
    claim: claim(snapshot),
    reviewer: { runId: 'reviewer-locator', role: 'reviewer' },
    snapshot: observed.snapshot,
    findings: [{
      claimId: 'C-required', verdict: 'verified', rationale: 'Observed the exact required path.', reviewEvidenceIds: ['R-required'],
    }],
    reviewEvidence: observed.evidence,
  });
  assert.equal(review.gate.status, 'PASS');
});

test('core strict review rejects an incompletely fingerprinted snapshot', () => {
  const repo = repository();
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repo });
  snapshot.repository.workingTreeFingerprintComplete = false;
  snapshot.repository.workingTreeFingerprintIncompleteReasons = ['dirty submodule'];
  snapshot.snapshotDigest = sha256(snapshot.repository);
  assert.throws(
    () => finalizeReviewStrict({
      claim: claim(snapshot),
      reviewer: { runId: 'reviewer-incomplete', role: 'reviewer' },
      snapshot,
      findings: [],
      reviewEvidence: [],
    }),
    (error) => error instanceof TaskProofError && error.code === 'INCOMPLETE_SNAPSHOT',
  );
});
