# Task Proof extension

Task Proof adds evidence-gated completion diagrams to visual-explainer. It deliberately separates an implementing AI's declaration from an independent review.

## Stable workflow

1. The claimant calls `task_proof_snapshot`, reconstructs the task contract, and submits a semantic claim with `task_proof_claim`.
2. The claimant artifact is always marked `UNVERIFIED`.
3. A different run independently reconstructs the acceptance criteria and collects fresh receipts with `task_proof_probe` and, after operator opt-in, `task_proof_run_checks`.
4. Only `task_proof_review` may compute `PASS`, `PASS_WITH_LIMITS`, `FAIL`, or `INCONCLUSIVE`.

The six MCP tools are:

- `task_proof_snapshot`
- `task_proof_probe`
- `task_proof_run_checks`
- `task_proof_validate_claim`
- `task_proof_claim`
- `task_proof_review`

Read `STANDARD_V0.2.md`, `SECURITY_V0.2.md`, and `MCP_V0.2.md` before using the protocol. The machine-readable contract is `task-proof.schema.json`.

## Start the dedicated MCP

From a source checkout:

```bash
node plugins/visual-explainer/task-proof/mcp-server.mjs
```

From an installed package:

```bash
visual-explainer-task-proof-mcp
```

Named repository checks are disabled by default. Review `.task-proof/checks.json` before enabling them:

```bash
TASK_PROOF_ALLOW_EXECUTION=1 visual-explainer-task-proof-mcp
```

The server and its stdio test client use the official split MCP v2 packages. Node.js 20 or newer is required.

## Verification

```bash
npm run check:task-proof
TASK_PROOF_ALLOW_EXECUTION=1 npm run test:task-proof
npm run test:task-proof:mcp
```

The last command performs both a tool-contract check and a real stdio client/server handshake. Source-level tests do not prove release, deployment, hardware, external-system, or user acceptance.

## Artifact boundary

JSON is the fact source. SVG and HTML are deterministic views. Immutable bundles are stored below `.artifacts/task-proof/` and are bound to their claim/review digest and repository snapshot. A screenshot or PNG without its JSON and manifest is presentation only.
