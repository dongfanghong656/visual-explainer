import { createHash } from 'node:crypto';

export const MANIFEST_VERSION = '1.0';

export const CLAIM_STATUSES = new Set([
  'done',
  'partial',
  'not_done',
  'blocked',
  'unknown',
]);

export const EVIDENCE_TYPES = new Set([
  'commit',
  'diff',
  'file',
  'artifact',
  'test',
  'build',
  'runtime',
  'review',
  'requirement',
  'trace',
]);

export const EVIDENCE_RESULTS = new Set(['pass', 'fail', 'unknown', 'not_applicable']);
export const EVIDENCE_TRUST = new Set(['primary', 'secondary', 'self_report']);

const IMPLEMENTATION_EVIDENCE = new Set(['commit', 'diff', 'file', 'artifact']);
const VERIFICATION_EVIDENCE = new Set(['test', 'build', 'runtime', 'review', 'trace']);
const BEHAVIOR_CATEGORIES = new Set(['code', 'behavior', 'config', 'data', 'migration', 'security']);
const REVIEW_DISPOSITIONS = new Set(['accepted', 'partial', 'rejected', 'unverified']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueIds(items, section, errors) {
  const ids = new Set();
  for (const item of items) {
    const id = stringValue(item?.id);
    if (!id) {
      errors.push(`${section} contains an item without a non-empty id`);
      continue;
    }
    if (ids.has(id)) errors.push(`${section} contains duplicate id: ${id}`);
    ids.add(id);
  }
  return ids;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digestManifest(manifest) {
  return createHash('sha256').update(stableStringify(manifest)).digest('hex');
}

function evaluateClaim(claim, mode, evidenceById, acceptanceById, errors, warnings) {
  const id = stringValue(claim?.id) || '<unknown-claim>';
  const status = stringValue(claim?.claimStatus);
  const category = stringValue(claim?.category) || 'code';
  const evidenceRefs = asArray(claim?.evidenceRefs).filter((value) => typeof value === 'string');
  const acceptanceRefs = asArray(claim?.acceptanceRefs).filter((value) => typeof value === 'string');
  const blockers = asArray(claim?.blockers).filter(Boolean);

  if (!CLAIM_STATUSES.has(status)) {
    errors.push(`claim ${id} has unsupported claimStatus: ${status || '<empty>'}`);
  }

  const evidence = [];
  for (const ref of evidenceRefs) {
    const item = evidenceById.get(ref);
    if (!item) errors.push(`claim ${id} references missing evidence: ${ref}`);
    else evidence.push(item);
  }

  const acceptance = [];
  for (const ref of acceptanceRefs) {
    const item = acceptanceById.get(ref);
    if (!item) errors.push(`claim ${id} references missing acceptance criterion: ${ref}`);
    else acceptance.push(item);
  }

  const failedEvidence = evidence.filter((item) => item.result === 'fail');
  const passingEvidence = evidence.filter((item) => item.result === 'pass');
  const independentlyObserved = passingEvidence.filter((item) => item.trust !== 'self_report');
  const primaryEvidence = passingEvidence.filter((item) => item.trust === 'primary');
  const implementationEvidence = primaryEvidence.filter((item) => IMPLEMENTATION_EVIDENCE.has(item.type));
  const verificationEvidence = primaryEvidence.filter((item) => VERIFICATION_EVIDENCE.has(item.type));
  const acceptanceFailed = acceptance.filter((item) => item.status === 'fail');
  const acceptanceUnknown = acceptance.filter((item) => item.status !== 'pass');

  const reasons = [];
  let verdict = 'unverified';

  if (failedEvidence.length || acceptanceFailed.length) {
    verdict = 'contradicted';
    if (failedEvidence.length) reasons.push('one or more cited evidence items failed');
    if (acceptanceFailed.length) reasons.push('one or more acceptance criteria failed');
  } else if (status === 'blocked') {
    verdict = 'blocked';
    if (!blockers.length) {
      errors.push(`claim ${id} is blocked but has no blocker`);
      reasons.push('blocked status lacks a blocker description');
    }
  } else if (status === 'not_done') {
    verdict = 'not_done';
  } else if (status === 'unknown') {
    verdict = 'unknown';
  } else if (status === 'partial') {
    verdict = independentlyObserved.length ? 'partially_verified' : 'unverified';
    if (!independentlyObserved.length) reasons.push('partial claim has no independently observed passing evidence');
  } else if (status === 'done') {
    if (!acceptanceRefs.length) reasons.push('done claim has no linked acceptance criterion');
    if (acceptanceUnknown.length) reasons.push('not all linked acceptance criteria passed');
    if (!independentlyObserved.length) reasons.push('done claim lacks independently observed passing evidence');
    if (!primaryEvidence.length) reasons.push('done claim lacks primary evidence');

    if (BEHAVIOR_CATEGORIES.has(category)) {
      if (!implementationEvidence.length) reasons.push('behavioral claim lacks primary implementation evidence');
      if (!verificationEvidence.length) reasons.push('behavioral claim lacks primary verification evidence');
    }

    if (blockers.length) reasons.push('done claim still declares an unresolved blocker');
    verdict = reasons.length ? 'unverified' : 'verified';
  }

  if (evidenceRefs.length === 0 && status !== 'not_done' && status !== 'unknown') {
    warnings.push(`claim ${id} does not cite evidence`);
  }

  const reviewerDisposition = stringValue(claim?.reviewDisposition);
  if (reviewerDisposition && !REVIEW_DISPOSITIONS.has(reviewerDisposition)) {
    errors.push(`claim ${id} has unsupported reviewDisposition: ${reviewerDisposition}`);
  }
  if (mode === 'producer' && reviewerDisposition) {
    errors.push(`producer claim ${id} must not set reviewDisposition`);
  }
  if (mode === 'reviewer' && !reviewerDisposition) {
    errors.push(`reviewer claim ${id} requires reviewDisposition`);
  }
  if (mode === 'reviewer' && reviewerDisposition === 'accepted' && verdict !== 'verified') {
    errors.push(`reviewer claim ${id} cannot be accepted because its evidence verdict is ${verdict}`);
  }
  if (mode === 'reviewer' && reviewerDisposition === 'rejected' && verdict !== 'contradicted') {
    errors.push(`reviewer claim ${id} cannot be rejected without contradictory evidence`);
  }

  return {
    id,
    title: stringValue(claim?.title) || id,
    category,
    claimStatus: status,
    verdict,
    reviewerDisposition: reviewerDisposition || null,
    evidenceRefs,
    acceptanceRefs,
    reasons,
    metrics: {
      evidenceCount: evidence.length,
      primaryEvidenceCount: primaryEvidence.length,
      verificationEvidenceCount: verificationEvidence.length,
      acceptanceCount: acceptance.length,
      acceptancePassed: acceptance.filter((item) => item.status === 'pass').length,
    },
  };
}

export function validateManifest(input) {
  const errors = [];
  const warnings = [];

  if (!isObject(input)) {
    return {
      valid: false,
      errors: ['manifest must be a JSON object'],
      warnings,
      overall: 'invalid',
      claims: [],
      metrics: {},
    };
  }

  if (input.manifestVersion !== MANIFEST_VERSION) {
    errors.push(`manifestVersion must be ${MANIFEST_VERSION}`);
  }
  if (!['producer', 'reviewer'].includes(input.mode)) {
    errors.push('mode must be producer or reviewer');
  }
  if (!isObject(input.project) || !stringValue(input.project.name)) {
    errors.push('project.name is required');
  }
  if (!isObject(input.task) || !stringValue(input.task.id) || !stringValue(input.task.title)) {
    errors.push('task.id and task.title are required');
  }

  const evidence = asArray(input.evidence);
  const acceptance = asArray(input.acceptance);
  const claims = asArray(input.claims);

  uniqueIds(evidence, 'evidence', errors);
  uniqueIds(acceptance, 'acceptance', errors);
  uniqueIds(claims, 'claims', errors);

  const evidenceById = new Map();
  for (const item of evidence) {
    if (!isObject(item)) {
      errors.push('evidence contains a non-object item');
      continue;
    }
    const id = stringValue(item.id);
    const type = stringValue(item.type);
    const result = stringValue(item.result);
    const trust = stringValue(item.trust);
    if (!EVIDENCE_TYPES.has(type)) errors.push(`evidence ${id || '<unknown>'} has unsupported type: ${type || '<empty>'}`);
    if (!EVIDENCE_RESULTS.has(result)) errors.push(`evidence ${id || '<unknown>'} has unsupported result: ${result || '<empty>'}`);
    if (!EVIDENCE_TRUST.has(trust)) errors.push(`evidence ${id || '<unknown>'} has unsupported trust: ${trust || '<empty>'}`);
    if (!stringValue(item.locator)) errors.push(`evidence ${id || '<unknown>'} requires locator`);
    if (!stringValue(item.summary)) errors.push(`evidence ${id || '<unknown>'} requires summary`);
    if (id) evidenceById.set(id, item);
  }

  const acceptanceById = new Map();
  for (const item of acceptance) {
    if (!isObject(item)) {
      errors.push('acceptance contains a non-object item');
      continue;
    }
    const id = stringValue(item.id);
    if (!['pass', 'fail', 'unknown', 'not_run'].includes(item.status)) {
      errors.push(`acceptance ${id || '<unknown>'} has unsupported status: ${item.status || '<empty>'}`);
    }
    if (!stringValue(item.text)) errors.push(`acceptance ${id || '<unknown>'} requires text`);
    const refs = asArray(item.evidenceRefs).filter((value) => typeof value === 'string');
    const resolved = [];
    for (const ref of refs) {
      const evidenceItem = evidenceById.get(ref);
      if (!evidenceItem) errors.push(`acceptance ${id || '<unknown>'} references missing evidence: ${ref}`);
      else resolved.push(evidenceItem);
    }
    if (item.status === 'pass' && refs.length === 0) {
      errors.push(`acceptance ${id || '<unknown>'} is pass but cites no evidence`);
    }
    if (item.status === 'pass' && resolved.some((evidenceItem) => evidenceItem.result === 'fail')) {
      errors.push(`acceptance ${id || '<unknown>'} is pass but cites failed evidence`);
    }
    if (id) acceptanceById.set(id, item);
  }

  if (!claims.length) errors.push('manifest must contain at least one claim');
  const evaluatedClaims = claims.map((claim) =>
    evaluateClaim(claim, input.mode, evidenceById, acceptanceById, errors, warnings),
  );

  const verdictCounts = evaluatedClaims.reduce((accumulator, claim) => {
    accumulator[claim.verdict] = (accumulator[claim.verdict] || 0) + 1;
    return accumulator;
  }, {});

  const acceptanceFailed = acceptance.filter((item) => item?.status === 'fail').length;
  const acceptanceUnknown = acceptance.filter((item) => item?.status !== 'pass').length;
  const hasContradiction = (verdictCounts.contradicted || 0) > 0 || acceptanceFailed > 0;
  const allClaimsVerified = evaluatedClaims.length > 0 && evaluatedClaims.every((claim) => claim.verdict === 'verified');
  const allAcceptancePassed = acceptance.length > 0 && acceptanceUnknown === 0;
  const hasProgress = evaluatedClaims.some((claim) => ['verified', 'partially_verified'].includes(claim.verdict));

  let overall = 'unverified';
  if (errors.length) overall = 'invalid';
  else if (hasContradiction) overall = 'contradicted';
  else if (allClaimsVerified && allAcceptancePassed && asArray(input.unknowns).length === 0) overall = 'verified_complete';
  else if (hasProgress) overall = 'partial';

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    overall,
    claims: evaluatedClaims,
    metrics: {
      claimCount: evaluatedClaims.length,
      verdictCounts,
      evidenceCount: evidence.length,
      acceptanceCount: acceptance.length,
      acceptancePassed: acceptance.filter((item) => item?.status === 'pass').length,
      acceptanceFailed,
      acceptanceUnknown,
    },
    digest: digestManifest(input),
  };
}

function reviewerVerdict(claim) {
  if (claim.reviewerDisposition === 'partial') return 'partially_verified';
  if (claim.reviewerDisposition === 'unverified') return 'unverified';
  return claim.verdict;
}

function checkpointIdentity(manifest) {
  return {
    repository: stringValue(manifest?.project?.repository),
    branch: stringValue(manifest?.project?.branch),
    base: stringValue(manifest?.project?.base),
    head: stringValue(manifest?.project?.head),
    taskId: stringValue(manifest?.task?.id),
  };
}

export function compareManifests(producerManifest, reviewerManifest) {
  const producerValidation = validateManifest(producerManifest);
  const reviewerValidation = validateManifest(reviewerManifest);
  const producerIdentity = checkpointIdentity(producerManifest);
  const reviewerIdentity = checkpointIdentity(reviewerManifest);
  const checkpointMismatches = Object.keys(producerIdentity)
    .filter((key) => producerIdentity[key] !== reviewerIdentity[key])
    .map((key) => ({ field: key, producer: producerIdentity[key], reviewer: reviewerIdentity[key] }));

  const producerClaims = new Map(producerValidation.claims.map((claim) => [claim.id, claim]));
  const reviewerClaims = new Map(reviewerValidation.claims.map((claim) => [claim.id, claim]));
  const ids = [...new Set([...producerClaims.keys(), ...reviewerClaims.keys()])].sort();

  const comparisons = ids.map((id) => {
    const producer = producerClaims.get(id) || null;
    const reviewer = reviewerClaims.get(id) || null;
    if (!producer) return { id, outcome: 'reviewer_only', producer: null, reviewer };
    if (!reviewer) return { id, outcome: 'not_reviewed', producer, reviewer: null };
    const reviewedVerdict = reviewerVerdict(reviewer);
    let outcome = 'disputed';
    if (producer.verdict === reviewedVerdict) outcome = 'agreed';
    else if (producer.verdict === 'verified' && reviewedVerdict !== 'verified') outcome = 'downgraded';
    else if (producer.verdict !== 'verified' && reviewedVerdict === 'verified') outcome = 'upgraded';
    return { id, outcome, producer, reviewer: { ...reviewer, verdict: reviewedVerdict } };
  });

  const counts = comparisons.reduce((accumulator, item) => {
    accumulator[item.outcome] = (accumulator[item.outcome] || 0) + 1;
    return accumulator;
  }, {});

  const manifestsValid = producerValidation.valid && reviewerValidation.valid;
  const cleanAgreement =
    manifestsValid &&
    checkpointMismatches.length === 0 &&
    comparisons.length > 0 &&
    comparisons.every((item) => item.outcome === 'agreed');

  let overall = 'incomplete_review';
  if (checkpointMismatches.length) overall = 'checkpoint_mismatch';
  else if (cleanAgreement) overall = 'agreed';
  else if (comparisons.some((item) => ['downgraded', 'disputed'].includes(item.outcome))) overall = 'disputed';

  return {
    valid: manifestsValid && checkpointMismatches.length === 0,
    checkpointMatch: checkpointMismatches.length === 0,
    checkpointMismatches,
    producerValidation,
    reviewerValidation,
    producerDigest: producerValidation.digest,
    reviewerDigest: reviewerValidation.digest,
    overall,
    comparisons,
    counts,
  };
}
