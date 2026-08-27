# Test and acceptance record

## Durable evidence

| ID | Check | Result | Environment / locator | Scope and limitation |
|---|---|---|---|---|
| EVD-0001 | Base Task Proof strict test suite | PASS_AT_PRIOR_BASELINE | Prior Node and local runs | Does not automatically cover later contract changes |
| EVD-0002 | Git snapshot integration/adversarial cases | PASS_AT_PRIOR_BASELINE | Temporary Git repositories | Controlled environments |
| EVD-0003 | JSON/schema/source-integrity checks | PASS_AT_PRIOR_BASELINE | Repository source checks | Must rerun for exact changed head |
| EVD-0004 | Deterministic HTML/SVG visual inspection | PASS_AT_PRIOR_BASELINE | Controlled Chromium | Contract header/overlay not yet integrated |
| EVD-0005 | Targeted secret/package-content scans | PASS_AT_PRIOR_BASELINE | Local scans/package dry-run | Not a platform-wide audit |
| EVD-0006 | Dependency-installed MCP stdio handshake | PASS_AT_PRIOR_BASELINE | Node 20/22 CI and local environment | Public path predates mandatory contract enforcement |
| EVD-0007 | Task Contract 2.4 runtime/schema/adversarial/static tests | PENDING_FINAL_REMOTE_CI_READBACK | Draft PR #3 | Files/tests are committed; final exact-head conclusions must be read from GitHub checks |

## Contract-authority acceptance matrix

| Gate | Current state | Required closing evidence |
|---|---|---|
| Contract normalization/digest | IMPLEMENTED_IN_STAGE | Exact-head Node 20/22 tests and schema/runtime drift checks |
| Requirement/source coverage | IMPLEMENTED_IN_STAGE | Omission-focused independent review and future source-extraction adapter |
| Claim contract binding | IMPLEMENTED_IN_STAGE | Negative tests at exact final head |
| Authority receipt set | IMPLEMENTED_IN_STAGE | Trusted adapter tests and exact source coverage |
| Review/repository binding | IMPLEMENTED_IN_STAGE | Distinct R2/R3 reviewer artifact |
| Named-check content identity | IMPLEMENTED_IN_STAGE | Policy/executable/args/cwd/result receipt tests |
| Evidence/lifecycle verifier binding | IMPLEMENTED_IN_STAGE | Context-free verifier rejection tests |
| Strict final orchestrator | IMPLEMENTED_IN_STAGE | Extra-receipt and generic-verifier adversarial tests |
| Public MCP/Skill enforcement | NOT_IMPLEMENTED | TASK-0007 fail-closed integration tests |
| Independent acceptance | NOT_ASSESSED | Different reviewer context/model/human/CI as required |
| Release readiness | BLOCKED | Merge/release/publication/deployment gates are separate |

## Current conclusion

Task Contract Protocol 2.4 is an author-developed staging candidate. It is not yet independently accepted, mandatory in public entrypoints, merged, release-ready, released, published, or deployed.
