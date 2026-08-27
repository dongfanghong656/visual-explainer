# Handoff

## Current objective

Finish release-hardening exact-head verification, obtain a genuinely distinct R2/R3 review, integrate PR #4 into `main`, and deploy the verified GitHub prerelease into Codex.

## Repository state

- Repository: `dongfanghong656/visual-explainer`
- Main recovery branch: `chat/task-proof-visualizer/v0.1.0-recovery`
- Public-enforcement branch: `stage/task-proof-visualizer/turn-0004-public-enforcement`
- Starting revision for TURN-0004 repair/improvement: `598006bc322cb7cb220085c63f46a71a263f4636`
- Draft integration PR: `#2`
- Draft stacked contract PR: `#3`
- Ready combined public/release PR targeting `main`: `#4`
- Current turn: `TURN-0005`
- Current checkpoint: `CHK-0005`
- Result commit: `PENDING_SELF_REFERENCE`
- Release: `USER_AUTHORIZED_R2_PASS_WITH_LIMITS_PENDING_MERGE_TAG`

## Implemented candidate

- frozen contracts are mandatory for public Claim and Review tools;
- public Claim, Review, renderer, artifacts, and strict final gate share one contract-bound path;
- four repository-owned verifier kinds resolve from an immutable server-owned registry;
- unclassified future `task_proof_*` tools fail before registration;
- Task Proof Skill/commands document the contract-first sequence and provisional cap;
- npm-link direct execution resolves junction targets and the installed Task Proof binary completes a real stdio handshake.
- the dependency graph is lockfile-defined for CI/release, optional non-core hosts are omitted from the default deployment, and a clean packed artifact completes the same eight-tool handshake;
- a tag-triggered workflow verifies the full source/test/MCP/package/audit gate before creating a GitHub prerelease.

## Verification boundary

- PR #4 HEAD `f1f665d` passed the release-delta exact-head Node 20 and Node 22 checks plus the separate R2 review in run `33077129005`.
- R2 returned `PASS_WITH_LIMITS`: automated CI isolation does not prove a different human/model, and unsupported external authority adapters remain capped at `INCONCLUSIVE`.
- Current development and review are from the same long-running implementation context.
- Local npm-linked and clean temporary package deployments exist; no merge, tag, public release, downloaded-asset deployment, hardware validation, scientific validation, or user-outcome observation exists yet.

## Open blockers

- a different-human/model R3 review remains absent and is an accepted alpha limitation;
- `main` integration, tag workflow, and public-asset readback remain incomplete;
- RSK-0005 and RSK-0007 remain disclosed alpha limitations; unsupported external authority cannot produce `PASS`.

## Exact next action

Push this R2 evidence update, require Node 20/22 plus the distinct R2 job to pass for its exact PR #4 HEAD, then merge, tag, publish, download, install, and read back the public artifact.
