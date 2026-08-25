# Task Proof Visualizer — evidence-backed author and reviewer diagrams

## What changed

- Adds a Task Proof Protocol 1.1 and schema.
- Adds author-claim and reviewer-review commands.
- Adds a standalone stdio MCP for Git collection, validation, rendering, and comparison.
- Adds deterministic 1600×900 SVG/HTML claim and review views.
- Requires explicit evidence-to-claim binding, reproducible test/build evidence, freshness, scope binding, and reviewer-run identity.
- Prevents same-run self-review from producing approval.
- Adds output-path guards, adversarial tests, project self-audit artifacts, and clean-run CI.

## Current evidence boundary

Local tests and project self-audit pass. The same-run review is intentionally `INCONCLUSIVE`. Clean GitHub Actions and a distinct reviewer run remain required before merge or release.

## Review focus

1. Can unrelated evidence ever upgrade a claim?
2. Can an author run disguise itself as an independent reviewer?
3. Does every approval-contributing assessment have claim-local reviewer evidence?
4. Are output writes and input sizes adequately bounded?
5. Do the one-screen claim/review views remain readable without hiding uncertainty?
