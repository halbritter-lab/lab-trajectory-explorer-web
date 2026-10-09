# Changelog

This project follows [Semantic Versioning](https://semver.org/) while its public
interfaces are still evolving before 1.0.

## [Unreleased]

## [0.3.2] - 2026-10-09

### Added

- Footer links to the GitHub repository and Halbritter Lab, with a creator
  attribution linking to Jan-Paul Lerch's website.

## [0.3.1] - 2026-10-09

### Changed

- The workspace header shows the package version beside the application title.

- Removed the standalone latest measurement value beneath trajectory charts in
  the patient table and patient view. Values remain available in chart tooltips
  and measurement details.

## [0.3.0] - 2026-10-09

### Changed

- Patient-opening buttons in the trajectory table now have targets of at least
  44 by 44 pixels on desktop and touch screens; long IDs remain fully accessible.

- Cohort model actions now explain why fitting is unavailable for the current
  data and settings. Grouped fits submit eligible units and report skipped units.

- The import card on the start screen is easier to scan: the file field and a
  compact "Load demo data" button share one row, the template and example
  downloads moved into a collapsed section "Templates and example files", and
  the "Remember on this device" option is set apart below them. Link names
  and file names are unchanged.
- The charts in the patient table under Trajectories use the full width of
  the table: the parameter columns share it, so few columns give wide charts.
  A new "Chart size" selector offers Small (68 px high, at least 176 px wide,
  the outer size of the former fixed chart), Medium (110 px, the default) and
  Large (160 px). With many columns the charts keep the minimum width of
  their size and the table scrolls sideways as before; on a narrow screen the
  minimum shrinks so that one chart stays visible. Axis labels have one fixed
  font size, and the notes below a chart wrap within its width.
- The Methods page gained seven sections on topics it did not cover, with
  wording approved by the owner on 2026-10-08: analysis presets, time
  balancing by monthly and quarterly medians, ordinary least squares, AKI
  timing with episodes and the fit-exclusion window, the conditions, age and
  rounding of eGFR, how sex and age are resolved, and the specification,
  intervals and projections of cohort models. The "Age" input of the eGFR
  section was shortened and now points to the new section. No behaviour
  changes.
- The Methods page was corrected where it no longer matched the application,
  with wording approved by the owner on 2026-10-07: cohort models following
  the Trajectories settings, the eGFR unit rule, rolling and segmented OLS as
  implemented, the relation to the Python package, the projected age and why
  three measurements rarely yield a projection, the one-date note, the eGFR
  formula starting at "Off", both creatinine conversion constants, AKI
  detection under dialysis, and the rapid-decline flag not testing whether a
  decline is sustained. No behaviour changes; open decisions OD-3, OD-4, OD-5,
  OD-10 and OD-12 are closed.
- Trajectory-fit and cohort-model rules decided by the owner on 2026-10-07
  (formerly open decisions OD-1, OD-2, OD-6, OD-9 and OD-23 in
  `docs/method-algorithms.md`):
  - Cohort models prepare their measurements with the analysis settings chosen
    for the same parameter under Trajectories. **Numeric change for cohort
    models:** with a preset such as CKD progression, event censoring, AKI
    windows and quarterly medians now take effect, and "No fit" prepares no
    model. Until now the page always used general exploration, so the "Apply
    preset event and AKI exclusions" checkbox had no effect. The page states
    the settings in use; changing them under Trajectories discards the models
    fitted for that parameter.
  - Rolling OLS now shows what it computes: one line per two-year window in the
    charts, and the number of windows with the smallest and largest window
    slope in the table. The reported slope, R² and confidence bounds remain
    the global OLS values. The cohort and slope exports end with the new
    columns `rolling_window_days`, `rolling_step_days`, `rolling_windows`,
    `rolling_slope_min` and `rolling_slope_max`.
  - When all fitted measurements share one date, the table says that no slope
    exists instead of showing an "uncertain slope" note. Exported values are
    unchanged.
  - The "Group interaction" preset can be fitted for a numeric attribute (it
    stored an invalid reference level), and its description no longer promises
    p-values; none were ever computed.
- eGFR, AKI and endpoint rules decided by the owner on 2026-10-07 (formerly
  open decisions OD-13 to OD-20 in `docs/method-algorithms.md`). All are
  **numeric or classification changes** for the data they concern; the golden
  fixtures contain no affected case and are unchanged.
  - A series counts as eGFR by its unit mL/min/1.73 m² alone, in every
    feature: CKD endpoints, kidney failure reached, the rapid-decline flag and
    the cohort-model projection presets. A clearance or an eGFR series
    imported with the bare unit `ml/min` no longer receives endpoints or the
    flag; a series named otherwise than "eGFR…" in mL/min/1.73 m² now gets
    the projection presets. The unit is recognised in any letter case and
    spacing, with a decimal comma, `²` or `^2`, and also written as
    `mL/min/{1.73_m2}` (UCUM), `ml/min/1.73qm` or `mL/min per 1.73 m2`
    (accepted by the owner on 2026-10-08). A unit with trailing text such as
    `ml/min/1,73 m² KOF` is not recognised.
  - AKI detection ignores serum creatinine of zero or less (previously a
    baseline of 0 produced a stage III episode) and creatinine measured under
    dialysis: from the start of chronic dialysis until a later kidney
    transplant, and inside dated acute-dialysis intervals. Detection continues
    after transplantation. Episodes, chips and AKI exclusion windows of
    affected patients change. The Data page reports the number of
    non-positive creatinine values.
  - An eGFR derived from a non-exact creatinine row of a pre-parsed import
    (`range`, `unparseable`) is no longer marked exact and stays out of fits,
    endpoints and cohort models.
  - The projected age at CKD G5 starts from the exact age when the birth date
    is known, so it is up to one year higher than before. Without a birth
    date it still starts from the age in completed years; the badge then
    shows a rounded value marked as approximate (`G5 @ ~66y`). The new export
    column `endpoint_prediction_age_basis` records which applies.
  - The projection needs 365 days of follow-up instead of 365.25, the same as
    the slope reliability rule; one calendar year of measurements now
    qualifies.
  - A confirmed observed G5 withholds the projection also when the
    observed-G5 endpoint is switched off.
  - The minimum confirmation interval is limited to 365 days, because a
    confirming value must follow within 12 calendar months; a larger entry is
    rejected with that explanation.
  - Confirmed as final: the 20-year projection horizon, the 90-day mean
    baseline for the 40 % and 57 % decline events, and the 12-month
    confirmation window.
- Import rules decided by the owner on 2026-10-07 (formerly open decisions
  OD-7, OD-8 and OD-24 to OD-28 in `docs/method-algorithms.md`):
  - Text values with exactly three digits after a point (`0.850`, `1.234`) are
    read as decimals instead of being left without a number. **Numeric
    change:** such values now enter all analyses. The import reports their
    number with an example, because a file that uses the point as a thousands
    separator would be read too low by a factor of 1000.
  - Dialysis intent is matched without regard to case; `Chronic` is no longer
    rejected, so that kidney replacement therapy now reaches censoring,
    endpoint truncation and "kidney failure reached".
  - With pre-parsed value columns, an empty operator cell beside a number
    means an exact value; the operator cell is trimmed.
  - Attribute-table birth dates are no longer retried with the browser's date
    parser. Long or free-text dates are reported and ignored for age.
  - New import diagnostics without a change to values: lab rows without a
    patient ID are listed as rejected, two accepted headers for the same lab
    or event field produce a warning naming the column used, and implausible
    stated ages (negative, or a birth year in the age column) are reported as
    a demographics conflict.
  One golden case moved deliberately: `tests/goldens/wert.json` now expects
  `"1.234"` to give 1.234 with operator `=` (previously no value,
  `unparseable`). All other fixtures are unchanged.
- `docs/method-algorithms.md` now specifies every implemented rule that
  decides which data are analysed and how results are derived: import and
  value interpretation, demographics resolution, the fit pipeline and presets,
  time balancing, OLS, rolling and segmented OLS, reason codes, the
  rapid-decline flag, eGFR derivation, AKI detection and exclusion windows,
  clinical events, endpoints, cohort mixed models and their projections.
  Behaviour that conflicts with other documentation or looks unintended is
  described as implemented and marked as an open decision (OD-1 to OD-29).
  Documentation only: no numeric or behavioural change. Entries below were
  corrected where they described behaviour the code does not have.
- The patient table now pages large cohorts while keeping global sort and
  export scope, keyboard focus on return from patient detail, and explicit
  page versus all-matching selection. Event types accept case variations
  (dialysis intent tokens remain case-sensitive; open decision OD-7);
  import diagnostics can be expanded, clinical badges have accessible details,
  and WebR download failures give connection and retry guidance.
- CI uses restricted token permissions, bounded jobs and cached Chromium;
  development dependencies align on patched Vite 6.4.3 and Vitest 4.1.11.

- Cohort mixed models require ten patients with repeated times (three for
  random slopes, two for random intercepts). This technical input guard is not
  a sample-size calculation. Singular fits are flagged separately from
  convergence; their coefficients remain exportable while projections and
  fitted model lines are withheld. The Methodology page now explains each
  patient's model time origin and the limitations from visit timing and dropout.

- Cohort mixed models now let users apply or skip the selected preset's event
  censoring and AKI windows. Application remains the default. The workspace
  and model workbook report each entity's eligible measurement rows
  removed by these windows, separately from balancing and factor exclusions;
  changing the choice invalidates prior fits and projections. The Cohort
  models page currently always supplies the general-exploration configuration,
  so no row is removed there and the count is 0 (open decision OD-1 in
  `docs/method-algorithms.md`).

- Withhold individual G5 crossings beyond 20 years after the latest eligible
  measurement or when endpoint-fit slope confidence bounds include zero or are
  unavailable. Export the endpoint-fit bounds, horizon and distinct reasons;
  replace prognostic "G5 unlikely" copy with neutral wording. Clarify total
  first-to-latest change and the 12-month G4/G5 confirmation window in badges.
  Existing numeric goldens have no affected endpoint projection records and
  remain unchanged.

- Limit G4/G5 and confirmed 40%/57% eGFR decline confirmation to 12 UTC calendar
  months after each candidate, inclusive, with end-of-month clamping and a new
  candidate on a later crossing. Previously late G4/G5 values could confirm an
  old crossing, so observed event dates may change. Existing numeric goldens
  contain no affected confirmation histories and remain unchanged.

- Stop eGFR endpoint evaluation and individual G5 projection at the first
  kidney transplant or chronic dialysis start, and omit measurements during
  complete dated acute dialysis intervals. The same eligible rows feed endpoint
  values and the projection fit; raw chart points remain visible. Endpoint
  values can change in event-bearing datasets; existing numeric golden fixtures
  contain no affected event inputs and were deliberately left unchanged.
- Report KRT in nonempty eGFR cells even when no measurement precedes KRT.
  Withhold future individual G5 projections after KRT with an explicit reason
  in cohort exports, while retaining earlier lab-confirmed G5 events.

- Apply a 1e-12 numeric tolerance at KDIGO creatinine thresholds, including
  the stage-1 floor, so exact 0.3 mg/dl and 1.5-fold rises survive floating
  point rounding. AKI detection now converts eligible serum creatinine µmol/l
  to mg/dl using 88.42 µmol/l per mg/dl. eGFR derivation continues to convert
  the selected eligible µmol/l source. AKI results and associated exclusion
  windows can change for previously ignored µmol/l series or exact boundaries;
  source series remain separate and bound rows remain excluded.
- Exclude `<x` and `>x` limits from slopes, endpoint evaluation and prediction,
  AKI detection and cohort mixed models. Preserve raw counts and chart points,
  and label the exclusion in import warnings, plots, tables and exports. Fits
  and endpoint values can change for datasets containing bounded values; exact
  observations on the same date remain eligible.
- Correct the fitted count when a series has fewer than two exact rows: fit
  exclusion windows now remove those rows before counting, and disabled fits
  report zero. Raw measurement counts are unchanged.

### Added

- Add independent confirmed 40% and 57% eGFR decline events using the mean of
  exact eligible measurements in the first 90 elapsed UTC days. Candidate
  search starts after that window; badges and workbook exports show the baseline,
  first crossing, confirmation and recovery evidence. The first-to-latest
  percent change remains a separate metric.

- Report kidney failure reached at kidney transplant or chronic dialysis start
  with event type and date, independently of lab-confirmed CKD G5, in cohort
  badges and exports.

- Independent observed G4/G5 events with configurable confirmation interval
  (default 90 days), separate first-crossing/confirmation dates and later recovery
  evidence. Recovery before confirmation restarts the candidate; recovery after
  confirmation preserves the event. Endpoint exports record configuration and dates.
- Theil-Sen 95% slope confidence bounds, Python separate-median intercept and
  three-observation minimum, with expanded full-field reference parity tests.
- Individual endpoint prediction now extends the fitted curve instead of
  anchoring at the latest measurement, independently of optional display-fit
  preparation. Its input is the endpoint-eligible measurements described under
  Changed above (before kidney replacement therapy, outside dated acute
  dialysis intervals, bounds excluded), including later recovery values.
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
  effects and reference categories; numeric or categorical interpretation is
  assigned automatically from the attribute's values (open decision OD-22),
  with a genotype example including baseline age and sex. Preview model-specific
  exclusions and export all coefficients, fitted settings, centers and units.

- Single-workbook upload: `.xlsx` workbooks containing `labs`, `events`, and/or
  `attributes` sheets can now be uploaded in one step, automatically populating
  measurements, timeline events, and patient metadata while preserving the
  separate-file upload workflow.
- Tolerant header resolution across all importers (`labs`, `events`, `attributes`),
  supporting case and separator variations (e.g. `patient_id`, `Patient ID`, `patientID`).
  Two headers that differ only in case or separators are rejected as ambiguous.
  In lab and event sheets, two different accepted names for one column (e.g.
  `labDate` and `LabDatum`) are both accepted and the first-listed name is used
  (open decision OD-25); the attributes sheet rejects two sex or two birth-date
  columns.
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
  between rows, or between rows and the attributes table, are reported instead
  of silently computed over. A manual entry takes precedence and suppresses
  the reports for that field.

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
  read as 3 April. Exception: an attribute birth date longer than 10 characters
  that this parser rejects is retried with the JavaScript `Date` parser (open
  decision OD-24).
- Lab imports report exact duplicate rows, censored values (`<`, `>`; excluded
  from fits, endpoints and AKI detection, see Changed above) per parameter,
  decimal commas that may be
  thousands separators (`1,234`), unreadable birth dates and merged unit
  spellings. Units that differ only in spacing, micro-sign form or case that
  cannot change an SI prefix (`mg/dL`, `MG/DL`, `umol/L`, `μmol/l`) form one
  parameter; `mU/l` and `MU/l` or `g/l` and `G/l` stay separate (an
  all-capitals `MU/L` is folded and merges with `mU/l`), and different
  units are never converted. Event and attribute import messages are readable
  sentences naming the offending value. Missing-column errors name the missing
  columns and list the columns found.
- Typed numeric value cells in XLSX files are taken as numbers. Previously a
  numeric cell such as 1.234 was treated like the text `1.234`, which is
  ambiguous with a German thousands separator, and left without a value.
- Workspace Rolling OLS and Segmented OLS selections now run under their own
  slope modes. The reported slope, R² and confidence bounds remain the global
  OLS values; segmented OLS draws one line per fitted gap segment and rolling
  OLS draws none (open decisions OD-2 and OD-3). Endpoint export provenance is blank for endpoints that
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

[Unreleased]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/halbritter-lab/lab-trajectory-explorer-web/releases/tag/v0.1.0
