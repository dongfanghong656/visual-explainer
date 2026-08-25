# Review Protocol

## Goal

The reviewer does not judge how convincing the producer sounds. The reviewer reconstructs whether each bounded claim is supported at the frozen checkpoint.

## Independence levels

Record one level:

- **R0 — narrative review:** reviewer reads only producer material. Not independent; cannot yield final acceptance.
- **R1 — locator review:** reviewer reopens cited files/reports at the same checkpoint.
- **R2 — reconstruction review:** reviewer derives claims and expected behavior from requirements and repository before reading producer rationale.
- **R3 — adversarial review:** R2 plus independent tests, traces, counterexamples, or failure injection.

Critical behavioral, security, migration, and scientific claims should target R2 or R3.

## Required order

1. Verify task identity and checkpoint.
2. Read requirement and frozen acceptance criteria.
3. Inspect base/head diff and affected call paths.
4. Inspect verification evidence and failures.
5. Reconstruct likely behavior and risks.
6. Read producer manifest.
7. Compare claim-by-claim.
8. Create reviewer manifest and reconciliation.

When this order cannot be followed, disclose anchoring risk.

## Checkpoint mismatch

Stop comparison when any of these differ materially:

- repository;
- branch;
- base;
- head;
- uncommitted work included in only one review;
- generated artifact digest;
- test environment for an environment-dependent claim.

Return `REVIEW_CHECKPOINT_MISMATCH`. Do not silently compare different versions.

## Review dispositions

- `accepted` — independent evidence supports the full claim and linked criteria.
- `partial` — some behavior is supported, but scope or criteria remain incomplete.
- `rejected` — direct evidence contradicts the claim.
- `unverified` — evidence is missing, stale, inaccessible, or too weak.

`unverified` is not the same as false. `rejected` requires contradictory evidence.

## Required challenge matrix

For each material claim, review applicable rows:

| Dimension | Question |
|---|---|
| intent | Does implementation solve the stated user problem rather than a nearby problem? |
| scope | Are out-of-scope effects being counted as completion? |
| control flow | What exact event/state transitions changed? |
| state ownership | Who creates, mutates, invalidates, and terminates state? |
| concurrency | Can stale work arrive late and overwrite current state? |
| user priority | Can automation override a newer user action? |
| failure path | What happens on missing data, invalid refs, timeout, or interruption? |
| compatibility | What callers, formats, migrations, or environments are affected? |
| security | Can inputs escape allowlists, invoke commands, disclose secrets, or overwrite arbitrary paths? |
| tests | Do assertions prove the changed invariant and reproduce the original failure? |
| packaging | Can the declared install/run path actually start? |
| release | Is merge/release/deployment directly observed? |
| unknowns | What material fact remains unobserved? |

## Omission detection

The reviewer must add a reviewer-only claim when the producer omits a material requirement, regression, migration step, security boundary, or release condition.

Do not limit review to producer-selected claims.

## Reviewer evidence

The reviewer may cite the same locator only after reopening it. Reviewer-generated evidence should use new evidence IDs and state the observation method.

Example:

```json
{
  "id": "RV-E-12",
  "type": "test",
  "locator": "test-report:.task-proof/reviewer-node-test.txt#sha256=...",
  "summary": "Independent node:test run covers invalid self-report-only completion and returns unverified.",
  "result": "pass",
  "trust": "primary"
}
```

## Reconciliation

A disagreement is resolved only by:

- stronger evidence at the same checkpoint;
- a new checkpoint with both manifests regenerated;
- an explicit scope/acceptance decision recorded by the owner.

Do not resolve disagreement by averaging confidence scores or preferring the longer explanation.

## Reviewer final report

Report:

- checkpoint;
- independence level;
- accepted claims;
- downgraded/rejected claims;
- producer omissions;
- failed or stale evidence;
- exact next evidence required;
- final review status.
