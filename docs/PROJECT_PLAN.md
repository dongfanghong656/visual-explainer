# Project plan

## Workstreams

| Workstream | Goal | Tasks | Exit gate | State |
|---|---|---|---|---|
| W1 Baseline and architecture | Select a mature visual project and define additive fork boundary | TASK-0001 | Decision and branch established | DONE |
| W2 Protocol and trust model | Specify author/reviewer bundles, evidence, status, and overclaim prevention | TASK-0002 | Examples validate; rules trace to requirements | DONE |
| W3 Deterministic engine | Implement validators, Git snapshot, renderer, examples, and tests | TASK-0003 | Controlled tests and browser render pass | DONE |
| W4 Skill/MCP integration | Register tools/resources/prompts and update distribution docs/metadata | TASK-0004 | Syntax and source registration checks pass | DONE_WITH_LIMITATION |
| W5 Acceptance and release | Clean install, MCP stdio E2E, host matrix, independent review, release decision | TASK-0005 | Required acceptance gates pass | ACTIVE_BLOCKED |

## Validation strategy

- Structural: JSON parsing, JSON Schema validation, Node syntax.
- Behavioral: Node tests for validator, stale scope, reviewer independence, Git digest, rename provenance, renderer determinism, escaping, and dense-logic disclosure.
- Visual: Chromium render at 1440 px, horizontal-overflow scan, manual visual inspection.
- Integration: clean dependency install and MCP stdio client calls for all five Task Proof tools.
- External/independent: a separate reviewer run evaluates a real repository claim before release.

## Versioning and rollback

- Candidate version: `0.11.0-alpha.1`.
- No tag or release until TASK-0005 gates pass and a release decision is recorded.
- Rollback is branch/commit reversion; Task Proof is additive and can be removed without changing upstream generic tools.
- Generated claim/review files are not authoritative source code and should not be used to repair implementation automatically.

## Sequencing

TASK-0005 is the only active implementation task. Do not add unrelated features before the clean-install E2E gap is resolved, unless a blocking defect in the current protocol or engine is discovered.
