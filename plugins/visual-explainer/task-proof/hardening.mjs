import { execFileSync, spawnSync } from 'node:child_process';
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import {
  TaskProofError,
  createRepositorySnapshot,
  finalizeReview,
  sha256,
  validateSnapshot,
} from './core.mjs';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_PROBES = 100;
const MAX_CHECKS = 20;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA_RE = /^[0-9a-f]{40}$/i;
const SAFE_CHECK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RECEIPT_ISSUER = 'visual-explainer-task-proof-mcp';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureId(value, label) {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new TaskProofError('INVALID_ID', `${label} requires a stable safe id.`);
  }
  return value;
}

function git(repositoryRoot, args, { optional = false } = {}) {
  try {
    return execFileSync('git', ['-C', repositoryRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    }).trim();
  } catch (error) {
    if (optional) return null;
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim().slice(0, 500) : '';
    throw new TaskProofError('GIT_FAILED', `Git observation failed${stderr ? `: ${stderr}` : '.'}`);
  }
}

function repositoryRoot(repositoryPath) {
  const requested = realpathSync(path.resolve(repositoryPath ?? '.'));
  return realpathSync(git(requested, ['rev-parse', '--show-toplevel']));
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
  try {
    stat = lstatSync(lexical);
  } catch {
    throw new TaskProofError('FILE_NOT_FOUND', `Evidence file does not exist: ${relativePath}`);
  }
  if (stat.isSymbolicLink()) throw new TaskProofError('SYMLINK_REJECTED', `Symlink evidence is rejected: ${relativePath}`);
  if (!stat.isFile()) throw new TaskProofError('NOT_A_FILE', `Evidence path is not a regular file: ${relativePath}`);
  if (stat.size > MAX_FILE_BYTES) throw new TaskProofError('FILE_TOO_LARGE', `Evidence file exceeds ${MAX_FILE_BYTES} bytes: ${relativePath}`);
  const physical = realpathSync(lexical);
  if (!isInside(root, physical)) throw new TaskProofError('PHYSICAL_PATH_ESCAPE', `A parent symlink escapes the repository: ${relativePath}`);
  return { lexical, physical, stat };
}

function uniqueIds(values, label) {
  const result = [];
  const seen = new Set();
  for (const value of values ?? []) {
    ensureId(value, label);
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
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

export function verifyMcpReceipt(evidence, snapshotDigest) {
  if (!isRecord(evidence?.receipt)) return false;
  const { receiptDigest, ...unsigned } = evidence.receipt;
  return evidence.receipt.issuer === RECEIPT_ISSUER
    && evidence.receipt.snapshotDigest === snapshotDigest
    && evidence.receipt.evidenceId === evidence.id
    && typeof receiptDigest === 'string'
    && sha256(unsigned) === receiptDigest;
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
      const committed = git(root, ['diff', '--name-only', `${snapshot.repository.baseSha}..${snapshot.repository.headSha}`, '--', relative])
        .split('\n').filter(Boolean);
      const working = git(root, ['status', '--porcelain=v1', '--', relative], { optional: true }) ?? '';
      if (!committed.includes(relative) && working.trim() === '') {
        throw new TaskProofError('PATH_NOT_CHANGED', `Path is not changed in the reviewed scope: ${relative}`);
      }
      observation = { type: probe.type, path: relative, committed, working: working.trim() };
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
        supportsClaimIds: probe.supportsClaimIds,
        supportsCriterionIds: probe.supportsCriterionIds,
      }),
    };
  });

  return { snapshot, evidence };
}

function readCheckPolicy(root, policyPath) {
  const selected = policyPath ?? '.task-proof/checks.json';
  const file = resolveRegularFile(root, selected);
  let policy;
  try {
    policy = JSON.parse(readFileSync(file.physical, 'utf8'));
  } catch (error) {
    throw new TaskProofError('CHECK_POLICY', `Cannot parse named-check policy: ${error.message}`);
  }
  if (!isRecord(policy) || policy.version !== 1 || !Array.isArray(policy.checks)) {
    throw new TaskProofError('CHECK_POLICY', 'Named-check policy must have version 1 and a checks array.');
  }
  return { policy, selected, digest: sha256(readFileSync(file.physical)) };
}

function safeCheckDefinition(check, root) {
  if (!isRecord(check) || typeof check.id !== 'string' || !SAFE_CHECK_ID_RE.test(check.id)) {
    throw new TaskProofError('CHECK_ID', 'Every named check requires a safe id.');
  }
  if (typeof check.command !== 'string' || check.command.trim() === '' || check.command.startsWith('-') || /[\0\r\n]/.test(check.command)) {
    throw new TaskProofError('CHECK_COMMAND', `Named check ${check.id} has an unsafe executable.`);
  }
  if (!Array.isArray(check.args) || check.args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
    throw new TaskProofError('CHECK_ARGS', `Named check ${check.id} args must be an array of strings.`);
  }
  const cwdLexical = resolveLexicalPath(root, check.cwd ?? '.');
  const cwdPhysical = realpathSync(cwdLexical);
  if (!isInside(root, cwdPhysical)) throw new TaskProofError('CHECK_CWD_ESCAPE', `Named check ${check.id} cwd escapes the repository.`);
  const timeoutMs = Math.min(Math.max(Number(check.timeoutMs) || 120_000, 1_000), 600_000);
  const maxOutputBytes = Math.min(Math.max(Number(check.maxOutputBytes) || 1_048_576, 4_096), MAX_OUTPUT_BYTES);
  return { id: check.id, command: check.command, args: check.args, cwd: cwdPhysical, timeoutMs, maxOutputBytes };
}

export function runNamedChecks({ repositoryPath = '.', reviewerRunId, requests = [], baseRef, policyPath } = {}) {
  ensureId(reviewerRunId, 'reviewerRunId');
  if (process.env.TASK_PROOF_ALLOW_EXECUTION !== '1') {
    throw new TaskProofError('EXECUTION_DISABLED', 'Named checks are disabled. Set TASK_PROOF_ALLOW_EXECUTION=1 only after reviewing the repository policy.');
  }
  if (!Array.isArray(requests) || requests.length === 0 || requests.length > MAX_CHECKS) {
    throw new TaskProofError('CHECK_REQUESTS', `requests must contain between 1 and ${MAX_CHECKS} named checks.`);
  }
  const root = repositoryRoot(repositoryPath);
  const snapshot = createRepositorySnapshot({ repositoryPath: root, baseRef });
  const { policy, selected, digest: policyDigest } = readCheckPolicy(root, policyPath);
  const definitions = new Map(policy.checks.map((item) => {
    const safe = safeCheckDefinition(item, root);
    return [safe.id, safe];
  }));
  const seen = new Set();

  const evidence = requests.map((request, index) => {
    if (!isRecord(request)) throw new TaskProofError('CHECK_REQUEST', `Check request ${index} must be an object.`);
    const evidenceId = ensureId(request.id, `check request ${index}`);
    if (seen.has(evidenceId)) throw new TaskProofError('DUPLICATE_CHECK', `Duplicate evidence id: ${evidenceId}`);
    seen.add(evidenceId);
    const definition = definitions.get(request.checkId);
    if (!definition) throw new TaskProofError('UNKNOWN_CHECK', `Named check is not allowlisted: ${request.checkId}`);
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const execution = spawnSync(definition.command, definition.args, {
      cwd: definition.cwd,
      encoding: 'utf8',
      shell: false,
      timeout: definition.timeoutMs,
      maxBuffer: definition.maxOutputBytes,
      windowsHide: true,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        USERPROFILE: process.env.USERPROFILE ?? '',
        SYSTEMROOT: process.env.SYSTEMROOT ?? '',
        CI: 'true',
        NO_COLOR: '1',
      },
    });
    const stdout = execution.stdout ?? '';
    const stderr = execution.stderr ?? '';
    const exitCode = Number.isInteger(execution.status) ? execution.status : 1;
    const observation = {
      type: 'named_check',
      policyPath: selected,
      policyDigest,
      checkId: definition.id,
      command: definition.command,
      args: definition.args,
      cwd: path.relative(root, definition.cwd).split(path.sep).join('/') || '.',
      startedAt,
      durationMs: Date.now() - started,
      exitCode,
      signal: execution.signal ?? null,
      timedOut: Boolean(execution.error?.code === 'ETIMEDOUT'),
      stdoutDigest: sha256(stdout),
      stderrDigest: sha256(stderr),
    };
    return {
      id: evidenceId,
      kind: request.kind === 'build' ? 'build' : 'test',
      locator: `named-check:${definition.id}`,
      observedAt: startedAt,
      digest: sha256(observation),
      producerRunId: reviewerRunId,
      trust: 'deterministic',
      result: {
        exitCode,
        summary: exitCode === 0 ? 'Named check passed.' : `Named check failed${observation.timedOut ? ' by timeout' : ''}.`,
        stdoutPreview: stdout.slice(0, 1000),
        stderrPreview: stderr.slice(0, 1000),
      },
      receipt: makeReceipt({
        snapshotDigest: snapshot.snapshotDigest,
        evidenceId,
        observation,
        supportsClaimIds: request.supportsClaimIds,
        supportsCriterionIds: request.supportsCriterionIds,
      }),
    };
  });
  return { snapshot, evidence };
}

function criterionMap(claim) {
  return new Map((claim.task?.acceptanceCriteria ?? []).map((criterion) => [criterion.id, criterion]));
}

function evidenceCovers(evidence, claimId, criterionId, criterion, snapshotDigest, reviewerRunId) {
  if (!verifyMcpReceipt(evidence, snapshotDigest)) return false;
  if (evidence.producerRunId !== reviewerRunId) return false;
  if (evidence.result?.exitCode !== undefined && evidence.result.exitCode !== 0) return false;
  if (!evidence.receipt.supportsClaimIds.includes(claimId)) return false;
  if (!evidence.receipt.supportsCriterionIds.includes(criterionId)) return false;
  const requiredKinds = Array.isArray(criterion?.requiredEvidenceKinds) ? criterion.requiredEvidenceKinds : [];
  return requiredKinds.length === 0 || requiredKinds.includes(evidence.kind);
}

export function finalizeReviewStrict({ claim, reviewer, snapshot, findings = [], reviewEvidence = [] }) {
  const snapshotValidation = validateSnapshot(snapshot);
  if (!snapshotValidation.ok) throw new TaskProofError('INVALID_SNAPSHOT', 'Review snapshot validation failed.', snapshotValidation);
  if (!isRecord(reviewer) || reviewer.runId === claim?.producer?.runId) {
    throw new TaskProofError('NOT_INDEPENDENT', 'Reviewer runId must differ from claimant runId.');
  }
  const evidenceById = new Map(reviewEvidence.map((evidence) => [evidence.id, evidence]));
  const criteria = criterionMap(claim);
  const submitted = new Map(findings.map((finding) => [finding.claimId, finding]));
  const hardenedFindings = (claim.claims ?? []).map((claimItem) => {
    const finding = submitted.get(claimItem.id) ?? {
      claimId: claimItem.id,
      verdict: 'unsupported',
      rationale: 'No independent finding was supplied.',
      reviewEvidenceIds: [],
    };
    if (finding.verdict !== 'verified') return finding;
    const cited = [...new Set(finding.reviewEvidenceIds ?? [])].map((id) => evidenceById.get(id)).filter(Boolean);
    const uncovered = (claimItem.acceptanceCriteriaIds ?? []).filter((criterionId) => {
      const criterion = criteria.get(criterionId);
      return !cited.some((evidence) => evidenceCovers(
        evidence,
        claimItem.id,
        criterionId,
        criterion,
        snapshot.snapshotDigest,
        reviewer.runId,
      ));
    });
    if (uncovered.length > 0) {
      return {
        ...finding,
        verdict: 'unsupported',
        rationale: `${finding.rationale} Missing reviewer-produced evidence coverage for: ${uncovered.join(', ')}.`,
      };
    }
    return finding;
  });
  return finalizeReview({ claim, reviewer, snapshot, findings: hardenedFindings, reviewEvidence });
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
