import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const tests = readdirSync(directory)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join(directory, name));

if (tests.length === 0) throw new Error('No Task Proof tests found.');
const result = spawnSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
