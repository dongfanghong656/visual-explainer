# Decision register

## DEC-0001 — Fork visual-explainer

- Status: ACCEPTED
- Decision: Build Task Proof as an additive fork of `nicobailon/visual-explainer`.
- Rationale: the upstream already provides a strong visual Skill, command architecture, self-contained HTML conventions, and local MCP foundation.

## DEC-0002 — Separate author claim from reviewer verdict

- Status: ACCEPTED
- Decision: author states remain declarations; green/accepted states require a distinct review run with exact-scope evidence.

## DEC-0003 — Structured bundle is the source of truth

- Status: ACCEPTED
- Decision: deterministic diagrams are projections of validated JSON and cannot change semantics.

## DEC-0004 — Local constrained MCP

- Status: ACCEPTED
- Decision: evidence collection and rendering operate locally over stdio with bounded paths and no embedded LLM/network behavior.

## DEC-0005 — One canonical strict runtime

- Status: ACCEPTED
- Date: 2026-08-27
- Decision: only the strict validator/snapshot/receipt/gate/artifact/renderer chain may authorize current Task Proof semantics. Legacy protocols remain historical tombstones, not parallel authorities.
- Consequence: public adapters must delegate to the strict runtime and source-integrity tests must reject weaker duplicate paths.

## DEC-0006 — Claimant-selected criteria cannot prove requirement completeness

- Status: ACCEPTED
- Date: 2026-08-27
- Decision: final acceptance requires a frozen Task Contract whose authority sources, requirements, coverage, criteria, evidence policy, reviewer policy, lifecycle, and amendments precede and bind the Claim.
- Consequence: claimant-provisional contracts are permitted only for planning/visualization and can never yield final PASS.

## DEC-0007 — Derived passing status requires trusted revalidation

- Status: ACCEPTED
- Date: 2026-08-27
- Decision: authority, evidence, named-check, and lifecycle results must be revalidated through trusted adapters/verifiers. Caller-supplied `PASS` strings, assurance labels, or reviewer-level assertions are not authority.
- Consequence: missing verifiers are INCONCLUSIVE; digest, identity, chronology, policy, source, or explicit trusted-verifier rejection is FAIL.

## DEC-0008 — Public adapters and tools are explicit server capabilities

- Status: ACCEPTED
- Date: 2026-08-27
- Decision: public final-gate adapters are in-process function factories in one immutable registry, and every public `task_proof_*` MCP tool must have an explicit reviewed classification before registration.
- Consequence: request JSON cannot inject verifier functions or adapter identities; missing adapters and unclassified future tools fail closed.

## DEC-0009 — Publish the alpha through a verified GitHub release artifact

- Status: ACCEPTED
- Date: 2026-08-27
- Decision: publish `0.11.0-alpha.1` as a GitHub prerelease artifact after exact-head CI, distinct review, and a clean packed-install handshake. Do not publish under the upstream-owned unscoped npm name.
- Consequence: the tag workflow installs the lockfile with lifecycle scripts and optional peers disabled, verifies source/tests/MCP/packed installation, audits the default dependency set, and only then creates the prerelease. Pi and PPTX libraries remain optional operator-installed peers.

## DEC-0010 — Use a separate exact-head CI job for the alpha R2 evidence lane

- Status: ACCEPTED
- Date: 2026-08-27
- Decision: after both Node matrix jobs pass, a separate GitHub Actions job checks out the literal PR head, reconstructs every accepted repository requirement, reruns the locked release gate and audit, and emits an R2 `PASS_WITH_LIMITS` review record.
- Consequence: this supplies a distinct deterministic reviewer run without claiming a different human/model or universal omission detection. The check must pass for the exact merge candidate, and its stated limitations remain release-visible.

## DEC-0011 — Bind each local Skill to its own MCP server

- Status: ACCEPTED
- Date: 2026-09-04
- Decision: keep the general renderer and Task Proof as two explicitly named local stdio MCP servers, and declare each dependency in the corresponding Skill metadata.
- Rationale: a deployed package or copied Skill does not make an unregistered tool callable, while combining unrelated tool contracts would blur their activation boundaries.
- Consequence: local installation and release verification must check the three-tool renderer and eight-tool Task Proof surfaces separately; Codex must restart before a previously running desktop process can consume config changes.
