import {
  CLAIM_KIND,
  PROTOCOL_VERSION,
  TaskProofError,
  validateClaim,
} from './core.mjs';
import { validateClaimEvidencePolicy } from './hardening.mjs';
import {
  digestAuthorityDeclaration,
  digestJson,
  digestTaskContract,
  normalizeTaskContract,
  sourceCoverageCap,
  validateClaimContractBinding,
} from './contract-authority.mjs';
import { normalizeRepositoryIdentity } from './contract-repository-source-adapter.mjs';

export const PUBLIC_CONTRACT_ENFORCEMENT_VERSION = '1.0.0';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(code, message, details) {
  throw new TaskProofError(code, message, details);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function claimCriteria(contract) {
  return contract.criteria.map((criterion) => ({
    id: criterion.id,
    text: criterion.statement,
    requiredEvidenceKinds: [...criterion.requiredEvidenceKinds],
    requiredEvidenceLocators: [...criterion.requiredEvidenceLocators],
    criticality: criterion.criticality,
    sourceRequirementRefs: [...criterion.sourceRequirementRefs],
  }));
}

function normalizedClaimCriteria(criteria) {
  if (!Array.isArray(criteria)) return [];
  return criteria.map((criterion) => ({
    id: criterion?.id,
    text: criterion?.text,
    requiredEvidenceKinds: [...(criterion?.requiredEvidenceKinds ?? [])].sort(),
    requiredEvidenceLocators: [...(criterion?.requiredEvidenceLocators ?? [])].sort(),
    criticality: criterion?.criticality,
    sourceRequirementRefs: [...(criterion?.sourceRequirementRefs ?? [])].sort(),
  })).sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
}

function assertOptionalCriteriaMatch(rawClaim, expected) {
  const supplied = rawClaim?.task?.acceptanceCriteria;
  if (supplied === undefined) return;
  if (digestJson(normalizedClaimCriteria(supplied)) !== digestJson(normalizedClaimCriteria(expected))) {
    fail('CONTRACT_CRITERION_CONTENT_MISMATCH', 'Caller-supplied acceptance criteria differ from the frozen Task Contract.');
  }
}

function assertRepositoryMatches(snapshot, contract) {
  if (!isRecord(snapshot?.repository)) fail('CONTRACT_SNAPSHOT_REQUIRED', 'A complete repository snapshot is required.');
  if (snapshot.repository.workingTreeFingerprintComplete === false) {
    fail('INCOMPLETE_SNAPSHOT', 'The repository contains working-tree objects that were not fully content fingerprinted.', {
      reasons: snapshot.repository.workingTreeFingerprintIncompleteReasons ?? [],
    });
  }
  if (snapshot.repository.baseSha !== contract.scope.baseRevision) {
    fail('CONTRACT_BASE_MISMATCH', 'Repository snapshot base does not match the frozen contract base.', {
      expected: contract.scope.baseRevision,
      actual: snapshot.repository.baseSha,
    });
  }
  const actual = normalizeRepositoryIdentity(snapshot.repository.remote);
  const expected = normalizeRepositoryIdentity(contract.repository);
  if (!actual || actual !== expected) {
    fail('CONTRACT_REPOSITORY_MISMATCH', 'Repository remote identity does not match the frozen contract.', {
      expected: contract.repository,
      actual: snapshot.repository.remote ?? null,
    });
  }
}

export function validatePublicTaskContract(contract) {
  const normalized = normalizeTaskContract(contract);
  return {
    ok: true,
    enforcementVersion: PUBLIC_CONTRACT_ENFORCEMENT_VERSION,
    contract: normalized,
    contractDigest: digestTaskContract(normalized),
    authorityDeclarationDigest: digestAuthorityDeclaration(normalized),
    authorityLevel: normalized.authority.level,
    sourceCoverageCap: sourceCoverageCap(normalized),
    minimumReviewerLevel: normalized.reviewPolicy.minimumIndependence,
    provisional: normalized.authority.level === 'claimant_provisional',
  };
}

export function bindPublicClaimToContract({ contract, rawClaim, snapshot }) {
  const normalized = normalizeTaskContract(contract);
  assertRepositoryMatches(snapshot, normalized);
  if (!isRecord(rawClaim)) fail('INVALID_CLAIM', 'Claim input must be an object.');
  if (rawClaim.task?.id !== undefined && rawClaim.task.id !== normalized.taskId) {
    fail('CONTRACT_TASK_MISMATCH', 'Claim task.id differs from the frozen contract taskId.');
  }
  if (rawClaim.taskId !== undefined && rawClaim.taskId !== normalized.taskId) {
    fail('CONTRACT_TASK_MISMATCH', 'Claim taskId differs from the frozen contract taskId.');
  }
  const criteria = claimCriteria(normalized);
  assertOptionalCriteriaMatch(rawClaim, criteria);

  const claim = {
    ...cloneJson(rawClaim),
    protocolVersion: PROTOCOL_VERSION,
    kind: CLAIM_KIND,
    generatedAt: rawClaim.generatedAt ?? new Date().toISOString(),
    taskId: normalized.taskId,
    repository: {
      branch: snapshot.repository.branch,
      baseSha: snapshot.repository.baseSha,
      headSha: snapshot.repository.headSha,
      dirty: snapshot.repository.dirty,
      snapshotDigest: snapshot.snapshotDigest,
      workingTreeFingerprintComplete: snapshot.repository.workingTreeFingerprintComplete,
      workingTreeFingerprintIncompleteReasons: snapshot.repository.workingTreeFingerprintIncompleteReasons,
      workingTreeHashedBytes: snapshot.repository.workingTreeHashedBytes,
      identity: normalized.repository,
    },
    task: {
      ...(isRecord(rawClaim.task) ? cloneJson(rawClaim.task) : {}),
      id: normalized.taskId,
      acceptanceCriteria: criteria,
    },
    contractRef: {
      contractId: normalized.contractId,
      contractDigest: digestTaskContract(normalized),
      authorityDeclarationDigest: digestAuthorityDeclaration(normalized),
    },
    taskContract: cloneJson(normalized),
    contractCriterionSnapshot: cloneJson(normalized.criteria),
    contractStatus: {
      contractId: normalized.contractId,
      contractDigest: digestTaskContract(normalized),
      authorityLevel: normalized.authority.level,
      sourceCoverageCap: sourceCoverageCap(normalized),
      minimumReviewerLevel: normalized.reviewPolicy.minimumIndependence,
      finalAcceptancePossible: normalized.authority.level !== 'claimant_provisional',
    },
  };
  delete claim.artifactDigest;
  delete claim.manifestDigest;

  const structural = validateClaim(claim);
  const policy = validateClaimEvidencePolicy(claim);
  const binding = validateClaimContractBinding(normalized, claim);
  const errors = [...structural.errors, ...policy.errors, ...binding.errors.map((code) => ({ code, message: code }))];
  if (!structural.ok || !policy.ok || !binding.ok) {
    fail('INVALID_CONTRACT_BOUND_CLAIM', 'Claim does not satisfy the Task Proof and frozen-contract rules.', {
      errors,
      warnings: structural.warnings,
    });
  }
  return {
    claim,
    validation: {
      ok: true,
      errors: [],
      warnings: structural.warnings,
      digest: structural.digest,
      contractDigest: binding.contractDigest,
      authorityDeclarationDigest: binding.authorityDeclarationDigest,
    },
  };
}

export function validatePublicContractBoundClaim({ contract, claim }) {
  const normalized = normalizeTaskContract(contract);
  const structural = validateClaim(claim);
  const policy = validateClaimEvidencePolicy(claim);
  let binding;
  try {
    binding = validateClaimContractBinding(normalized, claim);
  } catch (error) {
    return {
      ok: false,
      errors: [...structural.errors, ...policy.errors, { code: error.code ?? 'CONTRACT_BINDING', message: error.message }],
      warnings: structural.warnings,
    };
  }
  return {
    ok: structural.ok && policy.ok && binding.ok,
    errors: [...structural.errors, ...policy.errors, ...binding.errors.map((code) => ({ code, message: code }))],
    warnings: structural.warnings,
    digest: structural.ok && policy.ok && binding.ok ? structural.digest : undefined,
    contractDigest: binding.contractDigest,
    authorityDeclarationDigest: binding.authorityDeclarationDigest,
  };
}
