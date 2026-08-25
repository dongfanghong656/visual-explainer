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

function artifactDigest(value) {
  const copy = { ...value };
  delete copy.artifactDigest;
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
  renameSync(temporary, filename);
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
  const computedDigest = artifactDigest(review);
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

function verifyExisting(finalDirectory, manifestDigest) {
  const stat = lstatSync(finalDirectory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new TaskProofError('OUTPUT_COLLISION', 'Existing artifact path is not a regular directory.');
  const manifestPath = path.join(finalDirectory, 'manifest.json');
  if (!existsSync(manifestPath)) throw new TaskProofError('OUTPUT_INCOMPLETE', 'Existing immutable artifact directory has no manifest.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.manifestDigest !== manifestDigest) throw new TaskProofError('OUTPUT_COLLISION', 'Existing artifact directory has different content.');
}

export function writeTaskProofArtifactsStrict({ artifact, repositoryPath = '.', basename } = {}) {
  const validation = validateTaskProofArtifact(artifact);
  if (!validation.ok) throw new TaskProofError('INVALID_ARTIFACT', 'Task Proof artifact validation failed.', validation);
  const root = repositoryRoot(repositoryPath);
  const outputRoot = path.join(root, '.artifacts', 'task-proof');
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const physicalOutputRoot = realpathSync(outputRoot);
  if (!isInside(root, physicalOutputRoot)) throw new TaskProofError('OUTPUT_ESCAPE', 'Artifact output root escapes the repository.');

  const digestMatch = DIGEST_RE.exec(artifact.artifactDigest);
  if (!digestMatch) throw new TaskProofError('ARTIFACT_DIGEST', 'Artifact digest is invalid.');
  const digestHex = digestMatch[1].toLowerCase();
  const stem = safeStem(basename ?? artifact.id);
  const stemDirectory = path.join(outputRoot, stem);
  mkdirSync(stemDirectory, { recursive: true, mode: 0o700 });
  const finalDirectory = path.join(stemDirectory, digestHex);
  if (!isInside(outputRoot, finalDirectory)) throw new TaskProofError('OUTPUT_ESCAPE', 'Artifact directory escaped the output root.');

  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  const svg = renderTaskProofSvg(artifact);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(artifact.task?.title ?? 'Task Proof')}</title><style>html,body{margin:0;background:#0d1117}svg{display:block;width:100vw;height:auto;max-height:100vh}</style></head><body>${svg}</body></html>`;
  const relativeDirectory = path.relative(root, finalDirectory).split(path.sep).join('/');
  const manifest = {
    protocolVersion: PROTOCOL_VERSION,
    artifactId: artifact.id,
    artifactKind: artifact.kind,
    artifactDigest: artifact.artifactDigest,
    directory: relativeDirectory,
    files: {
      json: { path: `${relativeDirectory}/artifact.json`, digest: sha256(json) },
      svg: { path: `${relativeDirectory}/diagram.svg`, digest: sha256(svg) },
      html: { path: `${relativeDirectory}/index.html`, digest: sha256(html) },
    },
  };
  manifest.manifestDigest = artifactDigest(manifest);

  if (existsSync(finalDirectory)) {
    verifyExisting(finalDirectory, manifest.manifestDigest);
  } else {
    const temporary = mkdtempSync(path.join(outputRoot, '.tmp-'));
    try {
      writeDurable(path.join(temporary, 'artifact.json'), json);
      writeDurable(path.join(temporary, 'diagram.svg'), svg);
      writeDurable(path.join(temporary, 'index.html'), html);
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
