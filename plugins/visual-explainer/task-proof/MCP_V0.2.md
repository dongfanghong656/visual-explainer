# Task Proof MCP 0.2.0

The local stdio server is:

```text
plugins/visual-explainer/task-proof/mcp-server.mjs
```

Start in read-only observation mode from the repository root:

```bash
node plugins/visual-explainer/task-proof/mcp-server.mjs
```

Enable repository-owned named checks only after reviewing `.task-proof/checks.json`:

```bash
TASK_PROOF_ALLOW_EXECUTION=1 node plugins/visual-explainer/task-proof/mcp-server.mjs
```

Example client configuration:

```json
{
  "mcpServers": {
    "visual-explainer-task-proof": {
      "command": "node",
      "args": ["plugins/visual-explainer/task-proof/mcp-server.mjs"],
      "cwd": "/absolute/path/to/visual-explainer",
      "env": {
        "TASK_PROOF_ALLOW_EXECUTION": "0"
      }
    }
  }
}
```

## Tools

| Tool | Side effects | Purpose |
|---|---|---|
| `task_proof_snapshot` | None | Pin current Git state without raw patches |
| `task_proof_probe` | None | Produce criterion-bound safe observation receipts |
| `task_proof_run_checks` | Executes named repository checks when explicitly enabled | Produce criterion-bound test/build receipts |
| `task_proof_validate_claim` | None | Validate and digest a claim |
| `task_proof_claim` | Writes `.artifacts/task-proof/` | Bind, validate, and render an unverified claim |
| `task_proof_review` | Observes; may run explicitly enabled named checks; writes artifacts | Resnapshot, enforce criterion coverage, compute the gate, and render the review |

The server never accepts an arbitrary command from the MCP caller.

## Sequence

```text
claimant agent
  → task_proof_snapshot
  → collect claimant implementation evidence
  → task_proof_claim
  → UNVERIFIED claim JSON/SVG/HTML/manifest

independent reviewer run
  → reconstruct requirements and acceptance criteria
  → task_proof_snapshot
  → task_proof_probe and/or task_proof_run_checks
  → task_proof_review
  → PASS / PASS_WITH_LIMITS / FAIL / INCONCLUSIVE
```

Every probe/check request declares the claim IDs and criterion IDs it supports. `task_proof_review` accepts no free-form review-evidence array; it collects evidence itself, rejects snapshot races, and downgrades uncovered verification requests.

A PASS is valid only for the claim digest and reviewed snapshot digest recorded in the review artifact.
