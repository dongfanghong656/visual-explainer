---
description: Independently audit a Task Proof claim, reproduce evidence, and compute the only authoritative completion gate.
argument-hint: <claim-json-path>
---

# Task Proof Review — independent reviewer workflow

You are the reviewer. Do not continue the claimant's implementation in this command. Do not accept screenshots, prose summaries, checkmarks, or claimant confidence as proof.

## Pin reality

Use a reviewer run ID different from `claim.producer.runId`. Create a fresh `task_proof_snapshot`. Confirm repository identity, base/head full SHAs, branch/detached state, dirty-tree state, and snapshot digest. A mismatch makes prior completion stale.

## Reconstruct the contract independently

Read the original requirement, specification, acceptance criteria, implementation, tests, and decisions. Treat the claim only as propositions to test. Check the old failure chain, changed control/data flow, state ownership, lifecycle, concurrency/cancellation/error paths, invariants, termination, regressions, and compatibility boundaries.

## Reproduce evidence

Run acceptance checks with normal host or CI tools and record exact command identity, exit code, scope, timestamp, and immutable log locator or digest. Use `task_proof_probe` for safe `file_digest`, `commit_exists`, and `changed_path` receipts. The MCP never runs arbitrary caller-provided commands.

## Findings and gate

Issue one finding per claim: `verified`, `partially_verified`, `unsupported`, `contradicted`, `stale`, or `not_applicable`. A requested verified finding must cite reviewer-produced E2+ evidence; otherwise the MCP downgrades it.

Call `task_proof_review`. The tool resnapshots, binds the claim digest, computes the gate, and renders review JSON/SVG/HTML/manifest.

- `PASS`: every declared-done claim independently verified.
- `PASS_WITH_LIMITS`: no contradiction, but at least one item is partially verified.
- `FAIL`: any declared-done claim is unsupported or contradicted.
- `INCONCLUSIVE`: stale or incomparable state, or no declared-done claim.

Report the gate, claim/review/snapshot digests, verdict groups, independently rerun checks, unresolved risks, evidence needed to change the verdict, and output paths. Never infer merged, released, deployed, or production-ready from implementation tests.
