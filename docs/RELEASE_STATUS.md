# Release status

## REL-0001 — 0.11.0-alpha.1 development candidate

- Candidate version: `0.11.0-alpha.1`
- Release state: PROVISIONAL
- Release decision: BLOCKED
- Tag/release: none
- Branch: `chat/task-proof-visualizer/v0.1.0`
- Base revision: `df35d97a00191d8aba831e757a65dd6ce0514fc0`
- Candidate commit: `PENDING_SELF_REFERENCE`

## Included candidate scope

- Task Proof Protocol 1.0 and JSON Schema;
- author/reviewer examples;
- executable validator and Git snapshotter;
- deterministic author/review HTML renderer;
- five MCP tools, resources, prompts, and two command workflows;
- skill/README/changelog/package/marketplace updates;
- controlled tests and project governance.

## Release blockers

1. Clean dependency installation and real MCP stdio handshake are not evidenced.
2. A separate reviewer has not accepted a real author claim for the exact candidate commit.
3. Multi-host compatibility is not assessed.
4. RSK-0003 requires a fix or explicit alpha acceptance decision.

## Promotion requirements

A release/tag requires TASK-0005 completion, exact candidate evidence, no unresolved release blocker, updated changelog/release notes, rollback statement, artifact identity/checksums as applicable, and explicit approval. A draft PR or green local unit tests alone are not release proof.
