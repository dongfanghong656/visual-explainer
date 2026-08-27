# Traceability matrix

| Requirement | Specification | Tasks | Main artifacts | Evidence state | Current gate | Release consequence |
|---|---|---|---|---|---|---|
| REQ-0001 | SPEC-0001, SPEC-0002, SPEC-0004 | TASK-0002–0005, TASK-0007 | Contract-bound Claim/Review, MCP/Skill | Local and exact-head remote public-path tests pass | PASS_WITH_LIMITS | Independent acceptance missing |
| REQ-0002 | SPEC-0001–SPEC-0004 | TASK-0002–0007 | Strict Review, contract binding, reviewer adapters | Same-context development only | BLOCKED | No final acceptance |
| REQ-0003 | SPEC-0001, SPEC-0004 | TASK-0003, TASK-0007 | One-screen status/change/review renderer | Contract overlay tests pass locally | PASS_WITH_LIMITS | No direct release promotion |
| REQ-0004 | SPEC-0001–SPEC-0004 | TASK-0003–0007 | Snapshot, receipts, artifacts, adapters | Exact-head Node 20/22 CI and locked packed-install test pass | PASS_WITH_LIMITS | Release install readback pending |
| REQ-0005 | SPEC-0001, SPEC-0004 | TASK-0001, TASK-0004, TASK-0005, TASK-0007 | Package, Skill, MCP, docs | GitHub prerelease workflow and clean artifact handshake pass locally | PENDING_PUBLICATION | No release exists yet |
| REQ-0006 | SPEC-0002–SPEC-0004 | TASK-0006, TASK-0007 | Strict runtime, identity, verifier-bound gates | Public path and default-deny registry pass exact-head CI | PASS_WITH_LIMITS | Independent review pending |
| REQ-0007 | SPEC-0003, SPEC-0004 | TASK-0006, TASK-0007 | Contract runtime/schema/receipts/public path | Protocol 2.4 is mandatory and CI verified | PENDING_REVIEW | Independent R2/R3 acceptance missing |

## Release-blocking gaps

- independent R2/R3 review of the exact integrated candidate;
- PR #4 integration into `main`, release tag, GitHub prerelease publication, and downloaded-artifact installation readback.

Trusted non-repository external authority adapters remain outside the repository-authority alpha release scope. Contracts that need them remain capped at `INCONCLUSIVE`; their absence is not represented as a supported external `PASS`.
