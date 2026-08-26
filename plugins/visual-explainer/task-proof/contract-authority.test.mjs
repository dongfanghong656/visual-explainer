import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeContractBoundGate,
  contractAuthorityCap,
  digestContractAuthorityReceipt,
  digestTaskContract,
  sha256,
  validateClaimContractBinding,
  validateReviewContractBinding,
  validateReviewerAttestation,
  validateTaskContract,
  verifyRepositoryContractSource,
} from './contract-authority.mjs';

const SOURCE_TEXT = [
  '# REQ-0006 — Frozen task contract',
  '',
  'The claim and review must bind to a pre-approved contract.',
  '',
].join('\n');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeContract({
  authorityLevel = 'project-approved',
  minimumIndependence = 'R2',
} = {}) {
  const sourceType = {
    'user-attested': 'user-message',
    'issue-locked': 'issue',
    'release-policy': 'release-policy',
  }[authorityLevel] ?? 'repository-file';

  const contract = {
    schemaVersion: '2.1.0',
    kind: 'task-contract',
    contractId: 'TPC-0001',
    taskId: 'TASK-0006',
    repository: 'dongfanghong656/visual-explainer',
    authority: {
      level: authorityLevel,
      issuerRole: authorityLevel.startsWith('user-') ? 'project-owner' : 'project-maintainer',
      issuerRunId: 'authority-run-001',
      method: 'procedural-attestation',
      issuedAt: '2026-08-26T00:00:00.000Z',
      signature: null,
    },
    source: {
      type: sourceType,
      locator: sourceType === 'repository-file'
        ? 'docs/requirements/REQ-0006.md'
        : `${sourceType}:TPC-0001`,
      revision: '1111111111111111111111111111111111111111',
      sha256: sha256(SOURCE_TEXT),
    },
    scope: {
      baseRevision: '2222222222222222222222222222222222222222',
      includedOutcomes: [
        'Review reloads the same contract.',
        'Claim binds to the frozen contract digest.',
      ],
      excludedOutcomes: [
        'Cryptographic reviewer identity.',
      ],
    },
    criteria: [
      {
        id: 'AC-CONTRACT-001',
        statement: 'Claim references the exact frozen contract digest.',
        criticality: 'blocking',
        requiredEvidenceKinds: ['source-inspection', 'test'],
        requiredEvidenceLocators: [
          'named-check:task-proof-tests',
          'file:plugins/visual-explainer/task-proof/contract-authority.mjs',
        ],
      },
      {
        id: 'AC-CONTRACT-002',
        statement: 'Reviewer independently reloads and verifies the same contract.',
        criticality: 'blocking',
        requiredEvidenceKinds: ['test', 'source-inspection'],
        requiredEvidenceLocators: [
          'named-check:task-proof-tests',
        ],
      },
    ],
    reviewPolicy: {
      minimumIndependence,
      allBlockingCriteriaRequired: true,
      allowProducerProvisionalContract: false,
    },
    amendment: null,
  };

  if (authorityLevel === 'amended') {
    contract.source.type = 'repository-file';
    contract.amendment = {
      previousContractDigest: 'a'.repeat(64),
      reason: 'Acceptance contract was superseded.',
    };
  } else if (authorityLevel === 'revoked') {
    contract.source.type = 'repository-file';
    contract.amendment = {
      reason: 'Contract was revoked by the project owner.',
    };
  }

  return contract;
}

function contractRef(contract) {
  return {
    contractId: contract.contractId,
    contractDigest: digestTaskContract(contract),
    authorityReceiptDigest: digestContractAuthorityReceipt(contract),
  };
}

function makeClaim(contract) {
  return {
    taskId: contract.taskId,
    repository: contract.repository,
    producer: {
      role: 'producer',
      runId: 'producer-run-001',
    },
    contractRef: contractRef(contract),
    acceptanceCriteria: clone(contract.criteria),
  };
}

function makeAttestation({
  level = 'R2',
  claimantRunId = 'producer-run-001',
  sessionId = 'review-run-002',
} = {}) {
  return {
    level,
    actorType: 'ai',
    provider: 'test-provider',
    model: 'review-model',
    sessionId,
    claimantRunId,
    reconstructedBeforeReadingClaim: ['R2', 'R3'].includes(level),
    independentEvidenceCollected: ['R1', 'R2', 'R3'].includes(level),
    adversarialEvidenceCollected: level === 'R3',
    method: 'procedural-attestation',
    signature: null,
  };
}

function makeReview(contract, claim, level = 'R2') {
  return {
    contractRef: contractRef(contract),
    reviewer: {
      role: 'reviewer',
      runId: 'review-run-002',
    },
    reviewerAttestation: makeAttestation({ level }),
    claimDigest: sha256(JSON.stringify(claim)),
  };
}

test('project-approved contract validates and has stable canonical digests', () => {
  const contract = makeContract();
  const validation = validateTaskContract(contract);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(validation.authorityCap, 'PASS');

  const reordered = clone(contract);
  reordered.criteria.reverse();
  reordered.criteria[0].requiredEvidenceKinds.reverse();
  reordered.criteria[0].requiredEvidenceLocators.reverse();
  reordered.scope.includedOutcomes.reverse();

  assert.equal(digestTaskContract(reordered), validation.digest);
  assert.equal(
    digestContractAuthorityReceipt(reordered),
    validation.authorityReceiptDigest,
  );
});

test('producer-provisional and unbound user contracts cannot yield PASS', () => {
  assert.equal(contractAuthorityCap('producer-provisional'), 'INCONCLUSIVE');
  assert.equal(contractAuthorityCap('user-explicit-unbound'), 'INCONCLUSIVE');

  const contract = makeContract({
    authorityLevel: 'producer-provisional',
    minimumIndependence: 'R3',
  });
  const claim = makeClaim(contract);
  const result = computeContractBoundGate({
    evidenceGate: 'PASS',
    contract,
    reviewerAttestation: makeAttestation({ level: 'R3' }),
    claim,
  });

  assert.equal(result.gate, 'INCONCLUSIVE');
  assert.equal(result.contractAuthorityCap, 'INCONCLUSIVE');
});

test('amended contracts make old claims stale and revoked contracts fail', () => {
  const amended = makeContract({ authorityLevel: 'amended' });
  const revoked = makeContract({ authorityLevel: 'revoked' });

  assert.equal(validateTaskContract(amended).authorityCap, 'STALE');
  assert.equal(validateTaskContract(revoked).authorityCap, 'FAIL');

  const amendedResult = computeContractBoundGate({
    evidenceGate: 'PASS',
    contract: amended,
    reviewerAttestation: makeAttestation(),
    claim: makeClaim(amended),
  });
  const revokedResult = computeContractBoundGate({
    evidenceGate: 'PASS',
    contract: revoked,
    reviewerAttestation: makeAttestation(),
    claim: makeClaim(revoked),
  });

  assert.equal(amendedResult.gate, 'STALE');
  assert.equal(revokedResult.gate, 'FAIL');
});

test('claim cannot delete a blocking criterion from a copied contract', () => {
  const contract = makeContract();
  const claim = makeClaim(contract);
  claim.acceptanceCriteria.pop();

  const result = validateClaimContractBinding(contract, claim);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'CONTRACT_CRITERION_SET_MISMATCH'));
});

test('claim cannot rewrite criterion text or lower evidence policy', () => {
  const contract = makeContract();
  const claim = makeClaim(contract);
  claim.acceptanceCriteria[0].statement = 'An easier statement.';
  claim.acceptanceCriteria[1].criticality = 'advisory';
  claim.acceptanceCriteria[1].requiredEvidenceLocators = [];

  const result = validateClaimContractBinding(contract, claim);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'CONTRACT_CRITERION_CONTENT_MISMATCH'));
  assert.ok(result.errors.some((item) => item.code === 'CONTRACT_POLICY_MISMATCH'));
});

test('claim contract digest and authority receipt are both mandatory', () => {
  const contract = makeContract();
  const claim = makeClaim(contract);
  claim.contractRef.contractDigest = '0'.repeat(64);
  claim.contractRef.authorityReceiptDigest = '1'.repeat(64);

  const result = validateClaimContractBinding(contract, claim);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'CONTRACT_MISMATCH'));
  assert.ok(
    result.errors.some((item) => item.code === 'CONTRACT_AUTHORITY_RECEIPT_MISMATCH'),
  );
});

test('review must bind to the same contract as the claim', () => {
  const contract = makeContract();
  const claim = makeClaim(contract);
  const review = makeReview(contract, claim);
  review.contractRef.contractDigest = 'f'.repeat(64);

  const result = validateReviewContractBinding(contract, claim, review);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'CONTRACT_MISMATCH'));
});

test('R0 narrative review cannot satisfy an R2 contract', () => {
  const contract = makeContract({ minimumIndependence: 'R2' });
  const claim = makeClaim(contract);
  const attestation = makeAttestation({ level: 'R0' });

  const validation = validateReviewerAttestation(contract, claim, attestation);
  assert.equal(validation.ok, false);
  assert.equal(validation.cap, 'INCONCLUSIVE');
  assert.ok(
    validation.errors.some((item) => item.code === 'REVIEW_INDEPENDENCE_INSUFFICIENT'),
  );
});

test('R2 procedural attestation satisfies an R2 contract but is not cryptographic identity', () => {
  const contract = makeContract({ minimumIndependence: 'R2' });
  const claim = makeClaim(contract);
  const attestation = makeAttestation({ level: 'R2' });

  const validation = validateReviewerAttestation(contract, claim, attestation);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(validation.cap, 'PASS');
  assert.equal(attestation.method, 'procedural-attestation');
  assert.equal(attestation.signature, null);
});

test('R3 contract rejects an R2 attestation and R3 requires adversarial evidence', () => {
  const contract = makeContract({ minimumIndependence: 'R3' });
  const claim = makeClaim(contract);

  const tooWeak = validateReviewerAttestation(
    contract,
    claim,
    makeAttestation({ level: 'R2' }),
  );
  assert.equal(tooWeak.ok, false);
  assert.ok(
    tooWeak.errors.some((item) => item.code === 'REVIEW_INDEPENDENCE_INSUFFICIENT'),
  );

  const missingAdversarial = makeAttestation({ level: 'R3' });
  missingAdversarial.adversarialEvidenceCollected = false;
  const invalidR3 = validateReviewerAttestation(contract, claim, missingAdversarial);
  assert.equal(invalidR3.ok, false);
  assert.ok(
    invalidR3.errors.some((item) => item.code === 'REVIEWER_ATTESTATION_ADVERSARIAL'),
  );
});

test('same reviewer and claimant session is rejected', () => {
  const contract = makeContract();
  const claim = makeClaim(contract);
  const attestation = makeAttestation({
    level: 'R2',
    sessionId: 'producer-run-001',
  });

  const result = validateReviewerAttestation(contract, claim, attestation);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === 'NOT_INDEPENDENT'));
});

test('repository source receipt verifies digest, ancestry, path, and implementation immutability', () => {
  const contract = makeContract();
  const result = verifyRepositoryContractSource({
    contract,
    sourceContent: SOURCE_TEXT,
    sourceRevision: contract.source.revision,
    implementationBaseRevision: contract.scope.baseRevision,
    changedPaths: ['plugins/visual-explainer/task-proof/core.mjs'],
    isAncestor: (ancestor, descendant) => (
      ancestor === contract.source.revision
      && descendant === contract.scope.baseRevision
    ),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.match(result.sourceReceiptDigest, /^[a-f0-9]{64}$/);
});

test('repository source changed during implementation is rejected', () => {
  const contract = makeContract();
  const result = verifyRepositoryContractSource({
    contract,
    sourceContent: SOURCE_TEXT,
    sourceRevision: contract.source.revision,
    implementationBaseRevision: contract.scope.baseRevision,
    changedPaths: [contract.source.locator],
    isAncestor: () => true,
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((item) => item.code === 'CONTRACT_CHANGED_IN_IMPLEMENTATION_SCOPE'),
  );
});

test('source digest mismatch, symlink, and non-ancestor revision are rejected', () => {
  const contract = makeContract();
  const result = verifyRepositoryContractSource({
    contract,
    sourceContent: 'tampered source\n',
    sourceRevision: contract.source.revision,
    implementationBaseRevision: contract.scope.baseRevision,
    changedPaths: [],
    sourceIsSymlink: true,
    isAncestor: () => false,
  });

  assert.equal(result.ok, false);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.ok(codes.has('CONTRACT_SOURCE_DIGEST_MISMATCH'));
  assert.ok(codes.has('CONTRACT_SOURCE_SYMLINK'));
  assert.ok(codes.has('CONTRACT_REVISION_NOT_ANCESTOR'));
});

test('final gate is the minimum of evidence, authority, reviewer, and lifecycle caps', () => {
  const contract = makeContract({ minimumIndependence: 'R1' });
  const claim = makeClaim(contract);
  const result = computeContractBoundGate({
    evidenceGate: 'PASS',
    contract,
    reviewerAttestation: makeAttestation({ level: 'R1' }),
    claim,
    lifecycleGate: 'INCONCLUSIVE',
  });

  assert.equal(result.gate, 'INCONCLUSIVE');
  assert.equal(result.contractAuthorityCap, 'PASS');
  assert.equal(result.reviewerIndependenceCap, 'PASS_WITH_LIMITS');
  assert.equal(result.lifecycleGate, 'INCONCLUSIVE');
});
