# Phase 2 E2E smoke (run via Playwright)

1. `cd web && pnpm build && pnpm preview -- --port 4188`
2. Navigate to http://localhost:4188/
3. Click "Load synthetic data".
4. Assert: a Patient picker appears; the series strip is visible.
5. Pick a parameter in Series 1 (e.g. a Kreatinin option).
6. Assert: at least one `[data-testid="series-plot"]` renders an `<svg>`.
7. Switch the Series 1 mode to gap-split and rolling; assert the plot re-renders without console errors (favicon 404 is allowed).

## Phase 3 E2E smoke (eGFR + annotations)

1. Load synthetic data; set the sidebar "Compute eGFR" select to "CKD-EPI 2021".
2. Pick patient 4 (the fixture patient with demographics).
3. Assert the Series 1 parameter dropdown lists an "ƒ eGFR (CKD-EPI 2021, computed) …" option.
4. Select it; assert `[data-testid="series-plot"]` renders an `<svg>` with data points and a caption "Computed from creatinine × demographics — not for clinical decision-making."
5. (Annotations) Upload an annotations file in the sidebar; assert the loaded/rejected count note appears and dashed event rules render on the plot. No console errors beyond favicon.

Verified 2026-06-11: eGFR path renders 8 computed points + disclaimer for patient 4; only the favicon 404 in console.

## Phase 4 E2E smoke (cohort view)

1. Load synthetic data; pick a Kreatinin (mg/dl) series in Series 1.
2. Click "Cohort". Assert a table with one row per patient, each with a sparkline.
3. Assert creatinine columns with an AKI episode show an "AKI …" badge.
4. Change the sort key/direction; assert rows reorder.
5. Click a patient id; assert it returns to the one-patient view for that patient.

Verified 2026-06-11: patient rows + sparklines render, an "AKI II" badge appears on a creatinine column, |slope|-desc sort works; clicking patient 4 returned to the One view with patient 4 selected. Only the favicon 404 in console.

## Phase 5 E2E smoke (AKI overlay + exports + methodology)

1. Load synthetic data; find an AKI patient via the cohort badge (patients 6, 7, 11, and 12 in the fixture; patient 12 demonstrates repeated-stage counting like "AKI 2×I, II").
2. Open that patient's Kreatinin (mg/dl) plot; tick "Show AKI episodes" in the sidebar; assert red episode marks + an "AKI …" stage label render.
3. Each plot card shows SVG / PNG export buttons.
4. In cohort view, "Export xlsx" downloads cohort-summary.xlsx; "Export zip" downloads cohort-bundle.zip.
5. The toolbar "Methodology" button shows the reference panel (global / gap-split / rolling, eGFR, KDIGO) with a "Back to data" button.

Verified 2026-06-11: AKI overlay renders red marks + a stage label for an AKI patient; Methodology shows all sections; "Export xlsx" triggered a real cohort-summary.xlsx download. Only the favicon 404 in console.

## Phase 6 E2E smoke (opt-in persistence)

1. Load synthetic data; tick "Remember on this device" in the toolbar.
2. Reload the page; assert the dataset is restored (patient picker populated) and the toggle is on.
3. Click "Clear saved data"; reload; assert the app starts empty (upload prompt shown, toggle off).

Verified 2026-06-11: after enabling + reload, patients restored and toggle checked; after Clear saved data + reload, empty state shown and toggle off.

## Phase 7: zoomable mini-graphs, AKI bands, aki-aware mode (2026-06-11)

1. Load synthetic data → Cohort view: every sparkline line is blue (#2563eb); rows
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
