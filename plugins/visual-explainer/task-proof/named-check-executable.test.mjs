import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskProofError } from './core.mjs';
import { runNamedChecksStrict } from './named-checks.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function repositoryWithPolicy(command, kind) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'task-proof-executable-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Task Proof');
  git(repo, 'config', 'user.email', 'task-proof@example.invalid');
  writeFileSync(path.join(repo, 'README.md'), 'test\n');
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-qm', 'base');
  mkdirSync(path.join(repo, '.task-proof'));
  const check = { id: 'check', command, args: ['-e', 'process.exit(0)'], cwd: '.' };
  if (kind !== undefined) check.kind = kind;
  writeFileSync(path.join(repo, '.task-proof', 'checks.json'), JSON.stringify({ version: 1, checks: [check] }));
  return repo;
}

test('node policy sentinel is pinned to process.execPath and succeeds', () => {
  const repo = repositoryWithPolicy('node', 'test');
  const previous = process.env.TASK_PROOF_ALLOW_EXECUTION;
  process.env.TASK_PROOF_ALLOW_EXECUTION = '1';
  try {
    const result = runNamedChecksStrict({
      repositoryPath: repo,
      reviewerRunId: 'reviewer-node-pinned',
      requests: [{
        id: 'R-node', checkId: 'check',
        supportsClaimIds: ['C-node'], supportsCriterionIds: ['AC-node'],
      }],
    });
    assert.equal(result.evidence[0].result.exitCode, 0);
    assert.equal(result.evidence[0].kind, 'test');
    assert.equal(result.evidence[0].receipt.observation.command, 'node');
    assert.equal(result.evidence[0].receipt.observation.runtime, process.version);
  } finally {
    if (previous === undefined) delete process.env.TASK_PROOF_ALLOW_EXECUTION;
    else process.env.TASK_PROOF_ALLOW_EXECUTION = previous;
  }
});

test('legacy policy without kind safely defaults to test', () => {
  const repo = repositoryWithPolicy('node');
  const previous = process.env.TASK_PROOF_ALLOW_EXECUTION;
  process.env.TASK_PROOF_ALLOW_EXECUTION = '1';
  try {
    const result = runNamedChecksStrict({
      repositoryPath: repo,
      reviewerRunId: 'reviewer-legacy-kind',
      requests: [{
        id: 'R-legacy', checkId: 'check', kind: 'test',
        supportsClaimIds: ['C-legacy'], supportsCriterionIds: ['AC-legacy'],
      }],
    });
    assert.equal(result.evidence[0].kind, 'test');
  } finally {
    if (previous === undefined) delete process.env.TASK_PROOF_ALLOW_EXECUTION;
    else process.env.TASK_PROOF_ALLOW_EXECUTION = previous;
  }
});

test('caller cannot relabel a policy-owned test as build evidence', () => {
  const repo = repositoryWithPolicy('node', 'test');
  const previous = process.env.TASK_PROOF_ALLOW_EXECUTION;
  process.env.TASK_PROOF_ALLOW_EXECUTION = '1';
  try {
    assert.throws(
      () => runNamedChecksStrict({
        repositoryPath: repo,
        reviewerRunId: 'reviewer-kind-mismatch',
        requests: [{
          id: 'R-kind', checkId: 'check', kind: 'build',
          supportsClaimIds: ['C-kind'], supportsCriterionIds: ['AC-kind'],
        }],
      }),
      (error) => error instanceof TaskProofError && error.code === 'CHECK_KIND_MISMATCH',
    );
  } finally {
    if (previous === undefined) delete process.env.TASK_PROOF_ALLOW_EXECUTION;
    else process.env.TASK_PROOF_ALLOW_EXECUTION = previous;
  }
});

test('bare executable names other than node are rejected instead of resolved through PATH', () => {
  const repo = repositoryWithPolicy('npm', 'test');
  const previous = process.env.TASK_PROOF_ALLOW_EXECUTION;
  process.env.TASK_PROOF_ALLOW_EXECUTION = '1';
  try {
    assert.throws(
      () => runNamedChecksStrict({
        repositoryPath: repo,
        reviewerRunId: 'reviewer-path-reject',
        requests: [{
          id: 'R-path', checkId: 'check',
          supportsClaimIds: ['C-path'], supportsCriterionIds: ['AC-path'],
        }],
      }),
      (error) => error instanceof TaskProofError && error.code === 'CHECK_COMMAND_RELATIVE',
    );
  } finally {
    if (previous === undefined) delete process.env.TASK_PROOF_ALLOW_EXECUTION;
    else process.env.TASK_PROOF_ALLOW_EXECUTION = previous;
  }
});
