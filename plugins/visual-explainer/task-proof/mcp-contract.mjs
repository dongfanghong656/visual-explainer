import { TOOL_DEFINITIONS } from './mcp-server.mjs';

const expected = [
  'task_proof_snapshot',
  'task_proof_probe',
  'task_proof_run_checks',
  'task_proof_validate_claim',
  'task_proof_claim',
  'task_proof_review',
];
const names = TOOL_DEFINITIONS.map((tool) => tool.name);
for (const name of expected) {
  if (!names.includes(name)) throw new Error(`Missing MCP tool: ${name}`);
}
if (new Set(names).size !== names.length) throw new Error('Duplicate MCP tool name.');
for (const tool of TOOL_DEFINITIONS) {
  if (!tool.description || tool.inputSchema?.type !== 'object') {
    throw new Error(`Invalid MCP tool definition: ${tool.name}`);
  }
}
console.log(JSON.stringify({ ok: true, tools: names }, null, 2));
