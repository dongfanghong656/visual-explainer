# Artifact registry

| ID | Path/scope | Version | Completeness | Usability | Verification | Release | Evidence boundary | Limitations |
|---|---|---|---|---|---|---|---|---|
| ART-0001 | Base Task Proof protocol/schema/examples | Protocol 1.x | FULL for declared alpha | DEVELOPMENT_USABLE | TESTED_PRIOR_BASELINE | PROVISIONAL | Controlled tests | Superseded trust semantics remain historical only |
| ART-0002 | Strict validation, snapshot, receipts, and gates | Strict 0.2 | FULL for current strict core | ALPHA_DEPLOYED | EXACT_HEAD_CI_R2_AND_TAG_VERIFIED | GITHUB_PRERELEASE | Node 20/22 CI, R2, tag workflow, and adversarial tests | No different-human/model R3 review |
| ART-0003 | Deterministic status/change/review renderer | 0.11 alpha | FULL for current views | DEVELOPMENT_USABLE | TESTED_LOCAL_CURRENT_HEAD | PROVISIONAL | Contract overlay/renderer tests | No independent visual acceptance |
| ART-0004 | Public Skill, commands, and MCP | 0.11 alpha | FULL for contract-enforced surface | ALPHA_DEPLOYED | PUBLIC_ASSET_INSTALL_AND_MCP_READBACK_PASS | GITHUB_PRERELEASE | Checkout, packed, public-download, global binary, Skill, and Codex MCP readback | Current Codex process may require a new task to load the newly installed Skill |
| ART-0005 | Project governance and continuity records | 1.0 | FULL through TURN-0005 deployment | DEVELOPMENT_USABLE | STATIC_CHECKED | RELEASE_RECORD | Repository records | Deployment-record commit follows the immutable release tag |
| ART-0006 | Task Contract authority runtime/schema/tests/spec | Contract 2.4.0; receipt 1.4.0 | FULL for integrated core | ALPHA_DEPLOYED | EXACT_HEAD_CI_R2_AND_TAG_VERIFIED | GITHUB_PRERELEASE | Final PR and release-tag scope | External authority adapters remain unsupported |
| ART-0007 | Trusted adapter registry and MCP default-deny registration | Public enforcement 1.0.0 | FULL for four repository-owned adapter kinds | ALPHA_DEPLOYED | EXACT_HEAD_CI_R2_AND_TAG_VERIFIED | GITHUB_PRERELEASE | Focused tests, strict suite, and deployed MCP handshake | External non-repository authority types unsupported and fail closed |
| ART-0008 | Locked package and GitHub prerelease workflow | Package 0.11.0-alpha.1 | FULL for GitHub release channel | ALPHA_DEPLOYED | TAG_WORKFLOW_AND_PUBLIC_DOWNLOAD_READBACK_PASS | GITHUB_PRERELEASE | 97-file artifact, audit, digest, and eight-tool handshake | Not published to the upstream-owned npm name |
| ART-0009 | `visual-explainer-0.11.0-alpha.1.tgz` | GitHub release `v0.11.0-alpha.1` | FULL for declared default package | HOST_DEPLOYED | SHA256_AND_INSTALLED_READBACK_PASS | GITHUB_PRERELEASE | Asset SHA-256 `11bb3dc3...e0e8be72`; global package, Skill, Codex MCP | Optional Pi/PPTX peers omitted; alpha only |

`FULL` describes the declared file set for that artifact, not user usability, independent acceptance, merge, release, publication, deployment, or observed effectiveness.
