# Task Proof Visualizer — Artifact Index

## Skill and operating commands

- `plugins/task-proof-visualizer/SKILL.md`
- `plugins/task-proof-visualizer/commands/task-proof.md`
- `plugins/task-proof-visualizer/commands/task-proof-review.md`
- `plugins/task-proof-visualizer/commands/task-proof-reconcile.md`

## Standards

- `references/CLAIM_PROTOCOL.md`
- `references/EVIDENCE_POLICY.md`
- `references/REVIEW_PROTOCOL.md`
- `references/DIAGRAM_GRAMMAR.md`
- `references/SECURITY.md`

## Runtime

- `src/core.mjs` — validation, digest, reconciliation.
- `src/render.mjs` — status, change-logic, review Mermaid and Markdown.
- `src/workspace.mjs` — bounded Git snapshot and immutable writer.
- `mcp/server.mjs` — seven stdio MCP tools.
- `cli.mjs` — direct command-line interface.
- `scripts/generate-ci-proof.mjs` — exact-checkpoint CI producer proof.

## Contracts and examples

- `schemas/task-proof.schema.json`
- `templates/task-proof.example.json`
- `tests/fixtures/producer.valid.json`
- `tests/fixtures/reviewer.valid.json`

## Verification

- `tests/core.test.mjs`
- `mcp/tests/smoke.test.mjs`
- `.github/workflows/task-proof-visualizer.yml`
- GitHub Actions uploaded proof artifacts named `task-proof-node-<node>-<sha>`.

## Product documentation

- `REQUIREMENTS.md`
- `SPEC.md`
- `ARCHITECTURE.md`
- `ACCEPTANCE.md`
- `TASKS.md`
- `EVIDENCE.md`
- `DECISIONS.md`
- `RISKS.md`
- `CHECKPOINT.md`
- `TURN_LOG.md`
- `RELEASE_STATUS.md`
- `PROJECT_STATUS.md`
