import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_CONTRACT_VERSION,
  AUTHORITY_RECEIPT_VERSION,
  EVIDENCE_ASSESSMENT_VERSION,
  NAMED_CHECK_RECEIPT_VERSION,
  LIFECYCLE_ASSESSMENT_VERSION,
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
  verifyAuthorityReceipts,
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
      issuedAt: '2026-08-27T00:00:00.000Z',
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
      statement: 'A final PASS requires a frozen contract, trusted authority, complete review, and content-bound evidence.',
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
    generatedAt: '2026-08-27T00:05:00.000Z',
    producer: { role: 'claimant', runId: 'claimant-run-001' },
    repository: { identity: normalized.repository, baseSha: normalized.scope.baseRevision, headSha: HEAD },
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

function authorityReceiptFor(value, claim, reviewerRunId = 'reviewer-run-001') {
  return createAuthorityReceipt({
    contract: value,
    sourceId: 'SRC-REQ-0007',
    claim,
    reviewerRunId,
    observedAt: '2026-08-27T00:08:00.000Z',
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

function reviewFor(value, claim, receipts, overrides = {}) {
  const receiptDigests = receipts.map((item) => item.receiptDigest).sort();
  const review = {
    taskId: value.taskId,
    generatedAt: '2026-08-27T00:10:00.000Z',
    repository: structuredClone(claim.repository),
    reviewer: { role: 'reviewer', runId: 'reviewer-run-001' },
    reviewerAttestation: {
      level: 'R2', method: 'procedural_attestation', sessionId: 'reviewer-run-001',
      reconstructedBeforeReadingClaim: true, independentEvidenceCollected: true,
      adversarialEvidenceCollected: false,
    },
    contractRef: {
      contractId: value.contractId,
      contractDigest: digestTaskContract(value),
      authorityDeclarationDigest: digestAuthorityDeclaration(value),
      authorityVerificationReceiptDigests: receiptDigests,
    },
    claimDigest: digestJson(claim),
    findings: [{ claimId: 'CL-001', verdict: 'verified' }],
  };
  return deepMerge(review, overrides);
}

function authorityAdapter() {
  return { ok: true, adapterId: 'git-history-adapter-v1', adapterReceiptDigest: ADAPTER_SHA };
}

function assessment(kind, version, value, claim, review, gate = 'PASS') {
  const item = {
    version,
    kind,
    contractDigest: digestTaskContract(value),
    claimDigest: digestJson(claim),
    reviewDigest: digestJson(review),
    gate,
  };
  item.assessmentDigest = digestJson(item);
  return item;
}

function evidenceAssessment(value, claim, review, gate = 'PASS') {
  return assessment('task-proof-evidence-assessment', EVIDENCE_ASSESSMENT_VERSION, value, claim, review, gate);
}

function lifecycleAssessment(value, claim, review, gate = 'PASS') {
  return assessment('task-proof-lifecycle-assessment', LIFECYCLE_ASSESSMENT_VERSION, value, claim, review, gate);
}

function assessmentVerifier(item) {
  return { ok: true, assessmentDigest: item.assessmentDigest, gate: item.gate };
}

function namedCheckReceipt(value, claim, review, overrides = {}) {
  const item = deepMerge({
    version: NAMED_CHECK_RECEIPT_VERSION,
    kind: 'task-proof-named-check-receipt',
    contractDigest: digestTaskContract(value),
    claimDigest: digestJson(claim),
    reviewDigest: digestJson(review),
    headSha: claim.repository.headSha,
    producerRunId: review.reviewer.runId,
    locator: 'named-check:task-proof-tests',
    supportsCriterionIds: ['AC-CONTRACT-001'],
    policyDigest: POLICY_SHA,
    evidenceKind: 'test',
    executableDigest: EXE_SHA,
    argsDigest: ARGS_SHA,
    workingDirectory: 'plugins/visual-explainer/task-proof',
    result: { status: 'pass', exitCode: 0 },
  }, overrides);
  item.receiptDigest = digestJson(item);
  return item;
}

function namedCheckVerifier({ receipt }) {
  return { ok: true, receiptDigest: receipt.receiptDigest, result: receipt.result.status };
}

function fullGate(value = contract(), gateOverrides = {}) {
  const claim = claimFor(value);
  const authorityReceipts = [authorityReceiptFor(value, claim)];
  const review = reviewFor(value, claim, authorityReceipts);
  return computeContractBoundGate({
    contract: value,
    claim,
    review,
    authorityReceipts,
    authorityAdapter,
    evidenceAssessment: evidenceAssessment(value, claim, review),
    evidenceVerifier: assessmentVerifier,
    namedCheckReceipts: [namedCheckReceipt(value, claim, review)],
    namedCheckVerifier,
    lifecycleAssessment: lifecycleAssessment(value, claim, review),
    lifecycleVerifier: assessmentVerifier,
    ...gateOverrides,
  });
}

test('canonical digest is deterministic and lowercase named-check IDs are valid', () => {
  const first = contract();
  const second = contract({ criteria: [{ ...first.criteria[0], requiredEvidenceKinds: [...first.criteria[0].requiredEvidenceKinds].reverse() }] });
  assert.equal(canonicalTaskContract(first), canonicalTaskContract(second));
  assert.equal(digestTaskContract(first), digestTaskContract(second));
  assert.equal(normalizeTaskContract(first).evidencePolicies.namedChecks[0].id, 'task-proof-tests');
});

test('unknown fields, duplicate IDs, and impossible authority methods are rejected', () => {
  assert.throws(() => normalizeTaskContract(contract({ surprise: true })), /unknown fields/);
  const duplicate = contract();
  duplicate.criteria.push(structuredClone(duplicate.criteria[0]));
  assert.throws(() => normalizeTaskContract(duplicate), /duplicate id/i);
  assert.throws(() => normalizeTaskContract(contract({ authority: { method: 'github_issue_live' } })), /not valid for authority level/);
});

test('repository source paths, normalized scope paths, and immutable OIDs are enforced', () => {
  assert.throws(() => normalizeTaskContract(contract({ sources: [{ ...contract().sources[0], revision: 'main' }] })), /Git object ID/);
  assert.throws(() => normalizeTaskContract(contract({ sources: [{ ...contract().sources[0], locator: 'C:\\outside.md' }] })), /repository-relative/);
  assert.throws(() => normalizeTaskContract(contract({ scope: { includedPaths: ['a\\b', 'a/b'] } })), /duplicate normalized paths/);
  assert.throws(() => normalizeTaskContract(contract({ scope: { includedPaths: ['a/b'], excludedPaths: ['a\\b'] } })), /both included and excluded/);
});

test('every source and requirement-to-criterion edge must be represented symmetrically', () => {
  const unused = contract();
  unused.sources.push({ ...unused.sources[0], sourceId: 'SRC-UNUSED', locator: 'docs/unused.md' });
  assert.throws(() => normalizeTaskContract(unused), /not represented by requirements/);
  assert.throws(() => normalizeTaskContract(contract({ requirements: [{ ...contract().requirements[0], criterionIds: [] }] })), /must contain 1-256 items/);
  assert.throws(() => normalizeTaskContract(contract({ criteria: [{ ...contract().criteria[0], sourceRequirementRefs: ['REQ-OTHER'] }] })), /unknown requirement/);
});

test('non-covered requirements cannot retain hidden criterion links', () => {
  const invalid = contract({ requirements: [{
    ...contract().requirements[0], disposition: 'explicitly_excluded', authorityReason: 'Owner excluded it.',
  }] });
  assert.throws(() => normalizeTaskContract(invalid), /must be empty/);
});

test('blocking named checks require a frozen policy with a matching evidence kind', () => {
  assert.throws(() => normalizeTaskContract(contract({ evidencePolicies: { namedChecks: [] } })), /without a frozen policy/);
  assert.throws(() => normalizeTaskContract(contract({ evidencePolicies: { namedChecks: [{ ...contract().evidencePolicies.namedChecks[0], evidenceKind: 'build' }] } })), /does not require the frozen evidence kind/);
});

test('claim binding detects criterion omission, weakening, repository drift, and chronology errors', () => {
  const value = contract();
  const claim = claimFor(value);
  assert.equal(validateClaimContractBinding(value, claim).ok, true);
  assert.equal(validateClaimContractBinding(value, claimFor(value, { contractCriterionSnapshot: [] })).ok, false);
  const weakened = structuredClone(claim);
  weakened.contractCriterionSnapshot[0].requiredEvidenceLocators = [];
  assert.equal(validateClaimContractBinding(value, weakened).ok, false);
  assert.ok(validateClaimContractBinding(value, claimFor(value, { repository: { headSha: '3'.repeat(40) } })).ok);
  assert.ok(validateClaimContractBinding(value, claimFor(value, { generatedAt: '2026-08-26T23:59:59.000Z' })).errors.includes('CLAIM_PREDATES_CONTRACT'));
});

test('authority receipt binds exact Claim HEAD and final reviewer identity', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = authorityReceiptFor(value, claim);
  const review = reviewFor(value, claim, [receipt]);
  assert.equal(verifyAuthorityReceipt({ contract: value, claim, review, receipt, adapter: authorityAdapter }).ok, true);
  const wrongHead = structuredClone(receipt);
  wrongHead.implementationHeadRevision = '3'.repeat(40);
  wrongHead.receiptDigest = digestJson(Object.fromEntries(Object.entries(wrongHead).filter(([key]) => key !== 'receiptDigest')));
  assert.equal(verifyAuthorityReceipt({ contract: value, claim, review, receipt: wrongHead, adapter: authorityAdapter }).cap, 'FAIL');
  const wrongReviewer = structuredClone(receipt);
  wrongReviewer.producerRunId = 'other-reviewer';
  wrongReviewer.receiptDigest = digestJson(Object.fromEntries(Object.entries(wrongReviewer).filter(([key]) => key !== 'receiptDigest')));
  assert.equal(verifyAuthorityReceipt({ contract: value, claim, review, receipt: wrongReviewer, adapter: authorityAdapter }).cap, 'FAIL');
});

test('all declared authority sources require independently verified receipts', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = authorityReceiptFor(value, claim);
  const review = reviewFor(value, claim, [receipt]);
  assert.equal(verifyAuthorityReceipts({ contract: value, claim, review, receipts: [receipt], adapter: authorityAdapter }).cap, 'PASS');
  assert.equal(verifyAuthorityReceipts({ contract: value, claim, review, receipts: [], adapter: authorityAdapter }).cap, 'INCONCLUSIVE');
});

test('trusted authority adapter rejection is a hard failure, absence is inconclusive', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = authorityReceiptFor(value, claim);
  const review = reviewFor(value, claim, [receipt]);
  assert.equal(verifyAuthorityReceipt({ contract: value, claim, review, receipt }).cap, 'INCONCLUSIVE');
  assert.equal(verifyAuthorityReceipt({ contract: value, claim, review, receipt, adapter: () => ({ ok: false }) }).cap, 'FAIL');
});

test('review binds exact repository, Claim digest, receipt set, reviewer identity, and R-level', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = authorityReceiptFor(value, claim);
  const review = reviewFor(value, claim, [receipt]);
  assert.equal(validateReviewContractBinding(value, claim, review, [receipt]).ok, true);
  const wrongRepo = reviewFor(value, claim, [receipt], { repository: { headSha: '4'.repeat(40) } });
  assert.equal(validateReviewContractBinding(value, claim, wrongRepo, [receipt]).cap, 'FAIL');
  const wrongSession = reviewFor(value, claim, [receipt], { reviewerAttestation: { sessionId: 'invented-run' } });
  assert.equal(validateReviewContractBinding(value, claim, wrongSession, [receipt]).cap, 'FAIL');
});

test('named-check receipts require content-bound policy, reviewer ownership, pass result, and trusted verifier', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipt = authorityReceiptFor(value, claim);
  const review = reviewFor(value, claim, [receipt]);
  const check = namedCheckReceipt(value, claim, review);
  assert.equal(validateNamedCheckReceipts(value, [check], { claim, review, verifier: namedCheckVerifier }).cap, 'PASS');
  assert.equal(validateNamedCheckReceipts(value, [check], { claim, review }).cap, 'INCONCLUSIVE');
  const wrongPolicy = namedCheckReceipt(value, claim, review, { argsDigest: `sha256:${'f'.repeat(64)}` });
  assert.equal(validateNamedCheckReceipts(value, [wrongPolicy], { claim, review, verifier: namedCheckVerifier }).cap, 'FAIL');
  const failed = namedCheckReceipt(value, claim, review, { result: { status: 'fail', exitCode: 1 } });
  assert.equal(validateNamedCheckReceipts(value, [failed], { claim, review, verifier: namedCheckVerifier }).cap, 'FAIL');
});

test('bare caller-provided evidence and lifecycle PASS strings cannot authorize final PASS', () => {
  const value = contract();
  const claim = claimFor(value);
  const receipts = [authorityReceiptFor(value, claim)];
  const review = reviewFor(value, claim, receipts);
  const result = computeContractBoundGate({
    contract: value, claim, review, authorityReceipts: receipts, authorityAdapter,
    evidenceGate: 'PASS', lifecycleGate: 'PASS',
    namedCheckReceipts: [namedCheckReceipt(value, claim, review)], namedCheckVerifier,
  });
  assert.equal(result.gate, 'INCONCLUSIVE');
  assert.ok(result.errors.includes('UNTRUSTED_EVIDENCE_GATE'));
  assert.ok(result.errors.includes('UNTRUSTED_LIFECYCLE_GATE'));
});

test('fully verifier-bound repository-approved R2 evidence yields PASS', () => {
  assert.equal(fullGate().gate, 'PASS');
});

test('allBlockingCriteriaRequired=false caps the contract at INCONCLUSIVE', () => {
  const value = contract({ reviewPolicy: { allBlockingCriteriaRequired: false } });
  assert.equal(fullGate(value).gate, 'INCONCLUSIVE');
});

test('explicit exclusions cap source coverage at PASS_WITH_LIMITS', () => {
  const baseValue = contract();
  const value = contract({
    requirements: [{
      ...baseValue.requirements[0], disposition: 'explicitly_excluded', criterionIds: [],
      authorityReason: 'Explicitly excluded by the project owner.',
    }],
    criteria: [{ ...baseValue.criteria[0], sourceRequirementRefs: ['REQ-OTHER'] }],
  });
  assert.throws(() => normalizeTaskContract(value), /unknown requirement/);
  const coveredPlusExcluded = contract();
  coveredPlusExcluded.sources.push({ ...coveredPlusExcluded.sources[0], sourceId: 'SRC-EXCLUDED', locator: 'docs/excluded.md' });
  coveredPlusExcluded.requirements.push({
    requirementId: 'REQ-EXCLUDED', sourceId: 'SRC-EXCLUDED', statement: 'Excluded outcome.',
    disposition: 'explicitly_excluded', criterionIds: [], authorityReason: 'Owner excluded it.',
  });
  assert.equal(sourceCoverageCap(coveredPlusExcluded), 'PASS_WITH_LIMITS');
});

test('claimant-provisional contract remains INCONCLUSIVE even with otherwise passing evidence', () => {
  const value = contract({
    authority: { level: 'claimant_provisional', method: 'procedural_attestation' },
    reviewPolicy: { allowClaimantProvisionalContract: true },
  });
  assert.equal(fullGate(value).gate, 'INCONCLUSIVE');
});

test('cyclic arrays and non-plain objects are rejected by canonical JSON', () => {
  const cycle = [];
  cycle.push(cycle);
  assert.throws(() => digestJson(cycle), /cyclic array/);
  assert.throws(() => digestJson(new Date()), /non-JSON object/);
});

test('superseded and revoked lifecycle states cannot produce PASS', () => {
  const superseded = contract({ lifecycle: { status: 'superseded', supersededByContractId: 'TPC-0002', supersededByContractDigest: `sha256:${'9'.repeat(64)}` } });
  const revoked = contract({ lifecycle: { status: 'revoked', revokedReason: 'Withdrawn.' } });
  assert.equal(fullGate(superseded).gate, 'STALE');
  assert.equal(fullGate(revoked).gate, 'FAIL');
  assert.equal(minGate('PASS', 'STALE'), 'STALE');
});

test('protocol component versions are explicit', () => {
  assert.equal(TASK_CONTRACT_VERSION, '2.4.0');
  assert.equal(AUTHORITY_RECEIPT_VERSION, '1.4.0');
  assert.equal(EVIDENCE_ASSESSMENT_VERSION, '1.0.0');
  assert.equal(NAMED_CHECK_RECEIPT_VERSION, '1.0.0');
  assert.equal(LIFECYCLE_ASSESSMENT_VERSION, '1.0.0');
});
