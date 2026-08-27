# Artifact registry

| ID | Path/scope | Version | Completeness | Usability | Verification | Release | Evidence boundary | Limitations |
|---|---|---|---|---|---|---|---|---|
| ART-0001 | Base Task Proof protocol/schema/examples | Protocol 1.x | FULL for declared alpha | DEVELOPMENT_USABLE | TESTED_PRIOR_BASELINE | PROVISIONAL | Controlled tests | Superseded trust semantics remain historical only |
| ART-0002 | Strict validation, snapshot, receipts, and gates | Strict 0.2 | FULL for current strict core | DEVELOPMENT_USABLE | EXACT_HEAD_CI_VERIFIED | RELEASE_CANDIDATE | Node 20/22 CI and adversarial tests | Independent release review pending |
| ART-0003 | Deterministic status/change/review renderer | 0.11 alpha | FULL for current views | DEVELOPMENT_USABLE | TESTED_LOCAL_CURRENT_HEAD | PROVISIONAL | Contract overlay/renderer tests | No independent visual acceptance |
| ART-0004 | Public Skill, commands, and MCP | 0.11 alpha | FULL for contract-enforced surface | DEVELOPMENT_USABLE | EXACT_HEAD_CI_AND_PACKED_BINARY_TESTED | RELEASE_CANDIDATE | Real checkout, linked, and packed MCP calls | Public release install pending |
| ART-0005 | Project governance and continuity records | 1.0 | FULL through TURN-0005 candidate | DEVELOPMENT_USABLE | STATIC_CHECKED | PROVISIONAL | Repository records | Same-commit SHA uses pending-self-reference convention |
| ART-0006 | Task Contract authority runtime/schema/tests/spec | Contract 2.4.0; receipt 1.4.0 | FULL for integrated core | DEVELOPMENT_USABLE | EXACT_HEAD_CI_VERIFIED | RELEASE_CANDIDATE | PR #4 exact-head scope | Independent acceptance missing |
| ART-0007 | Trusted adapter registry and MCP default-deny registration | Public enforcement 1.0.0 | FULL for four repository-owned adapter kinds | DEVELOPMENT_USABLE | EXACT_HEAD_CI_VERIFIED | RELEASE_CANDIDATE | Focused tests and strict suite | External non-repository authority types unsupported and fail closed |
| ART-0008 | Locked package and GitHub prerelease workflow | Package 0.11.0-alpha.1 | FULL for GitHub release channel | PACKED_ARTIFACT_USABLE | CLEAN_INSTALL_HANDSHAKE_AND_AUDIT_PASS_LOCAL | RELEASE_CANDIDATE | 96-file packed artifact and eight-tool handshake | Independent review, tag, publication, and downloaded install pending |

`FULL` describes the declared file set for that artifact, not user usability, independent acceptance, merge, release, publication, deployment, or observed effectiveness.
