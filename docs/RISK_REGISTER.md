# Risk register

| ID | Risk | Severity | State | Mitigation / trigger to close |
|---|---|---:|---|---|
| RSK-0001 | Dependency-installed MCP path may drift from source/static tests. | HIGH | MITIGATED_OPEN | Prior Node 20/22 baseline and stdio handshake passed; rerun at every exact integrated HEAD. |
| RSK-0002 | A different run ID does not prove a different model/person or eliminate correlated reasoning errors. | HIGH | OPEN_ACCEPTED_LIMITATION | Record R0–R3 procedure; prefer different model, human, CI, or signed platform attestation. |
| RSK-0003 | Multi-file proof output is not a universal cross-filesystem atomic transaction. | MEDIUM | OPEN | Keep immutable directories/manifests and recovery checks; evaluate stronger transactional storage before release. |
| RSK-0004 | Portable JSON Schema and executable validators can drift. | MEDIUM | MITIGATED_OPEN | Static version/drift tests and same-task updates; exact-head CI required. |
| RSK-0005 | A claimant may omit difficult user/project requirements before they enter the contract. | CRITICAL | OPEN_BLOCKER | Source requirements, coverage dispositions, trusted extraction adapters, and independent R2/R3 omission review. |
| RSK-0006 | Existing public MCP/Skill entrypoints may bypass the isolated contract core. | CRITICAL | OPEN_BLOCKER | TASK-0007 must make contract enforcement mandatory and add fail-closed public-entrypoint tests. |
| RSK-0007 | User/Issue/release/identity authority lacks trusted live or cryptographic adapters. | HIGH | OPEN_BLOCKER_FOR_EXTERNAL_PASS | Implement host, GitHub, registry, or signature adapters; otherwise cap at INCONCLUSIVE. |
| RSK-0008 | A same-name named check may change command semantics. | HIGH | MITIGATED_IN_CONTRACT_CORE | Freeze policy/executable/args/cwd and require verifier-bound receipt; integrate into public paths. |
| RSK-0009 | Caller-supplied evidence/lifecycle `PASS` values can launder completion. | CRITICAL | MITIGATED_IN_CONTRACT_CORE | Protocol 2.4 requires verifier-bound assessment objects; integrate into public paths. |
| RSK-0010 | Contract-core PR may pass targeted tests but still regress the whole package. | HIGH | OPEN_UNTIL_CI_READBACK | Exact final PR #3 Node 20/22 checks, changed-file review, and clean-head readback. |

No risk is closed merely because implementation files exist or an author-generated diagram is coherent.
