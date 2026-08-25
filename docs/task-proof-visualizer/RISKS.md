# Task Proof Visualizer — Risk Register

| ID | Risk | Severity | Current mitigation | Remaining action |
|---|---|---:|---|---|
| RK-001 | A producer fabricates evidence objects | High | self-report trust class; independent reviewer must reopen evidence | add signed/attested adapters in later version |
| RK-002 | Reviewer is anchored by producer narrative | High | required review order and independence levels | run real separate-context reviewer before integration |
| RK-003 | Acceptance criteria are weakened after failure | High | Skill freezes criteria and requires decision record | add machine-readable criteria history later |
| RK-004 | A valid manifest is mistaken for truthful proof | High | docs distinguish structural validation from independent observation | emphasize in UI and final status labels |
| RK-005 | Git refs change after proof generation | High | prefer immutable SHAs; CI generator uses actual `GITHUB_SHA` | reviewer must compare exact SHA/digest |
| RK-006 | Workspace or output path escape | High | realpath allowlist, lexical containment, strict output names, symlink rejection | independent security review and Windows-specific tests |
| RK-007 | Git metadata or labels inject Mermaid/HTML | Medium | label sanitization, no arbitrary HTML rendering | add broader fuzz tests |
| RK-008 | Large repositories overflow context or buffers | Medium | bounded commits/status/diff/file count and label limits | add configurable hard schema count limits |
| RK-009 | Test command passes without proving central behavior | High | claim-to-acceptance mapping and reviewer challenge matrix | add mutation/failure-injection tests |
| RK-010 | CI producer proof is treated as independent review | High | proof explicitly identifies producer mode and next reviewer action | do not merge until reviewer reconciliation exists |
| RK-011 | MCP SDK/Zod dependency drift breaks startup | Medium | stdio smoke test on Node 20/22 | commit lockfile and add update policy before release |
| RK-012 | Plugin metadata is not recognized by every host | Medium | portable SKILL/MCP/CLI are usable independently | clean-checkout host installation test |
| RK-013 | Flat claim counts create misleading progress percentages | Medium | no percentage-based final verdict; acceptance-critical claims remain explicit | add claim criticality field later |
| RK-014 | Writer leaves a partial bundle on filesystem failure | Medium | preflight, per-file atomic create, rollback created files | consider atomic run-directory format in v0.2 |
| RK-015 | Windows path and symlink behavior differs from Linux CI | Medium | platform-specific root separator logic | add Windows CI before public release |
| RK-016 | Existing Visual Explainer changes regress the additive plugin | Low | isolated plugin directory and path-filtered CI | add compatibility check against upstream updates |
| RK-017 | Fork diverges without upstream plan | Medium | additive design minimizes conflicts | decide upstream contribution or maintained fork |
| RK-018 | Diagram compression hides a material blocker | High | material blockers cannot be dropped; full JSON/Markdown companions | add diagram overflow warning in v0.2 |
