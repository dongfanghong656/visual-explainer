# Task Proof Visualizer — Task Ledger

Status vocabulary: `DONE`, `PARTIAL`, `NOT_STARTED`, `BLOCKED`, `REVIEW_REQUIRED`.

| ID | Task | Status | Evidence / closing condition |
|---|---|---|---|
| TPV-001 | Select and fork an existing visualization project | DONE | `dongfanghong656/visual-explainer`, based on `nicobailon/visual-explainer` |
| TPV-002 | Define producer/reviewer/reconciliation protocol | DONE | `plugins/task-proof-visualizer/SKILL.md`, commands, five reference standards |
| TPV-003 | Define canonical manifest schema | DONE | Draft 2020-12 schema and fixtures |
| TPV-004 | Implement deterministic claim validator | DONE | `src/core.mjs`; unit tests for evidence gates and contradictions |
| TPV-005 | Implement independent-review reconciliation | DONE | stable-ID compare, reviewer disposition constraints, checkpoint mismatch detection |
| TPV-006 | Implement status/change-logic/review diagrams | DONE | `src/render.mjs`; Mermaid sanitization test |
| TPV-007 | Implement bounded Git snapshot | DONE | fixed Git argv, allowlisted roots, bounded outputs, file hashes |
| TPV-008 | Implement immutable proof bundle writer | DONE | `.task-proof/` restriction, overwrite/traversal/symlink tests |
| TPV-009 | Implement local stdio MCP | DONE | seven tools in `mcp/server.mjs`; SDK smoke test |
| TPV-010 | Implement CLI | DONE | `cli.mjs` validate/render/compare/snapshot/write commands |
| TPV-011 | Add local automated tests | DONE | 14 tests expected in full suite, including MCP smoke |
| TPV-012 | Add Node 20/22 CI | DONE | workflow matrix and proof artifact upload; current-head result must be rechecked after final docs commit |
| TPV-013 | Generate exact-checkpoint CI producer proof | DONE | `scripts/generate-ci-proof.mjs`; workflow uploads JSON/MD/MMD/validation/test log |
| TPV-014 | Independent AI review of the implementation | REVIEW_REQUIRED | separate reviewer context must inspect the same base/head and create reviewer manifest |
| TPV-015 | Reconcile real producer and reviewer manifests | REVIEW_REQUIRED | `TASK_PROOF_ACCEPTED` or explicit dispute list |
| TPV-016 | Clean-checkout installation test | NOT_STARTED | clone, install, configure MCP, run template/validate/render/write end to end |
| TPV-017 | Visual HTML/SVG/PNG integration demonstration | NOT_STARTED | render generated Mermaid through Visual Explainer and visually inspect |
| TPV-018 | Integrate stage branch into durable feature branch | BLOCKED | blocked on TPV-014–TPV-017 and successful CI reread |
| TPV-019 | Package or registry publication | NOT_STARTED | versioning, package lock, install docs, release approval |
| TPV-020 | Upstream contribution decision | NOT_STARTED | determine whether to keep fork plugin or propose upstream integration |

## Current critical path

```text
independent AI review
        ↓
producer/reviewer reconciliation
        ↓
clean-checkout install + rendered diagram inspection
        ↓
merge stage → durable feature branch
        ↓
release decision
```
