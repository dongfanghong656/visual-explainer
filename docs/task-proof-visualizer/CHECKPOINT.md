# Task Proof Visualizer — Checkpoint

## Repository state

- Upstream basis: `nicobailon/visual-explainer`.
- Working fork: `dongfanghong656/visual-explainer`.
- Upstream/base commit used to create the durable branch: `df35d97a00191d8aba831e757a65dd6ce0514fc0`.
- Durable feature branch: `chat/task-proof-visualizer/v0.1.0`.
- Active staging branch: `stage/task-proof-visualizer/turn-0002`.
- Draft integration PR: `#1`, staging → durable feature branch.

The exact staging head changes whenever continuity documents are committed. The immutable head for each CI run is captured inside the uploaded `CI_PRODUCER_<sha>_NODE_<version>` proof bundle and GitHub check run. Do not substitute this document's branch name for that SHA during review.

## Current functional state

Implemented and locally exercised:

- producer/reviewer/reconciliation Skill;
- claim/evidence/review/diagram/security standards;
- schema and examples;
- deterministic validation and reconciliation;
- checkpoint mismatch enforcement;
- three Mermaid views and Markdown output;
- bounded Git snapshot;
- immutable allowlisted proof writer;
- seven-tool stdio MCP;
- CLI;
- 14-test suite;
- Node 20/22 workflow;
- exact-checkpoint CI producer proof generation.

Not completed:

- independent reviewer AI manifest;
- real reconciliation artifact for this implementation;
- clean-checkout host installation test;
- rendered HTML/SVG/PNG visual inspection;
- merge into durable feature branch;
- release or publication.

## Continuation entry point

1. Read `REQUIREMENTS.md`, `SPEC.md`, `TASKS.md`, `DECISIONS.md`, `RISKS.md`, and this checkpoint.
2. Resolve the current PR head SHA from GitHub.
3. Confirm Node 20/22 check runs and uploaded producer proof artifacts for that exact SHA.
4. Start a separate reviewer context at the same base/head.
5. Generate reviewer manifest and reconciliation.
6. Complete clean-install and visual-render acceptance.
7. Only then consider integrating staging into the durable branch.

## Sync state

`SYNC_PARTIAL`

Reason: staging changes and continuity artifacts are committed in the GitHub fork and a draft PR exists, but the durable feature branch remains unchanged pending independent review and acceptance.
