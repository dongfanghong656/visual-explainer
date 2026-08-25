# `/task-proof`

Create a producer proof package for the current task.

## Procedure

1. Read `../SKILL.md` and all required references.
2. Resolve the exact task, requirement, acceptance criteria, base, and head.
3. Call `task_proof_snapshot` for repository evidence. Do not run arbitrary shell commands through the MCP.
4. Build `TASK_PROOF.producer.json` with bounded claims and evidence.
5. Call `task_proof_validate`.
6. Correct invalid structure; never rewrite a failed result into a pass.
7. Render `status` and, when the task changes runtime control flow, also render `change_logic`.
8. Write the bundle beneath `.task-proof/`.
9. Report the validator status, manifest digest, checkpoint, verified claims, remaining claims, blockers, and reviewer handoff.

A producer-only package is provisional. Do not call it independently accepted.
