# Method reference: Before/after comparison at an anchor event

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Before/after comparison at an anchor event (2026-11-22)

Owner decision of 2026-11-21 (issue #64); implemented on 2026-11-22. Code:
`src/core/cohort/anchorComparison.ts`, called from `buildCohortRows`
(`src/core/cohort/screening.ts`). The comparison is an **additional result**
of a column. It changes no slope, interval, reason code, flag, endpoint,
exclusion or cohort-model input of the column, and it does not replace the
unreachable `event-driven` mode, which reported the segment with the largest
absolute slope (see [code not reachable from the interface](unreachable-code.md#fit-code-not-reachable-from-the-interface)).

### Setting

Trajectories → analysis settings → Calculation settings → "Before/after
comparison", in the shared settings and in a parameter's own settings
(`WorkspaceFitSettings.anchorComparison`). Off by default. When on it holds:

- the **anchor rule**: "First event of the patient", the first event whose
  title equals a chosen value, or the first event whose type equals a chosen
  value. The menu offers the titles and types of the loaded events, each
  prefixed "Title:" or "Type:", so a title and a type of the same spelling
  stay apart.
- the **exclusion window after the anchor** in whole days, default 0.
  A saved value that is not a whole number of days is unreadable.

The setting is not part of the fit configuration: it is not in `fit_config`,
does not change the preset name (a preset stays e.g. `general_exploration`
with the comparison on), is kept when a preset is chosen, and is not part of
the cohort-model preparation key, so switching it does not discard fitted
models. Saved settings carry it; a saved copy without the field has the
comparison off, and an unreadable value makes the whole settings item fall
back to its default, as for every other field.

### Anchor event

`anchorEvent`: among the patient's events (all loaded events of the patient,
whatever their type or intent), the one with the earliest date that the rule
accepts. Title and type are compared exactly as stored, including case and
spaces. Among events of the same date the first in file order wins. An event
with an end date anchors at its start date. A patient without an accepted
event has no anchor: no comparison, and no position on the "Years since event"
axis. Example (demo workbook): "First event" anchors patient 9 at the
dialysis of unknown intent on 2023-03-01, not at the chronic dialysis start on
2024-04-15.

### Points and boundaries

Both sides use exactly the points the column's own fit can use: exact
measurements (no bounds) outside every censoring and exclusion window of the
column (event censoring, acute and unknown dialysis intervals, AKI windows,
as configured). Dates are calendar days (UTC). With the anchor day `A` and
the window `W` days:

| Calendar day `d` of a point | Side |
| --- | --- |
| `d ≤ A` (the anchor date included) | before |
| `A < d ≤ A + W` | neither: exclusion window |
| `d > A + W` | after |

A measurement on the anchor date counts as **before**: imported dates have
day resolution, and a blood draw on the day of a procedure is usually its
baseline. With `W = 0` the window is empty. Points in the window are drawn as
grey open circles (reason "exclusion window after the anchor event,
after-anchor slope only"), and the measurement table names them; they still
enter the column's slope. The chart legend, the point tooltip and the context
line of an exported chart therefore count them apart from the measurements
excluded from the fit (for example "1 measurement in the exclusion window
after the anchor event") and do not call them excluded from the fit. Under censoring the anchor date itself can be
censored (for example the transplant date under "Censor after kidney
transplant", which is inclusive); it then belongs to neither side.

### Fit of each side

Each side is time balanced on its own with the column's time balancing
(`raw`, monthly or quarterly medians), so a month or quarter that contains the
anchor gives one median per side, and is then fitted with the column's scalar
estimator: OLS (`fitGlobal`, also for Rolling and Segmented OLS, whose scalar
slope is OLS) or Theil-Sen. The minimum counts and special cases of that
estimator apply per side: OLS needs three points for an interval, and two
points give the exact two-point slope without an interval; Theil-Sen needs
three points. A side with fewer points has no slope. Time on each side is
measured in years (365.25 days) from that side's first fitted point; the slope
does not depend on the origin. Each side reports the fitted points `n`, the
distinct fitted dates, the span in whole days between its first and last
fitted point, the first and last fitted date, the slope per year and its 95 %
interval (OLS: Student t; Theil-Sen: the Sen rank bounds). As for the
column's slope, Theil-Sen bounds of a side with fewer than five distinct
fitted dates (`MIN_THEIL_SEN_PROJECTION_DATES`) are not a 95 % interval: with
one value on each of three dates they are the full range of the three
pairwise slopes and cover the true slope about 67 % of the time. The patient
view then writes "Theil–Sen bounds […], not a 95% interval: 3 dates" instead
of "95% CI", and the export gives the date counts in `before_n_fitted_dates`
and `after_n_fitted_dates` (review of the combined branch, 2026-11-22; before,
every side was labelled "95% CI"). Example: demo patient 13, eGFR, preset
Theil-Sen, anchor type `kidney_transplant`: the after side has three points
and the bounds [−8.07, −7.94], the full range of −7.94, −8.005 and −8.07.
Without a fit
(Trend off or fit model "none") only the anchor is determined.

### Difference and its interval

`difference = slope_after − slope_before`, per year. A positive difference
means the series falls more slowly (or rises faster) after the anchor.

The 95 % interval of the difference (`differenceInterval`) is computed from
the two OLS standard errors `SE_b` and `SE_a` and the fitted counts `n_b`,
`n_a`:

    half-width = t(0.975, ν) · √(SE_b² + SE_a²)
    ν = (SE_b² + SE_a²)² / (SE_b⁴ / (n_b − 2) + SE_a⁴ / (n_a − 2))   (Welch–Satterthwaite)

`ν` is truncated to a whole number and `t` comes from the same table as the
OLS interval (`tCritical95`). Assumption: the two slope estimates are
independent. They are fitted on disjoint points, but residuals of one patient
that are correlated over time, or a shared baseline level, are not modelled,
so the interval can be too narrow. With both standard errors 0 the interval is
the difference itself. It is empty when a standard error is missing: for
Theil-Sen, for a side with the exact two-point line and for a side without a
slope.

### Relation to the column's other results

- **Slope, interval, R², reason and `nFitted`** of the column stay those of
  the whole series.
- **Reliability rule** (`isUnstableSlope`) and the **rapid eGFR decline flag**
  are evaluated on the column's slope only, as before; neither side has its
  own reliability note or flag. Each side reports `n` and span so that a
  short side can be recognised.
- **Endpoints** (observed G4/G5, percent decline, projection) are unchanged
  and use the whole eligible series.
- **Cohort models** receive the same rows as without the comparison.

### Export

The cohort workbook (and the patient workbook) has a sheet `anchor_comparison`
after `import_diagnostics`, one row per exported patient and parameter whose
settings switch the comparison on, in table order: `PatientID`, `Parameter`,
`Unit`, `fit_model`, `anchor_rule` (`first`, `title` or `type`),
`anchor_value`, `anchor_date`, `anchor_type`, `anchor_title`,
`exclusion_days`, `n_excluded_window`, then for `before_` and `after_`: `n`,
`first_date`, `last_date`, `span_days`, `slope`, `ci_low`, `ci_high`, then
`slope_difference`, `difference_ci_low`, `difference_ci_high`, `slope_unit`,
then `before_n_fitted_dates` and `after_n_fitted_dates` (appended after the
review of the combined branch, 2026-11-22).
A patient without an anchor has a row with empty values; `n_excluded_window`
is empty without a fit. The `settings` sheet gains `anchor_comparison`,
the setting as JSON (empty when off), and the `about` sheet a note on the
sheet; both were last until the
[peri-event creatinine](aki.md#peri-event-creatinine-2026-11-22) sheet,
column and note followed them (2026-11-22). No existing sheet, column or
note moved.

### Worked example (demo workbook)

Patient 13, imported eGFR (`eGFR`, `ml/min/1,73m²`), General exploration
(OLS, raw, no censoring), anchor "First event of the type kidney_transplant",
window 0 days. The anchor is the kidney transplant on 2022-07-01.

| Side | Points | n | Span (days) | Slope per year | 95 % interval | SE |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| before | 2020-01-10 55, 2020-07-10 48, 2021-01-10 42, 2021-07-10 35, 2022-01-10 29, 2022-06-10 24 | 6 | 882 | −12.828 | [−13.320, −12.337] | 0.1771 |
| after | 2022-08-10 72, 2023-02-10 68, 2023-08-10 64 | 3 | 365 | −8.005 | [−8.488, −7.523] | 0.0380 |

Difference +4.823 per year. `ν = 0.032822² / (0.031379²/4 + 0.001443²/1) = 4.34`,
truncated to 4, `t = 2.776`, half-width `2.776 · √0.032822 = 0.503`: interval
[4.320, 5.326]. The column's own OLS slope over all nine values is +4.372 per
year (the jump at the transplant), and it is the one the table, the
reliability rule and the flags use. With a window of 60 days the value of
2022-08-10 (40 days after the anchor) leaves the after side: after = exact
two-point line 68 → 64 over 181 days, −4 / (181 / 365.25) = −8.072, difference
+4.757, no interval. Under CKD progression the same patient has no after side,
because "Censor after kidney transplant" removes every value from the
transplant date on.

The example in issue #64 (patient 2, before −17.4, after −9.6, difference
+7.8, anchor "ACE-Hemmer") came from the demo data of the predecessor
repository. The demo workbook of this repository has no event for patient 2,
so it cannot be reproduced here.

### Regression evidence

`tests/core/cohort/anchorComparison.test.ts` (anchor rule and ties, anchor
date counts as before, window boundaries `A + W` and `A + W + 1`, only fit
points, per-side balancing, Theil-Sen, two-point side, no fit, no anchor,
Welch interval, unchanged column results, censoring, the demo example);
`tests/workspace/anchor-comparison.test.tsx` (settings, patient view, grey
circles, measurement table, axis, export rows, saved settings);
`tests/workspace/model-validity.test.tsx` (no mixed-model line on the event
axis); `tests/e2e/anchor-comparison.e2e.ts` (the demo example in Chromium).

## Time axis "Years since event" (K16, 2026-11-22)

Owner decision of 2026-11-21 (issue #70, item K16, option a). Display only:
no number and no export column changes.

- The time axis of the patient charts and the overlay offers "Years since
  event" beside the elapsed-time, calendar and age axes. The saved view
  stores it as `event`; a version from before 2026-11-22 does not know the
  value and falls back to years, naming "time axis" as not restored.
- Zero is the anchor event of the column's before/after comparison (above),
  so chart and numbers refer to the same day. x = (date − anchor date) /
  365.25 days; values before the anchor are negative, a value on the anchor
  date is 0.
- A trajectory without an anchor (no matching event, or the comparison is
  off for the parameter) is not drawn. With the comparison on, the line
  above the chart counts the patients without a matching event, "1 trajectory
  without a matching anchor event (not drawn)". When the parameter has no
  comparison, nothing is counted and a note under the chart says where to
  switch it on (since the review of the combined branch, 2026-11-22; before,
  every trajectory of such a parameter was counted as "additional
  trajectories without a matching anchor event").
- The axis label names the rule, for example "Years since anchor event
  (first event of type kidney_transplant)", and the same text is in the
  context line of an exported image.
- Cohort mixed-model reference lines are not drawn on this axis, as on the
  calendar axis: the model counts time from the first measurement.
- Example (demo workbook, imported eGFR, anchor type `kidney_transplant`):
  patient 13 runs from −2.47 to +1.11 years and patient 14 from −1.01 to
  +0.49 years; both jumps sit at 0. The other 23 eGFR trajectories are
  counted, not drawn.
