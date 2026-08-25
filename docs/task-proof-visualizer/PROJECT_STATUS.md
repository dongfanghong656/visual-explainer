# Task Proof Visualizer — Human Status

## Goal

Make AI completion reporting auditable: the implementation AI draws what it claims to have completed, while an independent review AI uses the same protocol to accept, downgrade, reject, or add missing claims.

## Verified implementation progress

- Evidence-gated completion rules are implemented.
- Producer and reviewer roles are structurally separated.
- Reconciliation uses stable IDs and rejects checkpoint mismatch.
- Status, change-logic, and review diagrams are generated from manifests.
- Git inspection is bounded and read-only.
- Proof bundle writes are constrained to immutable `.task-proof/` artifacts.
- A local stdio MCP exposes seven tools.
- Automated tests and Node 20/22 CI are present.
- CI generates exact-checkpoint producer proof artifacts.

## Current review state

The implementation has producer-side and automated verification evidence, but it does **not** yet have a real independent AI reviewer manifest for the current PR head. Therefore the project is not accepted or released.

## Next three actions

1. Run a separate reviewer AI at the exact PR base/head and produce `TASK_PROOF.reviewer.json`.
2. Reconcile producer and reviewer manifests and close every downgrade or omission.
3. Verify clean installation plus exported HTML/SVG/PNG, then integrate staging into the durable feature branch.

## Current codes

- Development: `MVP_IMPLEMENTED`
- Review: `INDEPENDENT_REVIEW_REQUIRED`
- Sync: `SYNC_PARTIAL`
- Release: `NOT_RELEASED`
