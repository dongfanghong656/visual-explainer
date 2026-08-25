#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeBundle } from '../src/workspace.mjs';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const workspace = required('GITHUB_WORKSPACE');
const repository = required('GITHUB_REPOSITORY');
const head = process.env.TASK_PROOF_HEAD_SHA || required('GITHUB_SHA');
const base = process.env.TASK_PROOF_BASE_SHA || `${head}^`;
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || 'unknown';
const nodeVersion = process.version;
const testLogPath = join(workspace, '.task-proof', 'ci-test.log');
const testLog = readFileSync(testLogPath);
const testLogDigest = createHash('sha256').update(testLog).digest('hex');
const shortHead = head.slice(0, 12);

const manifest = {
  manifestVersion: '1.0',
  mode: 'producer',
  project: {
    name: 'task-proof-visualizer',
    repository,
    branch,
    base,
    head,
  },
  task: {
    id: 'TPV-V0.1.0',
    title: 'Task Proof Visualizer v0.1.0 MVP',
    objective: 'Deliver an evidence-gated producer/reviewer/reconciliation Skill and local MCP that generates auditable one-page task-completion and change-logic diagrams.',
  },
  checkpoint: {
    capturedAt: new Date().toISOString(),
    actor: `github-actions-node-${nodeVersion}`,
    workflow: process.env.GITHUB_WORKFLOW || 'task-proof-visualizer',
    runId: process.env.GITHUB_RUN_ID || '',
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || '',
  },
  acceptance: [
    {
      id: 'AC-CORE',
      text: 'Core tests verify evidence gating, contradictions, reviewer rules, checkpoint matching, and reconciliation.',
      status: 'pass',
      evidenceRefs: ['E-CI-TEST'],
    },
    {
      id: 'AC-SAFETY',
      text: 'Adversarial tests reject workspace traversal, unsafe output names, overwrite, and symlinked proof directories.',
      status: 'pass',
      evidenceRefs: ['E-CI-TEST'],
    },
    {
      id: 'AC-MCP',
      text: 'The stdio MCP starts, exposes seven expected tools, and validates a complete fixture.',
      status: 'pass',
      evidenceRefs: ['E-CI-TEST'],
    },
    {
      id: 'AC-CI',
      text: 'Node 20/22 workflow runs the suite and generates exact-checkpoint producer proof artifacts.',
      status: 'pass',
      evidenceRefs: ['E-CI-TEST'],
    },
    {
      id: 'AC-SKILL',
      text: 'Skill and reference rules distinguish producer claims, independent review, disputes, incomplete work, and release boundaries.',
      status: 'pass',
      evidenceRefs: ['E-CI-TEST'],
    },
  ],
  evidence: [
    {
      id: 'E-COMMIT',
      type: 'commit',
      locator: `commit:${head}`,
      summary: 'GitHub Actions checked out the exact producer checkpoint.',
      result: 'pass',
      trust: 'primary',
    },
    {
      id: 'E-DIFF',
      type: 'diff',
      locator: `diff:${base}..${head}`,
      summary: 'The implementation, Skill, workflow, tests, and documentation changes under review.',
      result: 'pass',
      trust: 'primary',
    },
    {
      id: 'E-CI-TEST',
      type: 'test',
      locator: `github-actions:${repository}/actions/runs/${process.env.GITHUB_RUN_ID || 'unknown'}#node=${nodeVersion};sha256=${testLogDigest}`,
      summary: 'npm test completed successfully; the uploaded artifact contains the TAP log and exact-checkpoint proof bundle.',
      result: 'pass',
      trust: 'primary',
      sha256: testLogDigest,
    },
  ],
  claims: [
    {
      id: 'CL-CORE',
      title: 'Evidence-gated completion and reconciliation',
      summary: 'The deterministic core rejects unsupported done claims and compares producer/reviewer claims by stable ID at one checkpoint.',
      category: 'code',
      claimStatus: 'done',
      acceptanceRefs: ['AC-CORE'],
      evidenceRefs: ['E-COMMIT', 'E-DIFF', 'E-CI-TEST'],
      blockers: [],
      risks: [],
      dependsOn: [],
    },
    {
      id: 'CL-SAFETY',
      title: 'Bounded local workspace access',
      summary: 'Snapshot and bundle operations remain inside allowlisted Git workspaces and immutable .task-proof output.',
      category: 'security',
      claimStatus: 'done',
      acceptanceRefs: ['AC-SAFETY'],
      evidenceRefs: ['E-COMMIT', 'E-DIFF', 'E-CI-TEST'],
      blockers: [],
      risks: [],
      dependsOn: [],
    },
    {
      id: 'CL-MCP',
      title: 'MCP protocol surface starts and responds',
      summary: 'The stdio server exposes the expected seven tools and validates a fixture through an SDK client.',
      category: 'behavior',
      claimStatus: 'done',
      acceptanceRefs: ['AC-MCP'],
      evidenceRefs: ['E-COMMIT', 'E-DIFF', 'E-CI-TEST'],
      blockers: [],
      risks: [],
      dependsOn: [],
    },
    {
      id: 'CL-CI',
      title: 'Exact-checkpoint CI producer proof',
      summary: 'The Node matrix runs tests, hashes the TAP log, creates a manifest using the actual GitHub SHA, validates it, and uploads the bundle.',
      category: 'behavior',
      claimStatus: 'done',
      acceptanceRefs: ['AC-CI'],
      evidenceRefs: ['E-COMMIT', 'E-DIFF', 'E-CI-TEST'],
      blockers: [],
      risks: [],
      dependsOn: ['CL-CORE', 'CL-MCP'],
    },
    {
      id: 'CL-SKILL',
      title: 'Producer/reviewer/reconciliation operating standard',
      summary: 'The Skill and references define evidence, review independence, diagram semantics, security boundaries, and honest release status.',
      category: 'documentation',
      claimStatus: 'done',
      acceptanceRefs: ['AC-SKILL'],
      evidenceRefs: ['E-COMMIT', 'E-DIFF', 'E-CI-TEST'],
      blockers: [],
      risks: [],
      dependsOn: ['CL-CORE'],
    },
  ],
  unknowns: [],
  risks: [
    'CI producer proof is not an independent AI review.',
    'Package publication and upstream integration are outside this checkpoint.',
  ],
  nextActions: [
    'Run a separate reviewer AI against the same base/head and reconcile manifests.',
    'Verify installation from a clean checkout before release.',
  ],
};

const outputName = `CI_PRODUCER_${shortHead}_NODE_${process.versions.node.split('.')[0]}`;
const result = writeBundle({
  workspaceRoot: workspace,
  manifest,
  outputName,
  view: 'status',
});
if (result.validation.overall !== 'verified_complete') {
  throw new Error(`CI producer proof did not validate as complete: ${result.validation.overall}`);
}
console.log(JSON.stringify({ outputName, ...result }, null, 2));
