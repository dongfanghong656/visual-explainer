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
  sha256,
  validateClaim,
} from './core.mjs';
import {
  computeStrictGateStatus,
  evaluateFindingCoverage,
  validateClaimEvidencePolicy,
  verifyMcpReceipt,
} from './hardening.mjs';
import { renderTaskProofSvgV2 } from './renderer-v2.mjs';

const DIGEST_RE = /^sha256:([0-9a-f]{64})$/i;
const SHA_RE = /^[0-9a-f]{40}$/i;
const GATE_STATUSES = new Set(['PASS', 'PASS_WITH_LIMITS', 'FAIL', 'INCONCLUSIVE']);
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_STORED_FILE_BYTES = 8 * 1024 * 1024;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function repositoryRoot(repositoryPath) {
  const requested = realpathSync(path.resolve(repositoryPath ?? '.'));
  try {
    return realpathSync(execFileSync('git', ['-C', requested, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
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

function ensureDirectoryChain(root, segments) {
  let current = root;
  for (const segment of segments) {
    if (typeof segment !== 'string' || segment === '' || segment === '.' || segment === '..' || segment.includes(path.sep)) {
      throw new TaskProofError('OUTPUT_SEGMENT', 'Artifact output contains an unsafe path segment.');
    }
    const next = path.join(current, segment);
    if (!isInside(root, next)) throw new TaskProofError('OUTPUT_ESCAPE', 'Artifact output escaped the repository.');
    if (!existsSync(next)) {
      try {
        mkdirSync(next, { mode: 0o700 });
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
    const stat = lstatSync(next);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new TaskProofError('OUTPUT_COLLISION', `Artifact output component is not a regular directory: ${segment}`);
    }
    current = realpathSync(next);
    if (!isInside(root, current)) throw new TaskProofError('OUTPUT_ESCAPE', 'Artifact output physically escapes the repository.');
  }
  return current;
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

function setEquals(actual, expected) {
  const left = new Set(actual ?? []);
  const right = new Set(expected ?? []);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function validateReviewArtifact(review) {
  const errors = [];
  if (!isRecord(review)) return { ok: false, errors: [{ code: 'TYPE', message: 'Review must be an object.' }] };
  if (Buffer.byteLength(JSON.stringify(review), 'utf8') > MAX_ARTIFACT_BYTES) errors.push({ code: 'PAYLOAD_TOO_LARGE', message: 'Review exceeds the artifact size limit.' });
  if (review.protocolVersion !== PROTOCOL_VERSION) errors.push({ code: 'PROTOCOL_VERSION', message: `Expected ${PROTOCOL_VERSION}.` });
  if (review.kind !== REVIEW_KIND) errors.push({ code: 'KIND', message: `Expected ${REVIEW_KIND}.` });
  if (!SHA_RE.test(review.repository?.baseSha ?? '')) errors.push({ code: 'BASE_SHA', message: 'Review requires a full base SHA.' });
  if (!SHA_RE.test(review.repository?.headSha ?? '')) errors.push({ code: 'HEAD_SHA', message: 'Review requires a full head SHA.' });
  if (!DIGEST_RE.test(review.repository?.snapshotDigest ?? '')) errors.push({ code: 'SNAPSHOT_DIGEST', message: 'Review requires a snapshot digest.' });
  if (!DIGEST_RE.test(review.claimDigest ?? '')) errors.push({ code: 'CLAIM_DIGEST', message: 'Review requires a claim digest.' });
  if (!GATE_STATUSES.has(review.gate?.status)) errors.push({ code: 'GATE_STATUS', message: 'Review has an invalid gate status.' });
  if (!isRecord(review.reviewer) || typeof review.reviewer.runId !== 'string' || review.reviewer.role !== 'reviewer') {
    errors.push({ code: 'REVIEWER', message: 'Review requires reviewer.runId and reviewer role.' });
  }

  const criteria = new Map();
  for (const criterion of review.task?.acceptanceCriteria ?? []) {
    if (!isRecord(criterion) || typeof criterion.id !== 'string') {
      errors.push({ code: 'CRITERION', message: 'Every acceptance criterion requires an id.' });
      continue;
    }
    if (criteria.has(criterion.id)) errors.push({ code: 'DUPLICATE_CRITERION', message: `Duplicate acceptance criterion: ${criterion.id}` });
    criteria.set(criterion.id, criterion);
  }

  const claims = new Map();
  for (const claim of review.claims ?? []) {
    if (!isRecord(claim) || typeof claim.id !== 'string') {
      errors.push({ code: 'CLAIM', message: 'Every review claim requires an id.' });
      continue;
    }
    if (claims.has(claim.id)) errors.push({ code: 'DUPLICATE_CLAIM', message: `Duplicate claim: ${claim.id}` });
    claims.set(claim.id, claim);
    for (const criterionId of claim.acceptanceCriteriaIds ?? []) {
      if (!criteria.has(criterionId)) errors.push({ code: 'UNKNOWN_CRITERION', message: `${claim.id} references unknown criterion ${criterionId}.` });
    }
  }

  const evidenceById = new Map();
  for (const evidence of review.reviewEvidence ?? []) {
    if (!isRecord(evidence) || typeof evidence.id !== 'string') {
      errors.push({ code: 'EVIDENCE', message: 'Every review evidence item requires an id.' });
      continue;
    }
    if (evidenceById.has(evidence.id)) errors.push({ code: 'DUPLICATE_EVIDENCE', message: `Duplicate review evidence: ${evidence.id}` });
    evidenceById.set(evidence.id, evidence);
    if (!verifyMcpReceipt(evidence, review.repository?.snapshotDigest)) {
      errors.push({ code: 'INVALID_RECEIPT', message: `Review evidence has an invalid MCP receipt: ${evidence.id}` });
    }
    if (evidence.producerRunId !== review.reviewer?.runId) {
      errors.push({ code: 'EVIDENCE_PRODUCER', message: `Review evidence was not produced by the recorded reviewer run: ${evidence.id}` });
    }
  }

  const findings = new Map();
  for (const finding of review.findings ?? []) {
    if (!isRecord(finding) || typeof finding.claimId !== 'string') {
      errors.push({ code: 'FINDING', message: 'Every finding requires claimId.' });
      continue;
    }
    const claim = claims.get(finding.claimId);
    if (!claim) errors.push({ code: 'UNKNOWN_FINDING_CLAIM', message: `Finding references unknown claim: ${finding.claimId}` });
    if (findings.has(finding.claimId)) errors.push({ code: 'DUPLICATE_FINDING', message: `Duplicate finding: ${finding.claimId}` });
    findings.set(finding.claimId, finding);
    if (claim && finding.declaredStatus !== claim.declaredStatus) {
      errors.push({ code: 'DECLARED_STATUS_MISMATCH', message: `Finding status does not match claim ${finding.claimId}.` });
    }
    for (const evidenceId of finding.reviewEvidenceIds ?? []) {
      if (!evidenceById.has(evidenceId)) errors.push({ code: 'UNKNOWN_REVIEW_EVIDENCE', message: `Finding references unknown evidence: ${evidenceId}` });
    }
    if (claim && ['verified', 'partially_verified'].includes(finding.verdict)) {
      const coverage = evaluateFindingCoverage({
        claimItem: claim,
        criterionMap: criteria,
        evidenceById,
        finding,
        snapshotDigest: review.repository?.snapshotDigest,
        reviewerRunId: review.reviewer?.runId,
      });
      if (finding.verdict === 'verified' && coverage.uncovered.length > 0) {
        errors.push({ code: 'UNCOVERED_VERIFICATION', message: `${claim.id} is verified without evidence for ${coverage.uncovered.join(', ')}.` });
      }
      if (finding.verdict === 'partially_verified' && coverage.covered.length === 0) {
        errors.push({ code: 'EMPTY_PARTIAL_VERIFICATION', message: `${claim.id} is partially verified without any covered criterion.` });
      }
    }
    if (finding.verdict === 'stale' && review.repository?.staleAgainstClaim !== true) {
      errors.push({ code: 'FALSE_STALE', message: `${finding.claimId} is marked stale although the review snapshot is not stale.` });
    }
  }
  for (const claim of claims.values()) {
    if (!findings.has(claim.id)) errors.push({ code: 'MISSING_FINDING', message: `Missing finding for claim: ${claim.id}` });
  }

  const findingValues = [...findings.values()];
  const computedGate = computeStrictGateStatus([...claims.values()], findingValues);
  if (review.gate?.status !== computedGate) errors.push({ code: 'GATE_MISMATCH', message: `Stored gate ${review.gate?.status} does not match computed gate ${computedGate}.` });
  const expectedVerified = findingValues.filter((finding) => finding.verdict === 'verified').map((finding) => finding.claimId);
  const expectedRejected = findingValues.filter((finding) => ['unsupported', 'contradicted'].includes(finding.verdict)).map((finding) => finding.claimId);
  const expectedStale = findingValues.filter((finding) => finding.verdict === 'stale').map((finding) => finding.claimId);
  if (!setEquals(review.gate?.verifiedClaimIds, expectedVerified)) errors.push({ code: 'GATE_VERIFIED_IDS', message: 'gate.verifiedClaimIds does not match findings.' });
  if (!setEquals(review.gate?.rejectedClaimIds, expectedRejected)) errors.push({ code: 'GATE_REJECTED_IDS', message: 'gate.rejectedClaimIds does not match findings.' });
  if (!setEquals(review.gate?.staleClaimIds, expectedStale)) errors.push({ code: 'GATE_STALE_IDS', message: 'gate.staleClaimIds does not match findings.' });

  const computedDigest = semanticArtifactDigest(review);
  if (review.artifactDigest !== computedDigest) errors.push({ code: 'ARTIFACT_DIGEST', message: 'Review artifact digest is missing or incorrect.' });
  return { ok: errors.length === 0, errors, computedGate, computedDigest };
}

export function validateTaskProofArtifact(artifact) {
  if (!isRecord(artifact)) return { ok: false, errors: [{ code: 'TYPE', message: 'Artifact must be an object.' }] };
  if (Buffer.byteLength(JSON.stringify(artifact), 'utf8') > MAX_ARTIFACT_BYTES) {
    return { ok: false, errors: [{ code: 'PAYLOAD_TOO_LARGE', message: 'Artifact exceeds the size limit.' }] };
  }
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

function verifyExisting(finalDirectory, expectedManifest, outputRoot) {
  const physicalDirectory = realpathSync(finalDirectory);
  if (!isInside(outputRoot, physicalDirectory)) throw new TaskProofError('OUTPUT_ESCAPE', 'Existing artifact directory escapes confinement.');
  const directoryStat = lstatSync(finalDirectory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw new TaskProofError('OUTPUT_COLLISION', 'Existing artifact path is not a regular directory.');
  const manifestPath = path.join(finalDirectory, 'manifest.json');
  if (!existsSync(manifestPath)) throw new TaskProofError('OUTPUT_INCOMPLETE', 'Existing immutable artifact directory has no manifest.');
  const manifestStat = lstatSync(manifestPath);
  if (manifestStat.isSymbolicLink() || !manifestStat.isFile() || manifestStat.size > MAX_MANIFEST_BYTES) {
    throw new TaskProofError('OUTPUT_TAMPERED', 'Existing artifact manifest is unsafe or oversized.');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.manifestDigest !== semanticManifestDigest(manifest)) throw new TaskProofError('OUTPUT_TAMPERED', 'Existing artifact manifest digest is invalid.');
  if (manifest.manifestDigest !== expectedManifest.manifestDigest) throw new TaskProofError('OUTPUT_COLLISION', 'Existing artifact directory has different content.');
  for (const [key, expected] of Object.entries(expectedManifest.files)) {
    const stored = manifest.files?.[key];
    if (!stored || stored.path !== expected.path || stored.digest !== expected.digest || stored.sizeBytes !== expected.sizeBytes) {
      throw new TaskProofError('OUTPUT_TAMPERED', `Stored manifest entry differs for ${key}.`);
    }
    const filename = path.join(finalDirectory, path.basename(expected.path));
    if (!existsSync(filename)) throw new TaskProofError('OUTPUT_INCOMPLETE', `Missing immutable artifact file: ${expected.path}`);
    const stat = lstatSync(filename);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== expected.sizeBytes || stat.size > MAX_STORED_FILE_BYTES) {
      throw new TaskProofError('OUTPUT_TAMPERED', `Artifact file is unsafe or has the wrong size: ${expected.path}`);
    }
    if (sha256(readFileSync(filename)) !== expected.digest) {
      throw new TaskProofError('OUTPUT_TAMPERED', `Artifact file digest mismatch: ${expected.path}`);
    }
  }
}

export function writeTaskProofArtifactsStrict({ artifact, repositoryPath = '.', basename } = {}) {
  const validation = validateTaskProofArtifact(artifact);
  if (!validation.ok) throw new TaskProofError('INVALID_ARTIFACT', 'Task Proof artifact validation failed.', validation);
  const root = repositoryRoot(repositoryPath);
  const outputRoot = ensureDirectoryChain(root, ['.artifacts', 'task-proof']);

  const digestMatch = DIGEST_RE.exec(artifact.artifactDigest);
  if (!digestMatch) throw new TaskProofError('ARTIFACT_DIGEST', 'Artifact digest is invalid.');
  const digestHex = digestMatch[1].toLowerCase();
  const stem = safeStem(basename ?? artifact.id);
  const stemDirectory = ensureDirectoryChain(outputRoot, [stem]);
  const finalDirectory = path.join(stemDirectory, digestHex);
  if (!isInside(outputRoot, finalDirectory)) throw new TaskProofError('OUTPUT_ESCAPE', 'Artifact directory escaped the output root.');

  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  const svg = renderTaskProofSvgV2(artifact);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(artifact.task?.title ?? 'Task Proof')}</title><style>html,body{margin:0;background:#0d1117}svg{display:block;width:100vw;height:auto;max-height:100vh}</style></head><body>${svg}</body></html>`;
  const relativeDirectory = path.relative(root, finalDirectory).split(path.sep).join('/');
  const payloads = {
    json: { filename: 'artifact.json', content: json },
    svg: { filename: 'diagram.svg', content: svg },
    html: { filename: 'index.html', content: html },
  };
  const manifest = {
    protocolVersion: PROTOCOL_VERSION,
    artifactId: artifact.id,
    artifactKind: artifact.kind,
    artifactDigest: artifact.artifactDigest,
    directory: relativeDirectory,
    files: Object.fromEntries(Object.entries(payloads).map(([key, payload]) => [key, {
      path: `${relativeDirectory}/${payload.filename}`,
      digest: sha256(payload.content),
      sizeBytes: Buffer.byteLength(payload.content, 'utf8'),
    }])),
  };
  manifest.manifestDigest = semanticManifestDigest(manifest);

  if (existsSync(finalDirectory)) {
    verifyExisting(finalDirectory, manifest, outputRoot);
  } else {
    const temporary = mkdtempSync(path.join(outputRoot, '.tmp-'));
    try {
      for (const payload of Object.values(payloads)) writeDurable(path.join(temporary, payload.filename), payload.content);
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
