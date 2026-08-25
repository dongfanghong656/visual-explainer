# Risk register

| ID | Risk | Severity | State | Mitigation / trigger to close |
|---|---|---:|---|---|
| RSK-0001 | Full MCP stdio server/client workflow was not executed because declared dependencies were unavailable in the current container. | HIGH | OPEN_BLOCKER | TASK-0005 clean checkout, install, invoke all five tools, capture logs and outputs |
| RSK-0002 | A different run ID does not prove a different model/person or eliminate correlated reasoning errors. | HIGH for high-risk use | OPEN_ACCEPTED_LIMITATION | Prefer different model, human, CI, or external system; disclose reviewer provenance |
| RSK-0003 | The MCP writes the authoritative JSON sidecar before the deterministic HTML derivative, but the pair still uses two filesystem operations rather than a cross-file atomic transaction. | MEDIUM | OPEN | Add staged bundle transaction/recovery manifest or rollback cleanup; the surviving JSON sidecar can regenerate HTML |
| RSK-0004 | Portable JSON Schema and executable JavaScript validator may drift as protocol evolves. | MEDIUM | MITIGATED_OPEN | Validate examples with both, add schema-differential tests, change both in one task |

No risk is closed merely because the implementation files exist.
