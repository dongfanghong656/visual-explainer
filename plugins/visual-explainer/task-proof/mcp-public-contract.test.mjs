import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOOL_DEFINITIONS,
  TOOL_INPUT_SCHEMAS,
  handleTaskProofTool,
} from './mcp-server.mjs';
import { TASK_CONTRACT_VERSION } from './contract-authority.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(here, 'examples', 'task-contract.example.json'), 'utf8'));

test('public MCP exposes the eight-tool contract-enforced surface', () => {
  const names = TOOL_DEFINITIONS.map((item) => item.name).sort();
  assert.deepEqual(names, [
    'task_proof_claim',
    'task_proof_contract_source_receipt',
    'task_proof_probe',
    'task_proof_review',
    'task_proof_run_checks',
    'task_proof_snapshot',
    'task_proof_validate_claim',
    'task_proof_validate_contract',
  ]);
});

test('public Claim and Review schemas fail closed without a frozen contract', () => {
  assert.equal(TOOL_INPUT_SCHEMAS.task_proof_claim.safeParse({ claim: {} }).success, false);
  assert.equal(TOOL_INPUT_SCHEMAS.task_proof_validate_claim.safeParse({ claim: {} }).success, false);
  assert.equal(TOOL_INPUT_SCHEMAS.task_proof_review.safeParse({
    claim: {}, reviewer: { role: 'reviewer', runId: 'review-run' }, findings: [],
  }).success, false);
});

test('public Review schema requires attestation and the exact authority receipt set', () => {
  const base = {
    contract,
    claim: {},
    reviewer: { role: 'reviewer', runId: 'review-run' },
    findings: [],
  };
  assert.equal(TOOL_INPUT_SCHEMAS.task_proof_review.safeParse(base).success, false);
  assert.equal(TOOL_INPUT_SCHEMAS.task_proof_review.safeParse({
    ...base,
    reviewerAttestation: {
      level: 'R2', method: 'procedural_attestation', sessionId: 'review-run',
      reconstructedBeforeReadingClaim: true,
      independentEvidenceCollected: true,
      adversarialEvidenceCollected: false,
    },
    authorityReceipts: [],
  }).success, true);
});

test('public contract validation is available over the real handler', async () => {
  const result = await handleTaskProofTool('task_proof_validate_contract', { contract });
  assert.equal(result.ok, true);
  assert.equal(result.contract.schemaVersion, TASK_CONTRACT_VERSION);
  assert.match(result.contractDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.minimumReviewerLevel, 'R2');
});
