# Evidence Policy

## Principle

Evidence must let a reviewer reopen the observation at the same checkpoint. A polished narrative is not evidence.

## Evidence fields

Every evidence item records:

- stable ID;
- type;
- locator;
- compact factual summary;
- result: `pass`, `fail`, `unknown`, or `not_applicable`;
- trust: `primary`, `secondary`, or `self_report`;
- checkpoint or digest when available.

## Trust levels

### Primary

Direct observation of the target repository or system:

- immutable commit and diff;
- source file or generated artifact hash;
- machine-readable test/build report;
- runtime trace;
- independent review result;
- release/deployment API response.

### Secondary

Useful context not sufficient alone:

- issue discussion;
- design document;
- human summary without attached raw result;
- third-party report whose checkpoint cannot be reproduced.

### Self-report

Produced by the implementation AI or copied from its narrative:

- “tests passed” without a report;
- checked task boxes;
- completion summary;
- producer diagram;
- generated changelog statement.

Self-report may explain intent, but it cannot be the sole basis of a verified completion claim.

## Evidence pairing by claim category

| Claim category | Minimum primary implementation evidence | Minimum primary verification evidence |
|---|---|---|
| code / behavior | diff, commit, file, or artifact | test, runtime, trace, build, or independent review |
| config | config diff or file | parser/load/build/runtime check |
| data / migration | migration or transformed artifact | fixture comparison, invariant check, rollback/forward test |
| security | code/config diff | adversarial test, boundary test, or independent security review |
| documentation | file or rendered artifact | independent review against source facts |
| release | immutable release/registry/deployment record | retrieval or observed environment check |
| research/science | method/data/artifact | predefined validation protocol, uncertainty, and reproducible analysis |

## Failed evidence

Record failures even when a later retry passes. Explain which checkpoint each result belongs to. A passing retry does not erase evidence of flakiness unless the root cause and stabilization evidence are shown.

If any currently applicable cited evidence fails, the associated done claim is contradicted until resolved or scoped out through an explicit decision.

## Evidence freshness

Evidence is stale when it predates a relevant code/config/data change. Re-run or re-open evidence after the final head commit.

At minimum, record:

- head commit;
- report timestamp;
- report or artifact digest;
- environment identity when behavior depends on it.

## Test quality

A test run proves only what its assertions cover. Reviewers should distinguish:

- command exited zero;
- test file executed;
- expected assertion was present;
- test reached the changed branch;
- test reproduced the original failure;
- test covers adversarial or cancellation paths.

Coverage percentage alone does not prove the change's central invariant.

## Locator quality

Good locators are reopenable:

- `commit:<sha>`
- `diff:<base>..<head>`
- `file:src/controller.ts#L120-L168`
- `test-report:.task-proof/junit.xml#sha256=<digest>`
- `trace:artifacts/run-014.jsonl#event=RAF2_ABORT_STALE`

Avoid locators such as “the code,” “latest test,” or “see terminal.”

## Evidence minimization

Do not paste entire diffs, logs, or documents into the manifest. Store or link the source and summarize only the observation needed for the claim. This keeps manifests small and prevents context overflow.

## Contradictory evidence

When sources disagree:

1. keep both;
2. identify checkpoint and environment differences;
3. downgrade the claim;
4. create a closing experiment or inspection;
5. do not choose the more favorable source without justification.

## Scientific and empirical claims

For scientific validity, include:

- hypothesis or quantity being estimated;
- data provenance;
- calibration and preprocessing;
- uncertainty and error model;
- controls or baselines;
- predefined acceptance threshold;
- limitations and extrapolation boundary.

Code tests can verify implementation without proving scientific correctness.
