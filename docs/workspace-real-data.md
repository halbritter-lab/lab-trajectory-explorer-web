# Real-data workspace

Development branch: `feat/workspace-real-data`, based on the design in PR #15.
Run `pnpm dev --host 127.0.0.1`, then open
`http://127.0.0.1:5173/workspace.html`.
For production-build checks, run `pnpm build` and `pnpm preview`.

The workspace reuses the existing import, demographics, eGFR and OLS functions.
It has its own entry point; the original application at `index.html` and the
synthetic design prototype remain available for comparison.
Data stays in the current browser session. Reloading or switching to the original
application requires another import. The application language is English;
imported parameter names and patient attributes retain their original values.

## First complete workflow

1. Under **Data**, import an XLSX/CSV file or load the supplied demo data.
   A workbook can contain `labs`, `attributes` and `events`. Downloadable templates
   show the accepted input schema; arbitrary column mapping is a later extension.
2. Review import diagnostics and missing or conflicting demographics. Manual age
   entries use the displayed reference date. Open a patient from the quality table.
3. Choose an eGFR formula and creatinine source, inspect the preview, then apply.
   Source measurements remain intact. Output-name collisions with imported series
   block the derivation instead of silently combining measurements.
4. Under **Trajectories**, select parameters by name and unit. Search or select
   patients and compare the graph table, individual view and spaghetti overlay.
   Different units remain separate. Horizontal column navigation accommodates many
   parameters, while the page handles vertical scrolling without pagination.
5. Export the selected patient scope as XLSX, or download individual charts as
   SVG/PNG. Displayed metrics and exports reuse the same prepared analysis.

## Scope boundaries

- Individual fits initially use the existing general OLS configuration. The full
  editor for fit presets, exclusions, time balancing and additional metrics is
  the next integration package.
- **Cohort models** explicitly shows that real model fitting is not yet connected
  to this workspace. Integration of the existing models and trend projections is
  a separate complete workflow.
- No automatic patient-data persistence or restoration. Saved projects are not
  part of this package.
- Research use only; no clinical decision support or time-to-event analysis.

Remaining requirements are tracked in the
[requirements reconciliation](requirements-reconciliation.md) and
[feature inventory](../prototypes/analysis-workspace/feature-audit.md).

## Acceptance record

Verified 2026-09-14 before the English-language correction:

- 814 unit/component tests across 97 files passed. The final keyboard-focus patch
  was additionally verified by all 11 trajectory component tests.
- Production build passed with both application entry points.
- All 13 existing browser regression checks and all 3 new workspace checks passed
  against the production build (across two runs).
- Real generated XLSX: string patient IDs, 12 imported parameters, identical names
  with distinct units, missing demographics, valid/rejected events and derivation.
- Failed replacement preserved loaded data; successful replacement reset scope.
  Manual demographics updated calculated rows; formula replacement retained the
  selected derived trajectory; disabling derivation explained its unavailability.
- Actual downloaded workbook contents, UTC dates in an America/Los_Angeles browser,
  patient/parameter scope, derived provenance, SVG content and PNG bytes checked.
- A 390 px viewport stayed within the page width. Horizontal table position and
  keyboard focus survived patient-detail navigation.
- Desktop graph table, grouped overlay and downloaded PNG inspected visually;
  chart title, axis/unit, grouping context, legend and research footer were present.
- Independent package and whole-change reviews completed; substantive findings
  were fixed and re-reviewed. Numerical core was not changed.

Final English-language verification, 2026-09-14:

- 814 tests across 97 files passed; production build passed.
- All 16 Chromium checks passed in one run against the production build, including
  the three complete workspace workflows and actual workbook/SVG/PNG downloads.
- Independent review found no missed German application copy or translation
  regressions. Imported labels and core field names remain untouched; workspace
  exports present English column headers through a local adapter.
- Downloaded English PNG visually checked: title, grouping, axes and research
  footer readable. Local workspace remains available on port 5173.
- Implementation and translation packages were committed incrementally. English
  application copy and regular commit checkpoints are recorded in `CLAUDE.md`.

Technical verification does not replace acceptance with representative research
files or release approval. Nothing from this branch has been released.
