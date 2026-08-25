import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = join(here, "..");
const rootDir = join(pluginDir, "..", "..");
const serverSource = readFileSync(join(pluginDir, "mcp", "server.mjs"), "utf8");

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

test("MCP source registers the three preserved visual tools and five Task Proof tools exactly once", () => {
  const expected = [
    "visual_explainer_prepare",
    "visual_explainer_render_html",
    "visual_explainer_render_quick",
    "task_proof_git_snapshot",
    "task_proof_validate_claim",
    "task_proof_render_claim",
    "task_proof_validate_review",
    "task_proof_render_review",
  ];
  for (const name of expected) {
    assert.equal(occurrences(serverSource, `server.registerTool(\"${name}\"`), 1, `${name} registration drifted`);
  }
});

test("MCP source exposes both Task Proof prompts and all protocol resources", () => {
  for (const prompt of ["task-proof.md", "task-proof-review.md"]) {
    assert.match(serverSource, new RegExp(`\\"${prompt.replaceAll(".", "\\.")}\\"`));
  }
  for (const uri of [
    "visual-explainer://task-proof/PROTOCOL.md",
    "visual-explainer://task-proof/schema.json",
    "visual-explainer://task-proof/examples/scroll-restoration.claim.json",
    "visual-explainer://task-proof/examples/scroll-restoration.review.json",
  ]) {
    assert.match(serverSource, new RegExp(uri.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("package and Claude plugin metadata use one alpha version", () => {
  const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  const marketplacePlugin = JSON.parse(readFileSync(join(rootDir, ".claude-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(readFileSync(join(rootDir, ".claude-plugin", "marketplace.json"), "utf8"));
  const plugin = JSON.parse(readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"));
  const versions = [
    packageJson.version,
    marketplacePlugin.version,
    marketplace.metadata.version,
    marketplace.plugins[0].version,
    plugin.version,
  ];
  assert.deepEqual(new Set(versions), new Set(["0.11.0-alpha.1"]));
  assert.match(packageJson.scripts["test:task-proof"], /node --test/);
  assert.match(packageJson.scripts["check:task-proof"], /npm run test:task-proof/);
});

test("render handlers persist the authoritative JSON sidecar before the HTML derivative", () => {
  for (const toolName of ["task_proof_render_claim", "task_proof_render_review"]) {
    const start = serverSource.indexOf(`server.registerTool(\"${toolName}\"`);
    assert.notEqual(start, -1);
    const next = serverSource.indexOf("server.registerTool(", start + 1);
    const block = serverSource.slice(start, next === -1 ? serverSource.length : next);
    assert.ok(block.indexOf("writeTaskProofSidecar") < block.indexOf("writeRenderedHtml"), `${toolName} must write JSON first`);
  }
});
