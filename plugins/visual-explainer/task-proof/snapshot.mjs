import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import {
  PROTOCOL_VERSION,
  SNAPSHOT_KIND,
  TaskProofError,
  sha256,
} from './core.mjs';

const MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;
const FULL_SHA_RE = /^[0-9a-f]{40}$/i;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/i;

function git(root, args, { optional = false, encoding = 'utf8' } = {}) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
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

function validateRef(root, ref) {
  if (ref === undefined || ref === null || ref === '') return null;
  if (typeof ref !== 'string' || ref.length > 200 || ref.includes('\0') || ref.startsWith('-')) {
    throw new TaskProofError('UNSAFE_REF', 'Git ref is unsafe.');
  }
  if (FULL_SHA_RE.test(ref)) return ref.toLowerCase();
  if (ref === 'HEAD') return ref;
  const checked = git(root, ['check-ref-format', '--branch', ref], { optional: true });
  if (checked === null) throw new TaskProofError('UNSAFE_REF', 'Git ref is not a valid branch-style ref or full SHA.');
  return ref;
}

function resolveCommit(root, ref) {
  const validated = validateRef(root, ref);
  if (!validated) return null;
  return git(root, ['rev-parse', '--verify', `${validated}^{commit}`]).trim().toLowerCase();
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

function splitZ(buffer) {
  return buffer.toString('utf8').split('\0').filter((value) => value !== '');
}

export function parsePorcelainV1Z(buffer) {
  const tokens = splitZ(buffer);
  const changes = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 3) throw new TaskProofError('STATUS_PARSE', 'Malformed git status porcelain record.');
    const status = token.slice(0, 2);
    const currentPath = token.slice(3);
    if (status.includes('R') || status.includes('C')) {
      const originalPath = tokens[index + 1];
      if (originalPath === undefined) throw new TaskProofError('STATUS_PARSE', 'Rename/copy record is missing its second path.');
      changes.push({ status, path: currentPath, originalPath });
      index += 1;
    } else {
      changes.push({ status, path: currentPath });
    }
  }
  return changes;
}

export function parseNameStatusZ(buffer) {
  const tokens = splitZ(buffer);
  const changes = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!status) break;
    const firstPath = tokens[index++];
    if (firstPath === undefined) throw new TaskProofError('DIFF_PARSE', 'Changed-path record is missing a path.');
    if (status.startsWith('R') || status.startsWith('C')) {
      const secondPath = tokens[index++];
      if (secondPath === undefined) throw new TaskProofError('DIFF_PARSE', 'Rename/copy record is missing its destination path.');
      changes.push({ status, originalPath: firstPath, path: secondPath });
    } else {
      changes.push({ status, path: firstPath });
    }
  }
  return changes;
}

function recentCommits(root) {
  const raw = git(root, ['log', '-5', '--format=%H%x09%aI%x09%s']).trim();
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const [sha, authoredAt, ...subject] = line.split('\t');
    return { sha: sha.toLowerCase(), authoredAt, subject: subject.join('\t').slice(0, 300) };
  });
}

export function createRepositorySnapshotStrict({ repositoryPath = '.', baseRef } = {}) {
  const root = repositoryRoot(repositoryPath);
  const headSha = git(root, ['rev-parse', 'HEAD']).trim().toLowerCase();
  const parent = git(root, ['rev-parse', '--verify', 'HEAD^'], { optional: true });
  const baseSha = resolveCommit(root, baseRef) ?? (parent ? parent.trim().toLowerCase() : headSha);
  const branch = (git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { optional: true }) ?? '').trim() || 'DETACHED';
  const remote = sanitizeRemote((git(root, ['config', '--get', 'remote.origin.url'], { optional: true }) ?? '').trim());
  const treeSha = git(root, ['rev-parse', 'HEAD^{tree}']).trim().toLowerCase();
  const statusBuffer = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'], { encoding: null });
  const diffBuffer = git(root, ['diff', '--name-status', '-z', '--find-renames', `${baseSha}..${headSha}`], { encoding: null });
  const submodules = (git(root, ['submodule', 'status', '--recursive'], { optional: true }) ?? '').trim();
  const workingTreeChanges = parsePorcelainV1Z(statusBuffer);
  const committedChanges = parseNameStatusZ(diffBuffer);
  const repository = {
    repositoryName: path.basename(root),
    remote,
    branch,
    baseSha,
    headSha,
    treeSha,
    dirty: workingTreeChanges.length > 0,
    committedChanges,
    workingTreeChanges,
    recentCommits: recentCommits(root),
    submoduleStatusDigest: submodules ? sha256(submodules) : null,
  };
  const snapshot = {
    protocolVersion: PROTOCOL_VERSION,
    kind: SNAPSHOT_KIND,
    observedAt: new Date().toISOString(),
    repository,
    snapshotDigest: sha256(repository),
  };
  return snapshot;
}

export function validateRepositorySnapshotStrict(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, errors: [{ code: 'TYPE', message: 'Snapshot must be an object.' }] };
  }
  if (snapshot.protocolVersion !== PROTOCOL_VERSION) errors.push({ code: 'PROTOCOL_VERSION', message: `Expected ${PROTOCOL_VERSION}.` });
  if (snapshot.kind !== SNAPSHOT_KIND) errors.push({ code: 'KIND', message: `Expected ${SNAPSHOT_KIND}.` });
  if (!FULL_SHA_RE.test(snapshot.repository?.baseSha ?? '')) errors.push({ code: 'BASE_SHA', message: 'Snapshot requires a full base SHA.' });
  if (!FULL_SHA_RE.test(snapshot.repository?.headSha ?? '')) errors.push({ code: 'HEAD_SHA', message: 'Snapshot requires a full head SHA.' });
  if (!FULL_SHA_RE.test(snapshot.repository?.treeSha ?? '')) errors.push({ code: 'TREE_SHA', message: 'Snapshot requires a full tree SHA.' });
  if (!DIGEST_RE.test(snapshot.snapshotDigest ?? '')) errors.push({ code: 'SNAPSHOT_DIGEST', message: 'Snapshot requires a SHA-256 digest.' });
  const expectedDigest = snapshot.repository && typeof snapshot.repository === 'object' ? sha256(snapshot.repository) : undefined;
  if (expectedDigest && snapshot.snapshotDigest !== expectedDigest) errors.push({ code: 'SNAPSHOT_TAMPERED', message: 'Snapshot digest does not match repository payload.' });
  return { ok: errors.length === 0, errors, expectedDigest };
}
