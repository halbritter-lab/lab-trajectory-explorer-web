# Method reference: Clinical events and censoring

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Clinical events

Clinical events are patient-level rows imported from an `events` sheet or a
separate event file. `normalizeClinicalEvents` reads the cells and
`validateClinicalEvents` accepts or rejects each row. Accepted events feed two
separate policies: optional display-fit censoring (below) and the fixed
endpoint filter (see "Observed endpoints and individual prediction").

### Fields

Header matching ignores case and separators (`patient_id`, `Patient ID` and
`patientID` are the same header). Two headers that differ only in case or
separators make the import fail ("Ambiguous columns … Rename one of them.").
Two different accepted headers for one field (for example `type` and
`EventType`, or `date` and `Datum`) are both accepted: the header listed first
in the table is used, the other column is ignored, and a table-level warning
names both, as in the lab sheet.

| Field | Accepted headers | Required | Content |
| --- | --- | --- | --- |
| `patientId` | `patientId`, `PatientID` | yes | Number or text; surrounding spaces are dropped. A numeric text that survives a round trip unchanged (`12`, not `012` or `12.0`) is stored as a number. |
| `type` | `type`, `Type`, `EventType`, `Typ` | yes | One of the type tokens below. |
| `date` | `date`, `Date`, `EventDate`, `Datum` | yes | Event date; for dialysis the start date. |
| `title` | `title`, `Title`, `Label`, `Titel` | yes | Free text shown in tables and charts. |
| `description` | `description`, `Description`, `Beschreibung` | no | Free text. |
| `endDate` | `endDate`, `EndDate`, `EndDatum` | no | End of a dated interval. |
| `intent` | `intent`, `Intent` | no | Dialysis only; one of the intent tokens below. |

A table without one of the four required columns is not imported; the error
names the missing columns. A table with a `referenceDate` column, or with a
`label` column but neither a type column nor another title column, is treated
as the former annotation schema and is not imported ("Legacy annotation schema
is no longer supported. Use patientId,type,date,title."). Both conditions stop
the import with an error; they are not row-level rejections.

Text cells are trimmed. An empty or blank cell counts as missing. No field is
inferred from the title or description.

### Type and intent vocabulary

| Field | Tokens | Matching | Empty cell |
| --- | --- | --- | --- |
| `type` | `kidney_transplant`, `dialysis`, `other` | Case-insensitive after trimming; stored in lower case. No synonyms: `transplant`, `kidney transplant` and `Dialyse` are rejected. | Row rejected (`missing_required`). |
| `intent` | `acute`, `chronic`, `unknown` | Case-insensitive after trimming; stored in lower case (decided 2026-10-07, formerly OD-7): `Chronic` is `chronic`. No synonyms: `permanent` is rejected. | Dialysis: stored as `unknown`. Other types: stored as no intent. |

A non-empty intent on a `kidney_transplant` or `other` event rejects the row,
even when the value is a valid token. A `kidney_transplant` event stores no
intent. Whether a dialysis event counts as kidney replacement therapy depends
only on `intent = chronic`; the title is not read.

### Dates

`date` and `endDate` use the same reader as lab dates (`parseImportDate`).
Accepted forms are a spreadsheet date cell, `YYYY-MM-DD` (also with `/`),
`DD.MM.YYYY`, and `DD/MM/YYYY`, which is always read day-first. A time of day
after the date is accepted and discarded. A number is read as an Excel serial
date (1900 system) when it lies within 10000-80000 (1927-05-18 to 2119-01-11);
a whole number from 1900 to 2100 is rejected as a bare year. Impossible
calendar days (`31.02.2024`), month-first dates that cannot be day-first
(`03/15/2024`), two-digit years and `DD-MM-YYYY` are not dates. An accepted
`date` or `endDate` after the import day or before 1927-05-18 gives a warning
and the event is kept unchanged (since 2026-11-22; see
[Dates](import-and-values.md#dates)).

Every accepted date is the written calendar day at midnight UTC. Events
therefore have day resolution, and so do lab dates.

Range rules:

- `endDate` earlier than `date` rejects the row. `endDate` equal to `date` is
  accepted and describes a one-day interval.
- A `kidney_transplant` event with any `endDate` rejects the row.
- `dialysis` and `other` events may carry an `endDate`. It is used for acute
  and unknown-intent dialysis only; see below for chronic dialysis.

### Rejection reasons

Checks run in this order; the first failing check gives the reason. A rejected
row is not imported and is listed under "Rejected event rows" with a sentence
that names the offending value.

| Order | Reason | Condition |
| --- | --- | --- |
| 1 | `missing_required` | `patientId`, `type`, `date` or `title` is empty. |
| 2 | `invalid_type` | `type` is not one of the three tokens. |
| 3 | `invalid_date` | `date` or `endDate` is present but not a readable date. |
| 4 | `invalid_intent` | Dialysis with an intent outside the vocabulary, or any intent on a non-dialysis event. |
| 5 | `invalid_date_range` | `endDate` before `date`, or a kidney transplant with an `endDate`. |

The reason `unsupported_legacy_schema` is declared and has a message, but no
row receives it: the legacy schema stops the whole import as described above.

### Warnings on accepted events

An accepted event carries at most one warning, the first that applies:

| Order | Warning | Condition | Consequence |
| --- | --- | --- | --- |
| 1 | `unknown_patient` | No lab row has this `patientId`. | The event is kept and listed. It affects no fit and no endpoint, because both are evaluated per patient series. |
| 2 | `unknown_dialysis_intent` | Dialysis with intent `unknown` or empty. | Display fit: per the unknown-dialysis policy. Endpoints: no effect. |
| 3 | `unresolved_dialysis_interval` | Acute dialysis without `endDate`. | No interval is excluded anywhere. |

Because only one warning is stored, an acute dialysis without end date for a
patient without labs shows `unknown_patient` only. For analysis, events are
attached to a patient by the text form of the patient ID. The workbook export
lists the events of the exported patients with type, date, title,
description, end date, intent and warning.

Regression evidence: [event import tests](../../tests/core/events/events.test.ts),
[date reader tests](../../tests/core/parse/dates.test.ts) and
[header tests](../../tests/io/headers.test.ts). The event import tests cover
case-insensitive intent matching and the warning for two accepted headers of
one event field. No dedicated regression test for `endDate` equal to `date`
or for the warning order beyond `unknown_patient`.

### Display-fit censoring and exclusion

Display-fit censoring decides which measurements the displayed slope, fit line
and cohort summary of one parameter column use. It is configured per column in
the `censoring` section of the fit configuration and implemented once, in
`clinicalEventExclusionWindow`; fit filtering, per-measurement reasons, charts
and the event table derive from that function. It does not affect endpoints.

Each event yields at most one exclusion window:

| Event | Option | Window removed when the option is on | Reason code (label) |
| --- | --- | --- | --- |
| `kidney_transplant` | `censorAfterKidneyTransplant` | From `date` on, open-ended. | `post_kidney_transplant` ("after kidney transplant") |
| `dialysis`, `chronic` | `censorAfterChronicDialysis` | From `date` on, open-ended. An `endDate` is ignored. | `post_chronic_dialysis` ("after chronic dialysis start") |
| `dialysis`, `acute`, with `endDate` | `excludeAcuteDialysisPeriods` | `date` through `endDate`. | `acute_dialysis` ("acute dialysis interval") |
| `dialysis`, `acute`, without `endDate` | - | Nothing. | - |
| `dialysis`, `unknown` | `unknownDialysisPolicy = flag-only` | Nothing. | - |
| `dialysis`, `unknown` | `unknownDialysisPolicy = exclude-dated-interval` | `date` through `endDate`; nothing without an `endDate`. | `unknown_dialysis_interval` ("dialysis of unknown intent") |
| `dialysis`, `unknown` | `unknownDialysisPolicy = censor-from-start` | From `date` on, open-ended, with or without `endDate`. | `unknown_dialysis_interval` |
| `dialysis`, `unknown`, with `endDate` | `unknownDialysisPolicy = dated-interval-or-from-start` (CKD progression since 2026-11-22) | `date` through `endDate`. | `unknown_dialysis_interval` |
| `dialysis`, `unknown`, without `endDate` | `unknownDialysisPolicy = dated-interval-or-from-start` | From `date` on, open-ended. | `unknown_dialysis_open` ("after dialysis start of unknown intent without end date") |
| `other` | - | Nothing; display only. | - |
| First `kidney_transplant` or `chronic` dialysis of the patient | its option off (the values after it included) | From `date` on, open-ended: the values are fitted as a separate segment instead (see [below](#kidney-replacement-therapy-in-every-preset)). | `krt_segment` ("after kidney replacement therapy, fitted as a separate segment") |
| A later `kidney_transplant` or `chronic` dialysis, while the first one is included | its option off | From `date` on, open-ended: it ends the separate segment (OD-50). | `post_kidney_transplant` or `post_chronic_dialysis` |

Boundaries are inclusive at both ends. A measurement on the event date is
removed; a measurement on the end date of an interval is removed; the first
measurement after the end date is kept. Comparison is by timestamp, which is
the UTC calendar day because imported dates have day resolution. Several
events act as the union of their windows, so the earliest enabled open-ended
window ends the fitted series. A chronic dialysis that was later stopped
(`endDate` set) still censors every later measurement; no warning is shown.

Windows remove exact measurements before time balancing, so post-event values
never enter a monthly or quarterly median. Removed measurements stay in tables
and charts, drawn as grey open circles, and count toward `nNumeric` but not
`nFitted`. The workspace fit models do not split a fit at events: segmented
OLS splits at measurement gaps only.

Drawing and listing (display only, since 2026-11-21). With "Events" switched
on, every event is a dashed vertical line at `date`. An event with an
`endDate`, of any type, is in addition a shaded band from `date` to `endDate`
in the patient chart, and in the overlay for the highlighted patient; the
time range of the chart then reaches to the end date. The band is drawn
whether or not a censoring option uses the interval. The measurement table
of the patient view carries the patient's events as set-off rows in date
order, an event before the measurements of its own day, and the card "Events
for this patient" lists them by date (events of one date in file order).
Counts, fits and exports are unaffected.

Since 2026-11-22 (issue #70) the charts of the Trajectories table draw the
patient's events too, under the same "Events" switch, which the table's
Display menu now offers as well (off by default). The time range of a table
chart is fixed (days 0 to the longest series of the column, from the patient's
first measurement of the parameter), so it is not widened for events: an
event dated inside that range is a dashed line, an event with an `endDate` is
in addition a band clipped to the range (an interval that starts before the
first measurement and reaches into the range shows only its part inside), and
an event wholly outside the range is not drawn. The chart's tooltip and
accessible name list or count the drawn events.

Defaults:

- When a caller passes no censoring configuration, every option is on and the
  unknown-dialysis policy is `dated-interval-or-from-start` (until 2026-11-22
  `exclude-dated-interval`). In the app only the event table uses this
  default (next paragraph).
- General exploration, Theil–Sen robust trend and Acute review (since
  2026-11-22, owner decision `censor`): censoring after kidney transplant and
  after chronic dialysis on, acute dialysis intervals not excluded,
  unknown-dialysis policy `flag-only`. Until 2026-11-22 all three options were
  off. A column specification without a fit configuration falls back to
  General exploration (`cohortSeriesSpec`).
- CKD progression: all three options on, unknown-dialysis policy
  `dated-interval-or-from-start` (since 2026-11-22, owner decision `dial`;
  `exclude-dated-interval` before).

The "Effect when enabled" column of the loaded-events table comes from
`effectForEvent`, which evaluates the event with the no-configuration default.
It shows `censor from event date` (transplant), `censor from dialysis start`
(chronic dialysis), `exclude dialysis interval` (acute with end date),
`exclude dialysis interval, unknown intent` (unknown intent with end date),
`censor from dialysis start, unknown intent without end date` (unknown intent
without end date, since 2026-11-22; `warning, not excluded from fit` before),
`warning, not excluded from fit` (acute without end date) and `display only`
(other). It does not reflect the active column configuration, the
`flag-only`, `exclude-dated-interval` and `censor-from-start` policies, the
separate segment after kidney replacement therapy, or the endpoint filter.

Per-measurement reasons: each measurement records every distinct reason whose
window contains it, in the stored event order, followed by `aki` for AKI
windows; a bound is additionally marked `censored-value` first. Tables and
chart tooltips list all of them. The window `krt_segment` of the separate segment comes after the windows of
all events, so a value after a later KRT event reads `krt_segment,
post_chronic_dialysis` (for example). `primaryExclusionReason` defines the
precedence `post_kidney_transplant` > `post_chronic_dialysis` >
`krt_segment` > `acute_dialysis` > `unknown_dialysis_interval` >
`unknown_dialysis_open` > `aki` for callers that need a single reason; no
current view or export calls it. With fit model "No fit" the
measurement table shows only the `censored-value` reason.

Note on measurements a fit runs across (since 2026-11-17,
`fitInclusionCaveat` in `src/workspace/labels/fitInclusion.ts`): a display
note, not a rule of the fit. No slope, count, badge of another kind or export
column changes. It is shown beside a slope in the table and the patient view
when all of these hold:

- the parameter has an eGFR unit or is a serum creatinine series that AKI
  detection accepts (`isAkiCreatinineSource`);
- Trend is on, the fit model is not "No fit" and the slope is finite;
- at least one measurement that the column does not exclude lies in a window
  of the list below.

Windows, in the order in which a measurement is assigned to exactly one of
them: after kidney transplant, after chronic dialysis start, acute dialysis
interval, dated dialysis of unknown intent (the event windows of the table
above with every option on and the policy `exclude-dated-interval`), then the
AKI windows drawn for the column (its own window length). Boundaries are
inclusive as above. Counted are the column's dated numeric measurements before
time balancing; a bound is already excluded and is not counted. The text
reads "Fit includes 1 value during acute dialysis, 3 values in an AKI
window". Dialysis of unknown intent without an end date gives no window and
no note here (it has its own warning, below). The note disappears once the
matching option is on, because those measurements are then excluded. Since
2026-11-22 a value after a kidney transplant or chronic dialysis start is
never part of the fit (censored, or fitted as the separate segment), so the
two first phrases of the list no longer occur.

Example: eGFR on 2020-01-01, 2021-01-01 and 2022-01-01, transplant on
2021-06-01, General exploration with Trend on: since 2026-11-22 the cell
reads "2 of 3 fitted" and shows no note (until then: "Fit includes 1 value
after kidney transplant", and "2 of 3 fitted" only with "Censor after kidney
transplant" ticked). Under monthly or quarterly medians the cell reads "n=8,
2 quarterly medians fitted" instead (patient view: "2 quarterly medians
fitted (8 measurements) over … days"), because the fitted points are then
medians and not measurements.

Warning on undated dialysis of unknown intent (since 2026-11-22, owner
decision `dial`, `openUnknownDialysisWarning` in the same file): when the
column leaves values out with the reason `unknown_dialysis_open`, the cell
and the patient view show the amber note "2 values after dialysis of unknown
intent left out" (the count of the cell's measurements with that reason,
bounds included), explaining that the dialysis has no end date and may have
been maintenance dialysis, and that endpoints still use the values. It is
shown with Trend on, beside the note above (joined by ";" when both apply),
for every parameter; display only. The window is open-ended: no 90-day or
other limit is applied (**Open decision OD-54**).

Display-fit censoring and endpoint filtering are separate policies:

| | Display fit | Endpoint filter |
| --- | --- | --- |
| Configurable | Per column; four options. | No; fixed. |
| Kidney transplant, chronic dialysis | Removed from `date` on when the option is on (every preset since 2026-11-22); with the option off, fitted from the first such event on as a separate segment. | Always removed from the earliest such `date` on; reported as kidney failure reached. |
| Acute dialysis with `endDate` | Interval removed when the option is on. | Interval always removed. |
| Acute dialysis without `endDate` | Not removed. | Not removed. |
| Unknown-intent dialysis | Per policy: not removed, dated interval removed, removed from `date` on, or (CKD progression) the dated interval and, without an end date, everything from `date` on. | Never removed; never kidney failure reached. |
| AKI windows, time balancing | Applied when configured. | Never applied. |
| Bounds (`<x`, `>x`) | Excluded. | Excluded. |

Example: a dialysis with unknown intent from 2020-02-01 to 2020-02-10 under
the CKD progression preset removes the eGFR values of 2020-02-01 and
2020-02-10 from the displayed slope, while both values remain endpoint input
and can start or confirm an observed G4/G5 event. The event table shows
"exclude dialysis interval, unknown intent" for it in either case. Without
the end date (since 2026-11-22) the same dialysis removes every value from
2020-02-01 on from the slope and the event table shows "censor from dialysis
start, unknown intent without end date"; the values remain endpoint input,
and the dialysis is still never kidney failure reached.

Regression evidence: [fit exclusion tests](../../tests/core/events/fitExclusions.test.ts),
[event effect tests](../../tests/core/events/events.test.ts),
[cohort cell tests](../../tests/core/cohort/screening.test.ts),
[segment and tier tests](../../tests/core/cohort/krtSegmentAndTier.test.ts) and
[reason precedence test](../../tests/core/fitPipeline/types.test.ts). The fit
exclusion tests cover `flag-only`, `exclude-dated-interval`,
`censor-from-start` and `dated-interval-or-from-start` on one undated
unknown-intent dialysis. No regression test exercises the ignored
chronic-dialysis `endDate`.

### Kidney replacement therapy in every preset

Owner decision `censor` of 2026-11-22 (Levin 2020: KRT is a kidney-failure
endpoint; KDIGO 2024, S176: non-steady-state conditions as a source of eGFR
error): values after a kidney transplant or the start of chronic
(maintenance) dialysis are shown but are not part of fits of native kidney
function, in every preset. Endpoints already stopped there (2026-10-08) and
are unchanged.

- **Default.** Every preset has "Censor after kidney transplant" and "Censor
  after chronic dialysis" ticked; the values from the event date on
  (inclusive) are grey open circles with the reason "after kidney transplant"
  or "after chronic dialysis start". The censoring applies to every parameter
  of the column settings, not only to kidney function (**Open decision
  OD-51**), so the group
  "Clinical events & censoring" is shown for every parameter; the AKI
  options only for eGFR and creatinine series or once switched on.
- **Inclusion, as an explicit option.** Unticking the option of the
  patient's first KRT event (transplant or chronic dialysis, the earliest
  date; of several on one date the first in the file) does not let the fit
  run across it. The column's own fit still ends there: the values from that
  date on carry the reason `krt_segment` and are fitted as a separate
  segment (`fitKrtSegment`, `src/core/cohort/krtSegment.ts`) with the
  column's estimator (OLS, or Theil–Sen; rolling and segmented OLS fit the
  segment with OLS) and time balancing, after the column's other windows
  (AKI windows, dialysis intervals). The segment ends at the next KRT event,
  whose values are then in no fit whatever its option (**Open decision
  OD-50**). When the first
  KRT event's option is on, it censors and no segment is formed, even if a
  later event's option is off. The settings say so under the two options.
- **What the segment is.** An additional result, like the before/after
  comparison: slope, interval, counts, rapid-decline flag, slope tier,
  endpoints and the cohort mixed models stay those of the values before the
  first KRT event (**Open decision OD-52**). The table cell (full and compact layout, and the
  tooltip "Measurement details" of the minimal one) and the patient view
  state it ("After kidney transplant (01/06/2021), fitted as a separate
  segment: -4.00 …/year (3 fitted, 3 dates, over 365 days, bounds […]). Not
  native kidney function; the slope above uses the values before it."), the
  patient chart draws its line dash-dot on a linear value axis (not on a
  logarithmic one, which has no segment fit; in the overlay only for the
  highlighted patient, like event bands), and the export has the columns
  `krt_segment_start` to `krt_segment_ci_high` (see the
  [workbook columns](fit-input-presets-and-time-balancing.md#segment-after-kidney-replacement-therapy-and-slope-tier)).
  Without a fit (Trend off or fit model `none`) there is no segment.
- **Before/after comparison.** Its points are the column's available points
  and, with the values after KRT included, those of the segment, so a
  comparison anchored at the transplant has an after side only once the
  option is unticked (see [the comparison](anchor-comparison.md)).
- **Saved settings and older workbooks.** A configuration saved under General
  exploration or Theil–Sen before 2026-11-22 no longer matches the preset and
  is kept with its values as custom settings, that is with both options
  unticked: its values after KRT are then fitted as the separate segment, not
  censored, and not across (**Open decision OD-53**). An older workbook applied with "Apply
  settings from an export" behaves the same, and so do CKD progression
  settings saved before, which keep the unknown-intent policy
  `exclude-dated-interval`.

Recomputed example (`tests/core/cohort/krtSegmentAndTier.test.ts`): eGFR 60,
55, 50 and 44 on 1 January 2018 to 2021, a kidney transplant on 2021-06-01,
then 70, 68 and 66 on 2021-09-01, 2022-03-01 and 2022-09-01. General
exploration (OLS): slope −5.30 per year from 4 fitted dates over 1096 days
(`n = 7`, `n_fitted = 4`), slope tier "reliable"; until 2026-11-22 the fit
ran across the transplant and gave +2.46 per year. Theil–Sen: −5.17 per year
on the same four values. Unticking "Censor after kidney transplant" leaves
the slope at −5.30 and adds the segment: `krt_segment_start = 2021-06-01`,
3 fitted dates over 365 days, slope −4.00 per year. A chronic dialysis on
2022-06-01 with its option also off ends the segment: 2 fitted values, and
the value of 2022-09-01 reads `krt_segment, post_chronic_dialysis`.

Demo workbook (`public/test_labs.xlsx`, General exploration, OLS), the
slopes that change: patient 13 (transplant 2022-07-01), imported eGFR
−12.83 per year (interval −13.32 to −12.34, 6 of 9 fitted; was +4.37) and
"rapid ↓"; the computed CKD-EPI 2021 eGFR −11.87 (was +2.58); creatinine
+0.69 mg/dl per year (was −0.03). Patient 14 (transplant 2021-03-15):
imported eGFR −10.14 from 3 dates over 360 days, an uncertain slope (was
+25.29 over five values); computed eGFR −14.61 (was +34.18). Patient 9
(chronic dialysis 2024-04-15): eGFR −8.50, interval −9.07 to −7.93, 8 of
10 fitted (was −7.73, −8.47 to −7.00); creatinine +0.19 (was +0.22).
Theil–Sen: patient 13 eGFR −12.84 (was −2.71), patient 14 −10.15 (was
+31.12), patient 9 −8.57 (was −7.97). No other patient has a value after an
event. CKD progression gives the same slopes as before on the demo, because
its one dialysis of unknown intent (patient 9) has an end date.

