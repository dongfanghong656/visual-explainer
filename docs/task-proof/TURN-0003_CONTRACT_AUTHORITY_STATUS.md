# TURN-0003 — Contract authority hardening status

- Repository: `dongfanghong656/visual-explainer`
- Branch: `stage/task-proof-visualizer/turn-0003-contract-authority`
- Starting revision: `f2c0ced20615ffea3c92ddda7bd329dfc056832f`
- Protocol candidate: Task Contract `2.4.0`
- Authority receipt candidate: `1.4.0`
- Evidence assessment: `1.0.0`
- Named-check receipt: `1.0.0`
- Lifecycle assessment: `1.0.0`
- Release: `NOT_RELEASED`

## Implemented in this staging turn

- strict frozen-contract normalization and deterministic digest;
- explicit authority-source requirements and symmetric criterion coverage;
- blocking criterion and exact evidence policy rules;
- named-check policy, executable, arguments, working-directory, result, reviewer, and Claim-HEAD freezing;
- Claim binding to contract, authority declaration, criteria, repository, base, and chronology;
- one authority receipt for every source, bound to exact Claim HEAD and final reviewer run;
- trusted-adapter requirement before authority can contribute a passing cap;
- Review binding to Claim digest, contract, receipt set, exact repository scope, reviewer identity, procedure level, and chronology;
- verifier-bound evidence and lifecycle assessments; bare caller-supplied `PASS` strings are inconclusive;
- final gate as the minimum of evidence, authority, source coverage, contract policy, reviewer, named-check, and lifecycle caps;
- strict portable JSON Schema, example, specification, and adversarial/static tests.

## Evidence boundary

The new `*.test.mjs` files are automatically discovered by the repository strict test runner. CI and exact remote readback are required before this candidate can be called remotely verified.

The contract core remains isolated from public Author/Reviewer MCP and Skill paths. Until that integration is implemented, existing public entrypoints must not claim contract-enforced acceptance.

## Remaining work

1. complete Linux Node 20/22 CI at the exact final staging HEAD;
2. integrate mandatory contract validation into all public Claim/Review/MCP/Skill paths;
3. implement trusted repository, host-message, Issue, release-registry, or signature adapters;
4. run a distinct R2/R3 reviewer on the exact integrated candidate;
5. keep merge, release, publication, and deployment blocked until their own evidence gates pass.
