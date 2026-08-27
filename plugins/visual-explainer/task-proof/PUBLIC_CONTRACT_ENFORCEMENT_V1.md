# Public Task Contract Enforcement 1.0

## Status

- Public enforcement version: `1.0.0`
- Task Contract Protocol: `2.4.0`
- Claim/Review artifact protocol: `0.2.0` with contract-bound extension fields
- Canonical contract gate: `computeStrictContractGate` from `contract-final-gate.mjs`
- Integration target: every public Author, Reviewer, MCP, renderer, and immutable artifact path

## Public invariant

A public completion result may be called authoritative for the task only when all of the following are true:

1. the Claim is bound to an exact frozen Task Contract, repository identity, base SHA, head SHA, and criterion snapshot;
2. the Reviewer run differs from the claimant run and satisfies the contract's minimum R-level;
3. every declared authority source has a reviewer-owned, source-specific receipt;
4. required named checks match the frozen policy, executable, arguments, working directory, Claim HEAD, and criterion IDs;
5. the repository remains at the same complete snapshot before and after evidence collection;
6. evidence and lifecycle assessments are generated and revalidated by trusted public adapters;
7. `computeStrictContractGate` is called by the public review path.

Claimant output remains `UNVERIFIED`. The legacy criterion-level gate is retained as `review.gate` for compatibility and evidence accounting. The only authoritative task-acceptance result is `review.contractGate.gate` and the MCP's top-level `gate` response.

## MCP sequence

```text
task_proof_validate_contract
  -> task_proof_claim(contract, claim)
  -> UNVERIFIED contract-bound Claim

independent reviewer
  -> task_proof_contract_source_receipt for every repository source
  -> task_proof_probe / task_proof_run_checks
  -> task_proof_review(contract, claim, reviewerAttestation, authorityReceipts, findings, probes/checks)
  -> legacy evidence gate + authoritative contractGate
```

The built-in authority adapter supports only `repository_file` sources verified by `repository_source`. User-message, GitHub Issue, release-registry, and cryptographic authority types require separately trusted adapters; without one, the result remains `INCONCLUSIVE` or fails closed.

## Artifact and diagram rules

Contract-bound Claim and Review artifacts embed the normalized Task Contract. Contract-bound Review artifacts also embed the exact Claim, authority receipts, assessments, named-check receipts, reviewer attestation, the legacy evidence gate, and the strict contract gate.

The one-screen diagram must display:

- contract ID and digest;
- authority level and source coverage cap;
- reviewer R-level for Reviews;
- an unmistakable provisional warning when final acceptance is impossible;
- `contractGate` as the primary badge for Reviews;
- unresolved or failed gate inputs;
- an explicit statement that task acceptance does not imply merge, release, publication, deployment, hardware acceptance, user acceptance, or effectiveness.
