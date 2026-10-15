---
target: Toolbar workflow, click costs and modularity
total_score: 22
max_score: 40
na_heuristics: none
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\jan-p\\Development\\lab-trajectory-explorer-web\\prototypes\\trajectory-toolbar\\TrajectoriesPreview.tsx"
target_fingerprint: "sha256:23fe8a3f8d4a4e5a3620b4325ae3c0c60953d396d3108a5ebfdca94a06ef93ee"
target_path: "C:\\Users\\jan-p\\Development\\lab-trajectory-explorer-web\\prototypes\\trajectory-toolbar\\TrajectoriesPreview.tsx"
timestamp: 2026-10-15T15-04-24Z
slug: rajectory-toolbar-trajectoriespreview-tsx-3ff5f695
---
Method: dual-agent (A: /root/workflow_design; B: /root/workflow_evidence)
Target: prototypes/trajectory-toolbar/TrajectoriesPreview.tsx. Operate mode. Independent A completed before B evidence was released. Desktop1440x1000 and mobile390x844, bundled demo. No source edits during assessment.

Design specificity: Visual restraint and measured table content fit longitudinal research, but actions follow settings categories instead of the parameter being investigated. The presentation is quieter than the interaction model.

Heuristic scores (/4): status2; real-world match3; control3; consistency2; prevention2; recognition2; efficiency1; minimalist design3; recovery2; help2. Total22/40. Scores are expert judgments, not measured outcomes.

Strengths: compact numerical summaries; shared scales; accessible warning explanations and short AKI pill; calculation activation is independent of line visibility; manual specialist assignment.

Priority issues:
[P1] Essential activation is hidden: Analysis -> Trend accordion -> checkbox,3 pointer activations. Adding a line requires closing the panel, opening View and checking Show lines,6 activations including close. A comparison excluding closing yielded5. Fix: adjacent but distinct calculation and line controls in each parameter header.
[P1] Context is ambiguous: Scope selects one parameter while the trend list contains all parameters. Specialist profile plus activation is7 clicks when each native select opening and option choice counts separately. Fix: parameter header opens a panel already scoped to that parameter, with no Scope selector or unrelated parameter checklist. General shared defaults stay separate.
[P1] Domain-specific UI coupling: shared settings imports nephrology policies, constants and analyte recognition; category checks and hard-coded AKI/eGFR groups determine availability. All future registered column-setting modules are incorrectly gated by a nephrology-derived specialist boolean. Fix: generic UI renders module adapters/contracts; domain controls and applicability reside in their own module. Use existing registry foundations; do not alter numerical core rules.
[P2] Header sorting cycles through unexplained metrics; controls are aria-hidden and removed from keyboard order. Fix: explicit accessible column actions, visible active metric/direction and a context menu. Keep meaningful metric eligibility.
[P2] View mixes6 decisions and mobile popup ends around890px in844px viewport without internal scrolling. Filter/Sort/View targets have widths40.19/35.66/39.31px. Tab can leave an open popup while it remains on screen. Fix: direct zoom controls and fewer popups; viewport-bounded positioning;44px targets and focus-exit dismissal.

Measured workflows, native select=open+choose:
- Activate one default trend:3 clicks; target1.
- Activate and display line:6 including closing panel; target2.
- Assign specialist profile and calculate:7; contextual-panel target4.
- Change parameter method:6; header-select target2.
- Add displayed parameter:3, reasonable staged selection.

Cognitive load:4 failed checks (grouping, hierarchy, working memory, progressive disclosure). Key related actions are separated and must be remembered across overlays.
Personas: general researcher meets disabled line control and AKI help; expert repeats setup navigation; keyboard user loses direct header sorting. Emotional valley is entering settings before discovering the actual activation.

User steering: restore historical S/M/L mini-graph zoom levels (tests/e2e/smoke.md phase7); distinguish graph magnification from value-scale zoom. Put sorting/context menus at each column. Preserve generic workflows, explicit specialist assignment, independent analysis/line states, minimal text and AKI pills.

Detector: CLI scope prototypes/trajectory-toolbar returned[] and exit0,0 findings. Browser reported1 heading but2 rule logs: overused-font (Inter), em-dash-overuse (31 body dashes, many missing-value placeholders). Neither explains workflow friction. No user-visible overlay remains; headless mutation/injection succeeded. Isolated browser contexts closed; visualization server PID16172 stopped and server.json removed. App server5173 left running at user request. Ignore list absent.

Questions for design: Can the parameter be the interaction context? Which controls really need a popup? Can a future non-nephrology module supply its own controls without changes to the shared editor?
