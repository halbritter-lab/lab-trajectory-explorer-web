---
target: Workspace (Data, Trajectories, Cohort models)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-10-12T14-35-00Z
slug: src-workspace-workspaceapp-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

# Workspace UX critique: 2026-10-12

Target: src/workspace/WorkspaceApp.tsx (Data, Trajectories, Cohort models; Methods excluded). Mode: Operate.
Score: **24/40 (Acceptable)**. All ten heuristics apply.

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Import with rejected rows uses the same green success notice; no announcement when a fit finishes |
| 2 | Match with the real world | 2 | Raw enums in the UI ("post_kidney_transplant"), sparkline axes in days but slopes per year, "KRT" unexplained |
| 3 | User control and freedom | 3 | Back/forward works; a preset overwrites custom settings without undo |
| 4 | Consistency and standards | 2 | Two visual systems; 3 "Fit model" buttons; −9.98 (table, toFixed) vs −9.99 (chart) |
| 5 | Error prevention | 2 | Default cohort parameter cannot be fitted; post-transplant values in the default slope without a note |
| 6 | Recognition rather than recall | 2 | Trend toggle buried; sort header buttons not keyboard-reachable |
| 7 | Flexibility and efficiency | 2 | No shortcuts, no URL state for patient or view, settings lost on reload |
| 8 | Aesthetic and minimalist design | 2 | About 15 controls before the first data point; empty cell takes 5 lines |
| 9 | Error recovery | 3 | Precise row diagnostics; rejected rows lack a warning tone |
| 10 | Help and documentation | 3 | Context links into Methods and keyboard-reachable explanations |

## Design specificity
Content is clearly authored for this product (KDIGO badges, reliability badge deliberately not red, row diagnostics, sticky IDs).
The visual layer is a generic teal card UI. Cohort models drops out of it: a Tailwind slate palette (#0f172a/#38bdf8),
emoji preset pills (🔬👥⚖️🧬🛠️), a dark formula strip and Title Case. It reads as a different, template-like product.
Detector: workspace markup clean (0 findings); 1x overused-font (Inter, in practice Segoe UI renders; low impact).
Overlay (headless): genuine findings are contrast, line length (up to about 220 characters per line at 1440px), skipped headings (H1→H4 Trajectories, H1→H3 Cohort),
neon cyan on slate, tight-leading on badges. False positives: hidden sections, closed dialog/details, guide padding.

## Priority issues
1. [P1] The cohort models demo path is a dead end: the default is the imported eGFR (5/14 patients) and the minimum is 10. Only Kreatinin mg/dl
   or computed eGFR (12) can be fitted. The reason appears twice and the Fit button three times. → fix in progress (default selection + demo data).
2. [P1] The core output is buried: trends are off by default, the toggle sits at the end of the collapsed "Display and analysis" card; at 390px
   the table starts at about y 1620. → top-level "Show trends" toggle, merge toolbar rows.
3. [P2] Observed endpoints and projections share one blue chip ("Kidney failure reached … · G5 @ ~77y"). Projections
   read like a prognosis. Empty eGFR cells show "G5 n < 3" plus "Endpoint details". → separate chips, suppress on 0 points.
   Wording of projections is the maintainer's call.
4. [P2] Contrast fails WCAG AA: footer research-use note 4.05:1 (12px), dataset bar 4.09:1, table headers 4.09:1, eyebrow 4.46:1,
   .muted 4.44:1. The legally most important note is the hardest to read. → darken --muted to about #55686e.
5. [P2] Two visual systems: map the Cohort CSS onto the workspace tokens, remove emoji, use a light mono formula panel.

## Persona red flags
- Alex: sort header aria-hidden/tabIndex −1, only a select with 17–52 options; no patient shortcuts; no URL state; 50-row paging.
- Sam: contrast (above); 13px checkboxes (<24px, WCAG 2.5.8); rejected import shown as role=status in success styling;
  "Highlight patient" has no effect in the individual view.
- Riley: long IDs truncated to "P-0001-v…" (indistinguishable); creatinine −1 is plotted although Data calls it implausible;
  plural bugs ("1 patients", "1 warnings", "1 parameters"); mobile cohort table breaks "Whole cohort" letter by letter.
- Nephrologist: patient 14 eGFR +25.29/yr including post-transplant values without a note; −9.98 vs −9.99; "(computed)" twice.

## Minor observations
"This session only" twice; guide line repeats tab names; disabled "Open trajectories →" in the empty state; empty states
do not offer the demo; overlay ticks not round (0.9/1.79/2.69); events table breaks mid-word; header shifts after a fit;
Fit stays primary after success. Touch targets at 390px: 10–49 elements per view under 44px (nav 36px, buttons 39px).

## Questions
1. If the slope is the product, why is it off by default and hidden?
2. Should "G5 @ ~77y" appear on screen next to a patient ID at all, or only in exports with methodology?
3. Is Cohort models a peer tab, or rather a "Model this selection" step after Trajectories?

Not verified: export file contents, real screen reader, 200% zoom, IndexedDB persistence, cohort details/projection panel.
