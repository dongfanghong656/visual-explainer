# Release status

## REL-0001 — Task Proof repository-authority alpha

- Candidate package: `0.11.0-alpha.1`
- Contract-core candidate: `2.4.0`
- Public-enforcement candidate: `1.0.0`
- Release state: `GITHUB_PRERELEASE_DEPLOYED`
- Release decision: `PUBLISHED_AND_DEPLOYED_WITH_R2_LIMITS`
- Local development deployment: npm-linked package and three binaries; Task Proof binary handshake PASS
- Clean package deployment: locked 97-file artifact install and eight-tool Task Proof handshake PASS
- Selected publication channel: GitHub prerelease asset; the unscoped npm name remains owned by upstream
- Tag/release/publication/deployment: `v0.11.0-alpha.1` published and installed from the public asset
- Historical integration PR: #2 closed as superseded
- Historical contract-core stacked PR: #3 closed as superseded
- Combined public/release PR: #4 merged to `main` as `d83a072`

## Deployment readback

- Final PR run: `33077809112`, Node 20/22 and R2 `PASS_WITH_LIMITS` at `96afc5f`.
- Release run: `33077966508`, tag `v0.11.0-alpha.1` at merge `d83a072`.
- Public asset: `visual-explainer-0.11.0-alpha.1.tgz`, 97 files, SHA-256 `11bb3dc3c5e69acf60128b517c08149ff8b5c8f703c48a93d4c9212be0e8be72`.
- Host deployment: normal global npm install `0.11.0-alpha.1`, deployed eight-tool handshake PASS, Skill installed at `C:\codex-home\skills\visual-explainer`, Codex MCP `visual-explainer-task-proof` enabled.

## Claims explicitly not made

- Automated exact-head R2 acceptance is `PASS_WITH_LIMITS`; no different-human/model R3 acceptance exists.
- No npm registry publication, stable release, MCP registry publication, hardware validation, scientific validation, or long-term user-outcome observation is claimed.

## Remaining promotion boundary

There is no remaining blocker for the declared repository-authority alpha deployment. A stable release still requires explicit scope, a different-human/model R3 review, reconciliation of the open requirement-omission/external-authority limitations, and observed deployment outcomes.
