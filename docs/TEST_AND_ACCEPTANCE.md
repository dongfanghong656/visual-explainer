# Test and acceptance record

## Durable evidence

| ID | Check | Result | Environment / locator | Scope and limitation |
|---|---|---|---|---|
| EVD-0001 | Base Task Proof strict test suite | PASS_AT_PRIOR_BASELINE | Prior Node and local runs | Does not automatically cover later contract changes |
| EVD-0002 | Git snapshot integration/adversarial cases | PASS_AT_PRIOR_BASELINE | Temporary Git repositories | Controlled environments |
| EVD-0003 | JSON/schema/source-integrity checks | PASS_AT_PRIOR_BASELINE | Repository source checks | Rerun at changed heads |
| EVD-0004 | Deterministic HTML/SVG visual inspection | PASS_AT_PRIOR_BASELINE | Controlled Chromium | Contract header/overlay not yet integrated |
| EVD-0005 | Targeted secret/package-content scans | PASS_AT_PRIOR_BASELINE | Local scans/package dry-run | Not a platform-wide audit |
| EVD-0006 | Dependency-installed MCP stdio handshake | PASS_AT_PRIOR_BASELINE | Node 20/22 CI and local environment | Public path predates mandatory contract enforcement |
| EVD-0007 | Task Contract 2.4 full strict suite from fresh branch archive | PASS | lifecycle scripts disabled; 2026-08-27 | 83 passed, 0 failed, 0 skipped; independent review still absent |
| EVD-0008 | Draft PR #3 exact-head Linux matrix at `0783704f` | FAIL | GitHub Node 20/22 | Superseded by the repaired integrated PR #4 candidate; do not report TURN-0003 CI success |
| EVD-0009 | PR #4 CI failure reproduction and migration repair | PASS_LOCAL | Exact failing tests plus focused reruns; 2026-08-27 | Three deterministic failures repaired; later remote result recorded by EVD-0012 |
| EVD-0010 | Trusted adapter registry and default-deny MCP tests | PASS_LOCAL | Registry, MCP, public-finalizer focused tests | Server-owned factories and unclassified-tool rejection covered |
| EVD-0011 | Installed MCP and package deployment checks | PASS_LOCAL | Real checkout stdio handshake, npm-linked binary handshake, `npm pack --dry-run` | 8 tools callable; 94 package entries; not publication |
| EVD-0012 | PR #4 exact-head Linux matrix at `2a6dab262f49c7d4c0abf6d5f78a38825761022f` | PASS | GitHub Actions Node 20 and Node 22 | Both jobs ran strict source/tests and real stdio handshake; release-hardening delta needs a new run |
| EVD-0013 | Locked clean package installation and packed MCP handshake | PASS_LOCAL | `npm run test:release-package`; Windows Node 22 | 97 package files; all 8 tools; temporary clean install; not public-download evidence |
| EVD-0014 | Default production dependency advisory gate | PASS_LOCAL | `npm audit --omit=dev --omit=peer --audit-level=high` | 0 vulnerabilities; optional Pi/PPTX peers excluded from default deployment |
| EVD-0015 | PR #4 release-delta CI and R2 failure at `93a2704` | PARTIAL | GitHub Actions run `33075935293` | Node 20/22 passed; R2 rejected PR ref `4/merge` as a tag; later repair success is recorded by EVD-0016 and EVD-0018 |
| EVD-0016 | PR #4 repaired exact-head matrix and R2 review at `f1f665dc9e077988982401cae849c0abfdfcb25e` | PASS_WITH_LIMITS | GitHub Actions run `33077129005` | Node 20/22 and R2 passed; R2 reconstructed 7 requirements, ran 106 Linux tests, eight-tool handshakes, package install, and 0-vulnerability audit; not a different human/model |
| EVD-0017 | Post-review decision-state R2 rerun at `2515181d701ecbfd78b6971ba9afe91a2594f929` | PARTIAL | GitHub Actions run `33077434141` | Node 20/22, release reconstruction, MCP, and audit passed; final report rejected a newly progressed authorized decision value; executable compatibility regression added |
| EVD-0018 | Final PR #4 exact-head matrix and R2 review at `96afc5ffb9796e82c5ecfdc492fddc7cec68434f` | PASS_WITH_LIMITS | GitHub Actions run `33077809112` | Node 20/22 passed; R2 ran 107 Linux tests, clean 97-file install, eight-tool handshakes, 0-vulnerability audit, and exact-head report |
| EVD-0019 | Tagged GitHub prerelease workflow | PASS | Tag `v0.11.0-alpha.1`; run `33077966508`; merge `d83a072` | Full release gate and audit passed before publishing the 97-file `.tgz`; public prerelease, not stable/npm registry publication |
| EVD-0020 | Downloaded public artifact and Codex deployment readback | PASS | GitHub asset SHA-256 `11bb3dc3...e0e8be72`; Windows Node 22 / Codex host | Normal global package `0.11.0-alpha.1`, deployed eight-tool handshake, versioned Skill present, Codex MCP enabled |

## Contract-authority acceptance matrix

| Gate | Current state | Required closing evidence |
|---|---|---|
| Contract normalization/digest | TESTED | Exact-head remote matrix readback |
| Requirement/source coverage | TESTED_WITH_LIMITATION | Omission-focused independent review and future source-extraction adapter |
| Claim contract binding | TESTED | Negative cases included |
| Authority receipt set | TESTED | Trusted adapter cases included; external adapters incomplete |
| Review/repository binding | TESTED | Distinct R2/R3 reviewer artifact still missing |
| Named-check content identity | TESTED | Policy/executable/args/cwd/result/context cases included |
| Evidence/lifecycle verifier binding | TESTED | Context-free verifier rejection included |
| Strict final orchestrator | TESTED | Extra receipt/context-free verifier cases included |
| Public MCP/Skill enforcement | EXACT_HEAD_CI_VERIFIED | Contract-free/mismatched inputs, trusted registry, and default-deny tests pass on Node 20/22 |
| Independent acceptance | R2_PASS_WITH_LIMITS_CI | Automated exact-head CI isolation passes; no different-human/model R3 review |
| Release readiness | ALPHA_PUBLISHED_AND_DEPLOYED | Stable promotion and long-term outcome observation remain separate |

## Current conclusion

Task Contract Protocol 2.4 and Public Enforcement 1.0 passed the final exact-head Node 20/22 matrix and automated R2 review with documented limitations. PR #4 is merged, the tagged release gate passed, the GitHub prerelease is public, and its downloaded asset is installed and registered in Codex with an eight-tool handshake. Stable promotion, different-human/model R3 review, external authority adapters, and observed long-term user outcomes remain outside this alpha acceptance.
