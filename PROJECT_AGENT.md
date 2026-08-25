# Project agent contract

## Mission

Extend the MIT-licensed `visual-explainer` project with **Task Proof**: a reusable Skill and local MCP workflow in which an implementation agent creates an evidence-bound visual declaration of its work and a separate reviewer agent evaluates the same exact scope with independent evidence.

The project must make project changes understandable at the level of causal behavior—state ownership, event order, invalidation, interruption, fallback, invariants, and termination—not merely list changed files.

## Non-goals

- The schema or renderer does not prove semantic correctness by itself.
- A different run ID is not cryptographic identity or guaranteed model independence.
- This alpha does not replace a project tracker, CI system, human approval, or release process.
- The renderer does not grant release, hardware, production, user, security, performance, or scientific acceptance.
- Do not redesign unrelated upstream visual-explainer features.

## Sources of truth and precedence

1. The user's latest explicit instruction.
2. `AGENTS.md` and this contract.
3. Accepted requirements in `docs/requirements/`.
4. The current specification in `docs/specs/`.
5. Accepted decisions, then tasks and handoff.
6. Turn/checkpoint history.
7. Model inference.

Machine recovery starts at `.ai/PROJECT_STATE.json`. The protocol source is `plugins/visual-explainer/task-proof/PROTOCOL.md`; the machine contract is `schema.json` plus the executable validator. When schema and validator disagree, stop, record the drift, and reconcile both before release.

## Operating workflow

1. Recover repository identity, branch HEAD, project state, checkpoint, active requirements/spec/tasks, risks, and the prior next action.
2. Normalize each user request into stable requirement/spec/task/artifact/decision/risk deltas.
3. Work on a managed branch; do not write directly to `main` without explicit policy.
4. Preserve upstream compatibility unless an accepted requirement says otherwise.
5. Update implementation and evidence together.
6. Run applicable static checks, protocol tests, schema validation, browser rendering checks, and—when dependencies are available—an end-to-end MCP stdio handshake.
7. Update indexes, traceability, artifact status, release status, handoff, checkpoint, turn record, manifest, and project state.
8. Re-read the resulting commit and key state files before reporting `SYNCED`.

## Task Proof trust boundary

- Author agents may emit only `claimed-complete`, `claimed-partial`, `blocked`, or `not-claimed`.
- Author criterion results remain `claimed-*` and use amber visual semantics.
- Reviewer agents must use a distinct run ID, recollect scope, execute or inspect independently, and cover every acceptance criterion.
- Green is reserved for reviewer-owned verification of the exact scope.
- Scope change makes a prior claim stale.
- `git-snapshot` and `claim-reference` evidence establish scope/context only and cannot independently verify or contradict a criterion or mechanism claim.
- A diagram is a deterministic projection of a JSON bundle, not evidence.
- Any unsupported or untested behavior remains visible as a risk, unknown, blocked item, or `not-assessed` result.

## Write boundaries

The Task Proof extension may change:

- `plugins/visual-explainer/task-proof/**`;
- the two Task Proof command prompts;
- MCP registration and MCP documentation;
- canonical skill, package/marketplace metadata, README, changelog;
- project governance under `.ai/` and `docs/`.

Do not alter upstream rendering/templates/PPTX/Pi behavior unless needed for a traced requirement. Generated preview files under `.artifacts/` are local evidence and are not committed.

## Validation commands and evidence expectations

Minimum local gate for Task Proof changes:

```bash
npm run check:task-proof
```

Additional managed-turn checks:

```bash
python -m json.tool plugins/visual-explainer/task-proof/schema.json >/dev/null
python -m json.tool plugins/visual-explainer/task-proof/examples/scroll-restoration.claim.json >/dev/null
python -m json.tool plugins/visual-explainer/task-proof/examples/scroll-restoration.review.json >/dev/null
```

A candidate may be `TESTED` for the validator/snapshot/renderer modules when their controlled tests pass. The MCP integration remains `STATIC_CHECKED` until the declared package dependencies are installed and a real stdio client invokes all five Task Proof tools successfully.

## Completion language

Use the four independent artifact axes in `docs/ARTIFACT_REGISTRY.md`. Never collapse “file exists,” “tests pass,” “user usable,” and “released” into one status.

Forbidden without exact evidence:

- “fully complete” when an acceptance gate is blocked or not assessed;
- “MCP works end to end” based only on syntax checking;
- “independently verified” when the same run produced both author and review evidence;
- “release ready” or “released” without the recorded release gates, tag/publication, and approval.

## Branch, PR, and release policy

- Managed branch: `chat/task-proof-visualizer/v0.1.0`.
- Base branch: `main`.
- Prefer one logical commit per managed turn.
- Use a draft PR for milestone review; do not merge or tag automatically.
- Version `0.11.0-alpha.1` is a provisional development candidate, not a release.

## Privacy and excluded data

- Never place API keys, OAuth tokens, credentials, private transcripts, proprietary source excerpts, or sensitive runtime data in examples or Task Proof bundles.
- Git snapshot output exposes path names and repository identity but not patch bodies; still review it before sharing.
- Generated claim/review bundles should be copied into a repository only after privacy and secret review.

## Handoff behavior

Every managed handoff must identify exact branch/base/result revision, artifact axes, evidence boundaries, blockers, and exactly one next action. When commit self-reference cannot be written atomically, use `PENDING_SELF_REFERENCE` and reconcile it in the next managed turn rather than creating an endless metadata-only commit loop.
