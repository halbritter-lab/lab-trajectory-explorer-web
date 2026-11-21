# Method reference: Import and value interpretation

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

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
  | labs | `labs`, `labor`, `labrows`, `labdata`, `rawmeasurements` | the first sheet not chosen as events or attributes, otherwise the first sheet |

  For each role the first matching sheet in workbook order is used. Every other
  sheet, including a second sheet matching the same role, is ignored without a
  diagnostic. A workbook with sheets `Sheet1` and `Sheet2` loads `Sheet1` as
  labs and ignores `Sheet2`. A workbook holding only `events` and `attributes`
  reads its first sheet as the lab sheet and fails on its missing lab columns.

  The app's own workbook export loads again (since 2026-11-21): its sheet
  `raw_measurements` (the imported values of the exported patients and
  parameters) is the lab sheet, `events` the events sheet and
  `patient_attributes` the attributes sheet. The export's first sheet,
  `measurements`, holds analysis values including derived eGFR rows and
  resolved demographics and is ignored like every other sheet. What comes
  back is the exported scope, not the original file: unselected parameters
  and patients are absent, and manual demographic entries and settings are
  not restored. Example: an export of patient 7 with creatinine and computed
  eGFR selected loads patient 7's creatinine rows as imported; eGFR is
  computed anew from them.

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
| lab date | `labDate`, `LabDatum`, `Date` | yes |
| test name | `testName`, `Bezeichnung`, `Parameter` | yes |
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
`Date` and `Parameter` are the headers of the workbook export; its `Unit` and
`Value` headers equal `unit` and `value` after normalisation. The export's
`NumericValue` and `Operator` columns are not accepted headers, so the value
text is interpreted again (`<15` is read as a bound of 15).

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

Regression evidence: [date tests](../../tests/core/parse/dates.test.ts),
[value tests](../../tests/core/parse/wert.test.ts),
[unit tests](../../tests/core/parse/units.test.ts),
[loader tests](../../tests/core/parse/loader.test.ts),
[header tests](../../tests/io/headers.test.ts),
[CSV and workbook import tests](../../tests/io/csvImport.test.ts),
[dataset loading tests](../../tests/io/loadDataset.test.ts),
[workbook reader tests](../../tests/io/readWorkbook.test.ts),
[attribute tests](../../tests/core/attributes/attributes.test.ts),
[template tests](../../tests/io/templates.test.ts) and
[dataset replacement tests](../../tests/workspace/data.test.tsx). The loader tests
cover the two-header warning, the rejected row without a patient ID, the
three-decimal warning and the empty or untrimmed pre-parsed operator cell; the
[row resolution tests](../../tests/core/demographics/resolve.test.ts) cover the
attribute birth dates that are no longer guessed. No dedicated regression
test: UTF-16 decoding and the NUL-byte rule; the alternative sheet names
other than `raw_measurements`, the
labs fallback and the ignored sheets of multi-sheet workbooks; the
all-capitals merge of `MU/L` with `mU/l`; the absence of size limits.
The [workbook export tests](../../tests/workspace/export.test.ts) cover the
re-import of an exported workbook.

