import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_CONTRACT_VERSION,
  AUTHORITY_RECEIPT_VERSION,
  canonicalTaskContract,
  computeContractBoundGate,
  createAuthorityReceipt,
  digestAuthorityDeclaration,
  digestJson,
  digestTaskContract,
  minGate,
  normalizeTaskContract,
  sourceCoverageCap,
  validateClaimContractBinding,
  validateNamedCheckReceipts,
  validateReviewContractBinding,
  verifyAuthorityReceipt,
} from './contract-authority.mjs';

const BASE = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const SOURCE_REV = '0'.repeat(40);
const SOURCE_SHA = 'a'.repeat(64);
const POLICY_SHA = `sha256:${'b'.repeat(64)}`;
const EXE_SHA = `sha256:${'c'.repeat(64)}`;
const ARGS_SHA = `sha256:${'d'.repeat(64)}`;
const ADAPTER_SHA = `sha256:${'e'.repeat(64)}`;

function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return overrides ?? base;
  const output = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value)
      && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = structuredClone(value);
    }
  }
  return output;
}

function contract(overrides = {}) {
  const value = {
    schemaVersion: TASK_CONTRACT_VERSION,
    kind: 'task-contract',
    contractId: 'TPC-0001',
    taskId: 'TASK-0007',
    repository: 'dongfanghong656/visual-explainer',
    authority: {
      level: 'project_approved',
      issuerRole: 'project-owner',
      issuerRunId: 'owner-run-001',
      method: 'repository_source',
      issuedAt: '2026-08-26T12:00:00.000Z',
      signature: null,
      keyId: null,
      limitations: [],
    },
    sources: [{
      sourceId: 'SRC-REQ-0007',
      type: 'repository_file',
      locator: 'docs/requirements/REQ-0007.md',
      revision: SOURCE_REV,
      sha256: SOURCE_SHA,
      precedence: 1,
      description: 'Approved requirement source.',
      assurance: 'repository-history',
    }],
    scope: {
      baseRevision: BASE,
      includedOutcomes: ['Enforce contract-bound acceptance'],
      excludedOutcomes: ['Cryptographic identity'],
      includedPaths: ['plugins/visual-explainer/task-proof'],
      excludedPaths: [],
    },
    requirements: [{
      requirementId: 'REQ-0007-A',
      sourceId: 'SRC-REQ-0007',
      statement: 'All final acceptance must bind a frozen task contract.',
      disposition: 'covered',
      criterionIds: ['AC-CONTRACT-001'],
      authorityReason: null,
    }],
    criteria: [{
      id: 'AC-CONTRACT-001',
      statement: 'A final PASS is impossible without an exact contract, authority receipt, review, and named-check policy match.',
      criticality: 'blocking',
      requiredEvidenceKinds: ['test'],
      requiredEvidenceLocators: ['named-check:task-proof-tests'],
      sourceRequirementRefs: ['REQ-0007-A'],
      environment: 'Node 20 and 22',
      limitations: [],
    }],
    evidencePolicies: {
      namedChecks: [{
        id: 'task-proof-tests',
        policyDigest: POLICY_SHA,
        evidenceKind: 'test',
        executableDigest: EXE_SHA,
        argsDigest: ARGS_SHA,
        workingDirectory: 'plugins/visual-explainer/task-proof',
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
  return deepMerge(value, overrides);
}

function claimFor(value = contract(), overrides = {}) {
  const normalized = normalizeTaskContract(value);
  const claim = {
    taskId: normalized.taskId,
    generatedAt: '2026-08-26T12:05:00.000Z',
    producer: { role: 'claimant', runId: 'claimant-run-001' },
    repository: {
      identity: normalized.repository,
      baseSha: normalized.scope.baseRevision,
      headSha: HEAD,
    },
    contractRef: {
      contractId: normalized.contractId,
      contractDigest: digestTaskContract(normalized),
      authorityDeclarationDigest: digestAuthorityDeclaration(normalized),
    },
    contractCriterionSnapshot: structuredClone(normalized.criteria),
    claims: [{ id: 'CL-001', status: 'declared_done' }],
  };
  return deepMerge(claim, overrides);
}

function receiptFor(value, claim, reviewerRunId = 'reviewer-run-001') {
  return createAuthorityReceipt({
    contract: value,
    sourceId: 'SRC-REQ-0007',
    claim,
    reviewerRunId,
    observedAt: '2026-08-26T12:08:00.000Z',
    method: 'repository_source',
    observation: {
      sourceExistsAtBase: true,
      revisionIsAncestor: true,
      sourceChangedInImplementationScope: false,
      safeGitConfiguration: true,
      sourceIsRegularFile: true,
      sourceIsSymbolicLink: false,
      sizeBytes: 2048,
      observedSourceSha256: SOURCE_SHA,
      adapterId: 'git-history-adapter-v1',
      adapterReceiptDigest: ADAPTER_SHA,
    },
  });
}

function reviewFor(value, claim, receipt, overrides = {}) {
  const review = {
    taskId: value.taskId,
    generatedAt: '2026-08-26T12:10:00.000Z',
    reviewer: { role: 'reviewer', runId: 'reviewer-run-001' },
    reviewerAttestation: {
      level: 'R2',
      method: 'procedural_attestation',
      sessionId: 'reviewer-run-001',
      reconstructedBeforeReadingClaim: true,
      independentEvidenceCollected: true,
      adversarialEvidenceCollected: false,
    },
    contractRef: {
      contractId: value.contractId,
      contractDigest: digestTaskContract(value),
      authorityDeclarationDigest: digestAuthorityDeclaration(value),
      authorityVerificationReceiptDigest: receipt.receiptDigest,
    },
    claimDigest: digestJson(claim),
    findings: [{ claimId: 'CL-001', verdict: 'verified' }],
  };
  return deepMerge(review, overrides);
}

function evidenceReceipt(overrides = {}) {
  return deepMerge({
    locator: 'named-check:task-proof-tests',
    supportsCriterionIds: ['AC-CONTRACT-001'],
    policyDigest: POLICY_SHA,
    evidenceKind: 'test',
    executableDigest: EXE_SHA,
    argsDigest: ARGS_SHA,
    workingDirectory: 'plugins/visual-explainer/task-proof',
  }, overrides);
}

function trustedAdapter() {
  return {
    ok: true,
    adapterId: 'git-history-adapter-v1',
    adapterReceiptDigest: ADAPTER_SHA,
  };
}

test('canonical digest is deterministic across set order', () => {
  const first = contract();
  const second = contract({
    criteria: [{
      ...first.criteria[0],
      requiredEvidenceKinds: [...first.criteria[0].requiredEvidenceKinds].reverse(),
      requiredEvidenceLocators: [...first.criteria[0].requiredEvidenceLocators].reverse(),
    }],
  });
  assert.equal(canonicalTaskContract(first), canonicalTaskContract(second));
  assert.equal(digestTaskContract(first), digestTaskContract(second));
});

test('unknown fields and duplicate criterion IDs are rejected', () => {
  assert.throws(() => normalizeTaskContract(contract({ surprise: true })), /unknown fields/);
  const duplicate = contract();
  duplicate.criteria.push(structuredClone(duplicate.criteria[0]));
  assert.throws(() => normalizeTaskContract(duplicate), /duplicate id/i);
});

test('repository sources require immutable OIDs, safe paths, and digest', () => {
  assert.throws(() => normalizeTaskContract(contract({ sources: [{ ...contract().sources[0], revision: 'main' }] })), /Git object ID/);
  assert.throws(() => normalizeTaskContract(contract({ sources: [{ ...contract().sources[0], locator: 'C:\\outside.md' }] })), /repository-relative/);
  assert.throws(() => normalizeTaskContract(contract({ sources: [{ ...contract().sources[0], locator: '../outside.md' }] })), /unsafe path/);
});

test('blocking named checks require frozen policy metadata', () => {
  assert.throws(() => normalizeTaskContract(contract({ evidencePolicies: { namedChecks: [] } })), /without a frozen policy/);
});

test('claim binding detects criterion omission and policy weakening', () => {
  const value = contract();
  const claim = claimFor(value);
  assert.equal(validateClaimContractBinding(value, claim).ok, true);
  const omitted = structuredClone(claim);
  omitted.contractCriterionSnapshot = [];
  assert.equal(validateClaimContractBinding(value, omitted).ok, false);
  const weakened = structuredClone(claim);
  weakened.contractCriterionSnapshot[0].requiredEvidenceLocators = [];
  assert.equal(validateClaimContractBinding(value, weakened).ok, false);
});

test('claim created before contract issuance is rejected', () => {
  const value = contract();
  const claim = claimFor(value, { generatedAt: '2026-08-26T11:59:59.000Z' });
  assert.ok(validateClaimContractBinding(value, claim).errors.includes('CLAIM_PREDATES_CONTRACT'));
});

test('authority receipt binds exact claim head and final reviewer run', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = receiptFor(value, claim);
  const review = reviewFor(value, claim, receipt);
  assert.equal(verifyAuthorityReceipt({ contract: value, claim, review, receipt, adapter: trustedAdapter }).ok, true);

  const wrongHead = structuredClone(receipt);
  wrongHead.implementationHeadRevision = '3'.repeat(40);
  wrongHead.receiptDigest = digestJson(Object.fromEntries(Object.entries(wrongHead).filter(([key]) => key !== 'receiptDigest')));
  assert.ok(verifyAuthorityReceipt({ contract: value, claim, review, receipt: wrongHead, adapter: trustedAdapter }).errors.includes('CONTRACT_AUTHORITY_RECEIPT_HEAD'));

  const wrongReviewer = structuredClone(receipt);
  wrongReviewer.producerRunId = 'other-reviewer';
  wrongReviewer.receiptDigest = digestJson(Object.fromEntries(Object.entries(wrongReviewer).filter(([key]) => key !== 'receiptDigest')));
  assert.ok(verifyAuthorityReceipt({ contract: value, claim, review, receipt: wrongReviewer, adapter: trustedAdapter }).errors.includes('CONTRACT_AUTHORITY_REVIEWER_BINDING'));
});

test('receipt must be observed after issuance and before review', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = receiptFor(value, claim);
  const review = reviewFor(value, claim, receipt);
  const late = structuredClone(receipt);
  late.observedAt = '2026-08-26T12:11:00.000Z';
  late.receiptDigest = digestJson(Object.fromEntries(Object.entries(late).filter(([key]) => key !== 'receiptDigest')));
  assert.ok(verifyAuthorityReceipt({ contract: value, claim, review, receipt: late, adapter: trustedAdapter }).errors.includes('AUTHORITY_RECEIPT_POSTDATES_REVIEW'));
});

test('review binds claim digest, reviewer identity, contract, and receipt', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = receiptFor(value, claim);
  const review = reviewFor(value, claim, receipt);
  assert.equal(validateReviewContractBinding(value, claim, review, receipt).ok, true);

  const mismatch = structuredClone(review);
  mismatch.reviewerAttestation.sessionId = 'invented-run';
  assert.ok(validateReviewContractBinding(value, claim, mismatch, receipt).errors.includes('REVIEWER_ATTESTATION_BINDING'));

  const noReceipt = structuredClone(review);
  delete noReceipt.contractRef.authorityVerificationReceiptDigest;
  assert.ok(validateReviewContractBinding(value, claim, noReceipt, receipt).errors.includes('CONTRACT_AUTHORITY_VERIFICATION_BINDING'));
});

test('R3 requires adversarial evidence and policy minimum is enforced', () => {
  const value = contract({ reviewPolicy: { minimumIndependence: 'R3' } });
  const claim = claimFor(value);
  const receipt = receiptFor(value, claim);
  const review = reviewFor(value, claim, receipt, { reviewerAttestation: { level: 'R2' } });
  assert.ok(validateReviewContractBinding(value, claim, review, receipt).errors.includes('REVIEW_INDEPENDENCE_INSUFFICIENT'));
});

test('named-check receipts freeze policy, executable, args, and cwd', () => {
  const value = contract();
  assert.equal(validateNamedCheckReceipts(value, [evidenceReceipt()]).cap, 'PASS');
  assert.equal(validateNamedCheckReceipts(value, [evidenceReceipt({ argsDigest: `sha256:${'f'.repeat(64)}` })]).cap, 'FAIL');
  assert.equal(validateNamedCheckReceipts(value, []).cap, 'INCONCLUSIVE');
});

test('claimant provisional authority can never yield final PASS', () => {
  const value = contract({
    authority: { level: 'claimant_provisional', method: 'procedural_attestation' },
    reviewPolicy: { allowClaimantProvisionalContract: true },
  });
  const claim = claimFor(value);
  const receipt = receiptFor(value, claim);
  const review = reviewFor(value, claim, receipt);
  const result = computeContractBoundGate({
    contract: value,
    claim,
    review,
    receipt,
    authorityAdapter: trustedAdapter,
    evidenceGate: 'PASS',
    evidenceReceipts: [evidenceReceipt()],
  });
  assert.equal(result.gate, 'INCONCLUSIVE');
});

test('standalone reviewer assertion without a review artifact is inconclusive', () => {
  const value = contract();
  const claim = claimFor(value);
  const result = computeContractBoundGate({ contract: value, claim, evidenceGate: 'PASS' });
  assert.equal(result.gate, 'INCONCLUSIVE');
  assert.ok(result.errors.includes('REVIEW_ARTIFACT_REQUIRED'));
});

test('fully bound repository-approved R2 review yields PASS', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = receiptFor(value, claim);
  const review = reviewFor(value, claim, receipt);
  const result = computeContractBoundGate({
    contract: value,
    claim,
    review,
    receipt,
    authorityAdapter: trustedAdapter,
    evidenceGate: 'PASS',
    lifecycleGate: 'PASS',
    evidenceReceipts: [evidenceReceipt()],
  });
  assert.equal(result.gate, 'PASS', JSON.stringify(result, null, 2));
});

test('explicit exclusions cap source coverage at PASS_WITH_LIMITS', () => {
  const value = contract({
    requirements: [{
      ...contract().requirements[0],
      disposition: 'explicitly_excluded',
      criterionIds: [],
      authorityReason: 'Explicitly excluded by the project owner.',
    }],
  });
  assert.equal(sourceCoverageCap(value), 'PASS_WITH_LIMITS');
});

test('superseded and revoked contracts remain structurally distinct', () => {
  const superseded = contract({
    lifecycle: {
      status: 'superseded',
      supersededByContractId: 'TPC-0002',
      supersededByContractDigest: `sha256:${'9'.repeat(64)}`,
    },
  });
  const revoked = contract({ lifecycle: { status: 'revoked', revokedReason: 'Withdrawn by owner.' } });
  assert.equal(minGate('PASS', 'STALE'), 'STALE');
  assert.equal(normalizeTaskContract(superseded).lifecycle.status, 'superseded');
  assert.equal(normalizeTaskContract(revoked).lifecycle.status, 'revoked');
});

test('tampered authority receipt and mismatched review are hard failures', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = receiptFor(value, claim);
  const review = reviewFor(value, claim, receipt);
  const tampered = structuredClone(receipt);
  tampered.sourceSha256 = 'f'.repeat(64);
  assert.equal(verifyAuthorityReceipt({ contract: value, claim, review, receipt: tampered, adapter: trustedAdapter }).cap, 'FAIL');

  const badReview = structuredClone(review);
  badReview.claimDigest = `sha256:${'0'.repeat(64)}`;
  const result = computeContractBoundGate({
    contract: value,
    claim,
    review: badReview,
    receipt,
    authorityAdapter: trustedAdapter,
    evidenceGate: 'PASS',
    evidenceReceipts: [evidenceReceipt()],
  });
  assert.equal(result.gate, 'FAIL');
});

test('missing live authority adapter remains inconclusive rather than accepted', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = receiptFor(value, claim);
  const review = reviewFor(value, claim, receipt);
  const result = computeContractBoundGate({
    contract: value,
    claim,
    review,
    receipt,
    evidenceGate: 'PASS',
    evidenceReceipts: [evidenceReceipt()],
  });
  assert.equal(result.gate, 'INCONCLUSIVE');
  assert.ok(result.errors.includes('CONTRACT_AUTHORITY_ADAPTER_REQUIRED'));
});

test('contract and receipt versions are explicit', () => {
  assert.equal(TASK_CONTRACT_VERSION, '2.3.0');
  assert.equal(AUTHORITY_RECEIPT_VERSION, '1.2.0');
});
