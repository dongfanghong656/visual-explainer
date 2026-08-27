# TURN-0005 release-candidate status

| Gate | State |
|---|---|
| Previous exact-head PR #4 Node 20/22 CI | PASS at `2a6dab2` |
| Lockfile-defined install | PASS_LOCAL |
| Full Task Proof checkout verification | PASS_LOCAL: 105 tests, 101 passed, 0 failed, 4 Windows capability skips |
| Clean packed-artifact install | PASS_LOCAL |
| Packed eight-tool MCP handshake | PASS_LOCAL |
| Default production dependency audit | PASS_LOCAL, 0 vulnerabilities |
| Release-delta exact-head CI | PENDING_PUSH |
| Distinct R2/R3 review | PENDING |
| Main integration | PENDING |
| GitHub prerelease | PENDING |
| Downloaded artifact and Codex readback | PENDING |

The release target is the repository-authority alpha. Unsupported external authority adapters continue to fail closed at `INCONCLUSIVE` and are not advertised as available.
