#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { pathToFileURL } from 'node:url';
import {
  CLAIM_KIND,
  PROTOCOL_VERSION,
  TaskProofError,
  sha256,
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

const OPEN_OBJECT = z.record(z.string(), z.unknown());
const UNIQUE_STRING_ARRAY = z.array(z.string()).refine(
  (values) => new Set(values).size === values.length,
  { message: 'array values must be unique' },
);
const PROBE_INPUT = z.object({
  id: z.string(),
  type: z.enum(['file_digest', 'commit_exists', 'changed_path']),
  path: z.string().optional(),
  sha: z.string().optional(),
  supportsClaimIds: UNIQUE_STRING_ARRAY,
  supportsCriterionIds: UNIQUE_STRING_ARRAY,
}).strict();
const CHECK_INPUT = z.object({
  id: z.string(),
  checkId: z.string(),
  kind: z.enum(['test', 'build']).optional(),
  supportsClaimIds: UNIQUE_STRING_ARRAY,
  supportsCriterionIds: UNIQUE_STRING_ARRAY,
}).strict();
const REVIEWER_INPUT = z.object({
  runId: z.string(),
  role: z.literal('reviewer'),
  agent: z.string().optional(),
  model: z.string().optional(),
}).strict();
const FINDING_INPUT = z.object({
  claimId: z.string(),
  verdict: z.enum(['verified', 'partially_verified', 'unsupported', 'contradicted', 'stale', 'not_applicable']),
  rationale: z.string(),
  reviewEvidenceIds: UNIQUE_STRING_ARRAY,
}).strict();

const TOOL_SPECS = Object.freeze([
  {
    name: 'task_proof_snapshot',
    title: 'Task Proof Snapshot',
    description: 'Create a rename-safe, dirty-content-bound deterministic Git snapshot without raw patches or arbitrary commands.',
    inputSchema: z.object({
      repositoryPath: z.string().optional(),
      baseRef: z.string().optional(),
    }).strict(),
  },
  {
    name: 'task_proof_probe',
    title: 'Task Proof Probe',
    description: 'Create MCP-produced deterministic receipts for allowlisted repository observations, bound to exact claims and criteria.',
    inputSchema: z.object({
      repositoryPath: z.string().optional(),
      baseRef: z.string().optional(),
      reviewerRunId: z.string(),
      probes: z.array(PROBE_INPUT).min(1).max(100),
    }).strict(),
  },
  {
    name: 'task_proof_run_checks',
    title: 'Task Proof Run Checks',
    description: 'Run fixed repository-defined checks from .task-proof/checks.json without a shell. Disabled unless TASK_PROOF_ALLOW_EXECUTION=1; never accepts commands or policy paths from the caller.',
    inputSchema: z.object({
      repositoryPath: z.string().optional(),
      baseRef: z.string().optional(),
      reviewerRunId: z.string(),
      requests: z.array(CHECK_INPUT).min(1).max(20),
    }).strict(),
  },
  {
    name: 'task_proof_validate_claim',
    title: 'Task Proof Validate Claim',
    description: 'Validate and digest a claimant artifact without writing files or granting a completion verdict.',
    inputSchema: z.object({ claim: OPEN_OBJECT }).strict(),
  },
  {
    name: 'task_proof_claim',
    title: 'Task Proof Claim',
    description: 'Bind a claimant model to current Git state, validate it, and render an explicitly UNVERIFIED immutable artifact set.',
    inputSchema: z.object({
      repositoryPath: z.string().optional(),
      baseRef: z.string().optional(),
      basename: z.string().optional(),
      claim: OPEN_OBJECT,
    }).strict(),
  },
  {
    name: 'task_proof_review',
    title: 'Task Proof Review',
    description: 'Collect fresh MCP-produced evidence, require a complete working-tree fingerprint, enforce claimant/reviewer separation and criterion coverage, compute the only completion gate, and render an immutable review.',
    inputSchema: z.object({
      repositoryPath: z.string().optional(),
      basename: z.string().optional(),
      claim: OPEN_OBJECT,
      reviewer: REVIEWER_INPUT,
      findings: z.array(FINDING_INPUT),
      probes: z.array(PROBE_INPUT).max(100).optional(),
      checks: z.array(CHECK_INPUT).max(20).optional(),
    }).strict(),
  },
]);

export const TOOL_INPUT_SCHEMAS = Object.freeze(Object.fromEntries(
  TOOL_SPECS.map((tool) => [tool.name, tool.inputSchema]),
));

export const TOOL_DEFINITIONS = Object.freeze(TOOL_SPECS.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: z.toJSONSchema(tool.inputSchema),
})));

function asObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TaskProofError('INVALID_ARGUMENT', `${name} must be an object.`);
  }
  return value;
}

function textResult(payload, isError = false) {
  return { isError, content: [{ type: 'text', text: `${JSON.stringify(payload, null, 2)}\n` }] };
}

function semanticDigest(value) {
  const copy = { ...value };
  delete copy.artifactDigest;
  delete copy.manifestDigest;
  return sha256(copy);
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

function assertSnapshotComparable(snapshot) {
  if (snapshot.repository?.workingTreeFingerprintComplete === false) {
    throw new TaskProofError(
      'INCOMPLETE_SNAPSHOT',
      'The dirty working tree contains a directory, submodule, or unsupported filesystem object that was not fully content-fingerprinted. No completion gate may be issued.',
      { reasons: snapshot.repository.workingTreeFingerprintIncompleteReasons ?? [] },
    );
  }
}

function repositoryBinding(snapshot) {
  return {
    branch: snapshot.repository.branch,
    baseSha: snapshot.repository.baseSha,
    headSha: snapshot.repository.headSha,
    dirty: snapshot.repository.dirty,
    snapshotDigest: snapshot.snapshotDigest,
    workingTreeFingerprintComplete: snapshot.repository.workingTreeFingerprintComplete,
    workingTreeFingerprintIncompleteReasons: snapshot.repository.workingTreeFingerprintIncompleteReasons,
    workingTreeHashedBytes: snapshot.repository.workingTreeHashedBytes,
  };
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
        repository: repositoryBinding(snapshot),
      };
      const validation = validateClaimModel(claim);
      if (!validation.ok) throw new TaskProofError('INVALID_CLAIM', 'Claim validation failed.', validation);
      claim.artifactDigest = validation.digest;
      const files = writeTaskProofArtifacts({
        artifact: claim, repositoryPath, basename: args.basename ?? `${claim.task.id}-claim`,
      });
      return {
        status: 'UNVERIFIED',
        snapshotComparable: snapshot.repository.workingTreeFingerprintComplete,
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
      assertSnapshotComparable(snapshot);
      const finalSnapshot = createRepositorySnapshot({ repositoryPath, baseRef });
      assertSnapshotComparable(finalSnapshot);
      assertNoSnapshotRace(snapshot, finalSnapshot);
      const review = finalizeReviewStrict({
        claim, reviewer, snapshot,
        findings: Array.isArray(args.findings) ? args.findings : [],
        reviewEvidence: collected.evidence,
      });
      review.repository.workingTreeFingerprintComplete = snapshot.repository.workingTreeFingerprintComplete;
      review.repository.workingTreeFingerprintIncompleteReasons = snapshot.repository.workingTreeFingerprintIncompleteReasons;
      review.repository.workingTreeHashedBytes = snapshot.repository.workingTreeHashedBytes;
      review.artifactDigest = semanticDigest(review);
      const files = writeTaskProofArtifacts({
        artifact: review, repositoryPath, basename: args.basename ?? `${claim.task.id}-review`,
      });
      return { gate: review.gate, review, files };
    }

    default:
      throw new TaskProofError('UNKNOWN_TOOL', `Unknown Task Proof tool: ${name}`);
  }
}

function normalizeError(error) {
  return error instanceof TaskProofError
    ? error
    : new TaskProofError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
}

export function createTaskProofServer() {
  const server = new McpServer(
    { name: 'visual-explainer-task-proof', version: PROTOCOL_VERSION },
    {
      instructions: 'Claimant output is always UNVERIFIED. Only an independent task_proof_review may compute a completion gate. Named checks require explicit operator opt-in.',
    },
  );

  for (const definition of TOOL_DEFINITIONS) {
    const inputSchema = TOOL_INPUT_SCHEMAS[definition.name];
    if (!inputSchema) throw new Error(`Missing runtime input schema for ${definition.name}.`);
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema,
      },
      async (args) => {
        try {
          return textResult(await handleTaskProofTool(definition.name, args));
        } catch (error) {
          const normalized = normalizeError(error);
          return textResult({
            error: {
              code: normalized.code,
              message: normalized.message,
              details: normalized.details,
            },
          }, true);
        }
      },
    );
  }

  return server;
}

export function main() {
  const handle = serveStdio(createTaskProofServer);
  console.error(`visual-explainer Task Proof MCP ${PROTOCOL_VERSION} ready on stdio`);
  return handle;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
