# Task Proof — evidence-bound AI completion diagrams

Task Proof is a reviewable extension of visual-explainer for answering four questions on one screen:

1. What task did the AI attempt?
2. What changed and why does the new mechanism work?
3. Which completion statements are supported by evidence?
4. What remains partial, blocked, stale, or unverified?

## Components

- Agent Skill: `plugins/visual-explainer/skills/task-proof/SKILL.md`
- Claim command: `/task-proof`
- Review command: `/task-proof-review`
- stdio MCP: `plugins/visual-explainer/task-proof/mcp-server.mjs`
- Protocol core: `core.mjs`
- Safe read-only evidence: `hardening.mjs`
- Opt-in named checks: `named-checks.mjs`
- JSON Schema: `task-proof.schema.json`
- Standard and threat model: `STANDARD_V0.2.md`, `SECURITY_V0.2.md`
- Repository check policy: `.task-proof/checks.json`
- CI: `.github/workflows/task-proof.yml`

## Trust model

The implementing AI can declare completion but cannot verify it. The claimant view is always `UNVERIFIED`. A different review run reconstructs acceptance criteria and asks the MCP to collect fresh evidence. Every evidence receipt names the claim and criterion it supports. The review gate is computed; caller-supplied gate values are ignored.

A changed repository snapshot invalidates the prior gate. Named checks are disabled by default and never accept arbitrary caller commands.

## Start the MCP

Read-only observations:

```bash
node plugins/visual-explainer/task-proof/mcp-server.mjs
```

Repository-owned named checks, after policy review:

```bash
TASK_PROOF_ALLOW_EXECUTION=1 node plugins/visual-explainer/task-proof/mcp-server.mjs
```

## Review sequence

```text
implementing AI
  → snapshot
  → causal change model
  → claimant evidence
  → task_proof_claim
  → UNVERIFIED claim diagram

independent AI/reviewer
  → reconstruct contract
  → fresh snapshot
  → safe probes / named checks
  → criterion-bound receipts
  → task_proof_review
  → computed review diagram and gate
```

## Output

Artifacts are written under `.artifacts/task-proof/` as JSON, SVG, HTML, and a digest manifest. Do not publish the render alone as proof.

## Current boundary

This branch is a review candidate. The Task Proof implementation is not merged, tagged, released, deployed, or externally accepted merely because repository tests pass.
