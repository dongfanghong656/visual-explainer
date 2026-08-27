# Draft PR review brief — Task Contract Authority 2.4

## Purpose

Prevent an implementation AI from selecting an incomplete acceptance set and then using internally consistent evidence, generic adapters, or caller-supplied passing labels to claim the whole task passed.

## Review focus

1. Does the contract digest bind every authority, requirement, criterion, evidence-policy, review-policy, and lifecycle field?
2. Can a Claim omit or weaken a criterion snapshot without failing?
3. Can an extra, unknown, wrong-HEAD, claimant-owned, or wrong-reviewer receipt be replayed?
4. Can a same-name named check change policy, executable, arguments, cwd, result, reviewer, or Claim HEAD without detection?
5. Can a standalone reviewer level or context-free verifier replace a complete Review/evidence artifact?
6. Are missing evidence and hard tampering distinguished as `INCONCLUSIVE` versus `FAIL`?
7. Are exclusions, deferrals, supersession, and revocation visible in the final gate?
8. Do public integrations use `contract-final-gate.mjs` rather than the lower-level primitive?

## Current boundary

This PR validates the isolated contract-authority core and strict orchestration boundary. It does not yet force existing public Author/Reviewer/MCP/Skill paths through that boundary. Merge and release remain blocked until mandatory integration and independent review are complete.
