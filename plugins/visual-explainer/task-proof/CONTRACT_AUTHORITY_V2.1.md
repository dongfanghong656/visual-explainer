# Task Contract Authority Protocol 2.1

## Purpose

Task Proof already binds claims, reviews, evidence receipts, repository snapshots, and rendered artifacts to deterministic digests. That prevents many forms of post-hoc tampering, but it does not by itself prove that the producer selected a complete acceptance set.

Protocol 2.1 introduces a **pre-frozen task contract**. The contract is an authorization object issued outside the implementation claim. A producer may reference it, but may not redefine its criteria or review policy.

## Trust chain

```text
user / approved project requirement
        ↓
task-contract + authority/source receipt
        ↓
producer claim.contractRef
        ↓
reviewer independently reloads task-contract
        ↓
review.contractRef + reviewer attestation
        ↓
contract-bound gate
```

The contract, claim, review, evidence receipts, and repository snapshot remain separate artifacts with separate digests.

## Contract identity

A task contract contains:

- `schemaVersion = 2.1.0`
- `kind = task-contract`
- stable `contractId` and `taskId`
- repository identity
- authority and source records
- implementation base revision
- included and excluded outcomes
- complete acceptance criteria
- criterion criticality and required evidence policy
- minimum reviewer independence
- amendment or revocation state

The contract digest covers all of those fields. Criteria and evidence-policy sets are canonicalized deterministically for digesting; duplicate entries remain validation errors.

## Authority levels

| Authority | Meaning | Maximum final gate |
|---|---|---|
| `producer-provisional` | The implementation agent assembled the contract itself | `INCONCLUSIVE` |
| `user-explicit-unbound` | User intent exists but no durable host/source receipt can be replayed | `INCONCLUSIVE` |
| `user-attested` | A host-preserved user-message receipt is bound to the contract | `PASS` |
| `project-approved` | An approved repository file predates the implementation base | `PASS` |
| `issue-locked` | An immutable issue/task record is bound to the contract | `PASS` |
| `release-policy` | Release policy is bound to the contract | `PASS` |
| `amended` | A newer contract supersedes this one | `STALE` |
| `revoked` | The authority revoked the contract | `FAIL` |

A high evidence score cannot exceed the authority cap.

## Repository-file source verification

For `project-approved` contracts the verifier must:

1. load the source file from the declared immutable revision;
2. reject symbolic links and unsafe repository-relative paths;
3. compare the observed bytes with `source.sha256`;
4. prove that the source revision equals or is an ancestor of the implementation base;
5. reject the contract when the source path changed in the implementation range.

`issuedAt` is audit context only. It is not proof that the contract predates implementation.

## Claim binding

A claim contains:

```json
{
  "contractRef": {
    "contractId": "TPC-0001",
    "contractDigest": "<sha256>",
    "authorityReceiptDigest": "<sha256>"
  }
}
```

If a claim copies acceptance criteria for display, the copy must preserve:

- the exact criterion ID set;
- each statement;
- each criticality level;
- each required evidence kind;
- each required evidence locator.

Deleting a difficult criterion, weakening its criticality, or removing a required locator is a hard validation error.

## Reviewer binding and procedural attestation

The reviewer independently loads the same contract and includes an identical contract reference.

Reviewer independence levels:

- `R0`: producer narrative only; maximum `INCONCLUSIVE`.
- `R1`: evidence locators are reopened; maximum `PASS_WITH_LIMITS`.
- `R2`: contract and repository are reconstructed before reading the producer narrative; maximum `PASS`.
- `R3`: R2 plus adversarial tests, counterexamples, or failure injection; maximum `PASS`.

A procedural attestation is not cryptographic identity. The UI and report must say `PROCEDURAL ATTESTATION` unless a real signature is verified.

## Contract-bound final gate

```text
finalGate = minimum(
  evidenceGate,
  contractAuthorityCap,
  reviewerIndependenceCap,
  lifecycleCap
)
```

This prevents:

- a producer-provisional contract from becoming accepted merely because tests pass;
- an R0 narrative review from approving an R2 task;
- implementation evidence from implying merge, release, deployment, or observed effectiveness;
- an amended or revoked contract from being reused.

## Error codes

Core errors include:

- `CONTRACT_MISMATCH`
- `CONTRACT_AUTHORITY_RECEIPT_MISMATCH`
- `CONTRACT_CRITERION_SET_MISMATCH`
- `CONTRACT_CRITERION_CONTENT_MISMATCH`
- `CONTRACT_POLICY_MISMATCH`
- `CONTRACT_CHANGED_IN_IMPLEMENTATION_SCOPE`
- `CONTRACT_REVISION_NOT_ANCESTOR`
- `CONTRACT_SOURCE_DIGEST_MISMATCH`
- `CONTRACT_SOURCE_SYMLINK`
- `REVIEW_INDEPENDENCE_INSUFFICIENT`
- `NOT_INDEPENDENT`

## Current implementation boundary

`contract-authority.mjs` is a deterministic, dependency-free authority and binding layer. It does not itself read Git or host messages. Existing repository snapshot and MCP layers must provide immutable source bytes, ancestry results, changed paths, and host attestation receipts.

Until the contract functions are wired into all claim/review entrypoints and the MCP schema, this module is a tested protocol component rather than a completed product gate.
