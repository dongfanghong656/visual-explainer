# Handoff

## Current objective

Activate and observe the repaired dual-MCP local Codex integration without overstating its accepted limitations.

## Repository state

- Repository: `dongfanghong656/visual-explainer`
- Main recovery branch: `chat/task-proof-visualizer/v0.1.0-recovery`
- Public-enforcement branch: `stage/task-proof-visualizer/turn-0004-public-enforcement`
- Starting revision for TURN-0004 repair/improvement: `598006bc322cb7cb220085c63f46a71a263f4636`
- Superseded/closed integration PR: `#2`
- Superseded/closed stacked contract PR: `#3`
- Merged combined public/release PR: `#4`
- Current turn: `TURN-0006`
- Current checkpoint: `CHK-0006`
- Result commit: `PENDING_SELF_REFERENCE`
- Public release merge commit: `d83a07290b2658c2936d6040c7ff4f60316b6930`
- Release: `GITHUB_PRERELEASE_PUBLISHED_AND_CODEX_DEPLOYED_WITH_R2_LIMITS`
- Local integration repair branch: `codex/local-codex-integration-repair-v011`
- Repair base revision: `b132b432bb411f2e768e3e0e95fe95bc07600e62`

## Implemented candidate

- frozen contracts are mandatory for public Claim and Review tools;
- public Claim, Review, renderer, artifacts, and strict final gate share one contract-bound path;
- four repository-owned verifier kinds resolve from an immutable server-owned registry;
- unclassified future `task_proof_*` tools fail before registration;
- Task Proof Skill/commands document the contract-first sequence and provisional cap;
- npm-link direct execution resolves junction targets and the installed Task Proof binary completes a real stdio handshake.
- the dependency graph is lockfile-defined for CI/release, optional non-core hosts are omitted from the default deployment, and a clean packed artifact completes the same eight-tool handshake;
- a tag-triggered workflow verifies the full source/test/MCP/package/audit gate before creating a GitHub prerelease.
- the general renderer and Task Proof Skills declare separate MCP dependencies, both active local server registrations point at the installed release package, and fresh-session verification live-called the renderer.

## Verification boundary

- PR #4 HEAD `f1f665d` passed the release-delta exact-head Node 20 and Node 22 checks plus the separate R2 review in run `33077129005`.
- R2 returned `PASS_WITH_LIMITS`: automated CI isolation does not prove a different human/model, and unsupported external authority adapters remain capped at `INCONCLUSIVE`.
- Final PR head `96afc5f` passed Node 20/22 and R2 in run `33077809112`; PR #4 merged as `d83a072`.
- Tag run `33077966508` published `v0.11.0-alpha.1`; the downloaded asset digest matched GitHub, the normal global install served all eight tools, the Skill is installed, and Codex lists the MCP as enabled.
- Current development and review are from the same long-running implementation context.
- TURN-0006 source verification covers 109 strict tests with 105 passing and 4 Windows capability skips; both Skill validators and both source/packed MCP handshakes pass.
- A fresh ephemeral Codex CLI session exposed `visual-explainer` and called `visual_explainer_prepare`; the already-running desktop task was not hot-loaded.
- The public alpha is deployed on this Codex host; hardware validation, scientific validation, stable promotion, and long-term user-outcome observation do not exist.

## Open limitations

- a different-human/model R3 review remains absent and is an accepted alpha limitation;
- RSK-0005 and RSK-0007 remain disclosed alpha limitations; unsupported external authority cannot produce `PASS`.

## Exact next action

Restart Codex desktop, open a normal new task, confirm both servers in `/mcp`, and observe whether a genuinely visual request selects the general renderer; retain R3 and stable-promotion limits.
