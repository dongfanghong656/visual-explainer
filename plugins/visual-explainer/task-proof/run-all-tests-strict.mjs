import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const tests = readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
  .map((entry) => path.join(directory, entry.name))
  .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

if (tests.length === 0) {
  console.error('Task Proof strict test runner found no *.test.mjs files.');
  process.exit(2);
}

console.log(`Task Proof strict test runner discovered ${tests.length} files:`);
for (const filename of tests) console.log(`- ${path.basename(filename)}`);

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: path.resolve(directory, '..', '..', '..'),
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
if (result.signal) {
  console.error(`Task Proof test runner terminated by signal ${result.signal}.`);
  process.exit(1);
}
process.exit(Number.isInteger(result.status) ? result.status : 1);
