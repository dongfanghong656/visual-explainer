import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const producer = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/producer.valid.json', import.meta.url), 'utf8'),
);

test('stdio MCP lists tools and validates a fixture', { timeout: 20_000 }, async (context) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL('../server.mjs', import.meta.url).pathname],
  });
  const client = new Client({ name: 'task-proof-smoke-test', version: '0.1.0' });
  context.after(async () => {
    await client.close();
  });

  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'task_proof_compare',
    'task_proof_render',
    'task_proof_render_review',
    'task_proof_snapshot',
    'task_proof_template',
    'task_proof_validate',
    'task_proof_write_bundle',
  ]);

  const result = await client.callTool({
    name: 'task_proof_validate',
    arguments: { manifest: producer },
  });
  const payload = result.content.find((item) => item.type === 'text')?.text || '';
  assert.match(payload, /"overall": "verified_complete"/);
});
