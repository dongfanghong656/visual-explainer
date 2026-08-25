# Project charter — Visual Explainer Task Proof

## Identity

- Project ID: `task-proof-visualizer`
- Repository: `dongfanghong656/visual-explainer`
- Managed branch: `chat/task-proof-visualizer/v0.1.0`
- Base project: `nicobailon/visual-explainer`, MIT licensed
- Current candidate: `0.11.0-alpha.1`
- Charter status: ACCEPTED
- Date: 2026-08-25

## Problem

AI implementation agents frequently describe completion in prose, list changed files, or generate attractive diagrams without proving that the declared scope, behavior, and acceptance criteria were actually implemented. The same agent may then implicitly approve its own work. This produces false completion, weak handoff, and diagrams that explain intent rather than the implemented mechanism.

## Mission

Create a deployable Skill plus local MCP extension that converts an AI completion statement into:

1. an exact-scope, evidence-bound author claim;
2. a deterministic visual explanation of the change logic and remaining work;
3. an independent reviewer bundle using the same protocol and fresh evidence;
4. an auditable verdict that cannot turn green merely because the author says it is complete.

## Success definition

The alpha succeeds when a supported host can capture a repository snapshot, validate and render an author claim, independently validate and render a review, preserve exact scope and evidence references, visibly distinguish claim from verification, and refuse structurally invalid overclaims.

## Principles

- Repository evidence outranks conversational memory.
- JSON bundle is source of truth; HTML is a deterministic projection.
- Author and reviewer are different roles and runs.
- Amber means claimed; green means independently verified.
- Every arrow explains an event, state transition, read/write, cancellation, or verification action.
- Completion, usability, verification, and release are separate axes.
- Missing or external evidence stays visible.
- The extension must remain local, inspectable, and compatible with upstream visual-explainer behavior.

## Non-goals

See `PROJECT_AGENT.md`. In particular, this project does not claim cryptographic reviewer identity, semantic proof from schema validation, automatic release authority, or external/hardware/production validation.

## Milestones

| Milestone | Exit condition | Current state |
|---|---|---|
| M1 Protocol and data model | Author/reviewer contracts and executable validation exist | DONE |
| M2 Deterministic visualizer | Claims/reviews render safely with causal diagrams and evidence tables | DONE |
| M3 MCP and Skill integration | Commands/resources/tools are wired and statically valid | DONE_WITH_LIMITATION |
| M4 Clean-install end-to-end validation | Real MCP client invokes all Task Proof tools in a clean checkout | BLOCKED |
| M5 Alpha review and release decision | Draft PR reviewed; release gates explicitly accepted or rejected | NOT_STARTED |
