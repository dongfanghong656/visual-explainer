import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import {
  TaskProofError,
  finalizeReview,
  sha256,
} from './core.mjs';
import {
  createRepositorySnapshotStrict as createRepositorySnapshot,
  validateRepositorySnapshotStrict as validateSnapshot,
} from './snapshot.mjs';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_PROBES = 100;
const MAX_LOCATORS_PER_CRITERION = 32;
const MAX_LOCATOR_CHARS = 512;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA_RE = /^[0-9a-f]{40}$/i;
const RECEIPT_ISSUER = 'visual-explainer-task-proof-mcp';
const ALLOWED_REQUIRED_KINDS = new Set(['commit', 'diffstat', 'file', 'test', 'build', 'trace', 'manual', 'external']);
const CLAIM_FORBIDDEN_TOP_LEVEL = ['verified', 'verdict', 'gate', 'completionGate', 'reviewer', 'findings', 'reviewEvidence'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureId(value, label) {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new TaskProofError('INVALID_ID', `${label} requires a stable safe id.`);
  }
  return value;
}

function uniqueIds(values, label) {
  const output = [];
  const seen = new Set();
  for (const value of values ?? []) {
    ensureId(value, label);
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
}

function git(repositoryRoot, args, { optional = false, encoding = 'utf8' } = {}) {
  try {
    return execFileSync('git', ['-C', repositoryRoot, ...args], {
      encoding,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      windowsHide: true,
    });
  } catch (error) {
    if (optional) return null;
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim().slice(0, 500) : '';
    throw new TaskProofError('GIT_FAILED', `Git observation failed${stderr ? `: ${stderr}` : '.'}`);
  }
}

function repositoryRoot(repositoryPath) {
  const requested = realpathSync(path.resolve(repositoryPath ?? '.'));
  return realpathSync(git(requested, ['rev-parse', '--show-toplevel']).trim());
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function resolveLexicalPath(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '' || path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new TaskProofError('UNSAFE_PATH', 'Evidence paths must be non-empty repository-relative paths.');
  }
  const candidate = path.resolve(root, relativePath);
  if (!isInside(root, candidate)) throw new TaskProofError('PATH_ESCAPE', 'Evidence path escapes the repository root.');
  return candidate;
}

function resolveRegularFile(root, relativePath) {
  const lexical = resolveLexicalPath(root, relativePath);
  let stat;
  try { stat = lstatSync(lexical); }
  catch { throw new TaskProofError('FILE_NOT_FOUND', `Evidence file does not exist: ${relativePath}`); }
  if (stat.isSymbolicLink()) throw new TaskProofError('SYMLINK_REJECTED', `Symlink evidence is rejected: ${relativePath}`);
  if (!stat.isFile()) throw new TaskProofError('NOT_A_FILE', `Evidence path is not a regular file: ${relativePath}`);
  if (stat.size > MAX_FILE_BYTES) throw new TaskProofError('FILE_TOO_LARGE', `Evidence file exceeds ${MAX_FILE_BYTES} bytes: ${relativePath}`);
  const physical = realpathSync(lexical);
  if (!isInside(root, physical)) throw new TaskProofError('PHYSICAL_PATH_ESCAPE', `A parent symlink escapes the repository: ${relativePath}`);
  return { lexical, physical, stat };
}

function splitNul(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return [];
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function makeReceipt({ snapshotDigest, evidenceId, observation, supportsClaimIds, supportsCriterionIds }) {
  const receipt = {
    issuer: RECEIPT_ISSUER,
    snapshotDigest,
    evidenceId,
    supportsClaimIds: uniqueIds(supportsClaimIds, 'supportsClaimIds'),
    supportsCriterionIds: uniqueIds(supportsCriterionIds, 'supportsCriterionIds'),
    observation,
  };
  receipt.receiptDigest = sha256(receipt);
  return receipt;
}

function semanticDigest(value) {
  const copy = { ...value };
  delete copy.artifactDigest;
  delete copy.manifestDigest;
  return sha256(copy);
}

export function verifyMcpReceipt(evidence, snapshotDigest) {
  if (!isRecord(evidence?.receipt)) return false;
  const { receiptDigest, ...unsigned } = evidence.receipt;
  return evidence.receipt.issuer === RECEIPT_ISSUER
    && evidence.receipt.snapshotDigest === snapshotDigest
    && evidence.receipt.evidenceId === evidence.id
    && typeof receiptDigest === 'string'
    && sha256(unsigned) === receiptDigest;
}

export function validateClaimEvidencePolicy(claim) {
  const errors = [];
  if (!isRecord(claim)) return { ok: false, errors: [{ code: 'TYPE', pointer: '', message: 'Claim must be an object.' }] };
  for (const forbidden of CLAIM_FORBIDDEN_TOP_LEVEL) {
    if (Object.hasOwn(claim, forbidden)) {
      errors.push({ code: 'SELF_VERIFICATION', pointer: `/${forbidden}`, message: `Claimant artifacts may not contain ${forbidden}.` });
    }
  }
  const criteria = claim.task?.acceptanceCriteria;
  if (!Array.isArray(criteria)) return { ok: errors.length === 0, errors };
  for (const [index, criterion] of criteria.entries()) {
    if (!isRecord(criterion)) continue;
    if (criterion.requiredEvidenceKinds !== undefined) {
      if (!Array.isArray(criterion.requiredEvidenceKinds) || criterion.requiredEvidenceKinds.length === 0) {
        errors.push({ code: 'REQUIRED_EVIDENCE_KINDS', pointer: `/task/acceptanceCriteria/${index}/requiredEvidenceKinds`, message: 'requiredEvidenceKinds must be a non-empty array when present.' });
      } else {
        const seen = new Set();
        for (const kind of criterion.requiredEvidenceKinds) {
          if (!ALLOWED_REQUIRED_KINDS.has(kind)) {
            errors.push({ code: 'REQUIRED_EVIDENCE_KIND', pointer: `/task/acceptanceCriteria/${index}/requiredEvidenceKinds`, message: `Unsupported required evidence kind: ${kind}` });
          }
          if (seen.has(kind)) {
            errors.push({ code: 'DUPLICATE_REQUIRED_EVIDENCE_KIND', pointer: `/task/acceptanceCriteria/${index}/requiredEvidenceKinds`, message: `Duplicate required evidence kind: ${kind}` });
          }
          seen.add(kind);
        }
      }
    }
    if (criterion.requiredEvidenceLocators !== undefined) {
      const locators = criterion.requiredEvidenceLocators;
      if (!Array.isArray(locators) || locators.length === 0 || locators.length > MAX_LOCATORS_PER_CRITERION) {
        errors.push({ code: 'REQUIRED_EVIDENCE_LOCATORS', pointer: `/task/acceptanceCriteria/${index}/requiredEvidenceLocators`, message: `requiredEvidenceLocators must contain 1-${MAX_LOCATORS_PER_CRITERION} entries.` });
      } else {
        const seen = new Set();
        for (const locator of locators) {
          if (typeof locator !== 'string' || locator.length === 0 || locator.length > MAX_LOCATOR_CHARS || locator.includes('\0')) {
            errors.push({ code: 'REQUIRED_EVIDENCE_LOCATOR', pointer: `/task/acceptanceCriteria/${index}/requiredEvidenceLocators`, message: 'Evidence locators must be bounded non-empty strings.' });
          }
          if (seen.has(locator)) {
            errors.push({ code: 'DUPLICATE_REQUIRED_EVIDENCE_LOCATOR', pointer: `/task/acceptanceCriteria/${index}/requiredEvidenceLocators`, message: `Duplicate required evidence locator: ${locator}` });
          }
          seen.add(locator);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function probeRepositoryEvidenceStrict({ repositoryPath = '.', reviewerRunId, probes = [], baseRef } = {}) {
  ensureId(reviewerRunId, 'reviewerRunId');
  if (!Array.isArray(probes) || probes.length === 0 || probes.length > MAX_PROBES) {
    throw new TaskProofError('PROBES', `probes must contain between 1 and ${MAX_PROBES} entries.`);
  }
  const root = repositoryRoot(repositoryPath);
  const snapshot = createRepositorySnapshot({ repositoryPath: root, baseRef });
  const snapshotValidation = validateSnapshot(snapshot);
  if (!snapshotValidation.ok) throw new TaskProofError('INVALID_SNAPSHOT', 'Fresh repository snapshot failed validation.', snapshotValidation);
  const seen = new Set();

  const evidence = probes.map((probe, index) => {
    if (!isRecord(probe)) throw new TaskProofError('PROBE', `Probe ${index} must be an object.`);
    const id = ensureId(probe.id, `probe ${index}`);
    if (seen.has(id)) throw new TaskProofError('DUPLICATE_PROBE', `Duplicate probe id: ${id}`);
    seen.add(id);
    const supportsClaimIds = uniqueIds(probe.supportsClaimIds, 'supportsClaimIds');
    const supportsCriterionIds = uniqueIds(probe.supportsCriterionIds, 'supportsCriterionIds');
    if (supportsClaimIds.length === 0 || supportsCriterionIds.length === 0) {
      throw new TaskProofError('UNBOUND_EVIDENCE', `Probe ${id} must support at least one claim and one criterion.`);
    }

    const observedAt = new Date().toISOString();
    let kind;
    let locator;
    let digest;
    let result;
    let observation;

    if (probe.type === 'file_digest') {
      const file = resolveRegularFile(root, probe.path);
      const relative = path.relative(root, file.lexical).split(path.sep).join('/');
      kind = 'file';
      locator = relative;
      digest = sha256(readFileSync(file.physical));
      result = { exitCode: 0, summary: `Observed regular file (${file.stat.size} bytes).` };
      observation = { type: probe.type, path: relative, size: file.stat.size, digest };
    } else if (probe.type === 'commit_exists') {
      if (!SHA_RE.test(probe.sha ?? '')) throw new TaskProofError('COMMIT_SHA', 'commit_exists requires a full 40-character SHA.');
      git(root, ['cat-file', '-e', `${probe.sha}^{commit}`]);
      kind = 'commit';
      locator = probe.sha.toLowerCase();
      digest = sha256(locator);
      result = { exitCode: 0, summary: 'Commit object exists in the reviewed repository.' };
      observation = { type: probe.type, sha: locator };
    } else if (probe.type === 'changed_path') {
      const lexical = resolveLexicalPath(root, probe.path);
      const relative = path.relative(root, lexical).split(path.sep).join('/');
      const committedBuffer = git(root, ['diff', '--name-only', '-z', `${snapshot.repository.baseSha}..${snapshot.repository.headSha}`, '--', relative], { encoding: null });
      const workingBuffer = git(root, ['status', '--porcelain=v1', '-z', '--', relative], { optional: true, encoding: null }) ?? Buffer.alloc(0);
      const committed = splitNul(committedBuffer);
      const workingTreeChanged = workingBuffer.length > 0;
      if (!committed.includes(relative) && !workingTreeChanged) {
        throw new TaskProofError('PATH_NOT_CHANGED', `Path is not changed in the reviewed scope: ${relative}`);
      }
      observation = {
        type: probe.type,
        path: relative,
        committed,
        workingTreeChanged,
        workingStatusDigest: sha256(workingBuffer),
      };
      kind = 'diffstat';
      locator = relative;
      digest = sha256(observation);
      result = { exitCode: 0, summary: 'Path is present in the committed or working-tree change set.' };
    } else {
      throw new TaskProofError('PROBE_TYPE', `Unsupported safe probe type: ${probe.type}`);
    }

    return {
      id,
      kind,
      locator,
      observedAt,
      digest,
      producerRunId: reviewerRunId,
      trust: 'deterministic',
      result,
      receipt: makeReceipt({
        snapshotDigest: snapshot.snapshotDigest,
        evidenceId: id,
        observation,
        supportsClaimIds,
        supportsCriterionIds,
      }),
    };
  });

  return { snapshot, evidence };
}

function criterionMap(claim) {
  return new Map((claim.task?.acceptanceCriteria ?? []).map((criterion) => [criterion.id, criterion]));
}

export function reviewEvidenceCovers(evidence, claimId, criterionId, criterion, snapshotDigest, reviewerRunId) {
  if (!verifyMcpReceipt(evidence, snapshotDigest)) return false;
  if (evidence.producerRunId !== reviewerRunId) return false;
  if (evidence.result?.exitCode !== undefined && evidence.result.exitCode !== 0) return false;
  if (!evidence.receipt.supportsClaimIds.includes(claimId)) return false;
  if (!evidence.receipt.supportsCriterionIds.includes(criterionId)) return false;
  const requiredKinds = Array.isArray(criterion?.requiredEvidenceKinds) ? criterion.requiredEvidenceKinds : [];
  if (requiredKinds.length > 0 && !requiredKinds.includes(evidence.kind)) return false;
  const requiredLocators = Array.isArray(criterion?.requiredEvidenceLocators) ? criterion.requiredEvidenceLocators : [];
  if (requiredLocators.length > 0 && !requiredLocators.includes(evidence.locator)) return false;
  return true;
}

export function computeStrictGateStatus(claims, findings) {
  const findingMap = new Map((findings ?? []).map((finding) => [finding.claimId, finding]));
  const relevant = (claims ?? [])
    .filter((claim) => claim.declaredStatus === 'declared_done')
    .map((claim) => findingMap.get(claim.id));
  if (relevant.length === 0) return 'INCONCLUSIVE';
  if (relevant.some((finding) => !finding || finding.verdict === 'unsupported' || finding.verdict === 'contradicted')) return 'FAIL';
  if (relevant.some((finding) => finding.verdict === 'stale')) return 'INCONCLUSIVE';
  if (relevant.every((finding) => finding.verdict === 'verified')) return 'PASS';
  if (relevant.every((finding) => ['verified', 'partially_verified'].includes(finding.verdict))
      && relevant.some((finding) => finding.verdict === 'partially_verified')) return 'PASS_WITH_LIMITS';
  return 'INCONCLUSIVE';
}

export function evaluateFindingCoverage({ claimItem, criterionMap: criteria, evidenceById, finding, snapshotDigest, reviewerRunId }) {
  const cited = [...new Set(finding.reviewEvidenceIds ?? [])]
    .map((id) => evidenceById.get(id))
    .filter(Boolean);
  const covered = [];
  const uncovered = [];
  for (const criterionId of claimItem.acceptanceCriteriaIds ?? []) {
    const criterion = criteria.get(criterionId);
    if (cited.some((evidence) => reviewEvidenceCovers(
      evidence,
      claimItem.id,
      criterionId,
      criterion,
      snapshotDigest,
      reviewerRunId,
    ))) covered.push(criterionId);
    else uncovered.push(criterionId);
  }
  return { cited, covered, uncovered };
}

export function finalizeReviewStrict({ claim, reviewer, snapshot, findings = [], reviewEvidence = [] }) {
  const snapshotValidation = validateSnapshot(snapshot);
  if (!snapshotValidation.ok) throw new TaskProofError('INVALID_SNAPSHOT', 'Review snapshot validation failed.', snapshotValidation);
  if (snapshot.repository?.workingTreeFingerprintComplete === false) {
    throw new TaskProofError('INCOMPLETE_SNAPSHOT', 'Review cannot issue a gate from an incompletely fingerprinted dirty working tree.', {
      reasons: snapshot.repository.workingTreeFingerprintIncompleteReasons ?? [],
    });
  }
  if (!isRecord(reviewer) || reviewer.runId === claim?.producer?.runId) {
    throw new TaskProofError('NOT_INDEPENDENT', 'Reviewer runId must differ from claimant runId.');
  }
  const evidenceById = new Map();
  for (const evidence of reviewEvidence) {
    if (evidenceById.has(evidence.id)) throw new TaskProofError('DUPLICATE_EVIDENCE', `Duplicate review evidence id: ${evidence.id}`);
    evidenceById.set(evidence.id, evidence);
  }
  const criteria = criterionMap(claim);
  const submitted = new Map();
  for (const finding of findings) {
    if (submitted.has(finding.claimId)) throw new TaskProofError('DUPLICATE_FINDING', `Duplicate finding for claim: ${finding.claimId}`);
    submitted.set(finding.claimId, finding);
  }
  const hardenedFindings = (claim.claims ?? []).map((claimItem) => {
    const finding = submitted.get(claimItem.id) ?? {
      claimId: claimItem.id,
      verdict: 'unsupported',
      rationale: 'No independent finding was supplied.',
      reviewEvidenceIds: [],
    };
    if (!['verified', 'partially_verified'].includes(finding.verdict)) return finding;
    const coverage = evaluateFindingCoverage({
      claimItem,
      criterionMap: criteria,
      evidenceById,
      finding,
      snapshotDigest: snapshot.snapshotDigest,
      reviewerRunId: reviewer.runId,
    });
    if (finding.verdict === 'verified' && coverage.uncovered.length > 0) {
      return {
        ...finding,
        verdict: 'unsupported',
        rationale: `${finding.rationale} Missing reviewer-produced evidence coverage for: ${coverage.uncovered.join(', ')}.`,
      };
    }
    if (finding.verdict === 'partially_verified' && coverage.covered.length === 0) {
      return {
        ...finding,
        verdict: 'unsupported',
        rationale: `${finding.rationale} No referenced acceptance criterion has qualifying reviewer-produced evidence.`,
      };
    }
    if (finding.verdict === 'partially_verified') {
      return {
        ...finding,
        rationale: `${finding.rationale} Covered: ${coverage.covered.join(', ') || 'none'}; unresolved: ${coverage.uncovered.join(', ') || 'none'}.`,
      };
    }
    return finding;
  });

  const review = finalizeReview({ claim, reviewer, snapshot, findings: hardenedFindings, reviewEvidence });
  review.risks = Array.isArray(claim.risks) ? claim.risks : [];
  review.unknowns = Array.isArray(claim.unknowns) ? claim.unknowns : [];
  review.nextSteps = Array.isArray(claim.nextSteps) ? claim.nextSteps : [];
  review.gate.status = computeStrictGateStatus(review.claims, review.findings);
  review.artifactDigest = semanticDigest(review);
  return review;
}

export function mergeReviewEvidence(results) {
  const nonEmpty = results.filter(Boolean);
  if (nonEmpty.length === 0) return { snapshot: null, evidence: [] };
  const firstDigest = nonEmpty[0].snapshot.snapshotDigest;
  if (nonEmpty.some((result) => result.snapshot.snapshotDigest !== firstDigest)) {
    throw new TaskProofError('SNAPSHOT_RACE', 'Repository changed while review evidence was being collected. Restart review.');
  }
  const evidence = [];
  const seen = new Set();
  for (const result of nonEmpty) {
    for (const item of result.evidence) {
      if (seen.has(item.id)) throw new TaskProofError('DUPLICATE_EVIDENCE', `Duplicate review evidence id: ${item.id}`);
      seen.add(item.id);
      evidence.push(item);
    }
  }
  return { snapshot: nonEmpty[0].snapshot, evidence };
}
