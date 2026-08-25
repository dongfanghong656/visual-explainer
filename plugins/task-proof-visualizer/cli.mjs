#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compareManifests, validateManifest } from './src/core.mjs';
import { renderChangeLogicMermaid, renderMarkdown, renderReviewMermaid, renderStatusMermaid } from './src/render.mjs';
import { collectSnapshot, writeBundle } from './src/workspace.mjs';

function usage() {
  console.error(`Usage:
  node cli.mjs validate <manifest.json>
  node cli.mjs render <manifest.json> [status|change_logic] [mermaid|markdown]
  node cli.mjs compare <producer.json> <reviewer.json> [json|mermaid]
  node cli.mjs snapshot <workspace> [baseRef] [headRef]
  node cli.mjs write <workspace> <manifest.json> [outputName] [status|change_logic]
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'validate' && args[0]) {
    const result = validateManifest(readJson(args[0]));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 2;
  } else if (command === 'render' && args[0]) {
    const manifest = readJson(args[0]);
    const view = args[1] || 'status';
    const format = args[2] || 'mermaid';
    if (format === 'markdown') console.log(renderMarkdown(manifest));
    else console.log(view === 'change_logic' ? renderChangeLogicMermaid(manifest) : renderStatusMermaid(manifest));
  } else if (command === 'compare' && args[0] && args[1]) {
    const producer = readJson(args[0]);
    const reviewer = readJson(args[1]);
    if ((args[2] || 'json') === 'mermaid') console.log(renderReviewMermaid(producer, reviewer));
    else console.log(JSON.stringify(compareManifests(producer, reviewer), null, 2));
  } else if (command === 'snapshot' && args[0]) {
    console.log(JSON.stringify(collectSnapshot({ workspaceRoot: args[0], baseRef: args[1], headRef: args[2] || 'HEAD' }), null, 2));
  } else if (command === 'write' && args[0] && args[1]) {
    console.log(JSON.stringify(writeBundle({
      workspaceRoot: args[0],
      manifest: readJson(args[1]),
      outputName: args[2] || 'TASK_PROOF',
      view: args[3] || 'status',
    }), null, 2));
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
