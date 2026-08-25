# Agent instructions

<!-- GPCM:START -->
For durable project work, read `PROJECT_AGENT.md` and `.ai/PROJECT_STATE.json` before editing. The repository is the source of truth; chat summaries are navigation aids only.

For any statement that a task is complete, use the Task Proof author flow. Author output is an amber claim, never independent acceptance. A separate reviewer run must recollect the exact Git scope and use reviewer-owned evidence before green or `accepted` is allowed.

Run `npm run check:task-proof` for changes under `plugins/visual-explainer/task-proof/` or the MCP integration. Do not claim a full MCP user path, release readiness, external validation, or publication without evidence for that exact scope and environment.

Long-running managed turns update the requirement/spec/task/evidence/risk/handoff records and append a turn record. Never commit credentials, private transcripts, or generated bundles before privacy review.
<!-- GPCM:END -->
