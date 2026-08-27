# Traceability matrix

| Requirement | Specification | Tasks | Main artifacts | Evidence state | Current gate | Release consequence |
|---|---|---|---|---|---|---|
| REQ-0001 | SPEC-0001, SPEC-0002 | TASK-0002–0005, TASK-0007 | Claim/Review core, MCP/Skill | Development evidence exists | PASS_WITH_LIMITS | Independent acceptance missing |
| REQ-0002 | SPEC-0001–SPEC-0003 | TASK-0002–0007 | Strict review and contract binding | Same-context development only | BLOCKED | No final acceptance |
| REQ-0003 | SPEC-0001 | TASK-0003, TASK-0007 | One-screen status/change/review renderer | Prior renderer checks; contract overlay pending | PASS_WITH_LIMITS | No direct release promotion |
| REQ-0004 | SPEC-0001–SPEC-0003 | TASK-0003–0007 | Snapshot, receipts, artifacts, contract core | Current PR exact-head CI pending readback | PENDING | Release remains blocked |
| REQ-0005 | SPEC-0001 | TASK-0001, TASK-0004, TASK-0005, TASK-0007 | Package, Skill, MCP, docs | Public alpha exists; mandatory contract route pending | BLOCKED | No package/release claim |
| REQ-0006 | SPEC-0002, SPEC-0003 | TASK-0006, TASK-0007 | Strict runtime, identity, verifier-bound gates | Contract staging candidate | PENDING | Weaker entrypoints must not be accepted |
| REQ-0007 | SPEC-0003 | TASK-0006, TASK-0007 | Contract runtime/schema/example/receipts | Protocol 2.4 staging candidate | PENDING | No contract-enforced acceptance yet |

## Release-blocking gaps

- final PR #3 Node 20/22 readback for the exact staging HEAD;
- mandatory contract enforcement in all public entrypoints;
- trusted external authority/evidence/lifecycle adapters;
- independent R2/R3 review of the exact integrated candidate;
- merge, tag, publication, deployment, hardware, scientific, and user-outcome evidence as applicable.
