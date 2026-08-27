import {
  computeContractBoundGate as computePrimitiveGate,
  digestJson,
  digestTaskContract,
  normalizeTaskContract,
} from './contract-authority.mjs';

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(errors, caps = {}) {
  return { gate: 'FAIL', errors, caps: { orchestration: 'FAIL', ...caps } };
}

function exactAuthorityReceiptSet(contract, receipts) {
  if (!Array.isArray(receipts)) return { ok: false, errors: ['CONTRACT_AUTHORITY_RECEIPT_SET'] };
  const expected = new Set(contract.sources.map((item) => item.sourceId));
  const seen = new Set();
  const errors = [];
  for (const receipt of receipts) {
    const sourceId = receipt?.sourceId;
    if (typeof sourceId !== 'string' || !expected.has(sourceId)) {
      errors.push(`CONTRACT_AUTHORITY_RECEIPT_UNKNOWN:${String(sourceId)}`);
      continue;
    }
    if (seen.has(sourceId)) errors.push(`CONTRACT_AUTHORITY_RECEIPT_DUPLICATE:${sourceId}`);
    seen.add(sourceId);
  }
  for (const sourceId of expected) if (!seen.has(sourceId)) errors.push(`CONTRACT_AUTHORITY_RECEIPT_MISSING:${sourceId}`);
  return { ok: errors.length === 0, errors };
}

function validateNamedReceiptEnvelope(contract, claim, review, receipts) {
  const policies = new Set(contract.evidencePolicies.namedChecks.map((item) => item.id));
  const criteria = new Set(contract.criteria.map((item) => item.id));
  const errors = [];
  for (const receipt of receipts ?? []) {
    const locator = receipt?.locator;
    const match = typeof locator === 'string' ? /^named-check:([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(locator) : null;
    if (!match || !policies.has(match[1])) errors.push(`NAMED_CHECK_UNKNOWN_POLICY:${String(locator)}`);
    if (!Array.isArray(receipt?.supportsCriterionIds) || receipt.supportsCriterionIds.some((id) => !criteria.has(id))) {
      errors.push(`NAMED_CHECK_UNKNOWN_CRITERION:${String(locator)}`);
    }
    if (receipt?.contractDigest !== digestTaskContract(contract)
      || receipt?.claimDigest !== digestJson(claim)
      || receipt?.reviewDigest !== digestJson(review)) {
      errors.push(`NAMED_CHECK_SCOPE_MISMATCH:${String(locator)}`);
    }
  }
  return errors;
}

function wrapAuthorityAdapter(adapter, expected) {
  if (typeof adapter !== 'function') return undefined;
  return (context) => {
    const result = adapter(context);
    if (!isRecord(result) || result.ok !== true) return result;
    const valid = result.contractDigest === expected.contractDigest
      && result.sourceId === context.source.sourceId
      && result.sourceSha256 === context.source.sha256
      && result.implementationHeadRevision === expected.headSha
      && result.reviewerRunId === expected.reviewerRunId;
    return valid ? result : { ...result, ok: false, reason: 'adapter-context-mismatch' };
  };
}

function wrapAssessmentVerifier(verifier, expected) {
  if (typeof verifier !== 'function') return undefined;
  return (assessment) => {
    const result = verifier(assessment);
    if (!isRecord(result) || result.ok !== true) return result;
    const valid = result.contractDigest === expected.contractDigest
      && result.claimDigest === expected.claimDigest
      && result.reviewDigest === expected.reviewDigest;
    return valid ? result : { ...result, ok: false, reason: 'assessment-context-mismatch' };
  };
}

function wrapNamedCheckVerifier(verifier, expected) {
  if (typeof verifier !== 'function') return undefined;
  return (context) => {
    const result = verifier(context);
    if (!isRecord(result) || result.ok !== true) return result;
    const valid = result.contractDigest === expected.contractDigest
      && result.claimDigest === expected.claimDigest
      && result.reviewDigest === expected.reviewDigest
      && result.headSha === expected.headSha
      && result.reviewerRunId === expected.reviewerRunId;
    return valid ? result : { ...result, ok: false, reason: 'named-check-context-mismatch' };
  };
}

/**
 * Canonical final Task Contract gate.
 *
 * The lower-level computeContractBoundGate exported by contract-authority.mjs is
 * an internal primitive. Public MCP/Skill adapters must call this orchestrator,
 * which rejects extra authority receipts and requires verifier outputs to bind
 * the exact contract, Claim, Review, HEAD, source, and reviewer identity.
 */
export function computeStrictContractGate(options) {
  const contract = normalizeTaskContract(options.contract);
  const claim = options.claim;
  const review = options.review;
  const receipts = options.authorityReceipts ?? (options.receipt ? [options.receipt] : []);
  const receiptSet = exactAuthorityReceiptSet(contract, receipts);
  if (!receiptSet.ok) return fail(receiptSet.errors);
  if (!isRecord(claim) || !isRecord(review) || !isRecord(review.reviewer)) {
    return { gate: 'INCONCLUSIVE', errors: ['REVIEW_ARTIFACT_REQUIRED'], caps: { orchestration: 'INCONCLUSIVE' } };
  }

  const namedReceipts = options.namedCheckReceipts ?? options.evidenceReceipts ?? [];
  const namedErrors = validateNamedReceiptEnvelope(contract, claim, review, namedReceipts);
  if (namedErrors.length) return fail(namedErrors);

  const expected = {
    contractDigest: digestTaskContract(contract),
    claimDigest: digestJson(claim),
    reviewDigest: digestJson(review),
    headSha: claim.repository?.headSha,
    reviewerRunId: review.reviewer.runId,
  };
  return computePrimitiveGate({
    ...options,
    contract,
    authorityReceipts: receipts,
    authorityAdapter: wrapAuthorityAdapter(options.authorityAdapter, expected),
    evidenceVerifier: wrapAssessmentVerifier(options.evidenceVerifier, expected),
    lifecycleVerifier: wrapAssessmentVerifier(options.lifecycleVerifier, expected),
    namedCheckReceipts: namedReceipts,
    namedCheckVerifier: wrapNamedCheckVerifier(options.namedCheckVerifier, expected),
  });
}

export const computeContractBoundGate = computeStrictContractGate;
