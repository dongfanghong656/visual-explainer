import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  CLAIM_KIND,
  PROTOCOL_VERSION,
  REVIEW_KIND,
  TaskProofError,
  renderTaskProofSvg,
  sha256,
  validateClaim,
} from './core.mjs';
import {
  validateClaimEvidencePolicy,
  verifyMcpReceipt,
} from './hardening.mjs';

const DIGEST_RE = /^sha256:([0-9a-f]{64})$/i;
const SHA_RE = /^[0-9a-f]{40}$/i;
const GATE_STATUSES = new Set(['PASS', 'PASS_WITH_LIMITS', 'FAIL', 'INCONCLUSIVE']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function repositoryRoot(repositoryPath) {
  const requested = realpathSync(path.resolve(repositoryPath ?? '.'));
  try {
    return realpathSync(execFileSync('git', ['-C', requested, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 1024 * 1024, windowsHide: true,
    }).trim());
  } catch {
    throw new TaskProofError('GIT_FAILED', 'Cannot resolve repository root for artifact output.');
  }
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function semanticArtifactDigest(value) {
  const copy = { ...value };
  delete copy.artifactDigest;
  delete copy.manifestDigest;
  return sha256(copy);
}

function semanticManifestDigest(value) {
  const copy = { ...value };
  delete copy.manifestDigest;
  return sha256(copy);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeStem(value) {
  const stem = String(value ?? 'task-proof')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 96);
  return stem || 'task-proof';
}

function writeDurable(filename, content) {
  const descriptor = openSync(filename, 'wx', 0o600);
  try {
    writeFileSync(descriptor, content, { encoding: 'utf8' });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function atomicPointer(filename, content) {
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try {
    renameSync(temporary, filename);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) {
      rmSync(temporary, { force: true });
      throw error;
    }
    const backup = `${filename}.bak-${process.pid}-${Date.now()}`;
    try {
      if (existsSync(filename)) renameSync(filename, backup);
      renameSync(temporary, filename);
      rmSync(backup, { force: true });
    } catch (replacementError) {
      if (existsSync(backup) && !existsSync(filename)) renameSync(backup, filename);
      rmSync(temporary, { force: true });
      throw replacementError;
    }
  }
}

function expectedGate(review) {
  const findings = new Map((review.findings ?? []).map((finding) => [finding.claimId, finding]));
  const relevant = (review.claims ?? [])
    .filter((claim) => claim.declaredStatus === 'declared_done')
    .map((claim) => findings.get(claim.id));
  if (relevant.length === 0) return 'INCONCLUSIVE';
  if (relevant.some((finding) => !finding || finding.verdict === 'unsupported' || finding.verdict === 'contradicted')) return 'FAIL';
  if (relevant.some((finding) => finding.verdict === 'stale')) return 'INCONCLUSIVE';
  if (relevant.every((finding) => finding.verdict === 'verified')) return 'PASS';
  if (relevant.some((finding) => finding.verdict === 'partially_verified')) return 'PASS_WITH_LIMITS';
  return 'INCONCLUSIVE';
}

export function validateReviewArtifact(review) {
  const errors = [];
  if (!isRecord(review)) return { ok: false, errors: [{ code: 'TYPE', message: 'Review must be an object.' }] };
  if (review.protocolVersion !== PROTOCOL_VERSION) errors.push({ code: 'PROTOCOL_VERSION', message: `Expected ${PROTOCOL_VERSION}.` });
  if (review.kind !== REVIEW_KIND) errors.push({ code: 'KIND', message: `Expected ${REVIEW_KIND}.` });
  if (!SHA_RE.test(review.repository?.baseSha ?? '')) errors.push({ code: 'BASE_SHA', message: 'Review requires a full base SHA.' });
  if (!SHA_RE.test(review.repository?.headSha ?? '')) errors.push({ code: 'HEAD_SHA', message: 'Review requires a full head SHA.' });
  if (!DIGEST_RE.test(review.repository?.snapshotDigest ?? '')) errors.push({ code: 'SNAPSHOT_DIGEST', message: 'Review requires a snapshot digest.' });
  if (!DIGEST_RE.test(review.claimDigest ?? '')) errors.push({ code: 'CLAIM_DIGEST', message: 'Review requires a claim digest.' });
  if (!GATE_STATUSES.has(review.gate?.status)) errors.push({ code: 'GATE_STATUS', message: 'Review has an invalid gate status.' });
  const claims = new Map((review.claims ?? []).map((claim) => [claim.id, claim]));
  const findings = new Map();
  for (const finding of review.findings ?? []) {
    if (!claims.has(finding.claimId)) errors.push({ code: 'UNKNOWN_FINDING_CLAIM', message: `Finding references unknown claim: ${finding.claimId}` });
    if (findings.has(finding.claimId)) errors.push({ code: 'DUPLICATE_FINDING', message: `Duplicate finding: ${finding.claimId}` });
    findings.set(finding.claimId, finding);
  }
  for (const claim of claims.values()) {
    if (!findings.has(claim.id)) errors.push({ code: 'MISSING_FINDING', message: `Missing finding for claim: ${claim.id}` });
  }
  const evidenceIds = new Set();
  for (const evidence of review.reviewEvidence ?? []) {
    if (evidenceIds.has(evidence.id)) errors.push({ code: 'DUPLICATE_EVIDENCE', message: `Duplicate review evidence: ${evidence.id}` });
    evidenceIds.add(evidence.id);
    if (!verifyMcpReceipt(evidence, review.repository?.snapshotDigest)) {
      errors.push({ code: 'INVALID_RECEIPT', message: `Review evidence has an invalid MCP receipt: ${evidence.id}` });
    }
  }
  for (const finding of findings.values()) {
    for (const id of finding.reviewEvidenceIds ?? []) {
      if (!evidenceIds.has(id)) errors.push({ code: 'UNKNOWN_REVIEW_EVIDENCE', message: `Finding references unknown evidence: ${id}` });
    }
  }
  const computedGate = expectedGate(review);
  if (review.gate?.status !== computedGate) errors.push({ code: 'GATE_MISMATCH', message: `Stored gate ${review.gate?.status} does not match computed gate ${computedGate}.` });
  const computedDigest = semanticArtifactDigest(review);
  if (review.artifactDigest !== computedDigest) errors.push({ code: 'ARTIFACT_DIGEST', message: 'Review artifact digest is missing or incorrect.' });
  return { ok: errors.length === 0, errors, computedGate, computedDigest };
}

export function validateTaskProofArtifact(artifact) {
  if (!isRecord(artifact)) return { ok: false, errors: [{ code: 'TYPE', message: 'Artifact must be an object.' }] };
  if (artifact.kind === CLAIM_KIND) {
    const structural = validateClaim(artifact);
    const policy = validateClaimEvidencePolicy(artifact);
    const errors = [...structural.errors, ...policy.errors];
    if (structural.ok && policy.ok && artifact.artifactDigest !== structural.digest) {
      errors.push({ code: 'ARTIFACT_DIGEST', message: 'Claim artifact digest is missing or incorrect.' });
    }
    return { ok: errors.length === 0, errors, warnings: structural.warnings, computedDigest: structural.digest };
  }
  if (artifact.kind === REVIEW_KIND) return validateReviewArtifact(artifact);
  return { ok: false, errors: [{ code: 'KIND', message: 'Only Task Proof claim and review artifacts can be stored.' }] };
}

function ensureSafeDirectory(directory, confinementRoot) {
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new TaskProofError('OUTPUT_COLLISION', 'Artifact output component is not a regular directory.');
  const physical = realpathSync(directory);
  if (!isInside(confinementRoot, physical)) throw new TaskProofError('OUTPUT_ESCAPE', 'Artifact output component escapes confinement.');
  return physical;
}

function verifyExisting(finalDirectory, expectedManifest) {
  ensureSafeDirectory(finalDirectory, path.dirname(path.dirname(finalDirectory)));
  const manifestPath = path.join(finalDirectory, 'manifest.json');
  if (!existsSync(manifestPath)) throw new TaskProofError('OUTPUT_INCOMPLETE', 'Existing immutable artifact directory has no manifest.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const storedDigest = manifest.manifestDigest;
  if (storedDigest !== semanticManifestDigest(manifest)) throw new TaskProofError('OUTPUT_TAMPERED', 'Existing artifact manifest digest is invalid.');
  if (storedDigest !== expectedManifest.manifestDigest) throw new TaskProofError('OUTPUT_COLLISION', 'Existing artifact directory has different content.');
  for (const descriptor of Object.values(manifest.files ?? {})) {
    const filename = path.resolve(finalDirectory, path.basename(descriptor.path));
    if (!isInside(finalDirectory, filename) || !existsSync(filename)) throw new TaskProofError('OUTPUT_INCOMPLETE', `Missing immutable artifact file: ${descriptor.path}`);
    const stat = lstatSync(filename);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new TaskProofError('OUTPUT_TAMPERED', `Artifact file is not regular: ${descriptor.path}`);
    const bytes = readFileSync(filename);
    if (sha256(bytes) !== descriptor.digest || bytes.length !== descriptor.sizeBytes) {
      throw new TaskProofError('OUTPUT_TAMPERED', `Artifact file digest or size mismatch: ${descriptor.path}`);
    }
  }
}

export function writeTaskProofArtifactsStrict({ artifact, repositoryPath = '.', basename } = {}) {
  const validation = validateTaskProofArtifact(artifact);
  if (!validation.ok) throw new TaskProofError('INVALID_ARTIFACT', 'Task Proof artifact validation failed.', validation);
  const root = repositoryRoot(repositoryPath);
  const outputRoot = path.join(root, '.artifacts', 'task-proof');
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const physicalOutputRoot = ensureSafeDirectory(outputRoot, root);

  const digestMatch = DIGEST_RE.exec(artifact.artifactDigest);
  if (!digestMatch) throw new TaskProofError('ARTIFACT_DIGEST', 'Artifact digest is invalid.');
  const digestHex = digestMatch[1].toLowerCase();
  const stem = safeStem(basename ?? artifact.id);
  const stemDirectory = path.join(outputRoot, stem);
  mkdirSync(stemDirectory, { recursive: true, mode: 0o700 });
  ensureSafeDirectory(stemDirectory, physicalOutputRoot);
  const finalDirectory = path.join(stemDirectory, digestHex);
  if (!isInside(outputRoot, finalDirectory)) throw new TaskProofError('OUTPUT_ESCAPE', 'Artifact directory escaped the output root.');

  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  const svg = renderTaskProofSvg(artifact);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(artifact.task?.title ?? 'Task Proof')}</title><style>html,body{margin:0;background:#0d1117}svg{display:block;width:100vw;height:auto;max-height:100vh}</style></head><body>${svg}</body></html>`;
  const relativeDirectory = path.relative(root, finalDirectory).split(path.sep).join('/');
  const payloads = {
    'artifact.json': json,
    'diagram.svg': svg,
    'index.html': html,
  };
  const manifest = {
    protocolVersion: PROTOCOL_VERSION,
    artifactId: artifact.id,
    artifactKind: artifact.kind,
    artifactDigest: artifact.artifactDigest,
    directory: relativeDirectory,
    files: Object.fromEntries(Object.entries(payloads).map(([name, content]) => [
      name.replace(/\.[^.]+$/, ''),
      {
        path: `${relativeDirectory}/${name}`,
        digest: sha256(content),
        sizeBytes: Buffer.byteLength(content, 'utf8'),
      },
    ])),
  };
  manifest.manifestDigest = semanticManifestDigest(manifest);

  if (existsSync(finalDirectory)) {
    verifyExisting(finalDirectory, manifest);
  } else {
    const temporary = mkdtempSync(path.join(outputRoot, '.tmp-'));
    try {
      for (const [name, content] of Object.entries(payloads)) writeDurable(path.join(temporary, name), content);
      writeDurable(path.join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      renameSync(temporary, finalDirectory);
    } catch (error) {
      rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  atomicPointer(path.join(stemDirectory, 'LATEST'), `${digestHex}\n`);
  return {
    outputDirectory: relativeDirectory,
    json: `${relativeDirectory}/artifact.json`,
    svg: `${relativeDirectory}/diagram.svg`,
    html: `${relativeDirectory}/index.html`,
    manifest: `${relativeDirectory}/manifest.json`,
    latestPointer: `${path.relative(root, stemDirectory).split(path.sep).join('/')}/LATEST`,
    manifestDigest: manifest.manifestDigest,
  };
}
