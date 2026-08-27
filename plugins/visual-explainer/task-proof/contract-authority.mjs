import { createHash } from 'node:crypto';

export const TASK_CONTRACT_VERSION = '2.4.0';
export const AUTHORITY_RECEIPT_VERSION = '1.4.0';
export const EVIDENCE_ASSESSMENT_VERSION = '1.0.0';
export const NAMED_CHECK_RECEIPT_VERSION = '1.0.0';
export const LIFECYCLE_ASSESSMENT_VERSION = '1.0.0';
export const MAX_CONTRACT_SOURCE_BYTES = 4 * 1024 * 1024;

const CONTRACT_KIND = 'task-contract';
const AUTHORITY_RECEIPT_KIND = 'task-contract-authority-receipt';
const GATES = ['FAIL', 'STALE', 'INCONCLUSIVE', 'PASS_WITH_LIMITS', 'PASS'];
const REVIEW_LEVELS = ['R0', 'R1', 'R2', 'R3'];
const ALL_AUTHORITY_METHODS = [
  'procedural_attestation', 'repository_source', 'host_message_attestation',
  'github_issue_live', 'release_registry_live', 'cryptographic_signature',
];
const AUTHORITY_LEVELS = new Set([
  'claimant_provisional', 'user_attested', 'project_approved', 'issue_locked', 'release_policy',
]);
const AUTHORITY_METHODS = new Set(ALL_AUTHORITY_METHODS);
const LEVEL_METHODS = {
  claimant_provisional: new Set(ALL_AUTHORITY_METHODS),
  user_attested: new Set(['host_message_attestation', 'cryptographic_signature']),
  project_approved: new Set(['repository_source', 'cryptographic_signature']),
  issue_locked: new Set(['github_issue_live', 'cryptographic_signature']),
  release_policy: new Set(['release_registry_live', 'repository_source', 'cryptographic_signature']),
};
const SOURCE_METHODS = {
  repository_file: new Set(['repository_source', 'cryptographic_signature']),
  user_message: new Set(['host_message_attestation', 'cryptographic_signature']),
  github_issue: new Set(['github_issue_live', 'cryptographic_signature']),
  release_policy: new Set(['release_registry_live', 'repository_source', 'cryptographic_signature']),
};
const SOURCE_TYPES = new Set(Object.keys(SOURCE_METHODS));
const CRITICALITIES = new Set(['blocking', 'non_blocking', 'advisory']);
const REQUIREMENT_DISPOSITIONS = new Set([
  'covered', 'explicitly_excluded', 'deferred_with_authority', 'superseded',
]);
const LIFECYCLE_STATUSES = new Set(['active', 'superseded', 'revoked']);
const ID_PATTERN = /^[A-Z][A-Z0-9._:-]{1,127}$/;
const CHECK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^(?:sha256:)?[0-9a-f]{64}$/;
const GIT_OID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const NAMED_CHECK_PATTERN = /^named-check:([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/;
const ROOT_KEYS = new Set([
  'schemaVersion', 'kind', 'contractId', 'taskId', 'repository', 'authority', 'sources',
  'scope', 'requirements', 'criteria', 'evidencePolicies', 'reviewPolicy', 'lifecycle', 'amendment',
]);
const VERIFIED_AUTHORITY_SET = Symbol('verified-authority-set');
const VERIFIED_EVIDENCE = Symbol('verified-evidence-assessment');
const VERIFIED_NAMED_CHECKS = Symbol('verified-named-checks');
const VERIFIED_LIFECYCLE = Symbol('verified-lifecycle-assessment');

export class ContractAuthorityError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ContractAuthorityError';
    this.code = code;
    this.details = details;
  }
}

const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function text(value, path, max = 4096) {
  if (typeof value !== 'string' || value.trim() === '') throw new ContractAuthorityError('CONTRACT_FIELD', `${path} must be a non-empty string.`);
  if (value.length > max) throw new ContractAuthorityError('CONTRACT_FIELD_SIZE', `${path} exceeds ${max} characters.`);
  return value;
}
function optionalText(value, path, max = 4096) { return value == null ? null : text(value, path, max); }
function stableId(value, path) {
  const result = text(value, path, 128);
  if (!ID_PATTERN.test(result)) throw new ContractAuthorityError('CONTRACT_ID', `${path} is not a stable ASCII identifier.`);
  return result;
}
function checkId(value, path) {
  const result = text(value, path, 128);
  if (!CHECK_ID_PATTERN.test(result)) throw new ContractAuthorityError('CONTRACT_CHECK_ID', `${path} is not a valid named-check identifier.`);
  return result;
}
function iso(value, path) {
  const result = text(value, path, 64);
  const parsed = Date.parse(result);
  if (!Number.isFinite(parsed)) throw new ContractAuthorityError('CONTRACT_TIME', `${path} must be an ISO-8601 timestamp.`);
  return new Date(parsed).toISOString();
}
const time = (value, path) => Date.parse(iso(value, path));
function gitOid(value, path) {
  const result = text(value, path, 64).toLowerCase();
  if (!GIT_OID_PATTERN.test(result)) throw new ContractAuthorityError('CONTRACT_GIT_OID', `${path} must be a full 40- or 64-hex Git object ID.`);
  return result;
}
function shaDigest(value, path, prefixed = false) {
  const result = text(value, path, 71).toLowerCase();
  if (!SHA256_PATTERN.test(result)) throw new ContractAuthorityError('CONTRACT_SHA256', `${path} must be a SHA-256 digest.`);
  const bare = result.replace(/^sha256:/, '');
  return prefixed ? `sha256:${bare}` : bare;
}
function integer(value, path, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ContractAuthorityError('CONTRACT_INTEGER', `${path} must be an integer in [${min}, ${max}].`);
  return value;
}
function object(value, allowed, path) {
  if (!plain(value)) throw new ContractAuthorityError('CONTRACT_OBJECT', `${path} must be a plain JSON object.`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new ContractAuthorityError('CONTRACT_UNKNOWN_FIELD', `${path} contains unknown fields: ${unknown.join(', ')}`);
}
function stringSet(value, path, { min = 0, max = 256 } = {}) {
  if (!Array.isArray(value)) throw new ContractAuthorityError('CONTRACT_ARRAY', `${path} must be an array.`);
  if (value.length < min || value.length > max) throw new ContractAuthorityError('CONTRACT_ARRAY_SIZE', `${path} must contain ${min}-${max} items.`);
  const result = value.map((item, index) => text(item, `${path}[${index}]`, 1024));
  if (new Set(result).size !== result.length) throw new ContractAuthorityError('CONTRACT_DUPLICATE_VALUE', `${path} contains duplicate values.`);
  return result.sort(cmp);
}
function uniqueBy(items, path, key, normalize = stableId) {
  const seen = new Set();
  items.forEach((item, index) => {
    const id = normalize(item?.[key], `${path}[${index}].${key}`);
    if (seen.has(id)) throw new ContractAuthorityError('CONTRACT_DUPLICATE_ID', `${path} contains duplicate ${key}: ${id}`);
    seen.add(id);
  });
  return seen;
}
function repositoryPath(value, path) {
  const result = text(value, path, 2048).replaceAll('\\', '/');
  if (/^[A-Za-z]:\//.test(result) || result.startsWith('/') || result.startsWith('//')) throw new ContractAuthorityError('CONTRACT_SOURCE_PATH', `${path} must be repository-relative.`);
  const segments = result.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) throw new ContractAuthorityError('CONTRACT_SOURCE_PATH', `${path} contains an unsafe path segment.`);
  if (segments[0].toLowerCase() === '.git') throw new ContractAuthorityError('CONTRACT_SOURCE_PATH', `${path} must not target .git metadata.`);
  return segments.join('/');
}
function pathSet(value, path) {
  if (!Array.isArray(value ?? [])) throw new ContractAuthorityError('CONTRACT_ARRAY', `${path} must be an array.`);
  const result = (value ?? []).map((item, index) => repositoryPath(item, `${path}[${index}]`));
  if (new Set(result).size !== result.length) throw new ContractAuthorityError('CONTRACT_DUPLICATE_VALUE', `${path} contains duplicate normalized paths.`);
  return result.sort(cmp);
}

function normalizeAuthority(value) {
  object(value, new Set(['level', 'issuerRole', 'issuerRunId', 'method', 'issuedAt', 'signature', 'keyId', 'limitations']), 'authority');
  const level = text(value.level, 'authority.level', 64);
  const method = text(value.method, 'authority.method', 64);
  if (!AUTHORITY_LEVELS.has(level)) throw new ContractAuthorityError('CONTRACT_AUTHORITY_LEVEL', `Unsupported authority level: ${level}`);
  if (!AUTHORITY_METHODS.has(method)) throw new ContractAuthorityError('CONTRACT_AUTHORITY_METHOD', `Unsupported authority method: ${method}`);
  if (!LEVEL_METHODS[level].has(method)) throw new ContractAuthorityError('CONTRACT_AUTHORITY_METHOD_MISMATCH', `${method} is not valid for authority level ${level}.`);
  const signature = optionalText(value.signature, 'authority.signature', 16384);
  const keyId = optionalText(value.keyId, 'authority.keyId', 512);
  if (method === 'cryptographic_signature' && (!signature || !keyId)) throw new ContractAuthorityError('CONTRACT_AUTHORITY_SIGNATURE', 'Cryptographic authority requires signature and keyId.');
  return {
    level,
    issuerRole: text(value.issuerRole, 'authority.issuerRole', 128),
    issuerRunId: text(value.issuerRunId, 'authority.issuerRunId', 256),
    method,
    issuedAt: iso(value.issuedAt, 'authority.issuedAt'),
    signature,
    keyId,
    limitations: stringSet(value.limitations ?? [], 'authority.limitations'),
  };
}
function normalizeSource(value, index) {
  const path = `sources[${index}]`;
  object(value, new Set(['sourceId', 'type', 'locator', 'revision', 'sha256', 'precedence', 'description', 'assurance']), path);
  const type = text(value.type, `${path}.type`, 64);
  if (!SOURCE_TYPES.has(type)) throw new ContractAuthorityError('CONTRACT_SOURCE_TYPE', `${path}.type is unsupported: ${type}`);
  let locator = text(value.locator, `${path}.locator`, 2048);
  let revision = optionalText(value.revision, `${path}.revision`, 256);
  if (type === 'repository_file') {
    locator = repositoryPath(locator, `${path}.locator`);
    revision = gitOid(revision, `${path}.revision`);
  }
  return {
    sourceId: stableId(value.sourceId, `${path}.sourceId`), type, locator, revision,
    sha256: shaDigest(value.sha256, `${path}.sha256`),
    precedence: integer(value.precedence, `${path}.precedence`, 0, 10_000),
    description: optionalText(value.description, `${path}.description`, 4096),
    assurance: optionalText(value.assurance, `${path}.assurance`, 128),
  };
}
function normalizeScope(value) {
  object(value, new Set(['baseRevision', 'includedOutcomes', 'excludedOutcomes', 'includedPaths', 'excludedPaths']), 'scope');
  const includedPaths = pathSet(value.includedPaths, 'scope.includedPaths');
  const excludedPaths = pathSet(value.excludedPaths, 'scope.excludedPaths');
  const overlap = includedPaths.filter((item) => excludedPaths.includes(item));
  if (overlap.length) throw new ContractAuthorityError('CONTRACT_SCOPE_OVERLAP', `Paths are both included and excluded: ${overlap.join(', ')}`);
  return {
    baseRevision: gitOid(value.baseRevision, 'scope.baseRevision'),
    includedOutcomes: stringSet(value.includedOutcomes, 'scope.includedOutcomes', { min: 1 }),
    excludedOutcomes: stringSet(value.excludedOutcomes ?? [], 'scope.excludedOutcomes'),
    includedPaths, excludedPaths,
  };
}
function normalizeCriterion(value, index) {
  const path = `criteria[${index}]`;
  object(value, new Set(['id', 'statement', 'criticality', 'requiredEvidenceKinds', 'requiredEvidenceLocators', 'sourceRequirementRefs', 'environment', 'limitations']), path);
  const criticality = text(value.criticality, `${path}.criticality`, 64);
  if (!CRITICALITIES.has(criticality)) throw new ContractAuthorityError('CONTRACT_CRITICALITY', `${path}.criticality is unsupported.`);
  return {
    id: stableId(value.id, `${path}.id`),
    statement: text(value.statement, `${path}.statement`, 8192),
    criticality,
    requiredEvidenceKinds: stringSet(value.requiredEvidenceKinds, `${path}.requiredEvidenceKinds`, { min: criticality === 'blocking' ? 1 : 0 }),
    requiredEvidenceLocators: stringSet(value.requiredEvidenceLocators, `${path}.requiredEvidenceLocators`, { min: criticality === 'blocking' ? 1 : 0 }),
    sourceRequirementRefs: stringSet(value.sourceRequirementRefs, `${path}.sourceRequirementRefs`, { min: 1 }).map((item, itemIndex) => stableId(item, `${path}.sourceRequirementRefs[${itemIndex}]`)),
    environment: optionalText(value.environment, `${path}.environment`, 2048),
    limitations: stringSet(value.limitations ?? [], `${path}.limitations`),
  };
}
function normalizeRequirement(value, index) {
  const path = `requirements[${index}]`;
  object(value, new Set(['requirementId', 'sourceId', 'statement', 'disposition', 'criterionIds', 'authorityReason']), path);
  const disposition = text(value.disposition, `${path}.disposition`, 64);
  if (!REQUIREMENT_DISPOSITIONS.has(disposition)) throw new ContractAuthorityError('CONTRACT_REQUIREMENT_DISPOSITION', `${path}.disposition is unsupported.`);
  const criterionIds = stringSet(value.criterionIds, `${path}.criterionIds`, { min: disposition === 'covered' ? 1 : 0 }).map((item, itemIndex) => stableId(item, `${path}.criterionIds[${itemIndex}]`));
  if (disposition !== 'covered' && criterionIds.length) throw new ContractAuthorityError('CONTRACT_REQUIREMENT_MAPPING', `${path}.criterionIds must be empty for ${disposition}.`);
  const authorityReason = optionalText(value.authorityReason, `${path}.authorityReason`, 8192);
  if (disposition !== 'covered' && !authorityReason) throw new ContractAuthorityError('CONTRACT_REQUIREMENT_REASON', `${path}.authorityReason is required for ${disposition}.`);
  return {
    requirementId: stableId(value.requirementId, `${path}.requirementId`),
    sourceId: stableId(value.sourceId, `${path}.sourceId`),
    statement: text(value.statement, `${path}.statement`, 8192),
    disposition, criterionIds, authorityReason,
  };
}
function normalizeNamedCheckPolicy(value, index) {
  const path = `evidencePolicies.namedChecks[${index}]`;
  object(value, new Set(['id', 'policyDigest', 'evidenceKind', 'executableDigest', 'argsDigest', 'workingDirectory']), path);
  return {
    id: checkId(value.id, `${path}.id`),
    policyDigest: shaDigest(value.policyDigest, `${path}.policyDigest`, true),
    evidenceKind: text(value.evidenceKind, `${path}.evidenceKind`, 128),
    executableDigest: shaDigest(value.executableDigest, `${path}.executableDigest`, true),
    argsDigest: shaDigest(value.argsDigest, `${path}.argsDigest`, true),
    workingDirectory: repositoryPath(value.workingDirectory, `${path}.workingDirectory`),
  };
}
function normalizeEvidencePolicies(value) {
  if (value == null) return { namedChecks: [] };
  object(value, new Set(['namedChecks']), 'evidencePolicies');
  if (!Array.isArray(value.namedChecks ?? [])) throw new ContractAuthorityError('CONTRACT_ARRAY', 'evidencePolicies.namedChecks must be an array.');
  const namedChecks = (value.namedChecks ?? []).map(normalizeNamedCheckPolicy);
  uniqueBy(namedChecks, 'evidencePolicies.namedChecks', 'id', checkId);
  return { namedChecks: namedChecks.sort((a, b) => cmp(a.id, b.id)) };
}
function normalizeReviewPolicy(value) {
  object(value, new Set(['minimumIndependence', 'allBlockingCriteriaRequired', 'allowClaimantProvisionalContract']), 'reviewPolicy');
  const minimumIndependence = text(value.minimumIndependence, 'reviewPolicy.minimumIndependence', 8);
  if (!REVIEW_LEVELS.includes(minimumIndependence)) throw new ContractAuthorityError('CONTRACT_REVIEW_LEVEL', 'reviewPolicy.minimumIndependence must be R0-R3.');
  if (typeof value.allBlockingCriteriaRequired !== 'boolean' || typeof value.allowClaimantProvisionalContract !== 'boolean') throw new ContractAuthorityError('CONTRACT_BOOLEAN', 'reviewPolicy boolean fields are required.');
  return { minimumIndependence, allBlockingCriteriaRequired: value.allBlockingCriteriaRequired, allowClaimantProvisionalContract: value.allowClaimantProvisionalContract };
}
function normalizeLifecycle(value) {
  object(value, new Set(['status', 'supersededByContractId', 'supersededByContractDigest', 'revokedReason']), 'lifecycle');
  const status = text(value.status, 'lifecycle.status', 32);
  if (!LIFECYCLE_STATUSES.has(status)) throw new ContractAuthorityError('CONTRACT_LIFECYCLE', `Unsupported lifecycle status: ${status}`);
  const supersededByContractId = value.supersededByContractId == null ? null : stableId(value.supersededByContractId, 'lifecycle.supersededByContractId');
  const supersededByContractDigest = value.supersededByContractDigest == null ? null : shaDigest(value.supersededByContractDigest, 'lifecycle.supersededByContractDigest', true);
  const revokedReason = optionalText(value.revokedReason, 'lifecycle.revokedReason', 8192);
  if (status === 'superseded' && (!supersededByContractId || !supersededByContractDigest)) throw new ContractAuthorityError('CONTRACT_LIFECYCLE', 'Superseded contracts require replacement ID and digest.');
  if (status === 'revoked' && !revokedReason) throw new ContractAuthorityError('CONTRACT_LIFECYCLE', 'Revoked contracts require revokedReason.');
  return { status, supersededByContractId, supersededByContractDigest, revokedReason };
}
function normalizeAmendment(value) {
  if (value == null) return null;
  object(value, new Set(['previousContractId', 'previousContractDigest', 'reason', 'authorizedByReceiptDigest', 'effectiveAtRevision']), 'amendment');
  return {
    previousContractId: stableId(value.previousContractId, 'amendment.previousContractId'),
    previousContractDigest: shaDigest(value.previousContractDigest, 'amendment.previousContractDigest', true),
    reason: text(value.reason, 'amendment.reason', 8192),
    authorizedByReceiptDigest: shaDigest(value.authorizedByReceiptDigest, 'amendment.authorizedByReceiptDigest', true),
    effectiveAtRevision: gitOid(value.effectiveAtRevision, 'amendment.effectiveAtRevision'),
  };
}

export function normalizeTaskContract(input) {
  object(input, ROOT_KEYS, 'contract');
  if (input.schemaVersion !== TASK_CONTRACT_VERSION || input.kind !== CONTRACT_KIND) throw new ContractAuthorityError('CONTRACT_VERSION', `Expected ${CONTRACT_KIND} ${TASK_CONTRACT_VERSION}.`);
  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 64) throw new ContractAuthorityError('CONTRACT_SOURCES', 'Contract requires 1-64 sources.');
  if (!Array.isArray(input.requirements) || input.requirements.length < 1 || input.requirements.length > 256) throw new ContractAuthorityError('CONTRACT_REQUIREMENTS', 'Contract requires 1-256 source requirements.');
  if (!Array.isArray(input.criteria) || input.criteria.length < 1 || input.criteria.length > 128) throw new ContractAuthorityError('CONTRACT_CRITERIA', 'Contract requires 1-128 criteria.');

  const authority = normalizeAuthority(input.authority);
  const sources = input.sources.map(normalizeSource);
  const requirements = input.requirements.map(normalizeRequirement);
  const criteria = input.criteria.map(normalizeCriterion);
  const reviewPolicy = normalizeReviewPolicy(input.reviewPolicy);
  uniqueBy(sources, 'sources', 'sourceId');
  uniqueBy(requirements, 'requirements', 'requirementId');
  uniqueBy(criteria, 'criteria', 'id');

  const sourceIds = new Set(sources.map((item) => item.sourceId));
  const requirementById = new Map(requirements.map((item) => [item.requirementId, item]));
  const criterionById = new Map(criteria.map((item) => [item.id, item]));
  const sourceUse = new Set();
  for (const requirement of requirements) {
    if (!sourceIds.has(requirement.sourceId)) throw new ContractAuthorityError('CONTRACT_SOURCE_REFERENCE', `Requirement ${requirement.requirementId} references unknown source ${requirement.sourceId}.`);
    sourceUse.add(requirement.sourceId);
    for (const criterionId of requirement.criterionIds) {
      const criterion = criterionById.get(criterionId);
      if (!criterion) throw new ContractAuthorityError('CONTRACT_CRITERION_REFERENCE', `Requirement ${requirement.requirementId} references unknown criterion ${criterionId}.`);
      if (!criterion.sourceRequirementRefs.includes(requirement.requirementId)) throw new ContractAuthorityError('CONTRACT_MAPPING_ASYMMETRY', `${requirement.requirementId} -> ${criterionId} is not reciprocated.`);
    }
  }
  for (const criterion of criteria) {
    for (const requirementId of criterion.sourceRequirementRefs) {
      const requirement = requirementById.get(requirementId);
      if (!requirement) throw new ContractAuthorityError('CONTRACT_REQUIREMENT_REFERENCE', `Criterion ${criterion.id} references unknown requirement ${requirementId}.`);
      if (!requirement.criterionIds.includes(criterion.id)) throw new ContractAuthorityError('CONTRACT_MAPPING_ASYMMETRY', `${criterion.id} -> ${requirementId} is not reciprocated.`);
    }
  }
  const unused = sources.filter((item) => !sourceUse.has(item.sourceId)).map((item) => item.sourceId);
  if (unused.length) throw new ContractAuthorityError('CONTRACT_UNUSED_SOURCE', `Sources are not represented by requirements: ${unused.join(', ')}`);
  if (!criteria.some((item) => item.criticality === 'blocking')) throw new ContractAuthorityError('CONTRACT_BLOCKING_CRITERION', 'Contract requires at least one blocking criterion.');
  if (authority.level === 'claimant_provisional' && !reviewPolicy.allowClaimantProvisionalContract) throw new ContractAuthorityError('CONTRACT_PROVISIONAL_FORBIDDEN', 'Claimant-provisional contracts are forbidden by reviewPolicy.');
  if (authority.level !== 'claimant_provisional' && !sources.some((source) => SOURCE_METHODS[source.type].has(authority.method))) throw new ContractAuthorityError('CONTRACT_AUTHORITY_SOURCE_MISMATCH', 'No source is compatible with the declared authority method.');

  const evidencePolicies = normalizeEvidencePolicies(input.evidencePolicies);
  const policyById = new Map(evidencePolicies.namedChecks.map((item) => [item.id, item]));
  for (const criterion of criteria) {
    for (const locator of criterion.requiredEvidenceLocators) {
      const match = NAMED_CHECK_PATTERN.exec(locator);
      if (!match) continue;
      const policy = policyById.get(match[1]);
      if (!policy) throw new ContractAuthorityError('CONTRACT_NAMED_CHECK_POLICY', `Criterion ${criterion.id} requires ${locator} without a frozen policy.`);
      if (!criterion.requiredEvidenceKinds.includes(policy.evidenceKind)) throw new ContractAuthorityError('CONTRACT_NAMED_CHECK_KIND', `Criterion ${criterion.id} does not require the frozen evidence kind ${policy.evidenceKind}.`);
    }
  }

  return {
    schemaVersion: TASK_CONTRACT_VERSION,
    kind: CONTRACT_KIND,
    contractId: stableId(input.contractId, 'contractId'),
    taskId: stableId(input.taskId, 'taskId'),
    repository: text(input.repository, 'repository', 512),
    authority,
    sources: sources.sort((a, b) => cmp(a.sourceId, b.sourceId)),
    scope: normalizeScope(input.scope),
    requirements: requirements.sort((a, b) => cmp(a.requirementId, b.requirementId)),
    criteria: criteria.sort((a, b) => cmp(a.id, b.id)),
    evidencePolicies,
    reviewPolicy,
    lifecycle: normalizeLifecycle(input.lifecycle),
    amendment: normalizeAmendment(input.amendment),
  };
}

function canonicalize(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new ContractAuthorityError('CONTRACT_NUMBER', 'Canonical JSON permits safe integers only.');
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new ContractAuthorityError('CONTRACT_CYCLE', 'JSON contains a cyclic array.');
    seen.add(value);
    const result = `[${value.map((item) => canonicalize(item, seen)).join(',')}]`;
    seen.delete(value);
    return result;
  }
  if (!plain(value)) throw new ContractAuthorityError('CONTRACT_JSON', 'Value contains a non-JSON object.');
  if (seen.has(value)) throw new ContractAuthorityError('CONTRACT_CYCLE', 'JSON contains a cyclic object.');
  seen.add(value);
  const result = `{${Object.keys(value).sort(cmp).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(',')}}`;
  seen.delete(value);
  return result;
}
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const canonicalTaskContract = (contract) => canonicalize(normalizeTaskContract(contract));
export const digestTaskContract = (contract) => `sha256:${sha256(canonicalTaskContract(contract))}`;
export const digestAuthorityDeclaration = (contract) => `sha256:${sha256(canonicalize(normalizeTaskContract(contract).authority))}`;
export const digestJson = (value) => `sha256:${sha256(canonicalize(value))}`;

function criterionSnapshot(value) {
  if (!Array.isArray(value)) throw new ContractAuthorityError('CONTRACT_CRITERION_SET_MISMATCH', 'contractCriterionSnapshot must be an array.');
  const normalized = value.map((item, index) => normalizeCriterion(item, index));
  uniqueBy(normalized, 'contractCriterionSnapshot', 'id');
  return normalized.sort((a, b) => cmp(a.id, b.id));
}
function repositoryIdentity(value, path) {
  if (!plain(value)) throw new ContractAuthorityError('CONTRACT_REPOSITORY', `${path} is required.`);
  return { identity: text(value.identity, `${path}.identity`, 512), baseSha: gitOid(value.baseSha, `${path}.baseSha`), headSha: gitOid(value.headSha, `${path}.headSha`) };
}
export function validateClaimContractBinding(contract, claim) {
  const normalized = normalizeTaskContract(contract);
  if (!plain(claim)) throw new ContractAuthorityError('CONTRACT_CLAIM', 'Claim must be an object.');
  const errors = [];
  if (!plain(claim.contractRef)) errors.push('CONTRACT_REF_REQUIRED');
  if (claim.contractRef?.contractId !== normalized.contractId) errors.push('CONTRACT_ID_MISMATCH');
  if (claim.contractRef?.contractDigest !== digestTaskContract(normalized)) errors.push('CONTRACT_DIGEST_MISMATCH');
  if (claim.contractRef?.authorityDeclarationDigest !== digestAuthorityDeclaration(normalized)) errors.push('CONTRACT_AUTHORITY_DIGEST_MISMATCH');
  if (claim.taskId !== normalized.taskId) errors.push('CONTRACT_TASK_MISMATCH');
  if (!plain(claim.producer) || claim.producer.role !== 'claimant' || typeof claim.producer.runId !== 'string') errors.push('CLAIMANT_IDENTITY');
  const repository = repositoryIdentity(claim.repository, 'claim.repository');
  if (repository.identity !== normalized.repository) errors.push('CONTRACT_REPOSITORY_MISMATCH');
  if (repository.baseSha !== normalized.scope.baseRevision) errors.push('CONTRACT_BASE_MISMATCH');
  if (time(claim.generatedAt, 'claim.generatedAt') < time(normalized.authority.issuedAt, 'authority.issuedAt')) errors.push('CLAIM_PREDATES_CONTRACT');
  if (canonicalize(criterionSnapshot(claim.contractCriterionSnapshot)) !== canonicalize(normalized.criteria)) errors.push('CONTRACT_CRITERION_CONTENT_MISMATCH');
  return { ok: errors.length === 0, errors, contractDigest: digestTaskContract(normalized), authorityDeclarationDigest: digestAuthorityDeclaration(normalized), repository };
}

function withoutDigest(value, field = 'receiptDigest') { const copy = { ...value }; delete copy[field]; return copy; }
function receiptMethodAllowed(contract, source, method) {
  if (contract.authority.level === 'claimant_provisional') return AUTHORITY_METHODS.has(method) && (SOURCE_METHODS[source.type].has(method) || method === 'procedural_attestation');
  return LEVEL_METHODS[contract.authority.level].has(method) && SOURCE_METHODS[source.type].has(method);
}
export function createAuthorityReceipt({ contract, sourceId, claim, reviewerRunId, observedAt, method, observation }) {
  const normalized = normalizeTaskContract(contract);
  const binding = validateClaimContractBinding(normalized, claim);
  if (!binding.ok) throw new ContractAuthorityError('CONTRACT_CLAIM_BINDING', 'Cannot issue authority receipt for an invalid Claim.', binding);
  const source = normalized.sources.find((item) => item.sourceId === sourceId);
  if (!source) throw new ContractAuthorityError('CONTRACT_SOURCE_REFERENCE', `Unknown source: ${sourceId}`);
  if (!receiptMethodAllowed(normalized, source, method)) throw new ContractAuthorityError('CONTRACT_AUTHORITY_METHOD_MISMATCH', `${method} cannot verify ${source.type}.`);
  if (!plain(observation)) throw new ContractAuthorityError('CONTRACT_AUTHORITY_OBSERVATION', 'Authority observation is required.');
  const receipt = {
    receiptVersion: AUTHORITY_RECEIPT_VERSION, kind: AUTHORITY_RECEIPT_KIND,
    contractId: normalized.contractId, contractDigest: digestTaskContract(normalized),
    sourceId: source.sourceId, sourceType: source.type, sourceLocator: source.locator,
    sourceRevision: source.revision, sourceSha256: source.sha256,
    repository: normalized.repository, implementationBaseRevision: normalized.scope.baseRevision,
    implementationHeadRevision: binding.repository.headSha,
    producerRunId: text(reviewerRunId, 'reviewerRunId', 256), observedAt: iso(observedAt, 'observedAt'), method,
    observation: {
      sourceExistsAtBase: observation.sourceExistsAtBase === true,
      revisionIsAncestor: observation.revisionIsAncestor === true,
      sourceChangedInImplementationScope: observation.sourceChangedInImplementationScope === true,
      safeGitConfiguration: observation.safeGitConfiguration === true,
      sourceIsRegularFile: observation.sourceIsRegularFile === true,
      sourceIsSymbolicLink: observation.sourceIsSymbolicLink === true,
      sizeBytes: integer(observation.sizeBytes, 'observation.sizeBytes', 0, MAX_CONTRACT_SOURCE_BYTES),
      observedSourceSha256: shaDigest(observation.observedSourceSha256, 'observation.observedSourceSha256'),
      adapterId: text(observation.adapterId, 'observation.adapterId', 256),
      adapterReceiptDigest: shaDigest(observation.adapterReceiptDigest, 'observation.adapterReceiptDigest', true),
    },
  };
  receipt.receiptDigest = digestJson(withoutDigest(receipt));
  return receipt;
}
function reviewReceiptDigests(review) {
  const values = review?.contractRef?.authorityVerificationReceiptDigests
    ?? (review?.contractRef?.authorityVerificationReceiptDigest ? [review.contractRef.authorityVerificationReceiptDigest] : []);
  return Array.isArray(values) ? [...new Set(values)].sort(cmp) : [];
}
export function verifyAuthorityReceipt({ contract, claim, review, receipt, adapter }) {
  const normalized = normalizeTaskContract(contract);
  const binding = validateClaimContractBinding(normalized, claim);
  const errors = [...binding.errors];
  if (!plain(review) || !plain(review.reviewer)) errors.push('REVIEW_ARTIFACT_REQUIRED');
  if (!plain(receipt)) errors.push('CONTRACT_AUTHORITY_RECEIPT_REQUIRED');
  if (errors.length) return { ok: false, errors, cap: binding.ok ? 'INCONCLUSIVE' : 'FAIL' };
  const source = normalized.sources.find((item) => item.sourceId === receipt.sourceId);
  if (!source) errors.push('CONTRACT_AUTHORITY_RECEIPT_SOURCE');
  const expectedDigest = digestJson(withoutDigest(receipt));
  if (receipt.receiptVersion !== AUTHORITY_RECEIPT_VERSION || receipt.kind !== AUTHORITY_RECEIPT_KIND) errors.push('CONTRACT_AUTHORITY_RECEIPT_VERSION');
  if (receipt.receiptDigest !== expectedDigest) errors.push('CONTRACT_AUTHORITY_RECEIPT_DIGEST');
  if (receipt.contractId !== normalized.contractId || receipt.contractDigest !== digestTaskContract(normalized)) errors.push('CONTRACT_AUTHORITY_RECEIPT_CONTRACT');
  if (source && (receipt.sourceType !== source.type || receipt.sourceLocator !== source.locator || receipt.sourceRevision !== source.revision || receipt.sourceSha256 !== source.sha256)) errors.push('CONTRACT_AUTHORITY_RECEIPT_SOURCE');
  if (receipt.repository !== normalized.repository) errors.push('CONTRACT_AUTHORITY_RECEIPT_REPOSITORY');
  if (receipt.implementationBaseRevision !== normalized.scope.baseRevision) errors.push('CONTRACT_AUTHORITY_RECEIPT_BASE');
  if (receipt.implementationHeadRevision !== binding.repository.headSha) errors.push('CONTRACT_AUTHORITY_RECEIPT_HEAD');
  if (receipt.producerRunId !== review.reviewer.runId) errors.push('CONTRACT_AUTHORITY_REVIEWER_BINDING');
  if (receipt.producerRunId === claim?.producer?.runId) errors.push('CONTRACT_AUTHORITY_CLAIMANT');
  if (source && !receiptMethodAllowed(normalized, source, receipt.method)) errors.push('CONTRACT_AUTHORITY_METHOD_MISMATCH');
  const observed = time(receipt.observedAt, 'receipt.observedAt');
  if (observed < time(normalized.authority.issuedAt, 'authority.issuedAt')) errors.push('AUTHORITY_RECEIPT_PREDATES_CONTRACT');
  if (observed > time(review.generatedAt, 'review.generatedAt')) errors.push('AUTHORITY_RECEIPT_POSTDATES_REVIEW');
  if (!reviewReceiptDigests(review).includes(receipt.receiptDigest)) errors.push('CONTRACT_AUTHORITY_VERIFICATION_BINDING');
  if (typeof adapter !== 'function') return { ok: false, errors: [...errors, 'CONTRACT_AUTHORITY_ADAPTER_REQUIRED'], cap: errors.length ? 'FAIL' : 'INCONCLUSIVE' };
  let live;
  try { live = adapter({ contract: normalized, source, claim, review, receipt }); }
  catch (error) { return { ok: false, errors: [...errors, 'CONTRACT_AUTHORITY_ADAPTER_FAILURE'], cap: errors.length ? 'FAIL' : 'INCONCLUSIVE', adapterError: String(error) }; }
  if (!plain(live) || live.ok !== true) errors.push('CONTRACT_AUTHORITY_ADAPTER_REJECTED');
  if (live?.adapterId !== receipt.observation?.adapterId) errors.push('CONTRACT_AUTHORITY_ADAPTER_ID');
  if (live?.adapterReceiptDigest !== receipt.observation?.adapterReceiptDigest) errors.push('CONTRACT_AUTHORITY_ADAPTER_DIGEST');
  if (source?.type === 'repository_file') {
    if (receipt.observation?.sourceExistsAtBase !== true) errors.push('CONTRACT_SOURCE_NOT_AT_BASE');
    if (receipt.observation?.revisionIsAncestor !== true) errors.push('CONTRACT_REVISION_NOT_ANCESTOR');
    if (receipt.observation?.sourceChangedInImplementationScope !== false) errors.push('CONTRACT_CHANGED_IN_IMPLEMENTATION_SCOPE');
    if (receipt.observation?.safeGitConfiguration !== true) errors.push('CONTRACT_UNSAFE_GIT_CONFIGURATION');
    if (receipt.observation?.sourceIsRegularFile !== true || receipt.observation?.sourceIsSymbolicLink !== false) errors.push('CONTRACT_SOURCE_FILE_TYPE');
  }
  if (receipt.observation?.observedSourceSha256 !== receipt.sourceSha256) errors.push('CONTRACT_SOURCE_DIGEST');
  const output = { ok: errors.length === 0, errors, cap: errors.length ? 'FAIL' : 'PASS', receiptDigest: expectedDigest, sourceId: receipt.sourceId };
  if (output.ok) Object.defineProperty(output, VERIFIED_AUTHORITY_SET, { value: true });
  return output;
}
export function verifyAuthorityReceipts({ contract, claim, review, receipts = [], adapter }) {
  const normalized = normalizeTaskContract(contract);
  if (!Array.isArray(receipts)) return { ok: false, errors: ['CONTRACT_AUTHORITY_RECEIPT_SET'], cap: 'FAIL' };
  const bySource = new Map();
  const errors = [];
  for (const receipt of receipts) {
    if (!plain(receipt) || typeof receipt.sourceId !== 'string') { errors.push('CONTRACT_AUTHORITY_RECEIPT_SET'); continue; }
    if (bySource.has(receipt.sourceId)) errors.push(`CONTRACT_AUTHORITY_RECEIPT_DUPLICATE:${receipt.sourceId}`);
    bySource.set(receipt.sourceId, receipt);
  }
  for (const source of normalized.sources) if (!bySource.has(source.sourceId)) errors.push(`CONTRACT_AUTHORITY_RECEIPT_MISSING:${source.sourceId}`);
  if (errors.some((item) => item.includes('DUPLICATE'))) return { ok: false, errors, cap: 'FAIL' };
  const results = normalized.sources.flatMap((source) => bySource.has(source.sourceId)
    ? [verifyAuthorityReceipt({ contract: normalized, claim, review, receipt: bySource.get(source.sourceId), adapter })] : []);
  errors.push(...results.flatMap((item) => item.errors));
  const cap = results.some((item) => item.cap === 'FAIL') ? 'FAIL'
    : errors.some((item) => item.startsWith('CONTRACT_AUTHORITY_RECEIPT_MISSING')) || results.some((item) => item.cap !== 'PASS') ? 'INCONCLUSIVE' : 'PASS';
  const output = { ok: cap === 'PASS' && errors.length === 0, errors, cap, results };
  if (output.ok) Object.defineProperty(output, VERIFIED_AUTHORITY_SET, { value: true });
  return output;
}

const levelCap = (level) => level === 'R0' ? 'INCONCLUSIVE' : level === 'R1' ? 'PASS_WITH_LIMITS' : level === 'R2' || level === 'R3' ? 'PASS' : 'FAIL';
export function validateReviewContractBinding(contract, claim, review, receipts = []) {
  const normalized = normalizeTaskContract(contract);
  const binding = validateClaimContractBinding(normalized, claim);
  const errors = [...binding.errors];
  if (!plain(review)) return { ok: false, errors: [...errors, 'REVIEW_ARTIFACT_REQUIRED'], cap: binding.ok ? 'INCONCLUSIVE' : 'FAIL' };
  if (!plain(review.contractRef)) errors.push('CONTRACT_REVIEW_REF_REQUIRED');
  if (review.contractRef?.contractId !== normalized.contractId) errors.push('CONTRACT_REVIEW_ID_MISMATCH');
  if (review.contractRef?.contractDigest !== digestTaskContract(normalized)) errors.push('CONTRACT_REVIEW_DIGEST_MISMATCH');
  if (review.contractRef?.authorityDeclarationDigest !== digestAuthorityDeclaration(normalized)) errors.push('CONTRACT_REVIEW_AUTHORITY_DIGEST_MISMATCH');
  const expectedReceipts = receipts.map((item) => item?.receiptDigest).filter(Boolean).sort(cmp);
  if (canonicalize(reviewReceiptDigests(review)) !== canonicalize(expectedReceipts)) errors.push('CONTRACT_AUTHORITY_VERIFICATION_BINDING');
  if (review.claimDigest !== digestJson(claim)) errors.push('CONTRACT_REVIEW_CLAIM_DIGEST');
  if (review.taskId !== normalized.taskId) errors.push('CONTRACT_REVIEW_TASK_MISMATCH');
  const reviewRepository = repositoryIdentity(review.repository, 'review.repository');
  if (reviewRepository.identity !== binding.repository.identity || reviewRepository.baseSha !== binding.repository.baseSha || reviewRepository.headSha !== binding.repository.headSha) errors.push('CONTRACT_REVIEW_REPOSITORY_MISMATCH');
  if (!plain(review.reviewer) || review.reviewer.role !== 'reviewer') errors.push('REVIEWER_ROLE');
  if (!plain(review.reviewerAttestation)) errors.push('REVIEWER_ATTESTATION_REQUIRED');
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
  if (REVIEW_LEVELS.indexOf(level) < REVIEW_LEVELS.indexOf(normalized.reviewPolicy.minimumIndependence)) errors.push('REVIEW_INDEPENDENCE_INSUFFICIENT');
  if (time(review.generatedAt, 'review.generatedAt') < time(claim.generatedAt, 'claim.generatedAt')) errors.push('REVIEW_PREDATES_CLAIM');
  const hard = new Set([...binding.errors, 'CONTRACT_REVIEW_ID_MISMATCH', 'CONTRACT_REVIEW_DIGEST_MISMATCH', 'CONTRACT_REVIEW_AUTHORITY_DIGEST_MISMATCH', 'CONTRACT_AUTHORITY_VERIFICATION_BINDING', 'CONTRACT_REVIEW_CLAIM_DIGEST', 'CONTRACT_REVIEW_TASK_MISMATCH', 'CONTRACT_REVIEW_REPOSITORY_MISMATCH', 'REVIEWER_ROLE', 'REVIEWER_ATTESTATION_BINDING', 'NOT_INDEPENDENT', 'REVIEW_PREDATES_CLAIM']);
  let cap = levelCap(level);
  if (errors.some((item) => hard.has(item))) cap = 'FAIL';
  else if (errors.length) cap = minGate(cap, 'INCONCLUSIVE');
  return { ok: errors.length === 0, errors, reviewerLevel: level, cap, repository: reviewRepository };
}

function verifyOpaque({ assessment, verifier, version, kind, expected, symbol, missing, rejected }) {
  if (!plain(assessment)) return { ok: false, errors: [missing], cap: 'INCONCLUSIVE' };
  const errors = [];
  if (assessment.version !== version || assessment.kind !== kind) errors.push(`${rejected}_VERSION`);
  for (const [key, value] of Object.entries(expected)) if (assessment[key] !== value) errors.push(`${rejected}_${key.toUpperCase()}`);
  const expectedDigest = digestJson(withoutDigest(assessment, 'assessmentDigest'));
  if (assessment.assessmentDigest !== expectedDigest) errors.push(`${rejected}_DIGEST`);
  if (!GATES.includes(assessment.gate)) errors.push(`${rejected}_GATE`);
  if (typeof verifier !== 'function') return { ok: false, errors: [...errors, `${rejected}_VERIFIER_REQUIRED`], cap: errors.length ? 'FAIL' : 'INCONCLUSIVE' };
  let live;
  try { live = verifier(assessment); }
  catch (error) { return { ok: false, errors: [...errors, `${rejected}_VERIFIER_FAILURE`], cap: errors.length ? 'FAIL' : 'INCONCLUSIVE', verifierError: String(error) }; }
  if (!plain(live) || live.ok !== true || live.assessmentDigest !== expectedDigest || live.gate !== assessment.gate) errors.push(`${rejected}_VERIFIER_REJECTED`);
  const output = { ok: errors.length === 0, errors, cap: errors.length ? 'FAIL' : assessment.gate, gate: assessment.gate, assessmentDigest: expectedDigest };
  if (output.ok) Object.defineProperty(output, symbol, { value: true });
  return output;
}
export const verifyEvidenceAssessment = ({ contract, claim, review, assessment, verifier }) => verifyOpaque({
  assessment, verifier, version: EVIDENCE_ASSESSMENT_VERSION, kind: 'task-proof-evidence-assessment', symbol: VERIFIED_EVIDENCE,
  missing: 'EVIDENCE_ASSESSMENT_REQUIRED', rejected: 'EVIDENCE_ASSESSMENT',
  expected: { contractDigest: digestTaskContract(contract), claimDigest: digestJson(claim), reviewDigest: digestJson(review) },
});
export const verifyLifecycleAssessment = ({ contract, claim, review, assessment, verifier }) => verifyOpaque({
  assessment, verifier, version: LIFECYCLE_ASSESSMENT_VERSION, kind: 'task-proof-lifecycle-assessment', symbol: VERIFIED_LIFECYCLE,
  missing: 'LIFECYCLE_ASSESSMENT_REQUIRED', rejected: 'LIFECYCLE_ASSESSMENT',
  expected: { contractDigest: digestTaskContract(contract), claimDigest: digestJson(claim), reviewDigest: digestJson(review) },
});

export function validateNamedCheckReceipts(contract, receipts = [], { claim, review, verifier } = {}) {
  const normalized = normalizeTaskContract(contract);
  const policies = new Map(normalized.evidencePolicies.namedChecks.map((item) => [item.id, item]));
  const errors = [];
  let missing = false;
  for (const criterion of normalized.criteria.filter((item) => item.criticality === 'blocking')) {
    for (const locator of criterion.requiredEvidenceLocators) {
      const match = NAMED_CHECK_PATTERN.exec(locator);
      if (!match) continue;
      const policy = policies.get(match[1]);
      const candidates = receipts.filter((item) => item?.locator === locator && Array.isArray(item?.supportsCriterionIds) && item.supportsCriterionIds.includes(criterion.id));
      if (!candidates.length) { missing = true; continue; }
      for (const item of candidates) {
        if (!plain(item) || item.version !== NAMED_CHECK_RECEIPT_VERSION || item.kind !== 'task-proof-named-check-receipt') { errors.push(`NAMED_CHECK_RECEIPT_VERSION:${criterion.id}:${locator}`); continue; }
        const expectedDigest = digestJson(withoutDigest(item));
        if (item.receiptDigest !== expectedDigest) errors.push(`NAMED_CHECK_RECEIPT_DIGEST:${criterion.id}:${locator}`);
        if (item.contractDigest !== digestTaskContract(normalized) || item.claimDigest !== digestJson(claim) || item.reviewDigest !== digestJson(review)) errors.push(`NAMED_CHECK_SCOPE_MISMATCH:${criterion.id}:${locator}`);
        if (item.headSha !== claim?.repository?.headSha || item.producerRunId !== review?.reviewer?.runId) errors.push(`NAMED_CHECK_IDENTITY_MISMATCH:${criterion.id}:${locator}`);
        if (item.policyDigest !== policy.policyDigest || item.evidenceKind !== policy.evidenceKind || item.executableDigest !== policy.executableDigest || item.argsDigest !== policy.argsDigest || item.workingDirectory !== policy.workingDirectory) errors.push(`NAMED_CHECK_POLICY_MISMATCH:${criterion.id}:${locator}`);
        if (typeof verifier !== 'function') { missing = true; continue; }
        let live;
        try { live = verifier({ receipt: item, policy, criterion, contract: normalized, claim, review }); }
        catch { missing = true; continue; }
        if (!plain(live) || live.ok !== true || live.receiptDigest !== expectedDigest) errors.push(`NAMED_CHECK_VERIFIER_REJECTED:${criterion.id}:${locator}`);
        if (live?.result !== 'pass' || item.result?.status !== 'pass' || item.result?.exitCode !== 0) errors.push(`NAMED_CHECK_FAILED:${criterion.id}:${locator}`);
      }
    }
  }
  const cap = errors.length ? 'FAIL' : missing ? 'INCONCLUSIVE' : 'PASS';
  const output = { ok: cap === 'PASS', errors: errors.length ? errors : missing ? ['NAMED_CHECK_RECEIPT_MISSING_OR_UNVERIFIED'] : [], cap };
  if (output.ok) Object.defineProperty(output, VERIFIED_NAMED_CHECKS, { value: true });
  return output;
}

export const sourceCoverageCap = (contract) => normalizeTaskContract(contract).requirements.some((item) => item.disposition !== 'covered') ? 'PASS_WITH_LIMITS' : 'PASS';
export function contractPolicyCap(contract) {
  const normalized = normalizeTaskContract(contract);
  return !normalized.reviewPolicy.allBlockingCriteriaRequired || normalized.authority.level === 'claimant_provisional' ? 'INCONCLUSIVE' : 'PASS';
}
export function authorityLevelCap(contract, verified) {
  const normalized = normalizeTaskContract(contract);
  if (normalized.authority.level === 'claimant_provisional') return 'INCONCLUSIVE';
  if (!verified || verified[VERIFIED_AUTHORITY_SET] !== true || verified.ok !== true) return 'INCONCLUSIVE';
  return normalized.authority.level === 'user_attested' ? 'PASS_WITH_LIMITS' : 'PASS';
}
export function lifecycleCap(contract) {
  const status = normalizeTaskContract(contract).lifecycle.status;
  return status === 'revoked' ? 'FAIL' : status === 'superseded' ? 'STALE' : 'PASS';
}
export function minGate(...gates) {
  return gates.map((gate) => {
    if (!GATES.includes(gate)) throw new ContractAuthorityError('CONTRACT_GATE', `Unsupported gate: ${gate}`);
    return gate;
  }).reduce((minimum, gate) => GATES.indexOf(gate) < GATES.indexOf(minimum) ? gate : minimum, 'PASS');
}

export function computeContractBoundGate({
  contract, claim, review,
  authorityReceipts = undefined, receipt = undefined, authorityAdapter,
  evidenceAssessment, evidenceVerifier, evidenceGate,
  namedCheckReceipts = undefined, evidenceReceipts = undefined, namedCheckVerifier,
  lifecycleAssessment, lifecycleVerifier, lifecycleGate,
}) {
  const claimBinding = validateClaimContractBinding(contract, claim);
  if (!claimBinding.ok) return { gate: 'FAIL', errors: claimBinding.errors, caps: { claim: 'FAIL' } };
  if (!review) return { gate: 'INCONCLUSIVE', errors: ['REVIEW_ARTIFACT_REQUIRED'], caps: { claim: 'PASS', review: 'INCONCLUSIVE' } };
  const receipts = authorityReceipts ?? (receipt ? [receipt] : []);
  const reviewBinding = validateReviewContractBinding(contract, claim, review, receipts);
  const authority = verifyAuthorityReceipts({ contract, claim, review, receipts, adapter: authorityAdapter });
  const evidence = evidenceAssessment
    ? verifyEvidenceAssessment({ contract, claim, review, assessment: evidenceAssessment, verifier: evidenceVerifier })
    : { ok: false, errors: ['UNTRUSTED_EVIDENCE_GATE'], cap: evidenceGate === 'FAIL' || evidenceGate === 'STALE' ? evidenceGate : 'INCONCLUSIVE' };
  const namedChecks = validateNamedCheckReceipts(contract, namedCheckReceipts ?? evidenceReceipts ?? [], { claim, review, verifier: namedCheckVerifier });
  const artifactLifecycle = lifecycleAssessment
    ? verifyLifecycleAssessment({ contract, claim, review, assessment: lifecycleAssessment, verifier: lifecycleVerifier })
    : { ok: false, errors: ['UNTRUSTED_LIFECYCLE_GATE'], cap: lifecycleGate === 'FAIL' || lifecycleGate === 'STALE' ? lifecycleGate : 'INCONCLUSIVE' };
  const caps = {
    evidence: evidence.cap,
    authority: minGate(authorityLevelCap(contract, authority), authority.cap),
    sourceCoverage: sourceCoverageCap(contract),
    contractPolicy: contractPolicyCap(contract),
    reviewer: reviewBinding.cap,
    namedChecks: namedChecks.cap,
    contractLifecycle: lifecycleCap(contract),
    artifactLifecycle: artifactLifecycle.cap,
  };
  return { gate: minGate(...Object.values(caps)), errors: [...reviewBinding.errors, ...authority.errors, ...evidence.errors, ...namedChecks.errors, ...artifactLifecycle.errors], caps };
}
