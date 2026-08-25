#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'node:url';
import {
  CLAIM_KIND,
  PROTOCOL_VERSION,
  TaskProofError,
  createRepositorySnapshot,
  finalizeReview,
  probeRepositoryEvidence,
  validateClaim,
  writeTaskProofArtifacts,
} from './core.mjs';

export const TOOL_DEFINITIONS = [
  {
    name: 'task_proof_snapshot',
    description: 'Create a read-only deterministic Git snapshot without raw diffs or arbitrary commands.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { repositoryPath: { type: 'string' }, baseRef: { type: 'string' } },
    },
  },
  {
    name: 'task_proof_probe',
    description: 'Create reviewer-produced deterministic receipts for safe repository facts. No shell or arbitrary command execution.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['reviewerRunId', 'probes'],
      properties: {
        repositoryPath: { type: 'string' }, baseRef: { type: 'string' }, reviewerRunId: { type: 'string' },
        probes: {
          type: 'array', minItems: 1, maxItems: 100,
          items: {
            type: 'object', required: ['id', 'type'],
            properties: {
              id: { type: 'string' }, type: { enum: ['file_digest', 'commit_exists', 'changed_path'] },
              path: { type: 'string' }, sha: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'task_proof_claim',
    description: 'Bind a claimant-authored model to current Git state, validate it, and render an explicitly UNVERIFIED claim.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['claim'],
      properties: {
        repositoryPath: { type: 'string' }, baseRef: { type: 'string' }, basename: { type: 'string' }, claim: { type: 'object' },
      },
    },
  },
  {
    name: 'task_proof_validate_claim',
    description: 'Validate and digest a claim without writing files.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['claim'], properties: { claim: { type: 'object' } },
    },
  },
  {
    name: 'task_proof_review',
    description: 'Resnapshot independently, enforce claimant/reviewer separation, compute the completion gate, and render the review.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['claim', 'reviewer', 'findings', 'reviewEvidence'],
      properties: {
        repositoryPath: { type: 'string' }, basename: { type: 'string' }, claim: { type: 'object' },
        reviewer: {
          type: 'object', required: ['runId', 'role'],
          properties: { runId: { type: 'string' }, role: { const: 'reviewer' }, agent: { type: 'string' }, model: { type: 'string' } },
        },
        findings: { type: 'array', items: { type: 'object' } },
        reviewEvidence: { type: 'array', items: { type: 'object' } },
      },
    },
  },
];

function asObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TaskProofError('INVALID_ARGUMENT', `${name} must be an object.`);
  }
  return value;
}

function textResult(payload, isError = false) {
  return { isError, content: [{ type: 'text', text: `${JSON.stringify(payload, null, 2)}\n` }] };
}

export async function handleTaskProofTool(name, rawArguments = {}) {
  const args = asObject(rawArguments ?? {}, 'arguments');
  switch (name) {
    case 'task_proof_snapshot':
      return { snapshot: createRepositorySnapshot({ repositoryPath: args.repositoryPath ?? process.cwd(), baseRef: args.baseRef }) };
    case 'task_proof_probe':
      return probeRepositoryEvidence({
        repositoryPath: args.repositoryPath ?? process.cwd(), reviewerRunId: args.reviewerRunId,
        probes: args.probes, baseRef: args.baseRef,
      });
    case 'task_proof_validate_claim':
      return validateClaim(asObject(args.claim, 'claim'));
    case 'task_proof_claim': {
      const original = asObject(args.claim, 'claim');
      const snapshot = createRepositorySnapshot({ repositoryPath: args.repositoryPath ?? process.cwd(), baseRef: args.baseRef });
      const claim = {
        ...original,
        protocolVersion: PROTOCOL_VERSION,
        kind: CLAIM_KIND,
        generatedAt: original.generatedAt ?? new Date().toISOString(),
        repository: {
          branch: snapshot.repository.branch,
          baseSha: snapshot.repository.baseSha,
          headSha: snapshot.repository.headSha,
          dirty: snapshot.repository.dirty,
          snapshotDigest: snapshot.snapshotDigest,
        },
      };
      const validation = validateClaim(claim);
      if (!validation.ok) throw new TaskProofError('INVALID_CLAIM', 'Claim validation failed.', validation);
      claim.artifactDigest = validation.digest;
      const files = writeTaskProofArtifacts({
        artifact: claim, repositoryPath: args.repositoryPath ?? process.cwd(), basename: args.basename ?? `${claim.task.id}-claim`,
      });
      return {
        status: 'UNVERIFIED',
        rule: 'Claimant output is never proof of completion until task_proof_review returns PASS.',
        claim,
        files,
      };
    }
    case 'task_proof_review': {
      const claim = asObject(args.claim, 'claim');
      const snapshot = createRepositorySnapshot({ repositoryPath: args.repositoryPath ?? process.cwd(), baseRef: claim.repository?.baseSha });
      const review = finalizeReview({
        claim, reviewer: asObject(args.reviewer, 'reviewer'), snapshot,
        findings: Array.isArray(args.findings) ? args.findings : [],
        reviewEvidence: Array.isArray(args.reviewEvidence) ? args.reviewEvidence : [],
      });
      const files = writeTaskProofArtifacts({
        artifact: review, repositoryPath: args.repositoryPath ?? process.cwd(), basename: args.basename ?? `${claim.task.id}-review`,
      });
      return { gate: review.gate, review, files };
    }
    default:
      throw new TaskProofError('UNKNOWN_TOOL', `Unknown Task Proof tool: ${name}`);
  }
}

export function createTaskProofServer() {
  const server = new Server(
    { name: 'visual-explainer-task-proof', version: PROTOCOL_VERSION },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return textResult(await handleTaskProofTool(request.params.name, request.params.arguments ?? {}));
    } catch (error) {
      const normalized = error instanceof TaskProofError
        ? error
        : new TaskProofError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
      return textResult({ error: { code: normalized.code, message: normalized.message, details: normalized.details } }, true);
    }
  });
  return server;
}

export async function main() {
  const server = createTaskProofServer();
  await server.connect(new StdioServerTransport());
  console.error(`visual-explainer Task Proof MCP ${PROTOCOL_VERSION} ready on stdio`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
