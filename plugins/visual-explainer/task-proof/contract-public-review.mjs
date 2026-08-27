import { TaskProofError } from './core.mjs';
import {
  EVIDENCE_ASSESSMENT_VERSION,
  LIFECYCLE_ASSESSMENT_VERSION,
  NAMED_CHECK_RECEIPT_VERSION,
  digestAuthorityDeclaration,
  digestJson,
  digestTaskContract,
  normalizeTaskContract,
  sourceCoverageCap,
  validateClaimContractBinding,
  validateReviewContractBinding,
} from './contract-authority.mjs';
import { computeStrictContractGate } from './contract-final-gate.mjs';
import { createRepositorySnapshotStrict as createRepositorySnapshot } from './snapshot.mjs';
import { createPublicRepositoryAuthorityAdapter } from './contract-repository-source-adapter.mjs';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(code, message, details) {
  throw new TaskProofError(code, message, details);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assessment({ version, kind, contract, claim, review, gate, details }) {
  const value = {
    version,
    kind,
    contractDigest: digestTaskContract(contract),
    claimDigest: digestJson(claim),
    reviewDigest: digestJson(review),
    gate,
    details,
  };
  value.assessmentDigest = digestJson(value);
  return value;
}

function evidenceAssessment(contract, claim, review) {
  return assessment({
    version: EVIDENCE_ASSESSMENT_VERSION,
    kind: 'task-proof-evidence-assessment',
    contract,
    claim,
    review,
    gate: review.gate?.status ?? 'INCONCLUSIVE',
    details: {
      source: 'task-proof/finalizeReviewStrict',
      legacyGateDigest: digestJson(review.gate),
      findingsDigest: digestJson(review.findings ?? []),
      reviewEvidenceDigest: digestJson(review.reviewEvidence ?? []),
    },
  });
}

function lifecycleAssessment(contract, claim, review, snapshot) {
  const comparable = snapshot?.repository?.workingTreeFingerprintComplete !== false
    && snapshot?.repository?.headSha === claim.repository?.headSha
    && snapshot?.snapshotDigest === claim.repository?.snapshotDigest
    && review.repository?.headSha === claim.repository?.headSha;
  return assessment({
    version: LIFECYCLE_ASSESSMENT_VERSION,
    kind: 'task-proof-lifecycle-assessment',
    contract,
    claim,
    review,
    gate: comparable ? 'PASS' : 'STALE',
    details: {
      source: 'exact-repository-snapshot',
      snapshotDigest: snapshot?.snapshotDigest ?? null,
      headSha: snapshot?.repository?.headSha ?? null,
      scope: 'task-acceptance-only; no merge, release, publication, deployment, hardware, or user-outcome promotion',
    },
  });
}

function adaptNamedCheckReceipts(contract, claim, review) {
  const policies = new Map(contract.evidencePolicies.namedChecks.map((item) => [item.id, item]));
  const sourceEvidence = new Map();
  const receipts = [];
  for (const evidence of review.reviewEvidence ?? []) {
    const match = typeof evidence?.locator === 'string' ? /^named-check:([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(evidence.locator) : null;
    if (!match || !policies.has(match[1]) || evidence.receipt?.observation?.type !== 'named_check') continue;
    const observation = evidence.receipt.observation;
    const item = {
      version: NAMED_CHECK_RECEIPT_VERSION,
      kind: 'task-proof-named-check-receipt',
      contractDigest: digestTaskContract(contract),
      claimDigest: digestJson(claim),
      reviewDigest: digestJson(review),
      headSha: claim.repository.headSha,
      producerRunId: review.reviewer.runId,
      locator: evidence.locator,
      supportsCriterionIds: [...(evidence.receipt.supportsCriterionIds ?? [])].sort(),
      policyDigest: observation.policyDigest,
      evidenceKind: observation.evidenceKind,
      executableDigest: observation.executableDigest,
      argsDigest: digestJson(observation.args ?? []),
      workingDirectory: observation.cwd,
      result: {
        status: evidence.result?.exitCode === 0 ? 'pass' : 'fail',
        exitCode: evidence.result?.exitCode ?? 1,
      },
      sourceEvidenceId: evidence.id,
      sourceEvidenceReceiptDigest: evidence.receipt.receiptDigest,
    };
    item.receiptDigest = digestJson(item);
    receipts.push(item);
    sourceEvidence.set(item.receiptDigest, evidence);
  }
  return { receipts, sourceEvidence };
}

function evidenceVerifier(contract, claim, review) {
  const expected = evidenceAssessment(contract, claim, review);
  return (candidate) => ({
    ok: candidate?.assessmentDigest === expected.assessmentDigest
      && candidate?.gate === expected.gate
      && candidate?.details?.legacyGateDigest === expected.details.legacyGateDigest
      && candidate?.details?.findingsDigest === expected.details.findingsDigest
      && candidate?.details?.reviewEvidenceDigest === expected.details.reviewEvidenceDigest,
    assessmentDigest: expected.assessmentDigest,
    gate: expected.gate,
    contractDigest: digestTaskContract(contract),
    claimDigest: digestJson(claim),
    reviewDigest: digestJson(review),
  });
}

function lifecycleVerifier({ repositoryPath, contract, claim, review, basisSnapshot }) {
  const expected = lifecycleAssessment(contract, claim, review, basisSnapshot);
  return (candidate) => {
    let current;
    try {
      current = createRepositorySnapshot({ repositoryPath, baseRef: contract.scope.baseRevision });
    } catch {
      return { ok: false };
    }
    const exact = current.snapshotDigest === basisSnapshot.snapshotDigest
      && current.repository.headSha === claim.repository.headSha
      && current.repository.workingTreeFingerprintComplete !== false;
    return {
      ok: exact
        && candidate?.assessmentDigest === expected.assessmentDigest
        && candidate?.gate === expected.gate,
      assessmentDigest: expected.assessmentDigest,
      gate: expected.gate,
      contractDigest: digestTaskContract(contract),
      claimDigest: digestJson(claim),
      reviewDigest: digestJson(review),
    };
  };
}

function namedCheckVerifier({ contract, claim, review, sourceEvidence }) {
  return ({ receipt }) => {
    const evidence = sourceEvidence.get(receipt.receiptDigest);
    const observation = evidence?.receipt?.observation;
    const exact = Boolean(evidence)
      && evidence.producerRunId === review.reviewer.runId
      && evidence.result?.exitCode === 0
      && evidence.receipt?.snapshotDigest === claim.repository.snapshotDigest
      && observation?.policyDigest === receipt.policyDigest
      && observation?.evidenceKind === receipt.evidenceKind
      && observation?.executableDigest === receipt.executableDigest
      && digestJson(observation?.args ?? []) === receipt.argsDigest
      && observation?.cwd === receipt.workingDirectory;
    return {
      ok: exact,
      receiptDigest: receipt.receiptDigest,
      result: exact ? 'pass' : 'fail',
      contractDigest: digestTaskContract(contract),
      claimDigest: digestJson(claim),
      reviewDigest: digestJson(review),
      headSha: claim.repository.headSha,
      reviewerRunId: review.reviewer.runId,
    };
  };
}

export function contractGateBasisFromFinalReview(finalReview) {
  const basis = cloneJson(finalReview);
  delete basis.legacyGate;
  delete basis.contractGate;
  delete basis.contractGateBasisDigest;
  delete basis.contractAuthorityReceipts;
  delete basis.contractEvidenceAssessment;
  delete basis.contractNamedCheckReceipts;
  delete basis.contractLifecycleAssessment;
  delete basis.artifactDigest;
  delete basis.manifestDigest;
  return basis;
}

export function finalizePublicContractReview({
  repositoryPath = '.', contract, claim, legacyReview, reviewerAttestation, authorityReceipts, snapshot,
}) {
  const normalized = normalizeTaskContract(contract);
  const claimBinding = validateClaimContractBinding(normalized, claim);
  if (!claimBinding.ok) fail('CONTRACT_CLAIM_BINDING', 'Review cannot proceed with an invalid contract-bound Claim.', claimBinding);
  if (!isRecord(legacyReview) || !isRecord(legacyReview.reviewer)) fail('INVALID_REVIEW', 'A complete legacy review artifact is required.');
  const receipts = Array.isArray(authorityReceipts) ? cloneJson(authorityReceipts) : [];
  const basis = {
    ...cloneJson(legacyReview),
    taskId: normalized.taskId,
    legacyClaimDigest: legacyReview.claimDigest,
    claimDigest: digestJson(claim),
    repository: {
      ...cloneJson(legacyReview.repository),
      identity: normalized.repository,
    },
    reviewerAttestation: cloneJson(reviewerAttestation),
    taskContract: cloneJson(normalized),
    claimArtifact: cloneJson(claim),
    contractStatus: cloneJson(claim.contractStatus ?? {
      contractId: normalized.contractId,
      contractDigest: digestTaskContract(normalized),
      authorityLevel: normalized.authority.level,
      sourceCoverageCap: sourceCoverageCap(normalized),
      minimumReviewerLevel: normalized.reviewPolicy.minimumIndependence,
      finalAcceptancePossible: normalized.authority.level !== 'claimant_provisional',
    }),
    contractRef: {
      contractId: normalized.contractId,
      contractDigest: digestTaskContract(normalized),
      authorityDeclarationDigest: digestAuthorityDeclaration(normalized),
      authorityVerificationReceiptDigests: receipts.map((item) => item.receiptDigest).filter(Boolean).sort(),
    },
  };
  delete basis.artifactDigest;
  delete basis.manifestDigest;
  const named = adaptNamedCheckReceipts(normalized, claim, basis);
  const evidence = evidenceAssessment(normalized, claim, basis);
  const lifecycle = lifecycleAssessment(normalized, claim, basis, snapshot);
  const strict = computeStrictContractGate({
    contract: normalized,
    claim,
    review: basis,
    authorityReceipts: receipts,
    authorityAdapter: createPublicRepositoryAuthorityAdapter(repositoryPath),
    evidenceAssessment: evidence,
    evidenceVerifier: evidenceVerifier(normalized, claim, basis),
    namedCheckReceipts: named.receipts,
    namedCheckVerifier: namedCheckVerifier({ contract: normalized, claim, review: basis, sourceEvidence: named.sourceEvidence }),
    lifecycleAssessment: lifecycle,
    lifecycleVerifier: lifecycleVerifier({ repositoryPath, contract: normalized, claim, review: basis, basisSnapshot: snapshot }),
  });
  const legacyGate = cloneJson(basis.gate);
  const finalReview = {
    ...basis,
    legacyGate,
    contractGateBasisDigest: digestJson(basis),
    contractGate: strict,
    contractAuthorityReceipts: receipts,
    contractEvidenceAssessment: evidence,
    contractNamedCheckReceipts: named.receipts,
    contractLifecycleAssessment: lifecycle,
  };
  return {
    gate: strict,
    review: finalReview,
    authorityReceipts: receipts,
    evidenceAssessment: evidence,
    namedCheckReceipts: named.receipts,
    lifecycleAssessment: lifecycle,
  };
}

export function validateFinalPublicContractReview({ contract, claim, review }) {
  if (!isRecord(review) || !isRecord(review.contractGate)) {
    return { ok: false, errors: ['CONTRACT_GATE_REQUIRED'] };
  }
  const basis = contractGateBasisFromFinalReview(review);
  const errors = [];
  if (digestJson(basis) !== review.contractGateBasisDigest) errors.push('CONTRACT_GATE_BASIS_DIGEST');
  let binding;
  try { binding = validateClaimContractBinding(contract, claim); }
  catch (error) { binding = { ok: false, errors: [error?.code ?? 'CONTRACT_CLAIM_BINDING'] }; }
  if (!binding.ok) errors.push(...binding.errors);
  let reviewBinding;
  try {
    reviewBinding = validateReviewContractBinding(
      contract,
      claim,
      basis,
      Array.isArray(review.contractAuthorityReceipts) ? review.contractAuthorityReceipts : [],
    );
  } catch (error) {
    reviewBinding = { ok: false, errors: [error?.code ?? 'CONTRACT_REVIEW_BINDING'] };
  }
  if (!reviewBinding.ok) errors.push(...reviewBinding.errors);
  if (review.taskContract && digestTaskContract(review.taskContract) !== digestTaskContract(contract)) {
    errors.push('CONTRACT_EMBEDDED_DIGEST_MISMATCH');
  }
  if (review.claimArtifact && digestJson(review.claimArtifact) !== digestJson(claim)) {
    errors.push('CONTRACT_EMBEDDED_CLAIM_MISMATCH');
  }
  const legacyStatus = review.gate?.status;
  const contractStatus = review.contractGate?.gate;
  if (!['PASS', 'PASS_WITH_LIMITS', 'FAIL', 'INCONCLUSIVE', 'STALE'].includes(contractStatus)) {
    errors.push('CONTRACT_GATE_STATUS');
  }
  if (['PASS', 'PASS_WITH_LIMITS'].includes(contractStatus)
    && !['PASS', 'PASS_WITH_LIMITS'].includes(legacyStatus)) {
    errors.push('CONTRACT_GATE_EXCEEDS_LEGACY');
  }
  return { ok: errors.length === 0, errors, basisDigest: digestJson(basis), legacyStatus, contractStatus };
}
