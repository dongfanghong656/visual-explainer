import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createRepositorySnapshotStrict,
  validateRepositorySnapshotStrict,
} from './snapshot.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function repository() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'task-proof-content-snapshot-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Task Proof');
  git(repo, 'config', 'user.email', 'task-proof@example.invalid');
  writeFileSync(path.join(repo, 'tracked.txt'), 'base\n');
  git(repo, 'add', 'tracked.txt');
  git(repo, 'commit', '-qm', 'base');
  return repo;
}

test('changing a dirty tracked file without changing its status invalidates the snapshot digest', () => {
  const repo = repository();
  writeFileSync(path.join(repo, 'tracked.txt'), 'version one\n');
  const first = createRepositorySnapshotStrict({ repositoryPath: repo });
  writeFileSync(path.join(repo, 'tracked.txt'), 'version two\n');
  const second = createRepositorySnapshotStrict({ repositoryPath: repo });
  assert.equal(first.repository.workingTreeChanges[0].status, second.repository.workingTreeChanges[0].status);
  assert.notEqual(first.repository.workingTreeChanges[0].content.digest, second.repository.workingTreeChanges[0].content.digest);
  assert.notEqual(first.snapshotDigest, second.snapshotDigest);
  assert.equal(validateRepositorySnapshotStrict(second).ok, true);
});

test('changing an untracked file invalidates the snapshot digest', () => {
  const repo = repository();
  writeFileSync(path.join(repo, 'untracked.txt'), 'version one\n');
  const first = createRepositorySnapshotStrict({ repositoryPath: repo });
  writeFileSync(path.join(repo, 'untracked.txt'), 'version two\n');
  const second = createRepositorySnapshotStrict({ repositoryPath: repo });
  const firstEntry = first.repository.workingTreeChanges.find((item) => item.path === 'untracked.txt');
  const secondEntry = second.repository.workingTreeChanges.find((item) => item.path === 'untracked.txt');
  assert.ok(firstEntry && secondEntry);
  assert.notEqual(firstEntry.content.digest, secondEntry.content.digest);
  assert.notEqual(first.snapshotDigest, second.snapshotDigest);
});

test('clean snapshots state that working-tree fingerprinting is complete', () => {
  const snapshot = createRepositorySnapshotStrict({ repositoryPath: repository() });
  assert.equal(snapshot.repository.dirty, false);
  assert.equal(snapshot.repository.workingTreeFingerprintComplete, true);
  assert.deepEqual(snapshot.repository.workingTreeFingerprintIncompleteReasons, []);
});
