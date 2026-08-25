# Task Proof Visualizer — Evidence Ledger

## E-001 — Local unit and MCP protocol suite

- Command: `cd plugins/task-proof-visualizer/mcp && npm install --ignore-scripts --no-audit --no-fund && npm test`
- Expected/current suite: 14 tests, 0 failures.
- Coverage includes:
  - paired implementation/verification evidence;
  - self-report rejection;
  - contradiction preservation;
  - acceptance evidence requirement;
  - blocker requirement;
  - producer/reviewer role separation;
  - reviewer evidence consistency;
  - stable-ID reconciliation;
  - reviewer downgrade;
  - checkpoint mismatch;
  - Mermaid sanitization;
  - traversal, unsafe name, overwrite, and symlink rejection;
  - stdio MCP startup, exact seven-tool discovery, and fixture validation.
- Trust: primary local execution evidence for the staging workspace; CI independently reruns the suite.

## E-002 — Syntax validation

- Command: `node --check` over source, CLI, MCP server, CI generator, and test modules.
- Result: no syntax error observed in the local staging checkout.
- Trust: primary local execution evidence.

## E-003 — Diff scope and whitespace

- Compared staging branch with durable branch `chat/task-proof-visualizer/v0.1.0`.
- Verified changed paths are restricted to:
  - `plugins/task-proof-visualizer/**`;
  - `docs/task-proof-visualizer/**`;
  - `.github/workflows/task-proof-visualizer.yml`.
- `git diff --check` completed without an observed whitespace error.
- Trust: primary local Git evidence.

## E-004 — CI producer-proof generator

- Local simulation runs the full suite, hashes `.task-proof/ci-test.log`, creates an exact-checkpoint producer manifest, writes JSON/Markdown/Mermaid/validation artifacts, and requires `verified_complete`.
- CI uses `GITHUB_SHA`, base SHA, workflow run ID, Node version, and test-log SHA-256.
- Trust: implementation plus local behavior evidence; current-head GitHub result must be read from PR checks.

## E-005 — GitHub Actions matrix

- Workflow: `.github/workflows/task-proof-visualizer.yml`.
- Environments: Node 20 and Node 22 on Ubuntu.
- Steps: install, full tests, exact-checkpoint producer proof generation, artifact upload.
- Artifact names: `task-proof-node-<node>-<sha>`.
- Source of truth for a specific checkpoint: GitHub check runs on that PR head, not this prose file.

## Evidence limits

These records do not yet prove:

- independent AI review of the implementation;
- clean installation in a fresh host configuration;
- visual inspection of exported HTML/SVG/PNG;
- durable-branch integration;
- package publication, release, deployment, or upstream acceptance.
