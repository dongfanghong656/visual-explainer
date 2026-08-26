import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_DEFINITIONS } from './mcp-server.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..');

function read(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function parse(relativePath) {
  return JSON.parse(read(relativePath));
}

test('dedicated Task Proof MCP exposes the stable six-tool contract', () => {
  const names = TOOL_DEFINITIONS.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'task_proof_claim',
    'task_proof_probe',
    'task_proof_review',
    'task_proof_run_checks',
    'task_proof_snapshot',
    'task_proof_validate_claim',
  ]);
  for (const tool of TOOL_DEFINITIONS) {
    assert.equal(tool.inputSchema?.type, 'object');
    assert.equal(tool.inputSchema?.additionalProperties, false);
  }
});

test('plugin contains discoverable skill and claimant/reviewer commands', () => {
  const skill = read('plugins/visual-explainer/skills/task-proof/SKILL.md');
  const claimCommand = read('plugins/visual-explainer/commands/task-proof.md');
  const reviewCommand = read('plugins/visual-explainer/commands/task-proof-review.md');
  assert.match(skill, /Task Proof/i);
  assert.match(skill, /claimant/i);
  assert.match(skill, /reviewer/i);
  assert.match(claimCommand, /UNVERIFIED/i);
  assert.match(reviewCommand, /independent/i);
});

test('repository-owned check policy controls evidence kinds and strict test discovery', () => {
  const policy = parse('.task-proof/checks.json');
  assert.equal(policy.version, 1);
  assert.ok(policy.checks.length >= 2);
  const tests = policy.checks.find((check) => check.id === 'task-proof-tests');
  assert.equal(tests.kind, 'test');
  assert.equal(tests.command, 'node');
  assert.ok(tests.args.includes('plugins/visual-explainer/task-proof/run-all-tests-strict.mjs'));
  for (const check of policy.checks) assert.ok(['test', 'build'].includes(check.kind));
});

test('CI runs the strict test finder and a real MCP stdio handshake', () => {
  const workflow = read('.github/workflows/task-proof.yml');
  assert.match(workflow, /run-all-tests-strict\.mjs/);
  assert.match(workflow, /mcp-handshake\.mjs/);
  assert.match(workflow, /npm install --ignore-scripts/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
});

test('protocol documents state the core trust boundaries', () => {
  const standard = read('plugins/visual-explainer/task-proof/STANDARD_V0.2.md');
  const security = read('plugins/visual-explainer/task-proof/SECURITY_V0.2.md');
  const mcp = read('plugins/visual-explainer/task-proof/MCP_V0.2.md');
  assert.match(standard, /claimant output.*never|claimant.*no.*gate/is);
  assert.match(standard, /working-tree.*content|dirty-file.*content/is);
  assert.match(standard, /requiredEvidenceLocators/);
  assert.match(security, /repository code/i);
  assert.match(security, /residual risks/i);
  assert.match(mcp, /task_proof_review/);
  assert.match(mcp, /arbitrary command/i);
});

test('package declares the split MCP v2 server/client packages and exposes the dedicated binary', () => {
  const packageJson = parse('package.json');
  assert.equal(typeof packageJson.dependencies?.['@modelcontextprotocol/server'], 'string');
  assert.equal(typeof packageJson.dependencies?.['@modelcontextprotocol/client'], 'string');
  assert.equal(packageJson.dependencies?.['@modelcontextprotocol/sdk'], undefined);
  assert.equal(
    packageJson.bin?.['visual-explainer-task-proof-mcp'],
    './plugins/visual-explainer/task-proof/mcp-server.mjs',
  );
  assert.equal(packageJson.engines?.node, '>=20');
});
