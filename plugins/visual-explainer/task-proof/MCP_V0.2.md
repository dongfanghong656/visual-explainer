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
| `task_proof_snapshot` | None | Pin rename-safe Git state and dirty-file content without raw patches |
| `task_proof_probe` | None | Produce criterion-bound safe observation receipts and reject an in-flight snapshot race |
| `task_proof_run_checks` | Executes named repository checks when explicitly enabled | Produce criterion-bound policy-typed test/build receipts |
| `task_proof_validate_claim` | None | Validate and digest a claim |
| `task_proof_claim` | Writes immutable `.artifacts/task-proof/` content | Bind, validate, and render an unverified claim |
| `task_proof_review` | Observes; may run explicitly enabled named checks; writes immutable artifacts | Resnapshot, enforce criterion and locator coverage, compute the gate, and render the review |

The server never accepts an arbitrary command, executable, evidence type, or policy path from the MCP caller. A legacy request may repeat `kind`, but it must exactly match the repository policy and cannot relabel evidence.

## Sequence

```text
claimant agent
  → task_proof_snapshot
  → collect claimant implementation evidence
  → task_proof_claim
  → UNVERIFIED JSON/SVG/HTML/manifest

independent reviewer run
  → reconstruct requirements and acceptance criteria
  → set requiredEvidenceKinds and exact requiredEvidenceLocators
  → task_proof_snapshot
  → task_proof_probe and/or task_proof_run_checks
  → each probe confirms the repository did not change during observation
  → verify complete dirty-content fingerprint
  → task_proof_review performs a final snapshot comparison
  → PASS / PASS_WITH_LIMITS / FAIL / INCONCLUSIVE
```

Every probe/check request declares the claim IDs and criterion IDs it supports. `task_proof_review` accepts no free-form review-evidence array; it collects evidence itself, rejects snapshot races, rejects incomplete dirty snapshots, and downgrades uncovered full or partial verification requests.

Named checks run with an isolated temporary HOME and configuration. The policy owns the test/build type, the top-level executable is pinned and content-hashed, and the source repository must remain unchanged during execution. This is still code execution and should normally run in an ephemeral container or CI worker.

Artifacts are stored under a digest-addressed directory containing exactly JSON, SVG, HTML, and manifest files. `LATEST` is only a convenience pointer. A PASS is valid only for the claim digest and reviewed snapshot digest recorded in the review artifact.
