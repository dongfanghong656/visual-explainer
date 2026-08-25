# Task Proof Visualizer MCP

A local stdio MCP for two-agent completion reporting:

1. an implementation AI creates a producer manifest from bounded claims and evidence;
2. an independent review AI creates a reviewer manifest from the same repository checkpoint without trusting the producer narrative;
3. the MCP validates both manifests, reconciles disagreements, and renders one-page Mermaid diagrams.

## Tools

- `task_proof_template`
- `task_proof_snapshot`
- `task_proof_validate`
- `task_proof_render`
- `task_proof_write_bundle`
- `task_proof_compare`
- `task_proof_render_review`

## Security boundary

The server is local and uses stdio. `task_proof_snapshot` runs only fixed read-only Git commands. It does not accept shell commands and does not execute tests. `task_proof_write_bundle` writes only beneath `.task-proof/` in an allowlisted Git workspace.

Set `TASK_PROOF_ALLOWED_ROOTS` to a colon-separated list on Unix or a semicolon-separated list on Windows. When unset, only the server process working directory is allowed.

## Install and run

```bash
cd plugins/task-proof-visualizer/mcp
npm install
TASK_PROOF_ALLOWED_ROOTS=/path/to/workspace npm start
```

Example MCP configuration:

```json
{
  "mcpServers": {
    "task-proof-visualizer": {
      "command": "node",
      "args": ["/absolute/path/to/plugins/task-proof-visualizer/mcp/server.mjs"],
      "env": {
        "TASK_PROOF_ALLOWED_ROOTS": "/absolute/path/to/workspace"
      }
    }
  }
}
```

The MCP returns Mermaid source. The existing `visual-explainer` renderer in this repository can turn that source into a self-contained HTML page; Mermaid CLI can export SVG or PNG.
