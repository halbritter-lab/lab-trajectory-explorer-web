# Method reference: Logarithmic value axis and doubling time

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Logarithmic value axis and doubling time (2026-11-22)

Owner decision of 2026-11-21 (issue #70, "Logarithmic y axis per column, with
doubling or halving time derived from a slope on log values"); implemented on
2026-11-22. Code: `src/core/cohort/logTrend.ts`, called from
`buildCohortRows` (`src/core/cohort/screening.ts`); wording in
`src/workspace/labels/doublingTime.ts`. The doubling time is an **additional
result** of a column that is shown on a logarithmic axis. It changes no slope,
interval, reason code, reliability note, flag, endpoint, exclusion,
before/after comparison or cohort-model input of the column. With the option
off (the default) nothing is computed and every number, sheet and column of
the export is as before.

### Setting

Trajectories → the parameter controls of a column (table header, overlay and
patient charts) → the toggle **log** ("Logarithmic value axis: <parameter>").
Per column, off by default. It is a display choice of the view, not part of
the analysis settings: it is not in `fit_config`, does not change the preset
name and is not part of the cohort-model preparation key. "Remember on this
device" keeps it as `logKeys` of the trajectory view; a saved copy without the
field has no logarithmic column.

### Axis

- The value axis of the column's table charts, overlay chart and patient
  chart is base-10 logarithmic. Ticks are powers of ten when the range holds
  at least three of them, else 1, 2 and 5 times a power of ten, else (a range
  inside about one decade) the round ticks of a linear axis
  (`logTicks`, `src/workspace/plot-ticks.ts`).
- **Shared parameter scale**: from the smallest to the largest positive value
  of the column in the loaded dataset (measurements and the drawn fit lines of
  the log fit), not widened to zero. A column whose positive values are all
  equal spans that value ÷ √10 to × √10; a column without positive values
  spans 1 to 10. **Zoom to visible values**: the visible positive values,
  padded by 8 % of the range in log10 units on each side.
- **Values of zero or less** have no position on the axis and are not drawn;
  the chart note counts them ("1 value of zero or less is not drawn and left
  out of the doubling time"). Bounds (`<x`, `>x`) are drawn at their limit as
  on the linear axis.
- The dashed fit lines are those of the fit on log values, back-transformed
  (`exp`) to the unit of the parameter, so they are straight on the axis. On
  the linear axis the column's own fit lines are drawn as before. Under Rolling
  OLS and Segmented OLS the lines are the windows and segments of the log
  values. The dotted "uncertain" line uses the reliability rule on the counts
  of the log fit.
- The cohort mixed-model reference line is not drawn on a logarithmic axis
  (the model is linear in the values); the chart note says so when the line is
  switched on.

### Fit on log values

For a column on a logarithmic axis with a fit (Trend on and a fit model other
than "No fit"), `buildCohortRows` runs the column's own fit a second time on
the **natural logarithm** of the values (`logTransformedRows`):

1. Every row of the series with a numeric value `v > 0` gets the value
   `ln v`. A row with `v ≤ 0` becomes a row without a numeric value, so the
   pipeline treats it as absent: it is not in `n` of the log fit, not in its
   raw span (`span_too_short`) and in no median. These rows are counted as
   `n_non_positive` (dated rows only). Rows of other series are unchanged.
2. The pipeline is the column's: the same slope mode and estimator (OLS;
   Theil-Sen for `global-robust`; the global OLS slope under Rolling and
   Segmented OLS, as for the column's slope), the same preset, the same
   censoring and exclusion windows (event censoring, dialysis intervals, AKI
   windows, as configured; they are dates and do not depend on the values),
   bounds as the column's bounded-value setting says (since 2026-11-22: the
   logarithm of the limit, of half the limit for `<x` under `half-limit`, or
   left out under `exclude`; see
   [bounded values](bounded-measurements.md#bounded-values-in-individual-fits-2026-11-22)),
   and the same time balancing. **Monthly or
   quarterly medians are medians of the log values**: for an odd count this is
   the log of the median value; for an even count it is the mean of the two
   middle logs, the log of their geometric mean, which can differ from the
   log of the arithmetic median the linear fit uses. The chronic-CKD run-in
   and the event-driven segment choice (not reachable from the interface) are
   applied to the log values as well, so the event-driven path can select a
   different segment there.
3. The result is a slope `k` of ln(value) per year (time in years of 365.25
   days since the first fitted point), its bounds `k_low` and `k_high` as the
   estimator gives them (the 95 % OLS interval with the t value of the column's
   OLS; for Theil-Sen the rank-based bounds, which are not a 95 % interval
   below five distinct fitted dates), the OLS standard error, R², the
   intercept (ln value at the first fitted date), the fitted counts and the
   reason code of the log fit.

Without a fit only the axis changes; no doubling time is given ("No doubling
time: the fit model is disabled").

### Doubling and halving time

`doublingTime(k, k_low, k_high)`:

- **T = ln 2 / k** in years. **Positive T is a doubling time; negative T is a
  halving time**, whose length is |T|. The interface writes "doubles in 1.02 y"
  or "halves in 2.5 y"; the export keeps the sign.
- **k = 0 exactly, or no finite k** (fewer than two fitted points, all on one
  date, fit model "No fit"): no T. A slope close to zero gives a long T, which
  is reported as computed; there is no cut-off. Its interval (next point) then
  usually includes no change.
- **Interval.** When the bounds exclude zero (`k_low > 0` or `k_high < 0`):
  **[ln 2 / k_high, ln 2 / k_low]** as signed values, which holds on both
  sides because 1/k falls on each side of zero. When the bounds include zero
  (`k_low ≤ 0 ≤ k_high`) or a bound is not finite (exact two-point line), T
  has no interval: the set of times compatible with the bounds is unbounded,
  and the interface says "the 95% CI of the slope includes no change, so the
  time has no bound". For Theil-Sen below five distinct fitted dates the
  interval is named "Theil–Sen bounds, not a 95% interval", as for the slope.
- **Reliability.** The app's reliability rule
  ([slope quality](slope-quality.md#reason-codes-and-the-slope-reliability-rule))
  is applied to the counts of the log fit: fewer than three distinct fitted
  dates or a fitted span under 365 days marks T "(uncertain)" in the table and
  `unstable_slope = yes` in `log_trend`.
- Numbers are written with three significant digits in the interface; the
  export is unrounded.

### Where results appear

- Table cell (minimal): "doubles in 1.02 y" beside the slope, its tooltip the
  full sentence; compact cells and the patient view carry the full sentence:
  "Doubling time 1.02 years (95% CI 0.888 to 1.19 years): ln 2 divided by the
  OLS slope of the natural logarithm of the values, 0.681 per year, from 5
  fitted points over 728 days."
- The column's slope, interval and quality note stay those of the linear fit
  in units per year.
- Export: the sheet **`log_trend`**, after every other sheet, exists only
  when at least one exported column is on a logarithmic axis, with one row
  per patient and such column: `PatientID, Parameter, Unit, slope_mode,
  fit_model, n_fitted, n_fitted_dates, fitted_span_days, n_non_positive,
  index_date, last_fitted_date, log_slope, log_slope_ci_low,
  log_slope_ci_high, log_slope_se, log_intercept, r2, reason, unstable_slope,
  doubling_time_years, doubling_time_ci_low, doubling_time_ci_high`. A note at
  the end of `about`, present with the sheet only, explains it. No column of
  `cohort` or `slopes` and no setting of `settings` is added.

### Worked example

CEA (ng/ml) of one patient, General exploration (OLS, raw), every six months:

| Date | Value | Years since first | ln value |
| --- | --- | --- | --- |
| 2021-01-04 | 2.0 | 0 | 0.69315 |
| 2021-07-05 | 2.6 | 0.49829 | 0.95551 |
| 2022-01-03 | 3.9 | 0.99658 | 1.36098 |
| 2022-07-04 | 5.1 | 1.49487 | 1.62924 |
| 2023-01-02 | 7.8 | 1.99316 | 2.05412 |

OLS on the log values: k = 0.68147 per year, intercept 0.65946 (fitted value
e^0.65946 = 1.934 ng/ml on 2021-01-04), SE 0.031192, t(0.975, 3) = 3.1824,
95 % interval [0.58220, 0.78074]. Doubling time T = 0.693147 / 0.68147 =
**1.0171 years**, interval [0.693147 / 0.78074, 0.693147 / 0.58220] =
**[0.8878, 1.1906] years**. The linear slope of the same column is unchanged:
2.830 ng/ml per year (95 % interval [1.476, 4.183]). With Theil-Sen the log
slope is the median of the ten pairwise slopes, 0.67943, and T = 1.0202 years.
A value of 0 added on 2023-07-03 is left out (`n_non_positive` = 1) and leaves
T unchanged; a bound `>20` added on 2023-08-01 is left out as in every fit.

### Regression evidence

`tests/core/cohort/logTrend.test.ts` (the formula and its sign, zero and
missing slopes, the interval and its unbounded case, the worked example for
OLS and Theil-Sen, values of zero or less, bounds, no fit, and that a cell and
its export records are unchanged with the option off);
`tests/workspace/log-axis.test.tsx` (ticks, the cell text, the chart note, the
saved view and the conditional `log_trend` sheet).
