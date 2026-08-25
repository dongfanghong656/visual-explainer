import { compareManifests, validateManifest } from './core.mjs';

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function safeNodeId(value, prefix = 'n') {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${prefix}_${normalized || 'item'}`;
}

export function escapeMermaid(value, maxLength = 120) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/[<>]/g, '')
    .replace(/\|/g, '／')
    .trim()
    .slice(0, maxLength);
}

function statusClass(verdict) {
  if (verdict === 'verified') return 'verified';
  if (verdict === 'partially_verified') return 'partial';
  if (verdict === 'contradicted') return 'failed';
  if (verdict === 'blocked') return 'blocked';
  if (verdict === 'not_done') return 'next';
  return 'unknown';
}

function compactClaims(manifest, validation, limits) {
  const rawById = new Map(list(manifest.claims).map((claim) => [claim.id, claim]));
  const groups = {
    done: [],
    active: [],
    blocked: [],
    next: [],
    unknown: [],
  };
  for (const evaluated of validation.claims) {
    const item = { ...rawById.get(evaluated.id), ...evaluated };
    if (evaluated.verdict === 'verified') groups.done.push(item);
    else if (evaluated.verdict === 'blocked' || evaluated.verdict === 'contradicted') groups.blocked.push(item);
    else if (evaluated.claimStatus === 'not_done') groups.next.push(item);
    else if (evaluated.claimStatus === 'partial') groups.active.push(item);
    else groups.unknown.push(item);
  }
  groups.done = groups.done.slice(0, limits.done);
  groups.active = groups.active.slice(0, limits.active);
  groups.blocked = groups.blocked.slice(0, limits.blocked);
  groups.next = groups.next.slice(0, limits.next);
  groups.unknown = groups.unknown.slice(0, limits.unknown);
  return groups;
}

function mermaidHeader(title) {
  return [
    '%%{init: {"theme":"base","flowchart":{"curve":"basis","htmlLabels":true}}}%%',
    'flowchart LR',
    `  title_node["${escapeMermaid(title, 150)}"]:::title`,
  ];
}

function mermaidStyles() {
  return [
    '  classDef title fill:#111827,color:#ffffff,stroke:#111827,stroke-width:2px;',
    '  classDef goal fill:#e0e7ff,color:#111827,stroke:#4f46e5,stroke-width:2px;',
    '  classDef verified fill:#dcfce7,color:#14532d,stroke:#16a34a,stroke-width:2px;',
    '  classDef partial fill:#fef9c3,color:#713f12,stroke:#ca8a04,stroke-width:2px;',
    '  classDef failed fill:#fee2e2,color:#7f1d1d,stroke:#dc2626,stroke-width:2px;',
    '  classDef blocked fill:#ffedd5,color:#7c2d12,stroke:#ea580c,stroke-width:2px;',
    '  classDef next fill:#dbeafe,color:#1e3a8a,stroke:#2563eb,stroke-width:2px;',
    '  classDef unknown fill:#f3f4f6,color:#374151,stroke:#6b7280,stroke-width:1px,stroke-dasharray:4 3;',
    '  classDef evidence fill:#ffffff,color:#374151,stroke:#9ca3af,stroke-width:1px,stroke-dasharray:3 3;',
    '  classDef checkpoint fill:#f5f3ff,color:#4c1d95,stroke:#8b5cf6,stroke-width:1px;',
  ];
}

export function renderStatusMermaid(manifest, options = {}) {
  const validation = validateManifest(manifest);
  const limits = {
    done: options.maxDone ?? 4,
    active: options.maxActive ?? 2,
    blocked: options.maxBlocked ?? 3,
    next: options.maxNext ?? 3,
    unknown: options.maxUnknown ?? 2,
  };
  const groups = compactClaims(manifest, validation, limits);
  const title = `${text(manifest.project?.name, 'Project')} · ${text(manifest.task?.title, 'Task proof')}`;
  const lines = mermaidHeader(title);
  const goal = escapeMermaid(manifest.task?.objective || manifest.task?.title || 'Task objective', 170);
  lines.push(`  goal["🎯 ${goal}"]:::goal`);
  lines.push('  title_node --> goal');

  const evidenceById = new Map(list(manifest.evidence).map((item) => [item.id, item]));
  const orderedGroups = [
    ['done', '✅ Verified done'],
    ['active', '🟡 In progress / partial'],
    ['blocked', '⛔ Blocked / contradicted'],
    ['next', '➡ Next'],
    ['unknown', '❓ Unverified'],
  ];

  for (const [groupKey, label] of orderedGroups) {
    const items = groups[groupKey];
    if (!items.length) continue;
    lines.push(`  subgraph sg_${groupKey}["${label}"]`);
    lines.push('    direction TB');
    for (const claim of items) {
      const nodeId = safeNodeId(claim.id, 'claim');
      const summary = escapeMermaid(claim.summary || claim.title || claim.id, 100);
      lines.push(`    ${nodeId}["${escapeMermaid(claim.id, 28)} · ${summary}"]:::${statusClass(claim.verdict)}`);
      const evidence = list(claim.evidenceRefs)
        .map((id) => evidenceById.get(id))
        .filter(Boolean)
        .slice(0, 2);
      for (const item of evidence) {
        const evidenceId = safeNodeId(`${claim.id}_${item.id}`, 'ev');
        lines.push(`    ${evidenceId}["${escapeMermaid(item.type, 18)}: ${escapeMermaid(item.summary, 78)}"]:::evidence`);
        lines.push(`    ${evidenceId} -. proves .-> ${nodeId}`);
      }
    }
    lines.push('  end');
    const first = safeNodeId(items[0].id, 'claim');
    lines.push(`  goal --> ${first}`);
    for (let index = 0; index < items.length - 1; index += 1) {
      lines.push(`  ${safeNodeId(items[index].id, 'claim')} --> ${safeNodeId(items[index + 1].id, 'claim')}`);
    }
  }

  const checkpoint = manifest.checkpoint || {};
  const checkpointLabel = [
    text(manifest.project?.branch || checkpoint.branch),
    text(manifest.project?.head || checkpoint.head),
    text(checkpoint.capturedAt),
    `verdict=${validation.overall}`,
  ]
    .filter(Boolean)
    .join(' · ');
  lines.push(`  checkpoint["Checkpoint · ${escapeMermaid(checkpointLabel, 170)}"]:::checkpoint`);
  lines.push('  goal -. state .-> checkpoint');
  lines.push(...mermaidStyles());
  return lines.join('\n');
}

export function renderChangeLogicMermaid(manifest) {
  const logic = manifest.changeLogic;
  if (!logic || (!list(logic.before).length && !list(logic.after).length)) {
    return renderStatusMermaid(manifest);
  }
  const lines = mermaidHeader(text(logic.thesis, manifest.task?.title || 'Change logic'));
  lines.push('  subgraph before["Before · failure chain"]');
  lines.push('    direction TB');
  const beforeItems = list(logic.before).slice(0, 8);
  beforeItems.forEach((item, index) => {
    const id = safeNodeId(item.id || `before_${index}`, 'before');
    lines.push(`    ${id}["${escapeMermaid(item.event || item.text || item, 110)}"]:::${index === beforeItems.length - 1 ? 'failed' : 'unknown'}`);
    if (index > 0) lines.push(`    ${safeNodeId(beforeItems[index - 1].id || `before_${index - 1}`, 'before')} --> ${id}`);
  });
  lines.push('  end');

  lines.push('  subgraph after["After · controlled path"]');
  lines.push('    direction TB');
  const afterItems = list(logic.after).slice(0, 10);
  afterItems.forEach((item, index) => {
    const id = safeNodeId(item.id || `after_${index}`, 'after');
    lines.push(`    ${id}["${escapeMermaid(item.event || item.text || item, 110)}"]:::${index === afterItems.length - 1 ? 'verified' : 'partial'}`);
    if (index > 0) lines.push(`    ${safeNodeId(afterItems[index - 1].id || `after_${index - 1}`, 'after')} --> ${id}`);
  });
  lines.push('  end');
  if (beforeItems.length && afterItems.length) {
    lines.push(`  ${safeNodeId(beforeItems.at(-1).id || `before_${beforeItems.length - 1}`, 'before')} -. fixed by .-> ${safeNodeId(afterItems[0].id || 'after_0', 'after')}`);
  }

  for (const [index, interrupt] of list(logic.interrupts).slice(0, 4).entries()) {
    const id = safeNodeId(interrupt.id || `interrupt_${index}`, 'interrupt');
    lines.push(`  ${id}["⚡ ${escapeMermaid(interrupt.event || interrupt.text || interrupt, 95)}"]:::blocked`);
    const target = afterItems[Math.min(index + 1, Math.max(0, afterItems.length - 1))];
    if (target) lines.push(`  ${id} -. invalidates .-> ${safeNodeId(target.id || `after_${Math.min(index + 1, afterItems.length - 1)}`, 'after')}`);
  }

  for (const [index, invariant] of list(logic.invariants).slice(0, 5).entries()) {
    const id = safeNodeId(`invariant_${index}`, 'inv');
    lines.push(`  ${id}["Invariant: ${escapeMermaid(invariant.text || invariant, 110)}"]:::evidence`);
    if (afterItems.length) lines.push(`  ${safeNodeId(afterItems.at(-1).id || `after_${afterItems.length - 1}`, 'after')} -. guarantees .-> ${id}`);
  }
  lines.push(...mermaidStyles());
  return lines.join('\n');
}

export function renderReviewMermaid(producerManifest, reviewerManifest) {
  const comparison = compareManifests(producerManifest, reviewerManifest);
  const title = `${text(producerManifest.project?.name, 'Project')} · claim review`;
  const lines = mermaidHeader(title);
  lines.push(`  producer["Producer manifest\\n${comparison.producerDigest.slice(0, 12)}"]:::goal`);
  lines.push(`  reviewer["Reviewer manifest\\n${comparison.reviewerDigest.slice(0, 12)}"]:::goal`);
  lines.push('  title_node --> producer');
  lines.push('  title_node --> reviewer');
  for (const item of comparison.comparisons.slice(0, 14)) {
    const nodeId = safeNodeId(item.id, 'review');
    const className = item.outcome === 'agreed' ? 'verified' : item.outcome === 'downgraded' || item.outcome === 'disputed' ? 'failed' : 'unknown';
    const producerVerdict = item.producer?.verdict || 'missing';
    const reviewerVerdict = item.reviewer?.verdict || 'missing';
    lines.push(`  ${nodeId}["${escapeMermaid(item.id, 32)} · ${item.outcome}\\nP:${producerVerdict} · R:${reviewerVerdict}"]:::${className}`);
    lines.push(`  producer --> ${nodeId}`);
    lines.push(`  reviewer --> ${nodeId}`);
  }
  lines.push(`  reconciliation["Reconciliation · ${comparison.overall}"]:::${comparison.overall === 'agreed' ? 'verified' : 'blocked'}`);
  for (const item of comparison.comparisons.slice(0, 14)) {
    lines.push(`  ${safeNodeId(item.id, 'review')} --> reconciliation`);
  }
  lines.push(...mermaidStyles());
  return lines.join('\n');
}

export function renderMarkdown(manifest) {
  const validation = validateManifest(manifest);
  const rawById = new Map(list(manifest.claims).map((claim) => [claim.id, claim]));
  const lines = [
    `# Task Proof: ${text(manifest.task?.title, text(manifest.task?.id, 'Untitled task'))}`,
    '',
    `- Project: ${text(manifest.project?.name, 'unknown')}`,
    `- Mode: ${text(manifest.mode, 'unknown')}`,
    `- Branch: ${text(manifest.project?.branch, 'unknown')}`,
    `- Base → head: ${text(manifest.project?.base, '?')} → ${text(manifest.project?.head, '?')}`,
    `- Overall verdict: **${validation.overall}**`,
    `- Manifest digest: \`${validation.digest}\``,
    '',
    '## Objective',
    '',
    text(manifest.task?.objective, text(manifest.task?.title, 'Not stated.')),
    '',
    '## Claims',
    '',
  ];
  for (const claim of validation.claims) {
    const raw = rawById.get(claim.id) || {};
    lines.push(`### ${claim.id} — ${claim.title}`);
    lines.push('');
    lines.push(`- Claimed: ${claim.claimStatus}`);
    lines.push(`- Evaluated: **${claim.verdict}**`);
    lines.push(`- Summary: ${text(raw.summary, 'Not stated.')}`);
    lines.push(`- Evidence: ${claim.evidenceRefs.length ? claim.evidenceRefs.map((id) => `\`${id}\``).join(', ') : 'none'}`);
    lines.push(`- Acceptance: ${claim.acceptanceRefs.length ? claim.acceptanceRefs.map((id) => `\`${id}\``).join(', ') : 'none'}`);
    if (claim.reasons.length) lines.push(`- Gaps: ${claim.reasons.join('; ')}`);
    lines.push('');
  }
  lines.push('## Acceptance criteria', '');
  for (const item of list(manifest.acceptance)) {
    lines.push(`- **${item.status}** \`${item.id}\`: ${item.text}`);
  }
  lines.push('', '## Unknowns and risks', '');
  const unknowns = list(manifest.unknowns);
  const risks = list(manifest.risks);
  if (!unknowns.length && !risks.length) lines.push('- None declared.');
  for (const item of unknowns) lines.push(`- Unknown: ${typeof item === 'string' ? item : item.text || item.summary || JSON.stringify(item)}`);
  for (const item of risks) lines.push(`- Risk: ${typeof item === 'string' ? item : item.text || item.summary || JSON.stringify(item)}`);
  lines.push('', '## Next actions', '');
  const actions = list(manifest.nextActions);
  if (!actions.length) lines.push('- None declared.');
  for (const item of actions) lines.push(`- ${typeof item === 'string' ? item : item.text || item.title || JSON.stringify(item)}`);
  return lines.join('\n');
}

export function renderBundle(manifest, options = {}) {
  const validation = validateManifest(manifest);
  const view = options.view || 'status';
  const mermaid = view === 'change_logic' ? renderChangeLogicMermaid(manifest) : renderStatusMermaid(manifest, options);
  return {
    validation,
    markdown: renderMarkdown(manifest),
    mermaid,
  };
}
