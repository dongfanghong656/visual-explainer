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
| EVD-0008 | Draft PR #3 exact final-head Linux matrix | POST_COMMIT_READBACK_REQUIRED | GitHub Node 20/22 | Required before reporting TURN-0003 synchronized |

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
| Public MCP/Skill enforcement | NOT_IMPLEMENTED | TASK-0007 fail-closed integration tests |
| Independent acceptance | NOT_ASSESSED | Different reviewer context/model/human/CI as required |
| Release readiness | BLOCKED | Merge/release/publication/deployment gates are separate |

## Current conclusion

Task Contract Protocol 2.4 is a tested author-developed staging candidate. It is not yet independently accepted, mandatory in public entrypoints, merged, release-ready, released, published, or deployed.
