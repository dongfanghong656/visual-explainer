# `/task-proof-reconcile`

Reconcile producer and reviewer manifests at one frozen checkpoint.

## Procedure

1. Confirm repository, task, base, and head match.
2. Validate both manifests.
3. Call `task_proof_compare`.
4. Render a one-page reconciliation diagram.
5. Preserve producer and reviewer digests.
6. Convert each downgrade, dispute, omitted claim, or checkpoint mismatch into a next action with an owner and a required closing artifact.
7. Return exactly one final status: `TASK_PROOF_ACCEPTED`, `TASK_PROOF_DISPUTED`, `TASK_PROOF_INCOMPLETE_REVIEW`, or `TASK_PROOF_INVALID`.

Never merge conflicting conclusions into a vague percentage.
