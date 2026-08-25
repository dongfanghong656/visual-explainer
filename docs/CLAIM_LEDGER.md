# Claim ledger

| Claim ID | Statement | Taxonomy | Evidence/status | Boundary |
|---|---|---|---|---|
| CLM-0001 | The branch contains a complete declared alpha file set for protocol, validator, Git snapshot, renderer, examples, commands, MCP registration, and governance. | VERIFIED_FACT | EVD-0001, EVD-0002, EVD-0003; readback pending current commit | Does not prove full MCP runtime |
| CLM-0002 | The core validator/snapshot/renderer and static MCP-integration behavior covered by the 34 controlled Node tests passes. | VERIFIED_FACT | EVD-0001 | Test scope is controlled/local, not host integration |
| CLM-0003 | The Task Proof pages render in Chromium at 1440 px without horizontal overflow and preserve claim/review color semantics. | VERIFIED_FACT | EVD-0004 | One controlled browser/environment |
| CLM-0004 | The local MCP works end to end in a clean installation. | EXTERNAL_EVIDENCE_MISSING | RSK-0001 / TASK-0005 | Must not be promoted from syntax checks |
| CLM-0005 | Version 0.11.0-alpha.1 is released or release-ready. | UNKNOWN | Release gate BLOCKED | No tag, publication, final acceptance, or clean-install E2E |
