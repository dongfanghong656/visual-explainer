# Task Proof Security and Trust Model 0.2.0

## Assets

Task Proof protects completion-claim integrity, reviewer evidence relevance, repository confidentiality, and operator control over local code execution.

## Threats addressed

- claimant self-approves its own work;
- a reviewer changes only its run ID and repeats claimant prose;
- a stale screenshot is reused after repository change;
- fabricated test prose is treated as a passing test;
- valid evidence is attached to an unrelated criterion;
- a parent-directory symlink escapes repository confinement;
- path traversal writes outside the repository;
- untrusted text injects HTML or SVG;
- Git refs, paths, or checks reach a shell;
- raw diffs leak credentials or sensitive content;
- repository changes midway through evidence collection;
- reviewer output upgrades an unsupported claim.

## Controls

- separate claimant and reviewer run IDs;
- fresh MCP-produced review receipts rather than free-form review evidence;
- explicit claim and acceptance-criterion coverage in every receipt;
- canonical SHA-256 claim, snapshot, receipt, review, and manifest digests;
- computed, downgrade-only completion gate;
- deterministic allowlisted probes with no shell;
- optional repository-owned named checks, disabled by default;
- no caller-supplied commands;
- repository-relative lexical and physical path confinement;
- final and parent-symlink escape rejection;
- payload, file, probe-count, check-count, Git-output, process-output, and timeout limits;
- XML escaping and a self-contained Content Security Policy;
- no raw patch capture by default;
- snapshot-race detection when combining evidence.

## Named-check threat boundary

Named checks execute repository code. They are therefore disabled unless the operator explicitly sets `TASK_PROOF_ALLOW_EXECUTION=1` after inspecting `.task-proof/checks.json`. The MCP uses `shell: false`, an allowlisted policy entry, repository-confined `cwd`, fixed arguments, a minimal environment, and bounded output/time. These controls reduce command-injection and runaway-process risk, but do not make hostile repository code safe.

## Residual risks

- Run IDs are not identity signatures. Fresh deterministic observations reduce the value of fake identity but do not cryptographically prove who reviewed.
- SHA-256 binds content but does not establish human or organizational identity.
- A malicious repository can behave differently under tests than in production.
- A reviewer can choose inadequate acceptance criteria; requirements review remains necessary.
- External deployment, hardware, and user acceptance need evidence from those systems. The reference implementation does not yet grant E3/E4 gate authority without an attestation verifier.
- Process descendants may outlive a timed-out parent on some operating systems; run untrusted checks in a sandbox or CI runner.

## Deployment guidance

Run the MCP with the repository as working directory, least-privilege filesystem access, no network requirement, no secrets in the process environment, and named checks disabled until reviewed. Prefer an ephemeral container or CI worker for repository code. Keep `.artifacts/task-proof/` out of release bundles unless evidence publication is intentional.
