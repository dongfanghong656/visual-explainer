import { createHash } from 'node:crypto';
import path from 'node:path';

export const TASK_CONTRACT_SCHEMA_VERSION = '2.1.0';

export const CONTRACT_AUTHORITY_LEVELS = Object.freeze([
  'producer-provisional',
  'user-explicit-unbound',
  'user-attested',
  'project-approved',
  'issue-locked',
  'release-policy',
  'amended',
  'revoked',
]);

export const REVIEW_INDEPENDENCE_LEVELS = Object.freeze(['R0', 'R1', 'R2', 'R3']);
export const CONTRACT_GATE_VALUES = Object.freeze([
  'FAIL',
  'STALE',
  'INCONCLUSIVE',
  'PASS_WITH_LIMITS',
  'PASS',
]);

const AUTHORITY_SET = new Set(CONTRACT_AUTHORITY_LEVELS);
const REVIEW_LEVEL_SET = new Set(REVIEW_INDEPENDENCE_LEVELS);
const GATE_SET = new Set(CONTRACT_GATE_VALUES);
const CRITICALITY_SET = new Set(['blocking', 'advisory']);
const SOURCE_TYPE_SET = new Set([
  'repository-file',
  'issue',
  'user-message',
  'release-policy',
]);
const AUTHORITY_METHOD_SET = new Set([
  'procedural-attestation',
  'repository-history',
  'cryptographic-attestation',
]);
const GATE_RANK = new Map(CONTRACT_GATE_VALUES.map((value, index) => [value, index]));

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function issue(code, pathValue, message, details = undefined) {
  return {
    code,
    path: pathValue,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

function compareCodeUnits(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedUniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(nonEmptyString).map((value) => value.trim()))]
    .sort(compareCodeUnits);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  const result = {};
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    if (value[key] !== undefined) result[key] = canonicalize(value[key]);
  }
  return result;
}

export function stableStringifyContract(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeCriterion(criterion) {
  return {
    id: String(criterion?.id ?? '').trim(),
    statement: String(criterion?.statement ?? '').trim(),
    criticality: String(criterion?.criticality ?? '').trim(),
    requiredEvidenceKinds: sortedUniqueStrings(criterion?.requiredEvidenceKinds),
    requiredEvidenceLocators: sortedUniqueStrings(criterion?.requiredEvidenceLocators),
  };
}

export function canonicalTaskContract(contract) {
  const copy = isRecord(contract) ? structuredClone(contract) : contract;
  if (!isRecord(copy)) return copy;

  if (Array.isArray(copy.criteria)) {
    copy.criteria = copy.criteria
      .map(normalizeCriterion)
      .sort((left, right) => compareCodeUnits(left.id, right.id));
  }

  if (isRecord(copy.scope)) {
    copy.scope.includedOutcomes = sortedUniqueStrings(copy.scope.includedOutcomes);
    copy.scope.excludedOutcomes = sortedUniqueStrings(copy.scope.excludedOutcomes);
  }

  return canonicalize(copy);
}

export function digestTaskContract(contract) {
  return sha256(stableStringifyContract(canonicalTaskContract(contract)));
}

export function digestContractAuthorityReceipt(contract) {
  const receipt = {
    schemaVersion: contract?.schemaVersion,
    kind: contract?.kind,
    contractId: contract?.contractId,
    taskId: contract?.taskId,
    repository: contract?.repository,
    authority: contract?.authority,
    source: contract?.source,
  };
  return sha256(stableStringifyContract(receipt));
}

function validateSafeRepositoryPath(locator, errors) {
  if (!nonEmptyString(locator)) return;
  const raw = locator.trim().replaceAll('\\', '/');
  const normalized = path.posix.normalize(raw);
  if (
    raw.startsWith('/')
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('/../')
    || normalized === '.'
    || raw.includes('\0')
  ) {
    errors.push(issue(
      'CONTRACT_SOURCE_PATH',
      'source.locator',
      'Repository-file contract sources must use a safe repository-relative path.',
      { locator },
    ));
  }
}

export function contractAuthorityCap(authorityLevel) {
  switch (authorityLevel) {
    case 'user-attested':
    case 'project-approved':
    case 'issue-locked':
    case 'release-policy':
      return 'PASS';
    case 'producer-provisional':
    case 'user-explicit-unbound':
      return 'INCONCLUSIVE';
    case 'amended':
      return 'STALE';
    case 'revoked':
      return 'FAIL';
    default:
      return 'FAIL';
  }
}

export function validateTaskContract(contract) {
  const errors = [];
  const warnings = [];

  if (!isRecord(contract)) {
    return {
      ok: false,
      errors: [issue('CONTRACT_TYPE', '', 'Task contract must be a JSON object.')],
      warnings,
      authorityCap: 'FAIL',
      digest: null,
      authorityReceiptDigest: null,
    };
  }

  if (contract.schemaVersion !== TASK_CONTRACT_SCHEMA_VERSION) {
    errors.push(issue(
      'CONTRACT_SCHEMA_VERSION',
      'schemaVersion',
      `schemaVersion must be ${TASK_CONTRACT_SCHEMA_VERSION}.`,
    ));
  }
  if (contract.kind !== 'task-contract') {
    errors.push(issue('CONTRACT_KIND', 'kind', 'kind must be task-contract.'));
  }

  for (const [field, value] of [
    ['contractId', contract.contractId],
    ['taskId', contract.taskId],
    ['repository', contract.repository],
  ]) {
    if (!nonEmptyString(value)) {
      errors.push(issue('CONTRACT_REQUIRED_FIELD', field, `${field} is required.`));
    }
  }

  if (!isRecord(contract.authority)) {
    errors.push(issue('CONTRACT_AUTHORITY', 'authority', 'authority is required.'));
  } else {
    const { authority } = contract;
    if (!AUTHORITY_SET.has(authority.level)) {
      errors.push(issue(
        'CONTRACT_AUTHORITY_LEVEL',
        'authority.level',
        `Unsupported contract authority level: ${authority.level ?? '<missing>'}.`,
      ));
    }
    if (!nonEmptyString(authority.issuerRole)) {
      errors.push(issue(
        'CONTRACT_AUTHORITY_ISSUER',
        'authority.issuerRole',
        'authority.issuerRole is required.',
      ));
    }
    if (!nonEmptyString(authority.issuerRunId)) {
      errors.push(issue(
        'CONTRACT_AUTHORITY_ISSUER',
        'authority.issuerRunId',
        'authority.issuerRunId is required.',
      ));
    }
    if (!AUTHORITY_METHOD_SET.has(authority.method)) {
      errors.push(issue(
        'CONTRACT_AUTHORITY_METHOD',
        'authority.method',
        `Unsupported authority method: ${authority.method ?? '<missing>'}.`,
      ));
    }
    if (!nonEmptyString(authority.issuedAt)) {
      errors.push(issue(
        'CONTRACT_AUTHORITY_TIME',
        'authority.issuedAt',
        'authority.issuedAt is required for audit context, but is not sufficient proof of chronology.',
      ));
    }
    if (authority.method === 'cryptographic-attestation' && !nonEmptyString(authority.signature)) {
      errors.push(issue(
        'CONTRACT_AUTHORITY_SIGNATURE',
        'authority.signature',
        'cryptographic-attestation requires a non-empty signature.',
      ));
    }
  }

  if (!isRecord(contract.source)) {
    errors.push(issue('CONTRACT_SOURCE', 'source', 'source is required.'));
  } else {
    const { source } = contract;
    if (!SOURCE_TYPE_SET.has(source.type)) {
      errors.push(issue(
        'CONTRACT_SOURCE_TYPE',
        'source.type',
        `Unsupported contract source type: ${source.type ?? '<missing>'}.`,
      ));
    }
    if (!nonEmptyString(source.locator)) {
      errors.push(issue('CONTRACT_SOURCE_LOCATOR', 'source.locator', 'source.locator is required.'));
    }
    if (!nonEmptyString(source.revision)) {
      errors.push(issue('CONTRACT_SOURCE_REVISION', 'source.revision', 'source.revision is required.'));
    }
    if (!/^[a-fA-F0-9]{64}$/.test(String(source.sha256 ?? ''))) {
      errors.push(issue(
        'CONTRACT_SOURCE_DIGEST',
        'source.sha256',
        'source.sha256 must be a 64-character hexadecimal SHA-256 digest.',
      ));
    }
    if (source.type === 'repository-file') validateSafeRepositoryPath(source.locator, errors);
  }

  const authorityLevel = contract?.authority?.level;
  if (authorityLevel === 'project-approved' && contract?.source?.type !== 'repository-file') {
    errors.push(issue(
      'CONTRACT_AUTHORITY_SOURCE',
      'source.type',
      'project-approved authority requires a repository-file source.',
    ));
  }
  if (authorityLevel === 'user-attested' && contract?.source?.type !== 'user-message') {
    errors.push(issue(
      'CONTRACT_AUTHORITY_SOURCE',
      'source.type',
      'user-attested authority requires a user-message source.',
    ));
  }
  if (authorityLevel === 'issue-locked' && contract?.source?.type !== 'issue') {
    errors.push(issue(
      'CONTRACT_AUTHORITY_SOURCE',
      'source.type',
      'issue-locked authority requires an issue source.',
    ));
  }
  if (authorityLevel === 'release-policy'
      && !['repository-file', 'release-policy'].includes(contract?.source?.type)) {
    errors.push(issue(
      'CONTRACT_AUTHORITY_SOURCE',
      'source.type',
      'release-policy authority requires a repository-file or release-policy source.',
    ));
  }

  if (!isRecord(contract.scope)) {
    errors.push(issue('CONTRACT_SCOPE', 'scope', 'scope is required.'));
  } else {
    if (!nonEmptyString(contract.scope.baseRevision)) {
      errors.push(issue(
        'CONTRACT_SCOPE_BASE',
        'scope.baseRevision',
        'scope.baseRevision is required.',
      ));
    }
    for (const key of ['includedOutcomes', 'excludedOutcomes']) {
      if (!Array.isArray(contract.scope[key])) {
        errors.push(issue(
          'CONTRACT_SCOPE_OUTCOMES',
          `scope.${key}`,
          `scope.${key} must be an array.`,
        ));
      } else if (contract.scope[key].some((item) => !nonEmptyString(item))) {
        errors.push(issue(
          'CONTRACT_SCOPE_OUTCOMES',
          `scope.${key}`,
          `scope.${key} must contain only non-empty strings.`,
        ));
      }
    }
  }

  if (!Array.isArray(contract.criteria) || contract.criteria.length === 0) {
    errors.push(issue(
      'CONTRACT_CRITERIA',
      'criteria',
      'At least one acceptance criterion is required.',
    ));
  } else {
    const seenIds = new Set();
    for (const [index, rawCriterion] of contract.criteria.entries()) {
      const criterionPath = `criteria[${index}]`;
      if (!isRecord(rawCriterion)) {
        errors.push(issue(
          'CONTRACT_CRITERION_TYPE',
          criterionPath,
          'Criterion must be an object.',
        ));
        continue;
      }
      const criterion = normalizeCriterion(rawCriterion);
      if (!nonEmptyString(criterion.id)) {
        errors.push(issue(
          'CONTRACT_CRITERION_ID',
          `${criterionPath}.id`,
          'Criterion id is required.',
        ));
      } else if (seenIds.has(criterion.id)) {
        errors.push(issue(
          'CONTRACT_CRITERION_DUPLICATE',
          `${criterionPath}.id`,
          `Duplicate criterion id: ${criterion.id}.`,
        ));
      }
      seenIds.add(criterion.id);
      if (!nonEmptyString(criterion.statement)) {
        errors.push(issue(
          'CONTRACT_CRITERION_STATEMENT',
          `${criterionPath}.statement`,
          'Criterion statement is required.',
        ));
      }
      if (!CRITICALITY_SET.has(criterion.criticality)) {
        errors.push(issue(
          'CONTRACT_CRITERION_CRITICALITY',
          `${criterionPath}.criticality`,
          'Criterion criticality must be blocking or advisory.',
        ));
      }
      if (!Array.isArray(rawCriterion.requiredEvidenceKinds)) {
        errors.push(issue(
          'CONTRACT_CRITERION_POLICY',
          `${criterionPath}.requiredEvidenceKinds`,
          'requiredEvidenceKinds must be an array.',
        ));
      }
      if (!Array.isArray(rawCriterion.requiredEvidenceLocators)) {
        errors.push(issue(
          'CONTRACT_CRITERION_POLICY',
          `${criterionPath}.requiredEvidenceLocators`,
          'requiredEvidenceLocators must be an array.',
        ));
      }
      if (
        rawCriterion.requiredEvidenceKinds?.length
        !== criterion.requiredEvidenceKinds.length
      ) {
        errors.push(issue(
          'CONTRACT_CRITERION_POLICY',
          `${criterionPath}.requiredEvidenceKinds`,
          'requiredEvidenceKinds must contain unique non-empty strings.',
        ));
      }
      if (
        rawCriterion.requiredEvidenceLocators?.length
        !== criterion.requiredEvidenceLocators.length
      ) {
        errors.push(issue(
          'CONTRACT_CRITERION_POLICY',
          `${criterionPath}.requiredEvidenceLocators`,
          'requiredEvidenceLocators must contain unique non-empty strings.',
        ));
      }
    }
  }

  if (!isRecord(contract.reviewPolicy)) {
    errors.push(issue('CONTRACT_REVIEW_POLICY', 'reviewPolicy', 'reviewPolicy is required.'));
  } else {
    if (!REVIEW_LEVEL_SET.has(contract.reviewPolicy.minimumIndependence)) {
      errors.push(issue(
        'CONTRACT_REVIEW_LEVEL',
        'reviewPolicy.minimumIndependence',
        'minimumIndependence must be R0, R1, R2, or R3.',
      ));
    }
    if (typeof contract.reviewPolicy.allBlockingCriteriaRequired !== 'boolean') {
      errors.push(issue(
        'CONTRACT_REVIEW_POLICY',
        'reviewPolicy.allBlockingCriteriaRequired',
        'allBlockingCriteriaRequired must be boolean.',
      ));
    }
    if (typeof contract.reviewPolicy.allowProducerProvisionalContract !== 'boolean') {
      errors.push(issue(
        'CONTRACT_REVIEW_POLICY',
        'reviewPolicy.allowProducerProvisionalContract',
        'allowProducerProvisionalContract must be boolean.',
      ));
    }
    if (
      authorityLevel === 'producer-provisional'
      && contract.reviewPolicy.allowProducerProvisionalContract === true
    ) {
      warnings.push(issue(
        'PROVISIONAL_CONTRACT_CAP',
        'reviewPolicy.allowProducerProvisionalContract',
        'A producer-provisional contract remains capped at INCONCLUSIVE even when this flag is true.',
      ));
    }
  }

  if (authorityLevel === 'amended') {
    if (!isRecord(contract.amendment)
        || !nonEmptyString(contract.amendment.previousContractDigest)
        || !nonEmptyString(contract.amendment.reason)) {
      errors.push(issue(
        'CONTRACT_AMENDMENT',
        'amendment',
        'An amended contract requires previousContractDigest and reason.',
      ));
    }
  } else if (authorityLevel === 'revoked') {
    if (!isRecord(contract.amendment) || !nonEmptyString(contract.amendment.reason)) {
      errors.push(issue(
        'CONTRACT_REVOCATION',
        'amendment',
        'A revoked contract requires a revocation reason.',
      ));
    }
  } else if (contract.amendment !== null) {
    warnings.push(issue(
      'CONTRACT_AMENDMENT_IGNORED',
      'amendment',
      'Active contracts should set amendment to null.',
    ));
  }

  const authorityCap = contractAuthorityCap(authorityLevel);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    authorityCap,
    digest: errors.length === 0 ? digestTaskContract(contract) : null,
    authorityReceiptDigest:
      errors.length === 0 ? digestContractAuthorityReceipt(contract) : null,
  };
}

function criterionMap(criteria) {
  return new Map(
    (Array.isArray(criteria) ? criteria : [])
      .map(normalizeCriterion)
      .filter((criterion) => criterion.id)
      .map((criterion) => [criterion.id, criterion]),
  );
}

function equalStringArrays(left, right) {
  const a = sortedUniqueStrings(left);
  const b = sortedUniqueStrings(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function validateContractReference(contract, reference, pathPrefix = 'contractRef') {
  const errors = [];
  const validation = validateTaskContract(contract);
  if (!validation.ok) {
    errors.push(issue(
      'INVALID_TASK_CONTRACT',
      pathPrefix,
      'The referenced task contract is invalid.',
      validation.errors,
    ));
    return { ok: false, errors, contractValidation: validation };
  }

  if (!isRecord(reference)) {
    errors.push(issue(
      'CONTRACT_REFERENCE_REQUIRED',
      pathPrefix,
      'A contract reference is required.',
    ));
  } else {
    if (reference.contractId !== contract.contractId) {
      errors.push(issue(
        'CONTRACT_MISMATCH',
        `${pathPrefix}.contractId`,
        'contractId does not match the frozen contract.',
      ));
    }
    if (reference.contractDigest !== validation.digest) {
      errors.push(issue(
        'CONTRACT_MISMATCH',
        `${pathPrefix}.contractDigest`,
        'contractDigest does not match the frozen contract.',
      ));
    }
    if (reference.authorityReceiptDigest !== validation.authorityReceiptDigest) {
      errors.push(issue(
        'CONTRACT_AUTHORITY_RECEIPT_MISMATCH',
        `${pathPrefix}.authorityReceiptDigest`,
        'authorityReceiptDigest does not match the frozen contract authority receipt.',
      ));
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    contractValidation: validation,
  };
}

export function compareContractCriteria(contractCriteria, copiedCriteria, pathPrefix = 'acceptanceCriteria') {
  const errors = [];
  if (copiedCriteria === undefined) return { ok: true, errors };
  if (!Array.isArray(copiedCriteria)) {
    return {
      ok: false,
      errors: [issue(
        'CONTRACT_CRITERION_SET_MISMATCH',
        pathPrefix,
        'Copied acceptance criteria must be an array when present.',
      )],
    };
  }

  const contractById = criterionMap(contractCriteria);
  const copiedById = criterionMap(copiedCriteria);
  const contractIds = [...contractById.keys()].sort(compareCodeUnits);
  const copiedIds = [...copiedById.keys()].sort(compareCodeUnits);

  if (
    contractIds.length !== copiedIds.length
    || contractIds.some((id, index) => id !== copiedIds[index])
  ) {
    errors.push(issue(
      'CONTRACT_CRITERION_SET_MISMATCH',
      pathPrefix,
      'Copied acceptance criterion IDs do not exactly match the frozen contract.',
      { contractIds, copiedIds },
    ));
    return { ok: false, errors };
  }

  for (const id of contractIds) {
    const expected = contractById.get(id);
    const observed = copiedById.get(id);
    if (expected.statement !== observed.statement) {
      errors.push(issue(
        'CONTRACT_CRITERION_CONTENT_MISMATCH',
        `${pathPrefix}.${id}.statement`,
        `Criterion ${id} statement differs from the frozen contract.`,
      ));
    }
    if (
      expected.criticality !== observed.criticality
      || !equalStringArrays(expected.requiredEvidenceKinds, observed.requiredEvidenceKinds)
      || !equalStringArrays(expected.requiredEvidenceLocators, observed.requiredEvidenceLocators)
    ) {
      errors.push(issue(
        'CONTRACT_POLICY_MISMATCH',
        `${pathPrefix}.${id}`,
        `Criterion ${id} criticality or evidence policy differs from the frozen contract.`,
      ));
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateClaimContractBinding(contract, claim) {
  const errors = [];
  if (!isRecord(claim)) {
    return {
      ok: false,
      errors: [issue('CLAIM_TYPE', '', 'Claim must be a JSON object.')],
    };
  }

  const reference = validateContractReference(contract, claim.contractRef, 'contractRef');
  errors.push(...reference.errors);

  if (claim.taskId !== undefined && claim.taskId !== contract?.taskId) {
    errors.push(issue(
      'CONTRACT_TASK_MISMATCH',
      'taskId',
      'Claim taskId does not match the frozen contract.',
    ));
  }
  if (claim.repository !== undefined && claim.repository !== contract?.repository) {
    errors.push(issue(
      'CONTRACT_REPOSITORY_MISMATCH',
      'repository',
      'Claim repository does not match the frozen contract.',
    ));
  }

  const criteriaComparison = compareContractCriteria(
    contract?.criteria,
    claim.acceptanceCriteria ?? claim.criteria,
    claim.acceptanceCriteria === undefined ? 'criteria' : 'acceptanceCriteria',
  );
  errors.push(...criteriaComparison.errors);

  return {
    ok: errors.length === 0,
    errors,
    contractValidation: reference.contractValidation,
  };
}

function reviewLevelRank(level) {
  return REVIEW_INDEPENDENCE_LEVELS.indexOf(level);
}

export function reviewerAttestationCap(level) {
  switch (level) {
    case 'R0':
      return 'INCONCLUSIVE';
    case 'R1':
      return 'PASS_WITH_LIMITS';
    case 'R2':
    case 'R3':
      return 'PASS';
    default:
      return 'FAIL';
  }
}

function producerRunId(claim) {
  return claim?.producer?.runId ?? claim?.actor?.runId ?? claim?.runId ?? null;
}

export function validateReviewerAttestation(contract, claim, attestation) {
  const errors = [];
  if (!isRecord(attestation)) {
    return {
      ok: false,
      errors: [issue(
        'REVIEWER_ATTESTATION_REQUIRED',
        'reviewerAttestation',
        'Reviewer attestation is required.',
      )],
      cap: 'FAIL',
    };
  }

  if (!REVIEW_LEVEL_SET.has(attestation.level)) {
    errors.push(issue(
      'REVIEWER_ATTESTATION_LEVEL',
      'reviewerAttestation.level',
      'Reviewer level must be R0, R1, R2, or R3.',
    ));
  }
  if (!['procedural-attestation', 'cryptographic-attestation'].includes(attestation.method)) {
    errors.push(issue(
      'REVIEWER_ATTESTATION_METHOD',
      'reviewerAttestation.method',
      'Reviewer attestation method must be procedural-attestation or cryptographic-attestation.',
    ));
  }
  if (
    attestation.method === 'cryptographic-attestation'
    && !nonEmptyString(attestation.signature)
  ) {
    errors.push(issue(
      'REVIEWER_ATTESTATION_SIGNATURE',
      'reviewerAttestation.signature',
      'Cryptographic reviewer attestation requires a signature.',
    ));
  }

  const claimantRunId = producerRunId(claim);
  if (!nonEmptyString(attestation.sessionId)) {
    errors.push(issue(
      'REVIEWER_ATTESTATION_SESSION',
      'reviewerAttestation.sessionId',
      'Reviewer sessionId is required.',
    ));
  }
  if (!nonEmptyString(attestation.claimantRunId)) {
    errors.push(issue(
      'REVIEWER_ATTESTATION_CLAIMANT',
      'reviewerAttestation.claimantRunId',
      'claimantRunId is required.',
    ));
  } else if (claimantRunId && attestation.claimantRunId !== claimantRunId) {
    errors.push(issue(
      'REVIEWER_ATTESTATION_CLAIMANT',
      'reviewerAttestation.claimantRunId',
      'claimantRunId does not match the claim producer.',
    ));
  }
  if (claimantRunId && attestation.sessionId === claimantRunId) {
    errors.push(issue(
      'NOT_INDEPENDENT',
      'reviewerAttestation.sessionId',
      'Reviewer sessionId must differ from the claimant run ID.',
    ));
  }

  const level = attestation.level;
  if (reviewLevelRank(level) >= reviewLevelRank('R1')
      && attestation.independentEvidenceCollected !== true) {
    errors.push(issue(
      'REVIEWER_ATTESTATION_EVIDENCE',
      'reviewerAttestation.independentEvidenceCollected',
      'R1 and higher require independently collected or reopened evidence.',
    ));
  }
  if (reviewLevelRank(level) >= reviewLevelRank('R2')
      && attestation.reconstructedBeforeReadingClaim !== true) {
    errors.push(issue(
      'REVIEWER_ATTESTATION_RECONSTRUCTION',
      'reviewerAttestation.reconstructedBeforeReadingClaim',
      'R2 and higher require reconstruction before reading the producer claim narrative.',
    ));
  }
  if (level === 'R3' && attestation.adversarialEvidenceCollected !== true) {
    errors.push(issue(
      'REVIEWER_ATTESTATION_ADVERSARIAL',
      'reviewerAttestation.adversarialEvidenceCollected',
      'R3 requires adversarial tests, counterexamples, or failure injection.',
    ));
  }

  const requiredLevel = contract?.reviewPolicy?.minimumIndependence;
  if (
    REVIEW_LEVEL_SET.has(level)
    && REVIEW_LEVEL_SET.has(requiredLevel)
    && reviewLevelRank(level) < reviewLevelRank(requiredLevel)
  ) {
    errors.push(issue(
      'REVIEW_INDEPENDENCE_INSUFFICIENT',
      'reviewerAttestation.level',
      `Contract requires ${requiredLevel}, but reviewer attested only ${level}.`,
    ));
  }

  return {
    ok: errors.length === 0,
    errors,
    cap: errors.length === 0 ? reviewerAttestationCap(level) : 'INCONCLUSIVE',
  };
}

export function validateReviewContractBinding(contract, claim, review) {
  const errors = [];
  const claimBinding = validateClaimContractBinding(contract, claim);
  errors.push(...claimBinding.errors);

  if (!isRecord(review)) {
    return {
      ok: false,
      errors: [...errors, issue('REVIEW_TYPE', '', 'Review must be a JSON object.')],
    };
  }

  const reviewReference = validateContractReference(
    contract,
    review.contractRef,
    'review.contractRef',
  );
  errors.push(...reviewReference.errors);

  if (
    isRecord(claim?.contractRef)
    && isRecord(review?.contractRef)
    && (
      claim.contractRef.contractId !== review.contractRef.contractId
      || claim.contractRef.contractDigest !== review.contractRef.contractDigest
      || claim.contractRef.authorityReceiptDigest
        !== review.contractRef.authorityReceiptDigest
    )
  ) {
    errors.push(issue(
      'CONTRACT_MISMATCH',
      'review.contractRef',
      'Claim and review do not reference the same frozen contract.',
    ));
  }

  const attestation = validateReviewerAttestation(
    contract,
    claim,
    review.reviewerAttestation,
  );
  errors.push(...attestation.errors);

  return {
    ok: errors.length === 0,
    errors,
    contractValidation: reviewReference.contractValidation,
    reviewerAttestation: attestation,
  };
}

export function verifyRepositoryContractSource({
  contract,
  sourceContent,
  sourceRevision,
  implementationBaseRevision,
  changedPaths = [],
  sourceIsSymlink = false,
  isAncestor = () => false,
}) {
  const errors = [];
  const validation = validateTaskContract(contract);
  if (!validation.ok) {
    errors.push(issue(
      'INVALID_TASK_CONTRACT',
      '',
      'Cannot verify the source of an invalid task contract.',
      validation.errors,
    ));
    return { ok: false, errors, contractValidation: validation };
  }

  if (contract.source.type !== 'repository-file') {
    errors.push(issue(
      'CONTRACT_SOURCE_NOT_REPOSITORY_FILE',
      'source.type',
      'Repository source verification applies only to repository-file contracts.',
    ));
    return { ok: false, errors, contractValidation: validation };
  }

  if (sourceIsSymlink) {
    errors.push(issue(
      'CONTRACT_SOURCE_SYMLINK',
      'source.locator',
      'Contract source must not be a symbolic link.',
    ));
  }

  if (sha256(sourceContent) !== contract.source.sha256.toLowerCase()) {
    errors.push(issue(
      'CONTRACT_SOURCE_DIGEST_MISMATCH',
      'source.sha256',
      'Observed contract source content does not match source.sha256.',
    ));
  }

  if (sourceRevision !== contract.source.revision) {
    errors.push(issue(
      'CONTRACT_SOURCE_REVISION_MISMATCH',
      'source.revision',
      'Observed source revision does not match the contract source revision.',
    ));
  }

  const base = implementationBaseRevision ?? contract.scope.baseRevision;
  let ancestor = sourceRevision === base;
  if (!ancestor) {
    try {
      ancestor = isAncestor(sourceRevision, base) === true;
    } catch {
      ancestor = false;
    }
  }
  if (!ancestor) {
    errors.push(issue(
      'CONTRACT_REVISION_NOT_ANCESTOR',
      'source.revision',
      'Contract source revision must equal or be an ancestor of the implementation base.',
      { sourceRevision, implementationBaseRevision: base },
    ));
  }

  const normalizedLocator = path.posix.normalize(contract.source.locator.replaceAll('\\', '/'));
  const normalizedChangedPaths = sortedUniqueStrings(changedPaths)
    .map((value) => path.posix.normalize(value.replaceAll('\\', '/')));
  if (normalizedChangedPaths.includes(normalizedLocator)) {
    errors.push(issue(
      'CONTRACT_CHANGED_IN_IMPLEMENTATION_SCOPE',
      'source.locator',
      'The authoritative contract source changed inside the implementation scope.',
      { locator: normalizedLocator },
    ));
  }

  return {
    ok: errors.length === 0,
    errors,
    contractValidation: validation,
    authorityReceiptDigest: validation.authorityReceiptDigest,
    sourceReceiptDigest: errors.length === 0
      ? sha256(stableStringifyContract({
          contractId: contract.contractId,
          source: contract.source,
          implementationBaseRevision: base,
        }))
      : null,
  };
}

function minimumGate(values) {
  let selected = 'PASS';
  for (const value of values) {
    if (!GATE_SET.has(value)) throw new TypeError(`Unsupported gate value: ${value}`);
    if (GATE_RANK.get(value) < GATE_RANK.get(selected)) selected = value;
  }
  return selected;
}

export function computeContractBoundGate({
  evidenceGate,
  contract,
  reviewerAttestation,
  claim,
  lifecycleGate = 'PASS',
}) {
  if (!GATE_SET.has(evidenceGate)) {
    throw new TypeError(`Unsupported evidence gate: ${evidenceGate}`);
  }
  if (!GATE_SET.has(lifecycleGate)) {
    throw new TypeError(`Unsupported lifecycle gate: ${lifecycleGate}`);
  }

  const contractValidation = validateTaskContract(contract);
  if (!contractValidation.ok) {
    return {
      gate: 'FAIL',
      evidenceGate,
      contractAuthorityCap: 'FAIL',
      reviewerIndependenceCap: 'FAIL',
      lifecycleGate,
      errors: contractValidation.errors,
    };
  }

  const attestation = validateReviewerAttestation(
    contract,
    claim,
    reviewerAttestation,
  );
  const gate = minimumGate([
    evidenceGate,
    contractValidation.authorityCap,
    attestation.cap,
    lifecycleGate,
  ]);

  return {
    gate,
    evidenceGate,
    contractAuthorityCap: contractValidation.authorityCap,
    reviewerIndependenceCap: attestation.cap,
    lifecycleGate,
    errors: attestation.errors,
    contractDigest: contractValidation.digest,
    authorityReceiptDigest: contractValidation.authorityReceiptDigest,
  };
}
