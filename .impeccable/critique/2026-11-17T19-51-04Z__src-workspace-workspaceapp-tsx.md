---
target: "Workspace after the case-study fixes (PR 55): Data, Trajectories, Cohort models"
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\jan-p\\Development\\lab-trajectory-explorer-web\\src\\workspace\\WorkspaceApp.tsx"
target_fingerprint: "sha256:b8fa61b4e2f38752f6a653cfadc9f2b156dc09294cbb7b8060d81a9982a99b25"
target_path: "C:\\Users\\jan-p\\Development\\lab-trajectory-explorer-web\\src\\workspace\\WorkspaceApp.tsx"
timestamp: 2026-11-17T19-51-04Z
slug: src-workspace-workspaceapp-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

Scope: workspace (Data, Trajectories table/overlay/patient view, Cohort models) on branch `feat/ux-case-study-fixes` (PR #55), demo data, 1440×900 and 390×844. Source files were edited during the run (review fixes of PR #55); one Vite reload occurred.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | No progress while R downloads for the first fit |
| 2 | Match with the real world | 2 | R formula, "fixed-effect profile", "Complete cases", hashes, "G5 @ ~77y" |
| 3 | User control and freedom | 2 | No Cancel on a fit; "Data preparation" on Cohort models changes Trajectories settings and discards fits |
| 4 | Consistency and standards | 2 | Two date formats, two badge styles, three names for time balancing, stale navigation hint |
| 5 | Error prevention | 3 | "rapid ↓" on a fit of two quarterly medians; "Apply calculation" active with formula "Off" |
| 6 | Recognition rather than recall | 2 | Icon-only eye and slider per column, "S M L" unlabelled, grouping three levels deep |
| 7 | Flexibility and efficiency | 2 | No filter by flag, no sort by endpoint or projected age |
| 8 | Aesthetic and minimalist design | 2 | Badge pile-ups, 110-word storage paragraph, repeated legends |
| 9 | Error recovery | 3 | Messages name problem and fix; import errors not tested |
| 10 | Help and documentation | 3 | Contextual links work; Methods paragraphs are long |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment.** Authored in content, interchangeable in form. Copy, badges and rules belong to this product only ("Fit includes 3 values in an AKI window", the shaded AKI window with open circles). The shell is a generic admin look: white cards, one teal accent, 13 px sans. The product is about slope, and the slope is the least prominent number: 11 px muted text in the table, while the latest value is bold. The default shared scale including zero flattens the sparklines. No reference geometry a nephrologist knows (no line at 15 or 30, no G-stage bands).

**Deterministic scan.** CLI: 1 finding (`overused-font`, `workspace.css:1`; partly false, no Inter webfont is shipped). In the page: 10 px preset label and 11 px slope text in the table (confirmed by measurement: 120 text nodes under 12 px in the trend table), a skipped heading level in the plot cards (h1 → h3, `WorkspacePlot.tsx`), line length of about 136 characters in the storage paragraph. No horizontal page overflow at 1440 or 390 px, no console errors. Checkboxes are 13×13 px; overlay lines are focusable with bounding boxes as low as 4 px. Judged false positives: `nested-cards` (notice and preset bar), `kicker-above-heading`.

**Visual overlays.** Injected in a headless browser only; no user-visible overlay.

## Overall Impression

The honesty of the flags is the product's strength and PR #55 adds to it. The table now says more, but it says everything at the same weight. The single biggest opportunity: make the slope the main figure of a trend cell and move the rest behind it.

## What's Working

1. Specific flags with the fix attached ("Fit includes 2 values after chronic dialysis start" names the setting).
2. The patient chart shows the method: shaded AKI window, open circles for excluded points, dashed fit, "8 quarterly medians fitted (10 measurements)".
3. Accessibility base and contextual help: real dialog with focus handling, focusable overlay lines, skip link, Methods deep links with a way back.

## Priority Issues

- **[P1] Slope and projected age are the least legible things in the table.** Slope is 11 px muted with varying decimals; the projection is "-14%, G5 @ ~77y" in a chip without label or interval; sparklines are flat on the shared scale. Fix: slope as the bold figure with fixed decimals and the unit once in the header; chip in words ("Total change −14% · Projected G5 at about age 77"); slope CI in the cell or on focus; zoomed scale or a stronger fit line when Trend is on. Command: /impeccable layout, /impeccable typeset.
- **[P1] Cohort models speaks R, not nephrology.** The formula leads; "Subgroup comparison" shows two slopes without a difference or interval; "unit", "Complete cases", engine and hashes. Fix: lead with a plain sentence, formula and hashes into collapsed technical details, CI beside the slope, rename "Subgroup comparison" to "Separate model per group". Wording is the maintainer's. Command: /impeccable clarify.
- **[P1] Analysis controls are scattered and misnamed.** Settings behind an unlabelled slider icon; "…" holds only sorting; grouping only via Attributes → column → "…"; one control is called "Aggregation", "Time balancing" and "quarterly medians"; "Own settings". Fix: label the slider "Settings", rename "…" to "Sort", "Group by" select in the toolbar, one term. Command: /impeccable clarify, /impeccable distill.
- **[P2] Overlay is hard to read as a cohort view.** 25 same-colour full-opacity lines; tick values are computed fractions (96.9 / 48.45 / 0); events missing from the legend; SVG text about 5 px at 390 px. (The hover emphasis added in PR #55 was not seen by Assessment A; it is covered by a browser test.) Fix: lines at reduced opacity, round tick steps, events in the legend, re-layout on mobile. Command: /impeccable layout, /impeccable adapt.
- **[P2] First model fit: no Cancel, no progress; cross-page side effects.** About a minute of disabled buttons; changing "Data preparation" discards fits with a 12 px notice; two fit buttons; "A: 11" eligible beside "A: 12 patients". Fix: Cancel and a two-step status, confirm before discarding fits, one button, explain 11 versus 12. Command: /impeccable harden.

## Persona Red Flags

- **Alex (power user):** no filter for "rapid ↓" or AKI; no sort by projected age; a preset must be set per column; group header without a group slope; fit cannot be cancelled.
- **Sam (accessibility):** 13 px checkboxes also on a phone; icon-only eye and slider; 11 px text throughout the table, "3 excluded" chip at 4.27:1; cohort groups differ by colour only; "Aggregation" is announced as "Time balancing".
- **Jordan (first-timer):** 110-word storage paragraph; the Trend hint is 12 px grey; "S M L" unlabelled; "G5 @ ~77y", "KRT", "OLS", "Theil–Sen" undefined inline; five model types then an R formula; four different "no data" messages in one card.

## Minor Observations

- Dates: 2024-04-15 in events and endpoint badges, 15/04/2024 in the AKI table and tooltips.
- Loaded events table: narrow columns break words; inner scroll boxes clip rows without a cue.
- Dataset name twice on Trajectories; the tagline is filler.
- "AKI" chip wraps alone; badges look different in table and patient view.
- Patient header is one unspaced row; wraps over four lines at 390 px.
- Projection table: "Model time" and "Remaining years" show identical values; years to two decimals beside "time uncertainty is not estimated".
- Stale hint "Trajectories → Display and analysis" on the Data page and in the Methods topic.

## Questions to Consider

1. If the table showed only patient, slope with CI and one status word, what would a nephrologist lose?
2. Why does a projected age appear in a table cell at the weight of "3 excluded"?
3. Should Cohort models start from a question ("Does eGFR fall faster in B than in A?") instead of a model type?
