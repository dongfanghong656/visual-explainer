import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { TaskProofError } from './core.mjs';
import {
  MAX_CONTRACT_SOURCE_BYTES,
  createAuthorityReceipt,
  digestJson,
  digestTaskContract,
  normalizeTaskContract,
  validateClaimContractBinding,
} from './contract-authority.mjs';

export const REPOSITORY_AUTHORITY_ADAPTER_ID = 'task-proof-repository-source-v1';
const MAX_GIT_OUTPUT_BYTES = MAX_CONTRACT_SOURCE_BYTES + 64 * 1024;
const SAFE_SHA_RE = /^[0-9a-f]{40}$/;

function fail(code, message, details) {
  throw new TaskProofError(code, message, details);
}

export function normalizeRepositoryIdentity(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let text = value.trim().replaceAll('\\', '/');
  const scp = /^[^@\s]+@([^:\s]+):(.+)$/.exec(text);
  if (scp) text = `${scp[1]}/${scp[2]}`;
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      text = `${url.hostname}${url.pathname}`;
    } catch {
      return '';
    }
  }
  text = text.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  if (text.toLowerCase().startsWith('github.com/')) text = text.slice('github.com/'.length);
  return text.toLowerCase();
}

function nullDevice() {
  return process.platform === 'win32' ? 'NUL' : '/dev/null';
}

function gitEnvironment() {
  return {
    PATH: process.env.PATH ?? '',
    SYSTEMROOT: process.env.SYSTEMROOT ?? '',
    HOME: process.env.HOME ?? '',
    USERPROFILE: process.env.USERPROFILE ?? '',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: nullDevice(),
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
  };
}

function git(root, args, { optional = false, encoding = 'utf8', maxBuffer = MAX_GIT_OUTPUT_BYTES } = {}) {
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${nullDevice()}`, '-C', root, ...args], {
    encoding,
    env: gitEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20_000,
    maxBuffer,
    windowsHide: true,
  });
  if (result.status !== 0) {
    if (optional) return { ok: false, status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr ?? '');
    fail('GIT_FAILED', `Git contract-source observation failed${stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : '.'}`);
  }
  return { ok: true, status: 0, stdout: result.stdout, stderr: result.stderr };
}

function repositoryRoot(repositoryPath) {
  const requested = realpathSync(path.resolve(repositoryPath ?? '.'));
  const root = git(requested, ['rev-parse', '--show-toplevel']).stdout.trim();
  return realpathSync(root);
}

function assertSafeGitConfiguration(root) {
  const raw = git(root, ['config', '--local', '--null', '--list']).stdout;
  const dangerous = [];
  for (const entry of raw.split('\0').filter(Boolean)) {
    const newline = entry.indexOf('\n');
    const equals = entry.indexOf('=');
    const split = newline >= 0 ? newline : equals;
    const key = (split >= 0 ? entry.slice(0, split) : entry).trim().toLowerCase();
    if (
      key === 'core.fsmonitor'
      || key.startsWith('include.')
      || key.startsWith('includeif.')
      || /^filter\..+\.(clean|smudge|process)$/.test(key)
      || /^diff\..+\.(command|textconv)$/.test(key)
    ) dangerous.push(key);
  }
  if (dangerous.length) {
    fail('CONTRACT_UNSAFE_GIT_CONFIGURATION', 'Repository-local Git configuration can execute external helpers.', { keys: dangerous });
  }
}

function observeRepositorySource({ repositoryPath, contract, claim, reviewerRunId, sourceId }) {
  const normalized = normalizeTaskContract(contract);
  const source = normalized.sources.find((item) => item.sourceId === sourceId);
  if (!source) fail('CONTRACT_SOURCE_REFERENCE', `Unknown contract source: ${sourceId}`);
  if (source.type !== 'repository_file' || normalized.authority.method !== 'repository_source') {
    fail('TRUSTED_EXTERNAL_AUTHORITY_ADAPTER_REQUIRED', 'The public MCP currently supports only repository_file + repository_source authority.', {
      sourceType: source.type,
      authorityMethod: normalized.authority.method,
    });
  }
  const binding = validateClaimContractBinding(normalized, claim);
  if (!binding.ok) fail('CONTRACT_CLAIM_BINDING', 'Cannot inspect contract authority for an invalid Claim.', binding);

  const root = repositoryRoot(repositoryPath);
  assertSafeGitConfiguration(root);
  const remote = git(root, ['config', '--get', 'remote.origin.url'], { optional: true }).stdout?.trim?.() ?? '';
  if (normalizeRepositoryIdentity(remote) !== normalizeRepositoryIdentity(normalized.repository)) {
    fail('CONTRACT_REPOSITORY_MISMATCH', 'Repository remote does not match the Task Contract.', {
      expected: normalized.repository,
      actual: remote || null,
    });
  }
  const currentHead = git(root, ['rev-parse', 'HEAD']).stdout.trim().toLowerCase();
  if (!SAFE_SHA_RE.test(currentHead) || currentHead !== binding.repository.headSha) {
    fail('CONTRACT_AUTHORITY_RECEIPT_HEAD', 'Repository HEAD changed after Claim creation.', {
      expected: binding.repository.headSha,
      actual: currentHead,
    });
  }

  const ancestor = git(root, ['merge-base', '--is-ancestor', source.revision, normalized.scope.baseRevision], { optional: true });
  const sourceAtRevision = git(root, ['cat-file', '-e', `${source.revision}:${source.locator}`], { optional: true });
  const sourceAtBase = git(root, ['cat-file', '-e', `${normalized.scope.baseRevision}:${source.locator}`], { optional: true });
  const treeLine = git(root, ['ls-tree', source.revision, '--', source.locator], { optional: true }).stdout?.trim?.() ?? '';
  const modeMatch = /^(\d{6})\s+(\w+)\s+([0-9a-f]{40})\t/.exec(treeLine);
  const regularFile = Boolean(modeMatch && modeMatch[2] === 'blob' && (modeMatch[1] === '100644' || modeMatch[1] === '100755'));
  const symbolicLink = Boolean(modeMatch && modeMatch[1] === '120000');
  const blob = sourceAtRevision.ok
    ? git(root, ['show', `${source.revision}:${source.locator}`], { encoding: null, maxBuffer: MAX_GIT_OUTPUT_BYTES }).stdout
    : Buffer.alloc(0);
  if (!Buffer.isBuffer(blob)) fail('CONTRACT_SOURCE_READ', 'Contract source was not returned as bytes.');
  if (blob.length > MAX_CONTRACT_SOURCE_BYTES) fail('CONTRACT_SOURCE_SIZE', 'Contract source exceeds the 4 MiB limit.');
  const changed = git(root, ['diff', '--quiet', `${normalized.scope.baseRevision}..${binding.repository.headSha}`, '--', source.locator], { optional: true });
  const observedSourceSha256 = createHash('sha256').update(blob).digest('hex');
  const observationCore = {
    sourceExistsAtBase: sourceAtBase.ok,
    revisionIsAncestor: ancestor.ok,
    sourceChangedInImplementationScope: changed.status === 1,
    safeGitConfiguration: true,
    sourceIsRegularFile: regularFile,
    sourceIsSymbolicLink: symbolicLink,
    sizeBytes: blob.length,
    observedSourceSha256,
    adapterId: REPOSITORY_AUTHORITY_ADAPTER_ID,
  };
  const adapterReceiptDigest = digestJson({
    adapterId: REPOSITORY_AUTHORITY_ADAPTER_ID,
    contractDigest: digestTaskContract(normalized),
    sourceId: source.sourceId,
    sourceSha256: source.sha256,
    implementationHeadRevision: binding.repository.headSha,
    reviewerRunId,
    observation: observationCore,
  });
  return {
    observation: { ...observationCore, adapterReceiptDigest },
    live: {
      ok: sourceAtRevision.ok && sourceAtBase.ok && ancestor.ok && changed.status === 0
        && regularFile && !symbolicLink && observedSourceSha256 === source.sha256,
      adapterId: REPOSITORY_AUTHORITY_ADAPTER_ID,
      adapterReceiptDigest,
      contractDigest: digestTaskContract(normalized),
      sourceId: source.sourceId,
      sourceSha256: source.sha256,
      implementationHeadRevision: binding.repository.headSha,
      reviewerRunId,
    },
  };
}

export function createPublicRepositoryAuthorityReceipt({
  repositoryPath = '.', contract, claim, reviewerRunId, sourceId, observedAt = new Date().toISOString(),
}) {
  const observed = observeRepositorySource({ repositoryPath, contract, claim, reviewerRunId, sourceId });
  const receipt = createAuthorityReceipt({
    contract,
    sourceId,
    claim,
    reviewerRunId,
    observedAt,
    method: 'repository_source',
    observation: observed.observation,
  });
  return { receipt, verificationPreview: observed.live };
}

export function createPublicRepositoryAuthorityAdapter(repositoryPath = '.') {
  return ({ contract, source, claim, review }) => {
    try {
      return observeRepositorySource({
        repositoryPath,
        contract,
        claim,
        reviewerRunId: review.reviewer.runId,
        sourceId: source.sourceId,
      }).live;
    } catch (error) {
      return { ok: false, reason: error.code ?? error.message };
    }
  };
}
