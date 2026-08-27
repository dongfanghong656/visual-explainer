# Artifact registry

| ID | Path/scope | Version | Completeness | Usability | Verification | Release | Evidence boundary | Limitations |
|---|---|---|---|---|---|---|---|---|
| ART-0001 | Base Task Proof protocol/schema/examples | Protocol 1.x | FULL for declared alpha | DEVELOPMENT_USABLE | TESTED_PRIOR_BASELINE | PROVISIONAL | Controlled tests | Superseded trust semantics remain historical only |
| ART-0002 | Strict validation, snapshot, receipts, and gates | Strict 0.2 | FULL for current strict core | DEVELOPMENT_USABLE | TESTED_LOCAL_CURRENT_HEAD | PROVISIONAL | Adversarial tests and local strict suite | Exact-head remote CI pending |
| ART-0003 | Deterministic status/change/review renderer | 0.11 alpha | FULL for current views | DEVELOPMENT_USABLE | TESTED_LOCAL_CURRENT_HEAD | PROVISIONAL | Contract overlay/renderer tests | No independent visual acceptance |
| ART-0004 | Public Skill, commands, and MCP | 0.11 alpha | FULL for contract-enforced surface | DEVELOPMENT_USABLE | STDIO_AND_LINKED_BINARY_TESTED | PROVISIONAL | Local real MCP calls | Exact-head remote CI pending |
| ART-0005 | Project governance and continuity records | 1.0 | FULL through TURN-0004 candidate | DEVELOPMENT_USABLE | STATIC_CHECKED | PROVISIONAL | Repository records | Same-commit SHA uses pending-self-reference convention |
| ART-0006 | Task Contract authority runtime/schema/tests/spec | Contract 2.4.0; receipt 1.4.0 | FULL for integrated core | DEVELOPMENT_USABLE | TESTED_LOCAL_CURRENT_HEAD | PROVISIONAL | Draft PR #4 staging scope | Independent acceptance missing |
| ART-0007 | Trusted adapter registry and MCP default-deny registration | Public enforcement 1.0.0 | FULL for four repository-owned adapter kinds | DEVELOPMENT_USABLE | TESTED_LOCAL_CURRENT_HEAD | PROVISIONAL | Focused tests, strict suite, linked binary handshake | External non-repository authority types unsupported |

`FULL` describes the declared file set for that artifact, not user usability, independent acceptance, merge, release, publication, deployment, or observed effectiveness.
