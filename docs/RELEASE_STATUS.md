# Release status

## REL-0001 — Task Proof development candidate

- Candidate package: `0.11.0-alpha.1`
- Contract-core candidate: `2.4.0`
- Public-enforcement candidate: `1.0.0`
- Release state: `RELEASE_CANDIDATE`
- Release decision: `USER_AUTHORIZED_PENDING_REVIEW_MERGE_TAG`
- Local development deployment: npm-linked package and three binaries; Task Proof binary handshake PASS
- Clean package deployment: locked 96-file artifact install and eight-tool Task Proof handshake PASS
- Selected publication channel: GitHub prerelease asset; the unscoped npm name remains owned by upstream
- Tag/release/publication/production deployment: pending
- Main integration PR: draft #2
- Contract-core stacked PR: draft #3
- Combined public/release PR: #4, to be retargeted to `main`

## Current release blockers

1. The release-hardening delta requires exact-head Node 20/22 CI after push.
2. The exact-head `Independent R2 release review` CI check must pass and retain its stated automated-review limitations.
3. PR #4 must integrate the full stack into `main` before tagging.
4. The GitHub prerelease asset must be installed from its public URL and rechecked before deployment is claimed.

## Claims explicitly not made

- The integrated staging branch is not yet merged.
- The local npm link and clean temporary installation are deployment tests, not public package publication.
- No final independent acceptance exists.
- No GitHub release, tag, npm/MCP registry publication, production deployment, hardware validation, scientific validation, or user-outcome observation exists yet.

## Release procedure

1. Push the reviewed release-hardening commit and require Node 20/22 success for its exact PR #4 HEAD.
2. Retarget PR #4 to `main`, mark it ready, require the distinct exact-head R2 CI review, reconcile any failure, then merge without rewriting the branch history.
3. Tag the merged release commit `v0.11.0-alpha.1`; the tag workflow must pass `verify:release` and the default production dependency audit before creating a GitHub prerelease.
4. Download and install the public `.tgz` asset, run the eight-tool MCP handshake, install the versioned Skill, register the MCP server in Codex, and record the readback.
