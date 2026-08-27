# Project plan

## Workstreams

| Workstream | Goal | Tasks | Exit gate | State |
|---|---|---|---|---|
| W1 Baseline and architecture | Select a mature visual project and define additive fork boundary | TASK-0001 | Decision and branch established | DONE |
| W2 Protocol and trust model | Specify author/reviewer bundles, evidence, status, and overclaim prevention | TASK-0002 | Examples validate; rules trace to requirements | DONE |
| W3 Deterministic engine | Implement validators, snapshots, renderer, artifacts, and tests | TASK-0003 | Controlled/adversarial tests pass | DONE_WITH_LIMITS |
| W4 Skill/MCP integration | Register tools, resources, prompts, and distribution metadata | TASK-0004 | Public alpha surface starts and remains additive | ALPHA_DEPLOYED_WITH_LIMITS |
| W5 Runtime hardening | Converge on one strict runtime and content-bound evidence identity | TASK-0005, TASK-0006 | Exact-head CI and no weaker parallel path | CI_VERIFIED |
| W6 Frozen task authority | Prevent claimant-selected acceptance sets and verifier laundering | TASK-0006 | Contract core passes exact-head CI/readback | CI_VERIFIED |
| W7 Mandatory public enforcement | Route every public Author/Reviewer path through the contract core | TASK-0007 | Negative public-entrypoint tests and independent R2/R3 acceptance | ALPHA_DEPLOYED_R2_PASS_WITH_LIMITS |
| W8 Release decision | Merge, tag, publish, or remain blocked based on explicit release evidence | TASK-0005 | No unresolved alpha blocker and explicit approval | GITHUB_PRERELEASE_DEPLOYED |

## Critical path

```text
locked package and release-artifact verification
        ↓
independent R2/R3 review and reconciliation
        ↓
clean installation and visual/export review
        ↓
merge decision
        ↓
GitHub prerelease, clean artifact installation, and Codex registration
```

Generated diagrams, passing author tests, or draft PRs do not by themselves advance the release state.
