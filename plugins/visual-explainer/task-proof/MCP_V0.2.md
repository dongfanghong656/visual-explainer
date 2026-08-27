# Task Proof MCP 0.2.0

The dedicated local stdio server is:

```text
plugins/visual-explainer/task-proof/mcp-server.mjs
```

The server uses the official split MCP v2 packages (`@modelcontextprotocol/server` and `@modelcontextprotocol/client`) and requires Node.js 20 or newer. Start in read-only observation mode from the repository root:

```bash
node plugins/visual-explainer/task-proof/mcp-server.mjs
```

All eight public tools are explicitly classified as observation, validation, claimant, reviewer-evidence, or acceptance operations. Server construction validates the complete set and refuses an unclassified future `task_proof_*` tool. Final Review verifiers are resolved only from the in-process trusted-adapter registry and cannot be supplied in request JSON.

An installed package also exposes `visual-explainer-task-proof-mcp`. Enable repository-owned named checks only after reviewing `.task-proof/checks.json`:

```bash
TASK_PROOF_ALLOW_EXECUTION=1 visual-explainer-task-proof-mcp
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
| `task_proof_validate_contract` | None | Normalize a frozen Task Contract and expose its digest, authority, coverage cap, and reviewer policy |
| `task_proof_contract_source_receipt` | Read-only Git observation | Reopen a repository-file source and issue an exact reviewer-bound authority receipt |
| `task_proof_validate_claim` | None | Validate a Claim against the supplied frozen Task Contract |
| `task_proof_claim` | Writes immutable `.artifacts/task-proof/` content | Bind, validate, and render an unverified Claim using the supplied frozen Task Contract |
| `task_proof_review` | Observes; may run explicitly enabled named checks; writes immutable artifacts | Require contract authority receipts and reviewer attestation, compute the legacy evidence gate plus authoritative strict contract gate, and render the Review |

The server never accepts an arbitrary command, executable, evidence type, or policy path from the MCP caller. A legacy request may repeat `kind`, but it must exactly match the repository policy and cannot relabel evidence.

## Sequence

```text
claimant agent
  → task_proof_validate_contract
  → task_proof_snapshot
  → collect claimant implementation evidence
  → task_proof_claim(contract, claim)
  → UNVERIFIED JSON/SVG/HTML/manifest

independent reviewer run
  → load and independently validate the same frozen contract
  → task_proof_contract_source_receipt for every repository authority source
  → reconstruct requirements and acceptance criteria
  → set requiredEvidenceKinds and exact requiredEvidenceLocators
  → task_proof_snapshot
  → task_proof_probe and/or task_proof_run_checks
  → each probe confirms the repository did not change during observation
  → verify complete dirty-content fingerprint
  → task_proof_review performs a final snapshot comparison and strict contract orchestration
  → legacyGate for evidence accounting
  → contractGate: PASS / PASS_WITH_LIMITS / FAIL / INCONCLUSIVE / STALE
```

Every probe/check request declares the claim IDs and criterion IDs it supports. `task_proof_review` accepts no free-form review-evidence array; it collects evidence itself, rejects snapshot races, rejects incomplete dirty snapshots, and downgrades uncovered full or partial verification requests.

Named checks run with an isolated temporary HOME and configuration. The policy owns the test/build type, the top-level executable is pinned and content-hashed, and the source repository must remain unchanged during execution. This is still code execution and should normally run in an ephemeral container or CI worker.

Artifacts are stored under a digest-addressed directory containing exactly JSON, SVG, HTML, and manifest files. `LATEST` is only a convenience pointer. A PASS is valid only for the claim digest and reviewed snapshot digest recorded in the review artifact.

## Compatibility and CI

The stdio entry point uses `serveStdio(createServer)` and the client handshake uses `@modelcontextprotocol/client/stdio`. CI installs dependencies with lifecycle scripts disabled, runs deterministic source/JSON checks, executes every discovered `*.test.mjs`, and performs a real list-tools plus snapshot call on Node.js 20 and 22. GitHub Actions are pinned to full commit SHAs.

## Contract enforcement boundary

The public Claim and Review tools require a Task Contract. A claimant-provisional contract is visibly capped at `INCONCLUSIVE`. The built-in authority adapter supports repository-file sources only. Other authority types require a separately trusted adapter and cannot be upgraded by labels or prose. `review.gate` is the retained legacy evidence assessment; `review.contractGate` and the MCP top-level `gate` are the authoritative task-acceptance result. Neither implies merge or release. See `PUBLIC_CONTRACT_ENFORCEMENT_V1.md`.
