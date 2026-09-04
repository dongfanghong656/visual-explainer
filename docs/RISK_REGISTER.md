# Risk register

| ID | Risk | Severity | State | Mitigation / trigger to close |
|---|---|---:|---|---|
| RSK-0001 | Dependency-installed MCP path may drift from source/static tests. | HIGH | MITIGATED | Exact-head CI, tagged package verification, public-asset digest check, normal global install, and deployed eight-tool handshake pass. |
| RSK-0002 | A different run ID does not prove a different model/person or eliminate correlated reasoning errors. | HIGH | OPEN_ACCEPTED_LIMITATION | Record R0–R3 procedure; prefer different model, human, CI, or signed platform attestation. |
| RSK-0003 | Multi-file proof output is not a universal cross-filesystem atomic transaction. | MEDIUM | OPEN | Keep immutable directories/manifests and recovery checks; evaluate stronger transactional storage before release. |
| RSK-0004 | Portable JSON Schema and executable validators can drift. | MEDIUM | MITIGATED_OPEN | Static version/drift tests and same-task updates; exact-head CI required. |
| RSK-0005 | A claimant may omit difficult user/project requirements before they enter the contract. | CRITICAL | OPEN_ACCEPTED_ALPHA_LIMITATION | Freeze repository requirements, require coverage dispositions and distinct R2/R3 omission review; do not claim universal requirement extraction. |
| RSK-0006 | Existing public MCP/Skill entrypoints may bypass the isolated contract core. | CRITICAL | MITIGATED | TASK-0007 public negative tests and exact-head Node 20/22 CI pass. |
| RSK-0007 | User/Issue/release/identity authority lacks trusted live or cryptographic adapters. | HIGH | OPEN_UNSUPPORTED_EXTERNAL_PASS | Repository-file authority is the alpha scope; all unsupported external authority remains `INCONCLUSIVE`. |
| RSK-0008 | A same-name named check may change command semantics. | HIGH | MITIGATED | Public named-check adapter binding passes exact-head CI. |
| RSK-0009 | Caller-supplied evidence/lifecycle `PASS` values can launder completion. | CRITICAL | MITIGATED | Server-owned verifiers and request-schema rejection pass exact-head CI. |
| RSK-0010 | Contract/public PR may pass targeted tests but still regress the whole package. | HIGH | MITIGATED | Final PR head `96afc5f` passed Node 20/22 and R2; the tag repeated the full release gate before publication. |
| RSK-0011 | Default installation may inherit high-severity advisories from non-core Pi/PPTX hosts. | HIGH | MITIGATED | Both hosts are optional peers, CI/tag deployment omits them, and the default audit reports 0 vulnerabilities locally, in R2, and on the release tag. |
| RSK-0012 | Active Codex configuration can be regenerated or replaced after package deployment, leaving Skills present while MCP servers disappear. | HIGH | MITIGATED_MONITORED | Keep dual registration commands documented, declare Skill dependencies, verify active config plus a fresh-session call after repair; re-register if a later config change removes either server. |

No risk is closed merely because implementation files exist or an author-generated diagram is coherent.
