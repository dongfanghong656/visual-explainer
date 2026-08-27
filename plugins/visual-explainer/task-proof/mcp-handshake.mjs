import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyTaskProofMcp } from './mcp-handshake-core.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..');
const serverPath = path.join(directory, 'mcp-server.mjs');
const deployedBinary = process.env.TASK_PROOF_MCP_DEPLOYED === '1';
const deployedThroughCmd = deployedBinary && process.platform === 'win32';
const result = await verifyTaskProofMcp({
  command: deployedThroughCmd
    ? (process.env.ComSpec ?? 'cmd.exe')
    : deployedBinary ? 'visual-explainer-task-proof-mcp' : process.execPath,
  args: deployedThroughCmd
    ? ['/d', '/s', '/c', 'visual-explainer-task-proof-mcp']
    : deployedBinary ? [] : [serverPath],
  cwd: repositoryRoot,
  repositoryPath: repositoryRoot,
  environment: process.env,
  server: deployedBinary ? 'linked-package-binary' : 'checkout-module',
});
console.log(JSON.stringify(result, null, 2));
