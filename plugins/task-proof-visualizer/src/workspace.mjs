import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { renderBundle } from './render.mjs';

const MAX_CAPTURED_FILES = 50;
const MAX_CAPTURED_FILE_BYTES = 2 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;

function allowedRoots() {
  const configured = process.env.TASK_PROOF_ALLOWED_ROOTS;
  const roots = configured
    ? configured.split(process.platform === 'win32' ? ';' : ':').filter(Boolean)
    : [process.cwd()];
  return roots.map((root) => realpathSync(resolve(root)));
}

function isInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export function resolveWorkspace(workspaceRoot) {
  if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) {
    throw new Error('workspaceRoot is required');
  }
  const candidate = realpathSync(resolve(workspaceRoot));
  const root = allowedRoots().find((allowed) => isInside(allowed, candidate));
  if (!root) throw new Error('workspaceRoot is outside TASK_PROOF_ALLOWED_ROOTS');
  const gitRoot = git(candidate, ['rev-parse', '--show-toplevel']).trim();
  const resolvedGitRoot = realpathSync(gitRoot);
  if (!isInside(root, resolvedGitRoot)) throw new Error('git root is outside TASK_PROOF_ALLOWED_ROOTS');
  return resolvedGitRoot;
}

function git(root, args, options = {}) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    timeout: options.timeout ?? 8000,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function safeGit(root, args) {
  try {
    return git(root, args).trim();
  } catch (error) {
    return `ERROR: ${error.stderr?.toString().trim() || error.message}`;
  }
}

function hashFile(path) {
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error('not a regular file');
  if (stat.size > MAX_CAPTURED_FILE_BYTES) throw new Error(`file exceeds ${MAX_CAPTURED_FILE_BYTES} bytes`);
  return {
    bytes: stat.size,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  };
}

export function collectSnapshot({ workspaceRoot, baseRef, headRef = 'HEAD', evidenceFiles = [] }) {
  const root = resolveWorkspace(workspaceRoot);
  const branch = safeGit(root, ['branch', '--show-current']);
  const head = safeGit(root, ['rev-parse', headRef]);
  const base = baseRef ? safeGit(root, ['rev-parse', baseRef]) : '';
  const status = safeGit(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  const recentCommits = safeGit(root, ['log', '-n', '20', '--date=iso-strict', '--pretty=format:%H%x09%ad%x09%an%x09%s']);
  const diffRange = baseRef ? `${baseRef}..${headRef}` : `${headRef}^..${headRef}`;
  const diffNameStatus = baseRef
    ? safeGit(root, ['diff', '--name-status', diffRange])
    : safeGit(root, ['show', '--format=', '--name-status', headRef]);
  const diffStat = baseRef
    ? safeGit(root, ['diff', '--stat', diffRange])
    : safeGit(root, ['show', '--format=', '--stat', headRef]);

  const files = [];
  for (const requested of evidenceFiles.slice(0, MAX_CAPTURED_FILES)) {
    if (typeof requested !== 'string' || !requested.trim()) continue;
    const lexicalPath = resolve(root, requested);
    if (!isInside(root, lexicalPath)) throw new Error(`evidence file escapes workspace: ${requested}`);
    try {
      const candidate = realpathSync(lexicalPath);
      if (!isInside(root, candidate)) throw new Error('resolved path escapes workspace');
      files.push({ path: relative(root, candidate).replaceAll(sep, '/'), ...hashFile(candidate) });
    } catch (error) {
      files.push({ path: relative(root, lexicalPath).replaceAll(sep, '/'), error: error.message });
    }
  }

  return {
    capturedAt: new Date().toISOString(),
    workspace: basename(root),
    branch,
    base: base || null,
    head,
    dirty: Boolean(status),
    status: status ? status.split('\n').slice(0, 500) : [],
    recentCommits: recentCommits
      ? recentCommits.split('\n').map((line) => {
          const [sha, date, author, ...subject] = line.split('\t');
          return { sha, date, author, subject: subject.join('\t') };
        })
      : [],
    diff: {
      range: diffRange,
      nameStatus: diffNameStatus ? diffNameStatus.split('\n').slice(0, 1000) : [],
      stat: diffStat ? diffStat.split('\n').slice(0, 1000) : [],
    },
    files,
  };
}

function safeOutputName(value) {
  const name = typeof value === 'string' && value.trim() ? value.trim() : 'TASK_PROOF';
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name)) {
    throw new Error('outputName may contain only A-Z, a-z, 0-9, dot, underscore, and hyphen');
  }
  const normalized = name.replace(/\.(json|md|mmd)$/i, '');
  if (!normalized || normalized === '.' || normalized === '..') throw new Error('outputName is invalid');
  return normalized;
}

function atomicCreate(path, content) {
  if (existsSync(path)) throw new Error(`refusing to overwrite existing proof artifact: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

export function writeBundle({ workspaceRoot, manifest, outputName, view = 'status' }) {
  const root = resolveWorkspace(workspaceRoot);
  const name = safeOutputName(outputName);
  const outputDir = join(root, '.task-proof');
  const bundle = renderBundle(manifest, { view });
  const paths = {
    manifest: join(outputDir, `${name}.json`),
    markdown: join(outputDir, `${name}.md`),
    mermaid: join(outputDir, `${name}.mmd`),
    validation: join(outputDir, `${name}.validation.json`),
  };
  for (const path of Object.values(paths)) {
    if (existsSync(path)) throw new Error(`refusing to overwrite existing proof artifact: ${path}`);
  }
  atomicCreate(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  atomicCreate(paths.markdown, `${bundle.markdown}\n`);
  atomicCreate(paths.mermaid, `${bundle.mermaid}\n`);
  atomicCreate(paths.validation, `${JSON.stringify(bundle.validation, null, 2)}\n`);
  return {
    validation: bundle.validation,
    paths: Object.fromEntries(
      Object.entries(paths).map(([key, path]) => [key, relative(root, path).replaceAll(sep, '/')]),
    ),
  };
}
