# Task Proof MCP 0.2.0

The local stdio server is:

```text
plugins/visual-explainer/task-proof/mcp-server.mjs
```

Start it from repository root:

```bash
node plugins/visual-explainer/task-proof/mcp-server.mjs
```

Example client configuration:

```json
{
  "mcpServers": {
    "visual-explainer-task-proof": {
      "command": "node",
      "args": ["plugins/visual-explainer/task-proof/mcp-server.mjs"],
      "cwd": "/absolute/path/to/visual-explainer"
    }
  }
}
```

## Tools

| Tool | Side effects | Purpose |
|---|---|---|
| `task_proof_snapshot` | None | Pin current Git state without raw patches |
| `task_proof_probe` | None | Produce safe deterministic reviewer receipts |
| `task_proof_validate_claim` | None | Validate and digest a claim |
| `task_proof_claim` | Writes `.artifacts/task-proof/` | Bind, validate, and render an unverified claim |
| `task_proof_review` | Writes `.artifacts/task-proof/` | Resnapshot, enforce independence, compute gate, and render review |

The server never runs arbitrary caller-provided commands. Test/build execution remains a host-agent or CI responsibility.

## Sequence

```text
claimant agent
  → task_proof_snapshot
  → collect implementation/test evidence
  → task_proof_claim
  → UNVERIFIED claim JSON/SVG/HTML

independent reviewer run
  → task_proof_snapshot
  → rerun acceptance checks
  → task_proof_probe
  → task_proof_review
  → PASS / PASS_WITH_LIMITS / FAIL / INCONCLUSIVE
```

A PASS is valid only for the claim digest and reviewed snapshot digest recorded in the review artifact.
