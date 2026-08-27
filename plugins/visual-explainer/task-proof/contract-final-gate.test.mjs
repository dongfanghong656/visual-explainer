import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORITY_RECEIPT_VERSION,
  EVIDENCE_ASSESSMENT_VERSION,
  LIFECYCLE_ASSESSMENT_VERSION,
  NAMED_CHECK_RECEIPT_VERSION,
  TASK_CONTRACT_VERSION,
  createAuthorityReceipt,
  digestAuthorityDeclaration,
  digestJson,
  digestTaskContract,
  normalizeTaskContract,
} from './contract-authority.mjs';
import { computeStrictContractGate } from './contract-final-gate.mjs';

const BASE = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const SOURCE_SHA = 'a'.repeat(64);
const POLICY = `sha256:${'b'.repeat(64)}`;
const EXE = `sha256:${'c'.repeat(64)}`;
const ARGS = `sha256:${'d'.repeat(64)}`;
const ADAPTER = `sha256:${'e'.repeat(64)}`;

function contract() {
  return {
    schemaVersion: TASK_CONTRACT_VERSION, kind: 'task-contract', contractId: 'TPC-ORCH', taskId: 'TASK-ORCH',
    repository: 'owner/repo',
    authority: { level: 'project_approved', issuerRole: 'owner', issuerRunId: 'owner-run', method: 'repository_source', issuedAt: '2026-08-27T01:00:00.000Z', signature: null, keyId: null, limitations: [] },
    sources: [{ sourceId: 'SRC-ONE', type: 'repository_file', locator: 'docs/requirements.md', revision: '0'.repeat(40), sha256: SOURCE_SHA, precedence: 1, description: null, assurance: null }],
    scope: { baseRevision: BASE, includedOutcomes: ['Strict orchestration'], excludedOutcomes: [], includedPaths: ['plugins/visual-explainer/task-proof'], excludedPaths: [] },
    requirements: [{ requirementId: 'REQ-ORCH', sourceId: 'SRC-ONE', statement: 'Use strict orchestrator.', disposition: 'covered', criterionIds: ['AC-ORCH'], authorityReason: null }],
    criteria: [{ id: 'AC-ORCH', statement: 'Verifier context is exact.', criticality: 'blocking', requiredEvidenceKinds: ['test'], requiredEvidenceLocators: ['named-check:orchestrator-tests'], sourceRequirementRefs: ['REQ-ORCH'], environment: null, limitations: [] }],
    evidencePolicies: { namedChecks: [{ id: 'orchestrator-tests', policyDigest: POLICY, evidenceKind: 'test', executableDigest: EXE, argsDigest: ARGS, workingDirectory: 'plugins/visual-explainer/task-proof' }] },
    reviewPolicy: { minimumIndependence: 'R2', allBlockingCriteriaRequired: true, allowClaimantProvisionalContract: false },
    lifecycle: { status: 'active', supersededByContractId: null, supersededByContractDigest: null, revokedReason: null },
    amendment: null,
  };
}
function claimFor(value) {
  const normalized = normalizeTaskContract(value);
  return {
    taskId: normalized.taskId, generatedAt: '2026-08-27T01:05:00.000Z', producer: { role: 'claimant', runId: 'claim-run' },
    repository: { identity: normalized.repository, baseSha: normalized.scope.baseRevision, headSha: HEAD },
    contractRef: { contractId: normalized.contractId, contractDigest: digestTaskContract(normalized), authorityDeclarationDigest: digestAuthorityDeclaration(normalized) },
    contractCriterionSnapshot: normalized.criteria, claims: [{ id: 'CL-ORCH', status: 'declared_done' }],
  };
}
function receiptFor(value, claim, sourceId = 'SRC-ONE') {
  return createAuthorityReceipt({
    contract: value, sourceId, claim, reviewerRunId: 'review-run', observedAt: '2026-08-27T01:08:00.000Z', method: 'repository_source',
    observation: { sourceExistsAtBase: true, revisionIsAncestor: true, sourceChangedInImplementationScope: false, safeGitConfiguration: true, sourceIsRegularFile: true, sourceIsSymbolicLink: false, sizeBytes: 100, observedSourceSha256: SOURCE_SHA, adapterId: 'git-adapter', adapterReceiptDigest: ADAPTER },
  });
}
function reviewFor(value, claim, receipts) {
  return {
    taskId: value.taskId, generatedAt: '2026-08-27T01:10:00.000Z', repository: claim.repository,
    reviewer: { role: 'reviewer', runId: 'review-run' },
    reviewerAttestation: { level: 'R2', method: 'procedural_attestation', sessionId: 'review-run', reconstructedBeforeReadingClaim: true, independentEvidenceCollected: true, adversarialEvidenceCollected: false },
    contractRef: { contractId: value.contractId, contractDigest: digestTaskContract(value), authorityDeclarationDigest: digestAuthorityDeclaration(value), authorityVerificationReceiptDigests: receipts.map((item) => item.receiptDigest) },
    claimDigest: digestJson(claim), findings: [{ claimId: 'CL-ORCH', verdict: 'verified' }],
  };
}
function assessment(kind, version, value, claim, review) {
  const item = { version, kind, contractDigest: digestTaskContract(value), claimDigest: digestJson(claim), reviewDigest: digestJson(review), gate: 'PASS' };
  item.assessmentDigest = digestJson(item);
  return item;
}
function namedReceipt(value, claim, review) {
  const item = {
    version: NAMED_CHECK_RECEIPT_VERSION, kind: 'task-proof-named-check-receipt', contractDigest: digestTaskContract(value), claimDigest: digestJson(claim), reviewDigest: digestJson(review), headSha: HEAD, producerRunId: 'review-run',
    locator: 'named-check:orchestrator-tests', supportsCriterionIds: ['AC-ORCH'], policyDigest: POLICY, evidenceKind: 'test', executableDigest: EXE, argsDigest: ARGS, workingDirectory: 'plugins/visual-explainer/task-proof', result: { status: 'pass', exitCode: 0 },
  };
  item.receiptDigest = digestJson(item);
  return item;
}
function inputs() {
  const value = contract();
  const claim = claimFor(value);
  const receipts = [receiptFor(value, claim)];
  const review = reviewFor(value, claim, receipts);
  const evidence = assessment('task-proof-evidence-assessment', EVIDENCE_ASSESSMENT_VERSION, value, claim, review);
  const lifecycle = assessment('task-proof-lifecycle-assessment', LIFECYCLE_ASSESSMENT_VERSION, value, claim, review);
  const named = namedReceipt(value, claim, review);
  const expected = { contractDigest: digestTaskContract(value), claimDigest: digestJson(claim), reviewDigest: digestJson(review), headSha: HEAD, reviewerRunId: 'review-run' };
  return {
    contract: value, claim, review, authorityReceipts: receipts,
    authorityAdapter: ({ source }) => ({ ok: true, adapterId: 'git-adapter', adapterReceiptDigest: ADAPTER, contractDigest: expected.contractDigest, sourceId: source.sourceId, sourceSha256: source.sha256, implementationHeadRevision: HEAD, reviewerRunId: 'review-run' }),
    evidenceAssessment: evidence,
    evidenceVerifier: (item) => ({ ok: true, assessmentDigest: item.assessmentDigest, gate: item.gate, contractDigest: expected.contractDigest, claimDigest: expected.claimDigest, reviewDigest: expected.reviewDigest }),
    namedCheckReceipts: [named],
    namedCheckVerifier: ({ receipt }) => ({ ok: true, receiptDigest: receipt.receiptDigest, result: 'pass', ...expected }),
    lifecycleAssessment: lifecycle,
    lifecycleVerifier: (item) => ({ ok: true, assessmentDigest: item.assessmentDigest, gate: item.gate, contractDigest: expected.contractDigest, claimDigest: expected.claimDigest, reviewDigest: expected.reviewDigest }),
  };
}

test('strict orchestrator accepts a fully context-bound proof', () => {
  assert.equal(computeStrictContractGate(inputs()).gate, 'PASS');
});

test('extra or unknown authority receipts are hard failures', () => {
  const value = inputs();
  const extra = structuredClone(value.authorityReceipts[0]);
  extra.sourceId = 'SRC-UNKNOWN';
  assert.equal(computeStrictContractGate({ ...value, authorityReceipts: [...value.authorityReceipts, extra] }).gate, 'FAIL');
});

test('generic yes-adapter without exact context cannot authorize PASS', () => {
  const value = inputs();
  value.authorityAdapter = () => ({ ok: true, adapterId: 'git-adapter', adapterReceiptDigest: ADAPTER });
  assert.equal(computeStrictContractGate(value).gate, 'FAIL');
});

test('generic evidence verifier without exact context cannot authorize PASS', () => {
  const value = inputs();
  value.evidenceVerifier = (item) => ({ ok: true, assessmentDigest: item.assessmentDigest, gate: item.gate });
  assert.equal(computeStrictContractGate(value).gate, 'FAIL');
});

test('generic named-check verifier without exact context cannot authorize PASS', () => {
  const value = inputs();
  value.namedCheckVerifier = ({ receipt }) => ({ ok: true, receiptDigest: receipt.receiptDigest, result: 'pass' });
  assert.equal(computeStrictContractGate(value).gate, 'FAIL');
});

test('unknown named-check policies and criteria are rejected before primitive gate calculation', () => {
  const value = inputs();
  value.namedCheckReceipts[0].locator = 'named-check:unknown';
  assert.equal(computeStrictContractGate(value).gate, 'FAIL');
  const second = inputs();
  second.namedCheckReceipts[0].supportsCriterionIds = ['AC-UNKNOWN'];
  assert.equal(computeStrictContractGate(second).gate, 'FAIL');
});
