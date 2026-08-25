# Task Proof Visualizer — Requirements

## User problem

Long-running AI development frequently fails at the reporting boundary: the implementation AI says a task is complete, but the human cannot quickly determine what changed, why the mechanism works, which tests prove it, what remains, or whether a second AI independently agrees.

A useful solution must be concise enough to inspect as one image while retaining an auditable machine-readable evidence trail.

## Product objective

Create a reusable Skill/MCP extension to `visual-explainer` that lets an implementation AI produce evidence-backed completion diagrams and lets a separate review AI evaluate the same claims at the same repository checkpoint.

## Required capabilities

### R-001 — Frozen checkpoint

Every proof records repository, branch, base, head, dirty state, and artifact/report digests where applicable.

### R-002 — Bounded claims

The producer decomposes work into stable, falsifiable claims instead of listing changed files or declaring broad completion.

### R-003 — Evidence gate

A behavioral/code claim cannot evaluate as verified from self-report alone. It requires primary implementation and primary verification evidence plus passed acceptance criteria.

### R-004 — Failure preservation

Failed evidence, blocked work, partial work, unknowns, and contradictions remain visible in manifests and diagrams.

### R-005 — Independent review

A reviewer AI uses the same schema and stable claim IDs, reopens evidence, records `accepted`, `partial`, `rejected`, or `unverified`, and may add omitted claims.

### R-006 — Deterministic reconciliation

The system compares producer and reviewer manifests and exposes agreements, downgrades, disputes, missing reviews, and reviewer-only claims.

### R-007 — One-page status diagram

The main status diagram shows objective, verified work, partial/current work, blockers/contradictions, next work, evidence notes, checkpoint, and overall verdict.

### R-008 — Change-logic diagram

For mechanism changes, the system can show the old failure chain, new controlled path, asynchronous/user interrupts, and invariants.

### R-009 — Human-readable companion

Every diagram has a Markdown companion and a JSON manifest. The image is not the only record.

### R-010 — Local safe MCP

The MCP uses stdio, performs no network operations, accepts no arbitrary shell commands, uses fixed read-only Git commands, and writes only under `.task-proof/` in allowlisted workspaces.

### R-011 — Bounded context use

The proof package cites locators and digests rather than embedding full diffs, logs, or large documents.

### R-012 — Immutable evidence runs

The writer refuses to silently overwrite an existing proof bundle.

### R-013 — Clear lifecycle distinctions

Implemented, tested, committed, merged, released, published, deployed, and observed-in-use are distinct claims with distinct evidence.

### R-014 — Cross-agent usability

The protocol is expressed as a portable Agent Skill and MCP rather than depending on one model's private memory.

### R-015 — Automated tests

Core validation, contradiction handling, reconciliation, sanitization, workspace boundaries, immutable writes, and MCP tool discovery have automated tests.

## Non-goals for v0.1.0

- Running arbitrary project tests from the MCP.
- Proving absence of all defects.
- Automatic semantic truth extraction from arbitrary source code.
- Replacing GitHub, issue trackers, CI, or project specifications.
- Publishing to npm or an MCP registry.
- Upstream merge into `nicobailon/visual-explainer`.
- Pixel-perfect PNG export inside the Task Proof MCP; existing Visual Explainer or Mermaid CLI provides final rendering.

## Success condition

The MVP is acceptable for review when a producer fixture with paired evidence validates as complete, a self-report-only claim is rejected as unverified, a failed test contradicts completion, reviewer disagreement is visible, filesystem boundaries are tested, the stdio MCP lists and runs its tools, and CI executes on supported Node versions.
