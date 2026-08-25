import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { basename, join } from "node:path";
import { collectGitSnapshot } from "./git-snapshot.mjs";

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

test("git snapshot captures exact revisions, rename, dirty paths, and a stable digest", () => {
  const repo = mkdtempSync(join(process.cwd(), ".task-proof-git-test-"));
  try {
    git(repo, "init", "-q");
    git(repo, "config", "user.name", "Task Proof Test");
    git(repo, "config", "user.email", "task-proof@example.invalid");
    writeFileSync(join(repo, "a.txt"), "one\n");
    writeFileSync(join(repo, "old.txt"), "old\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "initial");
    const base = git(repo, "rev-parse", "HEAD");

    appendFileSync(join(repo, "a.txt"), "two\n");
    git(repo, "mv", "old.txt", "new.txt");
    git(repo, "add", "a.txt");
    git(repo, "commit", "-qm", "second");
    const head = git(repo, "rev-parse", "HEAD");

    appendFileSync(join(repo, "a.txt"), "worktree\n");
    writeFileSync(join(repo, "untracked.txt"), "untracked\n");

    const snapshot = collectGitSnapshot({ workspace: basename(repo), baseRef: base });
    assert.equal(snapshot.baseRevision, base);
    assert.equal(snapshot.headRevision, head);
    assert.equal(snapshot.dirty, true);
    assert.match(snapshot.repository, /^file:\/\//);
    assert.match(snapshot.snapshotDigest, /^[a-f0-9]{64}$/);
    assert.ok(snapshot.changedFiles.some((item) => item.path === "a.txt"));
    assert.ok(snapshot.changedFiles.some((item) => item.path === "new.txt" && item.originalPath === "old.txt"));
    assert.ok(snapshot.workingTree.some((item) => item.path === "a.txt"));
    assert.ok(snapshot.workingTree.some((item) => item.path === "untracked.txt" && item.status === "??"));

    const repeated = collectGitSnapshot({ workspace: basename(repo), baseRef: base });
    assert.equal(repeated.snapshotDigest, snapshot.snapshotDigest);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
