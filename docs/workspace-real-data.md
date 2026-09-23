# Real-data workspace

Development branch: `feat/workspace-real-data`, based on the design in PR #15.
Run `pnpm dev --host 127.0.0.1`, then open
`http://127.0.0.1:5173/workspace.html`.
For production-build checks, run `pnpm build` and `pnpm preview`.

The workspace reuses the existing import, demographics, eGFR and analysis functions.
It has its own entry point; the original application at `index.html` and the
synthetic design prototype remain available for comparison.
Data stays in the browser. By default it lasts only for the current session.
Under Data, **Remember on this device** opts into an unencrypted local snapshot
of source labs, events, attributes, manual demographics and derivation settings.
The snapshot expires seven days after the last data change. Reopening restores
that data preparation; analysis/view choices and fitted models reset. The original
application uses its own saved dataset and does not restore this workspace copy.
**Clear saved data** removes the local copy while retaining the current session;
**Clear dataset** confirms and removes both. Storage errors remain visible and
imports still work. A stale tab cannot overwrite a newer or deleted snapshot;
its next save stops and explains how to resume or explicitly save its own data.
The application language is English;
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

## Analysis and model workflows

- Individual analyses support OLS, Theil-Sen, rolling OLS, segmented OLS and no fit.
  Shared presets and per-column overrides include event censoring, AKI exclusion,
  time aggregation and rapid-decline settings. The table and exports use the same
  prepared summaries. Uncertain individual fits have dotted lines in the overlay
  and an accessible description, in addition to the overall warning count.
  Patient measurement rows explain existing event/AKI exclusions and identify
  values available before time aggregation; this does not introduce another fit.
- Cohort models fit the existing browser-based WebR model, with configurable
  factors, grouped fits, result tables and profile/threshold projections. Chart
  results must match the current response, unit, data, preparation and model
  configuration, and must have converged. Changing response or data hides stale
  curves. Overlay filters do not refit or redefine the full-cohort reference line.
  On an age axis, the reference uses mean fitted baseline age plus model time.
- The model preview exports SVG/PNG. Individual views also export a ZIP containing
  the scoped patient workbook and currently available SVG charts, with metadata
  and research framing. Distinct charts retain distinct names in the archive.

## Scope boundaries

- Stored data preparation is not full project management: named projects, saved
  view/column configurations and saved fitted models are not included.
- Endpoint definitions, legacy individual projection anchors and Theil-Sen
  conventions remain separate decisions. No numerical core contract was changed.
- Research use only; no clinical decision support or event-time model.

The current worklist is the [completion backlog](workspace-completion-backlog.md).
Historical requirements are tracked in the
[requirements reconciliation](requirements-reconciliation.md) and
[feature inventory](../prototypes/analysis-workspace/feature-audit.md).

## Acceptance record

Verified 2026-09-23:

- `pnpm test --maxWorkers=2 --minWorkers=1`: 857 tests across 100 files passed.
- `pnpm build`: TypeScript and production bundling passed.
- With `CI=1` and `CROSS_BROWSER=1`, the complete Playwright suite passed
  72 checks in Chromium, Firefox and WebKit. After adding per-measurement
  exclusion explanations, all 36 workspace checks passed again against the
  final production build (`--workers=2 --timeout=60000 --retries=0`).
- Browser coverage includes prepared-data resumption/deletion, stale-tab storage,
  failed replacement, actual SVG/PNG/ZIP/workbook downloads, event exclusions,
  narrow screens and a synthetic 200-patient/19,200-measurement cohort.
  A real WebR demo fit was also exercised separately.
- Independent code review reproduced and resolved stale-tab persistence and
  clear/import races. Numerical core files and parity contracts are unchanged.

These checks establish technical regression coverage. Representative research
data, first-user acceptance and the decisions in the
[current backlog](workspace-completion-backlog.md) remain outstanding.
The dated records below describe earlier checkpoints.

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

## Visual review follow-up

The external preview review identified misleading automatic value-axis zoom,
an unstyled active view switch, an overly broad methods page, an inconspicuous
new derivation, dense controls, unresolved sex codes and inconspicuous event lines.
These were checked against the implementation rather than treated as clinical
recommendations.

- Value scales default to the full dataset range for each parameter and unit,
  including zero and negative values where present. The same scale is used in
  the graph table, overlay and individual view. Users can explicitly choose
  **Zoom to visible values** to inspect small changes. This is a display choice,
  not a clinical reference range; the chosen scale is included in chart exports.
- Table, Overlay and Individual patient have a visibly selected button.
- Methods starts with the available workspace workflow and OLS configuration.
  The unchanged full application reference is in a clearly labeled disclosure
  and explicitly includes features not connected to this workspace.
- Newly created derived parameters are added to the current selection with a
  notice. Imported parameters remain selected; deliberate deselection is respected.
- Derived-value preview scrolling is bounded and Apply stays above it. Sex codes
  are translated only for presentation; source values and grouping identities are
  retained. Plot copy and analysis controls are made more compact, and plotted
  events can be inspected by patient, date and title.

The broader first-time-user orientation and full analysis configuration remain
in the existing requirements inventory. Technical preview acceptance does not
establish clinical significance or replace testing with representative data.

Final follow-up verification, 2026-09-14: 821 tests across 97 files passed,
production build passed, and all 17 Chromium checks passed against that build.
The added browser regression verifies computed-series visibility, contrasting
active-view styles, identical shared scale in overlay and patient detail,
explicit zoom and the methods disclosure. Independent review completed with no
substantive issues remaining; the numerical core is unchanged.
