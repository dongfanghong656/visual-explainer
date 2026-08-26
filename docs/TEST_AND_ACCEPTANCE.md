# Test and acceptance record

## Durable evidence

| ID | Check | Result | Environment / locator | Scope and limitation |
|---|---|---|---|---|
| EVD-0001 | `npm run check:task-proof` / Node syntax and Task Proof test suite | PASS | Node 22.16.0; local candidate files | 34 controlled tests; MCP server source syntax-checked; runtime import and stdio not executed |
| EVD-0002 | Git snapshot integration tests | PASS | temporary local Git repositories | clean/dirty digest stability, changed untracked content, rename provenance, workspace escape |
| EVD-0003 | JSON parsing and Draft 2020-12 schema validation of state/schema/examples | PASS | Python JSON tooling/jsonschema in current container | Examples and project state only; not exhaustive schema/validator equivalence |
| EVD-0004 | Deterministic HTML generation and Chromium visual/overflow inspection | PASS | system Chromium via Playwright `set_content`, viewport 1440×1000 | claim/review examples; full heights 4562/4714 px; no horizontal overflow or console/page errors; reviewer shows 10/10 logic subjects. Local PNG SHA-256: claim `5f184351…`, review `3a5f2cc3…`; one browser/environment |
| EVD-0005 | Secret-oriented source scan and package-content consistency checks | PASS | 57 UTF-8 candidate files; `npm pack --dry-run --json` | 0 matches for private-key/token/credential patterns; package dry-run included 22 files and every required Task Proof runtime/command file. Local pattern scan is not a platform-wide security review |
| EVD-0006 | `npm run verify:task-proof` after CI repair | PASS | Windows; Node 24.14.1; isolated Git repository; 2026-08-26 | Syntax/JSON checks pass; 54 tests pass, 0 fail, 4 Windows-only capability skips; six MCP tools and a real stdio snapshot handshake pass. Linux Node 20/22 CI remains required for remote acceptance |

## Automated cases

The Node suite covers:

- valid author and reviewer examples;
- missing criterion evidence and active blockers;
- exact repository/branch/base/head/dirty/digest Git-snapshot requirements;
- author release/acceptance overclaim rejection and external-evidence producer rules;
- same-run reviewer rejection;
- stale repository, branch, and head detection;
- reviewer snapshot binding plus substantive-evidence requirements that reject snapshot-only or claim-reference-only behavioral verification;
- accepted review requiring every criterion, event, and invariant independently verified;
- deterministic rendering, claim semantics, review overlay, favicon, escaping;
- static MCP integration checks for preserved/new tool registration, Task Proof resources/prompts, aligned metadata versions, and JSON-before-HTML persistence order;
- dense-diagram omission disclosure plus complete event registry;
- Git committed/dirty state, digest changes, rename provenance, workspace escape.

## Acceptance gates

| Gate | Result | Evidence | Limitation/action |
|---|---|---|---|
| G1 Repository identity | PASS | branch/base records; current GitHub readback planned | Same-commit SHA pending self-reference |
| G2 Stable IDs | PASS | project indexes and automated duplicate scan | Recheck next turn after new IDs |
| G3 Requirement quality | PASS | REQ-0001–REQ-0005 | — |
| G4 Spec coverage | PASS | SPEC-0001 and matrix | — |
| G5 Plan/task executability | PASS | project plan; TASK-0005 exact next work | External dependency environment required |
| G6 Traceability | PASS for development / FAIL for release | traceability matrix | Release evidence chain incomplete |
| G7 Artifact honesty | PASS | artifact registry | ART-0004 remains STATIC_CHECKED |
| G8 Evidence validity | PASS | EVD-0001–EVD-0005 | Controlled/synthetic/local limits recorded |
| G9 Release readiness | BLOCKED | EVD-0006; TASK-0005 | Local MCP E2E now passes; Linux matrix and independent candidate review remain |
| G10 Turn transaction | PENDING until remote readback | TURN-0002 | Must verify exact commit/state/turn after push |

## Current acceptance conclusion

Core Task Proof modules and the local MCP stdio path are a tested development candidate. The package is not yet release-ready or released. The release gate remains `BLOCKED` by the pending Linux Node 20/22 run, independent real-candidate review, broader host evidence, and an unresolved decision on RSK-0003.
