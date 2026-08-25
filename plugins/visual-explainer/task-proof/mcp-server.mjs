#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'node:url';
import {
  CLAIM_KIND,
  PROTOCOL_VERSION,
  TaskProofError,
  validateClaim,
} from './core.mjs';
import { writeTaskProofArtifactsStrict as writeTaskProofArtifacts } from './artifact-store.mjs';
import {
  finalizeReviewStrict,
  mergeReviewEvidence,
  probeRepositoryEvidenceStrict,
  validateClaimEvidencePolicy,
} from './hardening.mjs';
import { runNamedChecksStrict } from './named-checks.mjs';
import { createRepositorySnapshotStrict as createRepositorySnapshot } from './snapshot.mjs';

const PROBE_SCHEMA = {
  type: 'object',
  required: ['id', 'type', 'supportsClaimIds', 'supportsCriterionIds'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    type: { enum: ['file_digest', 'commit_exists', 'changed_path'] },
    path: { type: 'string' },
    sha: { type: 'string' },
    supportsClaimIds: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    supportsCriterionIds: { type: 'array', items: { type: 'string' }, uniqueItems: true },
  },
};

const CHECK_REQUEST_SCHEMA = {
  type: 'object',
  required: ['id', 'checkId', 'supportsClaimIds', 'supportsCriterionIds'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    checkId: { type: 'string' },
    kind: { enum: ['test', 'build'] },
    supportsClaimIds: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    supportsCriterionIds: { type: 'array', items: { type: 'string' }, uniqueItems: true },
  },
};

export const TOOL_DEFINITIONS = [
  {
    name: 'task_proof_snapshot',
    description: 'Create a rename-safe deterministic Git snapshot without raw patches or arbitrary commands.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { repositoryPath: { type: 'string' }, baseRef: { type: 'string' } },
    },
  },
  {
    name: 'task_proof_probe',
    description: 'Create MCP-produced deterministic receipts for allowlisted repository observations, bound to exact claims and criteria.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['reviewerRunId', 'probes'],
      properties: {
        repositoryPath: { type: 'string' }, baseRef: { type: 'string' }, reviewerRunId: { type: 'string' },
        probes: { type: 'array', minItems: 1, maxItems: 100, items: PROBE_SCHEMA },
      },
    },
  },
  {
    name: 'task_proof_run_checks',
    description: 'Run fixed repository-defined checks from .task-proof/checks.json without a shell. Disabled unless TASK_PROOF_ALLOW_EXECUTION=1; never accepts commands or policy paths from the caller.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['reviewerRunId', 'requests'],
      properties: {
        repositoryPath: { type: 'string' }, baseRef: { type: 'string' }, reviewerRunId: { type: 'string' },
        requests: { type: 'array', minItems: 1, maxItems: 20, items: CHECK_REQUEST_SCHEMA },
      },
    },
  },
  {
    name: 'task_proof_validate_claim',
    description: 'Validate and digest a claimant artifact without writing files or granting a completion verdict.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['claim'], properties: { claim: { type: 'object' } },
    },
  },
  {
    name: 'task_proof_claim',
    description: 'Bind a claimant model to current Git state, validate it, and render an explicitly UNVERIFIED immutable artifact set.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['claim'],
      properties: {
        repositoryPath: { type: 'string' }, baseRef: { type: 'string' }, basename: { type: 'string' }, claim: { type: 'object' },
      },
    },
  },
  {
    name: 'task_proof_review',
    description: 'Collect fresh MCP-produced evidence, enforce claimant/reviewer separation and criterion coverage, compute the only completion gate, and render an immutable review.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['claim', 'reviewer', 'findings'],
      properties: {
        repositoryPath: { type: 'string' }, basename: { type: 'string' }, claim: { type: 'object' },
        reviewer: {
          type: 'object', required: ['runId', 'role'], additionalProperties: false,
          properties: {
            runId: { type: 'string' }, role: { const: 'reviewer' }, agent: { type: 'string' }, model: { type: 'string' },
          },
        },
        findings: {
          type: 'array',
          items: {
            type: 'object', required: ['claimId', 'verdict', 'rationale', 'reviewEvidenceIds'], additionalProperties: false,
            properties: {
              claimId: { type: 'string' },
              verdict: { enum: ['verified', 'partially_verified', 'unsupported', 'contradicted', 'stale', 'not_applicable'] },
              rationale: { type: 'string' },
              reviewEvidenceIds: { type: 'array', items: { type: 'string' }, uniqueItems: true },
            },
          },
        },
        probes: { type: 'array', maxItems: 100, items: PROBE_SCHEMA },
        checks: { type: 'array', maxItems: 20, items: CHECK_REQUEST_SCHEMA },
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

function validateClaimModel(claim) {
  const structural = validateClaim(claim);
  const policy = validateClaimEvidencePolicy(claim);
  return {
    ok: structural.ok && policy.ok,
    errors: [...structural.errors, ...policy.errors],
    warnings: structural.warnings,
    digest: structural.ok && policy.ok ? structural.digest : undefined,
  };
}

function assertNoSnapshotRace(reference, fresh) {
  if (reference.snapshotDigest !== fresh.snapshotDigest) {
    throw new TaskProofError('SNAPSHOT_RACE', 'Repository changed after evidence collection. Restart the review.', {
      evidenceSnapshot: reference.snapshotDigest,
      currentSnapshot: fresh.snapshotDigest,
    });
  }
}

export async function handleTaskProofTool(name, rawArguments = {}) {
  const args = asObject(rawArguments ?? {}, 'arguments');
  const repositoryPath = args.repositoryPath ?? process.cwd();

  switch (name) {
    case 'task_proof_snapshot':
      return { snapshot: createRepositorySnapshot({ repositoryPath, baseRef: args.baseRef }) };

    case 'task_proof_probe':
      return probeRepositoryEvidenceStrict({
        repositoryPath, reviewerRunId: args.reviewerRunId, probes: args.probes, baseRef: args.baseRef,
      });

    case 'task_proof_run_checks':
      return runNamedChecksStrict({
        repositoryPath, reviewerRunId: args.reviewerRunId, requests: args.requests, baseRef: args.baseRef,
      });

    case 'task_proof_validate_claim':
      return validateClaimModel(asObject(args.claim, 'claim'));

    case 'task_proof_claim': {
      const original = asObject(args.claim, 'claim');
      const snapshot = createRepositorySnapshot({ repositoryPath, baseRef: args.baseRef });
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
      const validation = validateClaimModel(claim);
      if (!validation.ok) throw new TaskProofError('INVALID_CLAIM', 'Claim validation failed.', validation);
      claim.artifactDigest = validation.digest;
      const files = writeTaskProofArtifacts({
        artifact: claim, repositoryPath, basename: args.basename ?? `${claim.task.id}-claim`,
      });
      return {
        status: 'UNVERIFIED',
        rule: 'Claimant output is never proof of completion. Only task_proof_review may compute a gate.',
        claim,
        files,
      };
    }

    case 'task_proof_review': {
      const claim = asObject(args.claim, 'claim');
      const claimValidation = validateClaimModel(claim);
      if (!claimValidation.ok) throw new TaskProofError('INVALID_CLAIM', 'Review input claim validation failed.', claimValidation);
      const reviewer = asObject(args.reviewer, 'reviewer');
      if (reviewer.runId === claim.producer?.runId) {
        throw new TaskProofError('NOT_INDEPENDENT', 'reviewer.runId must differ from claim.producer.runId.');
      }
      const baseRef = claim.repository?.baseSha;
      const collections = [];
      if (Array.isArray(args.probes) && args.probes.length > 0) {
        collections.push(probeRepositoryEvidenceStrict({
          repositoryPath, reviewerRunId: reviewer.runId, probes: args.probes, baseRef,
        }));
      }
      if (Array.isArray(args.checks) && args.checks.length > 0) {
        collections.push(runNamedChecksStrict({
          repositoryPath, reviewerRunId: reviewer.runId, requests: args.checks, baseRef,
        }));
      }
      const collected = mergeReviewEvidence(collections);
      const snapshot = collected.snapshot ?? createRepositorySnapshot({ repositoryPath, baseRef });
      const finalSnapshot = createRepositorySnapshot({ repositoryPath, baseRef });
      assertNoSnapshotRace(snapshot, finalSnapshot);
      const review = finalizeReviewStrict({
        claim, reviewer, snapshot,
        findings: Array.isArray(args.findings) ? args.findings : [],
        reviewEvidence: collected.evidence,
      });
      const files = writeTaskProofArtifacts({
        artifact: review, repositoryPath, basename: args.basename ?? `${claim.task.id}-review`,
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
