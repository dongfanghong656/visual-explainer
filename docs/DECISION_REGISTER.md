# Decision register

## DEC-0001 — Fork visual-explainer

- Status: ACCEPTED
- Date: 2026-08-25
- Decision: Build Task Proof as an additive fork of `nicobailon/visual-explainer` rather than a standalone renderer.
- Rationale: the upstream already has a mature visual Skill, command architecture, self-contained HTML conventions, quick renderer, and local stdio MCP foundation.
- Consequence: preserve MIT attribution and avoid unrelated upstream regressions.

## DEC-0002 — Separate author claim from reviewer verdict

- Status: ACCEPTED
- Date: 2026-08-25
- Decision: author states remain amber and `claimed-*`; green and `verified-*` require a distinct reviewer run with exact-scope evidence.
- Rationale: the implementing AI must not approve its own work through wording or color.
- Consequence: two bundles/workflows and explicit stale-scope handling are mandatory.

## DEC-0003 — JSON bundle is the source of truth

- Status: ACCEPTED
- Date: 2026-08-25
- Decision: render HTML deterministically from validated JSON; do not let the agent hand-edit a prettier authoritative page.
- Rationale: machine validation, reproducibility, evidence references, and reviewer reuse require a stable structured contract.
- Consequence: HTML is a projection and sidecar preservation is required.

## DEC-0004 — Local constrained MCP

- Status: ACCEPTED
- Date: 2026-08-25
- Decision: snapshot and render locally over stdio, with workspace/output path restrictions and no embedded network/LLM behavior.
- Rationale: minimizes credential/privacy exposure and keeps evidence collection inspectable.
- Consequence: semantic correctness remains reviewer-owned; output-pair atomicity and clean-host validation remain explicit risks.
