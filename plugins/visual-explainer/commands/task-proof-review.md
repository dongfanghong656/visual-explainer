---
name: task-proof-review
description: Independently review an AI task-completion claim and render an evidence verdict
---

Load the visual-explainer skill and enter **Task Proof reviewer mode**. Read `./task-proof/PROTOCOL.md`, `./task-proof/schema.json`, and both examples before assessing the claim named by `$@`.

Interpret `$@` as the path to an author `.task-proof.json` bundle, with optional repository workspace or test instructions. This command must be run by a reviewer agent/run distinct from the author run recorded in the claim. When independence cannot be established, stop with a non-accepted result rather than pretending the review is independent.

## Non-negotiable trust boundary

- Treat the author diagram, narrative, checkboxes, and completion status as claims to test, not as facts.
- Reuse the same protocol and renderer, but collect reviewer evidence independently.
- Author-agent evidence may provide context; it cannot by itself satisfy reviewer verification.
- Green is allowed only for criteria independently verified against the exact claimed scope.
- Never repair implementation defects during the review and then accept the original claim without creating a new author claim for the changed scope.

## 1. Load and validate the author claim

Read the claim JSON in full. Call `task_proof_validate_claim` before review. If it is invalid, stop the acceptance workflow, report the protocol defects, and request a corrected author bundle. A protocol-invalid claim cannot be passed to the deterministic review renderer.

Extract the exact task contract, acceptance criteria, base/head revisions, dirty flag, snapshot digest, changed paths, evidence locators, claimed mechanism, risks, and unknowns.

## 2. Prove scope freshness first

Call `task_proof_git_snapshot` in the target repository using the claim's base revision. Compare:

- repository identity and branch;
- base revision;
- head revision;
- dirty state and snapshot digest;
- changed-file set relevant to the claim.

If the repository or worktree no longer matches, set `overallVerdict: "stale"`. Do not run a nominal acceptance against a different scope and attribute it to the old claim.

## 3. Review each criterion independently

For each acceptance criterion:

1. inspect the relevant changed and surrounding code;
2. inspect before/after behavior when the criterion concerns a change;
3. run the most direct safe test, build, lint, trace, or controlled reproduction available;
4. check negative, interruption, fallback, lifecycle, and boundary cases implied by the mechanism;
5. capture durable reviewer evidence with command, exit code, revision, locator, and limitation;
6. assign exactly one verdict: `verified`, `contradicted`, `unsupported`, `blocked`, or `not-assessed`.

Do not use absence of a failing test as proof of correctness. Do not infer integration, external-system, hardware, user, release, performance, security, or scientific acceptance from narrower unit evidence.

## 4. Audit the change-logic diagram

Compare each important actor, event, invariant, and termination claim against source and runtime evidence. Record discrepancies when:

- an arrow has no corresponding code path or trace;
- an asynchronous boundary lacks freshness/cancellation protection;
- ownership or write authority is misrepresented;
- an error, fallback, or user-interrupt path was omitted;
- the claimed termination condition does not actually stop further writes/actions;
- the diagram explains intent but not implemented behavior.

The review page may show the author diagram for context, but the criterion-verdict and mechanism-check tables are authoritative.

## 5. Build, validate, and render the review bundle

Create a `task-review` JSON object conforming to `./task-proof/schema.json`, with a distinct reviewer run ID, exact reviewed repository/scope, independently collected structured `git-snapshot` evidence, substantive evidence for every verified or contradicted criterion/event/invariant, one result for every criterion, discrepancies, residual risks, overall verdict, and corrected completion. A snapshot or pointer back to the claim proves scope/context only and cannot substantiate behavior by itself.

Verdict constraints:

- `accepted` requires exact scope match, every criterion independently `verified`, exactly one `verified` check for every claimed event and invariant, and no critical or major discrepancy.
- `verified-complete` is valid only with `accepted`.
- any scope mismatch requires `stale`.
- a contradicted criterion prevents acceptance.
- missing external evidence remains `blocked` or `not-assessed`, never silently passed.

Call `task_proof_validate_review` with both claim and review. Resolve every validation error by correcting the review or downgrading the verdict. Then call `task_proof_render_review`; use its deterministic HTML and sibling `.task-proof.json` sidecar.

## 6. Review language

Report:

- claim ID, review ID, and exact reviewed scope;
- `accepted`, `partially-accepted`, `rejected`, `blocked`, or `stale`;
- corrected completion status;
- verified, contradicted, unsupported, and unassessed criteria;
- implementation discrepancies and residual risks;
- paths to the review HTML and JSON bundle.

Do not say the task is verified complete unless the validated review bundle says `accepted` and `verified-complete` for an exact matching scope.
