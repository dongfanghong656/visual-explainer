import { createHash } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

function runGit(cwd, args, { allowFailure = false, maxBuffer = 8 * 1024 * 1024 } = {}) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer,
      windowsHide: true,
    }).trimEnd();
  } catch (error) {
    if (allowFailure) return "";
    const stderr = error?.stderr?.toString?.().trim();
    throw new Error(stderr || error?.message || `git ${args.join(" ")} failed`);
  }
}

function resolveAllowedWorkspace(workspace = ".") {
  const allowedRoot = realpathSync(process.cwd());
  const requestedPath = resolve(allowedRoot, workspace);
  if (!existsSync(requestedPath) || !statSync(requestedPath).isDirectory()) throw new Error(`workspace does not exist or is not a directory: ${workspace}`);
  const requested = realpathSync(requestedPath);
  const rel = relative(allowedRoot, requested);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`workspace must stay within MCP launch directory: ${allowedRoot}`);
  return { allowedRoot, requested };
}

function parsePorcelainZ(output) {
  if (!output) return [];
  const entries = output.split("\0").filter(Boolean);
  const results = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    const item = { status, path };
    if ((status.includes("R") || status.includes("C")) && entries[index + 1]) {
      item.originalPath = entries[index + 1];
      index += 1;
    }
    results.push(item);
  }
  return results;
}

function parseNameStatusZ(output) {
  if (!output) return [];
  const tokens = output.split("\0").filter(Boolean);
  const results = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const tab = token.indexOf("\t");
    const status = tab >= 0 ? token.slice(0, tab) : token;
    let path = tab >= 0 ? token.slice(tab + 1) : tokens[++index];
    const item = { status, path };
    if ((status.startsWith("R") || status.startsWith("C")) && tokens[index + 1]) {
      item.originalPath = path;
      item.path = tokens[index + 1];
      index += 1;
    }
    results.push(item);
  }
  return results;
}

function parseNumstat(output) {
  const byPath = new Map();
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const [addedRaw, deletedRaw, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    byPath.set(path, {
      added: addedRaw === "-" ? null : Number.parseInt(addedRaw, 10),
      deleted: deletedRaw === "-" ? null : Number.parseInt(deletedRaw, 10),
    });
  }
  return byPath;
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function untrackedHashes(repoRoot, statusEntries) {
  const hashes = [];
  for (const entry of statusEntries.filter((item) => item.status === "??")) {
    const hash = runGit(repoRoot, ["hash-object", "--no-filters", "--", entry.path], { allowFailure: true });
    hashes.push({ path: entry.path, hash: hash || null });
  }
  return hashes.sort((a, b) => a.path.localeCompare(b.path));
}

function repositoryIdentity(repoRoot) {
  return runGit(repoRoot, ["config", "--get", "remote.origin.url"], { allowFailure: true }) || pathToFileURL(repoRoot).href;
}

export function collectGitSnapshot({ workspace = ".", baseRef, headRef = "HEAD" } = {}) {
  const { requested } = resolveAllowedWorkspace(workspace);
  const repoRoot = realpathSync(runGit(requested, ["rev-parse", "--show-toplevel"]));
  const rel = relative(realpathSync(process.cwd()), repoRoot);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("resolved git repository escapes the MCP launch directory");

  const headRevision = runGit(repoRoot, ["rev-parse", headRef]);
  const baseRevision = baseRef ? runGit(repoRoot, ["rev-parse", baseRef]) : headRevision;
  const branch = runGit(repoRoot, ["branch", "--show-current"], { allowFailure: true }) || "DETACHED";
  const statusEntries = parsePorcelainZ(runGit(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const committedNameStatus = baseRef ? parseNameStatusZ(runGit(repoRoot, ["diff", "--name-status", "-z", `${baseRevision}..${headRevision}`])) : [];
  const committedNumstat = baseRef ? parseNumstat(runGit(repoRoot, ["diff", "--numstat", `${baseRevision}..${headRevision}`])) : new Map();
  const worktreeNumstat = parseNumstat(runGit(repoRoot, ["diff", "--numstat", "HEAD"]));

  const changedFiles = committedNameStatus.map((item) => ({
    ...item,
    ...committedNumstat.get(item.path),
    source: "committed-range",
  }));
  const workingTree = statusEntries.map((item) => ({
    ...item,
    ...worktreeNumstat.get(item.path),
    source: item.status === "??" ? "untracked" : "working-tree",
  }));

  const binaryDiff = runGit(repoRoot, ["diff", "--binary", "HEAD"], { maxBuffer: 32 * 1024 * 1024 });
  const untracked = untrackedHashes(repoRoot, statusEntries);
  const digestPayload = JSON.stringify({
    headRevision,
    status: statusEntries.map(({ status, path, originalPath }) => ({ status, path, originalPath })).sort((a, b) => a.path.localeCompare(b.path)),
    trackedDiffHash: hashText(binaryDiff),
    untracked,
  });
  const snapshotDigest = hashText(digestPayload);

  return {
    repositoryRoot: repoRoot,
    repository: repositoryIdentity(repoRoot),
    branch,
    baseRef: baseRef ?? null,
    baseRevision,
    headRef,
    headRevision,
    dirty: statusEntries.length > 0,
    snapshotDigest,
    changedFiles,
    workingTree,
    diffStat: baseRef ? runGit(repoRoot, ["diff", "--stat", `${baseRevision}..${headRevision}`]) : "",
    workingTreeStat: runGit(repoRoot, ["diff", "--stat", "HEAD"]),
    generatedAt: new Date().toISOString(),
  };
}
