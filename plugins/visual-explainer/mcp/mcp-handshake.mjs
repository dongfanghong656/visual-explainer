import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyVisualExplainerMcp } from './mcp-handshake-core.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..');
const serverPath = path.join(directory, 'server.mjs');
const deployedBinary = process.env.VISUAL_EXPLAINER_MCP_DEPLOYED === '1';
const deployedThroughCmd = deployedBinary && process.platform === 'win32';
const result = await verifyVisualExplainerMcp({
  command: deployedThroughCmd
    ? (process.env.ComSpec ?? 'cmd.exe')
    : deployedBinary ? 'visual-explainer-mcp' : process.execPath,
  args: deployedThroughCmd
    ? ['/d', '/s', '/c', 'visual-explainer-mcp']
    : deployedBinary ? [] : [serverPath],
  cwd: repositoryRoot,
  environment: process.env,
  server: deployedBinary ? 'installed-package-binary' : 'checkout-module',
});
console.log(JSON.stringify(result, null, 2));
