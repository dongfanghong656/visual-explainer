# Task Proof implementation review — 0.2.0 hardening

## Review boundary

Reviewed branch: `chat/task-proof-visualizer/v0.1.0-recovery`, inherited from visual-explainer 0.10.0.

## Findings before hardening

| Severity | Finding | Consequence |
|---|---|---|
| Critical | Task Proof documentation existed without a dedicated callable MCP implementation | Agents could describe a protocol the runtime could not enforce |
| High | Claimant/reviewer separation was instructional rather than mechanical | The same run could self-approve |
| High | No computed completion gate | Unsupported work could appear complete |
| High | No CI workflow exercised Task Proof code and MCP registration | Missing wiring and regressions could go unnoticed |
| High | Evidence was not bound to a deterministic repository snapshot digest | Screenshots and claims could become stale silently |
| Medium | No safe evidence-probe surface | Reviewers either trusted prose or needed unrestricted shell execution |
| Medium | Rendering/output confinement lacked an adversarial contract | Traversal, stale artifacts, or unescaped content could undermine trust |

## Hardening implemented

- Added a local stdio MCP with snapshot, safe probe, claim, validation, and review tools.
- Added canonical SHA-256 claim, snapshot, review, and output-manifest digests.
- Enforced distinct claimant and reviewer run IDs.
- Made claimant self-verification fields invalid.
- Added deterministic safe probes with no shell or arbitrary command execution.
- Made review gates computed and downgrade-only.
- Added stale-snapshot detection, dirty-tree binding, path confinement, symlink rejection, limits, and XML escaping.
- Added a 16:9 claim/review SVG renderer and self-contained HTML wrapper.
- Added normative standard, threat model, JSON Schema, hardened commands, adversarial tests, and GitHub Actions checks.

## Remaining limits

- Test and build commands are intentionally not executed by the MCP; reviewer agents or CI must run them and supply structured receipts.
- SHA-256 binds content but is not an identity signature.
- External deployment, hardware, and user acceptance require evidence from those systems.
- The branch remains a review candidate; it is not merged, released, or deployed merely because local tests pass.
