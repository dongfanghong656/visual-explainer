import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { compareManifests, validateManifest } from '../src/core.mjs';
import { escapeMermaid, renderReviewMermaid, renderStatusMermaid } from '../src/render.mjs';
import { collectSnapshot, writeBundle } from '../src/workspace.mjs';

const fixtures = new URL('./fixtures/', import.meta.url);
const producer = JSON.parse(readFileSync(new URL('producer.valid.json', fixtures), 'utf8'));
const reviewer = JSON.parse(readFileSync(new URL('reviewer.valid.json', fixtures), 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('valid done code claim requires and accepts paired primary evidence', () => {
  const result = validateManifest(producer);
  assert.equal(result.valid, true);
  assert.equal(result.claims[0].verdict, 'verified');
  assert.equal(result.overall, 'verified_complete');
});

test('self-report alone cannot verify a done code claim', () => {
  const manifest = clone(producer);
  manifest.evidence = [{
    id: 'E-SELF',
    type: 'review',
    locator: 'chat:producer-summary',
    summary: 'Producer says the task is complete.',
    result: 'pass',
    trust: 'self_report',
  }];
  manifest.claims[0].evidenceRefs = ['E-SELF'];
  manifest.acceptance[0].evidenceRefs = ['E-SELF'];
  const result = validateManifest(manifest);
  assert.equal(result.valid, true);
  assert.equal(result.claims[0].verdict, 'unverified');
  assert.notEqual(result.overall, 'verified_complete');
});

test('failed evidence contradicts a done claim', () => {
  const manifest = clone(producer);
  manifest.evidence.find((item) => item.id === 'E-TEST').result = 'fail';
  const result = validateManifest(manifest);
  assert.equal(result.claims[0].verdict, 'contradicted');
  assert.equal(result.overall, 'contradicted');
});

test('blocked claim must name a blocker', () => {
  const manifest = clone(producer);
  manifest.claims[0].claimStatus = 'blocked';
  manifest.claims[0].blockers = [];
  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /has no blocker/);
});

test('producer and reviewer reconcile by stable claim ID', () => {
  const result = compareManifests(producer, reviewer);
  assert.equal(result.valid, true);
  assert.equal(result.overall, 'agreed');
  assert.equal(result.comparisons[0].outcome, 'agreed');
});

test('reviewer downgrade is visible', () => {
  const downgraded = clone(reviewer);
  downgraded.claims[0].reviewDisposition = 'rejected';
  downgraded.evidence.find((item) => item.id === 'RV-TEST').result = 'fail';
  const result = compareManifests(producer, downgraded);
  assert.equal(result.overall, 'disputed');
  assert.equal(result.comparisons[0].outcome, 'downgraded');
});

test('Mermaid labels strip active markup delimiters', () => {
  assert.equal(escapeMermaid('<script>"x"</script>|next'), "script'x'/script／next");
  const diagram = renderStatusMermaid(producer);
  assert.match(diagram, /Verified done/);
  assert.doesNotMatch(diagram, /<script>/i);
  assert.match(renderReviewMermaid(producer, reviewer), /Reconciliation/);
});

test('snapshot is bounded and bundle writes only inside .task-proof', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-proof-'));
  const previousAllowed = process.env.TASK_PROOF_ALLOWED_ROOTS;
  try {
    execFileSync('git', ['init', root], { stdio: 'ignore' });
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.invalid']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Task Proof Test']);
    writeFileSync(join(root, 'README.md'), '# fixture\n');
    execFileSync('git', ['-C', root, 'add', 'README.md']);
    execFileSync('git', ['-C', root, 'commit', '-m', 'fixture'], { stdio: 'ignore' });
    process.env.TASK_PROOF_ALLOWED_ROOTS = root;

    const snapshot = collectSnapshot({ workspaceRoot: root, headRef: 'HEAD', evidenceFiles: ['README.md'] });
    assert.equal(snapshot.dirty, false);
    assert.equal(snapshot.files.length, 1);
    assert.match(snapshot.files[0].sha256, /^[a-f0-9]{64}$/);

    assert.throws(
      () => collectSnapshot({ workspaceRoot: root, evidenceFiles: ['../outside.txt'] }),
      /escapes workspace/,
    );

    const output = writeBundle({ workspaceRoot: root, manifest: producer, outputName: 'TEST_PROOF' });
    assert.equal(output.paths.manifest, '.task-proof/TEST_PROOF.json');
    assert.match(readFileSync(join(root, output.paths.validation), 'utf8'), /verified_complete/);
    assert.throws(
      () => writeBundle({ workspaceRoot: root, manifest: producer, outputName: 'TEST_PROOF' }),
      /refusing to overwrite/,
    );
    assert.throws(
      () => writeBundle({ workspaceRoot: root, manifest: producer, outputName: '../escape' }),
      /outputName/,
    );
  } finally {
    if (previousAllowed === undefined) delete process.env.TASK_PROOF_ALLOWED_ROOTS;
    else process.env.TASK_PROOF_ALLOWED_ROOTS = previousAllowed;
    rmSync(root, { recursive: true, force: true });
  }
});
