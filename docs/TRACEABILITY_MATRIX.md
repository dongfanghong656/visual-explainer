# Traceability matrix

| Requirement | Specification | Tasks | Main artifacts | Evidence state | Current gate | Release consequence |
|---|---|---|---|---|---|---|
| REQ-0001 | SPEC-0001, SPEC-0002, SPEC-0004 | TASK-0002–0005, TASK-0007 | Contract-bound Claim/Review, MCP/Skill | Local public-path tests pass | PASS_WITH_LIMITS | Independent acceptance missing |
| REQ-0002 | SPEC-0001–SPEC-0004 | TASK-0002–0007 | Strict Review, contract binding, reviewer adapters | Same-context development only | BLOCKED | No final acceptance |
| REQ-0003 | SPEC-0001, SPEC-0004 | TASK-0003, TASK-0007 | One-screen status/change/review renderer | Contract overlay tests pass locally | PASS_WITH_LIMITS | No direct release promotion |
| REQ-0004 | SPEC-0001–SPEC-0004 | TASK-0003–0007 | Snapshot, receipts, artifacts, adapters | Local suite/stdio/package/link checks pass; remote CI pending | PENDING_REMOTE | Release remains blocked |
| REQ-0005 | SPEC-0001, SPEC-0004 | TASK-0001, TASK-0004, TASK-0005, TASK-0007 | Package, Skill, MCP, docs | Local linked binary deployment passes | PASS_WITH_LIMITS | No publication/release claim |
| REQ-0006 | SPEC-0002–SPEC-0004 | TASK-0006, TASK-0007 | Strict runtime, identity, verifier-bound gates | Public path uses strict finalizer and default-deny registration | PENDING_REMOTE | Exact-head CI still required |
| REQ-0007 | SPEC-0003, SPEC-0004 | TASK-0006, TASK-0007 | Contract runtime/schema/receipts/public path | Protocol 2.4 is mandatory locally | PENDING_REMOTE_REVIEW | Independent R2/R3 acceptance missing |

## Release-blocking gaps

- final PR #4 Node 20/22 readback for the exact staging HEAD;
- trusted non-repository external authority adapters;
- independent R2/R3 review of the exact integrated candidate;
- merge, tag, publication, deployment, hardware, scientific, and user-outcome evidence as applicable.
