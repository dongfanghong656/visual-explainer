# Project plan

## Workstreams

| Workstream | Goal | Tasks | Exit gate | State |
|---|---|---|---|---|
| W1 Baseline and architecture | Select a mature visual project and define additive fork boundary | TASK-0001 | Decision and branch established | DONE |
| W2 Protocol and trust model | Specify author/reviewer bundles, evidence, status, and overclaim prevention | TASK-0002 | Examples validate; rules trace to requirements | DONE |
| W3 Deterministic engine | Implement validators, snapshots, renderer, artifacts, and tests | TASK-0003 | Controlled/adversarial tests pass | DONE_WITH_LIMITS |
| W4 Skill/MCP integration | Register tools, resources, prompts, and distribution metadata | TASK-0004 | Public alpha surface starts and remains additive | DONE_WITH_LIMITS |
| W5 Runtime hardening | Converge on one strict runtime and content-bound evidence identity | TASK-0005, TASK-0006 | Exact-head CI and no weaker parallel path | IMPLEMENTED_PENDING_REMOTE_CI |
| W6 Frozen task authority | Prevent claimant-selected acceptance sets and verifier laundering | TASK-0006 | Contract core passes exact-head CI/readback | IMPLEMENTED_PENDING_REMOTE_CI |
| W7 Mandatory public enforcement | Route every public Author/Reviewer path through the contract core | TASK-0007 | Negative public-entrypoint tests and independent R2/R3 acceptance | IMPLEMENTED_PENDING_REVIEW |
| W8 Release decision | Merge, tag, publish, or remain blocked based on explicit release evidence | TASK-0005 | No unresolved blocker and explicit approval | BLOCKED |

## Critical path

```text
combined public-enforcement exact-head CI/readback
        ↓
independent R2/R3 review and reconciliation
        ↓
clean installation and visual/export review
        ↓
merge decision
        ↓
separate release/publication/deployment decision
```

Generated diagrams, passing author tests, or draft PRs do not by themselves advance the release state.
