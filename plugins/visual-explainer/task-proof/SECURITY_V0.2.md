# Task Proof Security and Trust Model 0.2.0

## Assets

Task Proof protects completion-claim integrity, reviewer independence, repository confidentiality, and user control over local command execution.

## Threats addressed

- claimant self-approves its own work;
- a stale screenshot is reused after repository change;
- fabricated test prose is treated as a passing test;
- evidence is reused to cover unrelated criteria;
- path traversal writes outside the repository;
- untrusted text injects HTML or SVG;
- a Git ref or path reaches a shell;
- raw diffs leak credentials or sensitive content;
- reviewer output upgrades an unsupported claim.

## Controls

- separate claimant and reviewer run IDs;
- canonical SHA-256 claim, snapshot, review, and manifest digests;
- computed review gate;
- deterministic read-only shell-free probes;
- no arbitrary command execution in the MCP;
- repository-relative output confinement;
- symlink rejection for file probes;
- payload, file, probe-count, Git-output, and timeout limits;
- XML escaping and self-contained Content Security Policy;
- no raw patch capture by default.

## Residual risks

A host agent can still lie about a test it says it ran outside the MCP. Important tests must be reproduced by the reviewer or trusted CI. SHA-256 binds content but does not establish human identity. A malicious repository can contain hostile code; Task Proof deliberately does not execute it. External deployment, hardware, and user acceptance require evidence from those systems.

## Deployment guidance

Run the MCP with the repository as working directory, least-privilege filesystem access, no network requirement, and no secrets in the process environment. Keep `.artifacts/task-proof/` out of release bundles unless evidence publication is intentional.
