# Method reference: Reason codes, slope reliability and the rapid-decline flag

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Reason codes and the slope reliability rule

Two separate mechanisms describe the quality of a slope. The `reason` field is
produced by the series summary and exported as `reason`. The reliability rule
is the application's own check on the fitted points; it drives the notes in the
interface and the `unstable_slope` export column. The two can disagree, and the
reliability rule is the one that reflects the points actually fitted.

### Reason precedence

`summarizeByBezeichnung` sets `reason` by the first matching row.

| Order | Condition | `reason` | Slope |
| --- | --- | --- | --- |
| 1 | No dated numeric row (`nNumeric = 0`), or the patient has no row of the series | `no_numeric_values` | none |
| 2 | Fit model is `none` | `n_below_threshold` | none |
| 3 | Fewer than two exact rows, counted before windows | `n_below_threshold` | none |
| 4 | The estimator has too few points after windows and balancing: fewer than two for OLS, fewer than three for Theil-Sen | `n_below_threshold` | none |
| 5 | Raw span (`spanDays`) below 365 days | `span_too_short` | normally present |
| 6 | Otherwise | none (`null`) | normally present |

Notes on the table:

- Row 2 applies whatever the number of measurements, so `n_below_threshold`
  alone does not mean that data are sparse.
- Row 5 uses the raw span over all dated numeric rows, including bounded rows
  and rows later removed by windows. It does not use the fitted span.
- An exact two-point OLS fit reaches row 5 or 6 with a slope and `r2 = 1`.
- Rows 5 and 6 are also reached when the estimator returned no slope because
  all fitted points share one timestamp. The kernel reason
  `identical_timestamps` is not a summary reason and is replaced by
  `span_too_short` or by no reason, depending on the raw span.

Two same-day values and nothing else give: no slope, `reason = span_too_short`,
`nFitted = 2`, `fittedSpanDays = 0`. Three same-day values after an earlier
value was excluded, with a raw span of 731 days, give: no slope, no reason,
`nFitted = 3`, `fittedSpanDays = 0`.

### Reliability rule

`isUnstableSlope` (`src/core/stats/slopeQuality.ts`) evaluates, in this order:

1. Fit model `none`: not unstable. There is no slope to qualify.
2. `reason` is `no_numeric_values` or `n_below_threshold`: unstable.
3. `nFittedDates < 3`: unstable, that is fewer than three distinct calendar
   days among the fitted points.
4. `fittedSpanDays < 365`: unstable.
5. Otherwise unstable only if `reason` is `span_too_short`. For the reachable
   slope modes the fitted span never exceeds the raw span, so this step adds
   nothing after step 4.

Step 3 catches the exact two-point fit and series that balancing or windows
reduced to two points. It counts distinct dates, not fitted points (decided
2026-11-05, issue #34): repeated measurements on one day add no information
about the change over time. Example: 40, 40.2 and 39.8 on 2020-01-01 and 30
on 2021-01-01 under General exploration give `nFitted = 4`,
`nFittedDates = 2`, `fittedSpanDays = 366` and an OLS slope of -9.98 per year
with bounds [-10.97, -8.99]. Until 2026-11-05 the rule counted `nFitted` and
called this slope reliable; it is now unstable and `unstable_slope` is `yes`.
Under balancing one bin has one representative date, so `nFittedDates`
equals `nFitted` there. Step 4 uses 365 whole days, truncated, not 365.25: a
fitted span from 2021-01-01 to 2022-01-01 is 365 days and passes; 2021-01-01 to
2021-12-31 is 364 days and is unstable; 2020-01-01 to 2020-12-31 is 365 days
and passes because 2020 is a leap year. The rule does not look at R², the
confidence bounds or the size of the slope.

### Labels

`slopeQualityLabel` (`src/workspace/labels/qualityLabels.ts`) turns the rule
into a note. It returns nothing when the rule is not met. Otherwise the first
matching row applies.

| Order | Condition | Text in table and patient view | Colour |
| --- | --- | --- | --- |
| 1 | `reason = no_numeric_values` | No numeric measurements | grey |
| 2 | `nFitted = 0` | No fitted measurements | grey |
| 3 | `reason = n_below_threshold` | n < 3 | grey |
| 4 | `fittedSpanDays = 0` | All fitted measurements on one date | grey |
| 5 | `nFittedDates < 3` and `nFitted >= 3` (since 2026-11-05) | < 3 dates, uncertain slope | amber |
| 6 | `nFitted < 3` | n < 3, uncertain slope | amber |
| 7 | Otherwise | Follow-up < 1 year, uncertain slope | amber |

Grey means that no slope exists; amber that a slope exists and is
unreliable. Row 2 covers a series whose points were all removed by bounds or
windows. Row 3 is shown with its fixed wording also when one fitted point
remains. With fit model `none` the cell shows "Fit model disabled" and no note.
In the overlay, a fit line whose note is amber and whose slope exists is dotted
instead of dashed, and the plot states how many fits are affected.

`unstable_slope` in the cohort and patient slope export is `yes` exactly when
the rule is met and blank otherwise. It is blank for fit model `none`. It does
not distinguish grey from amber cases; `slope` is blank in the grey ones.

Row 4 covers fitted points that all share one calendar day (decided
2026-10-07, formerly OD-9). No slope exists then, and the note reads "All
fitted measurements on one date" in grey with the explanation "All
measurements used for the fit share one date, so no slope exists." Before, two
same-day values gave the amber note "n < 3, uncertain slope" and three or
more gave "Follow-up < 1 year, uncertain slope", both stating that a slope was
fitted. Two same-day values under Theil-Sen are below its minimum and keep the
grey "n < 3" note of row 3. The numeric core is unchanged: the summary still
reports `reason = span_too_short` or no reason for such a series, `slope` is
blank and `unstable_slope` is `yes`. The cell shows "No fit available" next to
the note, and the overlay draws no line and does not count the series as
uncertain.

Regression evidence: [summary tests](../../tests/core/stats/summarize.test.ts),
[summary fixture tests](../../tests/parity/summarize.parity.test.ts),
[quality label tests](../../tests/workspace/labels/qualityLabels.test.ts) and
[export record tests](../../tests/core/cohort/exportRecords.test.ts) for
`unstable_slope`. The quality label tests cover the one-date note. No
dedicated regression test covers the identical-timestamp case in the summary
or the 364/365-day boundary.

## Rapid eGFR decline flag

`rapidEgfrDeclineModule`
(`src/core/domains/nephrology/rapidEgfrDeclineModule.ts`) marks a table cell
with "rapid ↓" as a screening signal for research review.

A cell is flagged when all of the following hold:

- the threshold is greater than 0;
- the series unit is recognised as an eGFR unit;
- the cell has a slope (a finite number);
- `slope < −threshold`. The comparison is strict: a slope of exactly −5 with a
  threshold of 5 is not flagged.

The threshold is a per-column setting in mL/min/1.73 m² per year. Its default is
5 (`DEFAULT_RAPID_EGFR_DECLINE`). The input has a minimum of 0 and a spinner
step of 0.5; the step is not enforced, so any non-negative number typed is
stored as entered. A negative entry is stored as 0, and so is an empty or
non-numeric one. A
threshold of 0 disables the flag. Selecting a preset resets the threshold to 5.
Changing the threshold marks the column configuration as custom (see "Fit
presets").

The slope is the cell's reported display slope under the column's current
settings: after bounds, censoring and exclusion windows and time balancing,
with the selected estimator. For rolling and segmented OLS it is the global OLS
slope. It is not the endpoint-only fit, so the flag can change when the preset
changes while the endpoint results do not.

A series is treated as eGFR when its unit is mL/min/1.73 m². The unit is compared after
lower-casing, removing whitespace, and reading a decimal comma as a point and
`²` or `^2` as `2`; the result must be one of the four accepted spellings
listed under "Eligibility and kidney failure reached" (`isEgfrUnit`).
The parameter name is not checked. A clearance in `ml/min` is not eGFR and is
never flagged (one rule for all eGFR features since 2026-10-07, formerly
OD-20; see "Observed endpoints and individual prediction").

The flag does not consult the reliability rule, the confidence bounds, the
number of fitted points or the fitted span. Two values a few weeks apart that
differ enough produce the same flag as a multi-year decline. The amber
reliability note, when present, is shown next to the flag but does not
suppress it.

Decided 2026-10-07 (formerly OD-10): the flag stays without a reliability gate, as decided on 2026-10-06. The methodology page was corrected: it no longer presents the flag as a test for a sustained decline and tells the reader to read it with the reliability note.

In the table the badge appears only while the fit is shown for that column; its
tooltip states the comparison, for example "Rapid decline: slope < -5 /year".
The export does not depend on that display toggle: `rapid_progression` is `yes`
for a flagged cell and blank otherwise, and the `settings` sheet records the
threshold as `rapid_egfr_threshold`.

Regression evidence:
[rapid-decline module tests](../../tests/core/analysis/rapidEgfrDeclineModule.test.ts),
[export record tests](../../tests/core/cohort/exportRecords.test.ts) for
`isRapidEgfrDecline` and `rapid_progression`, and
[workspace export tests](../../tests/workspace/export.test.ts) for
`rapid_egfr_threshold`, and the
[decision tests](../../tests/core/endpoints/decisions20261007.test.ts) for a
clearance in ml/min. No dedicated regression test covers a slope exactly equal
to the negative threshold or the absence of a reliability gate.


