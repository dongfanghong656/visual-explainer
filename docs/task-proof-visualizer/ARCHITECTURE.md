# Task Proof Visualizer — Architecture

## Components

```text
┌──────────────────────── Agent layer ────────────────────────┐
│ Producer Skill     Reviewer Skill     Reconciliation Skill  │
└──────────┬────────────────┬─────────────────────┬────────────┘
           │                │                     │
           v                v                     v
┌──────────────────── Manifest protocol ──────────────────────┐
│ task + acceptance + claims + evidence + checkpoint + risks  │
└──────────┬────────────────┬─────────────────────┬────────────┘
           │                │                     │
           v                v                     v
┌──────────────────── Deterministic core ─────────────────────┐
│ validateManifest   compareManifests   digestManifest        │
└──────────┬────────────────┬─────────────────────┬────────────┘
           │                │                     │
           v                v                     v
┌──────────────────── Read/write boundary ────────────────────┐
│ bounded Git snapshot     SHA-256 files     .task-proof write│
└──────────┬──────────────────────────────────────┬────────────┘
           │                                      │
           v                                      v
┌──────────────────── Presentation layer ─────────────────────┐
│ status Mermaid   change-logic Mermaid   review Mermaid / MD │
└─────────────────────────────────────────────────────────────┘
```

## Why extend Visual Explainer

`visual-explainer` already solves layout selection and polished visual explanation. It does not by itself establish whether an AI's completion claims are true. The new plugin adds the missing evidence/independent-review protocol and leaves high-quality visual export to the existing project.

This separation avoids coupling semantic truth decisions to HTML styling or diagram layout.

## Data flow

### Producer

```text
requirement → frozen checkpoint → claims → evidence → validation → diagram
```

The producer may revise malformed claims, but must not erase failed evidence or silently weaken fixed acceptance criteria.

### Reviewer

```text
same requirement + same checkpoint → independent inspection → reviewer manifest
```

The reviewer reads the producer narrative late to reduce anchoring.

### Reconciliation

```text
producer digest + reviewer digest → stable-ID comparison → agreement/dispute
```

No fuzzy name matching is used in v0.1.0. Stable IDs make omissions and renumbering visible.

## Trust boundaries

### Untrusted

- producer prose;
- manifest strings;
- filenames and Git metadata;
- Mermaid labels;
- test summaries not tied to reports;
- reviewer prose without reopenable evidence.

### Deterministic but not truth-establishing

- schema/protocol validation;
- manifest hashing;
- claim/evidence reference resolution;
- comparison by stable ID;
- diagram generation.

### Independently observed

- reviewer-reopened commit/diff/file;
- CI or test report tied to the head commit;
- runtime trace tied to the same build;
- release/deployment API evidence.

## Safety architecture

The MCP is intentionally not a general repository automation server.

It can:

- read bounded Git metadata;
- hash explicitly named files;
- validate in-memory manifests;
- generate text diagrams/reports;
- create immutable proof bundles inside `.task-proof/`.

It cannot:

- execute arbitrary shell or package commands;
- access network services;
- choose arbitrary output paths;
- overwrite existing proof runs;
- treat self-report as independent proof.

## Extension points

Future adapters should produce evidence objects without weakening the core protocol:

```text
GitHub checks adapter ─┐
JUnit/TAP parser ──────┼─→ canonical evidence[]
SARIF parser ─────────┤
Browser trace parser ─┤
Release registry ─────┘
```

Each adapter must preserve checkpoint identity, result, trust, locator, digest, and environment metadata.

## Failure behavior

- malformed manifest → `invalid` with errors;
- missing evidence → claim remains `unverified`;
- failed evidence → `contradicted`;
- workspace escape → MCP error, no write;
- existing output → MCP error, no overwrite;
- checkpoint mismatch → reviewer stops before reconciliation;
- renderer overflow → full data remains in JSON/Markdown; main diagram truncates by policy.
