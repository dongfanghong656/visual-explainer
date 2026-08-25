# Task Proof Visualizer

An evidence protocol, Agent Skill, local MCP server, and diagram grammar for answering four questions without trusting an AI's own completion narrative:

1. What exactly did the implementation AI claim to complete?
2. Which claims are supported by primary implementation and verification evidence?
3. What did an independent review AI accept, downgrade, reject, or find missing?
4. What remains before the task can be called complete?

This plugin is developed inside a fork of [`visual-explainer`](../../README.md) and deliberately reuses its rendering strengths. Task Proof Visualizer produces structured proof manifests and Mermaid source; Visual Explainer can turn those semantics into polished HTML/SVG/PNG without becoming the source of truth.

## Architecture

```text
requirements + frozen checkpoint
              ↓
     producer claim manifest
              ↓
 validator ───┼──→ producer status/change-logic diagram
              ↓
 independent reviewer manifest
              ↓
       reconciliation engine
              ↓
 agreement/dispute diagram + exact next evidence
```

The system separates:

- **claim generation** from **claim validation**;
- **producer evidence** from **reviewer observation**;
- **semantic status** from **visual rendering**;
- **implemented** from **tested**, **merged**, **released**, and **deployed**.

## Files

- `SKILL.md` — complete producer/reviewer/reconciliation operating protocol.
- `commands/` — direct commands for each mode.
- `references/` — claim, evidence, review, diagram, and security standards.
- `schemas/task-proof.schema.json` — machine-readable manifest schema.
- `src/` — deterministic validation, comparison, rendering, and bounded workspace snapshot logic.
- `mcp/` — local stdio MCP server.
- `tests/` — unit and adversarial fixtures.

## Quick start

```bash
cd plugins/task-proof-visualizer/mcp
npm install --ignore-scripts
npm test
TASK_PROOF_ALLOWED_ROOTS=/path/to/project npm start
```

Then ask the implementation agent to run `/task-proof`. Give the resulting producer manifest to a separate review context and run `/task-proof-review`. Reconcile with `/task-proof-reconcile`.

## Core completion rule

A behavioral/code claim marked `done` is verified only when it has:

- at least one passing linked acceptance criterion;
- primary implementation evidence (`commit`, `diff`, `file`, or `artifact`);
- primary verification evidence (`test`, `build`, `runtime`, `trace`, or independent `review`);
- no failed evidence or unresolved blocker;
- no material unknown hidden from the task-level manifest.

A producer diagram, a checked task box, or “tests passed” in chat is `self_report` and cannot satisfy the rule alone.

## Outputs

The MCP can create an immutable bundle under `.task-proof/`:

```text
NAME.json
NAME.md
NAME.mmd
NAME.validation.json
```

Use separate names for producer, reviewer, and reconciliation runs. Existing bundles are not silently overwritten.

## Current maturity

`0.1.0` is a reviewable MVP. It provides deterministic validation, reconciliation, Mermaid generation, bounded Git snapshotting, safe bundle writes, unit tests, an MCP protocol smoke test, and CI. It has not yet been published as a package or merged into the upstream `visual-explainer` project.
