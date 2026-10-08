# Manual browser smoke checklist

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
