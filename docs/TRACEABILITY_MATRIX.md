# Traceability matrix

| Requirement | Specification | Tasks | Main artifacts | Evidence state | Current gate | Release consequence |
|---|---|---|---|---|---|---|
| REQ-0001 | SPEC-0001, SPEC-0002, SPEC-0004 | TASK-0002–0005, TASK-0007 | Contract-bound Claim/Review, MCP/Skill | Exact-head, R2, tag, and deployed MCP tests pass | PASS_WITH_LIMITS | Repository-authority alpha deployed; no R3 |
| REQ-0002 | SPEC-0001–SPEC-0004 | TASK-0002–0007 | Strict Review, contract binding, reviewer adapters | Automated exact-head R2 `PASS_WITH_LIMITS` | PASS_WITH_LIMITS | No different-human/model R3 acceptance |
| REQ-0003 | SPEC-0001, SPEC-0004 | TASK-0003, TASK-0007 | One-screen status/change/review renderer | Contract overlay tests pass locally | PASS_WITH_LIMITS | No direct release promotion |
| REQ-0004 | SPEC-0001–SPEC-0004 | TASK-0003–0007 | Snapshot, receipts, artifacts, adapters | Exact-head Node 20/22, tag, and downloaded-install readback pass | PASS_WITH_LIMITS | Default alpha deployment verified |
| REQ-0005 | SPEC-0001, SPEC-0004 | TASK-0001, TASK-0004, TASK-0005, TASK-0007 | Package, Skill, MCP, docs | GitHub prerelease public; global package, Skill, and Codex MCP read back | ALPHA_DEPLOYED | Stable/npm-registry publication not claimed |
| REQ-0006 | SPEC-0002–SPEC-0004 | TASK-0006, TASK-0007 | Strict runtime, identity, verifier-bound gates | Public path/default-deny pass exact-head R2 and tag verification | PASS_WITH_LIMITS | External authority remains unsupported |
| REQ-0007 | SPEC-0003, SPEC-0004 | TASK-0006, TASK-0007 | Contract runtime/schema/receipts/public path | Protocol 2.4 mandatory; R2 and deployed public path verified | PASS_WITH_LIMITS | No different-human/model R3 acceptance |
| REQ-0008 | SPEC-0005 | TASK-0008 | Skill dependency metadata, dual local MCP registration, handshake clients | Source/packed/installed handshakes pass; fresh Codex CLI live-call pass | PASS_WITH_DESKTOP_RESTART_REQUIRED | Local host repair only; web and stable release unchanged |

## Alpha deployment boundary

No declared repository-authority alpha deployment gate remains. A different-human/model R3 review, trusted non-repository authority adapters, stable promotion, and observed long-term outcomes remain future gates.

Trusted non-repository external authority adapters remain outside the repository-authority alpha release scope. Contracts that need them remain capped at `INCONCLUSIVE`; their absence is not represented as a supported external `PASS`.
