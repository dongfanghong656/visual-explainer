# Task Proof Visualizer — Decisions

## D-001 — Modify Visual Explainer rather than start from an empty repository

**Decision:** develop as an additive plugin in a fork of `nicobailon/visual-explainer`.

**Reason:** Visual Explainer already provides strong visual rendering and project recap concepts. The missing capability is evidence-backed completion semantics and independent review, not another diagram engine.

## D-002 — Separate semantic proof from visual presentation

**Decision:** JSON manifest and deterministic verdicts are authoritative; Mermaid/Markdown/HTML are views.

**Reason:** visual polish must never change task status, evidence, or reviewer disagreement.

## D-003 — Use a two-agent producer/reviewer protocol

**Decision:** producer validation is provisional; final acceptance requires a reviewer manifest at the same checkpoint.

**Reason:** the implementation AI has strong anchoring and incentive to rationalize its own work.

## D-004 — Require paired evidence for behavioral completion

**Decision:** a `done` code/behavior claim needs both implementation and verification evidence.

**Reason:** code existence does not prove behavior, while a test result without a corresponding implementation checkpoint is ambiguous.

## D-005 — Treat self-report as an explicit low-trust evidence class

**Decision:** preserve self-report for context but never let it verify completion alone.

**Reason:** deleting self-report would lose intent; accepting it would recreate the original problem.

## D-006 — Match review claims by stable ID, not fuzzy text

**Decision:** producer and reviewer use stable IDs; reviewer-only omissions get separate IDs.

**Reason:** fuzzy matching can conceal renamed, split, or omitted claims.

## D-007 — Stop reconciliation on checkpoint mismatch

**Decision:** repository, branch, base, head, and task ID must match.

**Reason:** comparing different code versions produces false agreements and disputes.

## D-008 — Keep the MCP read-only with respect to project execution

**Decision:** snapshot uses fixed Git commands and never runs caller-supplied tests or shell commands.

**Reason:** arbitrary execution would make a visualization/evidence MCP a high-risk automation server.

## D-009 — Write only immutable bundles beneath `.task-proof/`

**Decision:** safe names, allowlisted roots, no overwrite, symlink rejection, rollback on partial write.

**Reason:** proof artifacts should not silently replace prior evidence or escape the repository.

## D-010 — Reuse Visual Explainer for final HTML/SVG/PNG

**Decision:** Task Proof Visualizer emits semantically constrained Mermaid/Markdown; final rendering remains a separate layer.

**Reason:** avoids duplicating mature rendering code and preserves a small auditable core.

## D-011 — Generate CI producer proof dynamically

**Decision:** GitHub Actions creates a manifest using the actual `GITHUB_SHA`, test-log digest, and workflow run locator.

**Reason:** committed proof files cannot contain their own final commit SHA without self-reference; CI can freeze the exact checkpoint after checkout.

## D-012 — Keep v0.1.0 unpublished

**Decision:** no package registry, release tag, or upstream claim until independent review, clean-install verification, and visual inspection close.

**Reason:** implementation and local/CI tests are not the same as a verified distributable release.
