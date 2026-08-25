#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { compareManifests, validateManifest } from '../src/core.mjs';
import {
  renderChangeLogicMermaid,
  renderMarkdown,
  renderReviewMermaid,
  renderStatusMermaid,
} from '../src/render.mjs';
import { collectSnapshot, writeBundle } from '../src/workspace.mjs';

const server = new McpServer({
  name: 'task-proof-visualizer',
  version: '0.1.0',
});

function jsonContent(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

function textContent(value) {
  return {
    content: [{ type: 'text', text: String(value) }],
  };
}

function errorContent(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  };
}

const manifestSchema = z.record(z.string(), z.unknown());

server.tool(
  'task_proof_validate',
  'Validate a producer or reviewer task-proof manifest. A done claim is not verified unless it links passing acceptance criteria, primary implementation evidence, and primary verification evidence.',
  { manifest: manifestSchema },
  async ({ manifest }) => {
    try {
      return jsonContent(validateManifest(manifest));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.tool(
  'task_proof_compare',
  'Reconcile a producer manifest with an independently created reviewer manifest. The result highlights agreements, downgrades, missing reviews, and disputed claims.',
  {
    producerManifest: manifestSchema,
    reviewerManifest: manifestSchema,
  },
  async ({ producerManifest, reviewerManifest }) => {
    try {
      return jsonContent(compareManifests(producerManifest, reviewerManifest));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.tool(
  'task_proof_render',
  'Render an evidence-backed one-page Mermaid or Markdown explanation. The status view shows verified work, partial work, blockers, next work, evidence, and checkpoint. The change_logic view explains before/failure/after/invariants. The review view compares producer and reviewer manifests.',
  {
    manifest: manifestSchema,
    view: z.enum(['status', 'change_logic']).default('status'),
    format: z.enum(['mermaid', 'markdown']).default('mermaid'),
  },
  async ({ manifest, view, format }) => {
    try {
      if (format === 'markdown') return textContent(renderMarkdown(manifest));
      return textContent(view === 'change_logic' ? renderChangeLogicMermaid(manifest) : renderStatusMermaid(manifest));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.tool(
  'task_proof_render_review',
  'Render a one-page Mermaid reconciliation diagram from producer and reviewer manifests.',
  {
    producerManifest: manifestSchema,
    reviewerManifest: manifestSchema,
  },
  async ({ producerManifest, reviewerManifest }) => {
    try {
      return textContent(renderReviewMermaid(producerManifest, reviewerManifest));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.tool(
  'task_proof_snapshot',
  'Collect a bounded, read-only Git snapshot and SHA-256 metadata for explicitly named evidence files. It never runs caller-supplied commands, tests, package scripts, or network operations.',
  {
    workspaceRoot: z.string().min(1),
    baseRef: z.string().min(1).optional(),
    headRef: z.string().min(1).default('HEAD'),
    evidenceFiles: z.array(z.string().min(1)).max(50).default([]),
  },
  async ({ workspaceRoot, baseRef, headRef, evidenceFiles }) => {
    try {
      return jsonContent(collectSnapshot({ workspaceRoot, baseRef, headRef, evidenceFiles }));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.tool(
  'task_proof_write_bundle',
  'Write TASK_PROOF JSON, Markdown, Mermaid, and validation JSON atomically under the workspace .task-proof directory. Paths outside the allowlisted workspace are rejected.',
  {
    workspaceRoot: z.string().min(1),
    manifest: manifestSchema,
    outputName: z.string().min(1).max(80).default('TASK_PROOF'),
    view: z.enum(['status', 'change_logic']).default('status'),
  },
  async ({ workspaceRoot, manifest, outputName, view }) => {
    try {
      return jsonContent(writeBundle({ workspaceRoot, manifest, outputName, view }));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.tool(
  'task_proof_template',
  'Return a minimal producer or reviewer manifest template. The template is intentionally incomplete and must be populated from repository evidence before any completion claim is accepted.',
  {
    mode: z.enum(['producer', 'reviewer']).default('producer'),
    projectName: z.string().min(1),
    taskId: z.string().min(1),
    taskTitle: z.string().min(1),
  },
  async ({ mode, projectName, taskId, taskTitle }) => {
    const template = {
      manifestVersion: '1.0',
      mode,
      project: {
        name: projectName,
        repository: '',
        branch: '',
        base: '',
        head: '',
      },
      task: {
        id: taskId,
        title: taskTitle,
        objective: '',
      },
      checkpoint: {
        capturedAt: new Date().toISOString(),
        actor: mode === 'producer' ? 'implementation-ai' : 'review-ai',
      },
      acceptance: [
        {
          id: 'AC-1',
          text: 'Replace with a falsifiable acceptance criterion.',
          status: 'not_run',
          evidenceRefs: [],
        },
      ],
      evidence: [],
      claims: [
        {
          id: 'CL-1',
          title: 'Replace with one bounded claim.',
          summary: '',
          category: 'code',
          claimStatus: 'unknown',
          acceptanceRefs: ['AC-1'],
          evidenceRefs: [],
          blockers: [],
          risks: [],
          dependsOn: [],
        },
      ],
      unknowns: ['No evidence has been collected yet.'],
      risks: [],
      nextActions: ['Collect repository and verification evidence.'],
    };
    return jsonContent(template);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
