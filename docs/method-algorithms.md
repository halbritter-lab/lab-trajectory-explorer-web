# Implemented method algorithms

This reference records what the application computes today: every rule that
decides which data are analysed, how a number is derived from them, and how a
result is classified. It describes implemented behaviour, including behaviour
that is questionable; it does not describe intended behaviour. Approved
requirements and the reasons behind them are tracked in
[method decisions](remaining-method-decisions.md).

All of it is for research use. No rule here is a claim of clinical validation,
and no projected value is a prognosis.

## How to read this reference

- **Completeness.** A rule that affects a result belongs here with its concrete
  values, units, boundary conventions (inclusive or exclusive, strict or
  non-strict) and a worked example where the arithmetic is not obvious. A
  change to a rule updates this file in the same change; see `CLAUDE.md`.
- **Regression evidence.** Each section, or each subsection of the larger ones,
  names the tests that pin its rules and, where they were identified, the rules
  that no test pins. The sections carried over from earlier versions (Bounded
  measurements, Theil-Sen) and the export-provenance subsection name their
  tests only.
- **Open decisions.** Where implemented behaviour conflicts with user-facing
  documentation or looks unintended, the behaviour is described as it is and a
  marker **Open decision OD-n** follows. Nothing marked this way has been
  changed; each needs an owner decision to change either the code or the
  description. The [list of open decisions](#open-decisions) collects them.
- **Known limitations.** Behaviour the owner has decided not to change for now
  is documented as a limitation, without a marker.
- **Proposed defaults.** A value marked *(proposed)* was chosen during
  implementation and remains open to the owner's revision; see
  [method decisions](remaining-method-decisions.md).
- **Not reachable.** Code that exists only for tests is listed separately and
  is not part of the method description.

Conventions used throughout:

- **Dates are calendar days.** Import keeps the calendar day as written and
  stores it at midnight UTC; a time of day is dropped. Measurements of one day
  share one timestamp, and every elapsed-time rule works in whole days.
- **A year is 365.25 days** wherever elapsed time is converted to years.
- **A series** is one patient, one parameter name and one unit, compared as
  stored after import. Different names or units are never pooled.
- **An exact measurement** is a dated numeric row whose operator is `=`.
  Bounded rows (`<x`, `>x`) are shown and counted as raw rows but enter no fit,
  endpoint, AKI detection or cohort model. A bounded creatinine row still
  yields a derived eGFR bound, and its sex and stated age still feed
  demographics resolution; see
  [bounded measurements](#bounded-measurements-2026-10-06).

Contents:

1. [Import and value interpretation](#import-and-value-interpretation)
2. [Demographics resolution](#demographics-resolution)
3. [Bounded measurements](#bounded-measurements-2026-10-06)
4. [Fit pipeline and fit-input selection](#fit-pipeline-and-fit-input-selection)
5. [Fit presets](#fit-presets)
6. [Time balancing](#time-balancing)
7. [Ordinary least squares](#ordinary-least-squares)
8. [Theil-Sen](#theil-sen-2026-09-23)
9. [Rolling and segmented OLS](#rolling-and-segmented-ols)
10. [Reason codes and the slope reliability rule](#reason-codes-and-the-slope-reliability-rule)
11. [Rapid eGFR decline flag](#rapid-egfr-decline-flag)
12. [eGFR derivation](#egfr-derivation)
13. [KDIGO creatinine AKI detection](#kdigo-creatinine-aki-detection)
14. [AKI fit-exclusion window](#aki-fit-exclusion-window)
15. [Clinical events](#clinical-events)
16. [Observed endpoints and individual prediction](#observed-endpoints-and-individual-prediction)
17. [Cohort mixed models](#cohort-mixed-models)
18. [Cohort-model projections](#cohort-model-projections)
19. [Fit code not reachable from the interface](#fit-code-not-reachable-from-the-interface)

## Open decisions

Each entry is described in full in the section named, with an example where
one applies. The documentation review of 2026-10-07 produced 29 entries; the
owner decided all of them on the same day (see
[method decisions](remaining-method-decisions.md)). Those settled since are
listed under *Resolved decisions* below. Four remain, **OD-11, OD-21, OD-22
and OD-29: to be changed after release 0.3.0.** Their behaviour is unchanged
until then.

| ID | Section | Implemented behaviour that needs a decision |
| --- | --- | --- |
| OD-11 | [Ordinary least squares](#ordinary-least-squares) | The t critical value is a step function above 40 degrees of freedom, untested against a reference in that range. |
| OD-21 | [Cohort mixed models](#cohort-mixed-models) | The exported model `tolerance` is used by no fit, and R packages are not version-pinned. |
| OD-22 | [Cohort mixed models](#cohort-mixed-models) | Numeric or categorical factor type is assigned automatically and cannot be changed. |
| OD-29 | [Cohort mixed models](#cohort-mixed-models) | The default reference level of a factor is taken from all patients of the dataset and can be absent from the fitted series or group, which then cannot be fitted until another reference is chosen. |

### Resolved decisions

Decided by the owner on 2026-10-07 (see
[method decisions](remaining-method-decisions.md)) and settled since, by a
change to the behaviour or, where the behaviour stays, by a correction of the
methodology page. The numbers are not reused.

| ID | Resolution | Section |
| --- | --- | --- |
| OD-1 | Cohort models prepare their measurements with the analysis settings chosen under Trajectories. | [Cohort mixed models](#cohort-mixed-models) |
| OD-2 | Rolling OLS draws its window lines and reports the window statistics; the reported slope stays global. | [Rolling and segmented OLS](#rolling-and-segmented-ols) |
| OD-3 | Segmented OLS stays as implemented; the methodology page describes it. | [Rolling and segmented OLS](#rolling-and-segmented-ols) |
| OD-4 | The three-measurement minimum and the confidence gate stay; the methodology page explains the consequence. | [Observed endpoints and individual prediction](#observed-endpoints-and-individual-prediction) |
| OD-5 | The eGFR formula default stays `off`; the methodology page no longer calls CKD-EPI 2021 the default. | [eGFR derivation](#egfr-derivation) |
| OD-6 | The "Group interaction" text no longer promises p-values. | [Cohort mixed models](#cohort-mixed-models) |
| OD-7 | Dialysis intent is matched without regard to case. | [Clinical events](#clinical-events) |
| OD-8 | Text with three digits after a point is read as a decimal and reported. | [Import and value interpretation](#import-and-value-interpretation) |
| OD-9 | Fitted points on one date get their own "no slope" note. | [Reason codes and the slope reliability rule](#reason-codes-and-the-slope-reliability-rule) |
| OD-10 | The rapid-decline flag stays without a reliability gate; the methodology page says so. | [Rapid eGFR decline flag](#rapid-egfr-decline-flag) |
| OD-12 | Both creatinine conversion constants stay; the methodology page names them. | [eGFR derivation](#egfr-derivation) |
| OD-13 | Creatinine of zero or less takes no part in AKI detection. | [KDIGO creatinine AKI detection](#kdigo-creatinine-aki-detection) |
| OD-14 | Creatinine measured under dialysis is left out of AKI detection. | [KDIGO creatinine AKI detection](#kdigo-creatinine-aki-detection) |
| OD-15 | A derived eGFR inherits the non-exact status of its creatinine row. | [eGFR derivation](#egfr-derivation) |
| OD-16 | The projected age starts from the exact age when the birth date is known. | [Observed endpoints and individual prediction](#observed-endpoints-and-individual-prediction) |
| OD-17 | The projection needs 365 days of follow-up, like the reliability rule. | [Observed endpoints and individual prediction](#observed-endpoints-and-individual-prediction) |
| OD-18 | A confirmed observed G5 always withholds the projection. | [Observed endpoints and individual prediction](#observed-endpoints-and-individual-prediction) |
| OD-19 | The minimum confirmation interval is at most 365 days. | [Observed endpoints and individual prediction](#observed-endpoints-and-individual-prediction) |
| OD-20 | eGFR is recognised by the unit mL/min/1.73 m² everywhere, in four accepted spellings. | [Observed endpoints and individual prediction](#observed-endpoints-and-individual-prediction) |
| OD-23 | The "Group interaction" preset builds a valid numeric factor. | [Cohort mixed models](#cohort-mixed-models) |
| OD-24 | The JavaScript date-parser fallback for attribute birth dates is removed. | [Import and value interpretation](#import-and-value-interpretation) |
| OD-25 | Two accepted headers for one lab or event field produce a warning naming the column used. | [Import and value interpretation](#import-and-value-interpretation) |
| OD-26 | Lab rows without a patient ID are listed as rejected. | [Import and value interpretation](#import-and-value-interpretation) |
| OD-27 | An empty pre-parsed operator beside a number means an exact value. | [Import and value interpretation](#import-and-value-interpretation) |
| OD-28 | Implausible stated ages are reported as `age_implausible`. | [Demographics resolution](#demographics-resolution) |

## Import and value interpretation

This section records how a file becomes analysis rows: which sheets, columns
and rows are read, and how dates, values and units are interpreted. It
describes the behaviour as implemented. Points that conflict with other
documentation or look unintended carry an open-decision marker and are
unchanged until the owner decides.

### Files and sheets

`readWorkbookSheets` decides by the first bytes whether a file is a binary
workbook or text. A file is binary when it starts with a ZIP signature (`PK`
followed by the bytes 03 04, 05 06 or 07 08; xlsx, xlsb, ods) or with the OLE
compound-file signature `D0 CF 11 E0 A1 B1 1A E1` (xls). A CSV whose first
header merely begins with "PK" is therefore text. Binary workbooks keep their
typed cells: numbers stay numbers and date cells become dates.

Every other file is decoded as text by `decodeText`, in this order:

1. A UTF-16 byte-order mark (`FF FE` or `FE FF`) selects UTF-16.
2. A NUL byte within the first 4096 bytes means the file is not treated as
   text; it is handed to the workbook reader unchanged.
3. Strict UTF-8; a leading UTF-8 byte-order mark is dropped.
4. If the bytes are not valid UTF-8, Windows-1252.

Text files are parsed without type inference: every cell reaches the loaders as
its verbatim text. The field delimiter is detected by the SheetJS reader; comma
and semicolon files are covered by tests. The first row of a sheet supplies the
headers and blank cells are read as empty.

Sheet selection in `loadDatasetFromWorkbook` depends on the number of sheets.
Sheet names are compared after header normalisation (see Columns).

- **No sheet:** the dataset is empty and the import fails with "No usable lab
  values in this file."
- **One sheet:** it is the lab sheet whatever its name, including a sole sheet
  named `events` or `attributes`. No events or attributes are read.
- **Two or more sheets:**

  | Role | Normalised sheet names | Fallback |
  | --- | --- | --- |
  | events | `events`, `ereignisse`, `clinicalevents`, `annotations` | none; no events are read |
  | attributes | `attributes`, `attribute`, `patientattributes` | none; no attributes are read |
  | labs | `labs`, `labor`, `labrows`, `labdata` | the first sheet not chosen as events or attributes, otherwise the first sheet |

  For each role the first matching sheet in workbook order is used. Every other
  sheet, including a second sheet matching the same role, is ignored without a
  diagnostic. A workbook with sheets `Sheet1` and `Sheet2` loads `Sheet1` as
  labs and ignores `Sheet2`. A workbook holding only `events` and `attributes`
  reads its first sheet as the lab sheet and fails on its missing lab columns.

Events and attributes can also be uploaded as separate files after the lab
data. Such a file contributes its first sheet only and replaces the
corresponding table; it is not merged with the previous one. A file without
any accepted row is an error and leaves the previous table in place.

A successful lab import replaces the whole dataset: lab rows, events, rejected
event rows and attributes come from the new file, and manual demographic
entries, analysis settings (including the eGFR formula and source), cohort-model
configuration and results, and projection settings return to their defaults. If
the file cannot be read, fails a column check or yields no lab row, the import
stops with an error and the previously loaded dataset stays unchanged.

No maximum file size, row count or patient count is enforced.

### Columns

`normaliseHeader` compares headers after trimming, lowercasing and removing
every character other than `a`–`z` and `0`–`9`. `Patient ID`, `patient_id` and
`PATIENTID` are the same header. Columns that match no accepted header are
ignored in the lab sheet.

The lab sheet accepts these headers (`LAB_COLUMN_ALIASES`):

| Concept | Accepted headers, in order of precedence | Required |
| --- | --- | --- |
| patient ID | `patientId` (= `PatientID`) | yes |
| lab date | `labDate`, `LabDatum` | yes |
| test name | `testName`, `Bezeichnung` | yes |
| unit | `unit`, `Einheit` | yes |
| value | `value`, `Wert` | yes |
| LOINC | `loinc` (= `LOINC`) | no |
| sex | `sex`, `PatientSex` | no |
| stated age at the measurement | `ageAtLab`, `PatientAgeAtLab` | no |
| birth date | `birthDate`, `PatientGeburtsdatum`, `Geburtsdatum` | no |
| pre-parsed number | `valueNum`, `Wert_num` | no |
| pre-parsed operator | `valueOperator`, `Wert_operator` | no |

A lab sheet with data rows that lacks a required column is rejected as a whole;
the error names the missing columns and lists the columns found. `Geschlecht`
is not a lab-sheet header; it is accepted in the attributes table only.

Two accepted headers that differ only in case or separators (`Patient ID` and
`patient_id`) are an import error: "Ambiguous columns … Rename one of them."
Columns that match no accepted header are never checked. A header repeated
verbatim is renamed by the workbook reader (`value_1`) and then ignored without
a diagnostic. The check in `resolveColumns` compares normalised spellings, not
concepts. When
a sheet carries two different accepted headers for one concept, the header
listed first in the table is used and the other column is ignored. A
sheet-level warning names both (decided 2026-10-07, formerly OD-25): a sheet
with both `value` and `Wert` is read from `value` and reports 'Columns "value"
and "Wert" hold the same field; "value" is used and "Wert" is ignored.' A sheet
with both `labDate` and `LabDatum` is read from `labDate`. The attributes table
remains stricter and rejects two sex or two birth-date headers (below).

The attributes table requires `patientId` (= `PatientID`) and at least one
other column. Two demographic concepts are recognised by
`normalizePatientAttributes`:

| Concept | Accepted headers | Stored as |
| --- | --- | --- |
| sex | `sex`, `PatientSex`, `Geschlecht` | attribute `sex` |
| birth date | `birthDate`, `PatientGeburtsdatum`, `Geburtsdatum` | attribute `birthDate` |

Here the check is by concept: two different sex headers, or two different
birth-date headers, are an import error. Every other column is a free attribute
named by its trimmed header. Attribute values are kept as text; a workbook date
cell is stored as its ISO calendar date. A row without a patient ID is rejected
with a diagnostic. For a patient listed twice the first row is used and each
later row is rejected with a diagnostic. A patient without lab rows is kept
with a warning. A stated-age column in the attributes table is an ordinary free
attribute and is not used for age.

**Pre-parsed values.** When the lab sheet has both a pre-parsed number column
and a pre-parsed operator column, the value column is not interpreted at all.
Its text is kept only for display and for the duplicate check. A sheet with
only one of the two columns ignores it and interprets the value column
normally.

- The number is a typed numeric cell, or text converted with JavaScript
  `Number()` after a single decimal comma (`1,2`) is replaced by a point. This
  is wider than the value rules below: a leading `+`, `.5`, exponents including
  `1e+3`, and hexadecimal text (`0x1A` is 26) are accepted. The dot-thousands
  warning described under Values is not issued here: `1.234` is read as 1.234.
  Anything else, including an empty cell and `1,2,3`, gives no number.
- The operator cell is trimmed and must then be exactly `=`, `<`, `>`, `range`
  or `unparseable`. An empty or blank operator cell beside a number means an
  exact value (`=`); beside no number it is `unparseable` (decided 2026-10-07,
  formerly OD-27). `≤` and any other content become `unparseable`.

A row whose operator is not `=` is not an exact measurement. If it carries a
number it is treated like a bounded value: it stays visible and counts toward
raw numeric counts, is excluded from fits, endpoints, AKI detection and cohort
mixed models, and is labelled "censored value (limit, not exact)".

An eGFR value derived from such a creatinine row inherits its operator and is
not exact either; see "eGFR derivation".

**Series identity.** A series is the exact pair of test name and unit. Both are
trimmed; the unit is the canonical spelling chosen under Units. Test names are
not harmonised: `Kreatinin` and `kreatinin` are two series, as are names that
differ in inner spacing. A missing unit is its own series, separate from every
named unit. Rows without a test name are imported and counted but belong to no
selectable parameter. The LOINC column is read and stored; no analysis uses it,
and it does not join or separate series.

### Row acceptance

`loadLabRowsWithDiagnostics` processes the lab sheet row by row.

A row whose patient ID cell is empty or whitespace is not imported. If any
other recognised column of that row holds a value, the row is listed as
rejected ("Patient ID missing; row not imported.") and counts toward the
rejected rows of the import notice (decided 2026-10-07, formerly OD-26). A row
that is empty in every recognised column is skipped without a diagnostic.

For all other rows:

- **Patient ID type.** An ID is numeric only when its text equals the canonical
  text of that number: `7` and a numeric cell 7 are the number 7 and the same
  patient. `0012`, `12.0` and `1e3` remain text and are patients distinct from
  12 and 1000. Lab rows, attribute rows and manual entries are matched by the
  text form of the ID.
- **Invalid lab date.** A row whose lab date cell is present but not a valid
  date (see Dates) is rejected. The diagnostic quotes the cell and states the
  reason; the row is not imported.
- **Empty lab date.** A row with an empty lab date is imported with no date and
  no diagnostic. It takes part in no dated calculation and is included in the
  Data page count "values without a date". It still contributes its sex to the
  sex vote and keeps its stated age (see Demographics resolution).
- **No numeric value.** A row whose value is empty, unparseable or a range is
  imported without a number. It is included in the Data page count "values
  without a numeric measurement" and enters no calculation. Its date, sex and
  stated age still feed demographics resolution.
- **Exact duplicates.** Two rows are duplicates when patient, lab date, test
  name, canonical unit and the raw value text are all equal. Duplicates are
  kept and each counts as a separate measurement. One sheet-level warning
  reports their number and the number of affected patients. Because the raw
  text is compared, `1,5` and `1.5` on the same day are not duplicates. Rows on
  the same date with different values are not flagged.

Sheet-level warnings also report two columns for one field, day-first and
Excel-serial dates, merged unit spellings, values with three digits after a
comma or a point that may be thousands notation, and the number of `<` and `>`
values per parameter.

### Dates

`parseImportDate` reads lab dates, event dates and birth dates. Every accepted
date is a calendar day stored as midnight UTC.

**Text.** Non-breaking spaces are treated as spaces and the text is trimmed.
Three forms are accepted, each with one- or two-digit day and month and a
four-digit year:

| Form | Examples | Read as |
| --- | --- | --- |
| year first, `-` or `/` | `2024-01-05`, `2024/01/05`, `2024-1-5`, `2024-01/05` | 5 January 2024 |
| dotted, day first | `05.01.2024`, `5.1.2024` | 5 January 2024 |
| slash, day first | `05/01/2024`, `5/1/2024` | 5 January 2024 |

Slash dates are always day-first. `03/01/2024` is 3 January 2024, and the
import reports how many dates were read this way. A slash date whose second
number exceeds 12 while the first does not, such as `01/13/2024`, is rejected
with the explanation that US month-first dates are not supported.

Rejected as unrecognised: two-digit years (`15.01.24`), dashed day-first dates
(`15-01-2024`), compact dates (`20240115`), month names (`Jan 5 2024`) and
four-digit numbers (`2020`). Rejected as impossible: any day that does not
exist, such as `2024-02-30`, `2023-02-29`, `31/04/2024` or month 13.

Text dates and workbook date cells have no plausibility range: any year from
0100 to 9999 is accepted (`0203-01-05`, `3000-01-01`). Years 0000 to 0099 are
rejected as impossible. Only serial numbers are range-checked (below).

**Time of day and time zone.** A date may be followed by a time: `T` or spaces,
`h:mm` or `hh:mm`, optional seconds and fraction, and an optional `Z`,
`±hh:mm` or `±hhmm` offset. A time in another form (`+02`, `2:30 PM`) makes the
whole date unrecognised.
The time and the offset are ignored. The calendar day is taken as written and
is not converted between time zones: `2024-01-15T23:30:00+02:00` is 15 January
2024, and `2024-01-14T23:00:00.000Z` is 14 January 2024. A workbook date cell
is read by its calendar day as shown in the workbook; a cell holding 15 January
2024 14:30 is 15 January 2024.

Two consequences follow. All measurements of one patient on one day share one
timestamp. The time between any two measurements is a whole multiple of 24
hours, so every rule elsewhere in this document that speaks of elapsed hours or
days operates on whole calendar days; a criterion stated as 48 hours can only
distinguish measurements zero, one, two or more calendar days apart.

**Numbers (Excel serial dates).** A numeric cell in a date column is an Excel
serial date in the 1900 date system; the 1904 system is not supported for
numeric cells. The fraction of a serial is discarded.

| Check, in this order | Lab and event dates | Birth dates |
| --- | --- | --- |
| whole number 1900–2100 | rejected as a bare year | rejected as a bare year |
| accepted serial range | 10000 up to, but not including, 80001 | 1 up to, but not including, 80001 |
| corresponding dates | 1927-05-18 to 2119-01-11 | 1900-01-01 to 2119-01-11 |
| serial 60 | outside the range | rejected: 29 February 1900 does not exist |

Serial 45000 is 2023-03-15, serial 29221 is 1980-01-01, and birth serial 59 is
1900-02-28 while 61 is 1900-03-01. Because of the bare-year guard a birth date
between 1905-03-14 and 1905-09-30 cannot be given as a whole serial number. A
non-integer number in that span, such as 2020.5, is rejected for lab dates
(below the range) and read as 1905-07-12 for birth dates.

In text, only a five-digit number with an optional decimal fraction (`45000`,
`45000,5`) is read as a serial, under the same range. The import reports how
many dates were read from serial numbers.

**Birth dates in lab rows.** The birth-date column uses the same forms with the
birth serial range. An unreadable birth date does not reject the row: the value
is ignored and a warning is issued once per patient and distinct value. A
readable birth date is kept with the row even when the sheet also has a stated
age column.

**Birth dates in the attributes table.** `readAttributeBirthDate` applies the
same parser, but attribute values are text by then: a numeric cell is read
under the text rule, so only five-digit serials (10000 to 80000, 1927-05-18
onwards) are accepted. Serials 1 to 9999 and four-digit numbers are rejected
as unrecognised. The birth serial range from 1 applies only to typed numeric
birth-date cells of the lab sheet in a binary workbook; birth dates in a CSV
lab sheet are text as well. An unreadable value is kept as
attribute text, ignored for age, and reported as a warning. There is no
fallback to the JavaScript `Date` parser (removed 2026-10-07, formerly OD-24):
the long form `Sun Feb 03 1980 01:00:00 GMT+0100 (…)`, `03/15/1980 00:00`,
`1980-02-30T00:00:00`, `March 15, 1980` and free text such as
`geb. 1950 (unsicher)` are all unreadable, are reported and give no age.
Attribute birth dates stored by the app since 2026-10-06 are ISO calendar
dates and are not affected. A workspace copy saved by an earlier build can
still hold the long form; after restoring it that birth date gives no age, and
no warning appears, because birth-date warnings are issued at import only.
Saved copies expire after seven days.

### Values

Each lab row receives a raw text, an optional number and an operator: `=`
(exact), `<`, `>`, `range` or `unparseable`. The first applicable source wins:

1. Pre-parsed number and operator columns, when both exist (see Columns).
2. A typed numeric workbook cell: the number as stored, operator `=`.
3. The text of the value cell, interpreted by `parseWert` as follows.

Non-breaking spaces become spaces, `≤` becomes `<`, `≥` becomes `>`, and the
text is trimmed. The following rules then apply in order.

1. **Both separators.** Text containing both a point and a comma (`1.234,5`,
   `1,234.5`) is unparseable.
2. **Three digits after a point.** Text such as `1.234` or `0.850` is read as
   a decimal like any other plain number and is reported in a sheet-level
   warning; see below. There is no separate rule for it.
3. **Decimal comma.** Every comma is read as a decimal point: `7,5` is 7.5.
   A single number with more than one comma (`1,2,3`) is unparseable; a range
   may carry one comma per bound.
4. **Bounds.** `<` or `>`, optional spaces, then a non-negative number without
   exponent: `<5`, `< 0,5`, `> 60`. The number is the limit and the operator is
   kept. Because of the substitution above, `≤5` is read as `<5` and `≥90` as
   `>90`; the inclusive meaning is not retained. The two-character forms `<=5`
   and `>=5`, negative limits (`<-5`) and exponents (`<1e3`) are unparseable.
   The treatment of bounded rows in analyses is specified under Bounded
   measurements.
5. **Ranges.** Two non-negative numbers joined by a hyphen or en dash (`5-10`,
   `5 - 10`, `10–20`, `1,5-2,5`) give operator `range` and no number. Ranges
   enter no calculation and are not counted in the `<`/`>` warning.
6. **Plain numbers.** An optional minus sign, digits, an optional point with
   optional further digits, and an optional exponent `e` or `E` with an
   optional minus sign: `7`, `-0.4`, `5.`, `1e3`, `1E-3`. A leading plus sign,
   a missing leading digit (`.5`), a plus sign in the exponent (`1e+3`), digit
   grouping by spaces (`1 234`) and trailing text (`12 mg`) are unparseable.
7. **Overflow.** A number too large for a double (`1e400`) is unparseable.
8. Everything else, including empty text, is unparseable.

Until 2026-10-07 text consisting of an optional minus sign, one to three
digits, a point and exactly three digits was left without a number, because it
could be a whole number written with a German thousands separator (`1.234`
meaning 1234). The owner decided to read such text as a decimal and to warn
instead (formerly OD-8). `1.234` is 1.234, `0.850` is 0.85, `12.500` is 12.5
and `-1.234` is -1.234. A file that really uses a point as thousands separator
is therefore read too low by a factor of 1000; the warning is the only
safeguard. Each value read from text that matches the pattern, optionally
after a bound sign (`1.234`, `< 1.500`), is counted, and one sheet-level
warning quotes the first such value and gives their number: '2 values with
three digits after a point, such as "0.850", were read as decimals; check that
the point is not a thousands separator.' Typed numeric workbook cells and
pre-parsed numbers are not counted. Values that never matched the pattern are
unaffected: `1.23`, `1.2345`, `1234.5`, `1234.567`. The stored regression case
for `"1.234"` in `tests/goldens/wert.json` was updated from no value to 1.234
for this reason.

A value read from text that consists of one to three digits, a comma and
exactly three digits, optionally after a bound sign (`1,234`, `<1,500`), is
read as a decimal and reported in a sheet-level warning: the comma may have
been a thousands separator. The warning quotes the first such value and gives
their number.

Examples, each verified against `parseWert` and the loader:

| Input | Source | Number | Operator |
| --- | --- | --- | --- |
| `7,5` | text | 7.5 | `=` |
| `-0.4` | text | -0.4 | `=` |
| `1e3` | text | 1000 | `=` |
| `1,234` | text | 1.234 (with warning) | `=` |
| `1.234` | text | 1.234 (with warning) | `=` |
| `0.850` | text | 0.85 (with warning) | `=` |
| `12.500` | text | 12.5 (with warning) | `=` |
| 1.234 | typed numeric cell | 1.234 | `=` |
| `1.2345` | text | 1.2345 | `=` |
| `1234.567` | text | 1234.567 | `=` |
| `1.234,5` | text | none | `unparseable` |
| `1,234.5` | text | none | `unparseable` |
| `<5` | text | 5 | `<` |
| `< 0,5` | text | 0.5 | `<` |
| `< 1.234` | text | 1.234 (with warning) | `<` |
| `≤5` | text | 5 | `<` |
| `≥90` | text | 90 | `>` |
| `>=5` | text | none | `unparseable` |
| `<-5` | text | none | `unparseable` |
| `5-10` | text | none | `range` |
| `10–20` | text | none | `range` |
| `-5-10` | text | none | `unparseable` |
| `+5` | text | none | `unparseable` |
| `.5` | text | none | `unparseable` |
| `1e+3` | text | none | `unparseable` |
| `1 234` | text | none | `unparseable` |
| `12 mg` | text | none | `unparseable` |
| `neg` | text | none | `unparseable` |
| `1e400` | text | none | `unparseable` |
| number 1.1, operator cell empty | pre-parsed columns | 1.1 | `=` |
| number text `1.234`, operator ` = ` | pre-parsed columns | 1.234 | `=` |
| no number, operator cell empty | pre-parsed columns | none | `unparseable` |
| number 2, operator `≤` | pre-parsed columns | 2 | `unparseable` |
| number 5, operator `<` | pre-parsed columns | 5 | `<` |

### Units

Unit spellings that describe the same unit are merged at import so that they
form one series. `unitKey` builds a comparison key in four steps:

1. Remove all whitespace.
2. Replace the Greek letter μ (U+03BC) by the micro sign µ (U+00B5).
3. Fold letter case within each run of letters. A spelling that contains no
   lowercase letter `a`–`z` carries no case information: its runs of two or
   more letters are lowercased entirely. In every other case the first letter
   of a run keeps its case when it is one of `m M p P n N k K g G t T e E z Z
   y Y s S`, where case distinguishes SI prefixes or units (milli/mega,
   pico/peta, gram/giga), and is lowercased otherwise; the remaining letters of
   the run are lowercased.
4. In the result of step 3, read a `u` that starts the unit or follows a
   non-letter, and is itself followed by a letter, as the micro sign: `umol/l`
   and `UMOL/L` are `µmol/l`, and `/ul` is `/µl`. A `u` not followed by a
   letter remains the enzyme unit, as in `U/l`.

Digits, slashes and all other characters are compared as written.

| Merged into one unit | Kept apart |
| --- | --- |
| `mg/dl`, `mg/dL`, `MG/DL`, `mg / dl` | `mg/dl` and `Mg/dl` |
| `µmol/l`, `μmol/l`, `umol/L`, `UMOL/L` | `mg/dl` and `µmol/l` |
| `U/l`, `u/l`, `U/L` | `mU/l` and `MU/l` |
| `IU/l`, `iu/L` | `g/l` and `G/l` |
| `mU/l`, `mu/l`, `MU/L` | `pg/ml` and `Pg/ml` |
| `pg/ml`, `PG/ML` | `nmol/l` and `Nmol/l` |
| `G/l`, `G/L` | `ml/min/1.73m²` and `ml/min/1,73m²` |
| `ug/l`, `µg/l` | |

The all-capitals rule has one notable effect: `MU/L` is read as milli-units
and merges with `mU/l`, while the mixed-case `MU/l` stays separate.

`planUnitHarmonisation` merges spellings with the same key per test name,
across all patients of the lab sheet. The same unit under two different test
names is not affected, and rows without a test name form their own group. Within
a group the canonical spelling is the most frequent one. Among equally frequent
spellings one containing the micro sign µ (U+00B5) wins, and otherwise the one
seen first in the file. Every row of the group is rewritten to the canonical
spelling; the original spelling of a row is not retained. Each merged group
produces one sheet-level warning listing the spellings with their row counts.
For example `umol/l` on two rows and `µmol/l` on one row become `umol/l`;
`umol/l` and `µmol/l` on one row each become `µmol/l`.

No unit is converted at import. `mg/dl` and `µmol/l` values of the same test
name remain two series with their values as written; conversions belong to
individual analyses and are specified there. A row without a unit keeps no unit
and is not merged with any other.

Regression evidence: [date tests](../tests/core/parse/dates.test.ts),
[value tests](../tests/core/parse/wert.test.ts),
[unit tests](../tests/core/parse/units.test.ts),
[loader tests](../tests/core/parse/loader.test.ts),
[header tests](../tests/io/headers.test.ts),
[CSV and workbook import tests](../tests/io/csvImport.test.ts),
[dataset loading tests](../tests/io/loadDataset.test.ts),
[workbook reader tests](../tests/io/readWorkbook.test.ts),
[attribute tests](../tests/core/attributes/attributes.test.ts),
[template tests](../tests/io/templates.test.ts) and
[dataset replacement tests](../tests/workspace/data.test.tsx). The loader tests
cover the two-header warning, the rejected row without a patient ID, the
three-decimal warning and the empty or untrimmed pre-parsed operator cell; the
[row resolution tests](../tests/core/demographics/resolve.test.ts) cover the
attribute birth dates that are no longer guessed. No dedicated regression
test: UTF-16 decoding and the NUL-byte rule; the alternative sheet names, the
labs fallback and the ignored sheets of multi-sheet workbooks; the
all-capitals merge of `MU/L` with `mU/l`; the absence of size limits.

## Demographics resolution

Sex and age are decided once per patient before any other analysis runs.
`resolveDemographics` takes the imported lab rows, the attributes table and the
manual entries, decides one sex and one birth-date anchor per patient, and
writes the result to every row of that patient. Derived eGFR and all later
steps read these resolved values, not the cells of the source file. Resolution
has no setting and cannot be switched off. Sex and age are resolved
independently of each other.

### Sex

`normaliseSex` maps a sex cell to one of three codes. Spellings are compared
after Unicode normalisation (NFC), trimming and lowercasing.

| Code | Meaning | Accepted spellings |
| --- | --- | --- |
| `m` | male | `m`, `male`, `man`, `mann`, `männlich`, `maennlich`, `mannlich` |
| `w` | female | `w`, `f`, `female`, `woman`, `weiblich`, `frau` |
| `d` | diverse | `d`, `divers`, `diverse` |

Every other non-empty value is unrecognised, for example `1`, `2`, `x`,
`other`, `unknown`, `F.` and `männl.`. Values such as `other` or `unknown` are
deliberately not mapped to `d`, because `d` selects a coefficient set in the
eGFR formulas (see the eGFR section). An unrecognised value in a lab row counts
as no sex for that row. The original text is kept and, when an eGFR formula is
selected, the Data page quotes the unreadable spellings of creatinine source
rows whose patient still has no resolved sex. An unrecognised value in the
`sex` column of the attributes table is treated as absent and produces no
warning.

`resolveSex` applies the first rule that yields a sex:

1. **Manual entry** for the patient.
2. **Attributes table:** the recognised `sex` of the patient's attribute row.
3. **Lab rows:** the code stated on the largest number of the patient's rows.

The vote in rule 3 counts every imported lab row of the patient: all
parameters, including rows without a date and rows without a numeric value.
Rows with an empty or unrecognised sex do not vote. The most frequent code wins
by any margin; it need not exceed half of the rows (two `w`, one `m` and one
`d` give `w`). When the two most frequent codes are equally frequent, the rows
yield no sex. Unless the attributes table or a manual entry supplies one, the
patient's sex is then unknown on every row, including rows that stated one, and
no eGFR is computed for the patient.

Disagreements are reported as warnings and never stop the analysis:

| Code | Raised when | Result |
| --- | --- | --- |
| `sex_row_disagreement` | the rows state more than one code and one is most frequent | the resolved sex (attributes table, otherwise the most frequent code) |
| `sex_tie` | the two most frequent codes are equally frequent | the attributes-table sex if there is one, otherwise unknown |
| `sex_source_disagreement` | the attributes table and an untied row vote differ | the attributes table |

A manual sex suppresses all three reports for that patient: the entry is taken
as the user's resolution of whatever disagreed. Rows `w`, `w`, `m` give `w`
with `sex_row_disagreement`. With an attributes-table sex `m` they give `m`
with `sex_row_disagreement` and `sex_source_disagreement`. Rows `w`, `m` give
unknown with `sex_tie`.

### Age

**Stated age.** When the lab sheet has a stated-age column, each row's stated
age is read from it: a typed number, or text with a decimal point or a single
decimal comma (the same conversion as for pre-parsed numbers, so `4e1` is 40).
The value is truncated toward zero (`46,9` is 46). Other text (`46 J`) and
empty cells give no stated age. No plausibility range is applied at import;
negative and very large values are stored as written. Resolution does not
preserve all of them (see "Inference from stated ages" below). When the sheet has no
stated-age column but a row has a readable birth date and a lab date, the
row's stated age is the completed years between them.

**Completed years.** `completedYears` is the only definition of a row's age:
the difference of the calendar years, reduced by one when the reference date's
month and day are earlier than the birth date's month and day. Dates are
compared as UTC calendar days. Ages are therefore whole numbers that step on
the birthday; no 365.25-day year is involved. A person born on 29 February
reaches the birthday on 1 March in years without a leap day. A reference date
before the birth date gives no age.

| Birth date | Reference date | Completed years |
| --- | --- | --- |
| 1980-03-10 | 2024-03-09 | 43 |
| 1980-03-10 | 2024-03-10 | 44 |
| 1980-02-29 | 2023-02-28 | 42 |
| 1980-02-29 | 2023-03-01 | 43 |
| 1980-02-29 | 2024-02-29 | 44 |
| 1980-03-10 | 1980-03-10 | 0 |
| 1980-03-10 | 1980-03-09 | none |

**Birth-date anchor.** `resolveBirthAnchor` decides one birth-date anchor per
patient. Only rows with a valid lab date take part; they are called dated rows
below. The first rule that applies wins:

1. **Manual age.** The entered age is the age at the patient's earliest dated
   row of any parameter. It defines a one-year interval of possible birth dates
   (see below), and the anchor is the midpoint of that interval. The patient is
   thus assumed to have had the last birthday about half a year before the
   first lab date. A manual age of 46 with a first lab date of 2022-01-15 gives
   the interval 1975-01-16 to 1976-01-15 and the anchor 1975-07-17: the age is
   46 through 2022-07-16 and 47 from 2022-07-17. Stated ages and birth dates in
   the file are not consulted and no disagreement is reported. If the patient
   has no dated row, the manual age is applied unchanged to every row.
2. **Attributes-table birth date.** A readable `birthDate` in the patient's
   attribute row is the anchor.
3. **Lab-row birth date.** Otherwise, if any dated row carries a readable birth
   date, the anchor is the birth date on the row with the earliest lab date;
   among rows on that date the first in file order decides. Birth dates on
   rows without a lab date are ignored.
4. **Inference from stated ages.** Otherwise the anchor is inferred from the
   stated ages of the dated rows.
5. With none of these the patient has no anchor and every row keeps its stated
   age, if any.

Rules 2 and 3 report disagreements; the explicit birth date wins regardless.

| Code | Raised when |
| --- | --- |
| `birth_date_source_disagreement` | a dated lab row carries a birth date different from the attributes-table birth date; one report per distinct differing date |
| `birth_date_row_disagreement` | no attributes-table birth date exists and the dated lab rows carry more than one distinct birth date |
| `age_source_disagreement` | the winning birth date gives a different completed-years age than the stated age of at least one dated row; the report gives the number of contradicted rows out of the rows stating an age |
| `age_no_common_birth_date` | rule 4 applies and the stated ages fit no single birth date |
| `age_implausible` | rule 4 applies and at least one dated row states a negative age or a value that is remapped (see below) |

**Inference from stated ages.** Each dated row with a stated age defines the
inclusive interval of birth dates for which the completed years at the lab date
equal the stated age: from the lab date minus (age + 1) years plus one day, to
the lab date minus age years (`birthDateInterval`). Subtracting years from a
29 February gives 28 February when the target year has no leap day. Age 46 on
2022-01-15 corresponds to birth dates from 1975-01-16 to 1976-01-15.

The intervals of all such rows are intersected: the latest lower bound and the
earliest upper bound. There is no tolerance; a mismatch of one day is a
contradiction.

- **Non-empty intersection.** The anchor is the midpoint of the intersection,
  rounded down to a whole UTC day. Every plausible stated age is reproduced
  exactly, and rows without a stated age receive an age.
- **Empty intersection.** The stated ages fit no single birth date. The anchor
  is the median of the midpoints of the individual row intervals; with an even
  number of rows the lower of the two middle values is used, so the anchor is
  always one row's midpoint. `age_no_common_birth_date` is reported with the
  gap in days between the latest lower bound and the earliest upper bound, and
  the ages of all dated rows are recomputed from the anchor. Each row has equal
  weight, so a parameter measured more often has more influence.

Two kinds of stated age are not reproduced on dated rows. A negative stated age places the birth date after the lab
date, so the row receives no age. A stated age within about 100 years of the
lab year, such as a birth year typed into the age column, is remapped, because
the interval arithmetic passes years 0 to 99 to JavaScript's `Date.UTC`, which
reads them as 1900 to 1999. With a lab date of 2024-03-09, a stated age of 1950
resolves to 50, 2000 to 100 and 1925 to 25, while 150 and 1000 are kept. Rows
without a lab date keep the value as written.

These rules are unchanged, but since 2026-10-07 they are reported (formerly
OD-28). A dated row's stated age counts as implausible when the midpoint of
its own birth-date interval does not give that age back at the lab date. This
is true of negative values and of values from the lab year minus 100 up to the
lab year (1924 to 2024 for a lab date of 2024-03-09). At the two ends of that
range the value is not remapped to a usable age: 1924 and 2024 resolve to 974
and 1074, and `age_no_common_birth_date` is reported as well. A value further
back, such as 1923, is kept as written and not reported. When rule 4 applies and the patient
has such rows, the conflict `age_implausible` gives their number and the first
such value: "Patient 7: 1 stated age, such as 1950, is not a plausible age at
the lab date — replaced by the age derived from the resolved birth date, or
left empty." Under rules 2 and 3 the same rows are already counted by
`age_source_disagreement`; a manual age suppresses the report.

All imported lab rows of the patient with a valid lab date and a stated age
feed the inference: every parameter, including rows whose value is a bound, a
range or unparseable. Derived eGFR rows do not exist yet at this point.

**Age of each row after resolution.** A dated row receives the completed years
from the anchor to its lab date, replacing its stated age; it has no age when
its lab date precedes the anchor. A row without a valid lab date keeps its
stated age. Rows whose sex and age already equal the resolved values are left
untouched.

Worked example (a), consistent ages:

| Lab date | Stated age | Birth-date interval | Resolved age |
| --- | --- | --- | --- |
| 2019-03-10 | 51 | 1967-03-11 to 1968-03-10 | 51 |
| 2021-08-20 | 54 | 1966-08-21 to 1967-08-20 | 54 |
| 2023-01-05 | 55 | 1967-01-06 to 1968-01-05 | 55 |

The intersection is 1967-03-11 to 1967-08-20 and the anchor is its midpoint,
1967-05-31. No conflict is reported and the three rows are unchanged. A further
row of the same patient on 2024-06-01 without a stated age receives 57, and a
row without a lab date that states 40 keeps 40.

Worked example (b), one contradictory age:

| Lab date | Stated age | Birth-date interval | Interval midpoint | Resolved age |
| --- | --- | --- | --- | --- |
| 2019-03-10 | 51 | 1967-03-11 to 1968-03-10 | 1967-09-09 | 51 |
| 2021-08-20 | 55 | 1965-08-21 to 1966-08-20 | 1966-02-19 | 54 |
| 2023-01-05 | 55 | 1967-01-06 to 1968-01-05 | 1967-07-07 | 55 |

The latest lower bound, 1967-03-11, lies 203 days after the earliest upper
bound, 1966-08-20, so the intersection is empty. The median of the three
midpoints is 1967-07-07, which becomes the anchor. The second row's age is
corrected from 55 to 54 and the warning reads "the age values fit no single
birth date (203 days apart) — ages derived from the median instead."

A common export shape repeats one age on every row. Age 60 on 2015-03-01,
2019-03-01 and 2023-03-01 has midpoints 1954-08-31, 1958-08-31 and 1962-08-31;
the anchor is 1958-08-31, the gap is 2558 days and the resolved ages are 56, 60
and 64.

### Provenance

Every conflict becomes a warning message of the analysis with the identifier
`demographics:<code>:<patient ID>`; `birth_date_source_disagreement` carries
the differing date in its code part so that several reports for one patient
stay distinct. The Data page lists the messages under "Conflicts and their
resolution". The eight codes are `sex_row_disagreement`, `sex_tie`,
`sex_source_disagreement`, `birth_date_source_disagreement`,
`birth_date_row_disagreement`, `age_source_disagreement`,
`age_no_common_birth_date` and `age_implausible`. A manual sex suppresses the sex codes and a manual
age suppresses the age and birth-date codes for that patient.

The workbook export records the resolution:

| Sheet | Column | Content |
| --- | --- | --- |
| `cohort` or `slopes` | `demographics_conflict` | `yes` when the patient has at least one conflict message, otherwise blank |
| `demographics` | `baseline_age` | resolved age at the patient's earliest dated row; blank when unavailable |
| `demographics` | `birth_anchor` | the birth-date anchor as a calendar date; blank when the patient has none |
| `demographics` | `age_estimated` | true when a manual age is set, or when the anchor was inferred from stated ages without any explicit birth date; false otherwise |
| `demographics` | `manual_override` | the manual entry for the patient as JSON; `{}` when there is none |
| `demographics` | `warnings` | the texts of the patient's conflict messages |
| `measurements` | `patient_sex`, `patient_age_at_lab` | resolved values; column `demographics` reads "resolved analysis values" |
| `raw_measurements` | `patient_sex`, `patient_age_at_lab` | values as imported; column `demographics` reads "as imported" |

The term "age anchor" has two meanings in this document: the birth-date anchor
of this section is a date from which every row's age is derived, whereas the
age anchor of the individual endpoint projection is an age-carrying measurement
row from which a future age is counted (see the endpoint section).

Analysis modules run in a fixed order, and each sees the rows produced by the
ones before it (`analysisModules`):

1. demographics resolution (`demographics`)
2. eGFR derivation (`egfr`)
3. clinical events (`clinicalEvents`)
4. AKI detection (`aki`)
5. rapid eGFR decline (`rapidEgfrDecline`)
6. CKD endpoints (`ckdEndpoints`)

Derived eGFR therefore always uses resolved sex and age, and every later module
sees the derived eGFR rows.

Regression evidence: [sex resolution tests](../tests/core/demographics/resolveSex.test.ts),
[age resolution tests](../tests/core/demographics/resolveAge.test.ts),
[birth-date interval tests](../tests/core/demographics/birthDate.test.ts),
[row resolution tests](../tests/core/demographics/resolve.test.ts),
[conflict wording tests](../tests/core/demographics/describe.test.ts),
[demographics module tests](../tests/core/analysis/demographicsModule.test.ts),
[registry tests](../tests/core/analysis/registry.test.ts),
[loader tests](../tests/core/parse/loader.test.ts),
[workbook export tests](../tests/workspace/export.test.ts),
[cohort export record tests](../tests/core/cohort/exportRecords.test.ts) and
[Data page tests](../tests/workspace/data-ui.test.tsx). No dedicated regression
test: the full list of accepted sex spellings (only some are tested); an
unrecognised sex in the attributes table; a vote among three codes and the
voting of undated rows; truncation of a decimal stated age and the absence of a
plausibility range; the 1 March rule for a 29 February birth date in
`completedYears`; the `baseline_age` and `manual_override` export columns; the
fixed module order as such.

## Bounded measurements (2026-10-06)

Imported `<x` and `>x` rows retain their raw text, numeric limit and operator.
They remain in measurement tables and charts and count toward raw dated numeric
counts (`nNumeric`) and the raw span (`spanDays`), and through that span can
remove the `span_too_short` reason of a series whose exact values span less
than 365 days. They never enter individual OLS or Theil-Sen fits, rolling
or segmented slopes, cohort screening and slope lines, endpoint evaluation or
prediction, AKI detection, or cohort mixed-model datasets. Derived eGFR from a
bounded creatinine source retains the reversed inequality for display and is
also excluded from these calculations. This policy is independent of optional
clinical-event censoring and AKI fit windows.

Filtering is by row operator before fitting, aggregation and endpoint order,
not by date. An exact value on the same date as a bound remains eligible. A
bound alone cannot start, confirm, interrupt or recover an observed endpoint;
it cannot establish an AKI episode. For a series that is not itself an eligible
creatinine series, the patient's creatinine series with the most exact dated
numeric values supplies the AKI episodes (first in row order on a tie); bounds
do not win source selection by inflating row count.
Bound-only series retain their displayed
points and raw count but have zero fitted points, no fitted slope or line and no
observed endpoint. A bound does not supply an age anchor or mixed-model time
origin. For example, exact 60 and `<10` on 2020-01-01 followed by exact 50 on
2021-01-01 fits the two exact values, while all three remain visible. The
numeric limits are shown as limits and are not estimates of the unknown values.
If a series has only one exact value and a fit exclusion window removes it,
`nFitted` is zero; a disabled fit also reports zero regardless of how many
exact and bounded values are visible. Raw counts remain unchanged.

Regression evidence: [censored measurement tests](../tests/core/censoredMeasurements.test.ts)
and [workspace chart/table tests](../tests/workspace/trajectories.test.tsx).

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
is dropped at import. Two measurements taken on the same day therefore carry an
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
metadata: it is written to the exported `fit_config` and is part of the
mixed-model result identity, but no fit and no chart reads it.

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

Day counts are elapsed milliseconds divided by 86 400 000 and truncated towards
zero. `nFitted` is 0 when the fit model is `none`. When the series has fewer
than two exact rows, `nFitted` is the number of exact rows left after both
window classes (0 or 1) and `fittedSpanDays` is 0. Under balancing,
`fittedSpanDays` is measured between the representative dates of the first and
last bin, so it can be shorter than the span of the measurements that entered
those bins. `nFitted` is reported even when the estimator then returns no
slope.

Example: eight raw values in two calendar quarters under quarterly medians give
`nNumeric = 8` and `nFitted = 2`.

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

Regression evidence: [summary tests](../tests/core/stats/summarize.test.ts),
[slope-line tests](../tests/core/stats/slopeLines.test.ts),
[censored measurement tests](../tests/core/censoredMeasurements.test.ts),
[event exclusion tests](../tests/core/events/fitExclusions.test.ts) for
the inclusive start bound, and
[export record tests](../tests/core/cohort/exportRecords.test.ts) for
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

The Theil–Sen preset is general exploration with the Theil–Sen estimator. Its
configuration is recorded with `preset: custom`, so an export cannot
distinguish it from a manually edited configuration that has the same values.

Defaults and inheritance:

- The workspace starts with shared settings built from General exploration.
- A column without its own configuration uses the shared settings. Editing
  settings while a column is selected creates an independent configuration for
  that column; "Use shared settings" removes it.
- Selecting a preset replaces every setting in the table, including the
  column's rapid-decline threshold, which returns to 5.
- Changing any single advanced setting, including the rapid-decline threshold,
  marks the configuration as custom. It is then recorded with `preset: custom`
  and `xAxis: calendar_time`, whichever preset it started from.
- A series specification built without a fit configuration (`cohortSeriesSpec`)
  uses General exploration.

The export `settings` sheet records, per column, the slope mode (column
`mode`), the complete `fit_config` JSON and the rapid-decline threshold
(`rapid_egfr_threshold`).

Regression evidence: [preset builder tests](../tests/core/fitPipeline/types.test.ts)
for General exploration and CKD progression,
[workspace trajectory tests](../tests/workspace/trajectories.test.tsx) for
preset selection and the custom state, and
[workspace export tests](../tests/workspace/export.test.ts) for the settings
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

Regression evidence: [slope-line tests](../tests/core/stats/slopeLines.test.ts)
(quarterly balancing before the line, representative date with three points),
[mixed-model dataset tests](../tests/core/mixedModel/cohortDataset.test.ts)
(monthly median of two values and the earlier date as origin) and
[export record tests](../tests/core/cohort/exportRecords.test.ts) (eight raw
values collapsing to two fitted points). No dedicated regression test covers
`balanceSeriesPoints` directly, the year boundary, or empty bins.

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
slope, exported as `ci_low` and `ci_high`, and the endpoint-only fit uses the
same calculation.

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

Regression evidence: [OLS tests](../tests/core/stats/ols.test.ts),
[OLS fixture tests](../tests/parity/ols.parity.test.ts),
[series tests](../tests/core/stats/series.test.ts) for the two-point case and
[time tests](../tests/core/stats/time.test.ts) for the 365.25-day year and the
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

The kernel expects valid numeric points from preparation. The minimum applies
to the actual prepared observations when used for a display fit. All pairs are
enumerated, so time and temporary storage grow quadratically with point count.

References: [SciPy documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html),
[fixture provenance](../tests/goldens/theil_sen.md),
[full estimator parity tests](../tests/parity/theilSen.parity.test.ts).

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
  and largest window slope ("5 windows · local slopes −8 to 0 …/year"), or
  "No 730-day window with three fitted measurements; no local slopes". A
  series without any fitted value shows neither. The variance `slopeVar` is
  computed but not shown.
- **Overlay counts.** In rolling mode a series counts as fitted when a window
  line is drawn. A series with a global slope but no window is counted among
  the trajectories without an available fit and not among the uncertain fits.
- **Export.** The cohort and slope sheets end with five columns, placed after
  all other columns of the sheet (`n_fitted` and `fitted_span_days` included)
  so that earlier column positions are unchanged:

  | Column | Content for slope mode `rolling` | Other modes |
  | --- | --- | --- |
  | `rolling_window_days` | `730` | blank |
  | `rolling_step_days` | `180` | blank |
  | `rolling_windows` | number of fitted windows, `0` when there is none | blank |
  | `rolling_slope_min`, `rolling_slope_max` | smallest and largest window slope per year, unrounded; blank without a window | blank |

  With fit model "No fit", and for a series without any fitted value, the
  columns are blank.

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

Regression evidence: [rolling tests](../tests/core/stats/rolling.test.ts),
[rolling fixture tests](../tests/parity/rolling.parity.test.ts),
[segment tests](../tests/core/stats/segments.test.ts) including the strict
180-day boundary, [segment fixture tests](../tests/parity/segments.parity.test.ts),
[slope-line tests](../tests/core/stats/slopeLines.test.ts) for per-segment
lines, and [cohort screening tests](../tests/core/cohort/screening.test.ts) for
the window lines of a cohort cell,
[rolling line tests](../tests/core/stats/rollingLines.test.ts) for the drawn
stretch, the window statistics and the `rolling_*` export columns, and
[summary fixture tests](../tests/parity/summarize.parity.test.ts), which pin
the reported slope and reason in `rolling` and `gap-split` mode to the same
values as `global` for three patients. No dedicated regression test asserts
that R² and the confidence bounds equal the global OLS values in these modes,
the window and segment statistics, the single-window case at exactly 730 days,
or the global fallback line.

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
3. `nFitted < 3`: unstable.
4. `fittedSpanDays < 365`: unstable.
5. Otherwise unstable only if `reason` is `span_too_short`. For the reachable
   slope modes the fitted span never exceeds the raw span, so this step adds
   nothing after step 4.

Step 3 catches the exact two-point fit and series that balancing or windows
reduced to two points. Step 4 uses 365 whole days, truncated, not 365.25: a
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
| 5 | `nFitted < 3` | n < 3 · uncertain slope | amber |
| 6 | Otherwise | Follow-up < 1 year · uncertain slope | amber |

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
same-day values gave the amber note "n < 3 · uncertain slope" and three or
more gave "Follow-up < 1 year · uncertain slope", both stating that a slope was
fitted. Two same-day values under Theil-Sen are below its minimum and keep the
grey "n < 3" note of row 3. The numeric core is unchanged: the summary still
reports `reason = span_too_short` or no reason for such a series, `slope` is
blank and `unstable_slope` is `yes`. The cell shows "No fit available" next to
the note, and the overlay draws no line and does not count the series as
uncertain.

Regression evidence: [summary tests](../tests/core/stats/summarize.test.ts),
[summary fixture tests](../tests/parity/summarize.parity.test.ts),
[quality label tests](../tests/workspace/labels/qualityLabels.test.ts) and
[export record tests](../tests/core/cohort/exportRecords.test.ts) for
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
[rapid-decline module tests](../tests/core/analysis/rapidEgfrDeclineModule.test.ts),
[export record tests](../tests/core/cohort/exportRecords.test.ts) for
`isRapidEgfrDecline` and `rapid_progression`, and
[workspace export tests](../tests/workspace/export.test.ts) for
`rapid_egfr_threshold`, and the
[decision tests](../tests/core/endpoints/decisions20261007.test.ts) for a
clearance in ml/min. No dedicated regression test covers a slope exactly equal
to the negative threshold or the absence of a reliability gate.


## eGFR derivation

A computed eGFR series is derived from one serum-creatinine series and each
patient's resolved sex and age. It is an automated research derivation, not a
validated clinical result. The implementation is `appendComputedEgfr` in
`src/core/domains/nephrology/egfr/series.ts`, the equations are in
`egfr/formulas.ts`, and the name and unit rules are in
`src/core/domains/nephrology/analytes.ts`.

### Activation, default and output series

The eGFR module setting holds one formula (`off`, `ckd-epi-2021`, `mdrd-4` or
`ekfc-2021`) and one optional source pair. The default is `formula: 'off'`,
`source: null`: no eGFR series exists until a formula is applied under Data.
With `off` the module contributes nothing. Only one formula is active at a
time.

Decided 2026-10-07 (formerly OD-5): the default stays `off`. The methodology page no longer labels CKD-EPI 2021 the default.

Computed rows are appended to the imported rows; source rows are never
changed. The series name is `eGFR (<formula label>, computed)` with the labels
`CKD-EPI 2021`, `MDRD-4` and `EKFC 2021`, and the unit is written
`ml/min/1,73m²`. The workspace blocks the calculation when an imported series
already has that name and unit, so imported and computed values are never
combined.

### Eligible source series

A (name, unit) pair is an eligible serum-creatinine source when all three
conditions hold (`isSerumCreatinineSeries`):

- **Name contains** `kreatinin` or `creatinin`. The test ignores case,
  surrounding whitespace and non-breaking spaces. It is a substring test.
- **Name is not a urine name.** A name is a urine name when it contains
  `urin` or `harn` in any case (this covers "Urin", "Urine", "Harn"), or when
  it ends with upper-case `UR`. The suffix test is case-sensitive:
  `Kreatinin UR` is excluded, `Kreatinin ur` is not.
- **Unit is mg/dl or µmol/l** after unit-key normalisation (below).

No other material or method is distinguished. Any name that passes these tests
is treated as serum creatinine; for example `Kreatinin-Clearance` reported in
mg/dl would be eligible, while `Kreatinkinase` and `Cystatin C` are not
because they do not contain the name token.

Unit comparison uses `unitKey` (`src/core/parse/units.ts`): whitespace is
removed; the micro sign may be written `µ` (U+00B5), `μ` (U+03BC) or as a
plain `u` in front of a letter; letter case is folded, except that the first
letter of each letter run keeps its case when it can be an SI prefix or a
colliding single-letter unit (`m M p P n N k K g G t T e E z Z y Y s S`).
In a spelling without any lower-case letter, every run of two or more letters
is folded completely (`MG/DL` is `mg/dl`); a single-letter run still follows
the first-letter rule (`G/L` is `G/l`).

| Spelling | Accepted as |
| --- | --- |
| `mg/dl`, `mg/dL`, `MG/DL`, `mg / dl` | mg/dl |
| `µmol/l`, `μmol/l`, `µmol/L`, `umol/l`, `Umol/L`, `UMOL/L` | µmol/l |
| `Mg/dl` (capital M reads as mega), `mmol/l`, `mg/l`, `mg%`, `mg/100ml`, `mcmol/l` | not accepted |

### Source selection

One (name, unit) pair is the source for the whole dataset. Rows belong to the
source when their name and unit strings equal the pair exactly, as stored
after import (the import already rewrites unit spellings with the same unit
key within one test name to a single spelling). Other creatinine series never
fill gaps for patients who lack the selected pair. An explicitly selected pair
that is not an eligible serum-creatinine source produces no eGFR rows.

When no source is selected, `defaultCreatinineSource` chooses one. The
candidates are the distinct eligible pairs in the dataset, sorted mg/dl
before µmol/l and then by lower-cased name (`localeCompare` in the runtime
locale). In the workspace, *Automatic* is resolved with these rules when the
calculation is applied, and the resulting pair is stored as the explicit
source. The first rule that matches wins:

1. a pair in mg/dl whose trimmed, lower-cased name is exactly `kreatinin`;
2. the first pair in mg/dl whose name contains `hp` in any case;
3. the first pair in mg/dl;
4. the first pair in µmol/l.

A final fallback to the first candidate exists in the code but cannot be
reached, because every candidate has one of the two units. The exact-name
preference of rule 1 applies to mg/dl only: with `Kreatinin [µmol/l]` and
`Creatinine B [µmol/l]` as the only candidates, rule 4 selects
`Creatinine B`, the alphabetically first.

### Unit conversion

A µmol/l source value is converted to mg/dl by dividing by
**88.42 µmol/l per mg/dl** (`MGDL_PER_UMOLL`) before the formula is
evaluated. 106.104 µmol/l is 1.2 mg/dl and gives the same eGFR as a 1.2 mg/dl
row. mg/dl values are used as imported.

### Conditions for a computed value

A source row yields one eGFR row only when every condition holds. Otherwise it
yields nothing; no placeholder row is written.

| Condition | Rule |
| --- | --- |
| Lab date | present |
| Numeric value | present (`wertNum` not null) |
| Creatinine | strictly greater than 0 mg/dl after conversion |
| Sex | resolved to `m`, `w` or `d` |
| Age | present and at least 18 (`age >= 18`; 17 gives no value, 18 does) |

All three formulas are adult-only here. This includes EKFC, whose published
form covers the full age spectrum. If no row in the dataset carries a sex and
no row carries an age, the derivation returns the input rows unchanged without
looking at the source.

**Age.** The age entering the formula is the row's age after demographic
resolution, which runs before the eGFR module: the number of whole completed
years between the patient's resolved birth-date anchor and the lab date,
compared on UTC calendar dates. It is an integer and changes on the
(resolved or assumed) birthday; fractional age is not used. When a patient has
no anchor, the row keeps its stated age, which the import truncates toward
zero to an integer. One further completed year lowers CKD-EPI 2021 by 0.62 %
(factor 0.9938) and EKFC above 40 years by 1.0 % (factor 0.990), so a series
shows a small step at each birthday. The rules that resolve sex and the
birth-date anchor are not repeated here.

**Sex.** The resolved patient sex is used. `m` and `w` select the male and
female coefficients. `d` uses the male coefficients in all three formulas,
including the EKFC Q value. An unresolved or unrecognised sex gives no value.

### Formulas

`Scr` is serum creatinine in mg/dl, `age` is whole years, results are in
mL/min/1.73 m².

**CKD-EPI 2021 creatinine** (Inker et al., New England Journal of Medicine
2021), race-free:

```
eGFR = 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^(−1.200) × 0.9938^age × F
```

| Sex | κ | α | F |
| --- | ---: | ---: | ---: |
| `w` | 0.7 | −0.241 | 1.012 |
| `m`, `d` | 0.9 | −0.302 | 1.000 |

**MDRD-4**, IDMS-traceable 175 form (Levey et al., Annals of Internal Medicine
2006). The published race coefficient is not applied:

```
eGFR = 175 × Scr^(−1.154) × age^(−0.203) × F      F = 0.742 for w, 1 for m and d
```

**EKFC 2021 creatinine** (Pottel et al., Annals of Internal Medicine 2021):

```
eGFR = 107.3 × (Scr/Q)^e × A
e = −0.322 when Scr/Q < 1, otherwise −1.132
A = 0.990^(age − 40) when age > 40, otherwise 1
```

For age above 25, Q is 0.90 mg/dl for `m` and `d` and 0.70 mg/dl for `w`. For
age 25 and below (here 18 to 25, whole years) Q is computed in µmol/l and
divided by 88.4:

```
m, d:  ln Q = 3.200 + 0.259·age − 0.543·ln(age) − 0.00763·age² + 0.0000790·age³
w:     ln Q = 3.080 + 0.177·age − 0.223·ln(age) − 0.00596·age² + 0.0000686·age³
Q [mg/dl] = Q [µmol/l] / 88.4
```

| Age | Q male, µmol/l | Q male, mg/dl | Q female, µmol/l | Q female, mg/dl |
| ---: | ---: | ---: | ---: | ---: |
| 18 | 72.3226 | 0.818129 | 59.7687 | 0.676117 |
| 20 | 76.1966 | 0.861953 | 61.3596 | 0.694113 |
| 25 | 80.8645 | 0.914757 | 62.4312 | 0.706236 |

Q changes from the polynomial to the fixed value between 25 and 26 years. For
a male with 0.9 mg/dl this moves the unrounded result from 107.863404 at 25
to 107.300000 at 26.

Decided 2026-10-07 (formerly OD-12): both constants stay, 88.42 µmol/l per mg/dl for measured creatinine and 88.4 inside the EKFC Q polynomial. Within EKFC the difference affects ages 18 to 25 only and is at most about 0.03 mL/min/1.73 m² (male, 20 years, 0.9 mg/dl: 102.179692 against 102.153530). With 88.42 the SI forms of the KDIGO thresholds are 26.526 µmol/l for the absolute rise and 353.68 µmol/l for the stage-III level, just above the rounded 26.5 and 353.6 µmol/l. The methodology page names both constants.

### Rounding and limits

Each result is rounded to one decimal with `Math.round(eGFR × 10) / 10`. The
rounded number is the stored value of the computed row. The unrounded result
is not kept, so every later calculation uses the rounded value: display fits,
observed G4/G5 and percent-decline endpoints, individual prediction, the
rapid-decline flag and cohort models.

This matters at strict thresholds. CKD-EPI 2021 for a male aged 65 with
2.35 mg/dl gives 29.959353, which is stored as 30.0. G4 requires a value
strictly below 30, so this measurement does not count as below the G4
boundary although the unrounded result is.

No cap is applied: there is no upper or lower limit on the eGFR, no upper age
limit and no plausibility range for creatinine other than the positivity
condition. For example, CKD-EPI 2021 for 0.3 mg/dl in a woman aged 18 gives
157.6.

### Duplicates and bounded rows

Each eligible source row produces its own eGFR row. Rows of the same patient
on the same date are neither removed nor averaged; two identical creatinine
rows yield two identical eGFR rows.

A bounded creatinine row (`<x` or `>x`) is evaluated at its numeric limit and
the inequality is reversed, because eGFR falls as creatinine rises. With
CKD-EPI 2021 for a male aged 60, `<0,5` mg/dl becomes `>116.8` and `>5` mg/dl
becomes `<12.5`. These
rows stay visible and are excluded from all calculations by their operator,
as described under [bounded measurements](#bounded-measurements-2026-10-06).

A row whose operator is `range` or `unparseable` normally has no numeric value
and therefore yields no eGFR row. The exception is a lab sheet that supplies
the pre-parsed columns `valueNum` and `valueOperator` (aliases `Wert_num`,
`Wert_operator`). There the number is taken as given, and an operator cell
other than `=`, `<`, `>`, `range` or `unparseable` (`<=` for example; an empty
cell beside a number means `=`) is stored as `unparseable`. Such a creatinine
row is not an exact measurement and is left out of creatinine fits and AKI
detection. Its derived eGFR row inherits the operator (`range` stays `range`,
`unparseable` stays `unparseable`), so the derived value is shown but enters no
fit, endpoint or cohort model (decided 2026-10-07, formerly OD-15; before, the
derived row was written with operator `=`).

### Worked examples

All for 1.2 mg/dl at 60 completed years unless stated; the unrounded results
are the values returned by the formula functions.

| Formula | Sex | Calculation | Unrounded | Stored |
| --- | --- | --- | ---: | ---: |
| CKD-EPI 2021 | `m` | 142 × 1 × (1.2/0.9)^−1.2 × 0.9938^60 = 142 × 0.708066 × 0.688556 | 69.231128 | 69.2 |
| CKD-EPI 2021 | `w` | 142 × 1 × (1.2/0.7)^−1.2 × 0.688556 × 1.012 | 51.821330 | 51.8 |
| CKD-EPI 2021 | `w`, 0.6 mg/dl | 142 × (0.6/0.7)^−0.241 × 1 × 0.688556 × 1.012 | 102.693411 | 102.7 |
| MDRD-4 | `m` | 175 × 1.2^−1.154 × 60^−0.203 = 175 × 0.810261 × 0.435547 | 61.758706 | 61.8 |
| MDRD-4 | `w` | the male result × 0.742 | 45.824960 | 45.8 |
| EKFC 2021 | `m` | 107.3 × (1.2/0.90)^−1.132 × 0.990^20 = 107.3 × 0.722053 × 0.817907 | 63.368432 | 63.4 |
| EKFC 2021 | `m`, 20 years, 0.9 mg/dl | Q = 76.1966/88.4 = 0.861953; 107.3 × (0.9/0.861953)^−1.132 | 102.179692 | 102.2 |

Regression evidence: [formula tests](../tests/core/egfr/formulas.test.ts)
(invalid inputs, `d` as male, EKFC reference values including the
age-specific Q, sex spellings),
[eGFR source tests](../tests/core/egfr/series.test.ts) (urine exclusion,
default-source rules 1, 2 and 4, µmol/l conversion and spellings, reversed
bound, under-18 rows, rejected non-serum source),
[eGFR module tests](../tests/core/analysis/egfrModule.test.ts) (formula
`off` contributes nothing), [unit-key tests](../tests/core/parse/units.test.ts)
and [eGFR fixture tests](../tests/parity/egfr.parity.test.ts). No dedicated
regression test: one-decimal rounding at a threshold, the absence of caps,
same-date duplicate source rows and default-source rule 3. The inherited
operator of a non-exact source row is covered by the
[decision tests](../tests/core/endpoints/decisions20261007.test.ts). The 88.4 constant has no test of its own but is pinned indirectly:
the fixture row for `w`, 0.6 mg/dl, 25 years and the formula test for `w`,
0.7 mg/dl, 18 years both fail with 88.42.

## KDIGO creatinine AKI detection

AKI episodes are detected automatically from serum creatinine with the KDIGO
2012 creatinine criteria. This is automated creatinine screening for research
use; it is not a diagnosis and is not clinician-adjudicated. The detector is
`findKdigoAkiEpisodes` in `src/core/domains/nephrology/aki/kdigo.ts`, the
source selection is `episodesForSeries` in `aki/akiAware.ts`, and all
thresholds are in `src/core/domains/nephrology/constants.ts`.

### Input series and conversion

AKI detection accepts the same eligible serum-creatinine name and unit pairs
as eGFR derivation: a name containing "Kreatinin" or "Creatinin", excluding
urine names, with mg/dl or µmol/l (including common case, space and micro-sign
spellings; see [eGFR derivation](#egfr-derivation) for the exact tokens).
Only dated exact numeric rows enter detection; bounded rows (`<x`, `>x`) and
rows without a number are ignored and cannot establish an episode.

Each eligible creatinine series detects AKI on itself. For any other analyte
column the patient's eligible creatinine pair with the most exact dated rows
is used; ties retain the first encountered pair. Bounds do not win source
selection by inflating the row count. The choice is made per patient. Rows
with different names or units are never pooled into one detection series.

A µmol/l value is converted to mg/dl by dividing by **88.42 µmol/l per
mg/dl** before any comparison. Thus 97.262 and 123.788 µmol/l correspond to
1.1 and 1.4 mg/dl and, one day apart, are detected as a 0.3 mg/dl rise.
Episode values in markers and tooltips are always in mg/dl.

Creatinine values of zero or less take no part in detection (decided
2026-10-07, formerly OD-13): `findKdigoAkiEpisodes` removes them before the
windows are built, so such a value is neither a baseline nor a rise, exactly
as eGFR derivation rejects it. Before, a baseline of 0 gave an infinite ratio
and stage III, and 0 followed by 0.3 mg/dl fired the absolute criterion. The
neighbouring positive values are evaluated as if the value were absent: 1.0,
0 and 1.6 mg/dl on three consecutive days give one stage-I episode with
baseline 1.0. No other plausibility check is applied. The Data page reports
the number of exact dated serum-creatinine rows of zero or less ("… not
plausible, so not used for AKI detection or eGFR").

**Dialysis.** Creatinine measured under dialysis is left out before detection
(decided 2026-10-07, formerly OD-14), because it reflects the dialysis
schedule rather than kidney function. `isUnderDialysis` tests the UTC calendar
day of each creatinine row against the patient's clinical events:

| Event | Days left out |
| --- | --- |
| `dialysis`, `chronic` | From the start date on, up to but not including the date of the next `kidney_transplant` on or after that start; without such a transplant, every later day. An `endDate` is ignored, as elsewhere. |
| `dialysis`, `acute`, with `endDate` | `date` through `endDate`, both included. |
| `dialysis`, `acute`, without `endDate` | None. |
| `dialysis`, `unknown` | None. |
| `kidney_transplant`, `other` | None. |

The rows are removed from the detection input, not the episodes from the
result: a value under dialysis is neither a baseline nor a peak, and the first
values after an acute interval are compared only with values outside it.
Detection continues after transplantation, so a creatinine rise of the
transplant is detected. A transplant before the start of a chronic dialysis
does not end it. This filter is independent of the column's censoring options
and of the endpoint filter; it applies wherever episodes are used (chips,
markers, exclusion windows, cohort-model exclusions).

Example: creatinine 1.0 and 1.7 mg/dl on 2020-01-01 and 2020-01-03, 4.0 and
8.0 on 2020-04-01 and 2020-04-02, 1.2 and 2.0 on 2021-07-01 and 2021-07-02.
Without events there are three episodes (2020-01-03, 2020-04-02, 2021-07-02).
With chronic dialysis from 2020-03-01 only the episode of 2020-01-03 remains.
With an additional kidney transplant on 2021-06-01 the episode of 2021-07-02
is detected again.

### Time resolution and windows

Every imported lab date is a calendar day at midnight UTC; a time of day in
the source is dropped. Differences between measurements are therefore whole
multiples of 24 hours, and the two KDIGO windows mean:

| Window | Constant | Earlier measurements inside the window |
| --- | --- | --- |
| 48 hours | `KDIGO_ABSOLUTE_WINDOW_MS` | same date, 1 or 2 calendar days earlier |
| 7 days | `KDIGO_RELATIVE_WINDOW_MS` | same date up to 7 calendar days earlier |

Both bounds are inclusive: an earlier measurement is inside the window when
the elapsed time is less than or equal to the window length. A rise from 1.0
to 1.3 mg/dl two days apart is detected, three days apart it is not. A rise
from 1.0 to 1.5 mg/dl seven days apart is detected, eight days apart it is
not.

### Detection

Points are sorted by date. For each point in turn, the **baseline** of a
window is the lowest value among the points that precede it in this order and
lie inside the window. The point itself is never part of its own baseline.
When several earlier points share the lowest value, the oldest is the
baseline. The first point of a series has no baseline and cannot cross.

Two criteria are tested in a fixed order:

1. **Absolute:** value minus the 48-hour baseline is at least 0.3 mg/dl.
2. **Relative**, tested only when the absolute criterion did not fire: the
   7-day baseline is positive and value divided by it is at least 1.5.

A point that meets a criterion is a *crossing*. It records its date, the
baseline date and value, and the criterion that fired
(`absolute_0_3_mg_dl_48h` or `relative_1_5x_7d`). Every point, crossing or
not, becomes a possible baseline for later points.

Each numeric threshold comparison is inclusive and permits a **1e-12**
tolerance in the compared quantity (mg/dl for an absolute value,
dimensionless for a ratio): `value + 1e-12 >= threshold`. This keeps
mathematically exact decimal boundaries that binary rounding would lose. A
rise from 1.1 to 1.4 mg/dl is detected and 0.7 to 1.05 mg/dl three days apart
is detected as exactly 1.5-fold, while 1.1 to 1.399999 mg/dl remains below
the 0.3 threshold. The same comparison is used for staging.

### Measurements on the same date

Rows of the selected series on the same date are all kept. The sort is stable,
so they stay in source row order, and an earlier row is a valid baseline for
a later row of the same date. The result therefore depends on row order:
1.0 followed by 1.4 mg/dl on one date is a stage-I episode whose baseline
date equals its onset date, while 1.4 followed by 1.0 mg/dl on that date is no
episode.

### Staging

`kdigoStage` grades an episode from its baseline and peak value. The ratio is
peak divided by baseline; a baseline of zero or less gives an infinite ratio,
which detection never passes on because such values are removed beforehand.
The rows are tested from top to bottom and the first match applies.

| Stage | Condition (inclusive, with the 1e-12 tolerance) |
| --- | --- |
| III | peak at least 4.0 mg/dl, **or** ratio at least 3.0 |
| II | ratio at least 2.0 |
| I | ratio at least 1.5, **or** peak minus baseline at least 0.3 mg/dl |

The 4.0 mg/dl rule applies to every detected episode whatever the size of the
rise: 4.2 to 4.5 mg/dl on consecutive days is stage III. Exactly 2.0-fold is
stage II and exactly 3.0-fold is stage III.

### Episodes

Crossings are grouped into episodes in chronological order
(`clusterEpisodes`). A crossing joins the preceding episode when its baseline
date equals that episode's baseline date; any other crossing starts a new
episode. An episode consists of:

| Field | Definition |
| --- | --- |
| Onset | date of the first crossing of the episode |
| Baseline | baseline date and value of the first crossing |
| Peak | highest crossing value of the episode and its date; the earlier date on equal values |
| Criterion | criterion of the first crossing |
| Stage | `kdigoStage(baseline value, peak value)`, the highest stage reached within the episode |

Example: 1.0, 1.6 and 2.1 mg/dl on 1, 2 and 3 January form one episode. Both
later values cross against the 1 January baseline, so the onset is 2 January,
the peak is 2.1 mg/dl on 3 January and the stage is II.

### Where results appear

Every column of a patient that has at least one dated numeric row receives the
episodes that apply to it, on creatinine and non-creatinine columns alike:

- a **chip** in the patient table and the `aki` export column;
- an **episode marker** labelled `AKI I`, `AKI II` or `AKI III` at the peak
  date and the shaded AKI windows, when *AKI windows and episodes* is
  switched on;
- optionally, exclusion of the windows from the column's fit (see
  [AKI fit-exclusion window](#aki-fit-exclusion-window)).

The chip is `AKI` followed by the stages in ascending order, separated by
commas. A stage reached by one episode is written as its Roman numeral, a
stage reached by several as `n×` and the numeral: `AKI I`, `AKI I, II`,
`AKI 2×I, II`, `AKI 4×I`. The tooltip spells the counts out, for example
"3 AKI episodes: 2× stage I, 1× stage II". Without episodes there is no chip
and the export cell is empty.

Because a creatinine column detects on itself and every other column uses the
patient's creatinine pair with the most exact dated rows, two creatinine
columns of one patient can show different episodes, and the AKI source of a
computed eGFR column need not be the series the eGFR was derived from.
Example: a patient has `Kreatinin [mg/dl]` with 1.0 and 1.6 mg/dl on
consecutive days and `Kreatinin HP [µmol/l]` with 90, 91 and 92 µmol/l on
three days. The eGFR default source is `Kreatinin [mg/dl]`, and the computed
CKD-EPI 2021 eGFR falls from 86.2 to 49.0 (male, 60 years). The `Kreatinin` column shows
one stage-I episode. The computed eGFR column shows none, because its AKI
source is the `Kreatinin HP` pair with three rows.

### Not implemented

- The KDIGO urine-output criterion is not evaluated; urine data are not used.
- Start of renal replacement therapy is not treated as stage III.
- The paediatric stage-III criterion (eGFR below 35 mL/min/1.73 m²) is not
  evaluated.
- There is no outpatient, historical or back-calculated baseline; the only
  reference is the lowest earlier value within 48 hours or 7 days.

### Known limitations

The following three properties are deliberate current behaviour. The owner
decided on 2026-10-06 not to change AKI episode merging and staging (see
[method decisions](remaining-method-decisions.md)); they are documented here
so that episode counts and stages are read correctly.

**Episodes are split whenever the baseline moves.** Episodes are merged only
while consecutive crossings share one baseline date. Because the baseline is a
sliding minimum, it moves forward as earlier values leave the window, and
each move starts a new episode.

**There is no episode end, recovery rule or minimum gap.** An episode does not
last until creatinine returns towards baseline, and nothing prevents a new
episode from starting the day after the previous one. A sustained rise is
therefore reported as a chain of episodes, each graded against its own recent
baseline. Daily values of 1.0, 1.4, 1.8, 2.2, 2.6 and 3.0 mg/dl from 1 to
6 January give four episodes:

| Onset | Baseline | Peak | Stage |
| --- | --- | --- | --- |
| 2 January | 1.0 (1 January) | 1.8 (3 January) | I |
| 4 January | 1.4 (2 January) | 2.2 | I |
| 5 January | 1.8 (3 January) | 2.6 | I |
| 6 January | 2.2 (4 January) | 3.0 | I |

The chip reads `AKI 4×I`, although creatinine tripled within five days. A
plateau behaves the same way: 1.0, 1.0, 1.3 and 1.3 mg/dl on four consecutive
days give two stage-I episodes, because the second 1.3 is compared with the
1.0 of the second day once the first day has left the 48-hour window. Episode
counts are counts of baseline-specific crossings, not of clinical events.

**The absolute criterion decides the baseline first.** When the absolute
criterion fires, the relative criterion is not tested, and the recorded
baseline is the 48-hour minimum even when the 7-day minimum is lower. The
stage is graded against that recorded baseline. Values of 1.0 mg/dl on
1 January, 1.4 on 5 January and 3.2 on 6 January give one episode with onset
6 January, baseline 1.4 mg/dl and stage II (ratio 2.29), although 3.2 mg/dl
is 3.2 times the 7-day minimum of 1.0. Stages can therefore be lower than a
grading against the 7-day minimum would give.

Regression evidence: [KDIGO boundary tests](../tests/core/aki/kdigo.test.ts)
(tolerance, exact 0.3 mg/dl and 1.5-fold boundaries, stage values, the
4.0 mg/dl rule), [AKI source tests](../tests/core/aki/akiAware.test.ts)
(eligible names and units, µmol/l conversion, source selection without
pooling, bounded rows), [AKI module tests](../tests/core/analysis/akiModule.test.ts)
(episodes reused on computed eGFR and other columns),
[AKI fixture tests](../tests/parity/aki.parity.test.ts) (episode dates,
stages and criteria on fixture series),
[cohort screening tests](../tests/core/cohort/screening.test.ts) (chip and
tooltip text) and
[censored measurement tests](../tests/core/censoredMeasurements.test.ts).
No dedicated regression test: inclusive window bounds at exactly two and
seven days, the oldest-value tie rule for the baseline, same-date row order,
the sustained-rise and plateau chains, the stage effect of the absolute-first
order, and a computed eGFR column whose AKI source differs from its eGFR
source. Non-positive values and creatinine under dialysis are covered by the
[dialysis and positivity tests](../tests/core/aki/dialysisAndPositivity.test.ts).

## AKI fit-exclusion window

Each detected AKI episode (see
[KDIGO creatinine AKI detection](#kdigo-creatinine-aki-detection)) defines one
window that a column's display fit can leave out (`akiExclusionWindows` in
`src/core/domains/nephrology/aki/akiAware.ts`, window arithmetic in
`src/core/exclusions/windows.ts`):

```
window = [onset, onset + N days]      both bounds inclusive
```

The anchor is the episode onset, the date of the first crossing. It is not
the baseline date and not the peak date. A measurement is excluded when its
date lies in at least one window. Nothing dated before the onset is excluded,
so the baseline measurement stays in the fit unless it carries the onset date
itself (two rows on one date, see above), and so does any measurement after
the window even when creatinine is still raised. N is the column's
`akiExclusionDays`; the default is **30** (`DEFAULT_AKI_EXCLUSION_DAYS`).

Because dates are whole calendar days, a window of N days covers N + 1
calendar dates: the onset date and the N following dates. With onset
2 January 2020 and N = 30, measurements from 2 January to 1 February 2020
inclusive are excluded and one on 2 February is kept.

**Configuration.** Each column's fit configuration has a switch, *Exclude AKI
windows from fit*, and the length, *Exclusion window (days)*. The length field
can be edited only while the switch is on (otherwise it is disabled and keeps
its value); it accepts any number from 0 upward and has no upper limit. An empty or
non-numeric entry is stored as 0 and a negative entry as 0. Fractional
values are stored as entered; with whole-day dates they act like the next
lower whole number (0.5 excludes the onset date only). With N = 0 the window
is the onset date alone, so only measurements dated on the onset are
excluded. The dataset-level AKI module setting `exclusionDays` (default 30)
is only a fallback for a column without a length of its own; a stored value
there that is not a finite number of at least 0 invalidates the stored
analysis settings.

**One window per episode.** Windows are not merged for exclusion; a
measurement inside several windows is excluded once, with reason `aki`. For
drawing only, `akiExclusionBands` merges windows that overlap or touch (the
next window starts on or before the current end) into one shaded band. Both
cover the same dates. The four episodes of the sustained-rise example above
give four windows (2 January to 1 February, 4 January to 3 February,
5 January to 4 February, 6 January to 5 February) and one band from 2 January
to 5 February. The band is drawn with the column's window length whether or
not the column excludes the window from its fit.

**Scope and order.** The windows apply to any analyte column whose
configuration has the switch on, not only to creatinine and eGFR; the
episodes are those that apply to the column as described above. Within the
display fit, clinical-event censoring is applied first, then the AKI windows
remove exact measurements, then time balancing (monthly or quarterly medians)
runs on what remains, so excluded values never enter a median. Excluded
measurements stay visible and are marked as excluded from the fit; raw counts
are unchanged. Observed endpoints and the individual endpoint prediction do
not use AKI windows. Cohort mixed models use them when the analysis settings
chosen for that parameter under Trajectories have the switch on and the *Apply
preset event and AKI exclusions* checkbox of the Cohort models page is on (see
[cohort mixed models](#cohort-mixed-models)).

| Preset | AKI windows excluded | Length |
| --- | --- | ---: |
| General exploration | no | 30 (not used for exclusion; sets the length of the drawn band) |
| Theil–Sen robust trend | no | 30 (not used for exclusion; sets the length of the drawn band) |
| CKD progression | yes | 30 |
| Acute review (no fit) | no | 30 (not used for exclusion; sets the length of the drawn band) |

**Marker placement (display only).** An episode marker belongs to the
creatinine peak date. On each chart it is drawn on that column's measurement
nearest to the peak date when one lies within 2 days, inclusive
(`AKI_MARKER_TOLERANCE_DAYS`). Otherwise the marker sits on the time axis
without a value and its tooltip states that the parameter has no measurement
on that date. Marker placement has no effect on any calculation.

Regression evidence: [AKI source tests](../tests/core/aki/akiAware.test.ts)
(band construction and merging, exclusion of points inside a 30-day window),
[cohort screening tests](../tests/core/cohort/screening.test.ts) (window
exclusion through the fit configuration, a length of 0 excluding only the
onset measurement, bands on a non-creatinine column without exclusion),
[AKI module tests](../tests/core/analysis/akiModule.test.ts) (one window per
episode with its length),
[summary tests](../tests/core/stats/summarize.test.ts) (exclusion windows in
the fit) and [workspace chart tests](../tests/workspace/trajectories.test.tsx)
(marker off a measurement). The
[fit configuration tests](../tests/core/fitPipeline/types.test.ts) assert that
general exploration leaves the switch off. No dedicated regression test: the
inclusive end bound of the window at exactly onset + N days, fractional N,
the handling of empty or negative length input, the 30-day length of any
preset, the AKI switch of the Theil–Sen and acute review presets (the CKD
progression switch is exercised indirectly by the cohort screening test and
the workspace chart test that selects the preset), and the 2-day marker
boundary.

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

Regression evidence: [event import tests](../tests/core/events/events.test.ts),
[date reader tests](../tests/core/parse/dates.test.ts) and
[header tests](../tests/io/headers.test.ts). The event import tests cover
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

Regression evidence: [fit exclusion tests](../tests/core/events/fitExclusions.test.ts),
[event effect tests](../tests/core/events/events.test.ts),
[cohort cell tests](../tests/core/cohort/screening.test.ts) and
[reason precedence test](../tests/core/fitPipeline/types.test.ts). No
regression test exercises the `censor-from-start` policy at all, the
`flag-only` policy on an unknown-intent dialysis, or the ignored
chronic-dialysis `endDate`.

## Observed endpoints and individual prediction

These rules are owner-approved research definitions (2026-09-23, revised
2026-10-06). `computeCkdEndpoints` evaluates them for one patient and one
parameter column; `endpointContext` in the cohort builder supplies the input.
Cohort-model projections are a different calculation; see "Cohort-model
projections".

### Eligibility and kidney failure reached

**Which series.** Endpoints are evaluated for a column when its unit is mL/min/1.73 m². The unit is compared after
lower-casing, removing whitespace, and reading a decimal comma as a point and
`²` or `^2` as `2`; the result must equal one of four spellings
(`isEgfrUnit`):

| Result of the comparison form | Qualifying units, for example |
| --- | --- |
| `ml/min/1.73m2` | `ml/min/1,73m²`, `mL/min/1.73 m2`, `ML/MIN/1,73M^2` |
| `ml/min/{1.73_m2}` | `mL/min/{1.73_m2}` (UCUM), `ml/min/{1,73_m²}` |
| `ml/min/1.73qm` | `ml/min/1.73qm`, `ML/MIN/1,73 QM` |
| `ml/minper1.73m2` | `mL/min per 1.73 m2`, `ml/min per 1,73m²` |

`ml/min`, `ml/min/1.73` and `mL/min/m²` do not qualify. Nor does any other way
of writing the unit, such as `ml per min per 1.73 m2`, `ml/min/{1.73}` or a
unit with trailing text such as `ml/min/1,73 m² KOF`; the unit of such a series
must be rewritten before import for it to receive endpoints. The parameter name
is not read. Every other column reports all endpoints as not evaluated,
whatever its settings. The same rule controls kidney failure reached, the
rapid-decline flag and the preset targets of cohort-model projections
(decided 2026-10-07, formerly OD-20; the owner accepted the UCUM, `qm` and
`per` spellings on 2026-10-08). Until 2026-10-07 any unit containing `ml/min`
received endpoints, so a creatinine clearance in ml/min did; an eGFR series
imported with the bare unit `ml/min` no longer does.

A third, name-only test (the name contains `egfr`, in any case) only preselects
the outcome on the Cohort models page.

**Which endpoints.** The column's fit configuration has four toggles: observed
CKD G4, observed CKD G5, percent eGFR decline, and projected age to CKD G5,
plus the minimum confirmation interval. The CKD progression preset turns all
four on with 90 days. General exploration, Theil–Sen robust trend and Acute
review turn all four off.

**Which measurements.** Endpoint input is the column's measurements of the
patient that have a valid date, a finite numeric value and the operator `=`
(bounds are excluded by row; see "Bounded measurements"), after this event
filter (`filterEndpointPointsForEvents`):

- Values on or after the earliest kidney transplant or chronic dialysis start
  are removed. The start day itself is removed.
- Values within a complete dated acute dialysis interval are removed,
  including its start and end dates. Later values remain eligible. An interval
  is complete when it has an end date not before its start date.
- Unknown-intent dialysis, acute dialysis without an end date and `other`
  events remove nothing.

Dates compare by UTC calendar day. The filter is independent of the display-fit
censoring options, AKI windows and time balancing; a column with all censoring
options off still truncates its endpoint input at kidney replacement therapy.
Remaining rows are sorted by date; rows on the same date keep source order.
The same eligible rows feed every endpoint and the projection fit.

**Day resolution.** Import stores every lab and event date as its calendar day
at midnight UTC. "Same timestamp" below therefore means the same calendar day,
and an elapsed interval is a whole number of days. The evaluators themselves
compare timestamps for same-time grouping, the minimum interval and the
follow-up span, and UTC calendar days for the event filter, the 12-month
maximum and the baseline window.

**Kidney failure reached.** The earliest dated kidney transplant or chronic
dialysis start of the patient (`firstKidneyFailureEvent`) is reported as
kidney failure reached with its type and date. When a transplant and a chronic
dialysis start share that earliest date, the transplant is reported. Unknown-
intent and acute dialysis never count. Kidney failure reached is independent
of lab-confirmed G5: an earlier lab-confirmed G5 and a later kidney
replacement therapy are both reported, and kidney replacement therapy is
reported without any low eGFR value.

It is reported for every column that passes the unit gate and has at least one
dated numeric row of the patient, counting bounds and rows on or after the
event. It does not depend on any endpoint toggle or preset: a General
exploration column with all endpoints off still shows the badge and fills the
kidney-failure export columns. A column without any dated numeric row for the
patient reports nothing, so a patient with events but no eGFR rows has no
kidney-failure result. A series whose every lab is on or after kidney
replacement therapy reports kidney failure reached with zero eligible rows.

Regression evidence: [cohort cell tests](../tests/core/cohort/screening.test.ts),
[bounded measurement tests](../tests/core/censoredMeasurements.test.ts) and
[method contract tests](../tests/workspace/method-contract.test.tsx). No
The unit rule is covered by the
[decision tests](../tests/core/endpoints/decisions20261007.test.ts). No
dedicated regression test for the same-date transplant tie or for kidney
failure reached with all endpoint toggles off.

### Observed G4/G5

G4 is reached strictly below 30 and G5 strictly below 15 mL/min/1.73 m². A
value equal to the threshold is not below it; no numeric tolerance applies.
The thresholds are not configurable. G4 and G5 are evaluated independently
with the same rules (`observeThresholdCrossing`); a G5 recovery need not be a
G4 recovery.

Eligible rows are processed in chronological order:

1. The first low value starts a candidate. This includes the first eligible
   measurement of a patient: a patient who is already below the threshold at
   first measurement gets an event dated at that measurement. Prevalent and
   incident states are not distinguished.
2. A later low value confirms the candidate when at least the minimum
   interval has elapsed and it lies within the maximum window. Confirmation
   happens at the first such date. Low values before the minimum interval has
   elapsed do not move the candidate or restart the interval.
3. A value at or above the threshold before confirmation clears the
   candidate. The next low value starts a new candidate.
4. A low value later than the maximum window expires the old candidate and
   becomes the new candidate itself.
5. Confirmation records the candidate's date and value (first crossing) and
   the confirming date and value. A candidate alone is not an event.
6. After confirmation the first value at or above the threshold is recorded
   as recovery with its date and value. Recovery does not revoke or redate
   the event, and evaluation of that endpoint stops there.

**Minimum interval.** The default is 90 days. The test is elapsed time divided
by 86 400 000 ms, at least the configured number of days, so exactly 90 days
confirms. 2020-01-01 and 2020-04-01 are 91 days apart and confirm at the
default. `normalizeConfirmationDays` accepts a finite value of at least 1 and
rounds it down to whole days (90.7 becomes 90, 1.9 becomes 1); a missing,
non-finite or smaller value, including 0.5, 0 and negative numbers, becomes
90. The upper bound is 365 days (`MAX_CONFIRMATION_DAYS`; decided 2026-10-07,
formerly OD-19): a confirming value must follow within 12 calendar months,
which is 365 or 366 days, so a longer interval could never confirm, and 366
days only across a leap day. The settings input commits whole numbers from 1
to 365 only; a larger entry is not applied, the value the field held before
the edit is restored, and the reason is shown beside the input ("366 days not applied: a confirming value must follow within 12
calendar months, so the minimum interval cannot exceed 365 days."). A larger
value in a stored configuration is evaluated as 365, and the export records
the effective value. An interval of 365 days can confirm: 2021-01-01 and
2022-01-01 are 365 days apart and inside the window.

**Maximum window.** Confirmed by the owner on 2026-10-07. Confirmation must occur within 12 UTC
calendar months of the candidate, inclusive of the anniversary day. Month
addition clamps to the last day of the destination month (2020-02-29 to
2021-02-28). The value 12 is fixed in code.

**Consequence of expiry.** The candidate is always the first low value of a
run until it expires; intermediate low values are never promoted. With the
default interval, low values on 2020-01-01, 2020-03-01 and 2021-02-01 give no
confirmed event: 2020-03-01 is only 60 days after the candidate, and
2021-02-01 lies after the 12-month window of 2020-01-01, so it becomes the new
candidate, although it is 337 days after 2020-03-01. A further low value on
2021-06-01 confirms an event with first crossing 2021-02-01. Had the third
value been on 2021-01-01, the event would be first crossing 2020-01-01,
confirmed 2021-01-01. Sparse follow-up can thus leave a persistently low
series unconfirmed or date its event late.

**Same date.** Rows sharing a timestamp are one observation. If any of them is
at or above the threshold, the observation is not low: it clears an
unconfirmed candidate and cannot confirm, whatever the source order. When all
are low, the first in source order supplies the recorded value. Confirmation
needs a later timestamp; same-time repeats cannot satisfy a positive interval.
After confirmation, the first non-low value of a same-time group is the
recovery value.

Missing dates and non-finite values are ignored. A bound cannot start,
confirm, interrupt or recover an event.

Examples (G5, default interval): values below 15 on January 14 and May 13 and
a value of 15 or more on November 20 give a January crossing, May confirmation
and November recovery. Low on January 14, 15 or more on March 20, low on May
13 gives no event yet: March clears the January candidate and May starts a new
one.

Regression evidence: [endpoint tests](../tests/core/endpoints/ckdEndpoints.test.ts)
and [method contract tests](../tests/workspace/method-contract.test.tsx). No
dedicated regression test for rounding a fractional interval down, for an
interval longer than the maximum window, or for the non-promotion of
intermediate low values.

### Total percent change and confirmed 40 %/57 % decline

One toggle, "Percent eGFR decline", switches three results on together: the
total first-to-latest change and the two confirmed decline events. They cannot
be enabled separately.

**Total change.** With `first` the earliest and `latest` the last eligible
value (`percentDeclineFromBaseline`):

`decline = (first - latest) / first * 100`

The result is unavailable when `first` is zero or negative, and when there is
no eligible row. It is a total over the whole eligible follow-up, not a rate
per year, and it is not confirmed.

The two outputs use opposite signs. The workbook column
`endpoint_percent_decline` holds `decline` unrounded: positive for a fall,
negative for a rise. The table badge shows the change, `-decline`, rounded to
a whole percent with an explicit plus sign for a rise, and its detail text
gives one decimal. First 50 and latest 30 export `40` and display `-40%`;
first 40 and latest 50 export `-25` and display `+25%`. The badge is not shown
with fewer than two eligible rows or fewer than two displayed points, where
first and latest coincide; the export keeps the computed 0.

**Confirmed 40 % and 57 % decline.** These are separate observed events. The
57 % boundary serves as a serum-creatinine doubling surrogate.

- Baseline (window confirmed by the owner on 2026-10-07): the arithmetic mean of all eligible rows from
  the first eligible UTC date through 90 elapsed UTC calendar days, inclusive
  of the whole final day. Duplicate rows each contribute. One row suffices.
- Only rows after that window can start, confirm or recover an event, so no
  observation both defines the baseline and establishes a decline. This
  withholds early confirmed decline dates and can be revised on review.
- Each later row is converted to `(baseline - value) / baseline * 100`. A row
  crosses when that percentage is at least 40 or 57; equality counts, with a
  tolerance of 1e-12 percentage points against binary rounding.
- A baseline of zero or less yields no decline event; the baseline value is
  still exported.
- Candidate, minimum interval, 12-month maximum, expiry, same-date and
  recovery rules are those of G4/G5. Recovery is the first later row whose
  decline is below the boundary.
- The recorded first, confirmation and recovery values are the eGFR values,
  not the percentages.

Regression evidence: [endpoint tests](../tests/core/endpoints/ckdEndpoints.test.ts),
[badge tests](../tests/workspace/labels/qualityLabels.test.ts) and
[method contract tests](../tests/workspace/method-contract.test.tsx). No
dedicated regression test for the unavailable total change at a non-positive
first value or for the opposite signs of badge and export.

### Individual G5 projection

The projection reports the age at which the patient's fitted line reaches
15 mL/min/1.73 m². It is the intersection of a straight line with a boundary,
conditional on the fitted trend continuing unchanged. It is not a prognosis,
an expected event time or a probability, and its uncertainty in time is not
estimated. Only an age is produced, not a calendar date.

**Fit.** The projection fits the endpoint-eligible rows, without display-fit
censoring options, AKI exclusion or time balancing. It therefore includes
recovery after an acute dialysis interval and nothing from kidney replacement
therapy on. The estimator follows the column's fit model:

| Column fit model | Endpoint fit |
| --- | --- |
| OLS, rolling OLS, segmented OLS | Global OLS over all eligible rows (`fitGlobal`). |
| Theil-Sen | Theil-Sen over all eligible rows (`fitTheilSen`; see "Theil-Sen"). |
| No fit | No endpoint fit; the projection is withheld. |

Time is elapsed UTC milliseconds since the first eligible row divided by
365.25 days per year, and the intercept refers to that first row. Display
slopes and their confidence bounds can differ from the endpoint fit, because
the display fit can use other rows. Once kidney failure is reached, no
endpoint fit is run *(proposed: no pre-KRT counterfactual projection)*.

**Crossing.** For `y(t) = a + b*t` the target 15 is reached at
`t = (15 - a) / b` years after the first eligible row. With `span` the years
between the first and latest eligible rows:

`projected age = age at latest eligible row + t - span`

The fitted line is continued; the latest measured value does not shift it.

**Age at the latest eligible row.** Two cases are distinguished (decided
2026-10-07, formerly OD-16), and `ageBasis` records which applies.

- **Birth date known** (`birth_date`). When the patient's birth-date anchor
  is an explicit birth date, from the attributes table or from dated lab rows
  (rules 2 and 3 of "Demographics resolution"), the age at a date is the
  elapsed time from the birth date to that date in 365.25-day years. A date
  before the birth date has no age.
- **No birth date** (`whole_years`). With a manual age, or an anchor inferred
  from stated ages, the age is known in completed years only. Each lab row
  carries that whole number. The age at a date is the age of the latest
  eligible age-carrying row at or before that date, or of the earliest such
  row when none precedes it, plus the elapsed time to the date in 365.25-day
  years. When the latest eligible row carries an age, which is the normal
  case, the age used is that row's whole number, so the projected age is up
  to one year too low.

Bounds and rows removed by the event filter supply no age. The projection is
withheld as `missing_age` when the latest eligible row has no age: in the
first case only when it lies before the birth date, in the second when no
eligible row carries an age.

The table badge shows a projected age on a birth-date basis with one decimal
(`G5 @ 66.3y`). On a whole-year basis it shows the value rounded to a whole
number and marked as approximate (`G5 @ ~66y`), and the tooltip states that it
was counted from the age in completed years and can be up to one year higher.
The export carries the unrounded value in both cases and the basis in
`endpoint_prediction_age_basis`. The 20-year horizon is measured from the same
age and is unaffected by the basis.

**Minimum data.** At least three eligible rows are required; rows are counted,
not distinct dates. The follow-up between the first and latest eligible rows
must be at least 365 days (`MIN_PROJECTION_SPAN_DAYS`), the same number as the
minimum fitted span of the slope reliability rule (decided 2026-10-07,
formerly OD-17; before, 365.25 days were required and one calendar year
without a leap day was withheld). The two rules still look at different rows:
endpoint-eligible rows here, fitted rows there. 2021-01-01, 2021-07-01,
2022-01-01 (365 days) is projected; 2021-01-01, 2021-07-01, 2021-12-31 (364
days) is withheld as `span_too_short`. The conversion of elapsed time to years
for the fit and the crossing is unchanged at 365.25 days per year.

**Confidence gate.** A crossing is reported only when both slope confidence
bounds of the endpoint fit are finite, ordered (low not above high) and the
interval does not contain zero (`low <= 0 and high >= 0` withholds). Because
the endpoint fit's slope is already negative and lies inside its own interval,
this means both bounds are strictly below zero. An interval touching or
straddling zero withholds the crossing. For OLS the
bounds are the two-sided 95 % Student-t interval `b ± t(0.975, n-2) * SE(b)`
with `SE(b) = sqrt(SSR / (n-2) / Sxx)`; the t quantile comes from a table for
1 to 40 degrees of freedom and from a stepwise table above that (the values
for 40, 50, 60, 80 and 100 degrees of freedom up to 50, 60, 80, 100 and 120,
then 1.959963985). For Theil-Sen the bounds are the 95 % rank bounds of the
"Theil-Sen" section. These are slope bounds, not prediction intervals. The
level is not configurable.

Decided 2026-10-07 (formerly OD-4): the three-measurement minimum and the confidence gate stay. With three points the OLS 95 % interval uses t(1) = 12.706, so three measurements almost never yield a projection; the methodology page says so and shows the withheld example (60, 50, 25) beside one that is reported.

**Horizon.** Confirmed by the owner on 2026-10-07. The crossing must lie no more than 20 years after
the latest eligible row, in 365.25-day years. Exactly 20 years is reported.
The value 20 is fixed in code.

**Withheld reasons.** When the projection toggle is on and no age is reported,
exactly one reason is set, the first that applies in this order. The code is
exported in `endpoint_prediction_reason`; the label is the table badge.

| Order | Code | Condition | Badge label |
| --- | --- | --- | --- |
| 1 | `observed_ckd_g5` | The eligible rows contain a confirmed observed G5, with or without later kidney replacement therapy and whether or not the observed-G5 endpoint is switched on. | With the observed-G5 endpoint on, none: the `CKD G5` badge with its dates is shown. With it off, `G5 not projected`, whose detail text names the confirmed event. |
| 2 | `kidney_failure_reached` | Kidney failure reached and no confirmed observed G5. | `G5 not projected after KRT` |
| 3 | `insufficient_points` | Fewer than three eligible rows. | `G5 n < 3` |
| 4 | `span_too_short` | First to latest eligible row under 365 days. | `G5 < 1 yr` |
| 5 | `no_fit` | Slope or intercept of the endpoint fit not finite; with three rows over a year this means fit model "No fit". | `G5 no fit` |
| 6 | `non_declining_fit` | Slope zero or positive. | `G5 not projected` |
| 7 | `already_below_threshold` | The fitted line reaches 15 at or before the latest eligible row (`t <= span`). | `G5 now` |
| 8 | `missing_age` | The latest eligible row has no age (see "Age at the latest eligible row"). | `G5 no age` |
| 9 | `slope_ci_unavailable` | A slope bound is missing or not finite, or the bounds are inverted. | `G5 not projected` |
| 10 | `slope_ci_includes_zero` | Lower bound at or below zero and upper bound at or above zero. | `G5 not projected` |
| 11 | `beyond_projection_horizon` | Crossing more than 20 years after the latest eligible row. | `G5 not projected` |

The `G5 not projected` cases (`non_declining_fit`, `slope_ci_unavailable`,
`slope_ci_includes_zero`, `beyond_projection_horizon`, and `observed_ckd_g5`
with the observed-G5 endpoint off) are told apart by the badge's detail text.
`G5 now` states only that the fitted line is at or below 15 at the latest
measurement; it does not establish an observed event. The internal code
`disabled` (toggle off) is never exported. The order has consequences: a
column with fit model "No fit" reports `insufficient_points` or
`span_too_short` before `no_fit`, and a flat series with two rows reports
`insufficient_points`, not `non_declining_fit`.

A confirmed observed G5 event takes precedence over a future projection,
whether or not the observed-G5 endpoint is switched on (decided 2026-10-07,
formerly OD-18). With that endpoint off the event is still evaluated for this
purpose with the column's confirmation interval; the projection is withheld
as `observed_ckd_g5` and the badge reads `G5 not projected`, while the event
itself is not reported and its own export columns stay blank. The export
fills `endpoint_confirmation_days` and `endpoint_confirmation_max_months`
whenever the projection is enabled, because they decide this result. Before, a future G5 age was projected for such a patient.
This also holds after a recorded recovery: once G5 is confirmed, the projection
stays withheld as `observed_ckd_g5` however far eGFR recovers. Measurements
dated after the confirmation cannot revoke or redate the event (the first value
of 15 or more is recorded as recovery); they can change a projection. A
measurement added on or before the confirmation date can change the event: a
value of 15 or more between candidate and confirmation, or on the confirmation
day itself, removes it, and an earlier low value redates the first crossing.
The whole series is re-evaluated in date order each time.

**Example 1: crossing arithmetic, withheld by the confidence gate.** Model
years [0, 1, 2], values [60, 50, 25] give OLS a=62.5, b=-17.5. Target 15 is
reached at t=2.7142857, that is 0.7142857 years after year 2, rather than
0.5714286 from the former last-measurement anchor. The app does not report
this crossing: SE(b)=4.3301 and t(1)=12.7062 give slope bounds
[-72.519, 37.519], which include zero, so the reason is
`slope_ci_includes_zero`. On the calendar dates 2020-01-01, 2021-01-01 and
2022-01-01 the time axis is 0, 1.00205 and 2.00137 years and the bounds are
[-72.642, 37.673], with the same result.

**Example 2: reported projection.** A patient born 1960-06-01 has eGFR 48, 44,
41, 36, 33 and 29 on 15 January of 2018 to 2023. The time axis is 0, 0.99932,
1.99863, 3.00068, 4 and 4.99932 years; the row ages are 57 to 62.

- OLS: a=47.9987, b=-3.8000 per year, R²=0.9969.
- Slope bounds with t(4)=2.776445: [-4.0953, -3.5047], strictly below zero.
- Span: 1826 days = 4.99932 years; fitted value at the latest row 29.0013.
- Crossing: t=(15-47.9987)/(-3.8000)=8.68389 years after the first row, which
  is 3.68457 years after the latest row and within the 20-year horizon.
- Projected age with the birth date known (from the attributes table or the
  lab rows): the exact age at the latest row is 62.623 years, so
  62.623 + 3.68457 = 66.307; the badge shows `G5 @ 66.3y`.
- Projected age without a birth date (the file states only ages 57 to 62):
  62 + 3.68457 = 65.68457; the badge shows `G5 @ ~66y`.
- With Theil-Sen selected: slope -3.8005, intercept 48, bounds
  [-4.0027, -3.0021], crossing 3.68371 years after the latest row.

Regression evidence: [endpoint tests](../tests/core/endpoints/ckdEndpoints.test.ts),
[cohort cell tests](../tests/core/cohort/screening.test.ts),
[export tests](../tests/core/cohort/exportRecords.test.ts),
[label tests](../tests/workspace/labels/qualityLabels.test.ts) and
[method contract tests](../tests/workspace/method-contract.test.tsx). The
endpoint tests supply slope bounds directly rather than from a fit. The
[decision tests](../tests/core/endpoints/decisions20261007.test.ts) cover the
two age bases, the 364-day versus 365-day span boundary, the projection with
the observed-G5 toggle off and the 365-day limit of the confirmation
interval. No dedicated regression test for the age of an earlier row carried
forward or for the full reason order.

### Export provenance

The cohort sheet (`cohort`, or `slopes` for a single patient) carries one row
per patient and parameter with these endpoint columns, in this order (within
each event block the three dates precede the three values). The
first three keep their original position; later columns are appended. Dates
are UTC calendar days as `YYYY-MM-DD`. "Enabled" refers to the column's
endpoint toggles on a series that passes the unit gate.

| Column | Filled when | Content |
| --- | --- | --- |
| `endpoint_percent_decline` | Percent decline enabled, at least one eligible row, first value above zero. | Total decline in percent, positive for a fall, unrounded. |
| `endpoint_observed_ckd_g5` | Observed G5 confirmed. | `yes` |
| `endpoint_projected_age_to_ckd_g5` | A projection is reported. | Age in years, unrounded. |
| `endpoint_observed_ckd_g4` | Observed G4 confirmed. | `yes` |
| `endpoint_confirmation_days` | G4, G5, percent decline or the projection enabled. | Effective minimum interval in days, at most 365. |
| `endpoint_input_policy` | Any endpoint enabled. | Fixed text: "dated exact numeric measurements before first kidney transplant/chronic dialysis; dated acute dialysis intervals excluded (inclusive); bounds excluded". |
| `endpoint_kidney_failure_reached` | Kidney failure reached, whatever the toggles. | `yes` |
| `endpoint_kidney_failure_type` | As above. | `kidney_transplant` or `chronic_dialysis` |
| `endpoint_kidney_failure_date` | As above. | Event date. |
| `endpoint_prediction_anchor` | Projection enabled and no kidney failure reached. | `fitted curve` |
| `endpoint_prediction_model` | Projection enabled and no kidney failure reached. | `ols`, `theil-sen` or `none`: the estimator of the endpoint fit. |
| `endpoint_prediction_reason` | Projection enabled and withheld. | A code from the table above. |
| `endpoint_prediction_slope_ci_low`, `endpoint_prediction_slope_ci_high` | Projection enabled and the endpoint fit has that bound finite. | Slope bounds of the endpoint fit, per year. Filled also when another reason withholds the projection. |
| `endpoint_prediction_max_years` | Projection enabled. | `20` |
| `endpoint_g4_first_date`, `endpoint_g4_confirmed_date`, `endpoint_g4_recovery_date`, `endpoint_g4_first_value`, `endpoint_g4_confirmed_value`, `endpoint_g4_recovery_value` | First and confirmed: observed G4 confirmed. Recovery: recovery recorded after a confirmed G4. | First crossing, confirmation and recovery (first value of 30 or more). |
| `endpoint_g5_*` (same six, same order) | As for G4. | Threshold 15. |
| `endpoint_confirmation_max_months` | G4, G5, percent decline or the projection enabled. | `12` |
| `endpoint_decline_baseline_value` | Percent decline enabled and at least one eligible row. | Mean baseline eGFR, also when it is zero or negative. |
| `endpoint_observed_decline_40`, `endpoint_observed_decline_57` | Decline event confirmed. | `yes` |
| `endpoint_decline_40_*`, then `endpoint_decline_57_*` (each: first, confirmed and recovery date, then first, confirmed and recovery value) | As for G4. | Dates and eGFR values, not percentages. |
| `endpoint_prediction_age_basis` | A projection is reported. | `birth date` or `age in completed years`; see "Age at the latest eligible row". |

Blank provenance means the endpoint was not evaluated for that series (for
example a unit other than mL/min/1.73 m² or a preset with endpoints off), not that it
was not met. A blank `yes` column alone does not distinguish "not met" from
"not evaluated". `endpoint_confirmation_days` and
`endpoint_confirmation_max_months` are filled when any of G4, G5, percent
decline or the projection is enabled, and `endpoint_input_policy` when any endpoint is enabled;
they show that the series passed the unit gate with some endpoint on, not which
one. With G4 on and G5 off, a blank `endpoint_observed_ckd_g5` sits beside a
filled confirmation interval. Per endpoint, only the `endpoints` section of the
`fit_config` JSON on the `settings` sheet tells; `endpoint_decline_baseline_value`
additionally shows that percent decline was evaluated on at least one eligible
row, and `endpoint_prediction_max_years` that the projection was. The kidney-failure columns are
the exception: they are filled whenever kidney failure is reached. When a
future projection is withheld after kidney replacement therapy without a prior
observed G5, projected age, anchor, model and slope bounds are blank and the
reason is `kidney_failure_reached`. A prior observed G5 keeps its own lab
dates alongside the event date. With fit model "No fit" and the projection
enabled, the anchor reads `fitted curve` and the model `none`.

The `about` sheet states that observed G4 below 30 and G5 below 15 use dated
exact numeric eGFR before the first kidney transplant or chronic dialysis and
outside complete acute dialysis intervals, that kidney replacement therapy is
reported separately, and that the individual prediction fits the same rows
with slope bounds that are not prediction intervals. The `events` sheet lists
the exported patients' events.

The export does not record:

- the length of the decline baseline window (90 days), the 40 % and 57 %
  definitions, or the candidate rules;
- the confidence level and method behind the OLS slope bounds (the `about`
  sheet names 95 % bounds for Theil-Sen only);
- the endpoint fit's slope and intercept; the `slope` column is the display
  fit;
- the number of endpoint-eligible rows; `n` counts raw rows and `n_fitted`
  the display fit;
- the age anchor used for the projected age, or that row ages are whole
  completed years;
- which measurements the event filter removed, and the same-date transplant
  tie rule;
- the G4/G5 thresholds as columns (they appear in the `about` text only).

Regression evidence: [export tests](../tests/core/cohort/exportRecords.test.ts),
[workbook tests](../tests/workspace/export.test.ts) and
[method contract tests](../tests/workspace/method-contract.test.tsx).

These definitions intentionally replace the historical web rules. They are
owner-approved research definitions, not claims of clinical validation. The
owner confirmed the 12-month maximum confirmation window, the 90-day decline
baseline window and the 20-year projection horizon on 2026-10-07. The one
default still marked *(proposed)*, the absence of a pre-KRT counterfactual
projection, was chosen during implementation and remains open to the owner's
revision. A projected crossing is a property of a
fitted line and must not be read or presented as a prognosis.

## Cohort mixed models

The Cohort models page fits one linear mixed-effects model per fitted unit: the
whole cohort and, when a grouping attribute is chosen, each group. The fit runs
in the browser through webR. This section records what the code does today,
including behaviour that is open to an owner decision. Open points are marked.
The models are exploratory research estimates, not clinical predictions.

### Model specification

The model is a linear mixed model with a Gaussian response and identity link.
The outcome is the selected series' numeric value in its imported unit; it is
not transformed. Time enters linearly only: there is no quadratic, spline or
piecewise term. Each patient is one grouping level (`patient_id`).

`mixedModelFormula` (`src/core/mixedModel/config.ts`) builds the formula. The
fixed part is `time_since_baseline`, followed by one column per configured
factor in the configured order. A factor with the effect *level* adds its
column. A factor with the effect *level and slope* adds its column and its
interaction with time. The built-in baseline age uses the column
`baseline_age_centered`; every other factor uses the positional column
`factor_<i>_`, where `i` is the zero-based position in the factor list, so
attribute names supplied by the user never enter R code.

```r
# no factors, random intercept and slope (default)
value ~ time_since_baseline + (1 + time_since_baseline | patient_id)

# no factors, random intercept only
value ~ time_since_baseline + (1 | patient_id)

# baseline age (level) and sex (level), random intercept and slope
value ~ time_since_baseline + baseline_age_centered + factor_1_ +
  (1 + time_since_baseline | patient_id)

# one factor with level and slope, random intercept and slope
value ~ time_since_baseline + factor_0_ + time_since_baseline:factor_0_ +
  (1 + time_since_baseline | patient_id)
```

The formula strip above the Fit button shows a readable form: the series name
without unit as outcome, `Time (years)`, `Patient`, and the quoted factor names
instead of the column names. The unit's Details panel and the export show the
executable formula with `value` replaced by the series name and unit, for
example `eGFR (ml/min/1.73m2) ~ time_since_baseline + …`.

- **Random effects.** The default is a random intercept and a random slope per
  patient, and every interface preset sets it. A random intercept alone is a
  manual choice. With intercept and slope the 2 × 2 random-effect covariance is
  unstructured: both variances and their correlation are estimated.
- **Residuals.** One residual variance; no residual correlation structure and no
  variance function.
- **Estimation.** Restricted maximum likelihood (REML).
- **Optimizer and control.** Package defaults. No `lmerControl` or `lmeControl`
  is passed.
- **Missing values.** `na.action = na.fail`. Rows reaching R are complete by
  construction (see *Factors and covariates*); a missing value is an error, not
  a silent row drop.
- **Model time.** Only `time_since_baseline` is supported. A configuration with
  age as the model time is rejected ("Age as the mixed-model time axis is not
  supported yet.").
- **Engine.** The interface always fits with lme4:

```r
lme4::lmer(<formula>, data = mm_data, REML = TRUE, na.action = na.fail)
```

A second engine is implemented in the worker but is reachable only from tests
and the verification scripts:

```r
nlme::lme(<fixed part>, random = ~ time_since_baseline | patient_id,
          data = mm_data, method = "REML", na.action = na.fail)
# random intercept only: random = ~ 1 | patient_id
```

**Interface presets.** *Standard* has no factors. *Subgroup comparison* has no
factors and fits per group (see *Stratified (grouped) fits*); it keeps the
current grouping attribute or else selects the first groupable attribute in
numeric-aware, case-insensitive order, which can be `birthDate` or `sex`.
*Demographic adjustment* adds baseline age (level) and sex (level). *Group
interaction* adds, with level and slope, the first groupable attribute other
than `sex` in that order; when `sex` is the only one it uses `sex`. A
categorical attribute becomes a categorical factor with its first sorted level
as reference. A numeric attribute becomes a numeric factor without a reference
level (`groupInteractionFactor`; decided 2026-10-07, formerly OD-23: before,
the preset stored a reference level with the numeric factor, which
`validateMixedModelConfig` rejects, so nothing could be fitted). When the
dataset has no attribute and no resolved sex the preset stores a factor
`genotype` without a reference level, which is an invalid configuration: the
formula strip is empty, every unit with model rows shows "Invalid or duplicate
mixed-model factor; categorical factors require a reference level." and
nothing is fitted. *Custom* leaves the choice to the user.

The *Group interaction* description reads "Estimates slope differences with
95% confidence intervals; no p-values are computed." (decided 2026-10-07,
formerly OD-6; before, it promised p-values). No p-value is computed,
displayed or exported for any model, only Wald confidence intervals.

### Which measurements enter

`prepareMixedModelCohortRows` (`src/core/mixedModel/cohortDataset.ts`) builds
the model rows per patient in these stages, in this order.

1. **Row eligibility.** Rows of the selected series only: identical name and
   identical unit (a missing unit matches only a missing unit), a numeric value,
   a date, and an exact value. Rows whose operator is not `=` never enter. Rows are
   ordered by date. Different names or units are never pooled.
2. **Disabled fit.** A series whose configuration has `fitModel: none` supplies
   no model rows. The page then states that no cohort model is prepared for
   this parameter.
3. **Preset exclusion windows.** The cohort-model exclusion checkbox starts on.
   When on, the series configuration's clinical-event censoring windows and AKI
   windows remove eligible rows. A row is inside a window when
   `start <= date <= end`, both bounds included; a censoring window without an
   end is open-ended. When off, those windows are skipped for cohort
   mixed-model rows only.
4. **Time balancing.** The series configuration's time balancing is applied to
   the rows that remain. `raw` keeps every row. `monthly-median` and
   `quarterly-median` reduce each UTC calendar month or quarter (January–March,
   April–June, …) to one point. Its value is the median, the mean of the two
   middle values for an even count. Its date is the date of the observation at
   zero-based position `floor((n - 1) / 2)` in date order, the earlier of the
   two middle observations for an even count. The point's age is taken from a
   source row at the same timestamp, preferring one with the same value.
5. **Chronic run-in.** See *Implemented but not reachable from the interface*.
6. **Patients without a retained point** are left out of the model and of its
   patient count. They are not listed among excluded patients.

**Count.** The per-unit count `excludedByPreset` is the number of eligible exact
dated rows inside the union of the active event and AKI windows; overlapping
windows count a row once. It is computed for the whole cohort and for each group
separately. Time balancing, chronic run-in and missing-factor removal are later
stages and do not increase this count. The policy and count are stored with each
fitted unit, displayed in the model workspace, and exported in the `models`
worksheet. Changing the policy invalidates fitted results and their projections.

**What the interface supplies** (decided 2026-10-07, formerly OD-1). The
series configuration of a cohort model is the fit configuration that
Trajectories applies to the same parameter: the parameter's own settings when
it has some, otherwise the shared settings (`workspaceModelSpec`,
`trajectoryFitConfig`). Trajectories publishes its settings to the shared
application state on every change. The model therefore receives the
measurements the trajectory fit of that parameter receives: the same event
censoring, AKI windows and time balancing, and none for fit model "No fit".
The fit model otherwise has no effect on the mixed model; with Theil-Sen,
rolling or segmented OLS the rows are the same as with OLS. Before, the page
always used general exploration, so no window and no time balancing could
apply and the count was always 0.

- Until a preset is chosen under Trajectories, and for a dataset just loaded,
  the configuration is general exploration: no event censoring, no AKI
  exclusion, raw time balancing.
- Below the checkbox the page states the configuration in use and whether it
  is the shared one or the parameter's own, for example "CKD progression
  (shared settings): quarterly medians; event windows after kidney transplant,
  after chronic dialysis start, acute dialysis intervals, dated dialysis of
  unknown intent; AKI windows 30 days." A preset that was edited is named
  "Edited settings". A parameter that is not among the Trajectories columns
  keeps own settings given to it earlier.
- With fit model "No fit" the page says that no cohort model is prepared, the
  Fit button is disabled and the count of excluded measurements is not shown.
- The checkbox *Apply preset event and AKI exclusions* switches stage 3 only.
  Time balancing (stage 4) and the "No fit" rule (stage 2) apply in either
  position.
- A change under Trajectories to the fit model, the time balancing, the
  censoring options or the AKI exclusion of a parameter discards the fitted
  models and projections when a model of that parameter is stored, like every
  other change to the model data; a running fit is stopped by any such change.
  Changes to endpoint settings, to the rapid-decline threshold or to the
  settings of another parameter do not. The identity of a fitted result
  depends on the same four settings and on nothing else of the fit
  configuration; the display axis of a preset is not part of it.
- The reference line drawn in the Trajectories overlay is looked up with the
  same configuration.

For a patient with exact values on 2020-01-01, 2020-07-01 and 2021-01-01 and a
kidney transplant on 2020-07-01, general exploration keeps all three rows and
reports a count of 0. With the CKD progression preset selected under
Trajectories one row is kept and the count is 2; with the checkbox off all
three rows are kept, the count is 0, and quarterly medians still apply.

**Model time.** For each patient, `time_since_baseline` is measured in
fractional years from that patient's first retained model measurement after
exclusion windows, time balancing, and any chronic run-in removal:

`time_since_baseline = (date - first retained date) in ms / (365.25 × 86 400 000)`

The result is rounded to 10 decimals. The first retained row of every patient
has time 0. A bound does not supply a time origin. It is not time since a shared
calendar date or disease onset, and patients need not enter on the same date.
Example: exact values on 2020-01-01, 2020-07-01 and 2021-01-01 have model times
0, 0.4982888433 and 1.0020533881; a `<` value on 2020-01-01 changes nothing.

**Baseline age** is the age at measurement (`patientAgeAtLab`) of the patient's
first retained model row. It is missing when that row has no finite age.

**Follow-up process.** The model uses observed eligible visits and does not fit
a visit or dropout process. A trend can be biased when the chance of a later
visit or dropout depends on an unobserved outcome; review follow-up patterns
and use a study-specific sensitivity analysis.

### Minimum data and validity gates

`validateMixedModelRows` (`src/core/mixedModel/validation.ts`) decides whether a
unit can be fitted. It runs in the interface, where a failing unit is disabled
and shows the message, and again in the worker before R is started. The checks
run in this order; the first failure is reported.

1. At least one row; every row has a non-empty patient id and a finite value
   and time.
2. The configuration is valid: each factor key appears once, a categorical
   factor names a reference level, a numeric factor names none, and baseline
   age is numeric.
3. The factor validity gate, for each configured factor:
   - every model row carries a valid value (a finite number, or non-blank text);
   - the value is constant within each patient;
   - at least two distinct values occur across the model rows;
   - for a categorical factor, the reference level occurs in the model rows.

   There is no minimum number of patients per level; a level held by a single
   patient passes.
4. At least 10 patients have a model row.
5. At least 10 patients qualify. A patient qualifies with at least two rows and
   at least three distinct `time_since_baseline` values for a random intercept
   and slope, or at least two distinct values for a random intercept alone.
   Distinct means unequal after the 10-decimal rounding.

The minimum is a technical input guard, not a power calculation or guarantee of
adequacy.

**Patients who do not qualify stay in the fit.** The gate counts qualifying
patients; it does not remove the others. A patient with one measurement, or
with too few distinct times, contributes all of its rows to the model.
**Rows of one patient at the same model time are all kept**, for example two
values on one day. `validateMixedModelRows` returns a warning text for each of
these three situations (duplicate times are counted for qualifying patients
only), but a passing validation's warnings are not displayed,
not attached to the fitted result and not exported.

**The gate applies per unit.** The whole cohort and each group are checked
separately with the same thresholds. *Fit* submits only the units that pass.

**Rank-deficient design.** Before fitting, R builds the fixed-effect model
matrix and compares its QR rank with its number of columns. A lower rank stops
with "Fixed-effect design is rank deficient; no terms were dropped." For lme4, a
fit that dropped fixed-effect columns is also rejected. A fit whose intercept or
time slope is not finite, or that does not return a finite estimate for every
design column, is rejected. Each of these is reported as a failed fit; no term
is ever dropped silently.

### Factors and covariates

Factors are patient-level covariates: the built-in `baseline_age` and `sex`, and
every column of the imported attributes table that holds a value for a patient
in scope. `prepareMixedModelFactors` (`src/core/mixedModel/factors.ts`) prepares
them for each fitted unit.

**Type.** `baseline_age` is numeric and `sex` is categorical. Any other
attribute is numeric when it has at least one non-blank value and every
non-blank trimmed value among the patients in scope matches the numeric grammar
and converts to a finite number (`1e999` does not), and categorical otherwise. The grammar is an optional sign, digits with an
optional decimal point (or a leading point), and an optional exponent:
`^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$`. A decimal comma (`1,5`), a
thousands separator or inner whitespace does not match, so one such value makes
the whole attribute categorical. The interface applies this type when the
factor is added and offers no control to change it.

> **Open decision OD-22.** The factor type (numeric or categorical) is chosen automatically with no control to override it (a comment in `src/core/mixedModel/factors.ts` still says the dialog selects factor kinds); numerically coded categories such as 0/1/2 therefore enter as one linear term. Behaviour is unchanged pending an owner decision.

**Complete cases.** A patient is removed from a unit's model, with all of its
rows, when any configured factor has no usable value: a missing or blank value
(`Missing <factor>`) or, for a numeric factor, text that fails the grammar
(`Invalid numeric <factor>`). Nothing is imputed. The removal affects this model
only. Removed patients are listed with their reasons under the formula, in the
unit's status cell and in the `excluded_patients` worksheet.

**Centring.** Each numeric factor is centred at the arithmetic mean of its raw
values over the complete-case patients of that unit, one value per patient
regardless of the number of measurements. The centred value is rounded to 10
decimals. The centre is stored with the fit and exported in the `centering`
worksheet as `patient_weighted_mean`. Example: complete-case baseline ages 40,
50 and 60 give the centre 50 and centred values −10, 0 and 10; a fourth patient
aged 70 without a value for another configured factor does not enter the mean.

**Meaning of the intercept and slope.** The intercept is the fitted value at
model time 0 for a patient whose numeric factors equal their centres and whose
categorical factors are at their reference levels. The `time_since_baseline`
coefficient is the slope per year for that same profile. The results table
therefore heads these columns *Reference intercept* and *Reference slope* when
factors are configured.

**Categorical coding.** Treatment contrasts with the configured reference level
first and the remaining observed levels in R's sort order
(`contr.treatment(levels, base = 1)`). Each non-reference level has one
coefficient, the difference from the reference level, named
`<column><level>`. With level and slope, `time_since_baseline:<column><level>`
is the difference in slope per year from the reference level.

**Default reference level.** The first level in ascending string order
(JavaScript default sort: digits before upper-case before lower-case letters)
among all patients of the loaded dataset that have a lab row of any series. It
is not restricted to the selected series or to a group. The default, and any
level offered in the selector, can therefore be absent from a unit's model
rows; that unit then fails the factor validity gate ("Factor … requires
variation and an observed reference level.") until another reference is
chosen. The same reference applies to the pooled fit and to every group. The
page names the reference in use and marks it as the default. *Demographic
adjustment* uses the first sorted sex code of the dataset (`d` before `m`
before `w`), or `w` when no sex is available.

> **Open decision OD-29.** The default reference level of a categorical factor is taken from all patients of the dataset, not from the fitted series or group, so it can be a level that the fitted unit does not contain; that unit then cannot be fitted until another reference is chosen, and one reference is shared by the pooled fit and all groups. Behaviour is unchanged pending an owner decision.

**Category text.** Values are trimmed and otherwise compared exactly, including
case: `A1` and `a1` are different levels.

**Source of `sex`.** The factor value is the patient's resolved sex (see
"Demographics resolution": manual entry, else the recognised attributes-table
sex, else the most frequent row code; a tie yields none). A patient without a
resolved sex is removed as a complete-case exclusion (`Missing sex`).
`prepareMixedModelFactors` also contains rules for unresolved input (exactly
one recognised row code is used, several count as missing, the normalised
attribute `sex` is a fallback when rows carry none); the interface never
supplies such input.

**Coefficient units in the export.** Level terms carry the outcome unit, slope
terms the outcome unit per year. A numeric factor adds "per year of baseline
age" or `per unit of <factor>`.

### Convergence and singularity

Singularity is reported separately from optimizer convergence.

**Converged, lme4.** The optimizer's convergence code (`optinfo$conv$opt`) is
absent or 0, and lme4 recorded no convergence message other than messages
containing "singular" (case-insensitive). A boundary fit alone therefore does
not count as non-convergence.

**Converged, nlme.** No warning raised during the fit contains "converg"
(case-insensitive). A hard failure is an R error and is reported as a failed
fit.

**Singular, lme4.** `isSingular` with relative tolerance `1e-4`.

**Singular, nlme.** For a random intercept, the random-intercept standard
deviation divided by the residual standard deviation is below `1e-4`. For an
intercept and slope, the square root of the ratio of the smaller to the larger
eigenvalue of the 2 × 2 random-effect covariance is below `1e-4`. A fit is also
treated as singular when a standard deviation or the correlation needed for the
check is missing or not finite, the residual standard deviation is not positive
(intercept only), a random-effect standard deviation is not positive or the
correlation lies outside [−1, 1] (intercept and slope), or the larger eigenvalue
is not positive.

**Warnings.** R warnings raised during the fit and all lme4 messages are stored
with the result, shown in the unit's details and exported.

| Fit state | Coefficients, intervals, standard deviations | Export | Fitted model line | Projections |
| --- | --- | --- | --- | --- |
| Converged, not singular | Shown | `models`, `coefficients`, `projections` | Drawn | Available |
| Singular | Shown; status "singular fit; projection withheld" | `models` (`singular` true), `coefficients` | Withheld | Withheld |
| Not converged | Shown; status "did not converge" | `models` (`converged` false), `coefficients` | Withheld | Withheld |
| Failed (R error, timeout, runtime) | None; status `Fit failed: <message>` | `models` row with `status` and `message` | None | None |
| Fails the validity gate | None; the validation message | None (never fitted) | None | None |

Singular and non-converged coefficients remain inspectable and exportable; they
are estimates from a fit that should not be relied on without review.

### Confidence intervals

Intervals are reported for fixed effects only, at the packages' default level of
95 %.

- **lme4:** `confint(fit, method = "Wald")`, the estimate plus or minus the
  normal quantile times its standard error.
- **nlme:** `intervals(fit, which = "fixed")`, nlme's approximate intervals.

When the interval call fails or returns a non-finite bound, the interval is
unavailable and shown as "n/a". No interval is computed for the random-effect
standard deviations, their correlation or the residual standard deviation. No
p-value or other test statistic is computed, displayed or exported.

### Stratified (grouped) fits

Choosing a grouping attribute fits one independent model per group value in
addition to the pooled whole-cohort model, each with the same formula. Units
are fitted one after another and a failure in one does not stop the others.
There is no joint model and no test between groups; differences between group
slopes are not accompanied by an interval. A factor with level and slope in a
single pooled model is the implemented way to estimate a slope difference.

**Group value.** `groupPatients` (`src/core/grouping/grouping.ts`) uses the
trimmed attribute value. Comparison is exact and case-sensitive: `B` and `b`
are two groups. A patient with a missing or blank value belongs to the group
`(ungrouped)`, which is fitted like any other group. Named groups are ordered by
a numeric-aware, case-insensitive comparison (`9` before `10`) and `(ungrouped)`
comes last. Values that differ only in case keep the order in which they first
occur in the patient list. Example: values ` B `, `b`, `B`, `10`, `9` and a blank give the
groups `9`, `10`, `B` (two patients), `b`, `(ungrouped)`.

**Per-group preparation.** Row selection, the exclusion count, complete-case
removal, centring and all gates run separately for each group. Numeric factors
are therefore centred at each group's own mean, and the reference intercepts of
two groups refer to different covariate values unless their centres coincide.

**Omitted groups.** A group with no model rows and no rows removed by preset
windows is not listed. A group that has rows but fails a gate is listed with its
message and is not fitted.

**Sex as grouping attribute and as factor.** In the interface both uses read
the same resolved sex (see "Demographics resolution"), so they cannot disagree:
grouping by `sex` gives `m`, `w`, `d` and `(ungrouped)` for patients without a
resolved sex, and the `sex` factor removes exactly those `(ungrouped)` patients
as `Missing sex`. An unrecognised attribute spelling never becomes a group.
The grouping and factor functions would treat raw conflicting sources
differently (attribute over first row sex, versus rows over attribute), but the
workspace passes them resolved values only.

### Reproducibility

- **Runtime.** webR is the npm dependency `webr` at `^0.6.0`, locked to 0.6.0.
  The worker starts it with default options, so the R runtime is downloaded from
  webR's default location on first use.
- **R packages.** `lme4` (or `nlme`) and `jsonlite` are installed from webR's
  default package repository when the first model is fitted in a session. No
  version is pinned. The same data can give different numbers after a
  repository update.
- **Recorded per result.** The R version, the package versions actually loaded,
  the optimizer name, the browser user agent, a hash of the model rows and a
  hash of the fit configuration.
- **Timeout.** A fit job is abandoned after 120 seconds, including the
  first-time download and installation, and reported as failed with the status
  `timeout`. The worker is then discarded and the next job reloads the runtime.
- **No random numbers.** No seed is set; `randomSeed` is always empty.

The `models` worksheet has one row per fitted unit:

| Column | Content |
| --- | --- |
| `entity` | "Whole cohort" or the group value |
| `series_key`, `outcome`, `outcome_unit` | Fitted series |
| `status` | `success` or the failure status |
| `engine` | `webr-lme4` |
| `formula` | Executable formula with the series name and unit as outcome |
| `modelConfig` | JSON: time axis, factors with type, effect and reference, random effects |
| `preparation` | JSON: patients and measurements before factor exclusion, excluded patients with reasons, centres, exclusion policy and count |
| `preset_exclusion_policy`, `excluded_by_preset` | Exclusion policy and count |
| `reml` | Always true |
| `optimizer` | Optimizer reported by lme4, or `lme4-default` when it reports none |
| `tolerance` | Constant `1e-6` |
| `runtimeVersion` | R version of the webR runtime |
| `packageVersions` | JSON: loaded versions of `lme4` (or `nlme`) and `jsonlite` |
| `browserUserAgent`, `wasmAssetSource` | Browser and runtime source (`cdn`) |
| `datasetId`, `datasetHash`, `fitConfigHash` | The constant `cohort`, and hashes of the model rows and of the configuration |
| `randomSeed` | Empty |
| `warnings` | R warnings and lme4 messages |
| `patients`, `measurements`, `converged`, `singular` | Successful fits |
| `message` | Failed fits |

A fit that fails before the worker answers (for example a timeout) has only
part of this provenance. The other worksheets are `coefficients` (every fixed
effect with unit, estimate and interval bounds), `factors`, `centering`,
`excluded_patients`, `projections` when a projection is applied, and `about`.

> **Open decision OD-21.** The exported `tolerance` (1e-6) is not used by any fit — the only tolerance in the fit is the 1e-4 singularity check — and the R packages are not version-pinned, so the export records the versions used but a later session can load different ones. Behaviour is unchanged pending an owner decision.

### Fitted model line

`mixedModelMeanLinePoints` (`src/core/mixedModel/resultIdentity.ts`) draws a
unit's fitted line as

`value(t) = intercept + time slope × t`

using the fixed-effect intercept and `time_since_baseline` coefficient only.
(The function can also shift the line by a centred baseline age; the interface
always passes none or 0, so that path is not reachable.)
With factors this is the *reference profile*: numeric factors at their centres
and categorical factors at their reference levels. It is not an average over the
cohort's categories, and random effects do not enter.

- **Extent.** The line runs from the smallest to the largest
  `time_since_baseline` among the unit's model rows after complete-case removal.
  It is not extended beyond observed model time. No line is drawn when all
  model times are equal. Example: intercept 62, slope −3 and model times from 0
  to 4.5 years give the segment from (0, 62) to (4.5, 48.5).
- **When it is drawn.** Only for a successful, converged, non-singular result
  whose stored identity matches the current series, unit, data, preparation and
  model configuration. Display filters do not refit or redefine it.
- **Cohort models preview.** The x-axis is model time. Points are the pooled
  model rows before complete-case removal; lines are the pooled fit and each
  fitted group.
- **Trajectory overlay.** Off by default ("Show model line in overlay"). The
  line is drawn on the axes "Years since first measurement" and "Age", not on
  the calendar axis. Group lines appear when the overlay is grouped by the
  attribute the groups were fitted under, for groups that are visible.
- **Years axis.** The line is placed at its model time. Patient curves on this
  axis start at each patient's first plotted value of the series, which
  includes `<`/`>` values; model time starts at the first retained exact value.
- **Age axis.** x = mean baseline age + model time. The mean takes one baseline
  age per patient over the unit's modelled patients with a known baseline age.
  No line is drawn when none has one. Example: mean baseline age 55 places the
  segment above at ages 55 to 59.5.

### Implemented but not reachable from the interface

The following rules exist in the core and are covered by unit tests, but no
interface path selects them. They are documented so that the code and this
reference agree; they do not affect results produced through the interface.

- **Chronic run-in removal.** For a series in slope mode `chronic-ckd`, model
  rows dated on or before the first retained row's date plus the cutoff (default
  90 days) are removed after time balancing; only rows strictly later than that
  moment remain, and the first of them becomes the time origin and baseline-age
  source. `modeForFitModel` never returns this mode.
- **The nlme engine**, including its convergence and singularity rules above.
  The interface always requests `webr-lme4`.
- **Legacy baseline-age covariate.** A configuration with
  `covariates: ['baseline_age']` and no factor list centres baseline age at the
  mean over all modelled patients with a known age and fails validation when
  any modelled patient lacks one, instead of removing that patient. The
  initial configuration has no factor list and no covariates, which gives the
  same model as *Standard*; every preset and factor edit sends a factor list.
  No interface path produces `covariates: ['baseline_age']` without one.

Regression evidence:
[row preparation](../tests/core/mixedModel/cohortDataset.test.ts),
[minimum-data and duplicate rules](../tests/core/mixedModel/validation.test.ts),
[factor formulas and factor validity](../tests/core/mixedModel/configuredFactors.test.ts),
[complete cases, centring, sex source and typing](../tests/core/mixedModel/factors.test.ts),
[generated R code](../tests/core/mixedModel/webrWorkerRuntime.test.ts),
[result extraction](../tests/core/mixedModel/webrWorkerExtraction.test.ts),
[fitted line and result identity](../tests/core/mixedModel/resultIdentity.test.ts),
[export worksheets](../tests/core/mixedModel/modelExport.test.ts),
[timeout and worker handling](../tests/core/mixedModel/browserClient.test.ts),
[grouping](../tests/core/grouping/grouping.test.ts),
[workspace exclusion count, lines and withholding](../tests/workspace/model-validity.test.tsx),
[presets and reference categories](../tests/workspace/cohort-models.test.tsx)
and [results table](../tests/workspace/models/CohortModelTable.test.tsx).
The R code is asserted as text against a mocked runtime; the browser tests
replace the worker. Real webR fits run only in
[the factor verification script](../scripts/verify_mixed_model_factors.mjs) and
[the projection verification script](../scripts/verify_mixed_model_projections.mjs),
which are not part of `pnpm test` or CI. No dedicated regression test: the
numeric grammar's rejection of decimal commas, the shared resolved sex behind
grouping and the `sex` factor, a default reference level absent from a unit
(OD-29), the calendar-axis restriction of the overlay line, the status text of
a non-converged fit, and the fact that validation warnings are not surfaced.
The [model validity tests](../tests/workspace/model-validity.test.tsx) cover
the Trajectories settings reaching the model rows, the discarding of fitted
models and the Group interaction factor.

## Cohort-model projections

A projection reports when the fitted fixed-effect line of a chosen covariate
profile reaches a threshold. It is a crossing of a fitted line, conditional on
the trend continuing unchanged. It is not an expected event time, a
patient-specific prediction, a confirmed clinical stage or a prognosis.

### Profile line

`resolveProjectionProfile` (`src/core/mixedModel/projectionProfile.ts`) turns a
profile, one value per configured factor, into a line `y(t) = a + b × t`:

- `a` starts at the fitted intercept and `b` at the `time_since_baseline`
  coefficient.
- A numeric factor with profile value `x` and fitted centre `c` adds
  `coefficient × (x − c)` to `a`. Profile values are entered on the raw scale,
  for example an age in years.
- A categorical factor at its reference level adds nothing. At another level it
  adds that level's coefficient to `a`.
- A factor with level and slope adds, in the same way, its
  `time_since_baseline:` coefficient times `(x − c)`, or the level's interaction
  coefficient, to `b`. A level-only factor never changes `b`.

Only fixed effects enter. The line describes the population average for that
profile; no patient's random intercept or slope is used.

The default profile sets every categorical factor to its reference level and
every numeric factor to its fitted centre, so `a` and `b` equal the reference
intercept and slope. A model without factors has the single unadjusted profile.

The profile is unavailable, and every enabled target then reports "Profile
unavailable" with the reason, when a numeric value is missing or not finite, a
category is missing, a fitted centre or a required coefficient is absent, or a
chosen category does not occur among the complete-case patients of the fitted
unit ("Profile category is not present in the fitted population").

### Crossing time and status

`projectLinearThreshold` (`src/core/projection/linearProjection.ts`) evaluates
one target with threshold `q` and direction *below* or *above*, a reference
time `r` and a horizon `h`, both in years:

`model time t* = (q − a) / b`, `remaining years = t* − r`

Model time is years since each patient's own first retained measurement (see
*Which measurements enter*), not calendar time and not age. The reference time
is a point on that same scale; "remaining" counts from it.

The checks run in this order and the first match is reported.

| Order | Status | Condition |
| --- | --- | --- |
| 1 | `invalid` | `a`, `b`, `r`, `h` or `q` is not finite, `r < 0`, `h <= 0`, or the direction is unknown |
| 2 | `incompatible_target` | The target's outcome name or unit differs from the fitted series |
| 3 | `invalid` | `a + b × r` is not finite |
| 4 | `already_met` | *below*: `a + b × r < q`; *above*: `a + b × r > q` (strict) |
| 5 | `flat` | `b = 0` exactly |
| 6 | `away` | *below* with `b > 0`; *above* with `b < 0` |
| 7 | `crossing` | `a + b × r = q` exactly: model time `r`, remaining 0 |
| 8 | `invalid` | `t*` or the remaining time is not finite, or the remaining time is negative |
| 9 | `beyond_horizon` | remaining `> h`; a remaining time of exactly `h` is a crossing |
| 10 | `crossing` | Otherwise: model time `t*`, remaining `t* − r` |

Boundary cases for a *below* target of 30 at `r = 0`, `h = 20`: `a = 30`,
`b = −2` is a crossing at model time 0; `a = 30`, `b = 0` is `flat`; `a = 30`,
`b = 2` is `away`; `a = 29.9`, `b = −2` is `already_met`; `a = 70`, `b = −2`
is a crossing with exactly 20 remaining years; `a = 70.1`, `b = −2` is
`beyond_horizon`.

Two further row states come from the settings: `disabled` for a target the user
switched off, and `unavailable_profile` as described above.

### Settings and targets

- **Defaults.** Reference time 0 years, horizon 20 years, the default profile,
  and every preset target enabled.
- **Editable ranges.** The reference time must be finite and at least 0. The
  horizon must be finite and greater than 0. Thresholds must be finite. Target
  labels must not be empty. Changes take effect only after *Apply*.
- **Preset targets.** For an eGFR outcome the presets are the G4 boundary
  (*below* 30) and the G5 boundary (*below* 15), with the fitted series' own
  name and unit. They are offered when the unit is mL/min/1.73 m² in one of
  the four accepted spellings, whatever the outcome is called (`isEgfrUnit`,
  the rule of the individual eGFR endpoints; the spellings are listed under
  "Eligibility and kidney failure reached"). `eGFR (CKD-EPI 2021, computed)`,
  `eGFRcys` and `GFR (CKD-EPI)` in `ml/min/1,73m²` qualify, as does `eGFR` in
  `mL/min/{1.73_m2}`; the unit `ml/min` does not.
  Other outcomes have no preset.
- **Custom targets.** Any number can be added for the fitted outcome and unit.
  A new custom target starts as *below* 0 and enabled; its label, threshold and
  direction are editable. No unit conversion is applied.
- **Scope.** Settings are kept for the session per series and fitted unit, for
  as long as that unit's stored result is the one they were applied to. They
  are reset to the defaults when it is replaced by a result with a different
  identity, including a fit of another series.

### Uncertainty

Time uncertainty is not estimated: a projected time has no interval, and the
panel and export say so. The confidence interval of the slope is not used to
withhold a projection. A profile line whose slope interval includes zero still
reports a crossing whenever its point estimate moves toward the target within
the horizon. This differs from the individual G5 projection, which is withheld
when the endpoint fit's slope interval touches or includes zero.

### When projections are withheld

No projection is offered or exported for a unit unless its fit succeeded,
converged, is not singular, and its stored identity matches the current series,
unit, model rows, preparation and model configuration. A singular fit shows
"Projection unavailable: the random-effects fit is singular."; otherwise the
text is "Projection unavailable: a current converged fit is required." Changing
the loaded data, events, patient attributes, manual demographics, the eGFR
formula or source, the factors or random effects (including re-selecting a
preset) or the exclusion policy discards all fitted results and their
projection settings. Results are stored per unit, not per series: a stored
result that no longer matches the selected series or its current rows is
hidden, and it is overwritten, together with its projection settings, as soon
as that unit is fitted again.

### Export

The `projections` worksheet has one row per target with the unit, outcome and
unit, the source identity, the applied profile and settings, the profile line's
`intercept` and `slope_per_year`, `reference_time_years`, `horizon_years`, the
target's label, threshold, direction and enabled state, `status`, `reason`,
`model_time_years` and `remaining_years`. Every row states the anchor ("Fitted
model curve; years since each patient's first retained measurement") and
`time_uncertainty` = "not estimated". A unit without targets has one row with
the status `no_targets`.

### Worked example

Model: baseline age (level) and sex (level and slope, reference `w`), random
intercept and slope. Fitted centre of baseline age: 55 years. Fixed effects:
intercept 62, `time_since_baseline` −3, `baseline_age_centered` −0.4,
`factor_1_m` −2, `time_since_baseline:factor_1_m` −0.5.

- Default profile (age 55, `w`): `a = 62`, `b = −3`. With reference time 0 and
  horizon 20, the G4 boundary is crossed at model time 10.67 years and the G5
  boundary at 15.67 years.
- Profile age 65, `m`: `a = 62 − 0.4 × (65 − 55) − 2 = 56` and
  `b = −3 − 0.5 = −3.5`. G4 is crossed at `(30 − 56) / −3.5 = 7.43` years and G5
  at `(15 − 56) / −3.5 = 11.71` years.
- The same profile with reference time 2: remaining 5.43 and 9.71 years. With a
  horizon of 5 years both targets are `beyond_horizon`.
- The same profile with reference time 8: the line is at `56 − 3.5 × 8 = 28`,
  below 30, so G4 is `already_met`; G5 has 3.71 remaining years.

The panel shows times with two decimals; the export keeps full precision.

Regression evidence:
[profile line](../tests/core/mixedModel/projectionProfile.test.ts),
[crossing and status rules](../tests/core/projection/linearProjection.test.ts),
[snapshot, presets and withholding](../tests/core/projection/projectionSnapshot.test.ts),
[projection panel](../tests/workspace/models/ModelProjectionPanel.test.tsx),
[projection export](../tests/core/mixedModel/modelExport.test.ts),
[results table and singular fits](../tests/workspace/models/CohortModelTable.test.tsx)
and the [browser projection workflow](../tests/e2e/model-projections.e2e.ts).
No dedicated regression test: that a projection is still reported when the
slope confidence interval includes zero.

## Fit code not reachable from the interface

The following exist in the source and in tests, but no interface path selects
them: the workspace derives the slope mode from the fit model only, and
`cohortSeriesSpec` sets no mode parameter. They are not live behaviour and are
not part of the method description above. The corresponding list for cohort
models is at the end of [Cohort mixed models](#cohort-mixed-models).

- Slope mode `chronic-ckd`: removes fitted points up to and including the first
  fitted date plus a run-in of `cutoffDays` (default 90 days; only strictly
  later points stay), then runs the global fit. The mixed-model dataset has the
  matching "chronic run-in" branch, equally unreachable.
- Slope mode `event-driven`: splits the fitted points at event dates, fits each
  part with the global fit and reports the part with the largest absolute
  slope.
- Slope mode `aki-aware`: applies AKI windows whatever the column's exclusion
  option says, and draws its line with the OLS kernel without the two-point
  case. Live AKI exclusion uses the column option "Exclude AKI windows from
  fit" with the `global`, `global-robust`, `rolling` or `gap-split` mode.
- `fitAkiAware` (`src/core/domains/nephrology/aki/akiAware.ts`): a standalone
  helper for the `aki-aware` fit; no application code calls it.
- `cutoffDays`: used in a calculation only by the `chronic-ckd` branches; it is
  also part of the mixed-model result identity, where it is always empty.
- `eventDates` and `eventDatesByPatient`: read only by the `event-driven`
  branches.
- `gapDays`, `windowDays` and `stepDays` as per-series overrides on the series
  specification, and `minNPerWindow` and `minNPerSegment` as parameters of
  `summarizeByBezeichnung`: nothing sets them, and the defaults 180, 730, 180,
  3 and 3 always apply (the trend-line code fixes the segment minimum at 3).
- `primaryExclusionReason` (`src/core/domains/nephrology/fitConfig.ts`): a
  precedence among exclusion reasons that no application code calls; the
  interface lists every reason of an excluded point.
- The `FitPipelineResult` summary fields and `BaseFitPoint.aggregate` in
  `src/core/fitPipeline/types.ts` (time bins, median and maximum gap, clustered
  measurement flag): declared types without an implementation.
