import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REVIEW_KIND,
  sha256,
} from './core.mjs';
import { finalizeReviewStrict } from './hardening.mjs';
import { validateReviewArtifact } from './artifact-store.mjs';
import { renderTaskProofSvgV2 } from './renderer-v2.mjs';
import { createRepositorySnapshotStrict as createRepositorySnapshot } from './snapshot.mjs';
import {
  bindPublicClaimToContract,
  createPublicRepositoryAuthorityReceipt,
  finalizePublicContractReview,
  validateFinalPublicContractReview,
  validatePublicContractBoundClaim,
  validatePublicTaskContract,
} from './contract-public-enforcement.mjs';
import {
  TASK_CONTRACT_VERSION,
  digestJson,
} from './contract-authority.mjs';

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function hashHex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function artifactDigest(value) {
  const copy = { ...value };
  delete copy.artifactDigest;
  delete copy.manifestDigest;
  return sha256(copy);
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'task-proof-public-contract-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Task Proof Test');
  git(root, 'config', 'user.email', 'task-proof@example.invalid');
  git(root, 'remote', 'add', 'origin', 'https://github.com/owner/repo.git');
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  mkdirSync(path.join(root, 'src'), { recursive: true });
  const sourceText = '# Frozen requirement\n\nThe public Task Proof path must enforce the contract.\n';
  writeFileSync(path.join(root, 'docs', 'requirements.md'), sourceText);
  writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'freeze contract source');
  const base = git(root, 'rev-parse', 'HEAD');
  writeFileSync(path.join(root, 'src', 'feature.mjs'), 'export const enforced = true;\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'implement feature');
  const head = git(root, 'rev-parse', 'HEAD');
  const policyDigest = `sha256:${'b'.repeat(64)}`;
  const executableDigest = `sha256:${'c'.repeat(64)}`;
  const args = ['--test', 'public-contract'];
  const workingDirectory = 'plugins/visual-explainer/task-proof';
  const contract = {
    schemaVersion: TASK_CONTRACT_VERSION,
    kind: 'task-contract',
    contractId: 'TPC-PUBLIC-1',
    taskId: 'TASK-PUBLIC-1',
    repository: 'owner/repo',
    authority: {
      level: 'project_approved',
      issuerRole: 'project-owner',
      issuerRunId: 'owner-run',
      method: 'repository_source',
      issuedAt: '2026-08-27T00:00:00.000Z',
      signature: null,
      keyId: null,
      limitations: [],
    },
    sources: [{
      sourceId: 'SRC-REQ',
      type: 'repository_file',
      locator: 'docs/requirements.md',
      revision: base,
      sha256: hashHex(sourceText),
      precedence: 1,
      description: 'Frozen requirement.',
      assurance: 'repository-history',
    }],
    scope: {
      baseRevision: base,
      includedOutcomes: ['Contract-bound public acceptance'],
      excludedOutcomes: ['Merge and release'],
      includedPaths: ['src/feature.mjs'],
      excludedPaths: [],
    },
    requirements: [{
      requirementId: 'REQ-PUBLIC',
      sourceId: 'SRC-REQ',
      statement: 'Public acceptance must enforce the frozen contract.',
      disposition: 'covered',
      criterionIds: ['AC-PUBLIC'],
      authorityReason: null,
    }],
    criteria: [{
      id: 'AC-PUBLIC',
      statement: 'The independent review passes the frozen named check at the exact Claim HEAD.',
      criticality: 'blocking',
      requiredEvidenceKinds: ['test'],
      requiredEvidenceLocators: ['named-check:public-contract-tests'],
      sourceRequirementRefs: ['REQ-PUBLIC'],
      environment: 'Node',
      limitations: [],
    }],
    evidencePolicies: {
      namedChecks: [{
        id: 'public-contract-tests',
        policyDigest,
        evidenceKind: 'test',
        executableDigest,
        argsDigest: digestJson(args),
        workingDirectory,
      }],
    },
    reviewPolicy: {
      minimumIndependence: 'R2',
      allBlockingCriteriaRequired: true,
      allowClaimantProvisionalContract: false,
    },
    lifecycle: {
      status: 'active',
      supersededByContractId: null,
      supersededByContractDigest: null,
      revokedReason: null,
    },
    amendment: null,
  };
  const snapshot = createRepositorySnapshot({ repositoryPath: root, baseRef: base });
  assert.equal(snapshot.repository.headSha, head);
  const rawClaim = {
    id: 'CLM-PUBLIC-1',
    generatedAt: '2026-08-27T00:05:00.000Z',
    producer: { role: 'claimant', runId: 'claim-run' },
    task: { title: 'Enforce public contract', objective: 'Fail closed unless the frozen contract is satisfied.' },
    change: { thesis: 'Route public acceptance through the strict contract orchestrator.', before: ['Legacy gate could pass without a contract.'], after: ['Strict contract gate is authoritative.'] },
    claims: [{ id: 'CL-PUBLIC', statement: 'The public review path enforces the frozen contract.', declaredStatus: 'declared_done', acceptanceCriteriaIds: ['AC-PUBLIC'], evidenceIds: ['E-CLAIM'] }],
    evidence: [{ id: 'E-CLAIM', kind: 'file', locator: 'src/feature.mjs', observedAt: '2026-08-27T00:05:00.000Z', digest: sha256('src/feature.mjs'), producerRunId: 'claim-run', trust: 'self_report', result: { exitCode: 0, summary: 'Claimant points to the implementation file.' } }],
    risks: [], unknowns: [], nextSteps: [],
  };
  const bound = bindPublicClaimToContract({ contract, rawClaim, snapshot });
  bound.claim.artifactDigest = bound.validation.digest;
  const reviewer = { role: 'reviewer', runId: 'review-run', agent: 'independent-test' };
  const authority = createPublicRepositoryAuthorityReceipt({
    repositoryPath: root,
    contract,
    claim: bound.claim,
    reviewerRunId: reviewer.runId,
    sourceId: 'SRC-REQ',
    observedAt: '2026-08-27T00:08:00.000Z',
  });
  const observation = {
    type: 'named_check',
    policyPath: '.task-proof/checks.json',
    policyDigest,
    checkId: 'public-contract-tests',
    evidenceKind: 'test',
    command: 'node',
    runtime: 'node',
    executableDigest,
    executableSizeBytes: 1,
    args,
    cwd: workingDirectory,
    isolatedHome: true,
    startedAt: '2026-08-27T00:09:00.000Z',
    durationMs: 1,
    exitCode: 0,
    signal: null,
    timedOut: false,
    errorCode: null,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutDigest: sha256(''),
    stderrDigest: sha256(''),
  };
  const baseReceipt = {
    issuer: 'visual-explainer-task-proof-mcp',
    snapshotDigest: snapshot.snapshotDigest,
    evidenceId: 'E-REVIEW-TEST',
    supportsClaimIds: ['CL-PUBLIC'],
    supportsCriterionIds: ['AC-PUBLIC'],
    observation,
  };
  baseReceipt.receiptDigest = sha256(baseReceipt);
  const reviewEvidence = [{
    id: 'E-REVIEW-TEST',
    kind: 'test',
    locator: 'named-check:public-contract-tests',
    observedAt: '2026-08-27T00:09:00.000Z',
    digest: sha256(observation),
    producerRunId: reviewer.runId,
    trust: 'deterministic',
    result: { exitCode: 0, summary: 'Named check passed.' },
    receipt: baseReceipt,
  }];
  const legacyReview = finalizeReviewStrict({
    claim: bound.claim,
    reviewer,
    snapshot,
    findings: [{ claimId: 'CL-PUBLIC', verdict: 'verified', rationale: 'Independent named check passed.', reviewEvidenceIds: ['E-REVIEW-TEST'] }],
    reviewEvidence,
  });
  legacyReview.generatedAt = '2026-08-27T00:10:00.000Z';
  return {
    root, base, head, contract, snapshot, bound, reviewer, authority, legacyReview,
    attestation: {
      level: 'R2', method: 'procedural_attestation', sessionId: reviewer.runId,
      reconstructedBeforeReadingClaim: true, independentEvidenceCollected: true, adversarialEvidenceCollected: false,
    },
  };
}

function cleanup(value) {
  rmSync(value.root, { recursive: true, force: true });
}

test('public Task Contract validator exposes the frozen authority cap', () => {
  const value = fixture();
  try {
    const result = validatePublicTaskContract(value.contract);
    assert.equal(result.ok, true);
    assert.equal(result.authorityLevel, 'project_approved');
    assert.equal(result.provisional, false);
  } finally { cleanup(value); }
});

test('public Claim binding replaces caller criteria with the exact frozen contract', () => {
  const value = fixture();
  try {
    const result = validatePublicContractBoundClaim({ contract: value.contract, claim: value.bound.claim });
    assert.equal(result.ok, true);
    assert.equal(value.bound.claim.contractRef.contractId, value.contract.contractId);
    assert.equal(value.bound.claim.task.acceptanceCriteria[0].text, value.contract.criteria[0].statement);
    assert.equal(value.bound.claim.repository.identity, value.contract.repository);
  } finally { cleanup(value); }
});

test('caller cannot weaken a frozen criterion in the public Claim path', () => {
  const value = fixture();
  try {
    const raw = structuredClone(value.bound.claim);
    delete raw.contractRef;
    delete raw.contractCriterionSnapshot;
    delete raw.contractStatus;
    delete raw.taskId;
    delete raw.repository;
    delete raw.artifactDigest;
    raw.task.acceptanceCriteria[0].requiredEvidenceLocators = ['named-check:easier'];
    assert.throws(
      () => bindPublicClaimToContract({ contract: value.contract, rawClaim: raw, snapshot: value.snapshot }),
      (error) => error.code === 'CONTRACT_CRITERION_CONTENT_MISMATCH',
    );
  } finally { cleanup(value); }
});

test('complete public Review produces PASS only through the strict contract orchestrator', () => {
  const value = fixture();
  try {
    const result = finalizePublicContractReview({
      repositoryPath: value.root,
      contract: value.contract,
      claim: value.bound.claim,
      legacyReview: value.legacyReview,
      reviewerAttestation: value.attestation,
      authorityReceipts: [value.authority.receipt],
      snapshot: value.snapshot,
    });
    assert.equal(result.gate.gate, 'PASS');
    assert.equal(result.review.gate.status, 'PASS');
    assert.equal(result.review.legacyGate.status, 'PASS');
    assert.equal(result.review.contractGate.gate, 'PASS');
    assert.equal(result.review.contractGateBasisDigest.startsWith('sha256:'), true);
    const finalValidation = validateFinalPublicContractReview({ contract: value.contract, claim: value.bound.claim, review: result.review });
    assert.equal(finalValidation.ok, true);
    result.review.artifactDigest = artifactDigest(result.review);
    const stored = validateReviewArtifact(result.review);
    assert.equal(stored.ok, true, JSON.stringify(stored.errors));
    const svg = renderTaskProofSvgV2(result.review);
    assert.match(svg, /TPC-PUBLIC-1/);
    assert.match(svg, /Contract gate PASS/);
  } finally { cleanup(value); }
});

test('missing authority receipt fails closed before public acceptance', () => {
  const value = fixture();
  try {
    const result = finalizePublicContractReview({
      repositoryPath: value.root,
      contract: value.contract,
      claim: value.bound.claim,
      legacyReview: value.legacyReview,
      reviewerAttestation: value.attestation,
      authorityReceipts: [],
      snapshot: value.snapshot,
    });
    assert.equal(result.gate.gate, 'FAIL');
    assert.ok(result.gate.errors.some((item) => String(item).includes('CONTRACT_AUTHORITY_RECEIPT_MISSING')));
  } finally { cleanup(value); }
});

test('insufficient Reviewer independence cannot produce PASS', () => {
  const value = fixture();
  try {
    const result = finalizePublicContractReview({
      repositoryPath: value.root,
      contract: value.contract,
      claim: value.bound.claim,
      legacyReview: value.legacyReview,
      reviewerAttestation: { ...value.attestation, level: 'R1', reconstructedBeforeReadingClaim: false, independentEvidenceCollected: false },
      authorityReceipts: [value.authority.receipt],
      snapshot: value.snapshot,
    });
    assert.notEqual(result.gate.gate, 'PASS');
    assert.ok(result.gate.errors.includes('REVIEW_INDEPENDENCE_INSUFFICIENT'));
  } finally { cleanup(value); }
});

test('named-check policy drift is a hard public-gate failure', () => {
  const value = fixture();
  try {
    value.contract.evidencePolicies.namedChecks[0].executableDigest = `sha256:${'f'.repeat(64)}`;
    assert.throws(
      () => finalizePublicContractReview({
        repositoryPath: value.root,
        contract: value.contract,
        claim: value.bound.claim,
        legacyReview: value.legacyReview,
        reviewerAttestation: value.attestation,
        authorityReceipts: [value.authority.receipt],
        snapshot: value.snapshot,
      }),
    );
  } finally { cleanup(value); }
});

test('claimant-provisional contracts remain capped below PASS', () => {
  const value = fixture();
  try {
    value.contract.authority = {
      ...value.contract.authority,
      level: 'claimant_provisional',
      issuerRole: 'claimant',
      issuerRunId: 'claim-run',
      method: 'procedural_attestation',
    };
    value.contract.reviewPolicy.allowClaimantProvisionalContract = true;
    value.contract.sources[0].type = 'repository_file';
    const snapshot = createRepositorySnapshot({ repositoryPath: value.root, baseRef: value.base });
    const raw = {
      ...value.bound.claim,
      generatedAt: '2026-08-27T00:05:00.000Z',
      task: { ...value.bound.claim.task },
    };
    delete raw.contractRef; delete raw.contractCriterionSnapshot; delete raw.contractStatus; delete raw.taskId; delete raw.repository; delete raw.artifactDigest;
    const rebound = bindPublicClaimToContract({ contract: value.contract, rawClaim: raw, snapshot });
    rebound.claim.artifactDigest = rebound.validation.digest;
    assert.equal(rebound.claim.contractStatus.finalAcceptancePossible, false);
  } finally { cleanup(value); }
});

test('contract renderer strips XML-illegal control characters and shows provisional cap', () => {
  const value = fixture();
  try {
    const claim = structuredClone(value.bound.claim);
    claim.task.title = 'Unsafe\u0001 title';
    claim.contractStatus.finalAcceptancePossible = false;
    const svg = renderTaskProofSvgV2(claim);
    assert.doesNotMatch(svg, /\u0001/);
    assert.match(svg, /PROVISIONAL/);
    assert.match(svg, /TPC-PUBLIC-1/);
  } finally { cleanup(value); }
});
