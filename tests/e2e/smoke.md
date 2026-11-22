# Manual browser smoke checklist

## Open points of the persona review (2026-11-22)

Verified 2026-11-22 on branch `chore/persona-review-open-details` with
ad-hoc Playwright scripts against the production build in Chromium (1440 px
and 390 px), with the demo data, the review file with times of day, the
800-patient review file and small synthetic files.

- Review file with times of day: cohort export writes `time_of_day`
  (`06:00:00`, `20:00:00`, empty without a time) in both measurement sheets;
  loaded again, the same 4 AKI episodes and the same `input_data_id`. The
  measurement table of ANSTIEG-ZEIT shows "01/09/2026 06:00" 1.0 before
  "01/09/2026 20:00" 1.6, with "Fit disabled" on each row.
- Demo: the measurement table of patient 6 shows dates without a time
  ("10/01/2022"); the cohort export has an empty `time_of_day` in all 467
  rows of both measurement sheets and `input_data_id` `b59dd57d`, as on main,
  without a fit, with OLS, with CKD progression / Theil-Sen / segmented and
  with acute review.
- Events file with 3024-05-08 and an end date 2099-12-31, lab birth date
  2030-02-01: "Implausible event date 3024-05-08 (after the import day
  2026-11-22); the event is used unchanged.", the same for the end date, and
  "Birth date 2030-02-01 is after the import day 2026-11-22; it is used
  unchanged."
- Then an events file with two invalid rows: the alert "No usable events …";
  the events stay, and the diagnostics list "Events (events.csv,
  bad-events.csv (rejected upload), 2 rows rejected)" with both rejected
  rows. The same invalid file uploaded as `events.csv`: the warning of the
  loaded `events.csv` stays, the rows are listed under "events.csv (rejected
  upload)".
- eGFR series ending with `<15`: the table cell reads "<15", with a trend
  "latest <15"; another patient "latest 35".
- Demo, grouped by `cohort`: `settings` ends with `group_by` = `cohort` on
  every row; ungrouped it is empty.
- Demo, patient 6, Display → AKI windows and episodes, Trend not ticked:
  under the Kreatinin and eGFR charts "In this column nothing is excluded for
  AKI (it has no fit): the shaded band only shows the configured 30 days
  after each onset."
- Demo, Cohort models, whole cohort: "73.15 ml/min/1,73m² 95% interval
  [67.41, 78.88]". A synthetic file with 7 single-measurement patients:
  "7 patients have a single measurement in this model. … Patients: S13, S14,
  S15, S16, S17 and 2 more."; the R warning on the singular fit is shown as
  recorded.
- 800 patients, 1440 px and 390 px: the rows scroll with the page (no
  sticky header row: tried and left out, see the decisions of 2026-11-22,
  because the rows then scrolled inside a box of their own whose lower part
  stayed below the window and whose last rows were read without the header
  row). At 390 px the top bar reads "1–50 of 800" between Previous and Next,
  with no horizontal page scroll.
- Methods → AKI detection → AKI Timing: the two paragraphs of draft G1.

## AKI episodes separated by recovery and dialysis start (2026-11-22)

Branch `feat/aki-recovery-episodes` (issue #67, review item K29). Checked
with ad-hoc Playwright scripts against the production build in Chromium.

1. Import the synthetic intensive-care file (`icu_dense_labs.csv`) and its
   events (`icu_events.csv`, CVVHDF acute 6 to 10 March with end date, CVVHD
   acute from 6 June without one). Data → "Detected AKI episodes (6)"
   (16 on `main` with the same events, 21 on `main` without events and 6 on
   this branch without them). The table ends with "End" and "Dialysis
   start": ICU01 stage III, onset 02/03/2026, end 14/03/2026, dialysis start
   "06/03/2026 (acute)"; ICU03 "open at the last value"; ICU04 stage III,
   end 09/06/2026, "06/06/2026 (acute)"; the others "none". The ICU01 chip
   reads `AKI III` (`AKI I, 3×III` on `main`).
2. Trajectories → open ICU01: "AKI episodes for this patient" ends "; end
   14/03/2026; dialysis start 06/03/2026 (acute)".
3. "Export cohort (XLSX)": `aki_episodes` has `end_date` and
   `dialysis_start` after `criterion` (`2026-03-14`, `2026-03-06 (acute)`; empty cells for an
   open episode or without dialysis); its `about` line explains both.
4. Demo data: still 8 episodes with the same onsets and stages, all ended by
   a gap: End "not observed: no values for more than 7 days after" the onset
   date (end dates 16/09/2022 and so on until the second review), and "none"
   as dialysis start. At 390 px the table scrolls inside its
   frame; the page does not scroll sideways.
5. Methods → AKI, "AKI Timing, Episodes and the Fit-Exclusion Window": the
   rule is stated and the sustained daily rise gives "one episode of stage
   III"; Sources: the AKI episodes entry names the 48 hours of ADQI 16.
6. Review follow-up (2026-11-22): import labs with ICU 1.0, 3.2, 4.0, 4.2,
   6.5 mg/dl on 1, 2, 14, 15 and 16 January 2024 and CVVHDF acute from 3 to
   13 January, CHR 1.0, 1.6, 1.2 on 1 to 3 January with chronic HD from
   4 January, and GAP with a crossing on 2 January 2024 and chronic HD from
   31 December 2025. Data → episode list: ICU one stage-III episode, "open at
   the last value", "03/01/2024 (acute)", chip `AKI III` (two episodes and
   `AKI 2×III` before); CHR "open at the last value", "04/01/2024 (chronic)"
   (end 03/01/2024 and "none" before); GAP "none" (31/12/2025 (chronic)
   before). The `about` line of `aki_episodes` names the end after a gap.
7. Second review (2026-11-22): import the review files `r2-rv67/labs.csv`
   and `events.csv`. Data → "Detected AKI episodes (4)": POSTDX one stage-III
   episode, onset 02/01/2024, End "not observed: no values for more than
   7 days after 17/01/2024", "03/01/2024 (acute)" (two episodes, end
   14/01/2024, before); PLAT ends 10/01/2024 (plateau) and its second
   episode "not observed: … after 15/01/2024", dialysis "none" (the HD of
   20/01/2024 lies after the last value). *Recovery between episodes
   (hours)* shows 48; 24 gives 5 episodes (POSTDX split at 15/01/2024), 48
   gives 4 again. The cohort export has `ended_by_gap` and
   `last_value_date` after `dialysis_start` and `"recoveryHours":48` in
   `analysis_settings`. At 390 px the page does not scroll sideways.

Verified 2026-11-22 in Chromium against the production build: steps 1 to 7
by scripted walkthroughs with screenshots (steps 1, 4 and 7 again after the
second review); a reduced version of steps 1 to 3
and the ICU and CHR cases of step 6 are automated in
`tests/e2e/aki-recovery.e2e.ts`. The k26 review file with
times of day keeps its 4 episodes. Not verified: other browsers than
Chromium and real research data.

## Before/after comparison at an anchor event and "Years since event" (2026-11-22)

Issue #64 and K16 (issue #70). Automated in `tests/e2e/anchor-comparison.e2e.ts`;
checked again by hand with an ad-hoc Playwright script against the production
build.

1. Demo → Trajectories → Trend on for eGFR [ml/min/1,73m²] → its analysis
   settings → Calculation settings → "Before/after comparison": tick it, anchor
   "Type: kidney_transplant" (menu lists "First event of the patient", the
   five titles as "Title: …" and the three types of the demo as "Type: …"). The preset stays "General
   exploration".
2. Export cohort (XLSX): last sheet `anchor_comparison` with 28 rows; patient
   13: anchor 2022-07-01, before n 6 over 882 days, after n 3 over 365 days,
   difference 4.823 [4.320, 5.326]; `settings` ends with `anchor_comparison`
   (JSON for eGFR, empty for the other columns); the last `about` note
   describes the sheet.
3. Patient 13: under the eGFR slope "Before/after first event of type
   kidney_transplant (01/07/2022): before -12.83 … after -8.01 … difference
   after − before +4.82 … (95% CI [4.32, 5.33])". With a window of 60 days the
   value of 10/08/2022 is a grey open circle and the difference is +4.76; the
   legend reads "Grey open circles: 1 measurement in the exclusion window
   after the anchor event: left out of the after-anchor slope only; it still
   enters the slope of the whole series." and does not say "excluded from the
   fit".
4. Display → Time axis → "Years since event": the overlay draws patients 13
   and 14 with both jumps at 0 (ticks -2 … 1), says "2 of 28 trajectories; 3
   without numeric measurements; 23 additional trajectories without a matching
   anchor event", labels the axis "Years since anchor event (first event of
   type kidney_transplant)"; the Kreatinin chart (no comparison) draws nothing
   and says where to switch the comparison on.

Verified 2026-11-22 in Chromium against the production build: steps 1 to 4;
after the review fixes again step 1 (menu prefixes, also at 390 px) and the
legend, tooltip and export context of step 3 with creatinine, first event, a
30-day window, patient 14.
Not checked: Firefox and WebKit, a narrow screen beyond the anchor menu and
the patient 14 chart, the mixed-model line on the
event axis in the browser (unit test only).

## Combined branch of the persona review: fixes after its review (2026-11-21)

Branch `integration/persona-review-2026-11-21` (all six branches of the
review merged). Checked with ad-hoc Playwright scripts against the production
build in Chromium, with the demo data and the synthetic review files. The
sections below were written on the single branches; where the combined
branch differs, they say so.

- Demo, *Export cohort (XLSX)*: 247 kB without and 252 kB with a trend
  (main: 661 and 665 kB). The sheets end `about`, `columns`,
  `rolling_windows`, `import_diagnostics`; `rolling_windows` has its header
  row `PatientID` … `slope` without a Rolling OLS column, and
  `import_diagnostics` has `source` … `message` also when nothing was
  reported.
- Demo, Kreatinin with Rolling OLS, patient 2: "2 windows, local slopes 0.249
  to 0.251 mg/dl/year"; the window list shows 0.251 and 0.249, and the two
  window lines say "slope 0.251 mg/dl/year" and "slope 0.249 mg/dl/year".
- Review file with times of day (rise from 1.0 at 06:00 to 1.6 at 20:00, in
  both row orders): the AKI marker sits on 1.6, not on the first value of the
  day. Its cohort export lists 4 episodes, writes `time_of_day` in both
  measurement sheets and carries the `about` note "Date holds the calendar
  day and time_of_day …". That export loaded again: the same 4 episodes and
  the same `input_data_id` (checked 2026-11-22: 4 and 4 episodes,
  `a9259237` twice). The measurement table of ANSTIEG-ZEIT (1.6 first in the
  file) shows "01/09/2026 06:00" 1.0 before "01/09/2026 20:00" 1.6.
- A copy saved with "Remember on this device" by the build of `main` (review
  file with urine creatinine marked only by LOINC 2161-8 and with times of
  day), opened with this build: the notice ends "This copy was saved by an
  earlier version: it has no import findings, no source rows and no times of
  day … 6 creatinine values with a urine LOINC code (2161-8, 14683-7) were
  moved to a parameter of their own …"; `Kreatinin` has LOINC 2160-0 only and
  40 eGFR values are computed, as after a fresh import.
- Register file with deliberate errors, Data page: "Show the creatinine
  values above 25 mg/dl" stands directly below its notice, the same-day note
  after it.
- 390 px (automated in `tests/e2e/plot-axes-events.e2e.ts`): dates and counts
  of the window list and dates and the "AKI detection" cell of the
  measurement table stay whole; the tables scroll inside their frame.
- A CSV with `patientId,labDate,testName,unit,value` only (two patients, no
  sex column, no attributes): "Export cohort (XLSX)" writes
  `patient_attributes` with the `PatientID` column only, and importing that
  workbook loads the same patients and values without an error. (Found
  during these checks as "Patient attributes file has no attribute columns.";
  fixed and checked again on 2026-11-21.)
- Not checked in a browser: Firefox and WebKit.

## Import diagnostics, LOINC material rule and Data page notes (2026-11-21)

Branch `feat/import-diagnostics` (issues #74, #2, #34; persona review of
2026-11-21). Checked with ad-hoc Playwright scripts against the production
build in Chromium, with the synthetic review files.

- A semicolon CSV with more commas than semicolons in its rows loads (36 and
  12 lab values, 0 warnings); a `sep=` file and a three-comma file load as
  before. A wide table (one column per test) is rejected with the sentence
  "This file seems to have one column per lab test …".
- Register file with deliberate errors: 41 lab values, 4 rows rejected, 9
  warnings. Each rejected row names its file row (12, 27, 28, 39); the
  implausible date 3024-05-08, the same-day values 1.1 and 1.9, the sex code
  "x" and the IDs "0012" and "12" are each reported and open their rows.
- "Replace attributes" afterwards: the notice reads "9 attribute rows
  imported; 1 row rejected", and the panel shows "Lab values (…, 4 rows
  rejected): 13 import diagnostics" beside "Attributes (…): 3 import
  diagnostics". After "Remember on this device" and a reload both lists are
  still there.
- "Download import diagnostics (XLSX)" gives 28 lines (18 lab findings, 3
  attribute findings, 7 data-check rows); the cohort workbook ends with the
  sheet `import_diagnostics` holding the same lines.
- Review file with urine creatinine marked only by LOINC 2161-8: parameters
  `Kreatinin` (15 values), `Creatinin (Jaffe)` (3) and `Kreatinin (urine,
  LOINC 2161-8)` (6); 0 AKI episodes (5 before on `main`; on the combined
  branch the same-day rule alone already gives 0 for this file, whose serum
  and urine values share a day without a time); the urine parameter is not
  offered as eGFR source; 15 computed values (21 before). Demo data: numbers
  unchanged, the LOINC column shows 62238-1 and 98979-8 for `eGFR`.
- Demo, CKD-EPI 2021 selected without applying: "Preview not applied" at the
  selection and "eGFR preview not applied [Apply]" beside "Open trajectories";
  both disappear after Apply. At 390 px the note wraps above the button
  without horizontal scrolling.
- Age-conflict file: "… on 2 of 7 lab dates: 2023-07-11 (stated 54, derived
  55), 2024-07-09 (stated 56, derived 55)."; no "days apart".
- Patient table with "Dated numeric values", "First date", "Last date";
  event tables with "Description"; the event-template sentence under
  "Templates and example files".
- Not checked in a browser: Firefox and WebKit; a workbook with more than
  1000 affected rows per warning (unit test only).

## Trajectories table: order, decimals, filters, paging (2026-11-21)

Branch `feat/trajectories-screening`, after the persona review of 2026-11-21.

1. Load the demo, open Trajectories, tick Trend for Kreatinin [mg/dl] and
   eGFR. Creatinine slopes have three decimals with a labelled interval
   (patient 8: "+0.010 mg/dl/yr 95% CI [0.007, 0.014]"), eGFR two (patient 8:
   "-1.23 … 95% CI [-1.50, -0.97]"). The patient view writes the same digits
   ("OLS: +0.010 mg/dl/year").
2. Sort eGFR by *Slope: ascending*. Patient 12 (follow-up under a year) stands
   at rank 25, after patient 14 and before 3, 5 and 10; the status line reads
   "1 uncertain slope placed after the reliable ones". Unticking *Uncertain
   slopes last* puts it at rank 9, between 9 and 6. *Export cohort (XLSX)*
   lists the eGFR rows of `cohort` in the order of the table.
3. "Show only": the buttons carry counts (demo, eGFR trend: Rapid decline 13,
   Uncertain slope 1, Endpoint reached 4, AKI 4, Kidney transplant 3,
   Dialysis 3, Other event 1). *Rapid decline* leaves 13 rows, the export
   button reads "Export 13 of 28 patients (XLSX)" and "Select all 13
   matching" is offered without a selection. *Show all* ends it. With Trend
   on for all four columns and *Uncertain slope* chosen (patients 3, 5, 12),
   open patient 5 and set the creatinine trend method to *No fit*: patient 5
   stays open with the note "Patient 5 does not match “Show only: Uncertain
   slope” and stays open", and *Export patient (XLSX)* downloads
   a workbook named for patient 5. At 390 px
   the buttons are in the toolbar menu "Show only" and the first chart is
   still on the first screen.
4. Apply CKD-EPI 2021 on the Data page. Under Trajectories the computed eGFR
   cell of patient 5 reads "No eGFR: sex and age missing" (hint: sex missing
   and age missing with four creatinine values each, "Enter the sex and the
   age under Data → “Review and edit patients”"), that of patient 10 "No
   eGFR: no creatinine in the source".
5. A dataset of several hundred patients with a grouping attribute: the page
   controls stand above and below the table; *Next* below the table shows the
   top of the next page with the focus on the table region; "Per page" offers
   25, 50 and 100, "Page" jumps. Collapse the largest group: the next rows
   follow on the same page, the group is one header row with its total on
   every page, and the status reads "Showing 1–50 of 527 patients (273 more in
   collapsed groups)".
6. Export a cohort of several hundred patients: "Exporting …" appears beside
   the button until the download starts.

Verified 2026-11-21 against the production build in Chromium
(`tests/e2e/table-screening.e2e.ts`, seven checks, and scripted walkthroughs
with the demo and an 800-patient review dataset): steps 1 to 6. With 800
patients and one parameter a page of 100 rows rendered in about 0.3 s. The
Cohort models decimals were checked with a fixed worker result, not with a
real R fit. Not built: a table header that stays in view while scrolling
(the table region scrolls sideways, so a fixed header needs either a region
that also scrolls vertically or a scripted header).

## Cohort model presets with the demo, plain punctuation (2026-10-13)

Branch `fix/cohort-demo-subgroups`. Subgroup comparison could not fit any
group with the demo data and Group interaction had seven complete cases; the
interface also strung items together with middle dots.

- Demo extended by `scripts/add_demo_cohort_patients.mjs` (patients 15-28,
  attributes for 1, 2, 4, 6): 28 patients, 506 lab rows, eGFR for 25.
- Real WebR fits against the development server in Chromium, eGFR, default
  settings: Standard −4.71 ml/min/1,73m²/yr; Subgroup by cohort A −4.32 (12
  patients), B −8.18 (10), C skipped (3); by sex m −4.91 (13), w −4.51 (12);
  Demographic adjustment −4.77; Group interaction −3.81 (25 complete cases).
  None singular. Grouping by genotype lists "UMOD: 12" and skips the others with
  their messages.
- No middle dot remains in the rendered Data or Trajectories pages.
- `pnpm test`: 911/911 in 96 files. `pnpm build`: passed. `pnpm test:e2e`:
  46/46 (development server).
- Independent review: one important finding (group sizes counted patients the
  validation does not, and the size message hid other reasons) and minor ones;
  all fixed before this entry.

## Workspace UX review and cohort model demo path (2026-10-12)

Branch `fix/workspace-ux-review`. An impeccable critique of the workspace
(24/40, snapshot in `.impeccable/critique/`) and a report that the demo could
not fit a cohort model with default settings: the page preselected the
imported eGFR with 5 of 14 patients, below the ten-patient minimum.

- Cohort models now preselects the first parameter (eGFR first) that passes the
  real preparation and validation; the demo workbook carries imported eGFR for
  11 patients. Verified in Chromium against the dev server: demo → Cohort models
  shows "eGFR [ml/min/1,73m²]", "Complete cases: 11 patients / 14 (116
  measurements)", Fit model enabled; a real WebR fit returned −2.79
  ml/min/1,73m²/yr, identical in legend and table, and the action then read
  "Refit model".
- Single Fit model action ("Refit model" after a current fit), Cohort models
  restyled with workspace tokens, "Show trends and slopes" switch, contrast
  ≥ 4.5:1, singular counts, no "G5 n < 3" in empty cells; checked by screenshot
  at 1440 and 390 px.
- `pnpm test`: 908/908 in 96 files. `pnpm build`: passed. `pnpm test:e2e`:
  46/46 in Chromium (development server).
- Independent branch review: two Important findings (bounded values counted by
  the preselection pre-check; outdated method reference) and four minor ones,
  all fixed before this entry; the full suite above was rerun afterwards.

Not verified: real screen reader, 200 % zoom, the production build in the
browser, opened export files. No merge, release or publication is recorded.

## Priority UX technical verification (2026-10-09)

Implementation checkpoints: `095f29e` explains and consistently gates cohort
model fitting; `76ba5e5` enlarges trajectory patient navigation targets. Each
task received an independent review with no major findings.

- `pnpm test` at `76ba5e5`: 888/888 tests in 93 files passed, exit 0
  (39.32 seconds).
- `pnpm build` at `76ba5e5`: passed, exit 0 (Vite 10.97 seconds).
- Initial final production Chromium run with `CI=true pnpm test:e2e --workers=2`:
  33 passed, one failed. The model-factor fixture had nine total patients and
  eight complete cases, so the newly guarded Fit model action correctly stayed
  disabled. The browser-only fixture correction in `361a002` supplies eleven
  total/ten complete-case patients and the worker result's missing singular
  field; it received an independent scoped review with no major findings.
- Final rerun at `361a002`, `CI=true pnpm test:e2e --workers=2`: 34/34 production
  Chromium checks passed, exit 0 (31.8 seconds). Source and unit tests were
  unchanged after `76ba5e5`, so its unit/build results remain applicable.
- Final whole-branch review on 2026-10-09: APPROVE for `e622f1b..1a0783e`, with
  no Critical or Important findings. Retained nonblocking Minor: a focused direct
  invocation-time rejection regression would protect the secondary fit guard;
  the handler revalidates, and normal UI/configuration transitions are covered.
- The technical documentation package received independent review: PASS /
  APPROVE, no material findings. Issue #2's two UX items and dated technical
  verification/review record were updated; research acceptance remains unchecked.
  No merge, release or publication is recorded for this package.

Focused task checks passed before these final checks: fitting availability,
44px target dimensions at 1440px and 390px, touch-enabled `tap()` navigation,
selection/pagination, existing back navigation and 2000-patient navigation.
Desktop/mobile synthetic captures were inspected by the implementers. These
are synthetic automated technical checks, with model-worker interception for
model UI paths; the manual single-interface steps below were not rerun
for this package. No real-WebR smoke was rerun for the CSS/button availability
changes. No formula, eligibility floor, preparation rule, endpoint policy or
golden output change is included.

Representative research workbooks, research questions and a human tester were
not supplied. The owner confirmed on 2026-10-09 that these are not yet available
and acceptance must remain open. Research/user acceptance, real touch-device evaluation and cohort
dimensions/latency measurements remain open in
[research-data acceptance](../../docs/research-acceptance.md).

> **2026-10-06: the former interface was removed.** The workspace is the only
> interface and is served at `/` (`index.html`); `/workspace.html` redirects
> there. Phases 2 to 8 below exercised the former interface (sidebar, series
> strip, cohort view, S/M/L thumbnails, model dialog). They are kept unchanged
> as the historical record of what was verified on the stated dates and can no
> longer be run. The current checklist is
> [Single interface](#single-interface-2026-10-06) at the end; its stable parts
> are automated in `tests/e2e/*.e2e.ts`.

## Phase 2 E2E smoke (historical, former interface)

1. `pnpm build && pnpm preview -- --port 4188` (this repo is the web app root now —
   there is no `web/` subdirectory to `cd` into; it was split out of a monorepo).
2. Navigate to http://localhost:4188/
3. Click "Load demo data".
4. Assert: a Patient picker appears; the series strip is visible.
5. Pick a parameter in Series 1 (e.g. a Kreatinin option).
6. Assert: at least one `[data-testid="series-plot"]` renders an `<svg>`.
7. Switch the Series 1 mode to gap-split and rolling; assert the plot re-renders without console errors (favicon 404 is allowed).

## Phase 3 E2E smoke (eGFR + events; historical, former interface)

1. Load demo data; set the sidebar "Compute eGFR" select to "CKD-EPI 2021".
2. Pick patient 4 (the fixture patient with demographics).
3. Assert the Series 1 parameter dropdown lists an "ƒ eGFR (CKD-EPI 2021, computed) …" option.
4. Select it; assert `[data-testid="series-plot"]` renders an `<svg>` with data points and a caption "Computed from creatinine × demographics — not for clinical decision-making."
5. (Events) Upload an events file in the sidebar; assert the loaded/rejected count note appears and dashed event rules render on the plot. No console errors beyond favicon.

Verified 2026-06-11: eGFR path renders 8 computed points + disclaimer for patient 4; only the favicon 404 in console.

## Phase 4 E2E smoke (cohort view; historical, former interface)

1. Load demo data; pick a Kreatinin (mg/dl) series in Series 1.
2. Click "Cohort". Assert a table with one row per patient, each with a sparkline.
3. Assert creatinine columns with an AKI episode show an "AKI …" badge.
4. Change the sort key/direction; assert rows reorder.
5. Click a patient id; assert it returns to the one-patient view for that patient.

Verified 2026-06-11: patient rows + sparklines render, an "AKI II" badge appears on a creatinine column, |slope|-desc sort works; clicking patient 4 returned to the One view with patient 4 selected. Only the favicon 404 in console.

## Phase 5 E2E smoke (AKI overlay + exports + methodology; historical, former interface)

1. Load demo data; find an AKI patient via the cohort badge (patients 6, 7, 11, and 12 in the fixture; patient 12 demonstrates repeated-stage counting like "AKI 2×I, II").
2. Open that patient's Kreatinin (mg/dl) plot; tick "Show AKI episodes" in the sidebar; assert red episode marks + an "AKI …" stage label render.
3. Each plot card shows SVG / PNG export buttons.
4. In cohort view, "Export xlsx" downloads cohort-summary.xlsx; "Export zip" downloads cohort-bundle.zip.
5. The toolbar "Methodology" button shows the reference panel (global / gap-split / rolling, eGFR, KDIGO) with a "Back to data" button.

Verified 2026-06-11: AKI overlay renders red marks + a stage label for an AKI patient; Methodology shows all sections; "Export xlsx" triggered a real cohort-summary.xlsx download. Only the favicon 404 in console.

## Phase 6 E2E smoke (opt-in persistence; historical, former interface)

1. Load demo data; tick "Remember on this device" in the toolbar.
2. Reload the page; assert the dataset is restored (patient picker populated) and the toggle is on.
3. Click "Clear saved data"; reload; assert the app starts empty (upload prompt shown, toggle off).

Verified 2026-06-11: after enabling + reload, patients restored and toggle checked; after Clear saved data + reload, empty state shown and toggle off.

## Phase 7: zoomable mini-graphs, AKI bands, aki-aware mode (2026-06-11; historical, former interface)

1. Load demo data → Cohort view: every sparkline line is blue (#2563eb); rows
   with an AKI chip show a translucent red band only over the episode window,
   never a fully red line.
2. Toolbar shows S · M · L (only in Cohort view). Default M: point markers,
   dashed red fit, date/value labels. L adds axes; S is the compact line.
   Switching zoom resizes all cells (assert `data-zoom` on `mini-sparkline`).
3. Series mode `aki-aware`: an "excl. days" input appears (default 30). For an
   AKI patient the cohort slope changes vs `global`, excluded points render as
   open red circles in M/L.
4. One-patient view with mode `aki-aware`: red exclusion band + open-circle
   excluded points + dashed fit over kept points, even with "Show AKI episodes"
   unchecked.
5. "Remember on this device" + reload restores the chosen zoom level; "Clear
   saved data" clears it.

## Corrections to the phases above (2026-08-22)

Two steps describe UI that no longer exists. Left in place rather than rewritten,
so the record of what was verified on 2026-06-11 stays intact:

- **Phase 5, step 4** — the cohort view has only `Export cohort (xlsx)`. The ZIP
  bundle export lives in the one-patient view (`Export bundle (zip + charts)`),
  not the cohort view.
- **Phase 5, step 5** — the toolbar button is labelled *Theory & Methods*, not
  *Methodology*.

No phase covers the features added since June: patient attributes, attribute
grouping, the cohort overlay, or the WebR cohort mixed model.

## Phase 8 (2026-08-22): import tolerance, quality flags, templates (historical, former interface)

1. Upload a CSV with canonical camelCase headers
   (`patientId,labDate,testName,unit,value,sex,ageAtLab`); assert it loads.
2. Include sex values `female`, `M`, `1` and `unknown`. Set *Compute eGFR* to
   CKD-EPI 2021. Assert the sidebar names exactly `"1"` and `"unknown"` as
   unreadable, and does not flag `female`/`M`.
3. Demo data, cohort view, Kreatinin (mg/dl): assert patient 3 carries an
   `n < 3` badge and patients 5 and 12 carry `< 1 yr`.
4. Export the cohort xlsx; assert the sheet has `fit_model` and `unstable_slope`
   columns, and that `unstable_slope` is `yes` for exactly patients 3, 5 and 12.
5. Assert patient 3's row exports `r2 = 1` with an empty `reason` — the
   two-point case the reason field cannot express.
6. Upload a patient with ages that fit no single birth date (e.g. `46`, `46`,
   then `64` years old across three lab dates spanning about a year). Assert a
   sidebar warning naming the patient and stating the ages fit no single birth
   date, without setting *Compute eGFR* — the conflict note does not depend on
   eGFR being on.

Verified 2026-08-24: all six hold; console clean (0 errors, 0 warnings). Step 6
covered by the Chromium regression test in `tests/e2e/pr5-quality.e2e.ts`
("reports a patient whose ages fit no single birth date"); steps 1-5 verified
2026-08-22 via the Playwright MCP and re-confirmed unchanged.


## Configurable trend projections

Verified 2026-09-13: desktop and 390px-wide Chromium with real workbook uploads.
`model-projections.e2e.ts` verifies a rising nonrenal custom target, G4/G5 presets,
changed genotype profile, horizon/disabled states, draft cancellation and actual
XLSX downloads. The browser tests intercept the worker to isolate UI behavior;
`scripts/verify_mixed_model_projections.mjs` independently runs the actual webR
worker with lme4 and nlme and checks known profile coefficients/crossing times.
The projection form stays within the mobile dialog; result columns can scroll.


## Real-data workspace

Approved method update, verified 2026-09-23:

- Unit/component suite: 873 tests in 101 files passed; production build passed.
- Complete production-browser suite: 78 checks passed in Chromium, Firefox and
  WebKit, with `CI=1 CROSS_BROWSER=1`, two workers, 60-second timeout and no retries.
- After bounding long endpoint detail text, the final build and all three
  endpoint browser workflows passed again, including the 390px layout check.
- The added workflow imports raw eGFR, changes the confirmation interval from
  90 to 30 days, checks event/confirmation/recovery details without enabling a
  display trend, downloads and inspects workbook provenance, then restores 90
  days and verifies the G5 result disappears for this unconfirmed history.
- Independent review found three issues: legacy patient-export omissions,
  hidden raw percent change when no display fit exists, and nonfinite input
  reaching the prediction fit. Each was reproduced by a failing test and fixed;
  the final unit suite includes all three regressions.

Algorithm definitions and intentionally changed numerical output are recorded
in `docs/method-algorithms.md`; research-data acceptance remains pending.

Current completion checks, verified 2026-09-23:

- Opt into local saving after import, demographics and derivation; reload,
  verify preparation, delete and reload again. A stale second tab must not
  recreate the deleted snapshot. A failed replacement retains saved data.
- Download the model preview as SVG/PNG and inspect the exported context.
  Export a patient ZIP; verify distinct chart names and patient-scoped workbook.
- Import an exclusion event and inspect the affected patient measurement row.
- Exercise 200 synthetic patients, 12 parameters and 19,200 measurements;
  search and export the selected patient. Check the model preview at 390px.

The complete production-browser suite passed 72 checks across Chromium, Firefox
and WebKit. After the final measurement-exclusion addition, all 36 workspace
checks passed again on those engines with no retries. Unit/component suite:
857 tests in 100 files passed; production build passed. A real WebR demo fit
was exercised separately. Representative research-data and first-user acceptance
remain pending. Earlier dated checkpoints follow.

1. Open `/workspace.html` (since 2026-10-06: `/`); confirm English navigation and session-only status.
2. Load demo data or a workbook with labs, attributes and events. Review import
   diagnostics and edit demographics using the displayed age reference date.
3. Select an eGFR formula and source, inspect the preview and apply. Confirm the
   derived parameter appears without changing the original measurements.
4. Open Trajectories, select many parameters, and browse the graph table. Check
   horizontal navigation, sticky patient IDs and shared per-parameter scales.
5. Open a patient and return to the table; check focus and scroll restoration.
   Compare the same patient scope in Overlay, including grouping and time axes.
6. Download XLSX, SVG and PNG. Check selected scope, original/derived provenance,
   UTC dates, English chart context/legend and research-use footer.
7. Change the formula, then disable derivation; verify the selected computed
   parameter updates or is explicitly unavailable. Replace the dataset and check
   that browser selections reset. Repeat table/detail navigation at 390 px width.

Verified 2026-09-14: all three workspace Chromium tests pass against the production
build, including actual file downloads and narrow-screen navigation. Desktop graph
table and grouped overlay visually checked; downloaded English PNG includes readable
axes, unit, title, grouping/legend and research footer. Original 13 browser checks
also pass. Representative research-data acceptance remains pending.

## Workspace visual-review regressions

1. Load the demo, apply CKD-EPI 2021 and open Trajectories. The computed series
   should already be selected, alongside the imported parameters.
2. Switch Table / Overlay / Individual patient and check that the current view
   has a contrasting filled button. Open patient 1: creatinine should retain the
   shared 0–4.2 range rather than stretching its small variation across the chart.
3. Choose Zoom to visible values explicitly and check that the scale notice and
   exported chart context change. Restore Shared parameter scale.
4. Group the overlay by sex: readable Female/Male labels, original grouping codes
   retained. Enable Events and expand Inspect events to read patient/date/title.
5. Open Methods: only the available workspace workflow is initially described.
   Expand the full reference deliberately to see original-app features.
   (Since 2026-10-06 the reference is shown directly below the workspace guide.)
6. Expand the derived preview and confirm Apply is above it; scroll the preview
   independently. Repeat the trajectory workflow at 390 px width.

Verified 2026-09-14 against the local development server: all four workspace
browser tests pass; shared patient-1 plots and active view state visually checked.
Mobile overlay remains within the viewport; event inspector and sex labels checked.
Final production-build run: all 17 Chromium tests passed, including these four
workspace workflows. Unit/component suite: 821 passed; production build passed.

## Single interface (2026-10-06)

Run against `pnpm build && pnpm preview`.

1. Open `/workspace.html?x=1#y`; assert the browser lands on `/index.html?x=1#y`
   with the title "Lab Trajectory Explorer" and no "Preview" label.
2. Load demo data. Open "Templates and example files" and assert it links the
   demo workbook, events and attributes below the templates; the Data page
   lists the loaded events.
3. Apply CKD-EPI 2021. Under Trajectories, select Kreatinin (mg/dl) and the
   computed eGFR, choose the CKD progression preset and show the fits. Sort by a
   metric and reverse it; the direction note changes.
4. Open patient 12 and switch on *AKI windows and episodes*: shaded windows,
   labelled episode markers ("AKI I", "AKI II") and grey open circles for the
   AKI-excluded measurements, each with a key below the chart.
5. Overlay: episode markers for all trajectories, windows only after choosing
   patient 12 under *Highlight patient*.
6. Methods: guide and full reference on one page; the reference's section links
   scroll within Methods instead of returning to Data.
7. At 390 px width the Methods page does not scroll horizontally (the Data,
   Trajectories and Cohort models pages are checked at 390 px by the browser
   tests). No console errors or warnings throughout.
8. With data saved by the former interface in the browser, the first start shows
   a one-time notice that it was removed (automated in `workspace.e2e.ts`).

Verified 2026-10-06 against the production build in Chromium (ad-hoc Playwright
script): steps 1 to 7 hold, console clean. Step 8 and the remaining stable
paths are covered by `pnpm test:e2e`. Grouped mixed-model lines in the overlay
were checked by unit tests and the projection browser tests with an intercepted
worker, not with a real webR fit.

P3 modular-analysis close-out (2026-10-06): the user-facing paths in this
single-interface checklist are unchanged. The current branch passed all 29
automated Chromium browser tests (`pnpm test:e2e`), covering the automated
subset of current workspace paths. The manual steps above were not rerun for
P3; their dated verification remains the 2026-10-06 production-build check.
Independent whole-P3 review is complete: its one finding was an inaccurate
HbA1c 7 % projection example in `docs/architecture.md`, corrected in the
follow-up documentation commit.

P4 clinical/statistical close-out (2026-10-06): the final sequential automated
run passed 800/800 unit tests in 90 files, `pnpm build`, and 29/29 Chromium
checks with `pnpm test:e2e`. These checks cover the automated workspace paths
and focused endpoint, AKI, import and export regressions; they do not constitute
a manual run of steps 1–7 above. Those steps retain their dated verification,
and representative research-data acceptance remains pending. Whole-P4 review
found no major issue on the normal import path; its deferred Minor findings are
recorded in the [P4 progress plan](../../docs/superpowers/plans/2026-10-06-review-remediation.md#progress-2026-10-06).

P5–P7 final automated close-out (2026-10-06): 821/821 unit tests in 90 files,
`pnpm build`, and 30/30 Chromium checks passed on the integrated branch. The
browser checks include a 2000-patient table with a measured navigation
transition under two seconds, model projection workbook downloads, and 390 px
layout. Both real-webR verification scripts passed with lme4 and nlme; the
factor script includes healthy random-intercept fits as well as random slopes.
The manual single-interface steps 1–7 above were not rerun for this close-out.
Their dated observation remains above; representative research-data and
first-user acceptance remain pending.

Open-decision implementation close-out (2026-10-07, branch
`feat/resolve-open-decisions`): 874/874 unit tests in 93 files, `pnpm build`,
and 30/30 Chromium checks passed after the last change. Two independent
reviews of the branch found ten confirmed defects, among them a truncated
confirmation interval left applied after a rejected entry, cohort models
vanishing after an endpoint edit under CKD progression, and the new rolling
columns shifting four existing workbook columns; all are fixed with regression
tests. The manual steps 1–7 above were not rerun, and the new behaviour
(rolling window lines, cohort models following the Trajectories settings, the
approximate G5 age badge, AKI detection under dialysis) has been exercised by
unit and component tests only, not by hand in a browser. Research-data
acceptance remains pending; its checklist now includes these points.


## v0.3.7: accepted trajectory controls (2026-10-15)

Verified 2026-10-15 against the production build: all 51 automated Chromium
checks passed, including real workbook import, analysis/export provenance,
persistence, derivation changes, patient/table history, responsive controls and
mobile method navigation. The 929 unit/component tests also passed.

1. Load demo data, then open Trajectories. Minimal cells show measurements;
   slopes appear only after the parameter's Trend control is enabled. Hiding its
   fitted line retains the calculated slope and exported preparation settings.
2. Add sex/genotype with Attributes. The order remains unchanged, columns fit
   their content, and header/context-menu sorting works independently of grouping.
   "Group by" in the toolbar (desktop widths; table and overlay) or "Group by
   this column" in an attribute column's Sort menu creates sections; the
   select or the grouping chip removes them. In the overlay the trajectories
   take the group colours.
3. Choose a specialist profile in one parameter's settings or in Cohort models.
   It creates own settings without changing unrelated shared preparation.
4. Click selection names or row whitespace to toggle them. Parameters supports
   search, Apply/Cancel and Escape discards the pending selection. Mouse rows are
   compact; narrow/touch rows retain larger targets.
5. Open desktop settings, navigate to Data/Cohort models, then narrow the window.
   No hidden modal remains; destination controls accept pointer and keyboard.
   Mobile Fit methods closes the drawer and opens Methods inside the app.
6. Switch S/M/L, warning icons/text, cell details and value scale. Sort and
   modal/menu dismissal remain keyboard-accessible, with focus returned to the
   originating control. AKI remains a short pill with accessible explanation.

This records the reviewed technical workflows and owner publication acceptance;
it does not claim research, clinical or representative-user validation.

## Release review: paths added since v0.3.7 (2026-11-15)

1. Upload a CSV with serum creatinine 1.0 and 120 mg/dl for one patient and
   0.1 mg/dl for a 20-year-old male. The Data page shows "1 serum creatinine
   value above 25 mg/dl (µmol/l converted): not plausible, check the unit. The
   values are used unchanged."
2. Choose the eGFR formula "CKD-EPI 2009 (race-free)". The preview shows "1
   computed eGFR value above 200 mL/min/1.73 m²: not plausible, …". After
   *Apply calculation* the page reads "Active: CKD-EPI 2009 (race-free), 3
   computed values", and Trajectories offers the parameter
   `eGFR (CKD-EPI 2009 (race-free), computed)`.
3. Upload an imported eGFR of 40 and 38 with creatinine 4.5 and 4.85 mg/dl on
   two consecutive days every two weeks for two years (104 values each). Give
   the eGFR column the CKD progression preset and show badges as text. The
   endpoint badge ends in `G5 < 3 dates` (the label since 2026-11-05, formerly
   `G5 n < 3`), and its tooltip says "Measurements inside AKI exclusion
   windows are left out of the projection. The measurements used fall on fewer
   than three distinct dates, so no projection was made." It does not say the
   series has measurements on fewer than three dates.
4. *Export cohort (XLSX)* in that state: the last twelve columns of `cohort` are
   `index_date`, `last_fitted_date`, `first_eligible_date`,
   `last_eligible_date`, `intercept`, `slope_se`, `n_fitted_dates`,
   `first_eligible_value`, `last_eligible_value`, `sex`, `baseline_age`,
   `group` (empty without grouping), and the sheet `about` is followed by
   `columns`, `rolling_windows` and `import_diagnostics`; the row has
   `first_eligible_date` 2020-01-01, `last_eligible_date` 2021-12-16 and
   `last_fitted_date` 2020-01-01, and `endpoint_input_policy` ends in "AKI
   exclusion windows excluded from decline baseline and projection".
5. Cohort models: fit, apply a projection, *Export models (xlsx)*. The sheets
   are, in order, `models`, `coefficients`, `factors`, `centering`,
   `excluded_patients`, `projections`, `about`, `vcov`, `model_rows`,
   `model_input_flags`, `r_script`; every sheet that names a unit has a
   `unit_key` column (`cohort` or `group:<value>`).
   `models` ends with `unit_key`, `intercept_sd`, `slope_sd`,
   `intercept_slope_correlation`, `residual_sd`, and `about` ends with
   `app_version` and `exported_at`. With the demo data and the parameter
   Kreatinin the fit summary reads "Whole cohort, patients with enough
   measurement times: 26 of 27.", and the model's details and
   `models.warnings` carry "1 patient has fewer than 3 distinct
   time_since_baseline values …" (checked in Chromium with a real R fit on
   2026-11-21; not automated).
5a. Demo data, Trajectories, *Export cohort (XLSX)* with and without "Group
   by": both files have the same 80 columns in `cohort` with `group` last,
   `PatientID` in every sheet, a sheet `columns` after `about` (followed by
   `rolling_windows` and `import_diagnostics`), and `app_version`,
   `exported_at`, `export_id` and `input_data_id` in `about`. Import the
   exported file under Data: it loads without a column error (automated in
   `tests/e2e/cohort-export.e2e.ts`). With a file that has a `birthDate`
   column, `demographics` of the export of the re-imported file shows the
   same `birth_anchor` with `age_estimated` false.
6. Open a saved session whose creatinine source is no longer a serum name. The
   Data page shows the amber notice that no eGFR is computed from it.

Verified 2026-11-15 in Chromium: steps 1 to 4 by
`tests/e2e/release-review.e2e.ts`, step 5 by
`tests/e2e/model-projections.e2e.ts` (intercepted worker, real download). All
53 automated checks passed against the production build (`CI=1 pnpm
test:e2e`). The R reproduction export was also refitted with real webR by
`node scripts/verify_mixed_model_r_export.mjs`: the generated script rebuilt
two units, one of them a group named "Whole cohort", from the exported sheets
and matched the browser estimates.

Not verified: step 6 in a browser (a session of the same version cannot hold a
non-serum source; `tests/workspace/data-ui.test.tsx` covers the notice), a real
webR fit through the interface, PNG export, the exported workbooks opened in
Excel or desktop R, a screen reader.

## Saved analysis settings and leaving the page (2026-11-16)

1. Upload an eGFR series falling from 60 to 30 over four years. Under
   Trajectories give the eGFR column the CKD progression preset, tick
   *Analyse trend* and show badges as text (`-50%, G5 @ ~66y`).
2. Under Data tick "Remember on this device", wait for "Saved on this device"
   and reload. The notice reads "Dataset and analysis settings (presets, trend
   and display choices) restored from this device. Cohort model settings and
   results are not saved: fit the models again under Cohort models." Under
   Trajectories the same column is shown with Trend ticked, the same slope and
   badge, and the preset is still CKD progression.
3. A saved copy that holds settings of a parameter the dataset does not have,
   or an option this version does not know, restores everything else and adds
   "Not restored, the defaults are used instead: …" to the notice.
4. Without "Remember on this device", reloading a page with a loaded dataset
   brings up the browser's leave-page question. It does not appear when
   nothing is loaded, when the dataset is remembered, when moving between
   Data, Trajectories, Cohort models and Methods, or for the demo data as
   loaded; after deriving eGFR on the demo data, editing a patient or
   importing events or attributes on top of them it appears, and also for a
   demo copy restored from this device once "Clear saved data" was used.
5. *Export cohort (XLSX)*: the column is named `endpoint_percent_change` and
   is negative for a fall, as in the badge (`-50`).
6. With the dataset remembered, change a preset or a display option and
   reload: the save time of the dataset copy (IndexedDB database
   `lab-trajectory-explorer`, key `lab-explorer:workspace:v1`, field
   `savedAt`) is unchanged; the settings are in
   `lab-explorer:workspace-settings:v1`.

Verified 2026-11-16 in Chromium: steps 1 to 4 by
`tests/e2e/saved-settings.e2e.ts` against the development server (all 56
automated checks passed locally; CI runs them against the production build),
step 5 by `tests/core/cohort/exportRecords.test.ts` (not in a browser).

Not verified: the leave-page question when closing a tab or window by hand
(the automated check reloads), other browsers than Chromium, and a copy saved
by the released version 0.3.7 restored in this version in a real browser
(`tests/workspace/storage.test.tsx` covers a copy without settings).

## Plot axes, event drawing and the dense overlay (2026-11-21)

1. Import a file with a short series (a hospital stay of some days) and an
   events file with a dated acute dialysis. Open the patient: the axis reads
   "Years since first measurement of this parameter" as before. Display →
   "Time axis" → "Days since first measurement": whole days on the axis, in
   the patient charts and in the overlay, until the unit is changed back.
2. "Calendar date" on a series of one or two days: every label a different
   date. On a longer series: five dates, none cut off at the border.
3. Switch on "Events": the dialysis is a dashed line at its start and a
   shaded band to its end date; the legend names both. The points inside
   carry "not used for AKI detection (dialysis)" in their tooltip, with and
   without a trend, and "Show measurements" has the column "AKI detection"
   and the events as set-off rows at their dates. "Events for this patient"
   is in date order.
4. Switch on "AKI windows and episodes": no stage label is cut at the left or
   right border; equal neighbouring labels are merged ("AKI III ×2"). The
   legend and the tooltip of the shaded window say "this column has no fit",
   "not excluded from this fit" (Trend ticked, General exploration) or
   "excluded from this fit" (CKD progression).
5. Choose "Rolling OLS" and tick Trend: "Show windows (n)" lists the windows,
   each dashed line names its window on hover, and the patient workbook has
   the sheet `rolling_windows` after `about` and `columns`.
6. Load a cohort of more than 50 and of more than 200 patients and open
   Overlay: no measurement points, paler (and from 201 thinner) lines and a
   note above the chart; "Measurement points" under Display is unticked and
   brings the points back, also after a reload with "Remember on this
   device". Start again without that choice: unticking "Connecting lines"
   alone shows the points, and a chart of a parameter that fewer than 51 of
   the patients have keeps its points. Move the pointer across the lines: the chart stays
   responsive and the line under the pointer is drawn thick on top, with the
   patient named at the upper right.

Verified 2026-11-21 in Chromium against the production build: steps 1 to 6 by
`tests/e2e/plot-axes-events.e2e.ts` (all 64 automated checks passed) and by
scripted walkthroughs with screenshots on the synthetic review files (a
20-day intensive-care series with dialysis, a rolling-OLS series, an
800-patient cohort). In the 800-patient overlay, opening took under 0.2 s
with 3,231 SVG elements (before: 3.6 s, 72,212 elements with two charts) and
a pointer sweep caused no long task; with the points switched on by hand a
sweep still causes tasks of 0.1 to 0.2 s (before: 1.0 to 1.7 s).

Not verified: other browsers than Chromium, a phone-width layout of the new
table rows and the window list, and real research data.

## Start, lost connection, network and storage notices (2026-11-21)

1. Load the page, cut the network, import a CSV: header, navigation and all
   pages stay; Cohort models shows "Model results". "Load demo data" without a
   network says "Could not load the demo dataset: the demo file could not be
   fetched from this app's address. …".
2. Open `dist/index.html` from a folder in Chrome or Edge: after two seconds
   the notice "Lab Trajectory Explorer has not started" appears. Over http the
   notice never shows.
3. Cohort models, before the first fit: under the fit button "The first fit
   of a session downloads the R runtime from webr.r-wasm.org and R packages
   from repo.r-wasm.org (about 33 MB). …"; the link opens Methods, "Data &
   eGFR", "Network access and local storage". After a finished fit the
   sentence is gone.
4. Production build only: the page carries a Content-Security-Policy meta
   element. Fit a model on the demo data with a real network (first fit), fit
   again, then "Export models (xlsx)", "Download SVG", "Download PNG" and
   "Export cohort (XLSX)": all work and the console reports no blocked
   request. Repeat this after every change to the policy or an update of
   `webr`; the automated check does not fit a model.
5. Data: "Nothing is pseudonymised: …" stands above the file input; the lab
   template text names `patientId`.
6. Tick "Remember on this device": the status reads "Saved on <date time>;
   removed when the app is next opened after <date time>", seven days apart,
   and is the same after a reload. "What is saved" opens the list.
7. With the copy saved, open the app in a second tab, import another file
   there, and return to the first tab: its status changes to "The saved copy
   was changed or removed in another tab. …" and "Remember on this device" is
   unticked. A reload shows the second tab's dataset.

Verified 2026-11-21 against the production build: steps 1, 2, 5, 6 and 7 and the
exports of step 4 by `tests/e2e/start-and-offline.e2e.ts` in Chromium; step 3
and the real fit of step 4 by an ad-hoc Playwright script in Chromium, Firefox
and WebKit (fit, refit, model workbook, SVG, PNG and cohort workbook; no
policy violation). Step 2 in Firefox: the app starts from `file://`, so the
notice does not appear.

Not verified: Safari and Edge themselves, the patient bundle (ZIP) and the
patient chart exports under the policy (same export functions as the checked
ones), a deployment that removes files while a tab is open, and the notice
with JavaScript switched off.
