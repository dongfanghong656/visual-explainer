# Visual Explainer MCP server

This directory contains the local Model Context Protocol server for visual-explainer.

## Scope

The server is stdio-only. It is meant for MCP hosts that launch a local child process.
It does not start an HTTP listener, handle credentials, call an LLM, or store output outside the local machine.

Rendered files are written only to `~/.agent/diagrams/`. Filenames must be basenames. Paths, traversal, control characters, and symlink targets are rejected.

## Run from a package install

```json
{
  "mcpServers": {
    "visual-explainer": {
      "command": "visual-explainer-mcp"
    }
  }
}
```

## Run from a checkout

Install dependencies first:

```bash
npm install --no-package-lock
```

Then point the host at the server entry:

```json
{
  "mcpServers": {
    "visual-explainer": {
      "command": "node",
      "args": ["/absolute/path/to/visual-explainer/plugins/visual-explainer/mcp/server.mjs"]
    }
  }
}
```

## Exposed tools

- `visual_explainer_prepare`: returns a recommended visual explanation flow. It does not write files.
- `visual_explainer_render_html`: validates a complete HTML document and writes it to `~/.agent/diagrams/`.
- `visual_explainer_render_quick`: validates a quick-mode JSON spec and writes rendered HTML to `~/.agent/diagrams/`.
- `task_proof_git_snapshot`: reads exact Git revisions, changed paths, dirty state, and a SHA-256 worktree digest without returning patch contents.
- `task_proof_validate_claim`: validates an author `task-claim` against evidence, completion-language, and artifact-status rules.
- `task_proof_render_claim`: deterministically renders a valid author claim and writes an HTML page plus `.task-proof.json` sidecar.
- `task_proof_validate_review`: validates an independent `task-review` against its claim, exact scope, criterion coverage, and reviewer evidence.
- `task_proof_render_review`: deterministically renders an accepted/corrected/rejected/blocked/stale review and its combined JSON sidecar.

Render tools default to `open: false`. Set `open: true` only when you want the server to request a browser or Glimpse window. Task Proof writes the authoritative JSON sidecar before the deterministic HTML derivative; a failed HTML write can be regenerated from JSON, but the alpha does not promise a cross-file atomic transaction.

Task Proof Git access is read-only and limited to repositories inside the MCP process launch directory. The author and reviewer prompts must still inspect source and run the relevant checks; the server does not infer semantic correctness.

## Exposed prompts

The server exposes the bundled command templates as MCP prompts:

- `generate-web-diagram`
- `generate-visual-plan`
- `generate-slides`
- `diff-review`
- `plan-review`
- `project-recap`
- `fact-check`
- `task-proof`
- `task-proof-review`

Pass `request` to fill the template's `$@` argument.

## Exposed resources

The server exposes read-only resources for the canonical skill, command templates, quick-mode contract, and Task Proof contract:

- `visual-explainer://skill/SKILL.md`
- `visual-explainer://commands/*.md`
- `visual-explainer://quick/README.md`
- `visual-explainer://quick/schema.json`
- `visual-explainer://task-proof/PROTOCOL.md`
- `visual-explainer://task-proof/schema.json`
- `visual-explainer://task-proof/examples/scroll-restoration.claim.json`
- `visual-explainer://task-proof/examples/scroll-restoration.review.json`
