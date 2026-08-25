---
name: task-proof
description: Produce an evidence-gated visual declaration of what an AI agent completed
---

Load the visual-explainer skill and enter **Task Proof author mode**. Read `./task-proof/PROTOCOL.md`, `./task-proof/schema.json`, and the author example before making any completion statement.

Interpret `$@` as an optional task ID or task-file path, Git base/range, and output name. Resolve ambiguity from repository task/spec files and Git state before asking the user. This command is for the implementation agent that performed the work; it does not perform independent acceptance.

## Non-negotiable trust boundary

- The author may declare only `claimed-complete`, `claimed-partial`, `blocked`, or `not-claimed`.
- Never label author output `verified`, `accepted`, `ACCEPTANCE_PASSED`, `RELEASE_READY`, `RELEASE_CANDIDATE`, or `RELEASED` merely because code exists or author-run tests pass.
- Amber represents an author claim. Green is reserved for a separate `task-review` bundle produced by a different reviewer run.
- Do not silently omit unfinished, blocked, uncertain, or untested work.
- A diagram is a view of the JSON evidence bundle, not evidence by itself.

## 1. Recover the task contract

Read the applicable requirements, spec, task, plan, acceptance criteria, project instructions, and latest handoff/checkpoint. Also read the exact changed files and the surrounding code needed to understand behavior. Establish:

- task objective and declared scope;
- measurable acceptance criteria with stable IDs;
- allowed exclusions and non-goals;
- expected evidence and required external validation;
- artifact maturity axes, independently assessed.

When no durable task contract exists, derive a provisional contract from the latest explicit user request and mark its provenance. Do not invent acceptance criteria that make the work easier to pass.

## 2. Bind the declaration to exact repository state

Call `task_proof_git_snapshot` before constructing the bundle. Supply the repository-relative workspace and a meaningful `baseRef` when known. Record the returned repository identity, branch, base revision, head revision, dirty flag, changed files, and snapshot digest. Copy those structured scope fields into the `git-snapshot` evidence entry; do not reduce it to an unstructured locator or revision string.

If the worktree is dirty, the claim must include the exact 64-character snapshot digest. If repository state changes after evidence collection, collect a new snapshot and invalidate stale evidence.

## 3. Reconstruct the change logic

Do not summarize by file order. Build one causal model that explains:

1. the old behavior or failure chain;
2. the state, ownership, or control-flow change introduced;
3. the new normal path;
4. concurrency, invalidation, interruption, fallback, and error paths;
5. invariants that must remain true;
6. the termination condition or point where control is yielded.

Every actor must represent a stable responsibility or state owner. Every arrow must be a labeled event, state transition, read/write, cancellation, or verification action. Bind important events and invariants to evidence IDs. Keep the primary diagram to at most eight actors and sixteen events; move detail into tables rather than making an unreadable graph.

## 4. Build the author claim bundle

Create a `task-claim` JSON object conforming to `./task-proof/schema.json`. The bundle must include:

- exact project and Git scope;
- author run identity;
- task objective and acceptance criteria;
- one-sentence change thesis;
- actors, causal events, invariants, and termination;
- Done / Doing / Next / Blocked work lanes;
- durable evidence registry;
- risks, unknowns, completion claim, and four-axis artifact status.

For every item in Done and every `claimed-pass` criterion, cite at least one evidence item. A `claimed-complete` bundle requires all criteria to be `claimed-pass`, no Doing or Blocked items, and at least one objective evidence type. Any Next item must explicitly explain why it is outside the current acceptance scope. Unit tests prove only their tested scope; do not promote external, hardware, user, release, or scientific validation without corresponding evidence.

## 5. Validate, then render

Call `task_proof_validate_claim`. Resolve every error by fixing the bundle or honestly downgrading the completion claim; never bypass validation. Preserve warnings in the uncertainty boundary when they matter.

Then call `task_proof_render_claim` with an output filename ending in `.html`. The MCP writes both the deterministic HTML and a sibling `.task-proof.json` source bundle under `~/.agent/diagrams/`. Use the MCP-rendered output rather than hand-writing a prettier replacement, because deterministic rendering preserves status semantics and evidence references.

## 6. Completion language

Only after validation and rendering, report:

- exact claim ID and Git scope;
- `claimed-complete`, `claimed-partial`, or `blocked`;
- artifact status axes;
- evidence that passed and evidence still missing;
- paths to the HTML and JSON bundle;
- that independent review has or has not been performed.

Never say simply “completed” when the actual state is an unreviewed author declaration. Recommend `/task-proof-review <claim-json>` as the acceptance step.
