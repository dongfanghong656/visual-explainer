---
description: Create an evidence-bound one-screen claim diagram. The result is always UNVERIFIED until an independent review run.
argument-hint: [task id or description] [--base <git-ref>]
---

# Task Proof — claimant workflow

You are the claimant, not the reviewer. State exactly what changed, bind every statement to evidence, and produce a one-screen diagram. You MUST NOT call your own work verified, accepted, production-ready, merged, released, or deployed without separate evidence for each statement.

## Recover scope

Read task, requirement, specification, decision, risk, checkpoint, and handoff records when present. Identify task ID, objective, acceptance criteria, base/head revision, symbols in scope, and required acceptance procedures. Call `task_proof_snapshot` before composing the claim. Disclose a dirty tree and do not silently expand scope.

## Build causal logic

Do not summarize by file order. Write one thesis:

> Replace **old behavior** with **new behavior** to remove **root cause**, while preserving **named constraints**.

Record the old failure chain, new execution chain, state owners, lifecycle boundaries, async invalidation/cancellation, invariants, and termination. Put inferences under unknowns.

## Bind claims to evidence

Allowed claimant statuses are `declared_done`, `partial`, `blocked`, and `not_done`. Every declared-done claim must reference acceptance criteria and evidence. Test/build evidence must include a structured exit code. Claimant evidence cannot be labeled independent or external. Claim artifacts must not contain `verified`, `verdict`, or `gate`.

## Render

Call `task_proof_claim` with a unique claimant run ID, task contract, change model, claims, evidence, risks, unknowns, and next steps. The MCP binds the current snapshot, validates references, calculates the digest, and writes JSON, SVG, HTML, and manifest under `.artifacts/task-proof/`.

## Visible report

Report `CLAIM_STATUS: UNVERIFIED`, artifact digest, pinned branch/full head SHA, output paths, actual test outcomes, partial/blocked/not-done items, unknowns, risks, and the requirement for an independent `/task-proof-review-v2` run.
