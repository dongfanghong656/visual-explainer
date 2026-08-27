import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyTaskProofMcp } from './mcp-handshake-core.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..');
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const expectedTag = `v${packageJson.version}`;
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== expectedTag) {
  throw new Error(`Release tag ${process.env.GITHUB_REF_NAME} does not match package version ${expectedTag}.`);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run the package smoke test through npm so npm_execpath is available.');
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'visual-explainer-release-'));

function npmRun(args, cwd = repositoryRoot) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    windowsHide: true,
  });
}

try {
  const packed = JSON.parse(npmRun(['pack', '--json', '--pack-destination', temporaryRoot]));
  if (packed.length !== 1 || !packed[0]?.filename) throw new Error('npm pack did not produce exactly one package.');
  const tarball = path.join(temporaryRoot, packed[0].filename);
  const installRoot = path.join(temporaryRoot, 'install');
  mkdirSync(installRoot);
  npmRun([
    'install',
    '--prefix', installRoot,
    '--ignore-scripts',
    '--omit=peer',
    '--no-audit',
    '--no-fund',
    tarball,
  ]);

  const installedRoot = path.join(installRoot, 'node_modules', packageJson.name);
  const installedPackage = JSON.parse(readFileSync(path.join(installedRoot, 'package.json'), 'utf8'));
  if (installedPackage.version !== packageJson.version) {
    throw new Error(`Installed package version ${installedPackage.version} does not match ${packageJson.version}.`);
  }
  const serverPath = path.join(installedRoot, 'plugins', 'visual-explainer', 'task-proof', 'mcp-server.mjs');
  const handshake = await verifyTaskProofMcp({
    command: process.execPath,
    args: [serverPath],
    cwd: repositoryRoot,
    repositoryPath: repositoryRoot,
    environment: process.env,
    server: 'packed-artifact',
  });
  const pptxPath = path.join(installedRoot, 'plugins', 'visual-explainer', 'pptx', 'export.mjs');
  const pptxHelp = execFileSync(process.execPath, [pptxPath, '--help'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!pptxHelp.includes('Usage: visual-explainer-pptx')) throw new Error('Packed PPTX help is unavailable.');
  const htmlPath = path.join(temporaryRoot, 'optional-pptx.html');
  writeFileSync(htmlPath, '<section class="slide"><h1>Optional dependency check</h1></section>');
  const missingPptx = spawnSync(process.execPath, [pptxPath, htmlPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (missingPptx.status !== 1 || !missingPptx.stderr.includes('optional PPTX dependency')) {
    throw new Error('Packed PPTX entry did not report its missing optional dependency clearly.');
  }
  console.log(JSON.stringify({
    ok: true,
    package: packageJson.name,
    version: packageJson.version,
    files: packed[0].files.length,
    handshake,
    optionalPptxDependency: 'reported',
  }, null, 2));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
