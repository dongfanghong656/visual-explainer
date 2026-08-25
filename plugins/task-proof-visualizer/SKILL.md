---
name: task-proof-visualizer
description: Create evidence-backed one-page diagrams of what an AI changed, what is actually complete, what remains, and where producer and reviewer disagree. Use after implementation turns, before handoff or release, during code review, or whenever an AI completion claim must be made auditable.
---

# Task Proof Visualizer

Turn an AI's completion narrative into a bounded, independently reviewable proof package and a one-page diagram.

This skill has three modes:

- **Producer** — the implementation AI states what it believes it completed and cites primary evidence.
- **Reviewer** — a different AI reconstructs the same task from the frozen repository checkpoint and independently accepts, downgrades, rejects, or leaves each claim unverified.
- **Reconciliation** — compare the two manifests and display agreements, disputes, missing evidence, remaining work, and the next checkpoint.

The diagram is a view of structured evidence. It is never the source of truth.

## Non-negotiable rules

1. Freeze `repository`, `branch`, `base`, and `head` before evaluating completion.
2. A chat statement, plan checkbox, generated summary, or producer-authored diagram is self-report, not proof.
3. A behavioral/code claim marked `done` needs both:
   - primary implementation evidence: commit, diff, file, or artifact;
   - primary verification evidence: test, build, runtime observation, trace, or independent review.
4. Every `done` claim links to at least one falsifiable acceptance criterion, and all linked criteria must pass.
5. The reviewer must read repository evidence independently before reading the producer's rationale when practical.
6. Do not let the producer rewrite acceptance criteria after seeing failures without recording the decision.
7. Do not collapse unknown, blocked, partial, or failed work into `done` to simplify the picture.
8. Never infer release, deployment, merge, publication, or real-world effectiveness from code existence alone.
9. The one-page diagram must show checkpoint identity, evidence status, remaining work, and uncertainty.
10. Preserve machine-readable JSON next to every human-readable diagram.

Read these references before operating:

- `references/CLAIM_PROTOCOL.md`
- `references/EVIDENCE_POLICY.md`
- `references/REVIEW_PROTOCOL.md`
- `references/DIAGRAM_GRAMMAR.md`
- `references/SECURITY.md`

## Required artifacts

Write the following beneath `.task-proof/` or the project's approved evidence directory:

```text
TASK_PROOF.producer.json
TASK_PROOF.producer.md
TASK_PROOF.producer.mmd
TASK_PROOF.producer.validation.json
TASK_PROOF.reviewer.json
TASK_PROOF.reviewer.md
TASK_PROOF.reviewer.mmd
TASK_PROOF.reviewer.validation.json
TASK_PROOF.reconciliation.json
TASK_PROOF.reconciliation.mmd
```

A producer-only run is provisional. A claim becomes independently verified only after reviewer reconciliation.

## Producer workflow

### 1. Restore the task contract

Read the requirement, specification, task list, decisions, and acceptance criteria. Resolve ambiguous pronouns and identify the exact task boundary. Do not broaden the task simply because adjacent improvements are visible.

Record:

- task ID and title;
- objective;
- in-scope and out-of-scope behavior;
- acceptance criteria fixed before implementation;
- declared dependencies and blockers.

### 2. Freeze a checkpoint

Capture:

- repository identity;
- branch;
- base ref or commit;
- head commit;
- dirty worktree status;
- changed-file list and diff stat;
- hashes of named reports or artifacts.

Use `task_proof_snapshot`. It performs only bounded, read-only Git inspection and hashes explicitly named evidence files. It does not run arbitrary commands.

If the working tree is dirty, distinguish committed evidence from uncommitted evidence. Never describe uncommitted work as merged or released.

### 3. Decompose into bounded claims

A claim must be small enough that one reviewer can falsify it from evidence. Prefer one runtime behavior or one deliverable per claim.

Bad:

> The entire system is production-ready.

Better:

> When a user input invalidates generation N, the queued generation-N correction exits before writing `scrollTop`.

Each claim records:

- stable claim ID;
- title and one-sentence summary;
- category;
- claimed status;
- linked acceptance IDs;
- evidence IDs;
- blockers, dependencies, risks, and unknowns.

### 4. Collect evidence

Evidence is a locator plus a compact factual summary, not a pasted repository dump.

Prefer:

- immutable commit SHA;
- base/head diff range;
- file path plus line or symbol;
- machine-readable test/build report;
- runtime trace tied to a checkpoint;
- artifact digest;
- independent review finding.

Record failed and contradictory evidence. Evidence selection must not hide relevant failures.

### 5. Validate before drawing

Call `task_proof_validate`.

Do not manually override its verdict. Fix the manifest or change the claim status. A validator result of `unverified`, `partial`, `contradicted`, or `invalid` must remain visible.

### 6. Render the producer view

Call `task_proof_render` or `task_proof_write_bundle`.

Use:

- `status` for what is verified, partial, blocked, next, or unknown;
- `change_logic` when the task is primarily a mechanism or behavioral change.

The existing `visual-explainer` skill may render the resulting Mermaid into self-contained HTML, SVG, or PNG. Do not modify the semantics during visual polishing.

### 7. Report a bounded status code

Use one status:

- `PRODUCER_CLAIM_VERIFIED` — producer validator found all claims and acceptance criteria structurally verified; independent review still pending.
- `PRODUCER_CLAIM_PARTIAL` — some progress is evidenced, but the task is incomplete or not fully verified.
- `PRODUCER_CLAIM_CONTRADICTED` — cited evidence contains a failure or failed criterion.
- `PRODUCER_CLAIM_INVALID` — manifest violates the protocol.

Never shorten `PRODUCER_CLAIM_VERIFIED` to “completed and approved.”

## Reviewer workflow

### 1. Preserve independence

Use a separate context or agent where possible. Freeze the same repository, branch, base, and head. If the checkpoint differs, stop and report `REVIEW_CHECKPOINT_MISMATCH`.

Read in this order when practical:

1. requirement and acceptance contract;
2. repository and diff;
3. tests, reports, traces, and artifacts;
4. producer claim manifest;
5. producer narrative and diagram last.

This order reduces anchoring on the producer's story.

### 2. Reconstruct claims

The reviewer uses the producer's stable claim IDs for comparable claims, but may add reviewer-only claims for omissions.

For each claim choose `reviewDisposition`:

- `accepted`;
- `partial`;
- `rejected`;
- `unverified`.

Cite independent evidence. Reusing the producer's evidence locator is allowed only after reopening and checking it.

### 3. Challenge the strongest interpretation

Review at least:

- acceptance-criterion coverage;
- old behavior versus new behavior;
- normal path and failure path;
- asynchronous/cancellation boundaries where relevant;
- compatibility and migration effects;
- security and path boundaries;
- whether tests prove behavior rather than merely execute code;
- claims of merge, release, deployment, performance, or real-world success.

### 4. Validate and render

Run `task_proof_validate` on the reviewer manifest and render a reviewer view. Preserve failures and uncertainty.

Reviewer status codes:

- `REVIEW_ACCEPTED` — all in-scope claims independently verified at the same checkpoint.
- `REVIEW_PARTIAL` — at least one claim remains partial, missing, blocked, or unverified.
- `REVIEW_REJECTED` — at least one material claim is contradicted.
- `REVIEW_INVALID` — reviewer manifest or checkpoint is invalid.

## Reconciliation workflow

1. Call `task_proof_compare` with producer and reviewer manifests.
2. Call `task_proof_render_review` for the one-page comparison.
3. Do not average conflicting verdicts.
4. For every downgrade or dispute, create a concrete next action with an owner and acceptance evidence needed to close it.
5. Preserve both manifest digests and the repository checkpoint.

Final status codes:

- `TASK_PROOF_ACCEPTED` — producer and reviewer agree on every in-scope claim and all acceptance criteria pass.
- `TASK_PROOF_DISPUTED` — at least one claim was downgraded, rejected, or contradicted.
- `TASK_PROOF_INCOMPLETE_REVIEW` — reviewer coverage is missing or checkpoint differs.
- `TASK_PROOF_INVALID` — one or both manifests are invalid.

## Diagram policy

The main diagram is a one-screen decision aid, not an exhaustive report.

It must include:

- objective;
- at most four verified-done claims;
- at most two active/partial claims;
- at most three blocked/contradicted claims;
- at most three next claims;
- up to two compact evidence notes per displayed claim;
- checkpoint and overall verdict.

Put full evidence and omitted claims in Markdown and JSON. Never remove a material blocker merely to fit one screen.

## Change-logic mode

When explaining a mechanism change, add `changeLogic` to the manifest:

```json
{
  "thesis": "Replace one-shot restoration with generation-isolated two-frame correction.",
  "before": [
    {"id": "B1", "event": "Write position before editor layout settles"},
    {"id": "B2", "event": "Later transaction changes geometry"},
    {"id": "B3", "event": "User sees the wrong anchor"}
  ],
  "after": [
    {"id": "A1", "event": "Create a new generation"},
    {"id": "A2", "event": "First frame restores approximate anchor"},
    {"id": "A3", "event": "Second frame remeasures and corrects"},
    {"id": "A4", "event": "Controller stops writing"}
  ],
  "interrupts": [
    {"id": "I1", "event": "User input bumps generation and invalidates queued work"}
  ],
  "invariants": [
    "Stale generations never write current state",
    "User intent outranks queued automatic correction"
  ]
}
```

Every path in this model still requires evidence in the claims and evidence sections.

## Completion boundary

This skill proves only what its evidence demonstrates at a named checkpoint. It does not prove:

- requirements that were never encoded;
- behavior outside the tested environment;
- absence of all defects;
- deployment or publication not directly observed;
- future compatibility;
- scientific validity without an appropriate validation protocol.

State those limits explicitly instead of treating them as boilerplate.
