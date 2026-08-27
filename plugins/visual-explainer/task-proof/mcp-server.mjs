#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PROTOCOL_VERSION,
  TaskProofError,
  sha256,
} from './core.mjs';
import { writeTaskProofArtifactsStrict as writeTaskProofArtifacts } from './artifact-store.mjs';
import {
  finalizeReviewStrict,
  mergeReviewEvidence,
  probeRepositoryEvidenceStrict,
} from './hardening.mjs';
import { runNamedChecksStrict } from './named-checks.mjs';
import { createRepositorySnapshotStrict as createRepositorySnapshot } from './snapshot.mjs';
import {
  bindPublicClaimToContract,
  createPublicRepositoryAuthorityReceipt,
  finalizePublicContractReview,
  validatePublicContractBoundClaim,
  validatePublicTaskContract,
} from './contract-public-enforcement.mjs';

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
const REVIEWER_ATTESTATION_INPUT = z.object({
  level: z.enum(['R0', 'R1', 'R2', 'R3']),
  method: z.literal('procedural_attestation'),
  sessionId: z.string(),
  reconstructedBeforeReadingClaim: z.boolean(),
  independentEvidenceCollected: z.boolean(),
  adversarialEvidenceCollected: z.boolean(),
}).strict();
const FINDING_INPUT = z.object({
  claimId: z.string(),
  verdict: z.enum(['verified', 'partially_verified', 'unsupported', 'contradicted', 'stale', 'not_applicable']),
  rationale: z.string(),
  reviewEvidenceIds: UNIQUE_STRING_ARRAY,
}).strict();

export const TASK_PROOF_TOOL_CLASSIFICATIONS = Object.freeze({
  task_proof_snapshot: 'observation',
  task_proof_probe: 'reviewer-evidence',
  task_proof_run_checks: 'reviewer-evidence',
  task_proof_validate_contract: 'validation',
  task_proof_contract_source_receipt: 'reviewer-evidence',
  task_proof_validate_claim: 'validation',
  task_proof_claim: 'claimant',
  task_proof_review: 'acceptance',
});

const ALLOWED_TOOL_CLASSIFICATIONS = new Set([
  'observation', 'reviewer-evidence', 'validation', 'claimant', 'acceptance',
]);

export function validateTaskProofToolRegistry(definitions, classifications = TASK_PROOF_TOOL_CLASSIFICATIONS) {
  if (!Array.isArray(definitions)) throw new TaskProofError('INVALID_TOOL_REGISTRY', 'Task Proof tool definitions must be an array.');
  const seen = new Set();
  for (const definition of definitions) {
    const name = definition?.name;
    if (typeof name !== 'string' || !name.startsWith('task_proof_')
      || !Object.prototype.hasOwnProperty.call(classifications, name)) {
      throw new TaskProofError('UNCLASSIFIED_TASK_PROOF_TOOL', `Task Proof tool is not explicitly classified: ${String(name)}.`);
    }
    if (!ALLOWED_TOOL_CLASSIFICATIONS.has(classifications[name])) {
      throw new TaskProofError('INVALID_TASK_PROOF_TOOL_CLASS', `Task Proof tool ${name} has an invalid classification.`);
    }
    if (seen.has(name)) throw new TaskProofError('DUPLICATE_TASK_PROOF_TOOL', `Duplicate Task Proof tool: ${name}.`);
    seen.add(name);
  }
  const stale = Object.keys(classifications).filter((name) => !seen.has(name));
  if (stale.length > 0) {
    throw new TaskProofError('STALE_TASK_PROOF_TOOL_CLASSIFICATION', `Classified Task Proof tools are not registered: ${stale.join(', ')}.`);
  }
  return definitions;
}

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
    name: 'task_proof_validate_contract',
    title: 'Task Proof Validate Contract',
    description: 'Validate and normalize a frozen Task Contract, returning its deterministic digest, authority declaration digest, coverage cap, and required reviewer level. Validation does not authenticate an external authority source.',
    inputSchema: z.object({ contract: OPEN_OBJECT }).strict(),
  },
  {
    name: 'task_proof_contract_source_receipt',
    title: 'Task Proof Contract Source Receipt',
    description: 'Reopen a repository_file contract source at immutable Git revisions and issue a reviewer-bound authority receipt. The built-in adapter supports repository_source contracts only; other authority types remain unavailable and cannot be promoted.',
    inputSchema: z.object({
      repositoryPath: z.string().optional(),
      contract: OPEN_OBJECT,
      claim: OPEN_OBJECT,
      reviewerRunId: z.string(),
      sourceId: z.string(),
    }).strict(),
  },
  {
    name: 'task_proof_validate_claim',
    title: 'Task Proof Validate Claim',
    description: 'Validate and digest a claimant artifact without writing files or granting a completion verdict.',
    inputSchema: z.object({ contract: OPEN_OBJECT, claim: OPEN_OBJECT }).strict(),
  },
  {
    name: 'task_proof_claim',
    title: 'Task Proof Claim',
    description: 'Bind a claimant model to current Git state, validate it, and render an explicitly UNVERIFIED immutable artifact set.',
    inputSchema: z.object({
      repositoryPath: z.string().optional(),
      basename: z.string().optional(),
      contract: OPEN_OBJECT,
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
      contract: OPEN_OBJECT,
      claim: OPEN_OBJECT,
      reviewer: REVIEWER_INPUT,
      reviewerAttestation: REVIEWER_ATTESTATION_INPUT,
      authorityReceipts: z.array(OPEN_OBJECT).max(32),
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

validateTaskProofToolRegistry(TOOL_DEFINITIONS);

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

    case 'task_proof_validate_contract':
      return validatePublicTaskContract(asObject(args.contract, 'contract'));

    case 'task_proof_contract_source_receipt':
      return createPublicRepositoryAuthorityReceipt({
        repositoryPath,
        contract: asObject(args.contract, 'contract'),
        claim: asObject(args.claim, 'claim'),
        reviewerRunId: args.reviewerRunId,
        sourceId: args.sourceId,
        observedAt: new Date().toISOString(),
      });

    case 'task_proof_validate_claim':
      return validatePublicContractBoundClaim({
        contract: asObject(args.contract, 'contract'),
        claim: asObject(args.claim, 'claim'),
      });

    case 'task_proof_claim': {
      const contractValidation = validatePublicTaskContract(asObject(args.contract, 'contract'));
      const original = asObject(args.claim, 'claim');
      const snapshot = createRepositorySnapshot({
        repositoryPath,
        baseRef: contractValidation.contract.scope.baseRevision,
      });
      const bound = bindPublicClaimToContract({
        contract: contractValidation.contract,
        rawClaim: original,
        snapshot,
      });
      const claim = bound.claim;
      const validation = bound.validation;
      claim.artifactDigest = validation.digest;
      const files = writeTaskProofArtifacts({
        artifact: claim, repositoryPath, basename: args.basename ?? `${claim.task.id}-claim`,
      });
      return {
        status: 'UNVERIFIED',
        snapshotComparable: snapshot.repository.workingTreeFingerprintComplete,
        contractStatus: claim.contractStatus,
        rule: claim.contractStatus.finalAcceptancePossible
          ? 'Claimant output is never proof of completion. A different reviewer run must reopen contract authority and use task_proof_review.'
          : 'PROVISIONAL CONTRACT: final acceptance is impossible; the maximum result is INCONCLUSIVE.',
        claim,
        files,
      };
    }

    case 'task_proof_review': {
      const contractValidation = validatePublicTaskContract(asObject(args.contract, 'contract'));
      const contract = contractValidation.contract;
      const claim = asObject(args.claim, 'claim');
      const claimValidation = validatePublicContractBoundClaim({ contract, claim });
      if (!claimValidation.ok) throw new TaskProofError('INVALID_CLAIM', 'Review input Claim is not bound to the supplied frozen Task Contract.', claimValidation);
      const reviewer = asObject(args.reviewer, 'reviewer');
      if (reviewer.runId === claim.producer?.runId) {
        throw new TaskProofError('NOT_INDEPENDENT', 'reviewer.runId must differ from claim.producer.runId.');
      }
      if (args.reviewerAttestation?.sessionId !== reviewer.runId) {
        throw new TaskProofError('REVIEWER_ATTESTATION_BINDING', 'reviewerAttestation.sessionId must equal reviewer.runId.');
      }
      const baseRef = contract.scope.baseRevision;
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
      const legacyReview = finalizeReviewStrict({
        claim, reviewer, snapshot,
        findings: Array.isArray(args.findings) ? args.findings : [],
        reviewEvidence: collected.evidence,
      });
      legacyReview.repository.workingTreeFingerprintComplete = snapshot.repository.workingTreeFingerprintComplete;
      legacyReview.repository.workingTreeFingerprintIncompleteReasons = snapshot.repository.workingTreeFingerprintIncompleteReasons;
      legacyReview.repository.workingTreeHashedBytes = snapshot.repository.workingTreeHashedBytes;
      const finalized = finalizePublicContractReview({
        repositoryPath,
        contract,
        claim,
        legacyReview,
        reviewerAttestation: args.reviewerAttestation,
        authorityReceipts: args.authorityReceipts,
        snapshot,
      });
      const review = finalized.review;
      review.artifactDigest = semanticDigest(review);
      const files = writeTaskProofArtifacts({
        artifact: review, repositoryPath, basename: args.basename ?? `${claim.task.id}-review`,
      });
      return {
        gate: finalized.gate,
        legacyGate: review.gate,
        trustedAdapters: finalized.trustedAdapters,
        review,
        files,
        rule: 'contractGate is authoritative for task acceptance. legacyGate is retained only as the criterion-level evidence assessment and never authorizes merge, release, publication, deployment, hardware acceptance, user acceptance, or real-world effectiveness.',
      };
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
      instructions: 'Claimant output is always UNVERIFIED. Public claim/review paths require a frozen Task Contract. Only contractGate from an independent task_proof_review is authoritative for task acceptance; legacyGate is evidence-only. Named checks require explicit operator opt-in.',
    },
  );

  for (const definition of validateTaskProofToolRegistry(TOOL_DEFINITIONS)) {
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

export function isDirectExecution(argvPath = process.argv[1], moduleUrl = import.meta.url, resolveRealPath = realpathSync) {
  if (!argvPath) return false;
  try {
    return resolveRealPath(argvPath) === resolveRealPath(fileURLToPath(moduleUrl));
  } catch {
    return moduleUrl === pathToFileURL(argvPath).href;
  }
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
