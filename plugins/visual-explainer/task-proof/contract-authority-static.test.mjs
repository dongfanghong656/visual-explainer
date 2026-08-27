import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TASK_CONTRACT_VERSION,
  AUTHORITY_RECEIPT_VERSION,
  digestTaskContract,
  normalizeTaskContract,
} from './contract-authority.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, 'task-contract.schema.json'), 'utf8'));
const example = JSON.parse(readFileSync(join(here, 'examples', 'task-contract.example.json'), 'utf8'));
const currentDoc = readFileSync(join(here, 'CONTRACT_AUTHORITY_V2.4.md'), 'utf8');
const old21 = readFileSync(join(here, 'CONTRACT_AUTHORITY_V2.1.md'), 'utf8');
const old23 = readFileSync(join(here, 'CONTRACT_AUTHORITY_V2.3.md'), 'utf8');

test('runtime, schema, example, and documentation use one contract version', () => {
  assert.equal(TASK_CONTRACT_VERSION, '2.4.0');
  assert.equal(AUTHORITY_RECEIPT_VERSION, '1.4.0');
  assert.equal(schema.properties.schemaVersion.const, TASK_CONTRACT_VERSION);
  assert.equal(example.schemaVersion, TASK_CONTRACT_VERSION);
  assert.match(currentDoc, /Protocol version: `2\.4\.0`/);
  assert.match(currentDoc, /Authority receipt version: `1\.4\.0`/);
  assert.match(old21, /Superseded/);
  assert.match(old23, /Superseded/);
  assert.match(old23, /CONTRACT_AUTHORITY_V2\.4\.md/);
});

test('current example passes executable normalization and produces a stable digest', () => {
  const normalized = normalizeTaskContract(example);
  assert.equal(normalized.contractId, 'TPC-0001');
  assert.match(digestTaskContract(example), /^sha256:[0-9a-f]{64}$/);
});

test('portable schema forbids unknown fields and requires a blocking criterion', () => {
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.criteria.minItems, 1);
  assert.equal(schema.properties.criteria.contains.properties.criticality.const, 'blocking');
  assert.equal(schema.$defs.criterion.additionalProperties, false);
  assert.equal(schema.$defs.authority.additionalProperties, false);
});
