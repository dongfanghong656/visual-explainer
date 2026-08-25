import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateTaskClaim, validateTaskReview } from "./validation.mjs";
import { renderTaskClaimHtml, renderTaskReviewHtml } from "./render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const claim = JSON.parse(readFileSync(join(here, "examples", "scroll-restoration.claim.json"), "utf8"));
const review = JSON.parse(readFileSync(join(here, "examples", "scroll-restoration.review.json"), "utf8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("example author claim passes protocol validation", () => {
  const result = validateTaskClaim(claim);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

test("claimed-complete fails when a criterion lacks evidence", () => {
  const invalid = clone(claim);
  invalid.task.acceptanceCriteria[0].evidenceIds = [];
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "EVIDENCE_REQUIRED"));
});

test("claimed-complete fails with active blocked work", () => {
  const invalid = clone(claim);
  invalid.work.blocked.push({ id: "ITEM-blocked-demo", statement: "Waiting for hardware", evidenceIds: [] });
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "COMPLETE_WITH_BLOCKERS"));
});

test("claimed-complete requires a git snapshot bound to the exact scope", () => {
  const invalid = clone(claim);
  invalid.evidence = invalid.evidence.filter((item) => item.type !== "git-snapshot");
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "GIT_SNAPSHOT_EVIDENCE_REQUIRED"));
});

test("author scope snapshot must match repository and branch, not only revision", () => {
  const invalid = clone(claim);
  const snapshot = invalid.evidence.find((item) => item.type === "git-snapshot");
  snapshot.branch = "other/branch";
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "GIT_SNAPSHOT_EVIDENCE_REQUIRED"));
});

test("git snapshot evidence requires structured scope fields", () => {
  const invalid = clone(claim);
  const snapshot = invalid.evidence.find((item) => item.type === "git-snapshot");
  delete snapshot.repository;
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.path.endsWith(".repository")));
});

test("dirty scope requires an exact snapshot digest", () => {
  const invalid = clone(claim);
  invalid.scope.dirty = true;
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "DIRTY_SCOPE_DIGEST_REQUIRED"));
});

test("claimed-complete follow-up work must explain why it is outside current scope", () => {
  const invalid = clone(claim);
  delete invalid.work.next[0].reason;
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "COMPLETE_NEXT_SCOPE_UNCLEAR"));
});

test("author cannot self-promote release readiness or release candidate", () => {
  const invalid = clone(claim);
  invalid.artifactStatus.usability = "RELEASE_READY";
  invalid.artifactStatus.release = "RELEASE_CANDIDATE";
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "AUTHOR_CANNOT_RELEASE_READY"));
  assert.ok(result.errors.some((issue) => issue.code === "AUTHOR_CANNOT_PROMOTE_RELEASE"));
});

test("external validated status requires human or external-system evidence", () => {
  const invalid = clone(claim);
  invalid.artifactStatus.verification = "EXTERNAL_VALIDATED";
  invalid.evidence.push({
    id: "EVD-fake-external",
    type: "external-validation",
    summary: "Author says an external check passed.",
    locator: "author narrative",
    producer: "author-agent"
  });
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "EXTERNAL_EVIDENCE_MISSING"));
});

test("author cannot self-declare acceptance passed", () => {
  const invalid = clone(claim);
  invalid.artifactStatus.verification = "ACCEPTANCE_PASSED";
  const result = validateTaskClaim(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "AUTHOR_CANNOT_ACCEPT"));
});

test("example independent review passes protocol validation", () => {
  const result = validateTaskReview(claim, review);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.scopeMatches, true);
});

test("same author and reviewer run is rejected", () => {
  const invalid = clone(review);
  invalid.reviewer.runId = claim.actor.runId;
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "SAME_RUN_NOT_INDEPENDENT"));
});

test("accepted review becomes invalid when the reviewed head differs", () => {
  const invalid = clone(review);
  invalid.reviewedScope.headRevision = "3333333333333333333333333333333333333333";
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "STALE_SCOPE"));
});

test("accepted review becomes stale when the repository differs", () => {
  const invalid = clone(review);
  invalid.reviewedScope.repository = "https://github.com/example/other.git";
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "STALE_SCOPE"));
});

test("accepted review becomes stale when the branch differs", () => {
  const invalid = clone(review);
  invalid.reviewedScope.branch = "other/branch";
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "STALE_SCOPE"));
});

test("accepted review requires reviewer git snapshot evidence", () => {
  const invalid = clone(review);
  invalid.evidence = invalid.evidence.filter((item) => item.type !== "git-snapshot");
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "REVIEW_SCOPE_EVIDENCE_REQUIRED"));
});

test("claim-reference evidence alone cannot independently verify a criterion", () => {
  const invalid = clone(review);
  invalid.evidence.push({
    id: "EVD-claim-only",
    type: "claim-reference",
    summary: "Points back to the author declaration.",
    locator: "CLM-scroll-restoration-001",
    producer: "reviewer-agent",
    observedAt: "2026-08-25T04:15:00.000Z",
  });
  invalid.criterionResults[0].evidenceIds = ["EVD-claim-only"];
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "SUBSTANTIVE_REVIEW_EVIDENCE_REQUIRED"));
});

test("git snapshot evidence alone cannot verify a criterion", () => {
  const invalid = clone(review);
  const snapshot = invalid.evidence.find((item) => item.type === "git-snapshot");
  invalid.criterionResults[0].evidenceIds = [snapshot.id];
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "SUBSTANTIVE_REVIEW_EVIDENCE_REQUIRED"));
});

test("git snapshot evidence alone cannot verify a mechanism subject", () => {
  const invalid = clone(review);
  const snapshot = invalid.evidence.find((item) => item.type === "git-snapshot");
  invalid.claimChecks[0].evidenceIds = [snapshot.id];
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "SUBSTANTIVE_REVIEW_EVIDENCE_REQUIRED"));
});

test("accepted review requires one check for every logic event and invariant", () => {
  const invalid = clone(review);
  invalid.claimChecks = invalid.claimChecks.filter((check) => check.subjectId !== "EVT-key-change");
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "ACCEPTED_WITH_INCOMPLETE_MECHANISM_COVERAGE"));
});

test("a logic subject cannot be checked twice", () => {
  const invalid = clone(review);
  invalid.claimChecks.push({ ...invalid.claimChecks[0], id: "CHK-duplicate" });
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "DUPLICATE_LOGIC_SUBJECT_CHECK"));
});

test("accepted review cannot contain an unverified mechanism check", () => {
  const invalid = clone(review);
  invalid.claimChecks[0].verdict = "unsupported";
  invalid.claimChecks[0].evidenceIds = [];
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "ACCEPTED_WITH_UNVERIFIED_MECHANISM"));
});

test("accepted review cannot contain a major discrepancy", () => {
  const invalid = clone(review);
  invalid.discrepancies.push({
    severity: "major",
    claim: "The second frame always runs.",
    observed: "A lifecycle path can skip it.",
    evidenceIds: ["EVD-review-source"]
  });
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "ACCEPTED_WITH_SEVERE_DISCREPANCY"));
});

test("accepted review requires every criterion to be independently verified", () => {
  const invalid = clone(review);
  invalid.criterionResults[0].verdict = "unsupported";
  invalid.criterionResults[0].evidenceIds = [];
  const result = validateTaskReview(claim, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "ACCEPTED_WITHOUT_FULL_VERIFICATION"));
});

test("claim renderer is deterministic and marks author status as a claim", () => {
  const first = renderTaskClaimHtml(claim);
  const second = renderTaskClaimHtml(claim);
  assert.equal(first, second);
  assert.match(first, /Author Declaration/);
  assert.match(first, /claimed, not independently verified/i);
  assert.match(first, /EVT-user-interrupt/);
  assert.match(first, /Complete logic event registry/);
  assert.match(first, /lane done/);
  assert.match(first, /\.lane\.done\{border-color:var\(--claim\)\}/);
  assert.match(first, /rel="icon"/);
  assert.match(first, /EVD-test-user/);
});

test("review renderer shows the independent verdict", () => {
  const html = renderTaskReviewHtml(claim, review);
  assert.match(html, /Independent Review/);
  assert.match(html, /accepted/);
  assert.match(html, /verified-complete/);
  assert.match(html, /Mechanism claim checks/);
  assert.match(html, /review-verified/);
  assert.match(html, /10\/10 logic subjects/);
  assert.match(html, /EVD-review-tests/);
});

test("dense mechanism models disclose primary-diagram omissions and retain a full event registry", () => {
  const dense = clone(claim);
  const template = dense.logic.events[0];
  dense.logic.events = Array.from({ length: 18 }, (_, index) => ({
    ...template,
    id: `EVT-dense-${index + 1}`,
    label: `event ${index + 1}`,
  }));
  const html = renderTaskClaimHtml(dense);
  assert.match(html, /primary figure omits 0 actor\(s\) and 2 event\(s\)/i);
  assert.match(html, /EVT-dense-18/);
});

test("renderer escapes untrusted text", () => {
  const escaped = clone(claim);
  escaped.task.title = "<script>alert('x')</script>";
  const html = renderTaskClaimHtml(escaped);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});
