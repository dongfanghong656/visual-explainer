import {
  TOOL_DEFINITIONS,
  TOOL_INPUT_SCHEMAS,
  createTaskProofServer,
} from './mcp-server.mjs';

const expected = [
  'task_proof_snapshot',
  'task_proof_probe',
  'task_proof_run_checks',
  'task_proof_validate_contract',
  'task_proof_contract_source_receipt',
  'task_proof_validate_claim',
  'task_proof_claim',
  'task_proof_review',
];
const names = TOOL_DEFINITIONS.map((tool) => tool.name);
for (const name of expected) {
  if (!names.includes(name)) throw new Error(`Missing MCP tool: ${name}`);
  if (!TOOL_INPUT_SCHEMAS[name]) throw new Error(`Missing runtime input schema: ${name}`);
}
if (new Set(names).size !== names.length) throw new Error('Duplicate MCP tool name.');
for (const tool of TOOL_DEFINITIONS) {
  if (!tool.description || tool.inputSchema?.type !== 'object' || tool.inputSchema?.additionalProperties !== false) {
    throw new Error(`Invalid MCP tool definition: ${tool.name}`);
  }
}
const server = createTaskProofServer();
if (!server || typeof server.registerTool !== 'function') throw new Error('Task Proof MCP server factory returned an invalid server.');
console.log(JSON.stringify({ ok: true, tools: names, transport: 'stdio-v2' }, null, 2));
