# Changelog

This project follows [Semantic Versioning](https://semver.org/) while its public
interfaces are still evolving before 1.0.

## [Unreleased]

### Changed (open points of the persona review, decided 2026-11-22)

- The methodology page (AKI detection, "AKI Timing, Episodes and the
  Fit-Exclusion Window") states the rule for several creatinine values on one
  day: ordered by the time of day where each has one, otherwise compared with
  values of earlier days only (OD-34 resolved).
- **The time of day is exported and read again.** `measurements` and
  `raw_measurements` gain the last column `time_of_day` (`HH:MM:SS`, empty
  when the file gave none). Loading the app's own workbook again reads it from
  `raw_measurements`, so the AKI episodes are the same after a round trip
  (before, a rise from 1.0 at 06:00 to 1.6 at 20:00 was an episode after the
  import of the file and none after the re-import of its export).
  `input_data_id` covers the time of the rows that have one; for a dataset
  without times it is unchanged.
- The measurement table of the patient view shows the time beside the date
  where the file gave one, and orders the rows of one day by it when every
  row of that day has one (file order otherwise).
- Import warns about event dates and event end dates after the import day or
  before 1927-05-18, and about birth dates after the import day, as it does
  for lab dates. Warning only; the events and rows are used unchanged.
- The Trajectories table shows the sign of a bound as the latest value
  ("latest <15" instead of "latest 15"). Display only.
- Cohort models: the starting level in the results table and both bounds of
  its interval have the same number of decimals, that of the coefficient
  table ("45.50 [44.12, 46.90]" instead of "45.5 [44.12, 46.9]"). Display
  only.
- The `settings` sheet of the cohort workbook ends with `group_by`, the
  attribute the table was grouped by (empty without grouping).
- A chart column that does not exclude AKI windows from its fit ("Acute
  review", for example) says under the chart that nothing is excluded there
  and that the shaded band shows the configured window length.
- Cohort models: the warnings of the model input check (single measurement,
  too few measurement times, duplicate times) are shown in plain words with
  the patient IDs concerned (up to five, then "and N more"). The exported
  text in `models.warnings` and `projections.warnings` is unchanged.
- The header row of the Trajectories table stays in sight while the rows
  scroll: the table scrolls inside a box no taller than the window. On a
  phone the position ("1–25 of 28") is shown between Previous and Next.
- README: one concrete way to start a local copy (a static file server;
  opening `index.html` by double-click does not work), and the sentence on
  data leaving the machine follows the Methods page (downloads of the R
  runtime only, no measurements sent). The notice of a page opened from a
  folder links to the online version.
- An events or attributes file whose rows are all rejected ("No usable
  events …") still lists its rejected rows in the import diagnostics; the
  loaded events or attributes stay as before.

### Changed (AKI detection: several creatinine values on one day, decided 2026-11-21)

- **AKI detection no longer depends on the row order of the file.** A time
  of day in the lab date (text, workbook date cell or serial number) is kept
  and orders the creatinine values within a day. Where a day has values
  without a time of day, its values are compared with values of earlier days
  only, not with each other. The 48-hour, 7-day and exclusion windows still
  count calendar days. Before, a file with the newest row first reported a
  fall within a day as an episode and missed a rise.
- **Results change** for files with several serum creatinine values per
  patient and day: episodes, exclusion windows and with them slopes, chips
  and the `aki_episodes` sheet. Files with one value per day are unaffected;
  no fixture value moved.
- The Data page names the patient-days whose creatinine values cannot be
  ordered within the day, and the message after an import of lab values
  states their number.
- A workbook date cell gives the same day and time in every time zone of the
  browser. Read through local time, a cell time skipped by daylight saving
  time (02:30 on 29 March 2026 in Europe/Berlin) would have been moved by one
  hour.
- Kidney package: `findKdigoAkiEpisodes`, `episodesForSeries` and
  `fitAkiAware` follow the same rule. `SeriesPoint` has an optional
  `timeOfDay`; points of one date without it are no longer compared in input
  order.
- The time of day is a sort key only; it was not shown and not exported
  (both changed on 2026-11-22, see above). A dataset stored in the browser before this change has no times until the
  file is imported again; the notice shown when such a copy is restored says
  so. The methodology page was updated on 2026-11-22 (OD-34).
- Until 2026-11-22, because no export carried the time of day, an exported cohort workbook that
  is loaded again has none: several creatinine values of one day are then
  compared with earlier days only, and AKI episodes, exclusion windows and
  slopes can differ from the export (a rise from 1.0 at 06:00 to 1.6 at 20:00
  is an episode after the import of the file and none after the re-import of
  its export). `input_data_id` does not cover the time of day and is the same
  for both. The `about` sheet says so.
- With several creatinine values on the peak day, the AKI marker of a
  creatinine chart sits on the peak value of the episode, not on the first
  value of that day.

### Added (import diagnostics, after the persona review of 2026-11-21)

- Import diagnostics name the row of the source file ("labs.csv, row 12,
  patient 7, rejected: …"), also for warnings on accepted event rows. Collective warnings (duplicates, thousands
  notation, bounded values and the new ones below) open a list of the affected
  rows with patient, date, parameter and the value as written.
- The counts of values without a date or without a numeric measurement and
  the serum creatinine plausibility notices on the Data page open the rows
  behind them.
- Diagnostics are kept per table: replacing events or attributes no longer
  removes the diagnostics of the lab import. They are saved with "Remember on
  this device" and restored with the dataset. Copies saved before restore
  without them, and the restore notice then says that the copy was saved by
  an earlier version and has no import findings, source rows or times of day.
- "Download import diagnostics (XLSX)" on the Data page, and a new last sheet
  `import_diagnostics` in the cohort and patient workbooks, hold the
  diagnostics and data-check rows. The workbook sheet leaves out lines about
  patients who are not part of the export. Existing sheets keep their names,
  columns and positions.
- New import warnings; none changes an imported value, a series or a result:
  - a lab date after the import day or before 1927-05-18, once per patient
    with the date (owner decision of 2026-11-21);
  - differing values of one parameter on the same day, per parameter with the
    number of patient-days and patients;
  - unreadable sex spellings with their number of rows and patients, also
    when no eGFR formula is selected;
  - patient IDs that differ only in leading zeros, spaces or letter case
    ("0012" and "12"); they remain separate patients.

### Changed (creatinine material by LOINC code, decided 2026-11-21; changes results for affected files)

- Creatinine rows with the urine LOINC code 2161-8 or 14683-7 are imported as
  their own parameter, named after the test with " (urine, LOINC <code>)",
  and are not used for AKI detection or as an eGFR source. Before, serum and
  urine creatinine delivered under one test name formed one series, with
  false AKI episodes and a wrong computed eGFR. In such files the creatinine
  slope, the AKI episodes, AKI exclusion windows and the computed eGFR
  change. Files without these codes on creatinine rows, among them the demo
  data and the golden fixtures, are unaffected. Whole-blood creatinine codes
  stay eligible like serum. The import reports the rows it moved.
- The rule also applies to a dataset restored from "Remember on this
  device": a copy saved by an earlier version, which holds such rows under
  the serum name, gets the separate parameter when it is restored, and the
  restore notice names the number of values moved. Before, such a copy kept
  urine values in AKI detection and eGFR for up to seven days.
- The import warns when one parameter carries more than one LOINC code. The
  values stay one series.
- "Imported parameters" shows the LOINC codes of each parameter. The sheets
  `measurements`, `raw_measurements` and `parameters` of the cohort and
  patient workbooks get a column `loinc` after the existing ones (in the
  measurement sheets before `patient_birth_date`, added the same day);
  existing columns keep their names and positions.

### Added (Data page, after the persona review of 2026-11-21)

- When the selected eGFR formula or creatinine source differs from the one
  in use, the Data page says "Preview not applied" at the selection and
  beside "Open trajectories", with a button to apply it. Before, only the
  grey line "Active: Off, 0 computed values" showed the difference.
- "Review and edit patients" shows the number of dated numeric values and the
  first and last date per patient; "Imported parameters" shows how many
  patients have fewer than three dated numeric values of a parameter.
- Under "Templates and example files" a sentence states the allowed event
  types, the intent values (dialysis only) and the date forms, and points to
  "Demo events" as a filled example.
- "Loaded events" and "Rejected event rows" show the event description.

### Changed (age conflict message, decided 2026-11-21)

- When the stated ages of a patient fit no single birth date, the conflict
  names the lab dates concerned with the stated and the derived age ("on 2 of
  7 lab dates: 2023-07-11 (stated 54, derived 55), …") instead of "N days
  apart", which was not the size of the error. The same text is in the
  `warnings` column of the `demographics` export sheet. Ages, the conflict
  count and `demographics_conflict` are unchanged.

### Fixed (import, after the persona review of 2026-11-21)

- After "Replace events" or "Replace attributes", and after reloading a saved
  copy, the rows rejected by the lab import could no longer be inspected
  anywhere. They now stay listed (see above).

- A semicolon CSV whose data rows hold more commas than semicolons (test names
  or free text with commas, decimal commas) is read with the semicolon; before,
  such a file was rejected with "missing required column(s)". The field
  delimiter is taken from the header line when the header, split there, holds
  more accepted column names than split at the delimiter the reader counted
  over the start of the file. Every file that loaded before is read as before,
  including a `sep=` line, a header line with as many commas as semicolons
  (`patientId;Diagnose, genetisch`) and a column name with more commas than
  the header has semicolons (`patientId;Diagnose, genetisch, bestätigt`).

- The workbook export of a dataset without attributes loads again. Such an
  export (for example of a file without a sex column) has a
  `patient_attributes` sheet with the `PatientID` column only and was rejected
  with "Patient attributes file has no attribute columns." An attributes sheet
  of a workbook that has no column besides the patient ID is now skipped: no
  attributes are read and nothing is reported. A separately uploaded
  attributes file without an attribute column is rejected as before.

### Changed (import error message)

- The "missing required column(s)" error names the likely cause when the file
  has one column per lab test instead of one row per measurement, with an
  example of the expected layout, and when a column name contains a semicolon
  or a tab (wrong field delimiter). No column is mapped.

### Changed (Trajectories table, after the persona review of 2026-11-21)

- **A sort by slope or absolute slope places uncertain slopes after the
  reliable ones** (decided 2026-11-21): reliable slopes, then slopes with
  fewer than three fitted dates or under one year of follow-up, then patients
  without a slope. The status line gives the number of rows moved back;
  "Uncertain slopes last" restores the order by value. The export follows the
  table, so its row order changes with it. No value changes.
- **Slopes and their interval bounds have one number of decimals per
  parameter** (decided 2026-11-21): as many as give the median absolute slope
  of the loaded dataset two significant digits, between two and four.
  Creatinine in mg/dl reads "+0.010 mg/dl/yr [0.007, 0.014]" where it read
  "+0.01 [0.01, 0.01]". The patient view writes the slope the same way
  ("OLS: +0.010 mg/dl/year"), and on the Cohort models page the change per
  year, the coefficient table (estimate and bounds alike), the patient slope
  SD and the preview legend use the same number. Display only; exports keep
  full precision. A column whose median absolute slope is 0.1 or more keeps
  two decimals, so its small slopes still read "+0.01 [0.01, 0.01]"
  (creatinine under the CKD progression preset); see the open detail in the
  method decisions.
- The interval beside a slope is labelled in the cell: "95% CI", or "range"
  for Theil–Sen bounds on fewer than five fitted dates.
- A collapsed group no longer fills pages: pages hold the expanded rows only,
  a collapsed group is one header row with its total on every page, and
  "Showing 1–50 of 527 patients (273 more in collapsed groups)" counts the
  expanded rows. Selection and export keep the full scope.
- The page controls are repeated below the table, and a page change from
  there returns to the top of the table. A page can be chosen directly, and
  the page holds 25, 50 or 100 patients. The two selects are hidden on
  screens up to 900 px wide. The table header does not stay in view while
  scrolling; that part of the proposal is not built.
- "Select all 100 matching" names the number of hits and is offered as soon
  as a search, group filter or mark filter is active, without selecting a
  patient first.

### Added (Trajectories table, after the persona review of 2026-11-21)

- "Show only" under the status line filters the patients by the marks present
  (rapid decline, uncertain slope, endpoint reached, AKI) and by the type of
  their clinical events, each with its number of patients. Several chosen
  marks must all apply. Overlay, patient navigation and export follow the
  filter. On a phone the marks are in a toolbar menu. A patient open in the
  patient view stays open, with a note, when a changed trend method or
  setting takes them out of the chosen marks; the view does not switch to
  another patient and the patient export keeps writing the open one.
- The cohort export button names a restricted scope ("Export 12 of 28
  patients (XLSX)"), and the workbook exports show "Exporting …" while the
  file is written.
- An empty cell of the computed eGFR names the reason for that patient ("No
  eGFR: sex missing"), with the number of creatinine values affected and a
  pointer to "Review and edit patients"; the patient view states the same.
  A patient lacking both sex and age is told both ("No eGFR: sex and age
  missing", "Enter the sex and the age …"); the counts on the Data page keep
  one reason per row.

### Changed (methodology page; wording awaits the maintainer's approval)

- The Trajectories topic has two new paragraphs: the order of a sort by
  slope with *Uncertain slopes last* and the *Show only* filters, and the
  rule for the decimals of slopes. They describe the changes above; the
  wording is a proposal and not yet approved by the maintainer.

### Added (plots and events, after the persona review of 2026-11-21)

- The time axis can be shown in days: Display → "Time axis" offers "Days
  since first measurement" beside the years. Years stay the default; nothing
  switches by itself. The choice applies to the patient charts and the
  overlay and is saved with the other display choices. Slopes stay per year.
- A clinical event with an end date is drawn as a shaded band from its start
  to its end when "Events" is on (patient chart; in the overlay for the
  highlighted patient).
- Serum creatinine values measured under dialysis are named as "not used for
  AKI detection (dialysis)" in the point tooltip and in a new column of the
  patient's measurement table, with every preset. The detection rule is
  unchanged.
- The measurement table of the patient view lists the patient's events as
  set-off rows at their dates; "Events for this patient" is sorted by date.
- Rolling OLS: the patient view lists the windows ("Show windows") with
  bounds, first and last fitted measurement, their number and slope; each
  window line has a tooltip, and the legend says "Rolling OLS window lines".
  With monthly or quarterly medians as time balancing (the CKD progression
  default) the list, the tooltip and the cell say "monthly medians" or
  "quarterly medians" instead of "fitted measurements", and the list and the
  export note state that the count is one of medians and that a measurement
  outside the window bounds can enter through the median of its period.
  The exported workbook has a new sheet `rolling_windows` with the same rows
  (empty without a Rolling OLS parameter), placed after the sheets that
  existed before 2026-11-21, whose positions are unchanged. The reported
  slope stays the global OLS slope. The methodology page (Export) gains one
  row describing the sheet; its wording is a proposal that awaits the
  maintainer's approval.
- The Rolling OLS window list and the window tooltips write each slope with
  the decimals of the column, like the line above the list; before, two
  windows with slopes 0.249 and 0.251 both read "0.25".
- On a narrow screen the window list and the measurement table of the
  patient view keep dates, counts and the "AKI detection" note whole and
  scroll inside their frame.

### Changed (plots and events, after the persona review of 2026-11-21)

- The calendar axis no longer repeats a date: a range shorter than four days
  gets one label per day.
- The shaded AKI window says in its legend and tooltip that its length is the
  configured number of days after each onset, not the duration of the
  episode, and whether the column excludes the values from its fit ("excluded
  from this fit", "not excluded from this fit", or "this column has no fit").
  The band itself is unchanged.
- AKI stage labels are no longer cut off at the left or right border of a
  chart, nor are points and diamonds on the first or last date. Equal labels
  next to each other are merged ("AKI III ×3"); others move apart and off the
  measurement points.
- Overlay of many trajectories: from 51 trajectories in a chart its
  measurement points are hidden and its lines paler, from 201 paler still and
  thinner; a note above the chart says so. Each chart counts the trajectories
  plotted in it, so a parameter that few patients have keeps its points in a
  large cohort. Points are hidden only while the connecting lines are drawn.
  The "Measurement points" switch takes precedence once it is used; that it
  was used is saved with the other display choices and holds after a reload.
  Image exports show what is on the screen; numbers and table exports are
  unchanged.
- Moving the pointer across the overlay no longer rebuilds every trajectory;
  the trajectory under the pointer is drawn on top of the others.
- The cohort mixed-model line is also drawn on the days axis.
- No estimate, flag, endpoint or existing export column changes.

### Changed (breaking for scripts that read the cohort export, decided 2026-11-21)

- The patient ID column is named `PatientID` in every sheet. In `events`,
  `patient_attributes` and `demographics` it was `patientId`; a script that
  reads that name there fails on it. The cell has the type the import gave
  the ID, the same in every sheet: `patient_attributes` writes a numeric ID
  as a number like the other sheets (it wrote text), so the sheets join on
  the ID without a conversion. A dataset with numeric and other IDs still
  has both cell types in the column.
- `group` is always the last column of the `cohort` and `slopes` sheets and
  empty when the table is not grouped. In a grouped export a patient without
  a value for the attribute has the text `Not recorded`, as before. A grouped export used to have it as
  column A, with every other column one position further right; it now has
  the positions of the ungrouped export. A script that reads a grouped
  export by position must be adjusted. The ungrouped export keeps its 75
  columns in place.
- A number without a value is an empty cell instead of a text cell holding
  an empty string (`slope`, `r2`, `ci_low`, `ci_high`, `intercept`,
  `slope_se`, the rolling and endpoint numbers, `NumericValue`). A script
  that tests such a cell for `""` must test for an empty cell.
- Every sheet has its header row also when it has no rows (`events`,
  `aki_episodes`, `raw_measurements`, and the new sheets `rolling_windows`
  and `import_diagnostics`, which are empty in most exports).
- `fit_config` on the `settings` sheet no longer has the entry `xAxis`; a
  script that reads it no longer finds it. No fit ever used it. The `about`
  sheet states the time axis of the trend: years since `index_date`, where
  `intercept` applies.
- The Theil–Sen preset is written as `preset: theil_sen` in `fit_config`
  (formerly `custom`); the same values set by hand stay `custom`. No number
  changes. `theilSenConfig` of the library package returns the new id.

### Added (cohort export, decided 2026-11-21)

- The `cohort` and `slopes` sheets end with `first_eligible_value`,
  `last_eligible_value`, `sex`, `baseline_age` and `group`. The two values
  are the measurements at `first_eligible_date` and `last_eligible_date`:
  exact values before the first kidney transplant or chronic dialysis, the
  values `endpoint_percent_change` is computed from. They are filled with
  every preset and without a trend, and can differ from "latest" in the
  table, which also counts bounds and values after transplantation or
  dialysis.
- A sheet `columns` after `about` describes every column of the `cohort` sheet:
  meaning, unit and when the cell is empty.
- The `about` sheet of the cohort workbook ends with `app_version`,
  `exported_at` (UTC), `export_id` and `input_data_id`, an identifier of the
  imported measurements in the exported scope, so an archived file can be
  assigned to a version and two runs on the same data can be recognised.
  The identifier covers the rows of `raw_measurements` including the
  imported birth date; events, attributes and manual demographic entries
  are not part of it.
- `measurements` and `raw_measurements` end with `patient_birth_date`. In
  `raw_measurements` it holds the birth date of the imported lab row; in
  `measurements` it is empty (the resolved date is `birth_anchor` in
  `demographics`).
- The `about` sheet names the fixed parameters of segmented OLS, says what
  the preset name records, and lists the personal and source-related fields
  of the file (patient IDs as imported, the birth date estimated from age,
  the name of the imported file) with a request to check them before the
  file is passed on.

### Added (cohort models, after the persona review of 2026-11-21)

- A fitted model carries the notes of its input check: patients with a
  single measurement or with too few distinct measurement times, and
  repeated values at one time. These rows stay in the fit as before; the
  notes are shown in the model's details and exported in `models.warnings`
  and, for an applied projection, in the existing column
  `projections.warnings`, which was empty for such a model before. A script
  that tests `projections.warnings` for an empty cell must allow for these
  notes. No estimate changes.
- Without a categorical factor the fit summary names how many patients of
  the whole cohort have enough measurement times ("… 26 of 27.").
- The `models` sheet of the model workbook ends with the variance
  components, unrounded: `intercept_sd`, `slope_sd`,
  `intercept_slope_correlation`, `residual_sd`. They follow `unit_key`;
  earlier columns keep their positions.
- The `about` sheet of the model workbook ends with `app_version` and
  `exported_at` (UTC) and lists the personal and device-related fields of
  the file (patient IDs as imported, the browser's user agent) with a
  request to check them before the file is passed on.

### Changed (methodology page, wording awaiting the maintainer's approval)

- "Export & reproducibility" lists the sheets of the cohort-model workbook,
  explains `unit_key` and `export_id` and gives three steps to refit a model
  in R with the exported script. The table of the cohort workbook names the
  new `columns` sheet and the provenance rows of `about`.

### Changed (exports, after the persona review of 2026-11-21)

- The notice for restored settings that are shown as "Custom configuration"
  no longer names a time axis of the exported fit configuration, which the
  export no longer writes.
- Workbooks are written compressed. The demo cohort export shrinks from
  661 kB to about 250 kB, with the columns and sheets added in this release;
  the cells of the earlier sheets and columns are unchanged.
- A cohort workbook exported by the app can be loaded again as a dataset:
  the import reads `raw_measurements` as the lab sheet and accepts its
  `Date` and `Parameter` headers. It restores the exported patients and
  parameters as imported, with events, attributes and a birth date on the
  lab rows (`patient_birth_date`); derived values are computed anew, and
  settings and manual demographic entries are not restored. Times of day
  are not exported and therefore not restored (see the AKI section above).

### Fixed (start and lost connection, persona review of 2026-11-21)

- Importing a file after the connection was lost no longer blanks the page.
  The results table of the Cohort models page was a separately fetched file
  that the hidden page requested as soon as data were loaded; it is now part
  of the main bundle.
- A rendering error on the Cohort models page, or anywhere in the app, shows
  a message with "Retry" instead of an empty page. The loaded data stay.
- "Load demo data" without a connection says that the demo file could not be
  fetched from the app's address, instead of "Failed to fetch".
- Opening the built `index.html` from a folder (`file://`) in Chrome or Edge
  shows a notice instead of a blank page. There is no offline variant: the
  build needs a web server, and the README names a local start. The comment
  in `vite.config.ts` no longer names `file://` as supported.

### Added (network, privacy and storage notices, persona review of 2026-11-21)

- Next to the fit button, until R has been loaded in the session: the first
  fit downloads the R runtime from `webr.r-wasm.org` and R packages from
  `repo.r-wasm.org` (about 33 MB), and no measurements are sent. The message
  after a failed download names both hosts.
- Methods, "Data & eGFR": a section "Network access and local storage"
  describes which hosts are contacted and when, what they see, and the local
  copy.
- The Data page says that nothing is pseudonymised: patient IDs appear as
  imported on screen, in the saved copy, in exports and in export file names.
  The lab template text says the same for `patientId`.
- The status of a saved copy gives its save time and the time after which the
  next start removes it ("Saved on 2026-11-21 14:05; removed when the app is
  next opened after 2026-11-28 14:05"). The notice says in one line that the
  copy stays on the device until the app is opened again; the list of what
  is saved moved into "What is saved". The seven-day rule is unchanged.
- A tab whose saved copy was replaced or removed in another tab says so as
  soon as it is shown or focused again, instead of only with its next data
  change. Until then its status named the save and removal time of a copy
  that was no longer on the device.
- The build carries a Content-Security-Policy meta element: the page may load
  from its own address and, beyond it, only from the two webR hosts. It
  restricts the page itself, not the model worker, which takes its policy
  from response headers a static host does not send.

### Added (Cohort models: control over a running fit)

- A running fit can be cancelled. Models fitted before stay; nothing of the
  cancelled run is stored. Cancelling stops R, which loads again with the
  next fit.
- The notice that the first fit loads R is shown only until a fit has
  finished in the session.
- Changing "Data preparation" on the Cohort models page asks before it
  discards fitted models or stops a running fit. The other controls that
  discard models (model type, factors, the exclusions checkbox, settings
  under Trajectories) do not ask.

### Changed (charts, after the UI critique of 2026-11-17)

- Axis values in the overlay and the patient charts are round numbers (0, 20,
  40 …) instead of fractions of the range (96.9, 48.45, 0). The axis range is
  unchanged.
- In an overlay of more than eight trajectories the lines are drawn lighter,
  so crossings stay readable; the highlighted or hovered one stays solid.
- Clinical events are named in the chart's legend when they are drawn, and
  the AKI legend says that windows appear once a patient is highlighted.
- On a phone the text inside the charts is larger.

### Changed (Cohort models page, wording approved 2026-11-17)

- The page says what a cohort model is for, and the fit summary states the
  model in a sentence ("Average change of eGFR per year across 25 of 28
  patients …"). The R formula moved into "Preparation and fitting details".
- Model types are named "Whole cohort", "Separate model per group", "Adjusted
  for age and sex", "Difference between groups" and "Custom model"; factor
  effects read "Shifts the level" and "Shifts level and slope".
- The results table shows "Group", "Change per year" and "Starting level",
  each estimate with its 95% interval, and a note on how to read the
  intervals without a p-value. Engine, dataset and fit configuration are
  under "Technical record (for a methods section)"; the separate "Slope 95%
  CI" item in a model's details is gone, as the interval is in the table.
- With a factor on level and slope the sentence reads "Change of eGFR per
  year for the reference group …", since the value is then that group's
  slope.
- No model, estimate or export changes.

### Changed (analysis controls, after the UI critique of 2026-11-17)

- "Group by" is a select in the Trajectories toolbar, in the table and in the
  overlay, where it colours the trajectories by group. Grouping no longer
  needs the attribute to be shown as a column first. On a phone the select is
  hidden; grouping is set there from an attribute column's Sort menu.
- Grouping ends when an attributes import removes the grouping attribute;
  before, the table stayed grouped under one "Not recorded" section.
- The column menu is labelled "Sort" and the settings button "Settings";
  the chart size buttons carry the label "Chart size".
- The settings name the control "Time balancing", as the methodology page
  does (was "Aggregation"); the measurement list says "Available before time
  balancing". A column with its own settings reads "this
  parameter only" (was "Own settings").

### Changed (rapid-decline flag, decided 2026-11-17)

- **"rapid ↓" and `rapid_progression` are no longer set on a slope that
  carries the reliability note** (fewer than three fitted measurement dates or
  less than one year of fitted follow-up). Export values change:
  `rapid_progression` is blank where it was `yes` for such slopes. Slopes,
  intervals and `unstable_slope` are unchanged.
- A slope whose 95% interval includes zero shows the note "Interval includes
  0" in the table and the patient view. Display only.
- The methodology page describes the flag accordingly.

### Changed (Trajectories table, after the UI critique of 2026-11-17)

- With Trend on, the slope is the leading figure of a table cell: bold, with
  two decimals and its interval in brackets ("-6.20 ml/min/1,73m²/yr [-25.08,
  12.68]"). The latest value follows as "latest 49.5". Display only.

### Added (finding things, after the simulated-user case studies)

- Detected AKI episodes are listed with stage, onset, peak and baseline: on
  the Data page, in the patient view and in the new workbook sheet
  `aki_episodes`.
- The Data page lists the imported parameters with their value and patient
  counts and the patient attributes with their levels, and describes the
  formats the lab template expects.
- In the overlay the trajectory under the pointer or the keyboard focus is
  emphasised and named.

### Changed (Trajectories table, after the simulated-user case studies)

- A kidney-function slope that runs across values after a kidney transplant
  or chronic dialysis start, in a dated dialysis interval or in a detected
  AKI window now says so beside the slope ("Fit includes 3 values in an AKI
  window"). The slope itself is unchanged.
- The censoring and AKI exclusion options are offered in the settings of
  every eGFR and serum creatinine parameter, without first choosing the CKD
  progression preset.
- Ticking "Trend" draws the trend line in the same step. The slope in the
  table carries its unit, and the count beside it is the fitted one when
  that differs ("7 of 11 fitted").
- Warnings are shown as text badges by default; icons with tooltips remain
  under Display. Saved display settings keep their choice. Rapid decline has
  its own icon instead of the warning triangle.
- With AKI exclusion on, the patient view says when no AKI window applies to
  the patient. Under monthly or quarterly medians the count reads "n=8, 2
  quarterly medians fitted".
- Every parameter column names its preset and a monthly or quarterly
  aggregation. Without any Trend the status line says how to get slopes.
- Cohort models: when the settings of the parameter define no event or AKI
  windows, the page says that nothing is excluded and points to the CKD
  progression preset, instead of "applied; 0 eligible measurements excluded".

### Changed (wording outside the methodology page)

- The preset summary and two notes in the export's `about` sheet say
  "projection" instead of "prediction" and "time balancing" instead of
  "aggregation", as the methodology page does.
- The R reproduction script names the lme4 reference (Bates et al. 2015) in
  its header.

### Added (saved analysis settings, leaving the page)

- "Remember on this device" also saves the analysis settings of the
  Trajectories page: presets and own settings per parameter, the selected
  parameters, Trend and trend-line choices and the display options. After a
  reload the table is calculated as before. A stored setting that no longer
  fits this version or the dataset falls back to its default and is named in
  the restore notice. Cohort model settings and results are still not saved.
  The settings are kept in their own record: changing them does not extend
  the seven days of the saved dataset copy, does not rewrite the data and
  does not conflict with another tab on the same copy (for settings the last
  write wins). Choices for a computed eGFR parameter that the derivation does
  not produce at the moment are kept and apply again when it is back.
  Settings saved under a preset that has changed since are restored with
  their saved values as "Custom configuration"; results do not change, the
  exported fit configuration then names the preset "custom". Settings are
  written only when the user changes one (opening the page writes nothing),
  a copy saved without settings gets them with the first change, and a
  failed settings write is reported on its own without marking the dataset
  copy as unsaved.
- While a dataset is loaded and not saved on this device, the browser asks
  before the page is reloaded or closed. It does not ask for the bundled demo
  data as loaded; it asks once something was imported on top of them, a
  patient was edited or the eGFR derivation was changed.

### Changed (breaking for scripts that read the export)

- The export column `endpoint_percent_decline` is renamed
  `endpoint_percent_change` and now has the sign the badge shows: negative
  when eGFR fell, positive when it rose (first 50, latest 30: `-40`, formerly
  `40`). It keeps its position, so a script that reads by position gets the
  opposite sign without an error; a script that reads by name fails on the
  old name. The column is the total change from the first to the latest
  eligible value, not a rate per year and not the confirmed 40 %/57 % decline
  event. The `about` sheet says so.

### Changed (methodology page)

- The AKI page describes staging against the lowest value of the previous
  7 days, says that no earlier baseline is used, and gives the sustained-rise
  example as stages I, II, II and III. The Fits page says that Theil–Sen
  bounds on fewer than five dates are not a 95% interval.
- The methodology page follows the changes since the clinical review
  (wording approved by the maintainer on 2026-11-16): which creatinine series
  count as serum creatinine and which series supplies a column's AKI episodes;
  the plausibility warnings; CKD-EPI 2009 (race-free) with its citation; what
  "converted automatically" covers; AKI exclusion in the decline baseline and
  the G5 projection; minimum counts in dates, five for Theil–Sen; the badges
  `G5 < 3 dates`, `G5 < 5 dates`, `G5 < 1 yr` and `G5 not projected after
  KRT`; what the intervals of OLS and of cohort models assume; what the
  projection assumes; and what "kidney failure reached" means here.
- New on the page: a table of the settings that change which measurements are
  fitted, with when to consider them, and a list of the rules of this tool
  that are not published standards.
- "Projection" replaces "prediction" in the headings, navigation and text of
  the page ("Endpoints & projection", "Projection algorithm"). Links to
  `#methods/endpoints/prediction` keep working.

### Changed (interface wording, 2026-11-16)

- The projected age at CKD G5 is shown as a whole number marked as
  approximate on either age basis (`G5 @ ~64y` instead of `G5 @ 63.5y`),
  because the projection has no interval. The export keeps the unrounded
  value.
- The settings heading reads "AKI exclusion windows" instead of "AKI
  exclusions (KDIGO)", with the hint that episodes are detected with the
  KDIGO creatinine criteria and the window length is a rule of this tool. The
  endpoint hint says "Endpoints and projection".

### Changed (AKI staging, 2026-11-16)

- AKI stages are graded against the lowest creatinine of the seven days
  before a crossing, whichever criterion detected it; an episode reports the
  highest stage of its crossings. Before, a crossing detected by the 0.3 mg/dl
  criterion was graded against the 48-hour minimum, so 1.0, 1.2 and 3.2 mg/dl
  on days 0, 3 and 4 gave stage II instead of III. Stages can be higher than
  before, never lower. Detection, episode grouping, onset dates, exclusion
  windows, slopes and endpoints are unchanged; AKI chips, marker labels and
  the `aki` export column can change. No stage in the demo workbook changes.
- The AKI marker tooltip names the value and the seven-day reference that
  give the stage ("staged against 1 mg/dl, the lowest value of the 7 days
  before") instead of the detection baseline, which no longer explained it.
  Episodes carry these as `stageValue`, `stageDate`, `stageReferenceValue`
  and `stageReferenceDate`.

### Changed (Theil–Sen interval label, 2026-11-16)

- For a Theil–Sen fit on fewer than five distinct dates the table and the
  patient view label the bounds `Slope range` instead of `95% slope CI`. A
  hint printed under the bounds says why and gives the coverage for one
  measurement on each of three or four dates (about 67 % or 92 %). The values
  of `ci_low` and `ci_high` are unchanged; the workbook's `about` sheet
  carries a note.
- The `cohort` and `slopes` sheets end with a new column `n_fitted_dates`
  (distinct fitted dates), so rows affected by that note can be identified.
  Earlier column positions are unchanged.

### Fixed (defects found in the simulated-user case studies)

- Cohort models: with a factor that changes the slope, the chip above the model
  plot reads "Whole cohort, reference profile" (or the group name with that
  suffix). It showed the reference profile's slope under the plain unit name.
- Cohort models: "Patients not in the model" under the formula lists every
  patient behind the complete-case count, including patients without a usable
  measurement of the outcome. Before, only patients removed for a factor value
  were listed, so "25 patients / 28" could stand next to one listed patient.
  When no model rows exist because the data preparation is No fit, the reason
  is stated once instead.
- Cohort models: the status column says "Fitted" instead of repeating the
  slope, and the progress text says that the first fit downloads R once.
- R reproduction script: `mm_workbook` carries the name of the downloaded file
  (`cohort-models-<timestamp>.xlsx`) instead of `cohort-models.xlsx`. The
  workbook's `about` sheet and the script share an export id, and the script
  stops when the workbook it opens is another export (the browser renames a
  second download in the same minute).
- Trajectories: a column that loses its trend through a no-fit setting (for
  example Acute review) gets Trend and its shown trend lines back when it has a
  fit method again, whichever control or page sets it. Before, Trend stayed off
  and every row showed "G5 no fit".
- Import diagnostics of a CSV file name the file instead of "Sheet1"; a
  workbook with several sheets keeps its sheet names.

### Changed (texts after the simulated-user case studies)

- Overlay: "Inspect events" shows how many events of the shown patients are
  plotted ("7 of 8") and says why the others are not listed. The patient view
  counts only that patient's events.
- Data page: the eGFR preview names the other serum creatinine series that the
  selected source leaves out, with their value counts, and the import summary
  counts values recorded as a bound (exactly those with "<" or ">").
- Endpoint badge: a total fall of 40 % or more without a confirmed 40 % decline
  event says in its tooltip why the event is not confirmed. The "G5 no fit"
  tooltip says that no slope was fitted for the parameter.
- Restoring a dataset saved on this device shows a notice that says what was
  restored and what is not saved.
- Export `about` sheet: only eGFR series whose name ends in ", computed)" are
  described as calculated by the app.

### Fixed (endpoint settings hint)

- The endpoint hint in the analysis settings no longer says that AKI exclusions
  do not apply to endpoints. It now says that excluded AKI windows are also left
  out of the decline baseline and the G5 projection, as implemented since the
  endpoint-input change.

### Added (interface text, 2026-11-16)

- The Data page explains next to the example files that the demo workbook
  mirrors a German laboratory export (German test names, sex codes "w" and
  "m", decimal commas) and that English test names, "male" and "female", and
  decimal points are read the same way. The demo data are unchanged.
- The endpoint settings name "advanced CKD (aCKD)" as a common term for a
  confirmed eGFR below 30 (CKD G4). Labels, badges and export columns keep
  "CKD G4".

### Fixed (interface text, 2026-11-16)

- The `G5 < 5 dates` tooltip now says that the 67 % and 92 % coverage of the
  Theil–Sen interval holds for one measurement on each of three or four dates.

### Fixed (release review, 2026-11-15)

- Creatinine names with the abbreviation "u." for "und" between two blood
  materials (Serum, Plasma, Vollblut, HP, S, P) or in "vor u. nach", such as
  `Kreatinin im Serum u. Plasma` or `Kreatinin vor u. nach Dialyse`, count as
  serum creatinine again. A lone `U` next to any other word stays urine.
  `Kreatinin [U]` and `Kreatinin:U` are recognised as urine.
- When AKI windows removed measurements from a G5 projection, the detail text
  of the withheld-projection badges says so and speaks of the measurements
  used, instead of describing the series as having too few dates or too short
  a span. Cells that lost no measurement to an AKI window keep the plain text.
- Cohort model workbook: sheets and columns keep their 0.3.7 positions (new
  sheets follow `about`; `std_error` and `unit_key` are the last columns of
  the earlier sheets, also when rows differ in shape), and `unit_key` is on
  every sheet that names a fitted unit.
- Loading and re-analysing large datasets is fast again: AKI detection no
  longer scans every patient's rows for each series.
- The Cohort models page no longer shows an empty "patients per level" list
  when no patient has complete factor values.
- `isUnstableSlope` in the library package flags fewer than three fitted
  points even when called without `nFittedDates`.
- `pnpm test:kidney` no longer relies on a glob that only Node 21 and later
  expand: a small runner starts every `*.node.mjs` test of the package.

### Changed (creatinine source and AKI, issue #34)

- Creatinine in urine (`i.U.`, `U.`, `/U`, `SU`, `24h-SU`, `SPU`, `U-`),
  dialysate (`PD`), puncture fluid (`PU`), CSF, drains, seroma, lymph,
  secretions and other body fluids is no longer treated as serum creatinine:
  it is no eGFR source and no AKI detection input.
- A computed eGFR column takes its AKI episodes and windows from the
  creatinine series it was computed from, not from the patient's creatinine
  series with the most rows.

### Added (creatinine source and AKI, issue #34)

- The Data page warns about serum creatinine above 25 mg/dl and computed eGFR
  above 200 mL/min/1.73 m². Values are not changed.
- The Data page explains when the selected creatinine source (for example from
  a saved session) is not serum creatinine and therefore computes no eGFR.

### Changed (endpoint and projection input, issue #34)

- Endpoint input (issue #34): a column that excludes AKI windows from its fit
  now also leaves them out of the decline baseline and the G5 projection fit,
  so a terminal AKI admission no longer produces a projection or a misplaced
  decline baseline; observed G4/G5, total change and decline events still use
  every eligible row. `endpoint_input_policy` records the exclusion. The G5
  projection needs measurements on three distinct dates, five under
  Theil–Sen (new reason `theil_sen_insufficient_points`, badge `G5 < 5 dates`),
  and the slope reliability rule counts distinct dates instead of rows
  (new note "< 3 dates, uncertain slope"). The projection badge for too few
  dates reads `G5 < 3 dates` (formerly `G5 n < 3`).

### Added (eGFR formula)

- The eGFR formula selector offers CKD-EPI 2009 (creatinine, without the race
  coefficient) next to CKD-EPI 2021, MDRD-4 and EKFC 2021, labelled
  `CKD-EPI 2009 (race-free)`. Its series is named
  `eGFR (CKD-EPI 2009 (race-free), computed)`. The default stays Off and
  existing values are unchanged.

### Fixed (eGFR formula)

- The Data page names the active eGFR formula by its label (`CKD-EPI 2021`)
  instead of its internal key (`ckd-epi-2021`).

### Added (cohort export)

- The cohort and patient slope sheets append `index_date`, `last_fitted_date`,
  `first_eligible_date`, `last_eligible_date`, `intercept` and `slope_se` (OLS
  only) after the rolling columns. Values come from the existing fit; no
  estimate changes.

### Added (cohort models)

- Cohort models check factor levels before fitting. A factor with level and
  slope fails with a message naming the level (or numeric factor) whose
  patients give no time variation, instead of R's generic rank-deficiency
  error. The Model Studio lists patients and qualifying patients per level.

### Fixed (cohort export)

- The patient measurement record helper formats dates from their UTC calendar
  day instead of the local one, which was a day early west of UTC. The workbook
  export already overwrote that field with the UTC date, so exported files are
  unchanged.

### Added (model export for R)

- The cohort model workbook can be reproduced in R: `model_rows` holds the rows
  each fit received, `model_input_flags` shows for every measurement whether it
  entered, was aggregated into a median or why it was excluded, `coefficients`
  gains standard errors, `vcov` holds the fixed-effect covariance matrix, and
  `r_script` refits the models with the same lme4 call.

### Changed (model export for R)

- Cohort-model estimates, intervals and variance parameters are stored and
  exported at full precision instead of four decimal places (owner decision
  OD-30, 2026-11-13). Values move in the fifth decimal and beyond; slopes
  between 1e-5 and 5e-5 per year are no longer stored as 0. Results saved
  before keep their rounded values until refitted.
- Non-reference factor levels are ordered by code point in R as in the
  browser (`sort(method = "radix")`), so the coefficient order no longer
  depends on the R locale.
- The model workbook's `about` sheet notes that readxl may read the `group`
  column of `model_rows` as logical; set `col_types` or `guess_max`.

### Added (kidney package)

- `packages/kidney/`: the kidney-function core as an unpublished ESM library with
  type declarations, built with `pnpm build:kidney` and tested against the
  build with `pnpm test:kidney`. It re-exports `src/core` unchanged; no numeric
  change. The app's cohort pipeline is not exported; it may return with the
  deferred MCP server (#42).

### Changed (kidney package)

- The exact-birth-date rule for endpoint projections, the demographics
  warnings per patient and the column order of the cohort export sheet moved
  from the workspace into `src/core` (`patientBirthAnchor`,
  `exactBirthDateByPatient`, `demographicWarningsByPatient`,
  `cohortSheetRecord`), so the app and the package share them. No behaviour
  change.

### Changed (documentation, issue #44)

- The method reference is split into topic files under
  `docs/method-algorithms/`. `docs/method-algorithms.md` stays as the index
  with the reading conventions, the contents and the decision lists. Text was
  moved only; no rule, value or example changed. `node
  scripts/check_doc_links.mjs` checks the relative links and heading anchors
  of the Markdown files.

## [0.3.7] - 2026-10-15

### Added

- Patient attributes can be shown as independent table columns without changing
  patient order. Their widths follow the content, with column sorting and
  optional grouping through each attribute column's context menu.
- Direct per-parameter trend activation, method selection, line visibility and
  contextual settings in the table, overlay and individual patient views.
- Direct S/M/L chart controls and column menus for explicit sort metrics and
  directions, including keyboard access.

### Changed

- The trajectory table starts with minimal cell details and icon explanations;
  AKI retains its short pill. Full details and text warnings remain available.
- Shared preparation defaults offer general presets. Specialist presets create
  independent parameter settings in Trajectories and Cohort models. Optional
  UI adapters keep domain configuration out of the common settings editor.
- Trend calculation is independent of line visibility. Analysis starts disabled;
  hiding a calculated line retains its slope and export results.
- The toolbar and selection dialogs use less space. Whole selection rows remain
  clickable, touch targets stay larger, and Escape dismisses dialogs and menus.
- Cohort preparation identifies its scope and announces changes. Mobile workspace
  navigation keeps all four destinations together.

### Fixed

- Switching an eGFR derivation retains active analysis, line visibility and
  parameter settings. No-fit selections clear obsolete slope sorting.
- Parameter-picker rows no longer collide with search or action buttons, and
  settings links close the modal before navigating to Methods.

## [0.3.6] - 2026-10-14

### Added

- Cohort models have a *Data preparation* select with the presets offered
  under Trajectories. It changes the same settings Trajectories uses (the
  parameter's own settings, otherwise the shared ones, as a note under the
  select says), so a parameter set to "No fit" can be made fittable without
  leaving the page.
- The Trajectories table has a *Cell details* option. *Compact* shows the
  measurement count with fitted count and span, the slope and the quality label
  per cell, and moves rolling windows, slope CI, quality explanation, endpoint
  details and exclusions into one *Details* disclosure.
- Unapplied projection settings are previewed below the projection controls
  with the remaining years per enabled target, computed like the applied
  table. The table and the export still show the applied settings.

## [0.3.5] - 2026-10-13

### Fixed

- Subgroup comparison states before fitting how many patients each group
  contributes, and says plainly when no group reaches the ten-patient minimum;
  the action then reads "Fit whole cohort only" instead of suggesting a
  comparison.
- The demo data can show every cohort model preset: fourteen synthetic patients
  (15-28) and attributes for patients 1, 2, 4 and 6 give cohort A 12 and
  cohort B 10 patients, and both sexes at least 12. Golden fixtures are
  unchanged.

### Changed

- Interface text no longer strings items together with middle dots. Counts are
  separated by commas, card titles are numbered "1.", additions such as
  "(derived)" or "(own settings)" use brackets, chart titles use a colon, and
  the footer and export notes are full sentences. A few phrases were tightened
  at the same time: shorter eyebrows, cell summaries such as "8 measurements,
  latest 23/09/2023" and "8 fitted measurements over 630 days", and endpoint
  tooltips as one sentence per item. The slope-quality labels now read "n < 3,
  uncertain slope" and "Follow-up < 1 year, uncertain slope".
- A table cell without dated measurements shows one line, "No numeric
  measurements with a date", instead of five lines repeating that nothing can be
  fitted. Event-based badges such as AKI or kidney failure reached stay visible.

## [0.3.4] - 2026-10-12

### Fixed

- Cohort models no longer open on an unfittable parameter. The preselection
  takes the first parameter, eGFR first, that passes the model's preparation and
  validation with the standard model, and is re-evaluated when the data change
  until a parameter is chosen by hand.
- The demo workbook now carries imported eGFR for 11 of 14 patients, so a
  cohort model can be fitted with the default settings. The added rows are
  CKD-EPI 2021 values from the same-day creatinine; no fixture values moved.
- Muted text, eyebrows, table headers, the dataset bar and the research-use
  footer now meet WCAG AA contrast (at least 4.5:1).
- Counts use the singular where it applies ("1 row rejected", "1 patient"), and
  table cells name exclusion reasons in words instead of internal codes.
- An import with rejected rows is reported in the warning style, not as success.
- Table cells without any measurement no longer show a "G5 n < 3" badge.

### Changed

- Trajectories has a "Show trends and slopes" switch next to the view choice;
  the per-parameter choice stays under Display and analysis.
- Analysis setting headings follow the page outline, long paragraphs are
  limited to a readable line length, and the duplicate guide line below the
  navigation was removed.
- Cohort models uses the workspace colours and type instead of a separate dark
  palette with emoji presets. The studio holds the only Fit model action; after
  a current fit it reads "Refit model". The preview card shows a guidance line.
- Cohort result tables round slope and intercept like the chart legend, so the
  same estimate no longer shows as −9.98 in one place and −9.99 in the other.
  Display only; exported values are unchanged.

## [0.3.3] - 2026-10-11

### Changed

- Replaced the long Methods reference with nine linked topics, a desktop
  sidebar, a mobile topic menu and expandable calculation details. Existing
  scientific rules, examples and sources remain available in their topics.
- Added contextual help links for eGFR, fit selection, AKI windows, endpoints
  and cohort models, plus tables for model selection and result interpretation.
- UX review improvements keep topic controls and workspace return actions
  reachable on long articles, reveal calculation groups independently, bring
  troubleshooting links before the guide and preserve readable table columns
  in named, keyboard-accessible scroll regions.

### Fixed

- Help URLs now survive reload, synchronize with browser history, reveal linked
  calculation details and retain patient views when navigating between topics.
- The skip link preserves the selected help URL and topic.

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
