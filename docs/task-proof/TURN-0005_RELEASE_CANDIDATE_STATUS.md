# TURN-0005 release and deployment status

| Gate | State |
|---|---|
| Previous exact-head PR #4 Node 20/22 CI | PASS at `2a6dab2` |
| Lockfile-defined install | PASS_LOCAL |
| Full Task Proof checkout verification | PASS_LOCAL: 106 tests, 102 passed, 0 failed, 4 Windows capability skips |
| Clean packed-artifact install | PASS_LOCAL |
| Packed eight-tool MCP handshake | PASS_LOCAL |
| Default production dependency audit | PASS_LOCAL, 0 vulnerabilities |
| Release-delta exact-head CI | Node 20/22 PASS at `96afc5f`, run `33077809112` |
| Distinct R2 review | PASS_WITH_LIMITS at `96afc5f`, run `33077809112` |
| Main integration | MERGED as `d83a072` via PR #4 |
| GitHub prerelease | PUBLISHED: `v0.11.0-alpha.1`, run `33077966508` |
| Downloaded artifact and Codex readback | PASS: global package, Skill, enabled MCP, deployed eight-tool handshake |

The repository-authority alpha is publicly released and deployed on this Codex host. Unsupported external authority adapters continue to fail closed at `INCONCLUSIVE` and are not advertised as available. Automated R2 isolation is not a different-human/model R3 review.
