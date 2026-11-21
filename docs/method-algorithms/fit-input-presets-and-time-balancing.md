# Method reference: Fit input, presets and time balancing

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Fit pipeline and fit-input selection

This section describes how an individual display fit selects its input and
what the counts next to a slope mean. The same prepared points feed the patient
table, the patient chart, the cohort overlay and the workbook export; nothing is
refitted for export. Endpoint evaluation and individual endpoint prediction
select their input separately (see "Observed endpoints and individual prediction").

### Series identity and fit candidates

A series is one patient, one parameter name (`bezeichnung`) and one unit
(`einheit`) as stored after import. Rows with a different name or a different
unit are never pooled into one fit. A row is a fit candidate when it has a date
and a numeric value. Rows without a date or without a numeric value are never
fitted.

Imported dates are calendar days at midnight UTC; a time of day in the source
is not part of the date and no fit reads it. Two measurements taken on the same day therefore carry an
identical timestamp. Points are sorted by date before every calculation; rows
on the same date keep their source order.

### Order of operations

`summarizeByBezeichnung` (`src/core/stats/summarize.ts`) and the trend-line
path (`buildCohortRows`, then `buildSlopeLines` in
`src/core/stats/slopeLines.ts`) apply the same five steps in the same order;
for the line, step 1 is done by `buildCohortRows` before it calls
`buildSlopeLines`:

1. Exact rows only. Every row whose operator is not `=` is removed by operator,
   not by date. These are the bounds `<` and `>` (see "Bounded measurements")
   and, with pre-parsed value columns, numeric rows whose operator is `range`
   or unrecognised. An empty operator cell beside a number is exact.
2. Censoring windows. Points inside any censoring window of the series are
   removed. These windows come from clinical events under the column's
   censoring options.
3. Fit-exclusion windows. Points inside any fit-exclusion window are removed.
   These are the AKI windows when the column excludes them.
4. Time balancing. The remaining points are aggregated per calendar month or
   quarter when the column asks for it (see "Time balancing").
5. Fit. The estimator selected by the fit model runs on the result.

Steps 2 and 3 have the same effect on a point; the two classes differ only in
which module supplies them and in the reason recorded for the excluded point.
Because balancing runs after both, a value inside a window never contributes to
a monthly or quarterly median.

### Window semantics

`src/core/exclusions/windows.ts` defines what "inside a window" means for every
caller. A window has a start and an end. A point is inside when
`start <= date <= end`; both bounds are inclusive. A window whose end is absent
is open-ended and contains every date from its start on, including the start
date. A point inside at least one window is excluded once, however many windows
contain it. A fixed-length window of N days is `[start, start + N days]`, so it
covers N + 1 calendar dates; with N = 0 it still contains the start date.

### Fit axis

The regression x value is always elapsed time in years from the first fitted
point (see "Ordinary least squares"). Every slope is therefore in value units
per year. The chart axis control (age, calendar date, time since first
measurement) changes the drawing only. The `xAxis` value stored in a preset is
metadata: no fit and no chart reads it, and the mixed-model result identity
(`mixedModelFitConfigHash`) does not include it. Since 2026-11-21 (owner
decision) the exported `fit_config` leaves the entry out, and the `about`
sheet states the time axis instead: years since the first fitted measurement,
whose date is `index_date`, at which `intercept` applies. Until then the
export wrote `xAxis: age` for the CKD progression preset and
`xAxis: calendar_time` otherwise, which read as if the trend had been fitted
on age. Example: slope −8.50 per year and intercept 67.20 with
`index_date = 2019-02-01` and a baseline age of 67 mean a fitted value of
67.20 on 2019-02-01, not 67.20 − 8.50 · 67 at age 67.

### Fit model and slope mode

The column's fit model selects a slope mode (`modeForFitModel`) and the
estimator that produces the reported scalar slope (`scalarFitModelFor`). Both
are exported, as `slope_mode` and `fit_model`.

| Fit model setting | Slope mode | Scalar estimator (`fit_model`) |
| --- | --- | --- |
| `none` | `global` | `none` |
| `ols` | `global` | `ols` |
| `theil-sen` | `global-robust` | `theil-sen` |
| `rolling-ols` | `rolling` | `ols` |
| `segmented-ols` | `gap-split` | `ols` |

With `none`, no fit runs: slope, R² and confidence bounds are unavailable, the
fitted count is zero and no trend line exists.

### Counts and spans

| Field | Export column | What it counts |
| --- | --- | --- |
| `nNumeric` | `n` | Dated numeric rows of the series, non-exact rows (bounds and other operators than `=`) included, before any window or balancing. |
| `spanDays` | `span_days` | Whole days between the first and last of those rows; 0 when there is none. |
| `nFitted` | `n_fitted` | Points handed to the scalar fit after steps 1 to 4. One monthly or quarterly bin counts as one point. |
| `fittedSpanDays` | `fitted_span_days` | Whole days between the first and last of those fitted points; 0 with fewer than two. |
| `nFittedDates` | none | Distinct UTC calendar days among those fitted points (since 2026-11-05). Read by the slope reliability rule only. |

Day counts are elapsed milliseconds divided by 86 400 000 and truncated towards
zero. `nFitted` is 0 when the fit model is `none`. When the series has fewer
than two exact rows, `nFitted` is the number of exact rows left after both
window classes (0 or 1) and `fittedSpanDays` is 0. Under balancing,
`fittedSpanDays` is measured between the representative dates of the first and
last bin, so it can be shorter than the span of the measurements that entered
those bins. `nFitted` is reported even when the estimator then returns no
slope.

Example: eight raw values in two calendar quarters under quarterly medians give
`nNumeric = 8` and `nFitted = 2`. Three raw values on 2020-01-01 and one on
2021-01-01 without balancing give `nFitted = 4` and `nFittedDates = 2`.

### Fit dates, intercept and slope standard error

Since 2026-11-05 the `cohort` and `slopes` sheets carry seven further
columns (`n_fitted_dates` since 2026-11-16), placed after the rolling columns so that earlier column positions are
unchanged; five more follow them since 2026-11-21 (next section). They are read from the existing fit; nothing is refitted.

| Column | Content | Blank when |
| --- | --- | --- |
| `index_date` | Date (`YYYY-MM-DD`, UTC) of the first point the scalar fit consumed: the time origin `t0`, at which `intercept` applies. Under balancing it is the representative date of the first bin; in `chronic-ckd` the first point after the run-in; in `event-driven` the first point of the reported segment. | no point was fitted (`n_fitted = 0`, fit model `none` included) |
| `last_fitted_date` | Date of the last point the scalar fit consumed, with the same conventions. With one fitted point it equals `index_date`. | as `index_date` |
| `first_eligible_date` | Date of the first row of the same row set as `last_eligible_date` (added 2026-11-13, owner decision). Run-in, fit windows and balancing do not move it, so it can be earlier than `index_date`. It serves as a data-based start for time-to-event work; a study-specific index date is set in the analysis itself. | as `last_eligible_date` |
| `last_eligible_date` | Date of the last exact, finite, dated row of the series before the first kidney transplant or chronic dialysis and outside complete acute dialysis intervals (the event rules of "Observed endpoints and individual prediction"; boundary dates as there). Only these event rules apply: no fit exclusion window (AKI windows included), run-in or balancing. It is filled for every column and fit model, also where endpoints are not evaluated. | the series has no such row |
| `intercept` | Fitted value of the display fit (the fit behind `slope`) at `index_date`, unrounded (OLS: `ȳ − slope · x̄`; two-point line: the first value; Theil-Sen: separate-median intercept). | the estimator returns no slope |
| `slope_se` | OLS standard error of the slope, `SE = sqrt(SSres / (n − 2) / Sxx)` from "95 % confidence interval for the slope", unrounded; `ci_low = slope − t · SE`. | Theil-Sen (no standard error is defined; its bounds are rank-based), the exact two-point line (`n − 2 = 0`), and every case without a slope |
| `n_fitted_dates` | Number of distinct calendar dates among the points the scalar fit consumed (`nFittedDates`); `n_fitted` counts the points. For a Theil-Sen fit a value below 5 means that `ci_low` and `ci_high` are not a 95 % interval (see "Label of the bounds" under Theil-Sen). Example: three values on 2020-01-01 and one on 2021-01-01 give `n_fitted = 4` and `n_fitted_dates = 2`. | never; `0` when no point was fitted |

Rolling and segmented OLS report the global OLS fit, so these columns describe
that fit, not a window or segment. Example: the worked OLS example dated
2020-01-01 to 2023-01-01 exports `index_date = 2020-01-01`,
`last_fitted_date = 2023-01-01`, `intercept = 60.203774` and
`slope_se = 0.283741` (half-width 1.220837 / t 4.30265273). Adding values on
2023-02-01 and 2023-03-01 under quarterly medians gives one bin dated
2023-02-01, so `last_fitted_date = 2023-02-01` while
`last_eligible_date = 2023-03-01`; a value after a kidney transplant on
2023-06-01 changes neither. With AKI windows excluded from the fit, creatinine
values of 1.0, 1.1, 1.05 and 1.15 mg/dl up to 2020-07-30, then 2.4 on
2020-08-01 and 1.8 on 2020-08-10, give `last_fitted_date = 2020-07-30` and
`last_eligible_date = 2020-08-10`. Values of 62, 60 and 61 on 2020-01-05,
2020-02-01 and 2020-03-01, then 56, 50 and 46 on 1 January 2021 to 2023,
under quarterly medians (CKD progression) give one 2020 Q1 bin dated
2020-02-01: `index_date = 2020-02-01` and `first_eligible_date = 2020-01-05`.
A kidney transplant before the first value leaves both eligible dates blank.
Evidence: [export record tests](../../tests/core/cohort/exportRecords.test.ts).

### First and last eligible value, sex, baseline age and group

Since 2026-11-21 (owner decision) five further columns follow
`n_fitted_dates`, again at the end so that earlier positions are unchanged.

| Column | Content | Empty when |
| --- | --- | --- |
| `first_eligible_value` | Measured value of the row dated `first_eligible_date`, unrounded, in the unit of the parameter. | the series has no eligible row |
| `last_eligible_value` | Measured value of the row dated `last_eligible_date`. | as above |
| `sex` | The patient's resolved sex as the analysis uses it (`m`, `w` or `d`; see [demographics](demographics.md#demographics-resolution)). | no sex could be resolved |
| `baseline_age` | The patient's resolved age in completed years at the earliest dated row of any parameter: the value of the `demographics` sheet. It is not the age at `index_date`. | no age is available |
| `group` | Value of the attribute the Trajectories table was grouped by. A patient whose value is missing, empty or only whitespace has the text `Not recorded`, the label of that section of the table; an attribute value of the same text cannot be told apart from it. | the table was not grouped |

The two values come from the same row set as the two dates: exact, finite,
dated rows before the first kidney transplant or chronic dialysis and outside
complete acute dialysis intervals, in the stored row order (ascending date; of
several rows on one date the first stored row supplies the first value and
the last stored row the last value). They are filled for every parameter, fit
model and preset, also with fit model `none` and where endpoints are not
evaluated. Bounds never supply them. `endpoint_percent_change` is computed
from exactly these two values where it is evaluated:
`(last_eligible_value − first_eligible_value) / first_eligible_value · 100`.

The Trajectories table shows "latest" from a different rule: the last dated
numeric row of the series, bounds and rows after kidney replacement therapy
included. The two can therefore differ by design. Examples: eGFR 55, 48, 42,
35, 29 and 24 up to 2022-06-10, a kidney transplant on 2022-07-01, then 72, 68
and 64 give `first_eligible_value = 55`, `last_eligible_value = 24`,
`last_eligible_date = 2022-06-10` and `endpoint_percent_change =
(24 − 55) / 55 · 100 = −56.36`, while the table shows "latest 64". Values 34,
27, 21, 17 and then `<15` give `last_eligible_value = 17`; the table shows
"latest 15". `sex` and `baseline_age` repeat on every row of the patient.

`group` was the first column of a grouped export until 2026-11-21, which
moved every other column one position to the right. It is now always present
and always the last column, so a grouped and an ungrouped export have the
same 80 columns in the same positions; the 75 columns of the ungrouped export
of 0.3.7 keep theirs. The file does not record which attribute was used for
grouping.

Evidence: [export record tests](../../tests/core/cohort/exportRecords.test.ts),
[workbook schema tests](../../tests/workspace/export-schema.test.ts).

### Workbook sheets, column names and empty cells

The cohort workbook has these sheets, in this order: `measurements`,
`raw_measurements`, `cohort` (`slopes` in a patient export), `events`,
`aki_episodes`, `patient_attributes`, `demographics`, `parameters`,
`settings`, `about`, `columns`, `rolling_windows`, `import_diagnostics`.
Since 2026-11-21:

- **Fixed column lists.** Every sheet is written with its column list, so a
  sheet without rows (no event, no AKI episode, no imported row in scope) has
  its header row. `patient_attributes` has `PatientID` and one column per
  attribute name in sorted order; `settings` has one column per configurable
  module setting. New columns and sheets are appended; existing positions
  stay (the rule of 2026-11-15 for the model workbook).
- **Patient ID.** The column is `PatientID` in every sheet that has one. In
  `events`, `patient_attributes` and `demographics` it was `patientId` before.
  The cell has the type the import gave the ID: a number when the ID is a
  numeric text that survives a round trip unchanged (`12`, not `012`),
  otherwise text. `patient_attributes` wrote text for every ID before, so a
  join with `cohort` on a numeric ID found no match in tools that compare
  types strictly. A dataset that mixes both kinds of ID (`7` and `A12`) still
  has both cell types in the column.
- **Measurement sheets.** `measurements` and `raw_measurements` end with
  `patient_birth_date`, after `demographics` and `loinc`. In `raw_measurements` it is the
  birth date read from the imported lab row (`YYYY-MM-DD`, empty text when
  the row had none); in `measurements` it is always empty text. It exists so
  that a re-import keeps an exact birth date (see
  [the import rule](import-and-values.md)).
- **Empty cells.** A number without a value (`slope`, `r2`, `ci_low`,
  `ci_high`, `intercept`, `slope_se`, the `rolling_*` numbers, the numeric
  endpoint columns, `baseline_age`, and `NumericValue` on the measurement
  sheets) is an empty cell. Before, it was a text cell holding an empty
  string, which made the column text for readers that infer types. Text and
  date columns without a value still hold an empty string.
- **`settings`.** One row per exported parameter: `mode` (the slope mode),
  `fit_config` (the column's fit configuration as JSON: `parameter`, `preset`,
  `censoring`, `exclusions`, `timeBalancing`, `fitModel`, `endpoints`; no
  `xAxis`, see "Fit axis"), the module settings, `analysis_settings`,
  `patient_ids`, `source_file` and `scope`.
- **`about`.** One column `note`. Rows are appended, never moved. Since
  2026-11-21 it explains the time axis of the trend, the meaning of `preset`
  and the fixed parameters of segmented OLS (a gap of more than 180 days, at
  least 3 points per segment), lists the personal and source-related fields
  of the file (patient IDs as imported, `birth_anchor`, `patient_ids`,
  `source_file`) with a request to check them before passing the file on,
  and ends with four provenance rows of the form `key: value`:

  | Key | Value |
  | --- | --- |
  | `app_version` | version of the app that wrote the file (`package.json`), for example `0.3.7` |
  | `exported_at` | time of the export, ISO 8601 in UTC with milliseconds, for example `2026-11-21T13:14:15.000Z` |
  | `export_id` | a random UUID (version 4), new for every export |
  | `input_data_id` | identifier of the imported rows in the exported scope (below) |

  `input_data_id` (`inputDataId`) is computed from the rows of
  `raw_measurements`: the imported rows of the exported patients and
  parameters. Each row is reduced to the JSON array of patient ID as text,
  `Date`, `Parameter`, `Unit`, `Value` (the text as imported), `patient_sex`
  (empty text when absent), `patient_age_at_lab` (`null` when absent) and
  `patient_birth_date` (empty text when absent). The
  arrays are sorted as text by UTF-16 code units, joined with commas inside
  `[` and `]`, and hashed with 32-bit FNV-1a over the UTF-16 code units
  (offset basis `0x811c9dc5`, prime `0x01000193`), written as eight lower-case
  hex digits. The identifier does not depend on the row order, the fit
  settings, events, attributes, manual demographic entries or the app
  version; it changes with any of the eight fields and with the exported
  scope. It is a checksum for comparing runs, not a cryptographic hash: two
  different inputs can share a value (about 1 in 4.3 thousand million per
  pair). Example: patient 7, creatinine in mg/dl, sex `w`, stated age 54, no
  birth date, with `1.2` on 2024-01-15 and `<1.0` on 2024-07-15 gives
  `d2196115` in either row order; with `1.0` instead of `<1.0` it gives
  `bf80cedd`. The birth date is part of the identifier because a file with
  birth dates and a file with the same ages in whole years resolve to
  different birth-date anchors. The
  `datasetHash` of the model workbook is a different quantity: a hash of the
  prepared model rows.
- **`columns`.** The sheet after `about` describes the columns of the `cohort` (or
  `slopes`) sheet, one row per column in sheet order: `column`, `meaning`,
  `unit`, `empty_when`. The export fails rather than write a column that has
  no entry. The other sheets have no directory.

Evidence: [workbook schema tests](../../tests/workspace/export-schema.test.ts),
[settings and provenance tests](../../tests/workspace/export-provenance.test.ts).

### Rounding

The core does not round. Slope, intercept, R² and confidence bounds are
double-precision values, and the workbook export writes them unrounded. Only
day counts are truncated to whole days. The interface formats numbers for
display; that formatting does not feed back into any calculation.

### Trend line

`buildSlopeLines` draws each fitted line as two points: the first fitted point's
date at the fitted intercept, and the last fitted point's date at
`intercept + slope * elapsed years`. The line covers the fitted span only and is
not extrapolated. It bridges excluded windows that lie between fitted points.
Under balancing, the line starts and ends at representative bin dates. No line
exists when the fit model is `none`, when the series has fewer than two exact
rows, when the estimator returns no slope, or in the `rolling` mode (see
"Rolling and segmented OLS"). Showing the fit for a column is a display toggle;
summaries and exports are computed whether or not it is on.

Regression evidence: [summary tests](../../tests/core/stats/summarize.test.ts),
[slope-line tests](../../tests/core/stats/slopeLines.test.ts),
[censored measurement tests](../../tests/core/censoredMeasurements.test.ts),
[event exclusion tests](../../tests/core/events/fitExclusions.test.ts) for
the inclusive start bound, and
[export record tests](../../tests/core/cohort/exportRecords.test.ts) for
`slope_mode`, `fit_model` and the fitted count behind `unstable_slope`.
`src/core/exclusions/windows.ts` has no test file of its own and is exercised
through these tests. No dedicated regression test covers the fixed-length
window with N = 0, a point exactly on the end date of a window, the `n_fitted`
and `fitted_span_days` export columns,
unrounded export values, or the fact that the preset `xAxis` is not read.

## Fit presets

A preset is a named starting configuration over the pipeline above. The catalog
is `STANDARD_PRESETS` (`src/core/analysis/fitConfig.ts`) followed by
`NEPHROLOGY_PRESETS` (`src/core/domains/nephrology/fitConfig.ts`). Each preset
fixes every setting in the table.

| Setting | General exploration | Theil–Sen robust trend | CKD progression | Acute review |
| --- | --- | --- | --- | --- |
| Menu id | `general_exploration` | `theil_sen` | `ckd_progression` | `acute_review` |
| `preset` recorded in `fit_config` | `general_exploration` | `custom` | `ckd_progression` | `acute_review` |
| `xAxis` (metadata only) | `calendar_time` | `calendar_time` | `age` | `calendar_time` |
| Censor after kidney transplant | off | off | on | off |
| Censor after chronic dialysis | off | off | on | off |
| Exclude acute dialysis intervals | off | off | on | off |
| Unknown-intent dialysis policy | `flag-only` | `flag-only` | `exclude-dated-interval` | `flag-only` |
| Exclude AKI windows from fit | off | off | on | off |
| AKI exclusion days | 30 (stored, inactive) | 30 (stored, inactive) | 30 | 30 (stored, inactive) |
| Time balancing | `raw` | `raw` | `quarterly-median` | `raw` |
| Fit model | `ols` | `theil-sen` | `ols` | `none` |
| Endpoint: percent decline | off | off | on | off |
| Endpoint: observed CKD G4 | off | off | on | off |
| Endpoint: observed CKD G5 | off | off | on | off |
| Endpoint: projected age to CKD G5 | off | off | on | off |
| Confirmation days | 90 (stored, inactive) | 90 (stored, inactive) | 90 | 90 (stored, inactive) |
| Rapid-decline threshold (column module setting) | 5 | 5 | 5 | 5 |

"Stored, inactive" means the value is kept in the configuration so that it is
already set when the corresponding option is switched on. Endpoint toggles only
take effect on eGFR series. For the AKI exclusion days, inactive refers to the
fit only: the shaded AKI band in charts is drawn with the stored length whether
or not the exclusion is on (see "AKI fit-exclusion window"). The construction
of AKI windows and the endpoint rules are specified in their own sections.

The Theil–Sen preset is general exploration with the Theil–Sen estimator.
Since 2026-11-21 (owner decision) its configuration is recorded with
`preset: theil_sen`, the id the app uses for it; a configuration with the
same values reached by changing the trend method by hand stays
`preset: custom`. Exports written before recorded both as `custom`. The name
records how the settings were selected and decides nothing: no fit, model
identity or saved setting reads `preset`, and the `about` sheet says so.

Defaults and inheritance:

- The workspace starts with shared settings built from General exploration.
- Shared defaults offer only general presets. Specialist presets are assigned
  explicitly to one parameter, including when chosen in Cohort models; they do
  not become shared defaults for unrelated measurements.
- A column without its own configuration uses the shared settings. Editing
  settings while a column is selected creates an independent configuration for
  that column; "Use shared settings" removes it.
- Selecting a preset replaces every setting in the table, including the
  column's rapid-decline threshold, which returns to 5.

- Changing any single advanced setting, including the rapid-decline threshold,
  marks the configuration as custom. It is then recorded with `preset: custom`
  and `xAxis: calendar_time`, whichever preset it started from (the exported
  `fit_config` carries `preset` only).
- A series specification built without a fit configuration (`cohortSeriesSpec`)
  uses General exploration.

Trajectory calculation and visibility are separate. *Analyse trend* starts off
for each parameter and supplies `fitModel: none` to that parameter's trajectory
summary until enabled. With values 10, 8 and 6 on 1 January in 2020, 2021 and
2022, disabling analysis retains the three measurements and supplies no slope
or fit line; enabling OLS computes the existing negative slope. *Show trend
line* changes only the drawing and retains the slope and export results. The
configured model and preparation remain stored; Cohort models uses those
settings independently of the trajectory activation switch. Choosing a No fit
method disables trajectory activation and line visibility and clears slope
sorting for that parameter. A derived-parameter replacement transfers activation,
line visibility and own settings to its replacement key.

The export `settings` sheet records, per column, the slope mode (column
`mode`), the complete `fit_config` JSON and the rapid-decline threshold
(`rapid_egfr_threshold`).

Regression evidence: [preset builder tests](../../tests/core/fitPipeline/types.test.ts)
for General exploration and CKD progression,
[workspace trajectory tests](../../tests/workspace/trajectories.test.tsx) for
preset selection and the custom state, and
[workspace export tests](../../tests/workspace/export.test.ts) for the settings
sheet. No dedicated regression test asserts the complete Acute review or
Theil–Sen configuration, or the reset of the rapid-decline threshold on preset
selection.

## Time balancing

Time balancing (`balanceSeriesPoints`, `src/core/stats/timeBalancing.ts`)
reduces repeated measurements in a calendar period to one point. It runs after
bounds and windows and before the fit, for every estimator and every analyte.
It is the default in the CKD progression preset (`quarterly-median`).

Modes:

- `raw`: no aggregation. Points are sorted by date; every row is its own point.
- `monthly-median`: one point per UTC calendar month.
- `quarterly-median`: one point per UTC calendar quarter (January to March,
  April to June, July to September, October to December).

Bins are calendar bins keyed by UTC year and month or quarter. They are not
anchored at the patient's first measurement. 31 December and 1 January fall in
different bins in both modes.

For each bin that contains at least one point:

- The value is the median of the bin's values. With an even count it is the
  arithmetic mean of the two middle values.
- The date is the date of the lower-middle observation in date order: position
  `floor((n - 1) / 2)` counted from zero. With one point it is that point's
  date, with two the earlier date, with three the middle date, with four the
  second date. It is always a date on which a measurement exists, never the
  middle of the calendar period.

Value and date are chosen independently. The representative date need not be
the date on which the median value was measured, and with an even count the
value may not have been measured at all. Bins without points produce nothing:
no value is interpolated or carried forward, and the result has a gap there.

Consequences for later steps:

- `nFitted` counts bins, and every minimum point count applies to bins.
- `fittedSpanDays`, the trend-line ends and the one-year reliability threshold
  use representative dates.
- The time origin of the fit is the representative date of the first bin.
- Gap splitting and rolling windows operate on representative dates.
- Same-date rows collapse into their bin instead of entering as separate
  points.

The cohort mixed-model dataset code uses the same function on its own retained
rows, with the time balancing chosen for that parameter under Trajectories
(see "Cohort mixed models").

Example. Seven exact values of one series in 2021:

| Date | Value |
| --- | ---: |
| 2021-01-10 | 50 |
| 2021-02-20 | 44 |
| 2021-03-05 | 47 |
| 2021-03-25 | 41 |
| 2021-04-15 | 40 |
| 2021-11-02 | 38 |
| 2021-12-01 | 42 |

`monthly-median` gives six points. March holds 47 and 41, so its value is 44
and its date is the earlier one, 2021-03-05. All other months keep their single
value and date.

`quarterly-median` gives three points:

| Quarter | Values in date order | Point |
| --- | --- | --- |
| Q1 | 50, 44, 47, 41 | 2021-02-20, 45.5 |
| Q2 | 40 | 2021-04-15, 40 |
| Q3 | none | no point |
| Q4 | 38, 42 | 2021-11-02, 40 |

The Q1 value 45.5 is the mean of 44 and 47; its date is the second of four,
on which 44 was measured. `nNumeric` is 7 and `nFitted` is 3. The raw span is
325 days (2021-01-10 to 2021-12-01); the fitted span is 255 days (2021-02-20 to
2021-11-02). The gap between the second and third point is 201 days, so
segmented OLS splits there. The global OLS slope is −7.66 per year on the raw
points and −5.73 per year on the quarterly points.

A second example for the date rule with an odd count: 9 on 2021-01-05, 1 on
2021-02-10 and 5 on 2021-03-20 give the quarterly point (2021-02-10, 5). The
date is the middle date; the value 5 was measured on 2021-03-20.

Regression evidence: [slope-line tests](../../tests/core/stats/slopeLines.test.ts)
(quarterly balancing before the line, representative date with three points),
[mixed-model dataset tests](../../tests/core/mixedModel/cohortDataset.test.ts)
(monthly median of two values and the earlier date as origin) and
[export record tests](../../tests/core/cohort/exportRecords.test.ts) (eight raw
values collapsing to two fitted points). No dedicated regression test covers
`balanceSeriesPoints` directly, the year boundary, or empty bins.

