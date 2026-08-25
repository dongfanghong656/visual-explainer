# Task Proof Visualizer — Acceptance Plan

## Automated acceptance

| ID | Criterion | Test/evidence |
|---|---|---|
| AC-001 | A code claim with primary implementation + primary verification evidence and passing acceptance evaluates as verified. | `core.test.mjs`: paired evidence case |
| AC-002 | A self-report-only done claim cannot evaluate as verified complete. | `core.test.mjs`: self-report case |
| AC-003 | Failed cited evidence contradicts a done claim. | `core.test.mjs`: failed evidence case |
| AC-004 | A blocked claim without a named blocker is invalid. | `core.test.mjs`: blocker case |
| AC-005 | Producer and reviewer reconcile by stable claim ID. | `core.test.mjs`: agreement case |
| AC-006 | Reviewer rejection downgrades producer completion and yields disputed reconciliation. | `core.test.mjs`: downgrade case |
| AC-007 | Mermaid labels remove active markup delimiters and render required sections. | `core.test.mjs`: sanitization/render case |
| AC-008 | Snapshot hashes named files, rejects workspace escape, writes only in `.task-proof/`, rejects overwrite, and rejects unsafe output names. | `core.test.mjs`: workspace case |
| AC-009 | MCP starts over stdio, lists exactly seven tools, and validates a fixture. | `mcp/tests/smoke.test.mjs` |
| AC-010 | Tests execute on Node 20 and Node 22. | GitHub Actions matrix |

## Manual review acceptance

Before integration into the durable branch, a reviewer should verify:

1. completion rules do not permit evidence laundering through `review` items marked self-report;
2. acceptance references cannot silently point to missing criteria;
3. failed evidence remains visible in diagrams and Markdown;
4. path resolution rejects lexical and symlink escape;
5. no MCP input is interpolated into a shell command;
6. bundle creation cannot overwrite prior proof artifacts;
7. producer and reviewer manifests at different checkpoints are not reconciled by the Skill;
8. diagrams remain readable with maximum configured claim counts;
9. plugin metadata and command discovery work in a supported host;
10. upstream Visual Explainer behavior remains unchanged outside the additive plugin and workflow.

## Release gates

A v0.1.0 release candidate requires:

- all automated tests passing locally;
- GitHub Actions passing on Node 20 and 22;
- independent reviewer manifest and reconciliation artifact;
- no unresolved high-severity security finding;
- documentation and install path verified from a clean checkout;
- durable branch integration verified by reread;
- release tag and package status explicitly recorded.

Until all gates pass, status remains `NOT_RELEASED`.
