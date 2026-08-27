# Draft PR review brief — Task Contract Authority 2.3

## Purpose

Prevent an implementation AI from selecting an incomplete acceptance set and then using internally consistent evidence to claim the whole task passed.

## Review focus

1. Does the contract digest bind every authority, requirement, criterion, evidence-policy, review-policy, and lifecycle field?
2. Can a Claim omit or weaken a criterion snapshot without failing?
3. Can a receipt from another HEAD, claimant, or reviewer run be replayed?
4. Can a same-name named check change command semantics without detection?
5. Can a standalone reviewer level label replace a complete Review artifact?
6. Are missing evidence and hard tampering distinguished as `INCONCLUSIVE` versus `FAIL`?
7. Are exclusions, deferrals, supersession, and revocation visible in the final gate?

## Current boundary

This PR validates the isolated contract-authority core. It does not yet force existing public Author/Reviewer/MCP/Skill paths through that core. Merge and release remain blocked until mandatory integration and independent review are complete.
