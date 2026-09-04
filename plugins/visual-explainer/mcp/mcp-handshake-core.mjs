import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const EXPECTED_TOOLS = [
  'visual_explainer_prepare',
  'visual_explainer_render_html',
  'visual_explainer_render_quick',
];

export async function verifyVisualExplainerMcp({
  command,
  args = [],
  cwd,
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
    env: inheritedEnvironment,
    stderr: 'pipe',
  });
  const client = new Client(
    { name: 'visual-explainer-handshake', version: '0.11.0-alpha.1' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    for (const expected of EXPECTED_TOOLS) {
      if (!names.includes(expected)) throw new Error(`Visual Explainer MCP omitted tool: ${expected}`);
    }
    const response = await client.callTool({
      name: 'visual_explainer_prepare',
      arguments: {
        topic: 'Codex local integration smoke test',
        goal: 'Verify the general visual renderer MCP surface is callable.',
      },
    });
    if (response.isError) {
      throw new Error(`Visual Explainer prepare returned an MCP error: ${JSON.stringify(response.content)}`);
    }
    const prepared = response.structuredContent;
    if (prepared?.topic !== 'Codex local integration smoke test') {
      throw new Error('Visual Explainer prepare response is missing its structured topic.');
    }
    return { ok: true, server, tools: names, preparedTopic: prepared.topic };
  } finally {
    await client.close();
  }
}
