# Diagram Grammar

## Purpose

The diagram explains status and causal change without replacing the evidence package.

## Visual hierarchy

Use this reading order:

1. objective or change thesis;
2. verified work;
3. partial/current work;
4. blockers or contradictions;
5. next work;
6. compact evidence notes;
7. checkpoint and verdict.

## Semantic colors

- green — independently supported or validator-verified;
- yellow — partial/in progress;
- orange — blocked;
- red — contradicted or failed;
- blue — next action;
- gray/dashed — unknown, self-report, or contextual evidence.

Color is redundant with text labels. Never encode status by color alone.

## Node grammar

A task/status node contains:

```text
CLAIM-ID · observable outcome
```

An evidence node contains:

```text
type: compact observation
```

An edge label is a relationship:

- `proves`
- `depends on`
- `blocks`
- `invalidates`
- `fixed by`
- `guarantees`
- `reviewed as`

Avoid vague edges such as `handles`, `processes`, `updates`, or `works with`.

## One-page limits

Default maximum:

- four verified claims;
- two active/partial claims;
- three blocked/contradicted claims;
- three next claims;
- two evidence notes per displayed claim;
- fourteen comparison claims in reconciliation view.

Overflow remains in JSON and Markdown. Material blockers are never hidden for layout reasons.

## Status view

Use a flowchart when the question is:

- what was completed;
- what is still active;
- what is blocked;
- what happens next;
- what evidence supports each statement.

Do not use a sequence diagram solely to list task status.

## Change-logic view

Use before/after causal lanes when the question is:

- why the old mechanism failed;
- what state or control-flow boundary changed;
- how cancellation or interruption works;
- what invariants the new mechanism establishes.

Required sections:

- one-sentence change thesis;
- old failure chain;
- new controlled path;
- concurrent interrupts or invalidation;
- invariants;
- evidence locators in the companion report.

## Review view

Show producer and reviewer as separate sources. Each claim node states:

```text
CLAIM-ID · outcome
P:<producer verdict> · R:<reviewer verdict>
```

Do not merge producer and reviewer into one status before reconciliation.

## Accessibility

- Provide Markdown alongside every diagram.
- Keep labels short and readable at 1920×1080.
- Use explicit symbols/words in addition to color.
- Avoid crossed edges and dense evidence clouds.
- Preserve logical order in source for screen-reader fallback.

## Rendering integrity

Visual polishing may change layout, font, spacing, and theme. It may not change:

- claim status;
- evidence relationship;
- checkpoint;
- omissions;
- contradiction;
- review disagreement.

Revalidate the manifest after semantic edits.
