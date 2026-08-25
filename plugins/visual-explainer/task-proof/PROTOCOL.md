# Task Proof Protocol 1.0

Task Proof turns an AI completion statement into a reviewable evidence bundle and a deterministic visual explanation. It separates three things that ordinary status summaries often collapse:

1. **author declaration** — what the implementing agent claims;
2. **durable evidence** — exact revisions, diffs, commands, tests, traces, files, and external observations;
3. **independent verdict** — what a separate reviewer run can reproduce or contradict.

The visual is a projection of the bundle. The JSON bundle is the source of truth.

## Roles and trust boundary

| Role | May state | Must not state |
|---|---|---|
| Author agent | `claimed-complete`, `claimed-partial`, `blocked`, `not-claimed` | `verified-complete`, independent acceptance, release approval |
| Reviewer agent | `accepted`, `partially-accepted`, `rejected`, `blocked`, `stale` | acceptance without independent evidence or exact-scope matching |
| MCP renderer | schema validity, deterministic status derivation, exact Git snapshot metadata | semantic correctness of code or tests it did not execute |
| Human/external system | external acceptance, hardware validation, production approval | inferred claims outside the evidence actually observed |

Green is reserved for independent verification. Author-pass and author-complete remain amber.

## Required author flow

1. Identify a stable task ID and measurable acceptance criteria before declaring completion.
2. Capture the Git scope with `task_proof_git_snapshot`.
3. Read every changed file needed to explain behavior, not only the diff summary.
4. Run the applicable tests, builds, linters, runtime traces, or external checks.
5. Create evidence entries whose locators can be revisited.
6. Describe the change as a causal model: actors, labelled events, invariants, cancellation/error paths, and termination.
7. Bind every author-pass criterion and every done item to evidence IDs.
8. Validate with `task_proof_validate_claim`.
9. Render with `task_proof_render_claim`.
10. Leave the claim amber until a separate reviewer run completes.

## Required reviewer flow

1. Read the claim JSON, but treat its conclusions as untrusted hypotheses.
2. Capture a fresh Git snapshot for the exact base/head and worktree digest.
3. Re-read the implementation and independently execute the acceptance checks.
4. Produce reviewer-owned evidence entries; author narrative is not independent evidence. A Git snapshot proves scope freshness, not behavior.
5. Review every acceptance criterion exactly once.
6. Mark the review `stale` when head/base/digest no longer match.
7. Use `accepted` only when every criterion is `verified` and scope matches exactly.
8. Validate with `task_proof_validate_review`.
9. Render with `task_proof_render_review`.

The same model family may review its own prior work only in a separate run with a different run ID and a clean evidence pass. A different model or human reviewer is preferable for high-risk work.

## Completion rules

An author claim may be `claimed-complete` only when:

- every acceptance criterion is `claimed-pass`;
- no `doing` or `blocked` item remains in that task scope;
- every done item has evidence;
- at least one objective code, Git, test, runtime, or external evidence item exists;
- a `git-snapshot` evidence item is bound to the exact head revision, or to the worktree snapshot digest when dirty;
- a dirty worktree includes a SHA-256 snapshot digest;
- each Next item in an otherwise complete claim states why it is outside the current acceptance scope;
- the artifact is not self-declared `ACCEPTANCE_PASSED`, `RELEASE_READY`, `RELEASE_CANDIDATE`, or `RELEASED`; author evidence may support `TESTED` or externally produced `EXTERNAL_VALIDATED` only within its stated boundary.

A reviewer may issue `verified-complete` only with `overallVerdict=accepted`, exact repository/branch/base/head/dirty-state matching, a reviewer `git-snapshot` evidence item, substantive independent evidence for every criterion, exactly one verified mechanism check for every claimed event and invariant, and no critical or major discrepancy. `git-snapshot` and `claim-reference` are scope/context evidence; neither can by itself verify or contradict behavior.

## Evidence rules

Evidence entries are observations, not conclusions. A useful entry includes:

- stable `EVD-*` ID;
- type and producer;
- exact locator: command, path and line range, commit, artifact, trace, or external record;
- observed result and time;
- revision or snapshot digest where relevant;
- environment and limitations;
- exit code and pass/fail result for test/build/lint evidence.

A `git-snapshot` evidence entry must copy the snapshot tool's structured `repository`, `branch`, `baseRevision`, `headRevision`, `dirty`, `snapshotDigest`, and binding `revision` fields. For a clean tree, `revision` equals `headRevision`; for a dirty tree, it equals `snapshotDigest`. A matching hash alone is insufficient when repository or branch differs. Snapshot and claim-reference evidence establish identity/context only; each `verified` or `contradicted` criterion, event, or invariant must also cite substantive evidence such as source inspection, a diff/commit, a test/build/lint run, a runtime trace, or external validation.

Unit tests do not prove integration; synthetic data do not prove real-world performance; software tests do not prove hardware or scientific validity. Record these boundaries explicitly.

## Diagram grammar

The primary sequence-like diagram explains mechanism, not file inventory.

- actors represent stable responsibilities or state owners;
- every arrow is a labelled event, read, write, invalidation, cancellation, or verification action;
- `before` events show the former failure path;
- `change` events show the new mechanism;
- `interrupt` events show user, cancellation, error, or concurrency paths;
- `verification` events show how evidence observes the mechanism;
- invariants state what must never be violated;
- termination states when the agent/system stops writing or yields ownership;
- the main figure is limited to 8 actors and 16 events; overflow remains in structured detail rather than being crammed into the figure.

## Status vocabulary

### Author criterion status

- `claimed-pass`
- `claimed-fail`
- `blocked`
- `not-assessed`

### Independent criterion verdict

- `verified`
- `contradicted`
- `unsupported`
- `blocked`
- `not-assessed`

### Overall review

- `accepted`
- `partially-accepted`
- `rejected`
- `blocked`
- `stale`

## File convention

Recommended durable project paths:

```text
.ai/task-proof/
  claims/CLM-*.json
  reviews/REV-*.json
  index.json
artifacts/task-proof/
  CLM-*.html
  REV-*.html
```

The MCP defaults to `~/.agent/diagrams/` and writes an HTML page plus a `.task-proof.json` sidecar. Projects may copy accepted bundles into their repository after secret/privacy review.
