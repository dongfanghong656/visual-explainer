# Release status

## REL-0001 — Task Proof development candidate

- Candidate package: `0.11.0-alpha.1`
- Contract-core candidate: `2.4.0`
- Public-enforcement candidate: `1.0.0`
- Release state: `RELEASE_CANDIDATE`
- Release decision: `USER_AUTHORIZED_R2_PASS_WITH_LIMITS_PENDING_MERGE_TAG`
- Local development deployment: npm-linked package and three binaries; Task Proof binary handshake PASS
- Clean package deployment: locked 97-file artifact install and eight-tool Task Proof handshake PASS
- Selected publication channel: GitHub prerelease asset; the unscoped npm name remains owned by upstream
- Tag/release/publication/production deployment: pending
- Main integration PR: draft #2
- Contract-core stacked PR: draft #3
- Combined public/release PR: ready #4, targeting `main`

## Current release blockers

1. The final report-state compatibility repair must pass exact-head Node 20/22 and R2 checks.
2. PR #4 must integrate that exact-head stack into `main` before tagging.
3. The GitHub prerelease asset must be installed from its public URL and rechecked before deployment is claimed.

## Claims explicitly not made

- The integrated staging branch is not yet merged.
- The local npm link and clean temporary installation are deployment tests, not public package publication.
- Automated exact-head R2 acceptance is `PASS_WITH_LIMITS`; no different-human/model R3 acceptance exists.
- No GitHub release, tag, npm/MCP registry publication, production deployment, hardware validation, scientific validation, or user-outcome observation exists yet.

## Release procedure

1. Require Node 20/22 plus the distinct exact-head R2 review to succeed for the final documentation-only PR #4 HEAD.
2. Merge the ready PR #4 to `main` without rewriting the branch history.
3. Tag the merged release commit `v0.11.0-alpha.1`; the tag workflow must pass `verify:release` and the default production dependency audit before creating a GitHub prerelease.
4. Download and install the public `.tgz` asset, run the eight-tool MCP handshake, install the versioned Skill, register the MCP server in Codex, and record the readback.
