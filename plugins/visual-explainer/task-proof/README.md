# Task Proof strict runtime

This directory contains the evidence-gated Task Proof runtime used by the Visual Explainer fork.

## Current authorities

- `STANDARD_V0.2.md` — Claim/evidence/review/diagram standard;
- `SECURITY_V0.2.md` — repository, execution, output, and receipt boundaries;
- `MCP_V0.2.md` — current six-tool MCP surface;
- `CONTRACT_AUTHORITY_V2.4.md` — frozen Task Contract authority and final-gate rules;
- `task-proof.schema.json` — Claim/Review migration shape;
- `task-contract.schema.json` — strict Task Contract shape.

Historical `PROTOCOL.md`, `CONTRACT_AUTHORITY_V2.1.md`, and `CONTRACT_AUTHORITY_V2.3.md` are compatibility/tombstone documents, not current independent authorities.

## Contract-core modules

- `contract-authority.mjs` — normalization, canonical digest, Claim/Review binding, receipt and assessment primitives;
- `contract-final-gate.mjs` — canonical final-gate orchestrator;
- `contract-authority.test.mjs` — primitive/adversarial tests;
- `contract-final-gate.test.mjs` — orchestration and context-binding attacks;
- `contract-authority-static.test.mjs` — schema/example/specification drift checks.

Public or release-adjacent integrations must call `computeStrictContractGate` from `contract-final-gate.mjs`. The lower-level calculator in `contract-authority.mjs` is not a public authorization boundary.

## Current maturity

Task Contract Protocol 2.4 is an isolated staging candidate in draft PR #3. It is not yet mandatory in the existing public Author/Reviewer/MCP/Skill paths. Therefore the project must not claim contract-enforced final acceptance until TASK-0007 is complete and independently reviewed.

## Verification

```bash
npm run verify:task-proof
```

The strict runner discovers every `*.test.mjs` file. Exact final-head Node 20/22 CI, clean readback, and a distinct R2/R3 review remain required before integration.
