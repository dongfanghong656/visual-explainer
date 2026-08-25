import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..');
const serverPath = path.join(directory, 'mcp-server.mjs');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: repositoryRoot,
  env: {
    ...process.env,
    TASK_PROOF_ALLOW_EXECUTION: '0',
  },
  stderr: 'pipe',
});
const client = new Client(
  { name: 'task-proof-handshake', version: '0.2.0' },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  for (const expected of [
    'task_proof_snapshot',
    'task_proof_probe',
    'task_proof_run_checks',
    'task_proof_validate_claim',
    'task_proof_claim',
    'task_proof_review',
  ]) {
    if (!names.includes(expected)) throw new Error(`MCP handshake omitted tool: ${expected}`);
  }
  const response = await client.callTool({
    name: 'task_proof_snapshot',
    arguments: { repositoryPath: repositoryRoot },
  });
  if (response.isError) throw new Error(`Snapshot tool returned an MCP error: ${JSON.stringify(response.content)}`);
  const text = response.content.find((part) => part.type === 'text')?.text;
  if (!text) throw new Error('Snapshot tool returned no text content.');
  const payload = JSON.parse(text);
  if (!payload.snapshot?.snapshotDigest || !payload.snapshot?.repository?.headSha) {
    throw new Error('Snapshot tool response is missing its digest or head SHA.');
  }
  console.log(JSON.stringify({ ok: true, tools: names, snapshotDigest: payload.snapshot.snapshotDigest }, null, 2));
} finally {
  await client.close();
}
