---
target: "UI review: Data, Trajectories, Cohort models and Methods"
total_score: 29
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\jan-p\\Development\\lab-trajectory-explorer-web\\src\\workspace\\WorkspaceApp.tsx"
target_fingerprint: "sha256:1eb23fd0d1b8773e6aadd073a86599eeca7b8f8df0051456cb45c413dfb40a96"
target_path: "C:\\Users\\jan-p\\Development\\lab-trajectory-explorer-web\\src\\workspace\\WorkspaceApp.tsx"
timestamp: 2026-10-15T11-47-12Z
slug: src-workspace-workspaceapp-tsx
---
Method: dual-agent (A: /root/design_review; B: /root/evidence_review)

Target: src/workspace/WorkspaceApp.tsx and the Data, Trajectories, Cohort models and Methods surfaces. Mode: Operate, with Read for Methods. Independent assessment A completed before B findings were released to the parent. Desktop 1440x1000 and mobile 390x844; empty state, demo data, table/overlay/individual, parameter picker, analysis settings, Methods and successful cohort fit inspected. This is a design critique, not a full accessibility compliance audit.

Design specificity: The research workflow is product-specific and credible: longitudinal lab measurements, preserved units, exclusions, shared preparation and uncertainty have appropriate treatment. The teal/white card shell is conventional but suitable. The opportunity is to make actual trajectories lead the experience.

Overall impression: Strong scientific-tool foundations, with a configuration-heavy hierarchy that delays the primary visual task. The existing sober identity should be preserved.

Design health, heuristic judgment rather than a measured quality metric:
| Heuristic | Score /4 | Main finding |
| --- | --- | --- |
| System status | 3 | Dataset, storage and fitting progress are visible. |
| Real-world match | 3 | Domain language appropriate; shared scope needs stronger presentation. |
| User control | 3 | Back paths and Apply/Cancel; limited recovery affordance after model invalidation. |
| Consistency | 3 | Consistent components; mobile Methods placement less coherent. |
| Error prevention | 3 | Preview and eligibility strong; cross-workspace changes rely on small copy. |
| Recognition | 3 | Context persists; shared preparation consequences require remembering. |
| Efficiency | 2 | Useful filters and views, but results sit below a long control preamble. |
| Minimalist design | 2 | Configuration and repeated prose dominate evidence. |
| Error recovery | 3 | Useful validation and missing-data paths; not all failures exercised. |
| Help | 4 | Task-oriented Methods, deep links and return paths. |
| Total | 29/40 | Good foundations; hierarchy and efficiency need work. |

Strengths:
- Demo import gives concrete success feedback: 506 measurements, eight events, 26 attribute rows, zero warnings/rejections.
- Shared versus zoomed scales and differentiated quality/endpoint/AKI caveats support interpretation.
- Methods provides useful task-based answers, grouped navigation and mobile disclosure.

Priority issues:
1. [P1] Trajectory results are pushed below the fold. At desktop 1440x1000 the table header starts around y=957; at mobile390x844 the table begins around y=1809. Filters, selection controls, view controls and appearance settings precede all patient plots. Keep view/parameter controls and compact scope summary near results; disclose secondary filters and table appearance. Aim to show the first desktop patient row immediately. Sources: src/workspace/TrajectoriesWorkspace.tsx:443,478,497,503; trajectories-workspace.css:16. Commands: impeccable distill / layout.
2. [P2] Model preparation appears local but changes shared analysis. The Data preparation select beside Model parameter affects trajectory columns without individual overrides; small paragraphs carry the scope and invalidation consequences. Label shared scope directly, show affected parameters and surface the consequence at change time; consider undo without changing scientific semantics. Sources: src/workspace/CohortModelsWorkspace.tsx:418,600; WorkspaceAnalysisSettings.tsx:84. Command: impeccable clarify.
3. [P2] Model setup gives repeated explanation equal weight to fit readiness. Formula, preparation, runtime and missingness prose delay the primary Fit action. Keep formula, eligible patients/measurements, exclusions and Fit together; disclose extended explanation, keeping exceptional conditions visible. Sources: src/workspace/CohortModelsWorkspace.tsx:375,599,600,613,630. Command: impeccable distill.
4. [P2] Mobile navigation and table sort targets need a deliberate touch layout. Main navigation targets measure36px high and Methods wraps above the other destinations. Sort arrows measure approximately19.5x19.2px. Use44px-high main navigation targets and larger sort hit areas, preserving the accessible Sort by select alternative. Sources: src/workspace/workspace.css:6,26,84; WorkspaceApp.tsx:91; TrajectoriesWorkspace.tsx:507,519. Commands: impeccable adapt / polish. This is a usability recommendation, not an asserted WCAG conformance failure.

Cognitive load: Five of eight reference checks fail in loaded Trajectories: single focus, chunking, hierarchy, one thing at a time, minimal choices. Grouping, context retention and disclosure largely pass. Five model presets, ten demo parameter options and17 default sort options are decision points worth structuring; search mitigates parameter choice. Six Methods answer links are appropriate for the task index.

Emotional journey: Calm entry and reassuring import; delayed visual payoff entering Trajectories; regained control in patient detail; clear fitting progress and successful result provide a strong payoff. Export and methodological caveats support responsible completion.

Personas:
- Alex, power user: repeat scrolling through familiar controls slows examination; search/group/sort otherwise help.
- Sam, accessibility-dependent: skip link, focus styling and labeled controls are strengths; small targets and11-12px metadata increase effort. No full screen-reader or contrast audit performed.
- Casey, mobile: no trajectory in first two screens, extra Methods header row, small targets; contained horizontal table scroll retains patient identity.

Minor observations: Open trajectories lacks primary-action prominence after import. Jump to parameter placeholder says Choose parameters, confusing movement with selection. Native file-input language follows browser localization and is not an application translation defect.

Deterministic and browser evidence: CLI scope src/workspace yielded exactly one overused-font warning, workspace.css:1 (Inter). Treat this as a subjective style heuristic, not an accessibility finding. Observed exit0 with nonempty findings, so not a clean scan. Browser scans included hidden Data/Cohort content, collapsed settings and a closed dialog; exclude these false positives from visible-page severity. Repeated kicker labels and compact badge line heights are minor observations, not priority defects. Document width matched viewport at1440 and390. Mobile table internal scroll: client356/scroll814, overflow auto, tabindex0 and labeled region. All checked visible inputs/selects/textareas had label/ARIA associations; this does not establish complete accessibility.

Questions to consider: Can the first trajectory be visible immediately? How can shared preparation scope be understood without reading paragraphs? Which scientific details must remain visible versus one deliberate click away?
