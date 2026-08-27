---
name: task-proof
description: Use when an AI agent is about to claim that project work is complete, when a user asks what the AI changed and what remains, or when an independent agent must audit another agent's completion claim. Produces a one-screen causal change diagram backed by snapshot-bound JSON evidence and an independent computed review gate.
---

# Task Proof

Task Proof turns “I finished the task” into two separate artifacts:

1. a claimant diagram that is always **UNVERIFIED**;
2. an independent review diagram whose gate is computed from fresh criterion-level evidence.

Use this skill automatically before making a material completion statement about code, configuration, tests, documentation, packaging, release, deployment, hardware validation, or user acceptance. Also use it when reviewing another agent's work, preparing a handoff, or explaining a complex change.

## Non-negotiable rules

- Never let the implementing run verify itself.
- Never treat a screenshot, checklist, prose summary, commit existence, or claimant-provided test statement as sufficient proof.
- Never infer release, deployment, production readiness, hardware acceptance, or user acceptance from source-level tests.
- Never hide dirty state, stale snapshots, blocked work, unknowns, or untested paths.
- Never draw directly from free-form prose when semantic JSON and evidence can be produced first.

## Route

### Claimant mode

Use claimant mode when this run implemented or edited the work.

1. Recover requirements, specification, acceptance criteria, decisions, risks, checkpoint, release boundary, and the project-approved frozen Task Contract.
2. Call `task_proof_validate_contract`, then `task_proof_snapshot` at the contract base revision.
3. Build a causal model: old failure → root cause → changed mechanism → new behavior; include state ownership, lifecycle, asynchronous boundaries, invariants, termination, regressions, and degradation.
4. Create claims with statuses `declared_done`, `partial`, `blocked`, or `not_done`.
5. Bind every declared-done claim to acceptance criteria and claimant evidence.
6. Call `task_proof_claim` with the validated contract and complete criterion snapshot.
7. Report `CLAIM_STATUS: UNVERIFIED` and request a different run to execute reviewer mode.

If project authority has not approved a frozen contract, label the claimant-created substitute **PROVISIONAL CONTRACT**. It cannot produce an authoritative result above `INCONCLUSIVE`.

Follow `../../commands/task-proof.md` and `../../task-proof/STANDARD_V0.2.md`.

### Reviewer mode

Use reviewer mode only when this run is not continuing the claimant's implementation.

1. Use a reviewer run ID different from the claimant run ID.
2. Reconstruct and validate the contract independently with `task_proof_validate_contract` rather than trusting the claim narrative.
3. Call `task_proof_snapshot` and reject stale state.
4. Issue one reviewer-owned `task_proof_contract_source_receipt` for every declared repository authority source.
5. Collect fresh evidence with `task_proof_probe` and, after operator opt-in, `task_proof_run_checks`.
6. Bind each receipt to the exact claim IDs and acceptance-criterion IDs it supports.
7. Submit one finding per claim to `task_proof_review` with the contract, reviewer attestation, and authority receipts.
8. Report the authoritative `contractGate` (`PASS`, `PASS_WITH_LIMITS`, `FAIL`, or `INCONCLUSIVE`) and its exact contract, Claim, Review, snapshot, and artifact digests.

Follow `../../commands/task-proof-review.md`, `../../task-proof/SECURITY_V0.2.md`, and `../../task-proof/MCP_V0.2.md`.

## Diagram contract

The one-screen visual must include:

- task and objective;
- branch, full head binding, and artifact digest;
- one-sentence change thesis;
- at most four primary completion claims;
- explicit claim/verdict state;
- `BEFORE → CHANGE → AFTER` causal logic;
- evidence identifiers;
- unmistakable `UNVERIFIED` or computed gate badge;
- textual alternative in the SVG.

The JSON artifact is the fact source. SVG/HTML are views. A PNG without JSON and manifest is presentation only.

## MCP unavailable

When the MCP cannot be reached, produce neither a verified gate nor invented file paths. Record `SYNC_BLOCKED` or `SYNC_PARTIAL`, preserve the semantic claim model, and state exactly which evidence and tool operations remain unperformed.
