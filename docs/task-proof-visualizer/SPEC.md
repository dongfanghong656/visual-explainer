# Task Proof Visualizer — v0.1.0 Specification

## 1. Product shape

Task Proof Visualizer is an additive plugin in the `visual-explainer` fork. It consists of:

1. a portable Agent Skill defining producer, reviewer, and reconciliation behavior;
2. a JSON manifest schema;
3. a deterministic validation/reconciliation library;
4. bounded Git workspace snapshot logic;
5. Mermaid/Markdown renderers;
6. a local stdio MCP server;
7. direct CLI commands and automated tests.

## 2. Trust model

The system separates four trust levels:

```text
producer statement
    ↓ self-report only
producer manifest validated structurally
    ↓ evidence-consistent but not independent
reviewer reopens evidence at same checkpoint
    ↓ independently observed
producer/reviewer reconciliation
    ↓ accepted, disputed, or incomplete review
```

Validation does not establish that an evidence object is truthful. Final acceptance requires a reviewer to reopen evidence at the frozen checkpoint.

## 3. Manifest model

### 3.1 Top-level fields

- `manifestVersion`: currently `1.0`.
- `mode`: `producer` or `reviewer`.
- `project`: name, repository, branch, base, head.
- `task`: stable ID, title, objective.
- `checkpoint`: timestamp and actor.
- `acceptance`: falsifiable criteria and status.
- `evidence`: reopenable observations.
- `claims`: bounded assertions.
- `unknowns`, `risks`, `nextActions`.
- optional `changeLogic`.

### 3.2 Evidence

Evidence types:

- implementation: `commit`, `diff`, `file`, `artifact`;
- verification: `test`, `build`, `runtime`, `review`, `trace`;
- context: `requirement`.

Evidence has `result` and `trust`. `self_report` cannot independently verify a done claim.

### 3.3 Claims

Claim statuses:

- `done`;
- `partial`;
- `not_done`;
- `blocked`;
- `unknown`.

Reviewer disposition:

- `accepted`;
- `partial`;
- `rejected`;
- `unverified`.

Claim IDs remain stable between producer and reviewer.

## 4. Validation algorithm

For every claim:

1. resolve referenced evidence and acceptance criteria;
2. reject missing references and duplicate IDs;
3. preserve failed evidence;
4. map explicit incomplete statuses to `not_done`, `blocked`, `unknown`, or `partially_verified`;
5. for `done` behavioral categories, require:
   - linked acceptance criteria;
   - all linked criteria pass;
   - at least one independently observed passing item;
   - at least one primary item;
   - primary implementation evidence;
   - primary verification evidence;
   - no failed evidence;
   - no unresolved blocker;
6. produce `verified`, `partially_verified`, `unverified`, `contradicted`, `blocked`, `not_done`, or `unknown`.

Overall status:

- `invalid` — schema/protocol errors;
- `contradicted` — failed evidence or criterion;
- `verified_complete` — every claim verified, all criteria pass, no unknowns;
- `partial` — evidenced progress but incomplete;
- `unverified` — no sufficient verified progress.

## 5. Reconciliation algorithm

Match claims by ID across producer and reviewer manifests.

Outcomes:

- `agreed`;
- `downgraded`;
- `upgraded`;
- `disputed`;
- `not_reviewed`;
- `reviewer_only`.

Overall reconciliation:

- `agreed` only when both manifests are valid and every claim verdict agrees;
- `disputed` when a producer claim is downgraded or contradicted;
- `incomplete_review` when coverage is missing or only one side adds a claim.

The comparison includes both manifest SHA-256 digests.

## 6. MCP tools

### `task_proof_template`

Returns an intentionally incomplete producer/reviewer skeleton.

### `task_proof_snapshot`

Inputs:

- allowlisted workspace root;
- optional base ref;
- head ref;
- up to 50 named evidence files.

Returns:

- branch/base/head;
- dirty status and bounded status lines;
- recent commits;
- bounded diff name/status and stat;
- SHA-256 and size for named files.

It executes fixed `git` argument arrays only.

### `task_proof_validate`

Returns deterministic structural and evidence verdicts.

### `task_proof_render`

Returns Mermaid or Markdown for status/change-logic views.

### `task_proof_write_bundle`

Writes JSON, Markdown, Mermaid, and validation JSON beneath `.task-proof/` and refuses overwrite.

### `task_proof_compare`

Returns producer/reviewer reconciliation.

### `task_proof_render_review`

Returns one-page Mermaid reconciliation source.

## 7. Diagram grammar

Status view:

```text
objective → verified / partial / blocked / next / unknown
                  ↑ compact evidence notes
                  ↓ checkpoint + verdict
```

Change-logic view:

```text
old failure chain -. fixed by .→ new controlled path
                                      ↑ invalidation interrupts
                                      ↓ invariants
```

Review view:

```text
producer manifest → per-claim comparison ← reviewer manifest
                              ↓
                        reconciliation
```

The renderer truncates labels and strips risky Mermaid markup delimiters.

## 8. Filesystem and execution safety

- `TASK_PROOF_ALLOWED_ROOTS` defines permitted roots.
- Real paths are checked against allowlisted roots.
- Evidence paths cannot escape the Git workspace.
- Evidence contents are not returned; only bounded metadata/hash is captured.
- Output names use a strict filename grammar.
- Outputs are restricted to `.task-proof/`.
- Writes are atomic and existing proof files are not overwritten.
- Git calls use `execFileSync`, fixed arguments, timeout, and output limits.
- The MCP does not execute tests or caller-provided commands.

## 9. Compatibility

- Node.js 20 and 22 are CI targets.
- The MCP uses the Model Context Protocol SDK and zod.
- The generated Mermaid is renderer-agnostic and can be polished by Visual Explainer.
- JSON schema is Draft 2020-12.

## 10. Versioning

Manifest semantics use `manifestVersion`. Plugin/package versions follow semantic versioning.

Breaking changes include:

- changing completion rules;
- renaming verdicts;
- altering required manifest fields;
- changing reconciliation identity rules;
- changing security boundaries.

## 11. Deferred work

- JSON Schema runtime validation via Ajv or equivalent;
- signed/attested evidence records;
- GitHub PR/check-run evidence adapters;
- JUnit/TAP/SARIF parsers;
- first-class HTML/SVG export in this plugin;
- reviewer sampling policies for very large claim sets;
- upstream contribution strategy.
