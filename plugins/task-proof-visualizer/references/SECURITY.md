# Security and Safety Boundaries

## Threat model

The MCP may run inside repositories containing untrusted filenames, source text, Git metadata, generated reports, or model-authored manifests. Treat all of them as data, never as commands.

## Command execution

`task_proof_snapshot` uses fixed `git` argument arrays through `execFileSync`. It must never accept:

- arbitrary shell commands;
- package scripts;
- test commands;
- hooks;
- network URLs;
- command fragments embedded in refs or filenames.

Refs are passed as individual arguments, not interpolated into a shell string.

## Filesystem boundary

- Resolve real paths before access.
- Require the Git root to be inside `TASK_PROOF_ALLOWED_ROOTS`.
- Reject evidence files outside the allowed Git workspace.
- Limit evidence files to 50.
- Limit each hashed evidence file to 2 MiB by default.
- Write only beneath `.task-proof/`.
- Restrict output names to a safe filename grammar.
- Use atomic temp-file rename.
- Never follow an output path supplied by a manifest.

## Data minimization

The snapshot records Git metadata, bounded status/diff summaries, and hashes. It does not copy repository file contents into the MCP response.

Do not include:

- tokens;
- environment dumps;
- credential files;
- private keys;
- full user home paths unless required locally;
- large logs or binary payloads.

## Secret handling

Evidence locators may reference secret-scanning results, but manifests must not contain the secret value. Redact captured stderr before publication if a tool emits credentials or sensitive paths.

## Denial-of-service controls

- Bound Git output buffers and timeouts.
- Bound node/claim/evidence counts in future schema revisions.
- Truncate diagram labels.
- Reject oversized evidence files rather than reading them.
- Keep network access disabled in the MCP.

## Trust boundary

Validation proves protocol consistency, not truth. A malicious producer can fabricate a JSON evidence item. Independent reviewer reopening and checkpoint verification are mandatory for final acceptance.

## Write semantics

The current writer intentionally fails if a target bundle file already exists. This prevents silent evidence overwrite. A new run should use a new output name or explicitly archive the old bundle before rerunning.

## Renderer safety

Mermaid labels are sanitized for quotes, angle brackets, pipes, and line breaks. Do not enable arbitrary HTML or script injection from manifest fields. Render generated diagrams in an environment with appropriate content security controls.
