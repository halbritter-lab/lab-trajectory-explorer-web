---
target: "Structured Methods help: baseline UX review and implemented fixes"
total_score: 29
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\jan-p\\Development\\lab-trajectory-explorer-web\\src\\workspace\\methods\\Methodology.tsx"
target_fingerprint: "sha256:9794a78f724cf4e0c3625f350a83c7a9aeb44dfe852420ffe350885092e3040a"
target_path: "C:\\Users\\jan-p\\Development\\lab-trajectory-explorer-web\\src\\workspace\\methods\\Methodology.tsx"
timestamp: 2026-10-11T16-57-33Z
slug: src-workspace-methods-methodology-tsx
---
Method: dual-agent (A: /root/ux_design; B: /root/ux_evidence)

# Structured help UX review — 2026-10-11

Target: src/workspace/methods/Methodology.tsx and its topic components.
Mode: Read. Baseline assessment before the UX fixes below: **29/40 — Good**.

| Heuristic | Score /4 | Finding |
|---|---:|---|
| Visibility of status | 3 | Current topic and focused destination are clear. |
| Match to real world | 4 | Research tasks and application-specific examples. |
| User control and freedom | 2 | Long articles remove access to analysis controls. |
| Consistency and standards | 3 | Native links and details; compact table typography. |
| Error prevention | 3 | Scientific assumptions and limitations remain explicit. |
| Recognition over recall | 3 | Workflow destinations lacked direct actions. |
| Flexibility and efficiency | 2 | Deep links work; long sections require excessive travel. |
| Aesthetic and minimalist design | 3 | Focused prose; comparison tables cramped. |
| Error recovery | 3 | Missing-result explanations give concrete checks. |
| Help and documentation | 3 | Strong content, but troubleshooting followed onboarding. |
| Total | 29/40 | All ten heuristics apply. |

The layout is authored for this research tool. The 3/4/2 topic groups, explicit
model assumptions and worked examples establish a useful, restrained reference.
The reading-to-action transition and mobile comparison layout needed refinement.

## Priorities and fixes

1. **P1: Return to analysis and topic controls.** On mobile OLS details the global
   header was about 8,859px above the viewport and the topic control 8,536px above.
   Added a reachable sidebar return action, sticky mobile topic/return controls,
   article-end actions and direct workspace buttons in the guide. Mounted patient
   detail and its overlay return view are retained.
2. **P1: Readable tables.** Quality and endpoint first columns shrank to 35–62px,
   turning labels into tiny fragments, even on desktop. Added named focusable
   scroll regions, 620px minimum table width, 14px text and deliberate row-label
   widths with normal word wrapping. Arrow-key scrolling is regression tested.
3. **P2: Detail granularity.** One disclosure opened five lengthy fit sections.
   Each calculation group now has its own titled disclosure; direct section URLs
   open their ancestors and only the linked group. Scientific prose is retained.
4. **P2: Answer discovery.** Six troubleshooting shortcuts were below the six-step
   guide. Moved the answer shortcuts first and added their own subsection link.
5. **P2: Touch targets.** Answer links were 36px high. Question shortcuts and the
   new detail summaries now have minimum 44px targets.

Cognitive load was moderate: task grouping and familiar controls worked, but the
reader had to remember workspace destinations and cross a long document to act.
The changes connect the answer to its next action. First-time readers retain the
workflow guide; experienced users can reach answers before onboarding. Low-vision
and keyboard readers get clearer table labels and named scroll regions.

## Evidence and limitations

Two isolated assessments independently inspected source and desktop/mobile
Chromium screenshots. Native MCP browser startup failed due to a shared-profile
lock, so both used independent local Playwright browsers. B inspected four routes
at 1440, 390 and 320px: all 12 clean pages had document width equal to viewport.
Sampled main, link, muted and table-label colors passed AA normal-text contrast.
The CLI detector returned zero findings, exit 0, with no rule/file locations.

Local mutable injection worked and live overlays produced 5/8/5/5 warnings across
Start/Fits/Endpoints/Export. Global footer/guide warnings and detector-induced
width changes are not attributed to the help article. Exact overlay rule/file
counts were unavailable; CLI results and measured clean pages are the reliable
fallback. No user-visible Human overlay was presented. Detector servers and local
browser processes were stopped by B; temporary scripts were removed.

Questions skipped: The owner explicitly requested fixes to any UX findings and
publication of that scope. No additional preference or scope decision was needed.

No scientific revalidation, clinical acceptance or new real-WebR smoke is claimed.
The final confirmation and release verification are recorded in the PR/release.
