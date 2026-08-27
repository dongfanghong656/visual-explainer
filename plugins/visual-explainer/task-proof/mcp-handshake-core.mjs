import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const EXPECTED_TOOLS = [
  'task_proof_snapshot',
  'task_proof_probe',
  'task_proof_run_checks',
  'task_proof_validate_contract',
  'task_proof_contract_source_receipt',
  'task_proof_validate_claim',
  'task_proof_claim',
  'task_proof_review',
];

export async function verifyTaskProofMcp({
  command,
  args = [],
  cwd,
  repositoryPath = cwd,
  environment = process.env,
  server,
}) {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(environment).filter((entry) => typeof entry[1] === 'string'),
  );
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: {
      ...inheritedEnvironment,
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
    for (const expected of EXPECTED_TOOLS) {
      if (!names.includes(expected)) throw new Error(`MCP handshake omitted tool: ${expected}`);
    }
    const response = await client.callTool({
      name: 'task_proof_snapshot',
      arguments: { repositoryPath },
    });
    if (response.isError) throw new Error(`Snapshot tool returned an MCP error: ${JSON.stringify(response.content)}`);
    const text = response.content.find((part) => part.type === 'text')?.text;
    if (!text) throw new Error('Snapshot tool returned no text content.');
    const payload = JSON.parse(text);
    if (!payload.snapshot?.snapshotDigest || !payload.snapshot?.repository?.headSha) {
      throw new Error('Snapshot tool response is missing its digest or head SHA.');
    }
    return {
      ok: true,
      server,
      tools: names,
      snapshotDigest: payload.snapshot.snapshotDigest,
    };
  } finally {
    await client.close();
  }
}
