# Task Proof Security and Trust Model 0.2.0

## Assets

Task Proof protects completion-claim integrity, criterion relevance, repository confidentiality, immutable artifact integrity, and operator control over local code execution.

## Threats addressed

- claimant self-approves its own work;
- a reviewer changes only its run ID and repeats claimant prose;
- a stale screenshot is reused after repository change;
- a dirty file changes content while retaining the same Git status;
- repository content changes while a read-only probe is running;
- fabricated or failing test prose is treated as a passing test;
- valid evidence is attached to an unrelated criterion or path;
- `partially_verified` is asserted without any covered criterion;
- a caller relabels a test as build evidence;
- PATH resolves an unintended check executable;
- a check reads credentials from the user's real HOME;
- a parent-directory symlink escapes repository confinement;
- output-directory symlinks create files outside the repository before rejection;
- path traversal writes outside the repository;
- an existing immutable artifact is modified or gains an unmanifested file and is silently reused;
- untrusted text injects HTML or SVG;
- Git refs, paths, or checks reach a shell;
- raw diffs leak credentials or sensitive content;
- repository state changes during evidence collection;
- reviewer output upgrades an unsupported claim;
- direct library callers bypass outer MCP request schemas.

## Controls

- separate claimant and reviewer run IDs;
- claimant top-level self-verification fields are rejected;
- strict core entrypoints repeat claim, reviewer-role, finding-ID, snapshot, and evidence checks;
- fresh MCP-produced review receipts rather than free-form review evidence;
- explicit claim, criterion, kind, and optional exact-locator coverage in every receipt;
- canonical SHA-256 claim, snapshot, receipt, review, executable, file, and manifest digests;
- full dirty-file content fingerprinting and individually enumerated untracked files;
- pre/post probe snapshots and post-evidence review snapshots;
- incomplete dirty snapshots cannot receive a review gate;
- computed, downgrade-only completion gate;
- deterministic allowlisted probes with no shell and NUL-delimited Git parsing;
- optional repository-owned named checks, disabled by default;
- policy-owned test/build evidence types;
- `node` pinned to `process.execPath`, other executables restricted to absolute regular files, with before/after content integrity checks;
- isolated temporary HOME, user profile, temp directories, Git global config, and npm config for named checks;
- repository-relative lexical and physical path confinement;
- final and parent-symlink escape rejection;
- component-by-component safe output-directory creation;
- immutable digest-addressed output directories with exact file-set validation and rehash-on-reuse;
- payload, file, probe-count, check-count, Git-output, worktree-hash, executable, process-output, and timeout limits;
- XML escaping and a self-contained Content Security Policy;
- no raw patch capture by default;
- snapshot-race and repository-mutation detection.

## Named-check threat boundary

Named checks execute repository code. They are disabled unless the operator explicitly sets `TASK_PROOF_ALLOW_EXECUTION=1` after inspecting `.task-proof/checks.json`. The MCP uses `shell: false`, a repository-owned policy entry, repository-confined `cwd`, policy-owned evidence type, fixed arguments, executable integrity binding, isolated HOME/configuration, and bounded output/time. These controls reduce command injection, credential exposure, evidence relabeling, and runaway-process risk, but do not make hostile repository code safe.

## Residual risks

- Run IDs are not identity signatures. Fresh deterministic observations reduce the value of fake identity but do not cryptographically prove who reviewed.
- SHA-256 binds content but does not establish human or organizational identity.
- Acceptance criteria may omit requirements. Version 0.2.0 records this risk but does not yet require a separately approved, pre-implementation contract digest.
- A malicious repository can behave differently under tests than in production.
- A reviewer can choose inadequate semantic checks; exact locators prevent unrelated evidence but do not make a weak test strong.
- External deployment, hardware, and user acceptance need evidence from those systems. The reference implementation does not grant E3/E4 gate authority without an attestation verifier.
- Process descendants may outlive a timed-out parent on some operating systems; run untrusted checks in a sandbox or CI runner.
- PATH remains available to repository code launched by an approved check, even though the top-level executable is pinned.
- Network access is not disabled by the Node process API.
- Ignored files are outside the Git snapshot. Checks that rely on ignored generated state must bind those files explicitly or run in an isolated build environment.
- Dirty submodules and changed filesystem directories require separate attestation; the MCP refuses to issue a gate when their content cannot be fully fingerprinted.
- Best-effort directory fsync is platform-dependent; digest and exact-file-set verification detect later corruption but cannot guarantee survival of every power-loss scenario.

## Deployment guidance

Run the MCP with the repository as working directory, least-privilege filesystem access, no network requirement, no secrets in the parent process environment, and named checks disabled until reviewed. Prefer an ephemeral container or CI worker for repository code. Keep `.artifacts/task-proof/` out of release bundles unless evidence publication is intentional.
