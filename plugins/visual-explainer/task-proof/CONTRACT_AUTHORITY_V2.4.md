# Task Contract Authority Protocol 2.4

## Status

- Protocol version: `2.4.0`
- Authority receipt version: `1.4.0`
- Evidence assessment version: `1.0.0`
- Named-check receipt version: `1.0.0`
- Lifecycle assessment version: `1.0.0`
- Implementation: `contract-authority.mjs`
- Portable schema: `task-contract.schema.json`
- Example: `examples/task-contract.example.json`
- Integration status: isolated contract core; mandatory public MCP/Skill enforcement remains a separate task.

## Purpose

A Task Proof result must not become green because the implementing agent selected an incomplete requirement subset, created a same-name but weaker test, invented a reviewer level, or passed a bare string such as `evidenceGate=PASS` into a gate calculator.

Protocol 2.4 freezes the task contract and makes every acceptance-contributing derived result verifier-bound.

## Trust chain

```text
Authority sources
  ↓ explicit source requirements and coverage dispositions
Frozen task contract
  ↓ deterministic contract digest
Author Claim
  ↓ exact criterion snapshot and Git scope
Authority receipt set
  ↓ every source revalidated by the final reviewer through trusted adapters
Complete Review artifact
  ↓ Claim digest, exact repository scope, receipt set, identity, procedure, chronology
Trusted evidence assessment
  ↓ strict evidence/review engine revalidation
Trusted named-check receipts
  ↓ policy, executable, arguments, cwd, result, reviewer, Claim HEAD
Trusted lifecycle assessment
  ↓ implementation/release/deployment state verifier
Minimum final gate
```

## Deterministic contract

The validator rejects unknown fields, unsafe or mutable repository paths/revisions, duplicate stable IDs, unused sources, asymmetric requirement-to-criterion mappings, contradictory included/excluded paths, non-covered requirements that retain criterion links, and named checks whose frozen evidence kind does not match the criterion.

Canonical JSON accepts plain JSON objects, arrays, strings, booleans, null, and safe integers only. Cyclic arrays/objects, dates, class instances, floating-point values, and non-JSON values are rejected.

## Requirement coverage

Every authority source must be represented by at least one source requirement. Every covered requirement and criterion link is bidirectional. Non-covered requirements are explicit and require an authority reason; they cap source coverage at `PASS_WITH_LIMITS`.

This does not prove that a model extracted every requirement from unstructured source text. Requirement extraction itself still requires a trusted host/reviewer adapter and remains visible as a limitation.

## Authority receipt set

A final authority result verifies one receipt for every declared source. Each receipt binds the contract, source, repository, implementation base, exact Claim HEAD, final reviewer run, chronology, source digest, adapter identity, and adapter receipt. Repository sources additionally bind ancestry, unchanged implementation scope, safe Git configuration, regular-file type, symlink status, and size.

A missing source receipt is `INCONCLUSIVE`; a duplicate, tampered, wrong-HEAD, wrong-reviewer, adapter-rejected, or source-mismatched receipt is `FAIL`.

## Review binding

The Review must bind the complete authority receipt digest set, Claim digest, contract, exact repository identity/base/head, reviewer role and session, procedure level, and chronology. R2 requires reconstruction before reading the Claim and independent evidence. R3 additionally requires adversarial evidence.

A standalone R-level assertion is never a Review artifact.

## Verifier-bound derived evidence

Protocol 2.4 does not trust caller-supplied strings for evidence or lifecycle status. Evidence and lifecycle assessments contain contract, Claim, and Review digests and must be accepted by trusted verifier callbacks. A bare `PASS` string can only yield `INCONCLUSIVE`; conservative `FAIL` or `STALE` values may still lower a gate.

Named-check receipts likewise require a trusted verifier, exact policy/executable/argument/cwd digests, exact reviewer and Claim HEAD, and a passing result with exit code zero.

## Final gate

```text
finalGate = minimum(
  verifiedEvidenceCap,
  verifiedAuthorityCap,
  sourceCoverageCap,
  contractPolicyCap,
  reviewerCap,
  verifiedNamedCheckCap,
  contractLifecycleCap,
  verifiedArtifactLifecycleCap
)
```

Results are `PASS`, `PASS_WITH_LIMITS`, `INCONCLUSIVE`, `STALE`, or `FAIL`. Missing review, adapter, receipt, evidence verifier, named-check verifier, or lifecycle verifier is inconclusive. Digest, identity, chronology, policy, source, or explicit verifier rejection is failure.

## Lifecycle and amendments

Active contracts may be used. Superseded contracts make prior Claims/Reviews stale. Revoked contracts fail. Amendments create new contracts and preserve prior contract ID/digest, reason, authority receipt, and effective revision; they never rewrite history.

## Limits

Protocol 2.4 does not prove cryptographic identity unless a trusted signature adapter does so. It does not prove complete requirement extraction, semantic test adequacy, external behavior, merge, release, publication, deployment, hardware validation, scientific validity, or user outcomes. Those remain separate evidence and lifecycle gates.
