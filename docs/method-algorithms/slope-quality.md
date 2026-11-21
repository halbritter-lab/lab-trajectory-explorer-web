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
   days among the fitted points. `nFitted < 3` is tested as well (since
   2026-11-15). Distinct dates never exceed fitted points, so this changes no
   result of the application; it keeps a caller of the library package that
   passes no `nFittedDates` from getting "stable" for a two-point fit.
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

Interval note (decided 2026-11-17): when the slope has a 95% interval and
zero lies strictly inside it (`ciLow < 0 < ciHigh`), the cell shows the grey
note "Interval includes 0" with the explanation that the measurements do not
establish whether the value rises or falls. It is a display note in the table
and the patient view for every parameter: as a text badge in the table's
minimal and compact layouts (with icons instead of text badges, the sentence
is in the cell's details), and as a line under the interval in the full
layout and the patient view. It is not part of the reliability
rule: `unstable_slope`, the rapid-decline flag and the overlay are unchanged
by it. It is not shown for Theil–Sen bounds below five fitted dates, which
are not a 95% interval, nor when a bound is exactly zero. Example: interval
−25.08 to 12.68 gives the note; −26.01 to −0.72 does not.

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
- the slope does not meet the [reliability rule](#reliability-rule)
  (`isUnstableSlope`; since 2026-11-17);
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

Reliability gate (decided 2026-11-17, replacing the decision of 2026-10-06
and 2026-10-07, formerly OD-10): a slope from fewer than three fitted
measurement dates or from less than 365 days of fitted span carries the amber
reliability note and no flag, and `rapid_progression` is blank for it.
`cohortCellFlags` evaluates the rule on the cell and passes the result to the
module as `unstableSlope`. Counted are fitted points and dates, so under
quarterly medians eight measurements in two quarters are two dates and give no
flag. The flag still does not consult the confidence bounds or R²: a slope
with a wide interval over more than a year is flagged (see the interval note
under "Labels").

Example: eGFR 90 on 2019-01-01 and 80 on 2020-01-01 gives −10.01 per year
from two dates (365 days): `unstable_slope = yes`, `rapid_progression` blank
(before: `yes`). The same two values plus 70 on 2021-01-01 give −9.99 per
year from three dates over 731 days: `rapid_progression = yes`. Three dates
over 364 days give no flag, three dates over 365 days can. Demo data, General
exploration: patient 12 (−7.35 per year, follow-up under one year) loses the
flag; patient 6 (−6.20 per year, interval −25.08 to 12.68, eleven values over
more than a year) keeps it.

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
clearance in ml/min. The module and export record tests cover the reliability
gate. No dedicated regression test covers a slope exactly equal to the
negative threshold.

## Table order, mark filters and displayed decimals

Three rules of the Trajectories table decide which patients are shown, in
which order, and how a slope is written. None changes a computed value. The
order and the filters also decide the rows of the export, which holds the
patients shown in the order shown.

### Order of a sort by slope

Decided 2026-11-21. Under a sort by *Slope* or *Absolute slope* the rows of
the sorted parameter form three blocks, in this order whatever the direction:

1. cells with a slope that does not meet the [reliability rule](#reliability-rule);
2. cells with an **uncertain slope**: a slope exists (a finite number) and the
   reliability rule is met (`unstable_slope = yes`), which are the amber
   cases of the [labels](#labels);
3. cells without a slope.

Blocks 1 and 2 are each sorted by the chosen metric and direction; ties, and
all of block 3, are in patient-ID order. With grouping the blocks form inside
every group. The status line states the number of shown patients in block 2
("1 uncertain slope placed after the reliable ones"). The switch *Uncertain
slopes last* beside it is on by default; switched off, blocks 1 and 2 are one
block sorted by value, as until 2026-11-21, and the status line reads "ranked
among the reliable ones". Note and switch appear only while the table is
sorted by slope or absolute slope and at least one shown patient is in block
2. The switch is not stored with the saved settings. Other metrics (latest
value, measurements, follow-up) are unchanged: values in the chosen
direction, patients without a value last.

Example, demo data, imported eGFR, OLS, General exploration, *Slope:
ascending*. Patient 12 has −7.35 per year over 151 days and is uncertain.
By value alone the order begins 4 (−16.53), 7 (−13.37), 26, 24, 20, 21, 25,
9 (−7.73), 12 (−7.35), 6 (−6.20), with patient 12 at rank 9. With the rule
the order is 4, 7, 26, 24, 20, 21, 25, 9, 6, 27, 22, 17, 19, 23, 2, 28, 18,
16, 15, 11, 8, 1, 13, 14 (+25.29), then 12 at rank 25, then 3, 5 and 10
without a slope. The `cohort` sheet of the export lists the patients in the
same order.

### Filters by mark and event type

The row "Show only" under the status line offers one button per mark that at
least one patient of the current scope carries, with the number of those
patients. The scope is what search, the group filter and "Selected only"
leave. A patient carries a mark when any shown parameter column does:

| Button | A patient carries it when |
| --- | --- |
| Rapid decline | a cell shows the [rapid-decline flag](#rapid-egfr-decline-flag); needs Trend on for that column |
| Uncertain slope | a cell with Trend on has measurements and an uncertain slope as defined above |
| Endpoint reached | a cell reports kidney failure reached by an event, a confirmed observed CKD G4 or G5, or a confirmed 40% or 57% decline; projections and the total percent change do not count |
| AKI | a cell carries the AKI mark of its creatinine series |
| Kidney transplant, Dialysis, Other event | the patient has a clinical event of that type, whatever the shown columns |

Marks of parameters that are not shown as columns are not counted. Several
chosen buttons combine with "and": a patient must carry all of them. The
numbers on the buttons keep referring to the scope before any mark is chosen,
so two chosen marks can show fewer patients than either number. A chosen
button stays visible with 0 when its mark no longer occurs (for example
after Trend was switched off). The filter applies to the table, the overlay,
the patient navigation and the export; the export button then reads "Export
14 of 28 patients (XLSX)". Opening a patient from the Data page clears the
chosen marks together with search and group filter. On a screen up to 600 px
wide the buttons are in the toolbar menu "Show only" instead of a row, with
the number of chosen marks on the menu button.

Example, demo data with eGFR (CKD-EPI 2021) applied and Trend on for all
four default columns: Rapid decline 14, Uncertain slope 3 (patients 3, 5 and
12), Endpoint reached 4, AKI 4, Kidney transplant 3, Dialysis 3, Other event
1.

### Decimals of slopes

Decided 2026-11-21. Every parameter has one number of decimals for its
slopes. `slopeDisplayDecimals` (`src/core/format.ts`) takes the absolute
values of all finite slopes of the parameter over every patient of the
loaded dataset, under the parameter's current analysis settings, and their
median (the mean of the two middle values for an even count). The number of
decimals is the one that gives this median two significant digits:
`1 − e`, where `e` is the decimal exponent of the median (0.0948 = 9.48 ×
10⁻², so e = −2), limited to at least 2 and at most 4. A median of 0.1 or
more gives 2; from 0.01 up to but not including 0.1 gives 3; below 0.01
gives 4. Without any slope, or with a median of exactly 0, it is 2. Search,
filters and grouping do not change the number; another fit method or another
exclusion setting can, because the slopes change.

The number applies to the slope, both bounds of its interval and the
smallest and largest rolling-window slope in the table cell and the patient
view, and on the Cohort models page to the change per year with its
interval, to every row of the coefficient table (estimate and bounds), to
the patient slope SD and to the slope in the preview legend. There it is
computed from the patients' own slopes under the same settings, as if Trend
were on. Values are rounded by the browser's number formatting (`toLocaleString`,
en-GB) to exactly that many decimals, padded with zeros, and never written as
"-0.00"; the slope carries a plus
sign when it is above zero. R², the latest value, the starting level of a
model and all other numbers keep the general display rounding (at most two
decimals, no padding). The rapid-decline tooltip and the charts are
unchanged. Display only: no computed value and no export changes; exports
keep full precision.

Example, demo data, OLS, General exploration. Creatinine [mg/dl]: 27
slopes, median of the absolute values 0.0948, so three decimals. Patient 8:
slope 0.010349 with bounds 0.006869 and 0.013829 is written "+0.010 mg/dl/yr
95% CI [0.007, 0.014]" (until 2026-11-21 "+0.01 [0.01, 0.01]"). Patient 12:
"+0.274 [-1.697, 2.246]". Imported eGFR: median 5.33, two decimals, no cell
changes. In the table's minimal layout the bounds carry the visible label
"95% CI", or "range" where they are a Theil–Sen slope range on fewer than
five fitted dates.

Regression evidence: [formatter tests](../../tests/core/format.test.ts) for
the decimals rule and its boundaries at powers of ten,
[row screening tests](../../tests/workspace/preview-row-screening.test.ts)
for the three blocks and the 364/365-day boundary of "uncertain", and
[table tests](../../tests/workspace/trajectories-screening.test.tsx) for the
order, the status line, the mark buttons with their counts and the decimals
in table and patient view; [model table tests](../../tests/workspace/models/CohortModelTable.test.tsx)
for the decimals on the Cohort models page. The AKI and dialysis buttons and
the "Endpoint reached" conditions other than a transplant event are pinned by
no component test.

