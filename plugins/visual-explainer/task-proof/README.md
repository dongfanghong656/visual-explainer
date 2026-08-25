# Task Proof extension

This directory adds evidence-gated completion diagrams to visual-explainer.

## MCP tools

- `task_proof_git_snapshot` — read-only Git scope and worktree digest.
- `task_proof_validate_claim` — validate an author declaration.
- `task_proof_render_claim` — validate, persist JSON, and render the author diagram.
- `task_proof_validate_review` — validate an independent review against its claim.
- `task_proof_render_review` — validate, persist JSON, and render the reviewer verdict.

Read `PROTOCOL.md` before authoring or reviewing bundles. `schema.json` is the machine-readable contract. Examples are under `examples/`.

## Local checks

```bash
npm run test:task-proof
npm run check:task-proof
```

The tests use Node's built-in test runner. They do not require a browser.

Git snapshot evidence is structured and must match repository, branch, base/head, dirty state, digest, and binding revision; a revision string by itself is not enough.
