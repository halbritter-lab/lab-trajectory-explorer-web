# Method reference: Trend estimators (OLS, Theil-Sen, rolling and segmented)

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Ordinary least squares

OLS is the default estimator. `fitOls` (`src/core/stats/ols.ts`) is the kernel;
`fitGlobal` (`src/core/stats/series.ts`) prepares a dated series for it and adds
the two-point case. The same kernel fits each rolling window and each gap
segment.

### Time axis

`datesToYears` (`src/core/stats/time.ts`) converts each date to
`x = (t - t0) / (365.25 * 86 400 000 ms)`, where `t0` is the earliest date among
the points being fitted. The origin is therefore the first point that survives
bounds, windows and balancing, not the first imported measurement. For a
rolling window or a gap segment it is the first point of that window or
segment. A year has 365.25 days; leap years are not treated individually, so
2020-01-01 to 2021-01-01 is 366 / 365.25 = 1.002053 years. The intercept is the
fitted value at `t0`.

### Estimator

The fit is unweighted: every point has the same weight, whatever its distance
in time from its neighbours. With n points, means x̄ and ȳ, and

- `Sxx = Σ (x_i − x̄)²`
- `Syy = Σ (y_i − ȳ)²`
- `Sxy = Σ (x_i − x̄)(y_i − ȳ)`

the results are `slope = Sxy / Sxx` and `intercept = ȳ − slope · x̄`.

### Minimum counts and special cases

- Fewer than three points: the kernel returns no fit with reason
  `n_below_threshold`. This applies to every rolling window and gap segment.
- Exactly two points in the global fit: `fitGlobal` does not call the kernel.
  It returns the exact line through both points,
  `slope = (y2 − y1) / (x2 − x1)` and `intercept = y1`, with `r2 = 1`, reason
  `null` and unavailable confidence bounds. The reason field does not mark this
  case; the reliability rule does (see "Reason codes and the slope reliability
  rule"). Example: 60 on 2020-01-01 and 56 on 2021-01-01 give a slope of
  −4 / 1.002053 = −3.991803 per year.
- Identical timestamps: when all points share one timestamp (three or more in
  the kernel, or both points of the two-point case), there is no slope and the
  kernel reason is `identical_timestamps`. The series summary does not pass
  this reason on; the interface recognises the case by its fitted span of zero
  days (see "Reason codes and the slope reliability rule").
- Same-date rows: in `raw` mode, several rows on one date stay separate points
  with equal weight. A day with five measurements weighs five times as much as
  a day with one. The fit proceeds as long as at least two distinct dates
  exist. Monthly or quarterly balancing collapses such rows first.

### R²

`r2 = Sxy² / (Sxx · Syy)`, the squared Pearson correlation of time and value.
For a single line through the fitted points this equals the share of variance
explained. When every fitted value is identical, `Syy` is zero and R² is
unavailable (not 0 and not 1), while the slope is 0 and the confidence bounds
are both 0. Example: 50, 50, 50 at years 0, 1, 2 gives slope 0, intercept 50,
R² unavailable and bounds [0, 0]. R² is unavailable for Theil-Sen fits (see
"Theil-Sen").

### 95 % confidence interval for the slope

With `df = n − 2`:

- `SSres = max(0, Syy − slope · Sxy)`; the clamp removes a negative value
  caused by floating-point cancellation when residuals are near zero.
- `SE = sqrt(SSres / df / Sxx)`
- `ciLow = slope − t · SE` and `ciHigh = slope + t · SE`

`t` is the two-sided 95 % critical value of Student's t distribution (the 97.5th
percentile) for `df`. These bounds describe uncertainty in the slope under the
usual linear-model assumptions. They are not bounds for the intercept and not a
prediction interval for individual measurements. They are shown next to the
slope, exported as `ci_low` and `ci_high` (and `SE` as `slope_se`), and the
endpoint-only fit uses the same calculation.

The critical value is read from a table in `tCritical95`, not computed:

| df | Value used | Exact value at the largest df of the row | Largest deviation in the row |
| --- | --- | --- | --- |
| 1 to 40 | exact value per df (9 decimals) | same | none |
| 41 to 50 | 2.02107539 (df 40) | 2.008559 (df 50) | +0.62 % |
| 51 to 60 | 2.008559112 (df 50) | 2.000298 (df 60) | +0.41 % |
| 61 to 80 | 2.000297822 (df 60) | 1.990063 (df 80) | +0.51 % |
| 81 to 100 | 1.990063421 (df 80) | 1.983972 (df 100) | +0.31 % |
| 101 to 120 | 1.983971519 (df 100) | 1.979930 (df 120) | +0.20 % |
| above 120 | 1.959963985 (normal) | 1.979764 at df 121, the smallest df of the row | −1.00 % at df 121 |

Up to 42 points (df 40) the value is exact. From 43 to 122 points the value of
the lower breakpoint is used, so the interval is slightly wider than the exact
one, by at most 0.62 %. From 123 points on the normal value is used, so the
interval is slightly narrower than the exact one: by 1.00 % at df 121, 0.61 %
at df 200 and 0.24 % at df 500.

> **Open decision OD-11.** OLS t critical values above 40 degrees of freedom come from a step function that is wider than exact up to df 120 and narrower than exact (normal value) above; this range is not covered by a reference test, because the stored OLS fixtures have at most five points. Behaviour is unchanged pending an owner decision.

### Worked example

Years x = [0, 1, 2, 3], values y = [60, 56, 50, 46]. Then x̄ = 1.5, ȳ = 53,
Sxx = 5, Syy = 116 and Sxy = −24.

- slope = −24 / 5 = −4.8 per year
- intercept = 53 − (−4.8)(1.5) = 60.2
- R² = 576 / (5 · 116) = 0.993103
- SSres = 116 − (−4.8)(−24) = 0.8, df = 2, SE = sqrt(0.8 / 2 / 5) = 0.282843
- t = 4.30265273, half-width = 1.216974
- 95 % CI = [−6.016974, −3.583026]

The same values dated 2020-01-01, 2021-01-01, 2022-01-01 and 2023-01-01 lie at
0, 366, 731 and 1096 days, that is x = [0, 1.002053, 2.001369, 3.000684]. The
fit is then slope −4.799231, intercept 60.203774, R² 0.993058 and 95 % CI
[−6.020068, −3.578394].

Regression evidence: [OLS tests](../../tests/core/stats/ols.test.ts),
[OLS fixture tests](../../tests/parity/ols.parity.test.ts),
[series tests](../../tests/core/stats/series.test.ts) for the two-point case and
[time tests](../../tests/core/stats/time.test.ts) for the 365.25-day year and the
origin. No dedicated regression test covers critical values above df 40, the
flat-series R², or same-date rows in the global fit.


## Theil-Sen (2026-09-23)

Inputs are dated numeric observations, sorted without mutating caller data. Time
is elapsed UTC milliseconds from the earliest date divided by 365.25 days/year.
At least three observations and two distinct timestamps are required. Retain
repeated-date observations but omit pairs whose time difference is zero.

The slope is the median of `(y[j]-y[i])/(x[j]-x[i])` over pairs with increasing
time. The intercept is `median(y) - slope * median(x)`. R² is unavailable.
For x=[0,1,2,3], y=[0,0,4,9], slope=3.5 and intercept=-3.25; the former web
median-residual convention produced -2.25 and has intentionally been replaced.

Slope confidence bounds follow the Python reference's SciPy `theilslopes`
default 95% convention. Let n be observation count and N the number of valid
pair slopes. For each repeated time or value group of size k, subtract
`k*(k-1)*(2*k+5)` from `n*(n-1)*(2*n+5)`; divide the result by 18 to obtain V.
With C=1.959963984540054*sqrt(V), use zero-based sorted-slope ranks
`max(roundEven((N-C)/2)-1,0)` and `min(roundEven((N+C)/2),N-1)`.
Exact half-integers round to even to match NumPy. Undefined variance/ranks
produce unavailable bounds. These are slope bounds, not confidence bounds for
the intercept or prediction intervals for individual future observations.
For n = 3, 4 and 5 without ties the ranks are 0 and N-1, so the bounds are
the lowest and highest pairwise slope, with an actual coverage of 1 - 2/n!
(66.7 %, 91.7 %, 98.3 %). The individual G5 projection therefore needs five
distinct dates under Theil-Sen (since 2026-11-05; see "Individual G5
projection"); the bounds themselves are unchanged.

**Label of the bounds** (decided 2026-11-16). The table and the patient view
call the bounds `95% slope CI`. For a Theil-Sen fit on fewer than five
distinct fitted dates (`nFittedDates < 5`, the minimum of a Theil-Sen
projection, `MIN_THEIL_SEN_PROJECTION_DATES`) they read `Slope range`
instead, followed by the hint "Not a 95% interval: the fit has fewer than 5
distinct dates. With one measurement on each of three or four dates, the
Theil–Sen bounds are the full range of pairwise slopes and cover the true
slope only about 67 % or 92 % of the time." The hint is printed under the
bounds and precedes the general hint ("Uncertainty in the estimated slope; not
a prediction interval for future measurements") in the tooltip. From five
dates on the label is `95% slope CI` (coverage 98.3 % at five). The rule
counts dates, not points, and the hint is worded to hold for every input that
takes this branch: with two dates, or with several measurements on one date,
the bounds are rank-based rather than the lowest and highest pairwise slope
and their coverage is not established, so the label stays `Slope range` and
the coverage figures are given for the one-measurement-per-date case only.
Examples: 10, 11 and 12 on 1 January of three consecutive years give
`Slope range [1, 1]`; the same series over five years gives
`95% slope CI [1, 1]`; five values on four dates (two on the last) still read
`Slope range`. The numbers and the export columns `ci_low` and `ci_high` are
unchanged. The export column `n_fitted_dates` (see
[fit dates, intercept and slope standard error](fit-input-presets-and-time-balancing.md#fit-dates-intercept-and-slope-standard-error))
identifies the affected rows, and the workbook's `about` sheet says: "ci_low
and ci_high are the 95 % interval of the slope. For a Theil-Sen fit with
n_fitted_dates below 5 they are Theil-Sen bounds, not a 95 % interval. With
one measurement on each of three or four dates, the Theil–Sen bounds are the
full range of pairwise slopes and cover the true slope only about 67 % or
92 % of the time." OLS fits always read `95% slope CI`.

The methodology page of the app (`Fits.tsx`) carries the same qualification
(wording approved 2026-11-16, formerly OD-33).

The kernel expects valid numeric points from preparation. The minimum applies
to the actual prepared observations when used for a display fit. All pairs are
enumerated, so time and temporary storage grow quadratically with point count.

References: [SciPy documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html),
[fixture provenance](../../tests/goldens/theil_sen.md),
[full estimator parity tests](../../tests/parity/theilSen.parity.test.ts).

## Rolling and segmented OLS

Both selections add local OLS fits to the global fit. Their parameters are
fixed defaults in `summarizeByBezeichnung` and `buildCohortRows`; no interface
control changes them. For rolling OLS the cohort and slope sheets record the
window parameters and the local results in the `rolling_*` columns (below).
For segmented OLS the export records neither: of the fit settings, the
`settings` sheet carries only the slope mode (column `mode`), `fit_config` and
the rapid-decline threshold.

### Rolling OLS (`rolling-ols`, slope mode `rolling`)

`rollingSlopes` (`src/core/stats/rolling.ts`) works on the fitted points after
bounds, windows and balancing.

- Window width: 730 days. The half-width is `floor(730 / 2) = 365` days.
- Step between window centres: 180 days.
- Minimum points per window: 3.
- Centres start at the first fitted date plus 365 days and advance by 180 days
  while the centre is not later than the last fitted date minus 365 days. Both
  ends of this range are inclusive.
- A window contains the points with
  `centre − 365 d <= date <= centre + 365 d`; both bounds are inclusive, so a
  window covers 731 calendar dates.
- A fitted span below 730 days produces no window. A span of exactly 730 days
  produces one window that contains every point.
- A window with fewer than three points is skipped. A window whose points all
  share one date is skipped. Skipped windows leave no record.
- Each remaining window is fitted with the OLS kernel. Time is measured from
  the first point inside that window.
- Because centres advance in fixed steps, the last window can end before the
  last fitted date. Points after it belong to no window.

Example: fitted points from 2018-01-01 to 2022-01-01 give the centres
2019-01-01, 2019-06-30, 2019-12-27, 2020-06-24 and 2020-12-21. The first window
is 2018-01-01 to 2020-01-01, the last is 2019-12-22 to 2021-12-21. A sixth
centre, 2021-06-19, would lie after 2021-01-01 and is not used.

From the window slopes the summary computes the number of windows (`nWindows`),
the smallest and largest window slope (`slopeMin`, `slopeMax`) and their
population variance (`slopeVar`, divisor = number of windows). With no window
the three statistics are unavailable.

What is reported and drawn (decided 2026-10-07, formerly OD-2; before, the
window slopes were computed and discarded and no line was drawn):

- The reported slope, intercept, R² and confidence bounds are those of the
  global OLS fit over all fitted points, including the exact two-point case.
  They are identical to the values the `ols` fit model gives for the same
  column settings. Reason codes, the reliability rule, the rapid-decline flag
  and sorting use these global values.
- The table labels this number "Rolling OLS". The export carries
  `slope_mode = rolling` and `fit_model = ols`.
- **Window lines.** One line is drawn per window, in the table sparkline, the
  patient chart and the overlay (`rollingWindowLine`). The line is the
  window's own OLS line, drawn over the central step of the window only: from
  the window centre minus 90 days to the centre plus 90 days (half the 180-day
  step on each side), clipped to the dates of the first and last point inside
  the window. Consecutive lines therefore adjoin instead of overlapping, and
  each stretch shows the slope estimated from the two years around it. The
  lines of neighbouring windows need not meet, because each window has its own
  fit. A window whose points do not reach into its central stretch has no
  line. With no window (fitted span under 730 days) no line is drawn; the
  global line is not drawn in this mode.
- **Window statistics.** The cell shows the number of windows and the smallest
  and largest window slope ("5 windows, local slopes −8 to 0 …/year"), or
  "No 730-day window with three fitted measurements; no local slopes". A
  series without any fitted value shows neither. The variance `slopeVar` is
  computed but not shown.
- **Window list (since 2026-11-21).** The patient view lists the windows
  under "Show windows (n)": the bounds of each window (centre − 365 days to
  centre + 365 days, both days included), the dates of the first and last
  fitted measurement inside, their number and the window slope per year. The
  rows are the windows counted by the window statistics, in time order, also
  those without a drawn line. In the patient chart and the overlay each window
  line carries the same information as a tooltip, and the legend reads
  "Rolling OLS window lines". The list is an addition to the display; the
  reported slope and every number derived from it are unchanged.
- **Overlay counts.** In rolling mode a series counts as fitted when a window
  line is drawn. A series with a global slope but no window is counted among
  the trajectories without an available fit and not among the uncertain fits.
- **Export.** The cohort and slope sheets carry five rolling columns, placed
  after all earlier columns of the sheet (`n_fitted` and `fitted_span_days`
  included) so that those column positions are unchanged. Only the seven
  columns of [fit dates, intercept and slope standard error](fit-input-presets-and-time-balancing.md#fit-dates-intercept-and-slope-standard-error)
  follow them:

  | Column | Content for slope mode `rolling` | Other modes |
  | --- | --- | --- |
  | `rolling_window_days` | `730` | blank |
  | `rolling_step_days` | `180` | blank |
  | `rolling_windows` | number of fitted windows, `0` when there is none | blank |
  | `rolling_slope_min`, `rolling_slope_max` | smallest and largest window slope per year, unrounded; blank without a window | blank |

  With fit model "No fit", and for a series without any fitted value, the
  columns are blank.

  Since 2026-11-21 the workbook also has the sheet `rolling_windows`, placed
  after `about` so that the positions of the earlier sheets are unchanged. It
  holds one row per fitted window of every selected patient and parameter
  whose slope mode is `rolling`, and no row otherwise:

  | Column | Content |
  | --- | --- |
  | `PatientID`, `Parameter`, `Unit` | The series, as on the `measurements` sheet. |
  | `window` | Number of the window within the series, from 1, in time order. |
  | `window_start`, `window_end` | Centre − 365 days and centre + 365 days as `YYYY-MM-DD`; measurements on both days belong to the window. |
  | `first_date`, `last_date` | Dates of the first and last fitted measurement inside the window. |
  | `n` | Number of fitted measurements inside the window (at least 3). |
  | `slope` | OLS slope of the window per year, unrounded. |

  The smallest and largest `slope` of a series equal its `rolling_slope_min`
  and `rolling_slope_max`, and the number of its rows equals
  `rolling_windows`.

Example: one value at the start of every quarter from 2018-01-01 to
2022-01-01 (17 values), 60 up to 2020-01-01 and falling by 8 per year
afterwards (43.99 on 2022-01-01). The global OLS slope, which is the reported
slope, is −4.00 per year. The five windows give:

| Centre | Points | Window slope per year | Line drawn from | to |
| --- | ---: | ---: | --- | --- |
| 2019-01-01 | 9 | 0.00 | 2018-10-03 (60.00) | 2019-04-01 (60.00) |
| 2019-06-30 | 8 | −0.66 | 2019-04-01 (59.83) | 2019-09-28 (59.51) |
| 2019-12-27 | 8 | −3.23 | 2019-09-28 (58.94) | 2020-03-26 (57.34) |
| 2020-06-24 | 8 | −6.18 | 2020-03-26 (57.13) | 2020-09-22 (54.08) |
| 2020-12-21 | 8 | −8.00 | 2020-09-22 (54.20) | 2021-03-21 (50.25) |

The cell reports 5 windows with local slopes from −8.00 to 0.00, and the
export `rolling_windows = 5`, `rolling_slope_min = -8`, `rolling_slope_max = 0`.
The window list and the `rolling_windows` sheet give for the same series:

| `window` | `window_start` | `window_end` | `first_date` | `last_date` | `n` | `slope` (rounded) |
| ---: | --- | --- | --- | --- | ---: | ---: |
| 1 | 2018-01-01 | 2020-01-01 | 2018-01-01 | 2020-01-01 | 9 | 0.00 |
| 2 | 2018-06-30 | 2020-06-29 | 2018-07-01 | 2020-04-01 | 8 | −0.66 |
| 3 | 2018-12-27 | 2020-12-26 | 2019-01-01 | 2020-10-01 | 8 | −3.23 |
| 4 | 2019-06-25 | 2021-06-24 | 2019-07-01 | 2021-04-01 | 8 | −6.18 |
| 5 | 2019-12-22 | 2021-12-21 | 2020-01-01 | 2021-10-01 | 8 | −8.00 |

The values after 2021-10-01 belong to no window and the stretch after
2021-03-21 has no line.

### Segmented OLS (`segmented-ols`, slope mode `gap-split`)

`splitIntoSegments` and `fitSegments` (`src/core/stats/segments.ts`) work on the
same fitted points.

- A new segment starts wherever the distance between two consecutive fitted
  points is strictly greater than 180 days. A distance of exactly 180 days does
  not split. Under balancing the distance is measured between representative
  dates.
- Segments are split at gaps only. Clinical events do not split a series; they
  act through censoring windows before the fit.
- A segment with at least three points is fitted with the OLS kernel. Time is
  measured from the first point of that segment. The exact two-point case does
  not apply inside a segment.
- A segment with fewer than three points, or whose points share one date, is
  kept as a segment without a fit.

From the segments the summary computes the number of segments (`nSegments`,
unfitted ones included) and, over fitted segments, the smallest and largest
slope and their difference (`slopeMin`, `slopeMax`, `slopeRange`). With no
fitted segment the three statistics are unavailable.

What is reported and drawn:

- The reported slope, intercept, R² and confidence bounds are those of the
  global OLS fit across all segments, as for rolling OLS.
- The table labels this number "Segmented OLS". The export carries
  `slope_mode = gap-split` and `fit_model = ols`.
- One trend line is drawn per fitted segment, from the segment's first to its
  last point. Unfitted segments show their points without a line.
- If no segment is fitted, a single global line is drawn instead when the
  global fit returns a slope. This is the only way a two-point line appears in
  this mode.
- Segment slopes exist only as drawn lines. They and the four statistics are
  not shown as numbers and not exported.
- Reason codes, the reliability rule and the rapid-decline flag use the global
  values.

Example: 60 on 2020-01-01, 59 on 2020-03-01, 58 on 2020-06-01, 50 on
2020-11-28, 49 on 2021-02-01 and 47 on 2021-08-01. The distances are 60, 92,
180, 65 and 181 days. The 180-day distance does not split; the 181-day distance
does. The first segment has five points and a slope of −10.99 per year, drawn
from 2020-01-01 (60.86) to 2021-02-01 (48.92). The second segment is one point
without a line. The reported slope is the global one, −9.28 per year, with
R² 0.9434 and 95 % CI [−12.43, −6.12].

Decided 2026-10-07 (formerly OD-3): this behaviour stays. The methodology page was corrected to describe it: segments split at gaps over 180 days only, one line per fitted segment, and the global slope as the reported number.

Regression evidence: [rolling tests](../../tests/core/stats/rolling.test.ts),
[rolling fixture tests](../../tests/parity/rolling.parity.test.ts),
[segment tests](../../tests/core/stats/segments.test.ts) including the strict
180-day boundary, [segment fixture tests](../../tests/parity/segments.parity.test.ts),
[slope-line tests](../../tests/core/stats/slopeLines.test.ts) for per-segment
lines, and [cohort screening tests](../../tests/core/cohort/screening.test.ts) for
the window lines of a cohort cell,
[rolling line tests](../../tests/core/stats/rollingLines.test.ts) for the drawn
stretch, the window statistics and the `rolling_*` export columns, and
[summary fixture tests](../../tests/parity/summarize.parity.test.ts), which pin
the reported slope and reason in `rolling` and `gap-split` mode to the same
values as `global` for three patients. No dedicated regression test asserts
that R² and the confidence bounds equal the global OLS values in these modes,
the window and segment statistics, the single-window case at exactly 730 days,
or the global fallback line.

