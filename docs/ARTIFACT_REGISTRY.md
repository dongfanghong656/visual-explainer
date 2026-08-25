# Artifact registry

| ID | Path/scope | Version | Completeness | Usability | Verification | Release | Source | Evidence | Sync | Limitations |
|---|---|---|---|---|---|---|---|---|---|---|
| ART-0001 | `task-proof/PROTOCOL.md`, `schema.json`, examples | Protocol 1.0.0 | FULL | DEVELOPMENT_USABLE | TESTED | PROVISIONAL | REQ-0001–0004; TASK-0002 | EVD-0001–0003 | pending current commit | Executable/schema equivalence tested only on examples and targeted cases |
| ART-0002 | `validation.mjs`, `git-snapshot.mjs` | 0.11.0-alpha.1 | FULL | DEVELOPMENT_USABLE | TESTED | PROVISIONAL | REQ-0001,0002,0004; TASK-0003 | EVD-0001, EVD-0002 | pending current commit | No full-host MCP invocation; large repositories not performance-tested |
| ART-0003 | `render.mjs`, claim/review visual output | 0.11.0-alpha.1 | FULL | DEVELOPMENT_USABLE | TESTED | PROVISIONAL | REQ-0003,0004; TASK-0003 | EVD-0001, EVD-0004 | pending current commit | Browser check performed in controlled Chromium only |
| ART-0004 | MCP tools/resources/prompts and Task Proof commands | 0.11.0-alpha.1 | FULL | DEVELOPMENT_USABLE | STATIC_CHECKED | PROVISIONAL | REQ-0001,0002,0005; TASK-0004 | EVD-0001, EVD-0005 | pending current commit | Full stdio handshake/clean install not executed |
| ART-0005 | Project governance, traceability, handoff | 1.0.0 | FULL | DEVELOPMENT_USABLE | STATIC_CHECKED | PROVISIONAL | all; current turn | EVD-0003, EVD-0005 | pending current commit | Same-commit SHA remains `PENDING_SELF_REFERENCE` until next managed turn |

`FULL` describes the declared alpha file set, not user usability, acceptance, or release readiness.
