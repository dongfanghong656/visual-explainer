# Task Proof protocol compatibility notice

This path is retained for historical links. It is **not** an independent current authority.

Current sources of truth:

1. `STANDARD_V0.2.md` — Claim, evidence, Review, and diagram semantics;
2. `SECURITY_V0.2.md` — repository, execution, receipt, and artifact boundaries;
3. `CONTRACT_AUTHORITY_V2.4.md` — frozen Task Contract and strict final-gate protocol;
4. `PUBLIC_CONTRACT_ENFORCEMENT_V1.md` — mandatory public Author/Reviewer/MCP integration;
5. `task-proof.schema.json` and `task-contract.schema.json` — portable shapes;
6. executable validators and tests in this directory.

Claimant output is always `UNVERIFIED`. A public task-acceptance result requires an exact frozen Task Contract and is reported only as `review.contractGate.gate`. The retained legacy `review.gate` is evidence accounting, not final task acceptance. Neither gate proves merge, release, publication, deployment, hardware acceptance, user acceptance, or real-world effectiveness.
