import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const PROTOCOL_VERSION = '0.2.0';
export const CLAIM_KIND = 'task-proof/claim';
export const REVIEW_KIND = 'task-proof/review';
export const SNAPSHOT_KIND = 'task-proof/snapshot';

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA_RE = /^[0-9a-f]{40}$/i;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/i;
const CLAIM_STATUSES = new Set(['declared_done', 'partial', 'blocked', 'not_done']);
const VERDICTS = new Set(['verified', 'partially_verified', 'unsupported', 'contradicted', 'stale', 'not_applicable']);
const EVIDENCE_KINDS = new Set(['commit', 'diffstat', 'file', 'test', 'build', 'trace', 'manual', 'external']);
const TRUST = Object.freeze({ self_report: 0, artifact: 1, deterministic: 2, independent: 3, external: 4 });

export class TaskProofError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'TaskProofError';
    this.code = code;
    this.details = details;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TaskProofError('INVALID_NUMBER', 'Canonical JSON does not allow non-finite numbers.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) throw new TaskProofError('UNSUPPORTED_VALUE', `Unsupported canonical JSON value: ${typeof value}`);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    output[key] = canonicalize(value[key]);
  }
  return output;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === 'string' ? value : stableStringify(value), 'utf8');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function artifactDigest(value) {
  const copy = isRecord(value) ? { ...value } : value;
  if (isRecord(copy)) {
    delete copy.artifactDigest;
    delete copy.manifestDigest;
  }
  return sha256(copy);
}

function payloadSize(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function addIssue(list, code, message, pointer = '') {
  list.push({ code, message, pointer });
}

function validIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function uniqueById(items, pointer, errors) {
  const map = new Map();
  if (!Array.isArray(items)) {
    addIssue(errors, 'TYPE', 'Expected an array.', pointer);
    return map;
  }
  items.forEach((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !ID_RE.test(item.id)) {
      addIssue(errors, 'INVALID_ID', 'Every item requires a stable, safe id.', `${pointer}/${index}/id`);
      return;
    }
    if (map.has(item.id)) addIssue(errors, 'DUPLICATE_ID', `Duplicate id: ${item.id}`, `${pointer}/${index}/id`);
    else map.set(item.id, item);
  });
  return map;
}

function validateEvidence(evidence, pointer, claimantRunId, errors, warnings) {
  if (!isRecord(evidence)) {
    addIssue(errors, 'TYPE', 'Evidence must be an object.', pointer);
    return;
  }
  if (!EVIDENCE_KINDS.has(evidence.kind)) addIssue(errors, 'EVIDENCE_KIND', 'Unsupported evidence kind.', `${pointer}/kind`);
  if (!(evidence.trust in TRUST)) addIssue(errors, 'EVIDENCE_TRUST', 'Unsupported evidence trust level.', `${pointer}/trust`);
  if (typeof evidence.locator !== 'string' || evidence.locator.trim() === '') addIssue(errors, 'EVIDENCE_LOCATOR', 'Evidence requires a locator.', `${pointer}/locator`);
  if (typeof evidence.producerRunId !== 'string' || !ID_RE.test(evidence.producerRunId)) addIssue(errors, 'EVIDENCE_PRODUCER', 'Evidence requires producerRunId.', `${pointer}/producerRunId`);
  if (evidence.digest !== undefined && !DIGEST_RE.test(evidence.digest)) addIssue(errors, 'EVIDENCE_DIGEST', 'Evidence digest must be sha256:<64 hex>.', `${pointer}/digest`);
  if (evidence.observedAt !== undefined && !validIsoDate(evidence.observedAt)) addIssue(errors, 'EVIDENCE_TIME', 'observedAt must be an ISO timestamp.', `${pointer}/observedAt`);
  if ((evidence.trust === 'independent' || evidence.trust === 'external') && evidence.producerRunId === claimantRunId) {
    addIssue(errors, 'FALSE_INDEPENDENCE', 'The claimant run cannot label its own evidence independent or external.', `${pointer}/trust`);
  }
  if ((evidence.kind === 'test' || evidence.kind === 'build') && !isRecord(evidence.result)) {
    addIssue(warnings, 'MISSING_RESULT', 'Test/build evidence without a structured result cannot verify completion.', `${pointer}/result`);
  }
  if (isRecord(evidence.result) && evidence.result.exitCode !== undefined && !Number.isInteger(evidence.result.exitCode)) {
    addIssue(errors, 'EXIT_CODE', 'result.exitCode must be an integer.', `${pointer}/result/exitCode`);
  }
}

export function validateClaim(claim) {
  const errors = [];
  const warnings = [];
  if (!isRecord(claim)) return { ok: false, errors: [{ code: 'TYPE', message: 'Claim must be an object.', pointer: '' }], warnings };
  if (payloadSize(claim) > MAX_PAYLOAD_BYTES) addIssue(errors, 'PAYLOAD_TOO_LARGE', 'Claim exceeds the 2 MiB limit.');
  if (claim.protocolVersion !== PROTOCOL_VERSION) addIssue(errors, 'PROTOCOL_VERSION', `Expected protocolVersion ${PROTOCOL_VERSION}.`, '/protocolVersion');
  if (claim.kind !== CLAIM_KIND) addIssue(errors, 'KIND', `Expected kind ${CLAIM_KIND}.`, '/kind');
  if (typeof claim.id !== 'string' || !ID_RE.test(claim.id)) addIssue(errors, 'INVALID_ID', 'Claim requires a stable id.', '/id');
  if (!validIsoDate(claim.generatedAt)) addIssue(errors, 'GENERATED_AT', 'generatedAt must be an ISO timestamp.', '/generatedAt');

  const claimantRunId = claim.producer?.runId;
  if (!isRecord(claim.producer) || typeof claimantRunId !== 'string' || !ID_RE.test(claimantRunId)) {
    addIssue(errors, 'PRODUCER', 'producer.runId is required.', '/producer/runId');
  }
  if (claim.producer?.role !== 'claimant') addIssue(errors, 'PRODUCER_ROLE', 'Claim producer role must be claimant.', '/producer/role');

  if (!isRecord(claim.repository)) addIssue(errors, 'REPOSITORY', 'repository is required.', '/repository');
  else {
    if (!SHA_RE.test(claim.repository.headSha ?? '')) addIssue(errors, 'HEAD_SHA', 'repository.headSha must be a full 40-character SHA.', '/repository/headSha');
    if (!SHA_RE.test(claim.repository.baseSha ?? '')) addIssue(errors, 'BASE_SHA', 'repository.baseSha must be a full 40-character SHA.', '/repository/baseSha');
    if (!DIGEST_RE.test(claim.repository.snapshotDigest ?? '')) addIssue(errors, 'SNAPSHOT_DIGEST', 'repository.snapshotDigest is required.', '/repository/snapshotDigest');
    if (typeof claim.repository.branch !== 'string' || claim.repository.branch.trim() === '') addIssue(errors, 'BRANCH', 'repository.branch is required.', '/repository/branch');
  }

  if (!isRecord(claim.task)) addIssue(errors, 'TASK', 'task is required.', '/task');
  else {
    if (typeof claim.task.id !== 'string' || !ID_RE.test(claim.task.id)) addIssue(errors, 'TASK_ID', 'task.id is required.', '/task/id');
    if (typeof claim.task.title !== 'string' || claim.task.title.trim() === '') addIssue(errors, 'TASK_TITLE', 'task.title is required.', '/task/title');
    if (typeof claim.task.objective !== 'string' || claim.task.objective.trim() === '') addIssue(errors, 'TASK_OBJECTIVE', 'task.objective is required.', '/task/objective');
  }

  const criteria = uniqueById(claim.task?.acceptanceCriteria ?? [], '/task/acceptanceCriteria', errors);
  const evidence = uniqueById(claim.evidence ?? [], '/evidence', errors);
  [...evidence.entries()].forEach(([id, item]) => validateEvidence(item, `/evidence/${id}`, claimantRunId, errors, warnings));
  const claims = uniqueById(claim.claims ?? [], '/claims', errors);
  if (claims.size === 0) addIssue(errors, 'NO_CLAIMS', 'At least one claim is required.', '/claims');

  for (const [id, item] of claims.entries()) {
    const pointer = `/claims/${id}`;
    if (!CLAIM_STATUSES.has(item.declaredStatus)) addIssue(errors, 'CLAIM_STATUS', 'Unsupported declaredStatus.', `${pointer}/declaredStatus`);
    if (typeof item.statement !== 'string' || item.statement.trim() === '') addIssue(errors, 'CLAIM_STATEMENT', 'Claim statement is required.', `${pointer}/statement`);
    for (const forbidden of ['verified', 'verdict', 'gate', 'completionGate']) {
      if (Object.hasOwn(item, forbidden)) addIssue(errors, 'SELF_VERIFICATION', `Claimant artifacts may not set ${forbidden}.`, `${pointer}/${forbidden}`);
    }
    const criterionIds = Array.isArray(item.acceptanceCriteriaIds) ? item.acceptanceCriteriaIds : [];
    const evidenceIds = Array.isArray(item.evidenceIds) ? item.evidenceIds : [];
    for (const criterionId of criterionIds) if (!criteria.has(criterionId)) addIssue(errors, 'UNKNOWN_CRITERION', `Unknown acceptance criterion: ${criterionId}`, `${pointer}/acceptanceCriteriaIds`);
    for (const evidenceId of evidenceIds) if (!evidence.has(evidenceId)) addIssue(errors, 'UNKNOWN_EVIDENCE', `Unknown evidence: ${evidenceId}`, `${pointer}/evidenceIds`);
    if (item.declaredStatus === 'declared_done') {
      if (criterionIds.length === 0) addIssue(errors, 'DONE_WITHOUT_CRITERIA', 'Declared-done claims require acceptance criteria.', `${pointer}/acceptanceCriteriaIds`);
      if (evidenceIds.length === 0) addIssue(errors, 'DONE_WITHOUT_EVIDENCE', 'Declared-done claims require evidence.', `${pointer}/evidenceIds`);
      for (const evidenceId of evidenceIds) {
        const entry = evidence.get(evidenceId);
        if ((entry?.kind === 'test' || entry?.kind === 'build') && entry.result?.exitCode !== 0) {
          addIssue(errors, 'FAILED_EVIDENCE', `Declared-done claim cites a failing ${entry.kind}.`, `${pointer}/evidenceIds`);
        }
      }
    }
  }

  const locatorUse = new Map();
  for (const item of evidence.values()) {
    if (typeof item.locator !== 'string') continue;
    const key = `${item.kind}:${item.locator}`;
    locatorUse.set(key, (locatorUse.get(key) ?? 0) + 1);
  }
  for (const [locator, count] of locatorUse.entries()) {
    if (count > 1) addIssue(warnings, 'DUPLICATE_EVIDENCE_LOCATOR', `Evidence locator is repeated ${count} times: ${locator}`, '/evidence');
  }

  return { ok: errors.length === 0, errors, warnings, digest: errors.length === 0 ? artifactDigest(claim) : undefined };
}

export function assertValidClaim(claim) {
  const result = validateClaim(claim);
  if (!result.ok) throw new TaskProofError('INVALID_CLAIM', 'Claim validation failed.', result);
  return result;
}

function evidenceQualifies(entry, reviewerRunId) {
  if (!entry || entry.producerRunId !== reviewerRunId) return false;
  if (!(entry.trust in TRUST) || TRUST[entry.trust] < TRUST.deterministic) return false;
  if ((entry.kind === 'test' || entry.kind === 'build') && entry.result?.exitCode !== 0) return false;
  return Boolean(entry.digest || entry.result?.exitCode === 0 || entry.trust === 'independent' || entry.trust === 'external');
}

export function finalizeReview({ claim, reviewer, snapshot, findings = [], reviewEvidence = [] }) {
  const claimValidation = assertValidClaim(claim);
  const errors = [];
  const warnings = [...claimValidation.warnings];
  if (!isRecord(reviewer) || typeof reviewer.runId !== 'string' || !ID_RE.test(reviewer.runId)) addIssue(errors, 'REVIEWER', 'reviewer.runId is required.', '/reviewer/runId');
  if (reviewer?.role !== 'reviewer') addIssue(errors, 'REVIEWER_ROLE', 'reviewer.role must be reviewer.', '/reviewer/role');
  if (reviewer?.runId === claim.producer.runId) addIssue(errors, 'NOT_INDEPENDENT', 'Reviewer runId must differ from claimant runId.', '/reviewer/runId');

  const reviewEvidenceMap = uniqueById(reviewEvidence, '/reviewEvidence', errors);
  for (const [id, item] of reviewEvidenceMap.entries()) validateEvidence(item, `/reviewEvidence/${id}`, claim.producer.runId, errors, warnings);
  const findingMap = uniqueById(findings.map((item) => ({ ...item, id: item.claimId })), '/findings', errors);
  const staleSnapshot = !isRecord(snapshot)
    || snapshot.kind !== SNAPSHOT_KIND
    || snapshot.repository?.headSha !== claim.repository.headSha
    || snapshot.snapshotDigest !== claim.repository.snapshotDigest;

  const normalizedFindings = [];
  for (const claimItem of claim.claims) {
    const submitted = findingMap.get(claimItem.id);
    let verdict = submitted?.verdict ?? 'unsupported';
    const rationale = typeof submitted?.rationale === 'string' && submitted.rationale.trim()
      ? submitted.rationale.trim()
      : 'No independent rationale was supplied.';
    const reviewEvidenceIds = Array.isArray(submitted?.reviewEvidenceIds) ? [...new Set(submitted.reviewEvidenceIds)] : [];
    if (!VERDICTS.has(verdict)) {
      addIssue(errors, 'VERDICT', `Unsupported verdict for ${claimItem.id}.`, `/findings/${claimItem.id}/verdict`);
      verdict = 'unsupported';
    }
    if (staleSnapshot && claimItem.declaredStatus === 'declared_done') verdict = 'stale';
    if (verdict === 'verified') {
      const qualifying = reviewEvidenceIds
        .map((id) => reviewEvidenceMap.get(id))
        .some((entry) => evidenceQualifies(entry, reviewer?.runId));
      if (!qualifying) {
        verdict = 'unsupported';
        addIssue(warnings, 'VERDICT_DOWNGRADED', `${claimItem.id} was downgraded because no qualifying reviewer-produced evidence was supplied.`, `/findings/${claimItem.id}`);
      }
    }
    for (const evidenceId of reviewEvidenceIds) {
      if (!reviewEvidenceMap.has(evidenceId)) addIssue(errors, 'UNKNOWN_REVIEW_EVIDENCE', `Unknown review evidence: ${evidenceId}`, `/findings/${claimItem.id}/reviewEvidenceIds`);
    }
    normalizedFindings.push({ claimId: claimItem.id, declaredStatus: claimItem.declaredStatus, verdict, rationale, reviewEvidenceIds });
  }

  if (errors.length) throw new TaskProofError('INVALID_REVIEW', 'Review validation failed.', { errors, warnings });

  const relevant = normalizedFindings.filter((item) => item.declaredStatus === 'declared_done');
  let status = 'INCONCLUSIVE';
  if (relevant.some((item) => item.verdict === 'contradicted' || item.verdict === 'unsupported')) status = 'FAIL';
  else if (relevant.some((item) => item.verdict === 'stale')) status = 'INCONCLUSIVE';
  else if (relevant.length > 0 && relevant.every((item) => item.verdict === 'verified')) status = 'PASS';
  else if (relevant.some((item) => item.verdict === 'partially_verified')) status = 'PASS_WITH_LIMITS';

  const review = {
    protocolVersion: PROTOCOL_VERSION,
    kind: REVIEW_KIND,
    id: `${claim.id}/review/${reviewer.runId}`,
    generatedAt: new Date().toISOString(),
    reviewer: { ...reviewer },
    claimId: claim.id,
    claimDigest: claimValidation.digest,
    repository: {
      branch: snapshot?.repository?.branch ?? claim.repository.branch,
      baseSha: snapshot?.repository?.baseSha ?? claim.repository.baseSha,
      headSha: snapshot?.repository?.headSha ?? claim.repository.headSha,
      snapshotDigest: snapshot?.snapshotDigest ?? 'missing',
      staleAgainstClaim: staleSnapshot,
    },
    task: claim.task,
    change: claim.change ?? {},
    claims: claim.claims,
    findings: normalizedFindings,
    reviewEvidence,
    gate: {
      status,
      verifiedClaimIds: normalizedFindings.filter((item) => item.verdict === 'verified').map((item) => item.claimId),
      rejectedClaimIds: normalizedFindings.filter((item) => ['unsupported', 'contradicted'].includes(item.verdict)).map((item) => item.claimId),
      staleClaimIds: normalizedFindings.filter((item) => item.verdict === 'stale').map((item) => item.claimId),
      rule: 'Only the review artifact may issue a completion gate; every declared-done claim must be independently verified for PASS.',
    },
    warnings,
  };
  review.artifactDigest = artifactDigest(review);
  return review;
}

function assertSafeRef(ref) {
  if (ref === undefined || ref === null || ref === '') return;
  if (typeof ref !== 'string' || ref.length > 200 || ref.startsWith('-') || /[\0-\x20~^:?*\\[\]]/.test(ref)) {
    throw new TaskProofError('UNSAFE_REF', 'Git ref contains unsafe or invalid characters.');
  }
}

function runGit(repositoryRoot, args, { optional = false } = {}) {
  try {
    return execFileSync('git', ['-C', repositoryRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      windowsHide: true,
    }).trim();
  } catch (error) {
    if (optional) return null;
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim().slice(0, 500) : '';
    throw new TaskProofError('GIT_FAILED', `Git command failed: git ${args.join(' ')}${stderr ? ` — ${stderr}` : ''}`);
  }
}

function sanitizeRemote(remote) {
  if (!remote) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(remote)) {
    try {
      const url = new URL(remote);
      url.username = '';
      url.password = '';
      return url.toString();
    } catch {
      return remote.replace(/\/\/[^/@]+@/, '//[redacted]@');
    }
  }
  return remote.replace(/^([^@]+)@/, '[redacted]@');
}

function parseNameStatus(text) {
  if (!text) return [];
  return text.split('\n').filter(Boolean).slice(0, 1000).map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status, paths: paths.slice(0, 2) };
  });
}

function parsePorcelainZ(text) {
  if (!text) return [];
  return text.split('\0').filter(Boolean).slice(0, 1000).map((entry) => ({ status: entry.slice(0, 2), path: entry.slice(3) }));
}

export function createRepositorySnapshot({ repositoryPath = '.', baseRef } = {}) {
  assertSafeRef(baseRef);
  const requested = realpathSync(path.resolve(repositoryPath));
  const repositoryRoot = realpathSync(runGit(requested, ['rev-parse', '--show-toplevel']));
  const headSha = runGit(repositoryRoot, ['rev-parse', 'HEAD']);
  const resolvedBase = baseRef
    ? runGit(repositoryRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`])
    : (runGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD^'], { optional: true }) ?? headSha);
  const branch = runGit(repositoryRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { optional: true }) ?? 'DETACHED';
  const remote = sanitizeRemote(runGit(repositoryRoot, ['config', '--get', 'remote.origin.url'], { optional: true }));
  const statusRaw = runGit(repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'], { optional: true }) ?? '';
  const workingTreeChanges = parsePorcelainZ(statusRaw);
  const committedChanges = parseNameStatus(runGit(repositoryRoot, ['diff', '--name-status', '--find-renames', `${resolvedBase}..${headSha}`], { optional: true }) ?? '');
  const recentCommits = (runGit(repositoryRoot, ['log', '-5', '--format=%H%x09%aI%x09%s'], { optional: true }) ?? '')
    .split('\n').filter(Boolean).map((line) => {
      const [sha, authoredAt, ...subject] = line.split('\t');
      return { sha, authoredAt, subject: subject.join('\t').slice(0, 300) };
    });
  const fingerprint = {
    repositoryName: path.basename(repositoryRoot),
    remote,
    branch,
    baseSha: resolvedBase,
    headSha,
    dirty: workingTreeChanges.length > 0,
    committedChanges,
    workingTreeChanges,
    recentCommits,
  };
  const snapshot = {
    protocolVersion: PROTOCOL_VERSION,
    kind: SNAPSHOT_KIND,
    observedAt: new Date().toISOString(),
    repository: fingerprint,
  };
  snapshot.snapshotDigest = sha256(fingerprint);
  return snapshot;
}

function resolveRepositoryFile(repositoryRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '' || path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new TaskProofError('UNSAFE_PATH', 'Probe paths must be non-empty repository-relative paths.');
  }
  const resolved = path.resolve(repositoryRoot, relativePath);
  const prefix = `${repositoryRoot}${path.sep}`;
  if (resolved !== repositoryRoot && !resolved.startsWith(prefix)) {
    throw new TaskProofError('PATH_ESCAPE', 'Probe path escapes the repository root.');
  }
  return resolved;
}

export function probeRepositoryEvidence({ repositoryPath = '.', reviewerRunId, probes = [], baseRef } = {}) {
  if (typeof reviewerRunId !== 'string' || !ID_RE.test(reviewerRunId)) {
    throw new TaskProofError('REVIEWER_RUN_ID', 'reviewerRunId is required for deterministic evidence receipts.');
  }
  if (!Array.isArray(probes) || probes.length === 0 || probes.length > 100) {
    throw new TaskProofError('PROBES', 'probes must contain between 1 and 100 entries.');
  }
  const snapshot = createRepositorySnapshot({ repositoryPath, baseRef });
  const repositoryRoot = realpathSync(runGit(realpathSync(path.resolve(repositoryPath)), ['rev-parse', '--show-toplevel']));
  const seen = new Set();
  const evidence = probes.map((probe, index) => {
    if (!isRecord(probe) || typeof probe.id !== 'string' || !ID_RE.test(probe.id) || seen.has(probe.id)) {
      throw new TaskProofError('PROBE_ID', `Probe ${index} requires a unique safe id.`);
    }
    seen.add(probe.id);
    const observedAt = new Date().toISOString();
    if (probe.type === 'file_digest') {
      const filename = resolveRepositoryFile(repositoryRoot, probe.path);
      let stat;
      try { stat = lstatSync(filename); } catch { throw new TaskProofError('FILE_NOT_FOUND', `Probe file does not exist: ${probe.path}`); }
      if (stat.isSymbolicLink()) throw new TaskProofError('SYMLINK_REJECTED', `Symlink probes are rejected by default: ${probe.path}`);
      if (!stat.isFile()) throw new TaskProofError('NOT_A_FILE', `Probe path is not a regular file: ${probe.path}`);
      if (stat.size > 5 * 1024 * 1024) throw new TaskProofError('FILE_TOO_LARGE', `Probe file exceeds 5 MiB: ${probe.path}`);
      const digest = sha256(readFileSync(filename));
      return {
        id: probe.id,
        kind: 'file',
        locator: probe.path,
        observedAt,
        digest,
        producerRunId: reviewerRunId,
        trust: 'deterministic',
        result: { exitCode: 0, summary: `Regular file observed (${stat.size} bytes).` },
        receipt: { type: probe.type, snapshotDigest: snapshot.snapshotDigest },
      };
    }
    if (probe.type === 'commit_exists') {
      if (!SHA_RE.test(probe.sha ?? '')) throw new TaskProofError('COMMIT_SHA', 'commit_exists requires a full 40-character SHA.');
      runGit(repositoryRoot, ['cat-file', '-e', `${probe.sha}^{commit}`]);
      return {
        id: probe.id,
        kind: 'commit',
        locator: probe.sha,
        observedAt,
        digest: sha256(probe.sha),
        producerRunId: reviewerRunId,
        trust: 'deterministic',
        result: { exitCode: 0, summary: 'Commit object exists in the reviewed repository.' },
        receipt: { type: probe.type, snapshotDigest: snapshot.snapshotDigest },
      };
    }
    if (probe.type === 'changed_path') {
      const filename = resolveRepositoryFile(repositoryRoot, probe.path);
      const relative = path.relative(repositoryRoot, filename).split(path.sep).join('/');
      const committed = runGit(repositoryRoot, ['diff', '--name-only', `${snapshot.repository.baseSha}..${snapshot.repository.headSha}`, '--', relative], { optional: true }) ?? '';
      const working = runGit(repositoryRoot, ['status', '--porcelain=v1', '--', relative], { optional: true }) ?? '';
      if (!committed.split('\n').includes(relative) && working.trim() === '') {
        throw new TaskProofError('PATH_NOT_CHANGED', `Path is not changed in the reviewed scope: ${relative}`);
      }
      const receiptPayload = { relative, committed: committed.split('\n').filter(Boolean), working: working.trim(), snapshotDigest: snapshot.snapshotDigest };
      return {
        id: probe.id,
        kind: 'diffstat',
        locator: relative,
        observedAt,
        digest: sha256(receiptPayload),
        producerRunId: reviewerRunId,
        trust: 'deterministic',
        result: { exitCode: 0, summary: 'Path is present in the committed or working-tree change set.' },
        receipt: { type: probe.type, snapshotDigest: snapshot.snapshotDigest },
      };
    }
    throw new TaskProofError('PROBE_TYPE', `Unsupported probe type: ${probe.type}`);
  });
  return { snapshot, evidence };
}

export function validateSnapshot(snapshot) {
  const errors = [];
  if (!isRecord(snapshot) || snapshot.kind !== SNAPSHOT_KIND) addIssue(errors, 'SNAPSHOT_KIND', `Expected ${SNAPSHOT_KIND}.`, '/kind');
  if (!SHA_RE.test(snapshot?.repository?.headSha ?? '')) addIssue(errors, 'HEAD_SHA', 'Snapshot requires a full head SHA.', '/repository/headSha');
  if (!DIGEST_RE.test(snapshot?.snapshotDigest ?? '')) addIssue(errors, 'SNAPSHOT_DIGEST', 'Snapshot digest is missing.', '/snapshotDigest');
  const expected = isRecord(snapshot?.repository) ? sha256(snapshot.repository) : undefined;
  if (expected && snapshot.snapshotDigest !== expected) addIssue(errors, 'SNAPSHOT_TAMPERED', 'Snapshot digest does not match its repository payload.', '/snapshotDigest');
  return { ok: errors.length === 0, errors, expectedDigest: expected };
}

function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function shorten(value, limit = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function wrap(value, width = 42, maxLines = 4) {
  const text = shorten(value, width * maxLines * 2);
  const spaced = /\s/.test(text);
  const tokens = spaced ? text.split(/\s+/) : [...text];
  const lines = [];
  let current = '';
  for (const token of tokens) {
    const separator = spaced && current ? ' ' : '';
    if ((current + separator + token).length > width && current) {
      lines.push(current);
      current = token;
      if (lines.length === maxLines - 1) break;
    } else current += separator + token;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.join(spaced ? ' ' : '').length < text.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
  return lines;
}

function textBlock(x, y, lines, { size = 20, weight = 400, lineHeight = 28, fill = '#e7ecf3' } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xmlEscape(line)}</tspan>`).join('')}</text>`;
}

function box(x, y, width, height, title, body, accent = '#6ea8fe') {
  const titleLines = wrap(title, Math.max(12, Math.floor(width / 12)), 2);
  const bodyLines = wrap(body, Math.max(14, Math.floor(width / 10)), 5);
  return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16" fill="#171d27" stroke="${accent}" stroke-width="2"/><rect x="${x}" y="${y}" width="8" height="${height}" rx="4" fill="${accent}"/>${textBlock(x + 24, y + 35, titleLines, { size: 20, weight: 700, lineHeight: 24 })}${textBlock(x + 24, y + 88, bodyLines, { size: 17, lineHeight: 23, fill: '#b9c3d2' })}</g>`;
}

export function renderTaskProofSvg(artifact) {
  if (!isRecord(artifact) || ![CLAIM_KIND, REVIEW_KIND].includes(artifact.kind)) throw new TaskProofError('RENDER_KIND', 'Only claim and review artifacts can be rendered.');
  const isReview = artifact.kind === REVIEW_KIND;
  const gate = isReview ? artifact.gate?.status ?? 'INCONCLUSIVE' : 'UNVERIFIED';
  const badgeColor = ({ PASS: '#36c98f', PASS_WITH_LIMITS: '#e8b44f', FAIL: '#f56c7a', INCONCLUSIVE: '#9aa7b8', UNVERIFIED: '#8d7cf0' })[gate] ?? '#9aa7b8';
  const claims = Array.isArray(artifact.claims) ? artifact.claims.slice(0, 4) : [];
  const findings = new Map((artifact.findings ?? []).map((item) => [item.claimId, item]));
  const evidence = (isReview ? artifact.reviewEvidence : artifact.evidence) ?? [];
  const before = artifact.change?.before ?? artifact.change?.oldFailure ?? [];
  const after = artifact.change?.after ?? artifact.change?.newFlow ?? [];
  const objective = artifact.task?.objective ?? 'No objective recorded.';
  const thesis = artifact.change?.thesis ?? 'No change thesis recorded.';
  const digest = artifact.artifactDigest ?? artifactDigest(artifact);

  const claimBoxes = claims.map((item, index) => {
    const finding = findings.get(item.id);
    const label = isReview ? (finding?.verdict ?? 'unsupported') : item.declaredStatus;
    const accent = ({ verified: '#36c98f', partially_verified: '#e8b44f', contradicted: '#f56c7a', unsupported: '#f56c7a', stale: '#9aa7b8', declared_done: '#8d7cf0', partial: '#e8b44f', blocked: '#f56c7a', not_done: '#9aa7b8' })[label] ?? '#6ea8fe';
    return box(560, 150 + index * 132, 560, 112, `${item.id} · ${label}`, item.statement, accent);
  }).join('');

  const evidenceLines = evidence.slice(0, 7).map((item) => `${item.id}: ${item.kind} · ${shorten(item.locator, 48)}`);
  const flowBefore = Array.isArray(before) ? before.slice(0, 3).join(' → ') : String(before);
  const flowAfter = Array.isArray(after) ? after.slice(0, 3).join(' → ') : String(after);
  const textAlternative = `${isReview ? 'Review' : 'Claim'} for ${artifact.task?.title ?? artifact.id}. Gate ${gate}. Objective: ${objective}. Thesis: ${thesis}. Claims: ${claims.map((item) => `${item.id} ${item.statement}`).join('; ')}.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc"><title id="title">${xmlEscape(artifact.task?.title ?? 'Task Proof')}</title><desc id="desc">${xmlEscape(textAlternative)}</desc><rect width="1600" height="900" fill="#0d1117"/><rect x="0" y="0" width="1600" height="88" fill="#121822"/><text x="48" y="44" font-size="30" font-weight="800" fill="#f3f6fb">${xmlEscape(isReview ? 'TASK PROOF · INDEPENDENT REVIEW' : 'TASK PROOF · CLAIM')}</text><text x="48" y="70" font-size="16" fill="#93a1b3">${xmlEscape(artifact.task?.id ?? artifact.id)} · ${xmlEscape(artifact.repository?.branch ?? '')} · ${xmlEscape((artifact.repository?.headSha ?? '').slice(0, 12))}</text><rect x="1320" y="24" width="230" height="44" rx="22" fill="${badgeColor}"/><text x="1435" y="53" text-anchor="middle" font-size="20" font-weight="800" fill="#0d1117">${xmlEscape(gate)}</text>${box(48, 126, 460, 180, 'Objective', objective, '#6ea8fe')}${box(48, 330, 460, 180, 'Change thesis', thesis, '#8d7cf0')}${box(48, 534, 460, 216, 'Evidence used', evidenceLines.length ? evidenceLines.join(' | ') : 'No qualifying evidence recorded.', '#36c98f')}<text x="560" y="126" font-size="22" font-weight="800" fill="#f3f6fb">${xmlEscape(isReview ? 'Reviewed completion claims' : 'Declared completion claims')}</text>${claimBoxes}<g><rect x="1160" y="126" width="392" height="624" rx="18" fill="#121822" stroke="#303947"/><text x="1188" y="166" font-size="22" font-weight="800" fill="#f3f6fb">Causal change logic</text>${textBlock(1188, 210, ['BEFORE', ...wrap(flowBefore || 'Not recorded.', 34, 5)], { size: 18, weight: 700, lineHeight: 25, fill: '#f56c7a' })}<path d="M1356 340 L1356 390" stroke="#93a1b3" stroke-width="3" marker-end="url(#arrow)"/>${textBlock(1188, 430, ['CHANGE', ...wrap(thesis, 34, 5)], { size: 18, weight: 700, lineHeight: 25, fill: '#8d7cf0' })}<path d="M1356 555 L1356 605" stroke="#93a1b3" stroke-width="3" marker-end="url(#arrow)"/>${textBlock(1188, 648, ['AFTER', ...wrap(flowAfter || 'Not recorded.', 34, 4)], { size: 18, weight: 700, lineHeight: 25, fill: '#36c98f' })}</g><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#93a1b3"/></marker></defs><rect x="48" y="790" width="1504" height="68" rx="14" fill="#121822"/><text x="72" y="819" font-size="16" fill="#93a1b3">Artifact digest</text><text x="72" y="844" font-size="18" font-family="monospace" fill="#e7ecf3">${xmlEscape(digest)}</text><text x="1518" y="842" text-anchor="end" font-size="16" fill="#93a1b3">${xmlEscape(isReview ? 'Completion is valid only at this reviewed snapshot.' : 'A claimant cannot verify its own completion.')}</text></svg>`;
}

function atomicWrite(filename, content) {
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, filename);
}

function safeArtifactName(value) {
  const name = String(value ?? 'task-proof').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.{2,}/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 96);
  return name || 'task-proof';
}

export function writeTaskProofArtifacts({ artifact, repositoryPath = '.', basename } = {}) {
  if (!isRecord(artifact)) throw new TaskProofError('ARTIFACT', 'artifact is required.');
  if (artifact.kind === CLAIM_KIND) assertValidClaim(artifact);
  const repositoryRoot = realpathSync(runGit(realpathSync(path.resolve(repositoryPath)), ['rev-parse', '--show-toplevel']));
  const outputDir = path.join(repositoryRoot, '.artifacts', 'task-proof');
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const stem = safeArtifactName(basename ?? artifact.id);
  const jsonPath = path.join(outputDir, `${stem}.json`);
  const svgPath = path.join(outputDir, `${stem}.svg`);
  const htmlPath = path.join(outputDir, `${stem}.html`);
  const manifestPath = path.join(outputDir, `${stem}.manifest.json`);
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  const svg = renderTaskProofSvg(artifact);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${xmlEscape(artifact.task?.title ?? 'Task Proof')}</title><style>html,body{margin:0;background:#0d1117}svg{display:block;width:100vw;height:auto;max-height:100vh}</style></head><body>${svg}</body></html>`;
  const manifest = {
    protocolVersion: PROTOCOL_VERSION,
    artifactId: artifact.id,
    artifactDigest: artifact.artifactDigest ?? artifactDigest(artifact),
    files: {
      json: { path: path.relative(repositoryRoot, jsonPath), digest: sha256(json) },
      svg: { path: path.relative(repositoryRoot, svgPath), digest: sha256(svg) },
      html: { path: path.relative(repositoryRoot, htmlPath), digest: sha256(html) },
    },
  };
  manifest.manifestDigest = artifactDigest(manifest);
  try {
    atomicWrite(jsonPath, json);
    atomicWrite(svgPath, svg);
    atomicWrite(htmlPath, html);
    atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    for (const filename of [jsonPath, svgPath, htmlPath, manifestPath]) rmSync(`${filename}.tmp-${process.pid}-${Date.now()}`, { force: true });
    throw error;
  }
  return {
    outputDir: path.relative(repositoryRoot, outputDir),
    json: path.relative(repositoryRoot, jsonPath),
    svg: path.relative(repositoryRoot, svgPath),
    html: path.relative(repositoryRoot, htmlPath),
    manifest: path.relative(repositoryRoot, manifestPath),
    manifestDigest: manifest.manifestDigest,
  };
}
