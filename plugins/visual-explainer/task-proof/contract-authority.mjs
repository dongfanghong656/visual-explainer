import { createHash } from 'node:crypto';

export const TASK_CONTRACT_VERSION = '2.3.0';
export const AUTHORITY_RECEIPT_VERSION = '1.2.0';
export const MAX_CONTRACT_SOURCE_BYTES = 4 * 1024 * 1024;

const CONTRACT_KIND = 'task-contract';
const RECEIPT_KIND = 'task-contract-authority-receipt';
const GATES = ['FAIL', 'STALE', 'INCONCLUSIVE', 'PASS_WITH_LIMITS', 'PASS'];
const REVIEW_LEVELS = ['R0', 'R1', 'R2', 'R3'];
const AUTHORITY_LEVELS = new Set([
  'claimant_provisional',
  'user_attested',
  'project_approved',
  'issue_locked',
  'release_policy',
]);
const AUTHORITY_METHODS = new Set([
  'procedural_attestation',
  'repository_source',
  'host_message_attestation',
  'github_issue_live',
  'release_registry_live',
  'cryptographic_signature',
]);
const SOURCE_TYPES = new Set([
  'repository_file',
  'user_message',
  'github_issue',
  'release_policy',
]);
const CRITICALITIES = new Set(['blocking', 'non_blocking', 'advisory']);
const REQUIREMENT_DISPOSITIONS = new Set([
  'covered',
  'explicitly_excluded',
  'deferred_with_authority',
  'superseded',
]);
const LIFECYCLE_STATUSES = new Set(['active', 'superseded', 'revoked']);
const ID_PATTERN = /^[A-Z][A-Z0-9._:-]{1,127}$/;
const SHA256_PATTERN = /^(?:sha256:)?[0-9a-f]{64}$/;
const GIT_OID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const NAMED_CHECK_PATTERN = /^named-check:([A-Za-z0-9._-]{1,128})$/;
const ALLOWED_CONTRACT_KEYS = new Set([
  'schemaVersion',
  'kind',
  'contractId',
  'taskId',
  'repository',
  'authority',
  'sources',
  'scope',
  'requirements',
  'criteria',
  'evidencePolicies',
  'reviewPolicy',
  'lifecycle',
  'amendment',
]);

const VERIFIED_AUTHORITY = Symbol('verified-task-contract-authority');

export class ContractAuthorityError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ContractAuthorityError';
    this.code = code;
    this.details = details;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function asNonEmptyString(value, path, maxLength = 4096) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ContractAuthorityError('CONTRACT_FIELD', `${path} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new ContractAuthorityError('CONTRACT_FIELD_SIZE', `${path} exceeds ${maxLength} characters.`);
  }
  return value;
}

function asOptionalString(value, path, maxLength = 4096) {
  if (value === undefined || value === null) return null;
  return asNonEmptyString(value, path, maxLength);
}

function asId(value, path) {
  const result = asNonEmptyString(value, path, 128);
  if (!ID_PATTERN.test(result)) {
    throw new ContractAuthorityError('CONTRACT_ID', `${path} is not a stable ASCII identifier.`);
  }
  return result;
}

function asIsoTimestamp(value, path) {
  const result = asNonEmptyString(value, path, 64);
  const parsed = Date.parse(result);
  if (!Number.isFinite(parsed)) {
    throw new ContractAuthorityError('CONTRACT_TIME', `${path} must be an ISO-8601 timestamp.`);
  }
  return new Date(parsed).toISOString();
}

function timestampMs(value, path) {
  return Date.parse(asIsoTimestamp(value, path));
}

function asGitOid(value, path) {
  const result = asNonEmptyString(value, path, 64).toLowerCase();
  if (!GIT_OID_PATTERN.test(result)) {
    throw new ContractAuthorityError('CONTRACT_GIT_OID', `${path} must be a full 40- or 64-hex Git object ID.`);
  }
  return result;
}

function asSha256(value, path, { prefixed = false } = {}) {
  const result = asNonEmptyString(value, path, 71).toLowerCase();
  if (!SHA256_PATTERN.test(result)) {
    throw new ContractAuthorityError('CONTRACT_SHA256', `${path} must be a SHA-256 digest.`);
  }
  const bare = result.replace(/^sha256:/, '');
  return prefixed ? `sha256:${bare}` : bare;
}

function asInteger(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ContractAuthorityError('CONTRACT_INTEGER', `${path} must be an integer in [${min}, ${max}].`);
  }
  return value;
}

function assertAllowedKeys(value, allowed, path) {
  if (!isRecord(value)) {
    throw new ContractAuthorityError('CONTRACT_OBJECT', `${path} must be an object.`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new ContractAuthorityError('CONTRACT_UNKNOWN_FIELD', `${path} contains unknown fields: ${unknown.join(', ')}`);
  }
}

function uniqueStrings(value, path, { minItems = 0, maxItems = 256, sort = true } = {}) {
  if (!Array.isArray(value)) {
    throw new ContractAuthorityError('CONTRACT_ARRAY', `${path} must be an array.`);
  }
  if (value.length < minItems || value.length > maxItems) {
    throw new ContractAuthorityError('CONTRACT_ARRAY_SIZE', `${path} must contain ${minItems}-${maxItems} items.`);
  }
  const result = value.map((item, index) => asNonEmptyString(item, `${path}[${index}]`, 1024));
  if (new Set(result).size !== result.length) {
    throw new ContractAuthorityError('CONTRACT_DUPLICATE_VALUE', `${path} contains duplicate values.`);
  }
  return sort ? result.sort(compareCodeUnits) : result;
}

function uniqueIds(items, path, key = 'id') {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const id = asId(item?.[key], `${path}[${index}].${key}`);
    if (seen.has(id)) {
      throw new ContractAuthorityError('CONTRACT_DUPLICATE_ID', `${path} contains duplicate ${key}: ${id}`);
    }
    seen.add(id);
  }
  return seen;
}

function normalizeRepositoryPath(value, path) {
  let result = asNonEmptyString(value, path, 2048).replaceAll('\\', '/');
  if (/^[A-Za-z]:\//.test(result) || result.startsWith('/') || result.startsWith('//')) {
    throw new ContractAuthorityError('CONTRACT_SOURCE_PATH', `${path} must be repository-relative.`);
  }
  const segments = result.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new ContractAuthorityError('CONTRACT_SOURCE_PATH', `${path} contains an unsafe path segment.`);
  }
  if (segments[0].toLowerCase() === '.git') {
    throw new ContractAuthorityError('CONTRACT_SOURCE_PATH', `${path} must not target .git metadata.`);
  }
  result = segments.join('/');
  return result;
}

function normalizeStringArray(value, path, options = {}) {
  return uniqueStrings(value ?? [], path, options);
}

function normalizeAuthority(value) {
  const allowed = new Set([
    'level', 'issuerRole', 'issuerRunId', 'method', 'issuedAt', 'signature', 'keyId', 'limitations',
  ]);
  assertAllowedKeys(value, allowed, 'authority');
  const level = asNonEmptyString(value.level, 'authority.level', 64);
  if (!AUTHORITY_LEVELS.has(level)) {
    throw new ContractAuthorityError('CONTRACT_AUTHORITY_LEVEL', `Unsupported authority level: ${level}`);
  }
  const method = asNonEmptyString(value.method, 'authority.method', 64);
  if (!AUTHORITY_METHODS.has(method)) {
    throw new ContractAuthorityError('CONTRACT_AUTHORITY_METHOD', `Unsupported authority method: ${method}`);
  }
  const signature = asOptionalString(value.signature, 'authority.signature', 16384);
  const keyId = asOptionalString(value.keyId, 'authority.keyId', 512);
  if (method === 'cryptographic_signature' && (!signature || !keyId)) {
    throw new ContractAuthorityError('CONTRACT_AUTHORITY_SIGNATURE', 'Cryptographic authority requires signature and keyId.');
  }
  return {
    level,
    issuerRole: asNonEmptyString(value.issuerRole, 'authority.issuerRole', 128),
    issuerRunId: asNonEmptyString(value.issuerRunId, 'authority.issuerRunId', 256),
    method,
    issuedAt: asIsoTimestamp(value.issuedAt, 'authority.issuedAt'),
    signature,
    keyId,
    limitations: normalizeStringArray(value.limitations, 'authority.limitations'),
  };
}

function normalizeSource(value, index) {
  const path = `sources[${index}]`;
  const allowed = new Set([
    'sourceId', 'type', 'locator', 'revision', 'sha256', 'precedence', 'description', 'assurance',
  ]);
  assertAllowedKeys(value, allowed, path);
  const type = asNonEmptyString(value.type, `${path}.type`, 64);
  if (!SOURCE_TYPES.has(type)) {
    throw new ContractAuthorityError('CONTRACT_SOURCE_TYPE', `${path}.type is unsupported: ${type}`);
  }
  let locator = asNonEmptyString(value.locator, `${path}.locator`, 2048);
  let revision = asOptionalString(value.revision, `${path}.revision`, 128);
  let digest = value.sha256 === undefined ? null : asSha256(value.sha256, `${path}.sha256`);
  if (type === 'repository_file') {
    locator = normalizeRepositoryPath(locator, `${path}.locator`);
    revision = asGitOid(revision, `${path}.revision`);
    digest = asSha256(digest, `${path}.sha256`);
  }
  return {
    sourceId: asId(value.sourceId, `${path}.sourceId`),
    type,
    locator,
    revision,
    sha256: digest,
    precedence: asInteger(value.precedence, `${path}.precedence`, { min: 0, max: 10_000 }),
    description: asOptionalString(value.description, `${path}.description`, 4096),
    assurance: asOptionalString(value.assurance, `${path}.assurance`, 128),
  };
}

function normalizeScope(value) {
  const allowed = new Set([
    'baseRevision', 'includedOutcomes', 'excludedOutcomes', 'includedPaths', 'excludedPaths',
  ]);
  assertAllowedKeys(value, allowed, 'scope');
  return {
    baseRevision: asGitOid(value.baseRevision, 'scope.baseRevision'),
    includedOutcomes: normalizeStringArray(value.includedOutcomes, 'scope.includedOutcomes', { minItems: 1 }),
    excludedOutcomes: normalizeStringArray(value.excludedOutcomes, 'scope.excludedOutcomes'),
    includedPaths: normalizeStringArray(value.includedPaths, 'scope.includedPaths').map((item, index) =>
      normalizeRepositoryPath(item, `scope.includedPaths[${index}]`)),
    excludedPaths: normalizeStringArray(value.excludedPaths, 'scope.excludedPaths').map((item, index) =>
      normalizeRepositoryPath(item, `scope.excludedPaths[${index}]`)),
  };
}

function normalizeCriterion(value, index) {
  const path = `criteria[${index}]`;
  const allowed = new Set([
    'id', 'statement', 'criticality', 'requiredEvidenceKinds', 'requiredEvidenceLocators',
    'sourceRequirementRefs', 'environment', 'limitations',
  ]);
  assertAllowedKeys(value, allowed, path);
  const criticality = asNonEmptyString(value.criticality, `${path}.criticality`, 64);
  if (!CRITICALITIES.has(criticality)) {
    throw new ContractAuthorityError('CONTRACT_CRITICALITY', `${path}.criticality is unsupported.`);
  }
  const requiredEvidenceKinds = normalizeStringArray(
    value.requiredEvidenceKinds,
    `${path}.requiredEvidenceKinds`,
    { minItems: criticality === 'blocking' ? 1 : 0 },
  );
  const requiredEvidenceLocators = normalizeStringArray(
    value.requiredEvidenceLocators,
    `${path}.requiredEvidenceLocators`,
    { minItems: criticality === 'blocking' ? 1 : 0 },
  );
  return {
    id: asId(value.id, `${path}.id`),
    statement: asNonEmptyString(value.statement, `${path}.statement`, 8192),
    criticality,
    requiredEvidenceKinds,
    requiredEvidenceLocators,
    sourceRequirementRefs: normalizeStringArray(value.sourceRequirementRefs, `${path}.sourceRequirementRefs`, { minItems: 1 }),
    environment: asOptionalString(value.environment, `${path}.environment`, 2048),
    limitations: normalizeStringArray(value.limitations, `${path}.limitations`),
  };
}

function normalizeRequirement(value, index) {
  const path = `requirements[${index}]`;
  const allowed = new Set([
    'requirementId', 'sourceId', 'statement', 'disposition', 'criterionIds', 'authorityReason',
  ]);
  assertAllowedKeys(value, allowed, path);
  const disposition = asNonEmptyString(value.disposition, `${path}.disposition`, 64);
  if (!REQUIREMENT_DISPOSITIONS.has(disposition)) {
    throw new ContractAuthorityError('CONTRACT_REQUIREMENT_DISPOSITION', `${path}.disposition is unsupported.`);
  }
  const criterionIds = normalizeStringArray(value.criterionIds, `${path}.criterionIds`, {
    minItems: disposition === 'covered' ? 1 : 0,
  }).map((item, itemIndex) => asId(item, `${path}.criterionIds[${itemIndex}]`));
  const authorityReason = asOptionalString(value.authorityReason, `${path}.authorityReason`, 8192);
  if (disposition !== 'covered' && !authorityReason) {
    throw new ContractAuthorityError('CONTRACT_REQUIREMENT_REASON', `${path}.authorityReason is required for ${disposition}.`);
  }
  return {
    requirementId: asId(value.requirementId, `${path}.requirementId`),
    sourceId: asId(value.sourceId, `${path}.sourceId`),
    statement: asNonEmptyString(value.statement, `${path}.statement`, 8192),
    disposition,
    criterionIds,
    authorityReason,
  };
}

function normalizeNamedCheckPolicy(value, index) {
  const path = `evidencePolicies.namedChecks[${index}]`;
  const allowed = new Set([
    'id', 'policyDigest', 'evidenceKind', 'executableDigest', 'argsDigest', 'workingDirectory',
  ]);
  assertAllowedKeys(value, allowed, path);
  return {
    id: asNonEmptyString(value.id, `${path}.id`, 128),
    policyDigest: asSha256(value.policyDigest, `${path}.policyDigest`, { prefixed: true }),
    evidenceKind: asNonEmptyString(value.evidenceKind, `${path}.evidenceKind`, 128),
    executableDigest: asSha256(value.executableDigest, `${path}.executableDigest`, { prefixed: true }),
    argsDigest: asSha256(value.argsDigest, `${path}.argsDigest`, { prefixed: true }),
    workingDirectory: normalizeRepositoryPath(value.workingDirectory, `${path}.workingDirectory`),
  };
}

function normalizeEvidencePolicies(value) {
  if (value === undefined || value === null) return { namedChecks: [] };
  const allowed = new Set(['namedChecks']);
  assertAllowedKeys(value, allowed, 'evidencePolicies');
  if (!Array.isArray(value.namedChecks ?? [])) {
    throw new ContractAuthorityError('CONTRACT_ARRAY', 'evidencePolicies.namedChecks must be an array.');
  }
  const namedChecks = (value.namedChecks ?? []).map(normalizeNamedCheckPolicy);
  uniqueIds(namedChecks, 'evidencePolicies.namedChecks');
  return { namedChecks: namedChecks.sort((a, b) => compareCodeUnits(a.id, b.id)) };
}

function normalizeReviewPolicy(value) {
  const allowed = new Set([
    'minimumIndependence', 'allBlockingCriteriaRequired', 'allowClaimantProvisionalContract',
  ]);
  assertAllowedKeys(value, allowed, 'reviewPolicy');
  const minimumIndependence = asNonEmptyString(value.minimumIndependence, 'reviewPolicy.minimumIndependence', 8);
  if (!REVIEW_LEVELS.includes(minimumIndependence)) {
    throw new ContractAuthorityError('CONTRACT_REVIEW_LEVEL', 'reviewPolicy.minimumIndependence must be R0-R3.');
  }
  if (typeof value.allBlockingCriteriaRequired !== 'boolean'
    || typeof value.allowClaimantProvisionalContract !== 'boolean') {
    throw new ContractAuthorityError('CONTRACT_BOOLEAN', 'reviewPolicy boolean fields are required.');
  }
  return {
    minimumIndependence,
    allBlockingCriteriaRequired: value.allBlockingCriteriaRequired,
    allowClaimantProvisionalContract: value.allowClaimantProvisionalContract,
  };
}

function normalizeLifecycle(value) {
  const allowed = new Set([
    'status', 'supersededByContractId', 'supersededByContractDigest', 'revokedReason',
  ]);
  assertAllowedKeys(value, allowed, 'lifecycle');
  const status = asNonEmptyString(value.status, 'lifecycle.status', 32);
  if (!LIFECYCLE_STATUSES.has(status)) {
    throw new ContractAuthorityError('CONTRACT_LIFECYCLE', `Unsupported lifecycle status: ${status}`);
  }
  const supersededByContractId = value.supersededByContractId === undefined
    ? null : asId(value.supersededByContractId, 'lifecycle.supersededByContractId');
  const supersededByContractDigest = value.supersededByContractDigest === undefined
    ? null : asSha256(value.supersededByContractDigest, 'lifecycle.supersededByContractDigest', { prefixed: true });
  const revokedReason = asOptionalString(value.revokedReason, 'lifecycle.revokedReason', 8192);
  if (status === 'superseded' && (!supersededByContractId || !supersededByContractDigest)) {
    throw new ContractAuthorityError('CONTRACT_LIFECYCLE', 'Superseded contracts require replacement ID and digest.');
  }
  if (status === 'revoked' && !revokedReason) {
    throw new ContractAuthorityError('CONTRACT_LIFECYCLE', 'Revoked contracts require revokedReason.');
  }
  return { status, supersededByContractId, supersededByContractDigest, revokedReason };
}

function normalizeAmendment(value) {
  if (value === undefined || value === null) return null;
  const allowed = new Set([
    'previousContractId', 'previousContractDigest', 'reason', 'authorizedByReceiptDigest', 'effectiveAtRevision',
  ]);
  assertAllowedKeys(value, allowed, 'amendment');
  return {
    previousContractId: asId(value.previousContractId, 'amendment.previousContractId'),
    previousContractDigest: asSha256(value.previousContractDigest, 'amendment.previousContractDigest', { prefixed: true }),
    reason: asNonEmptyString(value.reason, 'amendment.reason', 8192),
    authorizedByReceiptDigest: asSha256(value.authorizedByReceiptDigest, 'amendment.authorizedByReceiptDigest', { prefixed: true }),
    effectiveAtRevision: asGitOid(value.effectiveAtRevision, 'amendment.effectiveAtRevision'),
  };
}

export function normalizeTaskContract(input) {
  assertAllowedKeys(input, ALLOWED_CONTRACT_KEYS, 'contract');
  if (input.schemaVersion !== TASK_CONTRACT_VERSION || input.kind !== CONTRACT_KIND) {
    throw new ContractAuthorityError('CONTRACT_VERSION', `Expected ${CONTRACT_KIND} ${TASK_CONTRACT_VERSION}.`);
  }
  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 64) {
    throw new ContractAuthorityError('CONTRACT_SOURCES', 'Contract requires 1-64 sources.');
  }
  if (!Array.isArray(input.requirements) || input.requirements.length < 1 || input.requirements.length > 256) {
    throw new ContractAuthorityError('CONTRACT_REQUIREMENTS', 'Contract requires 1-256 source requirements.');
  }
  if (!Array.isArray(input.criteria) || input.criteria.length < 1 || input.criteria.length > 128) {
    throw new ContractAuthorityError('CONTRACT_CRITERIA', 'Contract requires 1-128 criteria.');
  }

  const sources = input.sources.map(normalizeSource);
  const requirements = input.requirements.map(normalizeRequirement);
  const criteria = input.criteria.map(normalizeCriterion);
  uniqueIds(sources, 'sources', 'sourceId');
  uniqueIds(requirements, 'requirements', 'requirementId');
  uniqueIds(criteria, 'criteria');

  const sourceIds = new Set(sources.map((item) => item.sourceId));
  const requirementIds = new Set(requirements.map((item) => item.requirementId));
  const criterionIds = new Set(criteria.map((item) => item.id));

  for (const requirement of requirements) {
    if (!sourceIds.has(requirement.sourceId)) {
      throw new ContractAuthorityError('CONTRACT_SOURCE_REFERENCE', `Requirement ${requirement.requirementId} references unknown source ${requirement.sourceId}.`);
    }
    for (const criterionId of requirement.criterionIds) {
      if (!criterionIds.has(criterionId)) {
        throw new ContractAuthorityError('CONTRACT_CRITERION_REFERENCE', `Requirement ${requirement.requirementId} references unknown criterion ${criterionId}.`);
      }
    }
  }
  for (const criterion of criteria) {
    for (const requirementId of criterion.sourceRequirementRefs) {
      if (!requirementIds.has(requirementId)) {
        throw new ContractAuthorityError('CONTRACT_REQUIREMENT_REFERENCE', `Criterion ${criterion.id} references unknown requirement ${requirementId}.`);
      }
    }
  }
  if (!criteria.some((item) => item.criticality === 'blocking')) {
    throw new ContractAuthorityError('CONTRACT_BLOCKING_CRITERION', 'Contract requires at least one blocking criterion.');
  }

  const evidencePolicies = normalizeEvidencePolicies(input.evidencePolicies);
  const policyById = new Map(evidencePolicies.namedChecks.map((item) => [item.id, item]));
  for (const criterion of criteria) {
    for (const locator of criterion.requiredEvidenceLocators) {
      const match = NAMED_CHECK_PATTERN.exec(locator);
      if (match && !policyById.has(match[1])) {
        throw new ContractAuthorityError('CONTRACT_NAMED_CHECK_POLICY', `Criterion ${criterion.id} requires ${locator} without a frozen policy.`);
      }
    }
  }

  return {
    schemaVersion: TASK_CONTRACT_VERSION,
    kind: CONTRACT_KIND,
    contractId: asId(input.contractId, 'contractId'),
    taskId: asId(input.taskId, 'taskId'),
    repository: asNonEmptyString(input.repository, 'repository', 512),
    authority: normalizeAuthority(input.authority),
    sources: sources.sort((a, b) => compareCodeUnits(a.sourceId, b.sourceId)),
    scope: normalizeScope(input.scope),
    requirements: requirements.sort((a, b) => compareCodeUnits(a.requirementId, b.requirementId)),
    criteria: criteria.sort((a, b) => compareCodeUnits(a.id, b.id)),
    evidencePolicies,
    reviewPolicy: normalizeReviewPolicy(input.reviewPolicy),
    lifecycle: normalizeLifecycle(input.lifecycle),
    amendment: normalizeAmendment(input.amendment),
  };
}

function canonicalize(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new ContractAuthorityError('CONTRACT_NUMBER', 'Canonical contracts permit safe integers only.');
    }
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item, seen)).join(',')}]`;
  if (!isRecord(value)) throw new ContractAuthorityError('CONTRACT_JSON', 'Contract contains a non-JSON value.');
  if (seen.has(value)) throw new ContractAuthorityError('CONTRACT_CYCLE', 'Contract contains a cyclic reference.');
  seen.add(value);
  const result = `{${Object.keys(value).sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(',')}}`;
  seen.delete(value);
  return result;
}

export function canonicalTaskContract(contract) {
  return canonicalize(normalizeTaskContract(contract));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function digestTaskContract(contract) {
  return `sha256:${sha256(canonicalTaskContract(contract))}`;
}

export function digestAuthorityDeclaration(contract) {
  const normalized = normalizeTaskContract(contract);
  return `sha256:${sha256(canonicalize(normalized.authority))}`;
}

export function digestJson(value) {
  return `sha256:${sha256(canonicalize(value))}`;
}

function normalizeCriterionSnapshot(value, path = 'contractCriterionSnapshot') {
  if (!Array.isArray(value)) {
    throw new ContractAuthorityError('CONTRACT_CRITERION_SET_MISMATCH', `${path} must be an array.`);
  }
  const normalized = value.map((item, index) => normalizeCriterion(item, index));
  uniqueIds(normalized, path);
  return normalized.sort((a, b) => compareCodeUnits(a.id, b.id));
}

function normalizeClaimRepository(claim) {
  const repository = claim?.repository;
  if (!isRecord(repository)) {
    throw new ContractAuthorityError('CONTRACT_CLAIM_REPOSITORY', 'claim.repository is required.');
  }
  return {
    identity: asNonEmptyString(repository.identity, 'claim.repository.identity', 512),
    baseSha: asGitOid(repository.baseSha, 'claim.repository.baseSha'),
    headSha: asGitOid(repository.headSha, 'claim.repository.headSha'),
  };
}

export function validateClaimContractBinding(contract, claim) {
  const normalized = normalizeTaskContract(contract);
  if (!isRecord(claim)) throw new ContractAuthorityError('CONTRACT_CLAIM', 'Claim must be an object.');
  const ref = claim.contractRef;
  if (!isRecord(ref)) throw new ContractAuthorityError('CONTRACT_REF_REQUIRED', 'Claim requires contractRef.');
  const expectedDigest = digestTaskContract(normalized);
  const expectedAuthorityDigest = digestAuthorityDeclaration(normalized);
  const errors = [];
  if (ref.contractId !== normalized.contractId) errors.push('CONTRACT_ID_MISMATCH');
  if (ref.contractDigest !== expectedDigest) errors.push('CONTRACT_DIGEST_MISMATCH');
  if (ref.authorityDeclarationDigest !== expectedAuthorityDigest) errors.push('CONTRACT_AUTHORITY_DIGEST_MISMATCH');
  if (claim.taskId !== normalized.taskId) errors.push('CONTRACT_TASK_MISMATCH');
  const repository = normalizeClaimRepository(claim);
  if (repository.identity !== normalized.repository) errors.push('CONTRACT_REPOSITORY_MISMATCH');
  if (repository.baseSha !== normalized.scope.baseRevision) errors.push('CONTRACT_BASE_MISMATCH');
  if (timestampMs(claim.generatedAt, 'claim.generatedAt') < timestampMs(normalized.authority.issuedAt, 'authority.issuedAt')) {
    errors.push('CLAIM_PREDATES_CONTRACT');
  }
  const snapshot = normalizeCriterionSnapshot(claim.contractCriterionSnapshot);
  if (canonicalize(snapshot) !== canonicalize(normalized.criteria)) errors.push('CONTRACT_CRITERION_CONTENT_MISMATCH');
  return {
    ok: errors.length === 0,
    errors,
    contractDigest: expectedDigest,
    authorityDeclarationDigest: expectedAuthorityDigest,
    repository,
  };
}

function receiptPayload(receipt) {
  const copy = { ...receipt };
  delete copy.receiptDigest;
  return copy;
}

export function createAuthorityReceipt({ contract, sourceId, claim, reviewerRunId, observedAt, method, observation }) {
  const normalized = normalizeTaskContract(contract);
  const claimBinding = validateClaimContractBinding(normalized, claim);
  if (!claimBinding.ok) {
    throw new ContractAuthorityError('CONTRACT_CLAIM_BINDING', 'Cannot issue authority receipt for an invalid claim binding.', claimBinding);
  }
  const source = normalized.sources.find((item) => item.sourceId === sourceId);
  if (!source) throw new ContractAuthorityError('CONTRACT_SOURCE_REFERENCE', `Unknown source: ${sourceId}`);
  if (!isRecord(observation)) throw new ContractAuthorityError('CONTRACT_AUTHORITY_OBSERVATION', 'Authority observation is required.');
  const receipt = {
    receiptVersion: AUTHORITY_RECEIPT_VERSION,
    kind: RECEIPT_KIND,
    contractId: normalized.contractId,
    contractDigest: digestTaskContract(normalized),
    sourceId: source.sourceId,
    sourceType: source.type,
    sourceLocator: source.locator,
    sourceRevision: source.revision,
    sourceSha256: source.sha256,
    repository: normalized.repository,
    implementationBaseRevision: normalized.scope.baseRevision,
    implementationHeadRevision: claimBinding.repository.headSha,
    producerRunId: asNonEmptyString(reviewerRunId, 'reviewerRunId', 256),
    observedAt: asIsoTimestamp(observedAt, 'observedAt'),
    method: asNonEmptyString(method, 'method', 64),
    observation: {
      sourceExistsAtBase: observation.sourceExistsAtBase === true,
      revisionIsAncestor: observation.revisionIsAncestor === true,
      sourceChangedInImplementationScope: observation.sourceChangedInImplementationScope === true,
      safeGitConfiguration: observation.safeGitConfiguration === true,
      sourceIsRegularFile: observation.sourceIsRegularFile === true,
      sourceIsSymbolicLink: observation.sourceIsSymbolicLink === true,
      sizeBytes: asInteger(observation.sizeBytes, 'observation.sizeBytes', { min: 0, max: MAX_CONTRACT_SOURCE_BYTES }),
      observedSourceSha256: asSha256(observation.observedSourceSha256, 'observation.observedSourceSha256'),
      adapterId: asNonEmptyString(observation.adapterId, 'observation.adapterId', 256),
      adapterReceiptDigest: asSha256(observation.adapterReceiptDigest, 'observation.adapterReceiptDigest', { prefixed: true }),
    },
  };
  receipt.receiptDigest = digestJson(receiptPayload(receipt));
  return receipt;
}

function allowedAuthorityMethodsForLevel(level) {
  const table = {
    claimant_provisional: new Set(['procedural_attestation']),
    user_attested: new Set(['host_message_attestation', 'cryptographic_signature']),
    project_approved: new Set(['repository_source', 'cryptographic_signature']),
    issue_locked: new Set(['github_issue_live', 'cryptographic_signature']),
    release_policy: new Set(['release_registry_live', 'repository_source', 'cryptographic_signature']),
  };
  return table[level] ?? new Set();
}

export function verifyAuthorityReceipt({ contract, claim, review, receipt, adapter }) {
  const normalized = normalizeTaskContract(contract);
  const claimBinding = validateClaimContractBinding(normalized, claim);
  const errors = [...claimBinding.errors];
  if (!isRecord(review) || !isRecord(review.reviewer)) errors.push('REVIEW_ARTIFACT_REQUIRED');
  if (!isRecord(receipt)) errors.push('CONTRACT_AUTHORITY_RECEIPT_REQUIRED');
  if (errors.length) return { ok: false, errors, cap: 'INCONCLUSIVE' };

  if (receipt.receiptVersion !== AUTHORITY_RECEIPT_VERSION || receipt.kind !== RECEIPT_KIND) errors.push('CONTRACT_AUTHORITY_RECEIPT_VERSION');
  const expectedReceiptDigest = digestJson(receiptPayload(receipt));
  if (receipt.receiptDigest !== expectedReceiptDigest) errors.push('CONTRACT_AUTHORITY_RECEIPT_DIGEST');
  if (receipt.contractId !== normalized.contractId || receipt.contractDigest !== digestTaskContract(normalized)) errors.push('CONTRACT_AUTHORITY_RECEIPT_CONTRACT');
  if (receipt.repository !== normalized.repository) errors.push('CONTRACT_AUTHORITY_RECEIPT_REPOSITORY');
  if (receipt.implementationBaseRevision !== normalized.scope.baseRevision) errors.push('CONTRACT_AUTHORITY_RECEIPT_BASE');
  if (receipt.implementationHeadRevision !== claimBinding.repository.headSha) errors.push('CONTRACT_AUTHORITY_RECEIPT_HEAD');
  if (receipt.producerRunId !== review.reviewer.runId) errors.push('CONTRACT_AUTHORITY_REVIEWER_BINDING');
  if (receipt.producerRunId === claim?.producer?.runId) errors.push('CONTRACT_AUTHORITY_CLAIMANT');
  if (!allowedAuthorityMethodsForLevel(normalized.authority.level).has(receipt.method)) errors.push('CONTRACT_AUTHORITY_METHOD_MISMATCH');
  const observedAt = timestampMs(receipt.observedAt, 'receipt.observedAt');
  const issuedAt = timestampMs(normalized.authority.issuedAt, 'authority.issuedAt');
  const reviewAt = timestampMs(review.generatedAt, 'review.generatedAt');
  if (observedAt < issuedAt) errors.push('AUTHORITY_RECEIPT_PREDATES_CONTRACT');
  if (observedAt > reviewAt) errors.push('AUTHORITY_RECEIPT_POSTDATES_REVIEW');
  if (review?.contractRef?.authorityVerificationReceiptDigest !== receipt.receiptDigest) errors.push('CONTRACT_AUTHORITY_VERIFICATION_BINDING');

  if (typeof adapter !== 'function') return { ok: false, errors: [...errors, 'CONTRACT_AUTHORITY_ADAPTER_REQUIRED'], cap: 'INCONCLUSIVE' };
  let live;
  try {
    live = adapter({ contract: normalized, claim, review, receipt });
  } catch (error) {
    return { ok: false, errors: [...errors, 'CONTRACT_AUTHORITY_ADAPTER_FAILURE'], cap: 'INCONCLUSIVE', adapterError: String(error) };
  }
  if (!isRecord(live) || live.ok !== true) errors.push('CONTRACT_AUTHORITY_ADAPTER_REJECTED');
  if (live?.adapterId !== receipt.observation?.adapterId) errors.push('CONTRACT_AUTHORITY_ADAPTER_ID');
  if (live?.adapterReceiptDigest !== receipt.observation?.adapterReceiptDigest) errors.push('CONTRACT_AUTHORITY_ADAPTER_DIGEST');
  if (receipt.observation?.sourceExistsAtBase !== true) errors.push('CONTRACT_SOURCE_NOT_AT_BASE');
  if (receipt.observation?.revisionIsAncestor !== true) errors.push('CONTRACT_REVISION_NOT_ANCESTOR');
  if (receipt.observation?.sourceChangedInImplementationScope !== false) errors.push('CONTRACT_CHANGED_IN_IMPLEMENTATION_SCOPE');
  if (receipt.observation?.safeGitConfiguration !== true) errors.push('CONTRACT_UNSAFE_GIT_CONFIGURATION');
  if (receipt.observation?.sourceIsRegularFile !== true || receipt.observation?.sourceIsSymbolicLink !== false) errors.push('CONTRACT_SOURCE_FILE_TYPE');
  if (receipt.observation?.observedSourceSha256 !== receipt.sourceSha256) errors.push('CONTRACT_SOURCE_DIGEST');

  const hardErrors = new Set([
    'CONTRACT_AUTHORITY_RECEIPT_VERSION', 'CONTRACT_AUTHORITY_RECEIPT_DIGEST',
    'CONTRACT_AUTHORITY_RECEIPT_CONTRACT', 'CONTRACT_AUTHORITY_RECEIPT_REPOSITORY',
    'CONTRACT_AUTHORITY_RECEIPT_BASE', 'CONTRACT_AUTHORITY_RECEIPT_HEAD',
    'CONTRACT_AUTHORITY_REVIEWER_BINDING', 'CONTRACT_AUTHORITY_CLAIMANT',
    'CONTRACT_AUTHORITY_METHOD_MISMATCH', 'AUTHORITY_RECEIPT_PREDATES_CONTRACT',
    'AUTHORITY_RECEIPT_POSTDATES_REVIEW', 'CONTRACT_AUTHORITY_VERIFICATION_BINDING',
    'CONTRACT_AUTHORITY_ADAPTER_ID', 'CONTRACT_AUTHORITY_ADAPTER_DIGEST',
    'CONTRACT_SOURCE_NOT_AT_BASE', 'CONTRACT_REVISION_NOT_ANCESTOR',
    'CONTRACT_CHANGED_IN_IMPLEMENTATION_SCOPE', 'CONTRACT_UNSAFE_GIT_CONFIGURATION',
    'CONTRACT_SOURCE_FILE_TYPE', 'CONTRACT_SOURCE_DIGEST',
  ]);
  const ok = errors.length === 0;
  const cap = ok ? 'PASS' : errors.some((item) => hardErrors.has(item)) ? 'FAIL' : 'INCONCLUSIVE';
  const result = { ok, errors, cap, receiptDigest: expectedReceiptDigest };
  if (ok) Object.defineProperty(result, VERIFIED_AUTHORITY, { value: true, enumerable: false });
  return result;
}

function reviewLevelCap(level) {
  if (level === 'R0') return 'INCONCLUSIVE';
  if (level === 'R1') return 'PASS_WITH_LIMITS';
  if (level === 'R2' || level === 'R3') return 'PASS';
  return 'FAIL';
}

export function validateReviewContractBinding(contract, claim, review, receipt) {
  const normalized = normalizeTaskContract(contract);
  const claimBinding = validateClaimContractBinding(normalized, claim);
  const errors = [...claimBinding.errors];
  if (!isRecord(review)) return { ok: false, errors: [...errors, 'REVIEW_ARTIFACT_REQUIRED'] };
  if (!isRecord(review.contractRef)) errors.push('CONTRACT_REVIEW_REF_REQUIRED');
  if (review.contractRef?.contractId !== normalized.contractId) errors.push('CONTRACT_REVIEW_ID_MISMATCH');
  if (review.contractRef?.contractDigest !== digestTaskContract(normalized)) errors.push('CONTRACT_REVIEW_DIGEST_MISMATCH');
  if (review.contractRef?.authorityDeclarationDigest !== digestAuthorityDeclaration(normalized)) errors.push('CONTRACT_REVIEW_AUTHORITY_DIGEST_MISMATCH');
  if (receipt && review.contractRef?.authorityVerificationReceiptDigest !== receipt.receiptDigest) errors.push('CONTRACT_AUTHORITY_VERIFICATION_BINDING');
  if (review.claimDigest !== digestJson(claim)) errors.push('CONTRACT_REVIEW_CLAIM_DIGEST');
  if (review.taskId !== normalized.taskId) errors.push('CONTRACT_REVIEW_TASK_MISMATCH');
  if (!isRecord(review.reviewer) || review.reviewer.role !== 'reviewer') errors.push('REVIEWER_ROLE');
  if (!isRecord(review.reviewerAttestation)) errors.push('REVIEWER_ATTESTATION_REQUIRED');
  const level = review.reviewerAttestation?.level;
  if (!REVIEW_LEVELS.includes(level)) errors.push('REVIEWER_LEVEL');
  if (review.reviewerAttestation?.method !== 'procedural_attestation') errors.push('REVIEWER_ATTESTATION_METHOD');
  if (review.reviewer?.runId !== review.reviewerAttestation?.sessionId) errors.push('REVIEWER_ATTESTATION_BINDING');
  if (review.reviewer?.runId === claim?.producer?.runId) errors.push('NOT_INDEPENDENT');
  if (level === 'R2' || level === 'R3') {
    if (review.reviewerAttestation?.reconstructedBeforeReadingClaim !== true) errors.push('REVIEW_RECONSTRUCTION_REQUIRED');
    if (review.reviewerAttestation?.independentEvidenceCollected !== true) errors.push('REVIEW_EVIDENCE_REQUIRED');
  }
  if (level === 'R3' && review.reviewerAttestation?.adversarialEvidenceCollected !== true) errors.push('REVIEW_ADVERSARIAL_EVIDENCE_REQUIRED');
  const requiredLevel = normalized.reviewPolicy.minimumIndependence;
  if (REVIEW_LEVELS.indexOf(level) < REVIEW_LEVELS.indexOf(requiredLevel)) errors.push('REVIEW_INDEPENDENCE_INSUFFICIENT');
  const claimAt = timestampMs(claim.generatedAt, 'claim.generatedAt');
  const reviewAt = timestampMs(review.generatedAt, 'review.generatedAt');
  if (reviewAt < claimAt) errors.push('REVIEW_PREDATES_CLAIM');
  const hardErrors = new Set([
    'CONTRACT_REVIEW_ID_MISMATCH', 'CONTRACT_REVIEW_DIGEST_MISMATCH',
    'CONTRACT_REVIEW_AUTHORITY_DIGEST_MISMATCH', 'CONTRACT_AUTHORITY_VERIFICATION_BINDING',
    'CONTRACT_REVIEW_CLAIM_DIGEST', 'CONTRACT_REVIEW_TASK_MISMATCH', 'REVIEWER_ROLE',
    'REVIEWER_ATTESTATION_BINDING', 'NOT_INDEPENDENT', 'REVIEW_PREDATES_CLAIM',
  ]);
  let cap = reviewLevelCap(level);
  if (errors.some((item) => hardErrors.has(item))) cap = 'FAIL';
  else if (errors.length) cap = minGate(cap, 'INCONCLUSIVE');
  return { ok: errors.length === 0, errors, reviewerLevel: level, cap };
}

export function validateNamedCheckReceipts(contract, evidenceReceipts = []) {
  const normalized = normalizeTaskContract(contract);
  const policies = new Map(normalized.evidencePolicies.namedChecks.map((item) => [item.id, item]));
  const errors = [];
  let missing = false;
  for (const criterion of normalized.criteria.filter((item) => item.criticality === 'blocking')) {
    for (const locator of criterion.requiredEvidenceLocators) {
      const match = NAMED_CHECK_PATTERN.exec(locator);
      if (!match) continue;
      const policy = policies.get(match[1]);
      const candidates = evidenceReceipts.filter((item) =>
        item?.locator === locator && Array.isArray(item?.supportsCriterionIds)
        && item.supportsCriterionIds.includes(criterion.id));
      if (!candidates.length) {
        missing = true;
        continue;
      }
      if (!candidates.some((item) =>
        item.policyDigest === policy.policyDigest
        && item.evidenceKind === policy.evidenceKind
        && item.executableDigest === policy.executableDigest
        && item.argsDigest === policy.argsDigest
        && item.workingDirectory === policy.workingDirectory)) {
        errors.push(`NAMED_CHECK_POLICY_MISMATCH:${criterion.id}:${locator}`);
      }
    }
  }
  if (errors.length) return { ok: false, errors, cap: 'FAIL' };
  if (missing) return { ok: false, errors: ['NAMED_CHECK_RECEIPT_MISSING'], cap: 'INCONCLUSIVE' };
  return { ok: true, errors: [], cap: 'PASS' };
}

export function sourceCoverageCap(contract) {
  const normalized = normalizeTaskContract(contract);
  let cap = 'PASS';
  for (const requirement of normalized.requirements) {
    if (requirement.disposition !== 'covered') cap = minGate(cap, 'PASS_WITH_LIMITS');
  }
  return cap;
}

export function authorityLevelCap(contract, verifiedAuthority) {
  const normalized = normalizeTaskContract(contract);
  if (normalized.authority.level === 'claimant_provisional') return 'INCONCLUSIVE';
  if (!verifiedAuthority || verifiedAuthority[VERIFIED_AUTHORITY] !== true || verifiedAuthority.ok !== true) return 'INCONCLUSIVE';
  if (normalized.authority.level === 'user_attested') return 'PASS_WITH_LIMITS';
  return 'PASS';
}

export function lifecycleCap(contract) {
  const status = normalizeTaskContract(contract).lifecycle.status;
  if (status === 'revoked') return 'FAIL';
  if (status === 'superseded') return 'STALE';
  return 'PASS';
}

export function minGate(...gates) {
  const valid = gates.map((gate) => {
    if (!GATES.includes(gate)) throw new ContractAuthorityError('CONTRACT_GATE', `Unsupported gate: ${gate}`);
    return gate;
  });
  return valid.reduce((minimum, gate) => GATES.indexOf(gate) < GATES.indexOf(minimum) ? gate : minimum, 'PASS');
}

export function computeContractBoundGate({
  contract,
  claim,
  review,
  receipt,
  authorityAdapter,
  evidenceGate,
  lifecycleGate = 'PASS',
  evidenceReceipts = [],
}) {
  const claimBinding = validateClaimContractBinding(contract, claim);
  if (!claimBinding.ok) return { gate: 'FAIL', errors: claimBinding.errors, caps: { claim: 'FAIL' } };
  if (!review) {
    return { gate: 'INCONCLUSIVE', errors: ['REVIEW_ARTIFACT_REQUIRED'], caps: { claim: 'PASS', review: 'INCONCLUSIVE' } };
  }
  const reviewBinding = validateReviewContractBinding(contract, claim, review, receipt);
  const authority = verifyAuthorityReceipt({ contract, claim, review, receipt, adapter: authorityAdapter });
  const namedChecks = validateNamedCheckReceipts(contract, evidenceReceipts);
  const caps = {
    evidence: evidenceGate,
    authority: minGate(authorityLevelCap(contract, authority), authority.cap ?? 'INCONCLUSIVE'),
    sourceCoverage: sourceCoverageCap(contract),
    reviewer: reviewBinding.cap ?? 'FAIL',
    namedChecks: namedChecks.cap,
    contractLifecycle: lifecycleCap(contract),
    artifactLifecycle: lifecycleGate,
  };
  const errors = [...reviewBinding.errors, ...authority.errors, ...namedChecks.errors];
  if (!reviewBinding.ok && caps.reviewer !== 'FAIL') caps.reviewer = minGate(caps.reviewer, 'INCONCLUSIVE');
  return { gate: minGate(...Object.values(caps)), errors, caps };
}
