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
