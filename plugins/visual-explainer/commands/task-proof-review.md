---
description: Independently audit a Task Proof claim, reproduce criterion-level evidence, and compute the only authoritative completion gate.
argument-hint: <claim-json-path>
---

# Task Proof Review — independent reviewer workflow

You are the reviewer. Do not continue implementation while reviewing. Do not accept a diagram, screenshot, prose summary, checklist, claimant confidence, or claimant-produced test statement as proof.

## 1. Establish independence and pin reality

Use a reviewer run ID different from `claim.producer.runId`. Call `task_proof_snapshot` and confirm repository identity, full base/head SHAs, branch or detached state, dirty-tree state, and snapshot digest. A head or snapshot mismatch makes prior declared completion stale.

A different run ID is a protocol separation marker, not cryptographic identity. Therefore the gate must depend on fresh MCP-produced observations, not on the reviewer merely renaming itself.

## 2. Reconstruct the contract independently

Read the original requirement, specification, acceptance criteria, implementation, tests, decisions, risks, and release boundary. Call `task_proof_validate_contract` on the supplied contract and compare its digest, authority declaration, repository, base revision, and complete criterion snapshot with the Claim. Treat the claim only as propositions to test. Check the old failure chain, changed control/data flow, state ownership, lifecycle, concurrency and cancellation paths, errors and degradation, invariants, termination, regressions, and compatibility.

## 3. Reproduce criterion-level evidence

For every declared repository authority source, call `task_proof_contract_source_receipt` yourself with the exact contract, Claim, reviewer run ID, and source ID. A missing, stale, claimant-owned, or context-mismatched authority receipt prevents an authoritative pass.

Use `task_proof_probe` for allowlisted read-only observations:

- `file_digest`;
- `commit_exists` with a full SHA;
- `changed_path`.

Every probe must explicitly list `supportsClaimIds` and `supportsCriterionIds`. An unrelated file or commit cannot verify a criterion.

For behavioral checks, use repository-defined named checks from `.task-proof/checks.json` through `task_proof_run_checks`. The MCP never accepts a caller-provided command and does not use a shell. Named execution is disabled unless the operator explicitly starts the server with `TASK_PROOF_ALLOW_EXECUTION=1` after reviewing the policy.

## 4. Submit findings and compute the gate

Issue one finding per claim: `verified`, `partially_verified`, `unsupported`, `contradicted`, `stale`, or `not_applicable`. Cite only evidence IDs collected during this review. A requested `verified` finding is downgraded unless every referenced acceptance criterion is covered by a valid MCP receipt of an allowed evidence kind.

Call `task_proof_review` with the contract, Claim, reviewer identity and attestation, reviewer-owned authority receipts, findings, probes, and named-check requests. The tool collects evidence at one snapshot, detects repository races, binds receipt and artifact digests, computes the legacy evidence gate and the authoritative `contractGate`, and renders review JSON/SVG/HTML/manifest.

- `PASS`: `contractGate` confirms every blocking contract criterion and trusted adapter result at the pinned snapshot.
- `PASS_WITH_LIMITS`: `contractGate` confirms the allowed subset but preserves an explicit contract/source limitation.
- `FAIL`: `contractGate` detects a contradiction, mismatch, invalid receipt, or failed blocking condition.
- `INCONCLUSIVE`: authority, trusted adapters, evidence, lifecycle, or coverage is missing or provisional.

## 5. Report the boundary

Report `contractGate` as the authoritative task result, plus the legacy evidence gate, contract/claim/review/snapshot digests, authority receipt set, reviewer level, verdict groups, checks actually rerun, dirty state, unresolved risks, evidence needed to change the verdict, and output paths. Never infer merged, released, deployed, externally accepted, or production-ready from implementation tests.
