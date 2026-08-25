# Task Proof Standard 0.2.0

Task Proof separates two statements:

1. **Claim:** an implementing agent declares what it believes it changed.
2. **Review:** a different run independently checks the declaration and computes the only authoritative completion gate.

The diagram is a view of digest-bound artifacts. It is never the fact source by itself.

## Roles

| Role | May declare work | May issue completion gate |
|---|---:|---:|
| Claimant | Yes | No |
| Reviewer | No | Yes, through computed rules |
| Renderer | No | No |

The reviewer run ID MUST differ from the claimant run ID. A claimant artifact MUST NOT contain `verified`, `verdict`, `gate`, or equivalent self-approval fields. A review tool MAY downgrade a requested verdict but MUST NOT upgrade unsupported evidence.

## Snapshot binding

Every claim MUST bind full base/head SHAs, branch or detached state, dirty-tree flag, and a deterministic snapshot digest. The digest covers committed and working-tree change names, recent commits, branch, base, head, and sanitized remote identity. It excludes wall-clock time and raw patch content.

A review MUST recreate the snapshot. Head or snapshot mismatch makes declared completion `stale`, which cannot receive `PASS`.

## Status vocabulary

Claimant: `declared_done`, `partial`, `blocked`, `not_done`.

Reviewer: `verified`, `partially_verified`, `unsupported`, `contradicted`, `stale`, `not_applicable`.

Only review artifacts use `PASS`, `PASS_WITH_LIMITS`, `FAIL`, or `INCONCLUSIVE`.

## Evidence trust

| Level | Value | Meaning | Independently verifies completion? |
|---:|---|---|---:|
| E0 | `self_report` | Natural-language assertion | No |
| E1 | `artifact` | File, commit, or output exists | No, by itself |
| E2 | `deterministic` | Reproducible machine observation | Yes, when produced by reviewer run |
| E3 | `independent` | Independent reviewer/system result | Yes |
| E4 | `external` | Real-world acceptance | Yes |

Test/build evidence MUST record a structured exit code. Failing evidence cannot support `declared_done`. Claimant-produced evidence cannot be independent or external.

## Computed gate

For every `declared_done` claim, acceptance criteria and claimant evidence are required. The reviewer must issue a finding. `verified` requires reviewer-produced E2+ evidence and a matching snapshot.

- any `unsupported` or `contradicted` declared-done claim → `FAIL`;
- any `stale` declared-done claim → `INCONCLUSIVE`;
- every declared-done claim `verified` → `PASS`;
- at least one `partially_verified` and no failure → `PASS_WITH_LIMITS`;
- no declared-done claims → `INCONCLUSIVE`.

Caller-provided gate values are ignored.

## Safe probes

The MCP may only create deterministic receipts for an allowlisted read-only set: regular-file digest, full commit-SHA existence, and changed repository path. It MUST use process argument arrays rather than a shell; reject absolute paths, traversal, NUL bytes, symlinks, oversized files, unsafe refs, and excessive probe counts; and MUST NOT execute caller-supplied test commands.

## Visual grammar

A Task Proof picture MUST fit a 16:9 one-screen view and include pinned branch/head and digest, objective, one-sentence change thesis, no more than four primary claims, causal `BEFORE → CHANGE → AFTER` logic, evidence identifiers, and an unmistakable `UNVERIFIED` claimant badge or computed review gate.

The SVG must include a text alternative and escape untrusted text. The claim view must state that the claimant cannot verify itself.

## Artifact set

Each render writes atomically under `.artifacts/task-proof/`: canonical JSON, SVG, self-contained HTML, and a manifest with SHA-256 digests. Output names are sanitized and cannot escape the repository. JSON is the semantic fact source.

## Honesty rules

- Missing evidence is `unsupported`, not probably done.
- Dirty state is disclosed and digest-bound.
- A screenshot without JSON and manifest is presentation only.
- Unit tests do not prove external hardware, user acceptance, deployment, or release.
- Committed, merged, released, and deployed are separate claims with separate evidence.
