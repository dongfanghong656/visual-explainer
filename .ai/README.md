# AI project state

`.ai/PROJECT_STATE.json` is the compact recovery index for the Task Proof fork. It points to authoritative requirements, specification, tasks, evidence/status registers, checkpoint, turn record, and handoff. It is not a substitute for those documents.

ID counters store the **next unused** numeric suffix, so each value must be greater than every existing ID in that family.

Recovery order:

1. verify repository and managed branch;
2. read `PROJECT_STATE.json`;
3. read the latest checkpoint and turn index;
4. read active requirements/spec/tasks and open risks;
5. compare with `docs/HANDOFF.md`;
6. repair drift before substantive work.

`PENDING_SELF_REFERENCE` is permitted for the commit SHA of the same transaction that creates a turn record. The actual SHA must be reported after readback and reconciled during the next managed transaction; do not create a recursive commit solely to write its own SHA.
