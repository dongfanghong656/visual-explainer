---
description: Create an evidence-bound one-screen claim diagram for work performed in the current repository. The result is always UNVERIFIED until an independent review run.
argument-hint: [task id or task description] [--base <git-ref>]
---

# Task Proof — claimant workflow

You are the claimant, not the reviewer. State exactly what changed, bind every statement to evidence, and produce a one-screen diagram. You MUST NOT call your own work verified, accepted, production-ready, merged, released, or deployed without separate evidence for each statement.

## 1. Recover scope

Read task, requirement, specification, decisions, risks, checkpoints, handoff, and release status when present. Identify task ID, objective, acceptance criteria, base/head revision, files and symbols in scope, and required acceptance procedures. Call `task_proof_snapshot` before composing the claim. Disclose a dirty tree and do not silently expand scope.

## 2. Build causal change logic

Do not summarize by file order. Write one thesis:

> Replace **old behavior** with **new behavior** to remove **root cause**, while preserving **named constraints**.

Record the old failure chain, new execution chain, state owners, lifecycle boundaries, asynchronous invalidation or cancellation, invariants, termination, and known degradation paths. Put inferences under `unknowns` rather than presenting them as facts.

## 3. Bind claims to evidence

Allowed claimant statuses are `declared_done`, `partial`, `blocked`, and `not_done`. Every declared-done claim must reference acceptance criteria and claimant evidence. Test/build evidence must include a structured exit code. Claimant evidence cannot be labeled independent or external. Claim artifacts must not contain `verified`, `verdict`, `gate`, or equivalent self-approval fields.

For each acceptance criterion, specify `requiredEvidenceKinds` when the criterion cannot be proved by any deterministic observation. Examples: implementation presence may require `diffstat`; behavior may require `test`; packaging may require `build`; deployment may require `external` evidence.

## 4. Render the claim

Call `task_proof_claim` with a unique claimant run ID, task contract, causal change model, claims, evidence, risks, unknowns, and next steps. The MCP binds the current snapshot, validates references, computes the claim digest, and writes JSON, SVG, HTML, and manifest under `.artifacts/task-proof/`.

## 5. Report honestly

Report all of the following:

- `CLAIM_STATUS: UNVERIFIED`;
- claim digest and pinned branch/full head SHA;
- output paths;
- actual test and build outcomes;
- partial, blocked, and not-done work;
- unknowns and risks;
- the exact independent `/task-proof-review` work still required.

If the MCP is unavailable, create semantic JSON following `task-proof/STANDARD_V0.2.md`, but do not invent a render, digest, review, or completion gate.
