# `/task-proof-review`

Independently review a producer task-proof package.

## Procedure

1. Read `../SKILL.md` and all required references.
2. Freeze the producer's exact repository, base, head, and task contract. Stop on mismatch.
3. Review requirements, diff, code, tests, traces, and artifacts before reading the producer narrative when practical.
4. Recreate a reviewer manifest. Reuse comparable claim IDs; add reviewer-only claims for omissions.
5. Set `reviewDisposition` to `accepted`, `partial`, `rejected`, or `unverified` for every producer claim.
6. Cite evidence you independently reopened or generated.
7. Run `task_proof_validate` and render the reviewer view.
8. Call `task_proof_compare` and `task_proof_render_review`.
9. Report disagreements as concrete missing evidence or failed acceptance criteria, not stylistic objections.

Do not approve a claim merely because its diagram is coherent or its producer manifest is valid.
