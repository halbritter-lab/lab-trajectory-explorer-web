# Changelog

This project follows [Semantic Versioning](https://semver.org/) while its public
interfaces are still evolving before 1.0.

## [Unreleased]

### Added

- Independent observed G4/G5 events with configurable confirmation interval
  (default 90 days), separate first-crossing/confirmation dates and later recovery
  evidence. Recovery before confirmation restarts the candidate; recovery after
  confirmation preserves the event. Endpoint exports record configuration and dates.
- Theil-Sen 95% slope confidence bounds, Python separate-median intercept and
  three-observation minimum, with expanded full-field reference parity tests.
- Individual endpoint prediction now extends the fitted curve on all dated
  numeric measurements, including recovery, independently of optional display-fit
  preparation. This intentionally changes the previous latest-measurement anchor.
  See `docs/method-algorithms.md` for numerical contracts and worked examples.

- Workspace analysis presets and independent column settings; cohort-model studio
  with covariates, grouped fits, reference-trajectory preview and projections.
- Opt-in workspace storage for seven days, including source data, events,
  attributes, manual demographic edits and derivation settings; safe deletion,
  restore diagnostics and protection against stale writes from another tab.
- Model-preview SVG/PNG export and patient ZIP bundles with workbook and charts.
- Individual uncertain-fit markers, navigation guidance and narrow-screen model
  layouts. Model previews and overlays reject stale or non-converged results and
  use model elapsed time correctly on age axes. Sorting supports colons in names.

- English real-data workspace: import and demographic review, previewed eGFR
  derivations, multi-parameter patient graph table, individual trajectories,
  configurable spaghetti overlays, and scoped XLSX/SVG/PNG exports.

- Configurable trend projections from fitted mixed-model profiles: editable
  above/below targets, G4/G5 boundary presets for compatible eGFR series,
  reference time and projection horizon. Results include unavailable reasons
  and clearly identify that time uncertainty is not estimated.
- Numeric parameters can be fitted on the Cohort models page. Profile
  and target settings remain session-only; exports include the applied target,
  profile, source response, model identity and projected times.

- Configurable mixed-model patient factors: select level or level-and-slope
  effects, numeric/categorical interpretation and reference categories, with a
  genotype example including baseline age and sex. Preview model-specific
  exclusions and export all coefficients, fitted settings, centers and units.

- Single-workbook upload: `.xlsx` workbooks containing `labs`, `events`, and/or
  `attributes` sheets can now be uploaded in one step, automatically populating
  measurements, timeline events, and patient metadata while preserving the
  separate-file upload workflow.
- Tolerant header resolution across all importers (`labs`, `events`, `attributes`),
  supporting case and separator variations (e.g. `patient_id`, `Patient ID`, `patientID`)
  with strict ambiguity detection when distinct headers refer to the same concept.
- Explicit birth date conflict detection: disagreements between birth dates stated
  in lab rows versus the attributes table are tracked and reported as
  `birth_date_source_disagreement`.
- Cohort and single-patient exports gained a `demographics_conflict` column
  flagging patients whose sex or age could not be resolved without
  contradiction.
- The cohort can now be grouped by sex without a second spreadsheet.

### Changed

- Analysis now uses a module registry for per-domain settings, validation,
  cohort flags and overlays. Nephrology analytes, defaults and censoring rules
  have one source; presets use shared core builders, and exclusions use generic
  windows. The mixed-model outcome is named `value`, with its series identified
  in the displayed formula. These P3 architecture changes preserve numeric
  results; `docs/architecture.md` documents the module contract and layering.
- The workspace is now the only interface and is served at `index.html`. The
  former interface (sidebar, series strip, cohort view and model dialog) was
  removed on 2026-10-06; `workspace.html` redirects to `index.html` so older
  links keep working. Ported from the former interface: AKI windows and episode
  markers in the charts (behind a display toggle), excluded measurements drawn
  as grey open circles with their reason, per-group mixed-model lines in the
  overlay, a sort-direction toggle, tables of loaded and rejected events,
  downloads of the demo workbook, events and attributes, a readable model
  formula with the patients a factor choice excludes, and the warning that
  quotes unreadable sex spellings. Deliberately not ported: the S/M/L thumbnail
  sizes (the graph table has one size and an optional zoomed value scale) and
  the "show all series" creatinine-source picker (eGFR sources are limited to
  eligible serum creatinine series).
- The saved workspace lives in the app's own IndexedDB database instead of the
  default database other apps on the same origin can share. A valid copy from
  the previous release is moved once. Data the former interface saved is removed
  at start-up regardless of age, and the Data page says so once. Expiry is
  checked before the format, and expired, invalid or unsupported copies are
  deleted instead of left on disk.
- Removed the `@observablehq/plot` and `react-aria-components` dependencies.
- Sex and age are now resolved once per patient before any analysis runs,
  rather than being read from each lab row individually; contradictions
  between rows (or between rows, the attributes table, and a manual entry)
  are reported instead of silently computed over.

### Fixed

- Values that overflow to infinity (`1e400`) are reported as unparseable
  instead of entering fits, and a saved workspace containing values the saved
  format rejects is no longer written.
- The patient table explains an uncertain or missing slope in a disclosure,
  and the individual patient view states the explanation; previously only the
  short label was shown. The Cohort models page names the reference category
  of each categorical factor.
- CSV imports are read as text, so decimal commas (`1,5`), leading-zero patient
  IDs (`0012`), ranges (`10-20`) and UTF-8 or Windows-1252 units (`µmol/l`) reach
  the parsers unchanged. Previously `1,5` was read as 15 without a warning.
  Patient IDs in CSV files are also kept as written: `12.0` or `1e3` are no
  longer turned into 12 or 1000 and are distinct from `12` and `1000`.
- Lab, event and attribute dates accept ISO, `DD.MM.YYYY` and day-first
  `DD/MM/YYYY` (reported). Numbers in lab and event date cells are Excel serial
  dates within 10000–80000 (1927–2119); birth dates accept serials from 1900.
  Whole numbers 1900–2100 are rejected as bare years. Impossible dates such as
  `2021-02-30`, two-digit years (`15.01.24`), dashed day-first dates
  (`15-01-2024`) and other unreadable lab dates now reject the row with a
  diagnostic instead of loading it without a date. US month-first dates are not
  supported: in attribute files, a birth date such as `03/15/1980`, which was
  previously read month-first, is now ignored with a warning, and `03/04/1980` is
  read as 3 April.
- Lab imports report exact duplicate rows, censored values (`<`, `>`, which fits
  currently use at their limit value) per parameter, decimal commas that may be
  thousands separators (`1,234`), unreadable birth dates and merged unit
  spellings. Units that differ only in spacing, micro-sign form or case that
  cannot change an SI prefix (`mg/dL`, `MG/DL`, `umol/L`, `μmol/l`) form one
  parameter; `mU/l` and `MU/l` or `g/l` and `G/l` stay separate, and different
  units are never converted. Event and attribute import messages are readable
  sentences naming the offending value. Missing-column errors name the missing
  columns and list the columns found.
- Typed numeric value cells in XLSX files are taken as numbers. Previously a
  numeric cell such as 1.234 was treated like the text `1.234`, which is
  ambiguous with a German thousands separator, and left without a value.
- Workspace Rolling OLS and Segmented OLS selections now run their own fit paths
  instead of global OLS. Endpoint export provenance is blank for endpoints that
  were not evaluated; earlier endpoint columns keep their position and the patient
  slope sheet keeps Mode fourth. No percent change is shown for one measurement.
- Workspace plots now share a zero-inclusive parameter scale by default, with
  explicit zoom for inspecting small changes. View selection is visibly active,
  new derived series appear in the selection, and Methods shows the workspace
  guide followed by the full methodology reference.
- Workspace demographic labels are readable, derivation actions remain above
  long previews, and plotted events have an inspectable patient/date/title list.
- Workbook imports now report rejected event/attribute rows and accepted-row
  warnings, with expandable sheet, patient, and reason details. Single-sheet
  lab files remain usable even when their sheet is named `events` or `attributes`.
- Explicit birth-date cross-checks include later lab rows, and multiple conflicts
  receive distinct UI identifiers. Manual-age prefills use the displayed
  reference date rather than copying a later measurement's age unchanged.
- Event imports recognize supported case/separator aliases before checking for
  an obsolete event schema.
- The single-patient parameter list no longer offers a computed eGFR series to
  a patient for whom no value can be computed, and marks an already-selected
  one as unavailable instead of drawing an empty chart.
- A manually entered age now ages across the series instead of being applied
  unchanged to every row. This corrects a real error: on an eight-year series,
  the old behaviour left the patient the same age at both ends, roughly an
  eight percent eGFR error at the later end, in the direction that makes a
  decline look flatter than it is.
- eGFR values will change for any dataset whose stated ages do not fit a
  single birth date — this includes the common export shape of one
  age-at-export value repeated on every row of a patient, which is
  contradictory by construction. Measured on the shipped demo workbook
  (regenerated on this branch to resolve without conflict): 54 of 118
  computed eGFR rows moved, across 10 of 14 patients; largest absolute change
  0.8 ml/min/1.73m², largest relative change 1.86%.

## [0.2.0] - 2026-08-24

### Added

- Visible slope-quality warnings and explicit reasons when no CKD G5 projection
  is available.
- Canonical camelCase import headers with backward-compatible aliases, broader
  sex-value parsing, and downloadable empty templates.
- Fit-estimator and unstable-slope metadata in cohort and patient exports.
- Pull-request CI and browser regression coverage for the new import, quality,
  endpoint, download, and mobile methodology paths.

### Fixed

- Reliability checks now use the measurements and span retained after
  censoring, exclusions, and time balancing without changing reference-parity
  reason codes.
- Exported fit-model metadata now identifies the estimator that produced the
  scalar slope.
- Ambiguous recognized import headers are rejected without rejecting harmless
  collisions among unrelated metadata columns.

## [0.1.0] - 2026-07-07

- Initial deployed baseline.

[Unreleased]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/releases/tag/v0.1.0
