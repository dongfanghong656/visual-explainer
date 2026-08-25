import {
  CLAIM_KIND,
  REVIEW_KIND,
  TaskProofError,
} from './core.mjs';

const COLORS = Object.freeze({
  background: '#0d1117',
  header: '#121822',
  panel: '#171d27',
  panelAlt: '#121822',
  border: '#303947',
  text: '#f3f6fb',
  muted: '#aab6c6',
  blue: '#6ea8fe',
  violet: '#9a8cff',
  green: '#36c98f',
  amber: '#e8b44f',
  red: '#f56c7a',
  grey: '#8f9cac',
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function compact(value, limit = 260) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function itemText(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return compact(value);
  if (!isRecord(value)) return compact(String(value ?? ''));
  const id = value.id ?? value.taskId ?? value.claimId;
  const body = value.title ?? value.task ?? value.statement ?? value.description ?? value.reason ?? value.summary ?? value.text;
  if (id && body) return `${id}: ${compact(body)}`;
  if (body) return compact(body);
  return compact(JSON.stringify(value));
}

function wrap(value, width = 42, maxLines = 4) {
  const text = compact(value, width * maxLines * 2);
  if (!text) return [];
  const spaced = /\s/.test(text);
  const tokens = spaced ? text.split(/\s+/) : [...text];
  const lines = [];
  let current = '';
  for (const token of tokens) {
    const separator = spaced && current ? ' ' : '';
    if ((current + separator + token).length > width && current) {
      lines.push(current);
      current = token;
      if (lines.length === maxLines - 1) break;
    } else {
      current += separator + token;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const reconstructed = lines.join(spaced ? ' ' : '');
  const originalComparable = spaced ? text.replace(/\s+/g, ' ') : text;
  if (reconstructed.length < originalComparable.length && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(0, width - 1))}…`;
  }
  return lines;
}

function textBlock(x, y, lines, {
  size = 18,
  weight = 400,
  lineHeight = 24,
  fill = COLORS.text,
  anchor = 'start',
} = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xmlEscape(line)}</tspan>`).join('')}</text>`;
}

function panel(x, y, width, height, title, bodyLines, accent = COLORS.blue) {
  return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16" fill="${COLORS.panel}" stroke="${COLORS.border}" stroke-width="1.5"/><rect x="${x}" y="${y}" width="7" height="${height}" rx="3.5" fill="${accent}"/>${textBlock(x + 22, y + 34, [title], { size: 19, weight: 800 })}${textBlock(x + 22, y + 70, bodyLines, { size: 16, lineHeight: 22, fill: COLORS.muted })}</g>`;
}

function statusColor(status) {
  return ({
    PASS: COLORS.green,
    PASS_WITH_LIMITS: COLORS.amber,
    FAIL: COLORS.red,
    INCONCLUSIVE: COLORS.grey,
    UNVERIFIED: COLORS.violet,
    verified: COLORS.green,
    partially_verified: COLORS.amber,
    unsupported: COLORS.red,
    contradicted: COLORS.red,
    stale: COLORS.grey,
    not_applicable: COLORS.grey,
    declared_done: COLORS.violet,
    partial: COLORS.amber,
    blocked: COLORS.red,
    not_done: COLORS.grey,
  })[status] ?? COLORS.blue;
}

function normalizeFlow(value) {
  if (Array.isArray(value)) return value.map(itemText).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [itemText(value)];
}

function remainingItems(artifact, isReview, findings) {
  const items = [];
  for (const claim of artifact.claims ?? []) {
    const finding = findings.get(claim.id);
    const state = isReview ? (finding?.verdict ?? 'unsupported') : claim.declaredStatus;
    const complete = isReview ? state === 'verified' : state === 'declared_done';
    if (!complete) items.push(`${claim.id} · ${state}: ${claim.statement}`);
  }
  for (const value of artifact.nextSteps ?? []) items.push(`NEXT · ${itemText(value)}`);
  for (const value of artifact.unknowns ?? []) items.push(`UNKNOWN · ${itemText(value)}`);
  for (const value of artifact.risks ?? []) items.push(`RISK · ${itemText(value)}`);
  return [...new Set(items.filter(Boolean))];
}

function bulletLines(items, width, maxLines) {
  const lines = [];
  for (const item of items) {
    const wrapped = wrap(item, width - 2, 3);
    for (const [index, line] of wrapped.entries()) {
      lines.push(`${index === 0 ? '• ' : '  '}${line}`);
      if (lines.length >= maxLines) return lines;
    }
  }
  return lines.length ? lines : ['• None recorded.'];
}

function claimCards(artifact, isReview, findings) {
  const claims = (artifact.claims ?? []).slice(0, 4);
  return claims.map((claim, index) => {
    const finding = findings.get(claim.id);
    const state = isReview ? (finding?.verdict ?? 'unsupported') : claim.declaredStatus;
    const evidenceIds = isReview ? (finding?.reviewEvidenceIds ?? []) : (claim.evidenceIds ?? []);
    const criterionIds = claim.acceptanceCriteriaIds ?? [];
    const y = 154 + index * 144;
    const statement = wrap(claim.statement, 58, 3);
    const metadata = [
      `criteria: ${criterionIds.length ? criterionIds.join(', ') : 'none'}`,
      `evidence: ${evidenceIds.length ? evidenceIds.join(', ') : 'none'}`,
    ];
    return `<g><rect x="490" y="${y}" width="620" height="126" rx="15" fill="${COLORS.panel}" stroke="${statusColor(state)}" stroke-width="2"/><rect x="510" y="${y + 18}" width="146" height="28" rx="14" fill="${statusColor(state)}"/><text x="583" y="${y + 38}" text-anchor="middle" font-size="14" font-weight="800" fill="${COLORS.background}">${xmlEscape(state)}</text>${textBlock(674, y + 38, [claim.id], { size: 18, weight: 800 })}${textBlock(514, y + 70, statement, { size: 17, lineHeight: 22 })}${textBlock(514, y + 112, metadata, { size: 13, lineHeight: 17, fill: COLORS.muted })}</g>`;
  }).join('');
}

function causalSection(x, y, label, items, accent) {
  const lines = bulletLines(items.length ? items : ['Not recorded.'], 34, 7);
  return `<g><text x="${x}" y="${y}" font-size="17" font-weight="800" fill="${accent}">${xmlEscape(label)}</text>${textBlock(x, y + 28, lines, { size: 15, lineHeight: 20, fill: COLORS.muted })}</g>`;
}

export function renderTaskProofSvgV2(artifact) {
  if (!isRecord(artifact) || ![CLAIM_KIND, REVIEW_KIND].includes(artifact.kind)) {
    throw new TaskProofError('RENDER_KIND', 'Only Task Proof claim and review artifacts can be rendered.');
  }
  const isReview = artifact.kind === REVIEW_KIND;
  const findings = new Map((artifact.findings ?? []).map((finding) => [finding.claimId, finding]));
  const gate = isReview ? (artifact.gate?.status ?? 'INCONCLUSIVE') : 'UNVERIFIED';
  const objective = artifact.task?.objective ?? 'No objective recorded.';
  const thesis = artifact.change?.thesis ?? 'No change thesis recorded.';
  const before = normalizeFlow(artifact.change?.before ?? artifact.change?.oldFailure);
  const after = normalizeFlow(artifact.change?.after ?? artifact.change?.newFlow);
  const remaining = remainingItems(artifact, isReview, findings);
  const evidence = (isReview ? artifact.reviewEvidence : artifact.evidence) ?? [];
  const evidenceLines = evidence.slice(0, 6).map((entry) => `${entry.id} · ${entry.kind} · ${compact(entry.locator, 38)}`);
  const omittedClaims = Math.max(0, (artifact.claims?.length ?? 0) - 4);
  if (omittedClaims > 0) remaining.unshift(`${omittedClaims} additional claim(s) are present in JSON but omitted from this one-screen view.`);
  const digest = artifact.artifactDigest ?? 'digest unavailable';
  const proofBoundary = isReview
    ? `Gate ${gate} is valid only for claim ${compact(artifact.claimDigest, 36)} and snapshot ${compact(artifact.repository?.snapshotDigest, 36)}.`
    : 'This is a claimant declaration. A different run must reproduce criterion-level evidence before completion can be verified.';
  const alt = [
    `${isReview ? 'Independent review' : 'Unverified claim'} for ${artifact.task?.title ?? artifact.id}.`,
    `Status ${gate}. Objective: ${objective}. Change: ${thesis}.`,
    ...((artifact.claims ?? []).map((claim) => {
      const state = isReview ? (findings.get(claim.id)?.verdict ?? 'unsupported') : claim.declaredStatus;
      return `${claim.id} ${state}: ${claim.statement}`;
    })),
    `Remaining: ${remaining.length ? remaining.join('; ') : 'none recorded'}.`,
  ].join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="task-proof-title task-proof-desc"><title id="task-proof-title">${xmlEscape(artifact.task?.title ?? 'Task Proof')}</title><desc id="task-proof-desc">${xmlEscape(alt)}</desc><rect width="1600" height="900" fill="${COLORS.background}"/><rect x="0" y="0" width="1600" height="92" fill="${COLORS.header}"/><text x="40" y="42" font-size="29" font-weight="850" fill="${COLORS.text}">${xmlEscape(isReview ? 'TASK PROOF · INDEPENDENT REVIEW' : 'TASK PROOF · CLAIM')}</text><text x="40" y="70" font-size="15" fill="${COLORS.muted}">${xmlEscape(artifact.task?.id ?? artifact.id)} · ${xmlEscape(artifact.repository?.branch ?? 'unknown branch')} · ${xmlEscape((artifact.repository?.headSha ?? '').slice(0, 12))}</text><rect x="1315" y="23" width="245" height="46" rx="23" fill="${statusColor(gate)}"/><text x="1437" y="53" text-anchor="middle" font-size="20" font-weight="850" fill="${COLORS.background}">${xmlEscape(gate)}</text>${panel(40, 116, 430, 146, 'Objective', wrap(objective, 42, 4), COLORS.blue)}${panel(40, 278, 430, 176, 'Change thesis', wrap(thesis, 42, 5), COLORS.violet)}${panel(40, 470, 430, 290, 'Remaining · blocked · risk', bulletLines(remaining, 42, 10), remaining.length ? COLORS.amber : COLORS.green)}<text x="490" y="132" font-size="21" font-weight="850" fill="${COLORS.text}">${xmlEscape(isReview ? 'Reviewed completion claims' : 'Declared completion claims')}</text>${claimCards(artifact, isReview, findings)}<rect x="1130" y="116" width="430" height="462" rx="16" fill="${COLORS.panelAlt}" stroke="${COLORS.border}" stroke-width="1.5"/><text x="1154" y="151" font-size="21" font-weight="850" fill="${COLORS.text}">Causal change logic</text>${causalSection(1154, 188, 'BEFORE · failure chain', before, COLORS.red)}${causalSection(1154, 330, 'CHANGE · mechanism', [thesis], COLORS.violet)}${causalSection(1154, 465, 'AFTER · resulting behavior', after, COLORS.green)}${panel(1130, 594, 430, 166, 'Evidence and proof boundary', [...bulletLines(evidenceLines, 40, 4), ...wrap(proofBoundary, 42, 4)], statusColor(gate))}<rect x="40" y="790" width="1520" height="72" rx="14" fill="${COLORS.header}"/><text x="64" y="818" font-size="14" fill="${COLORS.muted}">Artifact digest</text><text x="64" y="844" font-size="16" font-family="monospace" fill="${COLORS.text}">${xmlEscape(digest)}</text><text x="1534" y="821" text-anchor="end" font-size="14" fill="${COLORS.muted}">${xmlEscape(`${artifact.claims?.length ?? 0} claim(s) · ${evidence.length} evidence item(s)`)}</text><text x="1534" y="846" text-anchor="end" font-size="14" fill="${COLORS.muted}">${xmlEscape(isReview ? 'JSON + receipts are the fact source.' : 'Claimant output is never self-verifying.')}</text></svg>`;
}
