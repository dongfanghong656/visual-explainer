# Claim Protocol

## Purpose

A claim is the smallest bounded statement that the producer asks a reviewer to accept. It is not a work log entry and not a file-change summary.

## Required claim form

Write each claim as:

> Under **condition**, the system now produces **observable result**, because **mechanism**, within **scope**.

Examples:

- Under a stale-generation callback, the controller exits before writing the current scroll node because callback generation must equal the active generation.
- Given an invalid manifest, the validator returns `invalid` and lists structural errors without writing a bundle.
- When the requested output name contains a path separator, the writer rejects it before creating files.

Avoid:

- improved robustness;
- completed backend;
- handled edge cases;
- production-ready;
- optimized performance;
- fixed everything.

Those phrases are not independently falsifiable without additional bounds.

## Stable identity

Claim IDs must remain stable across producer and reviewer manifests. Use project-local IDs such as `TPV-CL-001`. Do not renumber a rejected claim to make a comparison disappear.

A reviewer may add `RV-ONLY-*` claims when the producer omitted a material behavior, migration, risk, or regression.

## Status vocabulary

- `done` — producer asserts all linked acceptance criteria pass.
- `partial` — useful implementation exists, but one or more required outcomes are missing or unverified.
- `not_done` — explicitly remaining work.
- `blocked` — cannot proceed without a named external condition.
- `unknown` — current evidence cannot establish status.

Status describes the claimant's assertion. The validator produces a separate verdict.

## Category vocabulary

Recommended categories:

- `code`
- `behavior`
- `config`
- `data`
- `migration`
- `security`
- `documentation`
- `design`
- `research`
- `release`

Behavioral categories require implementation and verification evidence. Documentation/design claims can be verified by primary file evidence plus review, but claims that documentation is *correct in practice* still need behavioral evidence.

## Acceptance linkage

Each `done` claim must link to one or more acceptance criteria. Criteria must be:

- observable;
- bounded;
- falsifiable;
- tied to a checkpoint;
- stated before interpreting the final result when possible.

Bad criterion:

> The feature works well.

Good criterion:

> With a producer manifest containing only self-reported evidence, validation returns claim verdict `unverified` and overall status other than `verified_complete`.

## Claim splitting and aggregation

Split a claim when:

- different failure modes require different evidence;
- one part may pass while another fails;
- it spans different owners or lifecycle phases;
- it mixes implementation, deployment, and real-world outcome.

Keep a claim together when splitting would hide a necessary end-to-end property.

Never use micro-claims to manufacture a high completion percentage. Completion is determined by acceptance coverage and criticality, not claim count.

## State and ownership

For concurrency, workflow, or lifecycle changes, every claim should identify:

- state owner;
- creation point;
- mutation point;
- invalidation condition;
- termination condition;
- priority between user, system, and queued work.

## Negative and boundary claims

A positive path is insufficient for claims involving cancellation, security, retries, migration, or error handling. Add explicit claims for:

- stale work cannot write;
- invalid input is rejected;
- path traversal is prevented;
- retry count is bounded;
- partial migration does not corrupt old data;
- user intent outranks automation;
- failed verification remains visible.

## Release claims

Keep these separate:

1. code implemented;
2. tests passed;
3. branch committed;
4. pull request opened;
5. pull request merged;
6. release created;
7. artifact published;
8. deployment observed;
9. real user outcome observed.

Evidence for an earlier state never proves a later state.
