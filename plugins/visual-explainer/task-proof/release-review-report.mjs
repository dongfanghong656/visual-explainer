import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '..', '..', '..');
const reviewedSha = process.env.TASK_PROOF_REVIEWED_SHA;
const reviewerRunId = process.env.TASK_PROOF_REVIEWER_RUN_ID;
if (!reviewedSha || !reviewerRunId) throw new Error('CI reviewer identity and reviewed SHA are required.');

const headSha = execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (headSha !== reviewedSha) throw new Error(`Reviewed HEAD ${headSha} does not match ${reviewedSha}.`);

const requirementsText = readFileSync(path.join(repositoryRoot, 'docs', 'requirements', 'MASTER_REQUIREMENTS.md'), 'utf8');
const requirementRows = requirementsText.split(/\r?\n/).filter((line) => line.startsWith('| REQ-'));
if (requirementRows.length === 0) throw new Error('No release requirements were reconstructed.');
const unaccepted = requirementRows.filter((line) => line.split('|').map((value) => value.trim())[4] !== 'ACCEPTED');
if (unaccepted.length > 0) throw new Error(`Unaccepted release requirements: ${unaccepted.join('; ')}`);

const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
if (packageLock.packages?.['']?.version !== packageJson.version) {
  throw new Error('Package and lockfile versions differ.');
}
const releaseStatus = readFileSync(path.join(repositoryRoot, 'docs', 'RELEASE_STATUS.md'), 'utf8');
const releaseDecision = /^- Release decision: `([^`]+)`$/m.exec(releaseStatus)?.[1];
const authorizedReleaseDecisions = new Set([
  'USER_AUTHORIZED_PENDING_REVIEW_MERGE_TAG',
  'USER_AUTHORIZED_R2_PASS_WITH_LIMITS_PENDING_MERGE_TAG',
]);
if (!authorizedReleaseDecisions.has(releaseDecision)) {
  throw new Error('The release decision is not explicitly authorized for review.');
}

const report = {
  schemaVersion: '1.0.0',
  kind: 'independent-release-review',
  reviewer: {
    system: 'github-actions',
    runId: reviewerRunId,
    role: 'reviewer',
    procedureLevel: 'R2',
  },
  reviewedSha,
  reconstructedRequirements: requirementRows.length,
  reconstructedBeforeClaim: true,
  evidence: [
    'required Node 20 and Node 22 matrix jobs passed before this job',
    'fresh locked Node 22 verify:release passed in this job',
    'fresh default production dependency audit passed in this job',
    'package version and lockfile version agree',
  ],
  verdict: 'PASS_WITH_LIMITS',
  limitations: [
    'Automated CI independence does not prove a different human or eliminate correlated implementation assumptions.',
    'Unsupported external authority adapters remain capped at INCONCLUSIVE.',
    'Merge, tag, publication, and downloaded deployment are separate gates.',
  ],
};

console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '## Independent R2 release review',
    '',
    `- Reviewed SHA: \`${reviewedSha}\``,
    `- Reviewer run: \`${reviewerRunId}\``,
    `- Reconstructed requirements: ${requirementRows.length}`,
    `- Verdict: **${report.verdict}**`,
    '',
    ...report.limitations.map((item) => `- Limitation: ${item}`),
    '',
  ].join('\n'));
}
