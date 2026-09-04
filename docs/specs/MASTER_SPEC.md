# Master specification

| ID | Title | Status | Version | Detail |
|---|---|---|---|---|
| SPEC-0001 | Task Proof protocol, deterministic visualizer, and local MCP integration | ACCEPTED_CURRENT | Protocol 1.x / package 0.11.0-alpha.1 | [SPEC-0001](SPEC-0001.md) |
| SPEC-0002 | Canonical strict runtime and evidence identity | ACCEPTED_CURRENT | Strict runtime 0.2 | [SPEC-0002](SPEC-0002.md) |
| SPEC-0003 | Task Contract Authority Protocol | ACCEPTED_RELEASE_CANDIDATE | Contract 2.4.0 / authority receipt 1.4.0 | [SPEC-0003](SPEC-0003.md) |
| SPEC-0004 | Public contract enforcement and trusted server adapters | CI_VERIFIED_RELEASE_CANDIDATE | Public enforcement 1.0.0 | [SPEC-0004](SPEC-0004.md) |
| SPEC-0005 | Local Codex dual-MCP discovery and activation | IMPLEMENTED_LOCAL_CLI_VERIFIED | Package 0.11.0-alpha.1 post-release repair | [SPEC-0005](SPEC-0005.md) |

SPEC-0003 and SPEC-0004 were released through PR #4. SPEC-0005 repairs host-local discovery and exposure after the active Codex configuration was regenerated without the previously registered Task Proof server; it does not alter the public release artifact or add web integration.
