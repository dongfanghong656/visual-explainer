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

The reviewer run ID MUST differ from the claimant run ID. A different run ID is protocol separation, not cryptographic identity; therefore a gate MUST depend on fresh machine observations, not on reviewer prose. A claimant artifact MUST NOT contain `verified`, `verdict`, `gate`, or equivalent self-approval fields. A review tool MAY downgrade a requested verdict but MUST NOT upgrade unsupported evidence.

## 2. Snapshot binding

Every claim binds full base/head SHAs, branch or detached state, dirty-tree flag, and a deterministic snapshot digest. The digest covers committed and working-tree change names, recent commits, branch, base, head, and sanitized remote identity. It excludes wall-clock time and raw patch content.

A review recreates the snapshot. Head or snapshot mismatch makes declared completion `stale`, which cannot receive `PASS`. If the repository changes while evidence is being collected, the review is aborted as a snapshot race and must restart.

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

The current reference MCP grants gate authority only to E2 receipts it produces itself. E3/E4 storage may be added later, but unverified caller-supplied labels do not grant a gate.

Test and build evidence records a structured exit code. A failing check never supports `verified`. Claimant-produced evidence cannot be independent or external.

## 5. Criterion-level coverage

Every declared-done claim references acceptance criteria. A reviewer receipt lists both `supportsClaimIds` and `supportsCriterionIds`; evidence that is merely present but unrelated cannot verify the claim.

An acceptance criterion may set `requiredEvidenceKinds`, for example:

- source or documentation change: `file` or `diffstat`;
- runtime behavior: `test`;
- packaging: `build`;
- deployment or hardware acceptance: a future attested `external` receipt.

A `verified` finding is downgraded to `unsupported` unless every referenced criterion is covered by at least one successful, digest-valid, reviewer-produced receipt of an allowed kind.

## 6. Computed gate

For every `declared_done` claim, acceptance criteria and claimant evidence are required. The reviewer must issue one finding per claim.

- any `unsupported` or `contradicted` declared-done claim → `FAIL`;
- any `stale` declared-done claim → `INCONCLUSIVE`;
- every declared-done claim `verified` → `PASS`;
- at least one `partially_verified` and no failure → `PASS_WITH_LIMITS`;
- no declared-done claims → `INCONCLUSIVE`.

Caller-provided gate values are ignored.

## 7. Safe observations and named checks

Read-only MCP probes are allowlisted:

- regular-file digest;
- full commit-SHA existence;
- changed repository path.

They use process argument arrays rather than a shell and reject absolute paths, traversal, NUL bytes, symlinks, parent-symlink physical escapes, oversized files, unsafe refs, and excessive probe counts.

Behavioral checks are repository-owned named checks in `.task-proof/checks.json`. The caller supplies only a check ID and evidence bindings, never a command. Execution:

- is disabled by default;
- requires `TASK_PROOF_ALLOW_EXECUTION=1` after operator review;
- uses `spawnSync(..., shell: false)`;
- confines `cwd` to the repository;
- limits duration and captured output;
- uses a minimal environment;
- records policy, command, argument, output, exit, duration, and snapshot digests.

Repository checks still execute repository code. Explicit operator opt-in is a security boundary, not a formality.

## 8. Visual grammar

A Task Proof picture fits a 16:9 one-screen view and includes pinned branch/head and digest, objective, one-sentence change thesis, no more than four primary claims, causal `BEFORE → CHANGE → AFTER` logic, evidence identifiers, and an unmistakable `UNVERIFIED` claimant badge or computed review gate.

The SVG includes a text alternative and escapes untrusted text. The claim view states that the claimant cannot verify itself.

## 9. Artifact set

Each render writes under `.artifacts/task-proof/`:

- semantic JSON;
- SVG;
- self-contained HTML;
- a manifest with SHA-256 digests.

Output names are sanitized and cannot escape the repository. JSON is the semantic fact source. A screenshot without JSON and manifest is presentation only.

## 10. Honesty rules

- Missing evidence is `unsupported`, not probably done.
- Dirty state is disclosed and digest-bound.
- Unit tests do not prove hardware, user acceptance, deployment, release, or production readiness.
- Committed, merged, released, deployed, and externally accepted are separate claims with separate evidence.
- A passing gate is valid only for the exact claim digest and reviewed snapshot digest recorded in the review artifact.
