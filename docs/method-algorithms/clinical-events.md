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
(`03/15/2024`), two-digit years and `DD-MM-YYYY` are not dates.

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
| `other` | - | Nothing; display only. | - |

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

Defaults:

- When a caller passes no censoring configuration, every option is on and the
  unknown-dialysis policy is `exclude-dated-interval`. In the app only the
  event table uses this default (next paragraph).
- General exploration, Theil–Sen robust trend and Acute review: all three
  options off, unknown-dialysis policy `flag-only`. A column specification
  without a fit configuration falls back to General exploration
  (`cohortSeriesSpec`).
- CKD progression: all three options on, unknown-dialysis policy
  `exclude-dated-interval`.

The "Effect when enabled" column of the loaded-events table comes from
`effectForEvent`, which evaluates the event with the no-configuration default.
It shows `censor from event date` (transplant), `censor from dialysis start`
(chronic dialysis), `exclude dialysis interval` (acute with end date),
`exclude dialysis interval, unknown intent` (unknown intent with end date),
`warning, not excluded from fit` (acute or unknown intent without end date) and
`display only` (other). It does not reflect the active column configuration,
the `censor-from-start` policy, or the endpoint filter.

Per-measurement reasons: each measurement records every distinct reason whose
window contains it, in the stored event order, followed by `aki` for AKI
windows; a bound is additionally marked `censored-value` first. Tables and
chart tooltips list all of them. `primaryExclusionReason` defines the
precedence `post_kidney_transplant` > `post_chronic_dialysis` >
`acute_dialysis` > `unknown_dialysis_interval` > `aki` for callers that need a
single reason; no current view or export calls it. With fit model "No fit" the
measurement table shows only the `censored-value` reason.

Display-fit censoring and endpoint filtering are separate policies:

| | Display fit | Endpoint filter |
| --- | --- | --- |
| Configurable | Per column; four options. | No; fixed. |
| Kidney transplant, chronic dialysis | Removed from `date` on when the option is on. | Always removed from the earliest such `date` on; reported as kidney failure reached. |
| Acute dialysis with `endDate` | Interval removed when the option is on. | Interval always removed. |
| Acute dialysis without `endDate` | Not removed. | Not removed. |
| Unknown-intent dialysis | Per policy: not removed, dated interval removed, or removed from `date` on. | Never removed; never kidney failure reached. |
| AKI windows, time balancing | Applied when configured. | Never applied. |
| Bounds (`<x`, `>x`) | Excluded. | Excluded. |

Example: a dialysis with unknown intent from 2020-02-01 to 2020-02-10 under
the CKD progression preset removes the eGFR values of 2020-02-01 and
2020-02-10 from the displayed slope, while both values remain endpoint input
and can start or confirm an observed G4/G5 event. The event table shows
"exclude dialysis interval, unknown intent" for it in either case.

Regression evidence: [fit exclusion tests](../../tests/core/events/fitExclusions.test.ts),
[event effect tests](../../tests/core/events/events.test.ts),
[cohort cell tests](../../tests/core/cohort/screening.test.ts) and
[reason precedence test](../../tests/core/fitPipeline/types.test.ts). No
regression test exercises the `censor-from-start` policy at all, the
`flag-only` policy on an unknown-intent dialysis, or the ignored
chronic-dialysis `endDate`.

