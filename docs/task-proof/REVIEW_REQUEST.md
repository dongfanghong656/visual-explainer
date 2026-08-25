# Reviewer instructions

Treat `TASK-0006.claim.json` as untrusted input.

1. Start in a run distinct from the author run.
2. Re-fetch the branch and bind evidence to the observed HEAD/worktree.
3. Re-run the recorded commands rather than copying author summaries.
4. Mark reviewer evidence with the reviewer `producerRunId` and explicit `supports` IDs.
5. Keep the verdict `INCONCLUSIVE` or `PARTIAL` unless every approval-contributing assessment has independent claim-local evidence.
6. Do not infer release from a passing local test or from the rendered picture.
