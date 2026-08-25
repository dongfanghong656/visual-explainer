# Task Proof Standard 0.2.0

Task Proof separates two statements:

1. **Claim:** an implementing agent declares what it believes it changed.
2. **Review:** a different run independently reconstructs the contract, collects fresh evidence, and computes the only authoritative completion gate.

The diagram is a view of digest-bound JSON. It is never the fact source by itself.

## 1. Roles and authority

| Role | May declare work | May collect evidence | May issue completion gate |
|---|---:|---:|---:|
| Claimant | Yes | Claimant evidence only | No |
| Reviewer | No | Fresh reviewer evidence | Yes, through the computed gate |
| Renderer | No | No | No |

The reviewer run ID MUST differ from the claimant run ID. A different run ID is protocol separation, not cryptographic identity; therefore a gate MUST depend on fresh machine observations, not reviewer prose. A claimant artifact MUST NOT contain `verified`, `verdict`, `gate`, `completionGate`, `reviewer`, `findings`, or `reviewEvidence`. A review tool MAY downgrade a requested verdict but MUST NOT upgrade unsupported evidence.

## 2. Snapshot binding

Every claim binds full base/head SHAs, branch or detached state, dirty-tree flag, and a deterministic snapshot digest. The digest covers:

- committed change names and rename pairs;
- current branch, base, head, and tree SHAs;
- recent commits and sanitized remote identity;
- every changed or untracked regular file's SHA-256 content digest;
- symlink target digests, deletion markers, and working-tree statuses;
- recursive submodule-status digest.

Wall-clock observation time and raw patches are excluded. Changing a dirty file while it remains the same `M path` changes the snapshot digest.

Untracked files are enumerated individually. Working-tree content hashing is bounded. A directory, dirty submodule, unsupported filesystem object, excessive file count, or excessive byte budget makes the snapshot incomplete or aborts snapshot creation. `task_proof_review` MUST NOT issue a completion gate from an incomplete snapshot.

A review recreates the snapshot before and after evidence collection. Head or snapshot mismatch makes declared completion stale. A repository race aborts the review.

## 3. Status vocabulary

Claimant statuses:

- `declared_done`;
- `partial`;
- `blocked`;
- `not_done`.

Reviewer verdicts:

- `verified`;
- `partially_verified`;
- `unsupported`;
- `contradicted`;
- `stale`;
- `not_applicable`.

Only review artifacts use `PASS`, `PASS_WITH_LIMITS`, `FAIL`, or `INCONCLUSIVE`.

## 4. Evidence levels

| Level | Value | Meaning | Can independently verify completion? |
|---:|---|---|---:|
| E0 | `self_report` | Natural-language assertion | No |
| E1 | `artifact` | Claimant points to a file, commit, or output | No, by itself |
| E2 | `deterministic` | MCP-produced reproducible observation at the review snapshot | Yes, for explicitly covered criteria |
| E3 | `independent` | Attested result from a separate trusted system | Only with a verifiable attestation policy |
| E4 | `external` | Real-world acceptance or deployment evidence | Only with a verifiable attestation policy |

The reference MCP grants gate authority only to E2 receipts it produces itself. E3/E4 storage may be added later, but caller-supplied trust labels do not grant a gate.

Test and build evidence records a structured exit code. A failing check never supports `verified` or `partially_verified`. Claimant-produced evidence cannot be independent or external.

## 5. Criterion-level coverage

Every declared-done claim references acceptance criteria. A reviewer receipt lists both `supportsClaimIds` and `supportsCriterionIds`; evidence that is merely present but unrelated cannot verify the claim.

An acceptance criterion may set `requiredEvidenceKinds`, for example:

- source or documentation change: `file` or `diffstat`;
- runtime behavior: `test`;
- packaging: `build`;
- deployment or hardware acceptance: a future attested `external` receipt.

A `verified` finding is downgraded unless every referenced criterion is covered by at least one successful, digest-valid, reviewer-produced receipt of an allowed kind.

A `partially_verified` finding is downgraded unless at least one referenced criterion is covered. Covered and unresolved criterion IDs must remain explicit. Merely choosing the word “partial” cannot obtain `PASS_WITH_LIMITS`.

## 6. Computed gate

For every `declared_done` claim, acceptance criteria and claimant evidence are required. The reviewer must issue one finding per claim.

- any `unsupported` or `contradicted` declared-done claim → `FAIL`;
- any `stale`, missing, or otherwise incomparable declared-done claim → `INCONCLUSIVE`;
- every declared-done claim `verified` → `PASS`;
- every declared-done claim is either `verified` or evidence-backed `partially_verified`, with at least one partial → `PASS_WITH_LIMITS`;
- no declared-done claims → `INCONCLUSIVE`.

A mixture of `partially_verified` and `not_applicable` is `INCONCLUSIVE`, not `PASS_WITH_LIMITS`. Caller-provided gate values are ignored.

## 7. Safe observations and named checks

Read-only MCP probes are allowlisted:

- regular-file digest;
- full commit-SHA existence;
- changed repository path, using NUL-delimited Git output.

They use process argument arrays rather than a shell and reject absolute paths, traversal, NUL bytes, symlinks, parent-symlink physical escapes, oversized files, unsafe refs, and excessive probe counts.

Behavioral checks are repository-owned named checks in `.task-proof/checks.json`. The caller supplies only a check ID and evidence bindings, never a command. Execution:

- is disabled by default;
- requires `TASK_PROOF_ALLOW_EXECUTION=1` after operator review;
- uses `spawnSync(..., shell: false)`;
- confines `cwd` to the repository;
- limits duration and captured output;
- uses a minimal environment;
- records policy, command, argument, output, exit, duration, and snapshot digests;
- rejects repository mutation during the check.

Repository checks still execute repository code. Explicit operator opt-in is a security boundary, not a formality.

## 8. Visual grammar

A Task Proof picture fits a 16:9 one-screen view and includes:

- pinned branch, head, snapshot, and artifact digests;
- objective and one-sentence change thesis;
- no more than four primary claims;
- claim or reviewer status for each claim;
- causal `BEFORE → CHANGE → AFTER` logic;
- criterion and evidence identifiers;
- a dedicated `remaining · blocked · risk` area;
- an unmistakable `UNVERIFIED` claimant badge or computed review gate;
- an SVG text alternative.

The view MUST preserve partial, blocked, not-done, stale, unknown, risk, and next-step information rather than showing only successful work.

## 9. Artifact set

Each render writes an immutable digest-addressed directory:

```text
.artifacts/task-proof/<safe-stem>/<artifact-digest-hex>/
```

It contains:

- `artifact.json`;
- `diagram.svg`;
- `index.html`;
- `manifest.json` with SHA-256 and byte size for every file.

`LATEST` is a mutable convenience pointer, not evidence. Writes use a repository-confined temporary directory followed by rename. Existing immutable directories are rehashed before reuse. Parent and final-component symlinks are rejected before directory creation.

JSON is the semantic fact source. A screenshot without JSON and manifest is presentation only.

## 10. Honesty rules

- Missing evidence is `unsupported`, not probably done.
- Dirty state and snapshot completeness are disclosed and digest-bound.
- Unit tests do not prove hardware, user acceptance, deployment, release, or production readiness.
- Committed, merged, released, deployed, and externally accepted are separate claims with separate evidence.
- A passing gate is valid only for the exact claim digest and reviewed snapshot digest recorded in the review artifact.
