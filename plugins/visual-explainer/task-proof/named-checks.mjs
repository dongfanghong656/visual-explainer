import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import {
  TaskProofError,
  sha256,
} from './core.mjs';
import {
  createRepositorySnapshotStrict as createRepositorySnapshot,
  validateRepositorySnapshotStrict as validateSnapshot,
} from './snapshot.mjs';

const POLICY_PATH = '.task-proof/checks.json';
const RECEIPT_ISSUER = 'visual-explainer-task-proof-mcp';
const MAX_POLICY_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_CHECKS = 20;
const MAX_ARGS = 128;
const MAX_ARG_CHARS = 8192;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const CHECK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CHECK_KINDS = new Set(['test', 'build']);
const REQUEST_FIELDS = new Set(['id', 'checkId', 'kind', 'supportsClaimIds', 'supportsCriterionIds']);

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
  const seen = new Set();
  const output = [];
  for (const value of values ?? []) {
    ensureId(value, label);
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function actualRepositoryRoot(repositoryPath) {
  const requested = realpathSync(path.resolve(repositoryPath ?? '.'));
  const result = spawnSync('git', ['-C', requested, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8', shell: false, timeout: 15_000, maxBuffer: 1024 * 1024, windowsHide: true,
  });
  if (result.status !== 0) throw new TaskProofError('GIT_FAILED', 'Cannot resolve repository root for named checks.');
  return realpathSync(result.stdout.trim());
}

function loadPolicy(root) {
  const lexical = path.resolve(root, POLICY_PATH);
  if (!isInside(root, lexical)) throw new TaskProofError('POLICY_ESCAPE', 'Named-check policy escaped the repository.');
  let stat;
  try { stat = lstatSync(lexical); }
  catch { throw new TaskProofError('CHECK_POLICY_MISSING', `Missing ${POLICY_PATH}.`); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new TaskProofError('CHECK_POLICY_FILE', 'Named-check policy must be a regular non-symlink file.');
  if (stat.size > MAX_POLICY_BYTES) throw new TaskProofError('CHECK_POLICY_LARGE', 'Named-check policy is too large.');
  const physical = realpathSync(lexical);
  if (!isInside(root, physical)) throw new TaskProofError('CHECK_POLICY_ESCAPE', 'Named-check policy physically escapes the repository.');
  const bytes = readFileSync(physical);
  let policy;
  try { policy = JSON.parse(bytes.toString('utf8')); }
  catch (error) { throw new TaskProofError('CHECK_POLICY_JSON', `Cannot parse ${POLICY_PATH}: ${error.message}`); }
  if (!isRecord(policy) || policy.version !== 1 || !Array.isArray(policy.checks)) {
    throw new TaskProofError('CHECK_POLICY_SHAPE', 'Named-check policy must have version 1 and a checks array.');
  }
  return { policy, digest: sha256(bytes) };
}

function resolveExecutable(command) {
  if (command === 'node') {
    return { executable: realpathSync(process.execPath), label: 'node', runtime: process.version };
  }
  if (typeof command !== 'string' || command.trim() === '' || command.startsWith('-') || /[\0\r\n]/.test(command)) {
    throw new TaskProofError('CHECK_COMMAND', 'Named-check executable is unsafe.');
  }
  if (!path.isAbsolute(command)) {
    throw new TaskProofError('CHECK_COMMAND_RELATIVE', `Named-check executable must be "node" or an absolute path: ${command}`);
  }
  let stat;
  try { stat = lstatSync(command); }
  catch { throw new TaskProofError('CHECK_COMMAND_MISSING', `Named-check executable does not exist: ${command}`); }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new TaskProofError('CHECK_COMMAND_FILE', `Named-check executable must be a regular non-symlink file: ${command}`);
  }
  return { executable: realpathSync(command), label: path.basename(command), runtime: null };
}

function normalizeDefinition(raw, root) {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !CHECK_ID_RE.test(raw.id)) {
    throw new TaskProofError('CHECK_ID', 'Every named check requires a safe id.');
  }
  const kind = raw.kind ?? 'test';
  if (!CHECK_KINDS.has(kind)) {
    throw new TaskProofError('CHECK_KIND', `Named check ${raw.id} must declare kind test or build.`);
  }
  if (!Array.isArray(raw.args) || raw.args.length > MAX_ARGS || raw.args.some((arg) => typeof arg !== 'string' || arg.includes('\0') || arg.length > MAX_ARG_CHARS)) {
    throw new TaskProofError('CHECK_ARGS', `Named check ${raw.id} has invalid or excessive arguments.`);
  }
  const lexicalCwd = path.resolve(root, raw.cwd ?? '.');
  if (!isInside(root, lexicalCwd)) throw new TaskProofError('CHECK_CWD_ESCAPE', `Named check ${raw.id} cwd escapes the repository.`);
  const physicalCwd = realpathSync(lexicalCwd);
  if (!isInside(root, physicalCwd)) throw new TaskProofError('CHECK_CWD_ESCAPE', `Named check ${raw.id} cwd physically escapes the repository.`);
  const executable = resolveExecutable(raw.command);
  return {
    id: raw.id,
    kind,
    ...executable,
    args: [...raw.args],
    cwd: physicalCwd,
    timeoutMs: Math.min(Math.max(Number(raw.timeoutMs) || 120_000, 1_000), 600_000),
    maxOutputBytes: Math.min(Math.max(Number(raw.maxOutputBytes) || 1_048_576, 4_096), MAX_OUTPUT_BYTES),
  };
}

function receipt({ snapshotDigest, evidenceId, observation, supportsClaimIds, supportsCriterionIds }) {
  const value = {
    issuer: RECEIPT_ISSUER,
    snapshotDigest,
    evidenceId,
    supportsClaimIds: uniqueIds(supportsClaimIds, 'supportsClaimIds'),
    supportsCriterionIds: uniqueIds(supportsCriterionIds, 'supportsCriterionIds'),
    observation,
  };
  value.receiptDigest = sha256(value);
  return value;
}

export function runNamedChecksStrict({ repositoryPath = '.', reviewerRunId, requests = [], baseRef } = {}) {
  ensureId(reviewerRunId, 'reviewerRunId');
  if (process.env.TASK_PROOF_ALLOW_EXECUTION !== '1') {
    throw new TaskProofError('EXECUTION_DISABLED', 'Named checks are disabled. Set TASK_PROOF_ALLOW_EXECUTION=1 only after reviewing .task-proof/checks.json.');
  }
  if (!Array.isArray(requests) || requests.length === 0 || requests.length > MAX_CHECKS) {
    throw new TaskProofError('CHECK_REQUESTS', `requests must contain between 1 and ${MAX_CHECKS} named checks.`);
  }

  const root = actualRepositoryRoot(repositoryPath);
  const before = createRepositorySnapshot({ repositoryPath: root, baseRef });
  const validation = validateSnapshot(before);
  if (!validation.ok) throw new TaskProofError('INVALID_SNAPSHOT', 'Pre-check snapshot failed validation.', validation);
  const { policy, digest: policyDigest } = loadPolicy(root);
  const definitions = new Map();
  for (const raw of policy.checks) {
    const definition = normalizeDefinition(raw, root);
    if (definitions.has(definition.id)) throw new TaskProofError('DUPLICATE_CHECK_ID', `Duplicate named check id: ${definition.id}`);
    definitions.set(definition.id, definition);
  }

  const seenEvidenceIds = new Set();
  const evidence = requests.map((request, index) => {
    if (!isRecord(request)) throw new TaskProofError('CHECK_REQUEST', `Check request ${index} must be an object.`);
    const unknownFields = Object.keys(request).filter((key) => !REQUEST_FIELDS.has(key));
    if (unknownFields.length > 0) {
      throw new TaskProofError('CHECK_REQUEST_FIELD', `Check request ${index} contains caller-controlled fields: ${unknownFields.join(', ')}.`);
    }
    const evidenceId = ensureId(request.id, `check request ${index}`);
    if (seenEvidenceIds.has(evidenceId)) throw new TaskProofError('DUPLICATE_EVIDENCE', `Duplicate check evidence id: ${evidenceId}`);
    seenEvidenceIds.add(evidenceId);
    const supportsClaimIds = uniqueIds(request.supportsClaimIds, 'supportsClaimIds');
    const supportsCriterionIds = uniqueIds(request.supportsCriterionIds, 'supportsCriterionIds');
    if (supportsClaimIds.length === 0 || supportsCriterionIds.length === 0) {
      throw new TaskProofError('UNBOUND_EVIDENCE', `Named check evidence ${evidenceId} must support at least one claim and one criterion.`);
    }
    const definition = definitions.get(request.checkId);
    if (!definition) throw new TaskProofError('UNKNOWN_CHECK', `Named check is not allowlisted: ${request.checkId}`);
    if (request.kind !== undefined && request.kind !== definition.kind) {
      throw new TaskProofError('CHECK_KIND_MISMATCH', `Caller requested ${request.kind} but policy defines ${definition.kind} for ${definition.id}.`);
    }

    const startedAt = new Date().toISOString();
    const started = Date.now();
    const execution = spawnSync(definition.executable, definition.args, {
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
      policyPath: POLICY_PATH,
      policyDigest,
      checkId: definition.id,
      evidenceKind: definition.kind,
      command: definition.label,
      runtime: definition.runtime,
      executablePathDigest: sha256(definition.executable),
      args: definition.args,
      cwd: path.relative(root, definition.cwd).split(path.sep).join('/') || '.',
      startedAt,
      durationMs: Date.now() - started,
      exitCode,
      signal: execution.signal ?? null,
      timedOut: Boolean(execution.error?.code === 'ETIMEDOUT'),
      errorCode: execution.error?.code ?? null,
      stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
      stderrBytes: Buffer.byteLength(stderr, 'utf8'),
      stdoutDigest: sha256(stdout),
      stderrDigest: sha256(stderr),
    };
    return {
      id: evidenceId,
      kind: definition.kind,
      locator: `named-check:${definition.id}`,
      observedAt: startedAt,
      digest: sha256(observation),
      producerRunId: reviewerRunId,
      trust: 'deterministic',
      result: {
        exitCode,
        summary: exitCode === 0 ? 'Named check passed.' : `Named check failed${observation.timedOut ? ' by timeout' : ''}.`,
      },
      receipt: receipt({
        snapshotDigest: before.snapshotDigest,
        evidenceId,
        observation,
        supportsClaimIds,
        supportsCriterionIds,
      }),
    };
  });

  const after = createRepositorySnapshot({ repositoryPath: root, baseRef });
  if (after.snapshotDigest !== before.snapshotDigest) {
    throw new TaskProofError('CHECK_MUTATED_REPOSITORY', 'Repository state changed while named checks ran. Restore or commit the state and restart review.', {
      before: before.snapshotDigest,
      after: after.snapshotDigest,
    });
  }
  return { snapshot: before, evidence };
}
