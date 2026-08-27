import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..');
const compareCodeUnits = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const sourceFiles = readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
  .map((entry) => path.join(directory, entry.name))
  .sort(compareCodeUnits);

if (sourceFiles.length === 0) {
  console.error('Task Proof source verifier found no *.mjs files.');
  process.exit(2);
}

for (const filename of sourceFiles) {
  const result = spawnSync(process.execPath, ['--check', filename], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0 || result.error || result.signal) {
    process.stderr.write(result.stderr || result.stdout || String(result.error ?? result.signal ?? 'syntax check failed'));
    process.exit(1);
  }
}

const jsonFiles = [
  path.join(directory, 'task-proof.schema.json'),
  path.join(directory, 'task-contract.schema.json'),
  path.join(repositoryRoot, '.task-proof', 'checks.json'),
  path.join(directory, 'examples', 'scroll-restoration.review.json'),
  path.join(directory, 'examples', 'task-contract.example.json'),
];
for (const filename of jsonFiles) JSON.parse(readFileSync(filename, 'utf8'));

console.log(JSON.stringify({
  ok: true,
  syntaxChecked: sourceFiles.length,
  jsonChecked: jsonFiles.map((filename) => path.relative(repositoryRoot, filename)),
}, null, 2));
