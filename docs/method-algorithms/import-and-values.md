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
its verbatim text. The first row of a sheet supplies the headers and blank
cells are read as empty.

**Field delimiter.** Two counts are compared (`detectDelimiter`). The
candidates are comma, tab, semicolon and pipe, counted outside double quotes.

- The reader's count: the candidate that occurs most often in the first 1024
  characters of the file; a tie goes to the comma, then tab, then semicolon,
  then pipe. Until 2026-11-21 this count alone decided.
- The header count: the candidate that occurs most often in the header line,
  that is the text before the first line break outside double quotes. The data
  rows are not counted, so decimal commas and free text cannot outvote the
  delimiter here.

When both name the same candidate, it is used. When they differ, the header
line is split at each of the two and the cells that are accepted column names
of the lab, event or attribute table (all aliases, compared as headers are:
case-insensitively and without separators) are counted. The header count's
candidate is used when it yields more accepted names than the reader's, or when
neither yields any; otherwise the reader's candidate is used. A file that the
reader's count reads with at least one accepted column, and so every file that
loaded before 2026-11-21, is therefore read as before unless the header line
yields strictly more accepted columns at the other candidate.

Three cases are left to the reader's count without this comparison: a file
that starts with a `sep=` line (the character after `sep=` is the delimiter and
the line is not a data row), a header line without any candidate (a single
column), and a header line in which two candidates share the highest count.

Examples:

- Header `patientId;labDate;testName;unit;value`, five rows such as
  `101;10.01.2021;Kreatinin, Serum, enzymatisch, IFCC, kinetisch;mg/dl;1,0`
  (four semicolons and five commas each). Reader's count: 24 semicolons and 25
  commas, so comma; header count: four semicolons, no comma, so semicolon.
  Split at the semicolon the header holds five accepted names, split at the
  comma none: the semicolon is used. Before 2026-11-21 this file failed with
  missing columns; with four rows (20 semicolons, 20 commas) it failed as well,
  because the tie went to the comma, and with three rows it loaded.
- Header `patientId;Diagnose, genetisch, bestätigt`, rows such as `Q1;ADPKD`.
  Reader's count with three rows: four semicolons, two commas, so semicolon;
  header count: one semicolon, two commas, so comma. Split at the semicolon
  the header holds one accepted name (`patientId`), split at the comma none
  (`patientId;Diagnose` is not one): the semicolon is used and the attribute
  column is named `Diagnose, genetisch, bestätigt`.
- Header `patientId;Diagnose, genetisch` (one semicolon, one comma): a tie in
  the header line, so the reader's count decides; with four rows such as
  `Q1;ADPKD` it finds five semicolons and one comma and uses the semicolon.

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
  not restored. A birth date on the imported lab rows comes back from the
  column `patient_birth_date` of `raw_measurements`, so the birth-date anchor
  and every age derived from it are the same after the re-import: a file with
  birth date 1960-05-01 and no stated age exports `patient_birth_date`
  1960-05-01 next to `patient_age_at_lab` 58 for a row of 2019-01-10, and the
  re-import resolves the anchor 1960-05-01 again (`age_estimated` false). A
  workbook exported before this column existed carries the whole-year ages
  only; its re-import infers the anchor from them (`age_estimated` true).

  An attributes sheet that holds the patient ID column and no other column is
  skipped when a workbook is read (since 2026-11-21): no attributes are
  read, and there is no error and no import finding. The export writes
  `patient_attributes` in this form when no exported patient has an attribute,
  which is the case for a file without a sex column and without an attributes
  table. Example: a CSV with the columns `patientId`, `labDate`, `testName`,
  `unit`, `value` and the patients P1 and P2 exports `patient_attributes` with
  the header `PatientID` and the rows P1 and P2; the re-import reads the lab
  rows of `raw_measurements` and no attributes. Before, this workbook was
  rejected with "Patient attributes file has no attribute columns." The rule
  holds for every workbook with an attributes sheet, not only for the app's
  export. An attributes sheet without a patient ID column is still an error,
  and so is a separately uploaded attributes file without an attribute column
  (see [Columns](#columns)).

  The time of day of a lab date comes back (since 2026-11-22): the export
  writes it to the last column `time_of_day` of `raw_measurements`
  (`HH:MM:SS`, empty text where the row has none), and the re-import of a
  sheet named `raw_measurements` reads that column, so several serum
  creatinine values of one day keep their order
  ([Measurements on the same date](aki.md#measurements-on-the-same-date))
  and the AKI episodes are those of the export at the same recovery length
  (the re-import reads no settings; *Recovery between episodes* starts at
  48 hours, see [AKI](aki.md#episodes)). Example: 1.0 mg/dl at 06:00
  and 1.6 mg/dl at 20:00 on 1 September and 1.2 mg/dl on 4 September give a
  stage I episode (onset 2026-09-01, peak 1.6) after the import of the file
  and after the re-import of its export. The column is read as `HH:MM` or
  `HH:MM:SS` text, as a fraction of a day (0.25 is 06:00) or as a workbook
  time cell; midnight and an unreadable cell count as no time, and a time in
  `Date` itself takes precedence. A `time_of_day` column of any other lab
  sheet is not read. Until 2026-11-22 no sheet carried the time, and the
  re-imported rows had none: the same example then gave no episode after the
  re-import.
  Example: an export of patient 7 with creatinine and computed
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
| birth date | `birthDate`, `PatientGeburtsdatum`, `Geburtsdatum`, `PatientBirthDate` (= `patient_birth_date`) | no |
| pre-parsed number | `valueNum`, `Wert_num` | no |
| pre-parsed operator | `valueOperator`, `Wert_operator` | no |

A lab sheet with data rows that lacks a required column is rejected as a whole;
the error names the missing columns and lists the columns found. `Geschlecht`
is not a lab-sheet header; it is accepted in the attributes table only.
`Date` and `Parameter` are the headers of the workbook export; its `Unit` and
`Value` headers equal `unit` and `value` after normalisation. The export's
`NumericValue` and `Operator` columns are not accepted headers, so the value
text is interpreted again (`<15` is read as a bound of 15).

The error adds one sentence on the likely cause in two cases; no column is
mapped and the file stays rejected:

- A found column name contains a semicolon or a tab: the header line was
  probably split at the wrong field delimiter.
- Otherwise, when test name, unit and value are all missing and at least two
  columns match no accepted lab header (columns the reader named `__EMPTY…`
  are not counted): "This file seems to have one column per lab test; one row
  per measurement is required", with a pointer to the lab template and an
  example header and row. A table with the columns `Patient`, `Geschlecht`,
  `Geburtsdatum`, `Datum`, `Kreatinin (mg/dl)` and `Harnstoff (mg/dl)` gets
  this sentence (six unrecognised columns); a long table whose value column is
  merely misnamed does not (only `value` is missing).

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
other column. A separately uploaded attributes file without another column is
rejected with "Patient attributes file has no attribute columns."; an
attributes sheet of a workbook without another column is skipped instead (see
the re-import of the app's export above). Two demographic concepts are recognised by
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

**"Not tested" values** (decision `genomiss` of 2026-11-22, issue #4;
Groenwold RHH et al., CMAJ 2012;184:1265, PMID 22371511). The vocabulary
`NOT_TESTED_VOCABULARY` (`src/core/attributes/notTested.ts`) holds four
texts: `not tested`, `nicht getestet`, `n.t.` and `nt`. An attribute value
matches when, trimmed, lower-cased and with inner whitespace collapsed to one
space, it equals one of them: `Not Tested`, ` NICHT  getestet `, `N.T.` and
`NT` match; `n. t.`, `not done`, `n.a.`, `NA`, `negative`, `no variant` and
`NTRK1` do not. The list is deliberately short; other spellings stay
ordinary values. The import keeps the value as it is in the file, and every
sheet, group and display shows it so. Only a cohort-model attribute factor
reads a matching value as the level `not tested` (see
[Factors and covariates](cohort-models.md#factors-and-covariates)): it is
never merged with "no variant" or any other level, and a blank cell stays
missing. Open decision OD-57: grouping (Trajectories and the *Model
grouping* of Cohort models) does not apply the vocabulary, so `NT` and
`not tested` form two groups there.

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
selectable parameter.

**LOINC.** The LOINC column is read, trimmed and stored with each row. It is
shown per parameter under "Imported parameters" and exported (column `loinc`
of the sheets `measurements`, `raw_measurements` and `parameters`). It does
not join series and, with the one exception below, does not separate them.

- **Several codes in one parameter.** When the rows of one parameter (test
  name and unit) carry more than one code, one sheet-level warning names the
  codes with their number of values: "eGFR [ml/min/1.73m2]: 2 LOINC codes in
  one parameter: 62238-1 (1 value), 98979-8 (2 values). The values stay one
  series; check that they are the same test and material." Rows without a
  code are not counted and stay in the series. A code that does not fit the
  unit (the mass code 2160-0 on µmol/l rows) is not reported.
- **Creatinine with a non-serum code (decided 2026-11-21).** A row whose test
  name contains `kreatinin` or `creatinin` and whose code is 2161-8
  (creatinine, mass concentration in urine) or 14683-7 (creatinine, substance
  concentration in urine) is stored under the test name followed by
  ` (urine, LOINC <code>)`: `Kreatinin` with code 2161-8 becomes the parameter
  `Kreatinin (urine, LOINC 2161-8)`. The code is compared exactly after
  trimming. The new name contains `urin`, so the parameter is a non-serum name
  under the rule in [eGFR derivation](egfr.md#eligible-source-series): it is
  not offered as an eGFR source, detects no AKI and supplies no AKI episodes
  to other columns. It is otherwise an ordinary parameter with its own
  trends. The stored name is the one shown and exported everywhere, including
  `raw_measurements`; the code stays in `loinc`. One sheet-level warning per
  imported name and code reports the number of rows moved and lists them.
  Not moved: rows whose name already marks a non-serum material
  (`Kreatinin Urin` with 2161-8 keeps its name), rows of other tests with
  these codes, rows without a code, and creatinine with any other code,
  including the whole-blood codes 38483-4 and 59826-8, which stay eligible
  like serum. The list holds these two codes only; other non-serum materials
  are still recognised by name alone. The rule is applied when a file is
  imported and when a dataset saved with "Remember on this device" is
  restored: a copy saved before 2026-11-21 holds such rows under the serum
  name, and the restore stores them under the separate name, as the import
  does. The restore notice names the number of values moved ("2 creatinine
  values with a urine LOINC code (2161-8, 14683-7) were moved to a parameter
  of their own, as an import does: not used for AKI detection or eGFR."); no
  import finding is added, because the copy has no source rows. Rows already
  saved under the separate name are unchanged. `loadLabRows` called directly
  applies the rule only when given it (`LabImportOptions.separateSeries`).

  Example (synthetic): one patient has, under `Kreatinin` in mg/dl, serum
  values with code 2160-0 (0.98, 1.10, 1.17, 1.21, 1.35) and urine values
  with code 2161-8 (3.92, 4.40, 4.68, 4.84, 5.40) on the same five days, and
  a sixth urine value 5.72 half a year later. Before the rule this was one
  series of eleven values with eleven computed eGFR values (CKD-EPI 2021),
  and, until values of one day without a time of day stopped being compared
  with each other (same day, [AKI](aki.md#measurements-on-the-same-date)),
  with five stage 3 AKI episodes, each with baseline and peak on the same day.
  With the rule `Kreatinin` has five values, `Kreatinin (urine, LOINC
  2161-8)` six, no AKI episode is detected, and five eGFR values are computed
  (95.7, 83.3, 76.9, 73.9, 64.8).

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
- **Similar patient IDs.** IDs are never merged. A sheet-level warning names
  the IDs of the lab sheet that become equal after lowercasing, removing all
  whitespace and removing leading zeros (a lone `0` stays): `0012` and `12`,
  `ab 1` and `AB1`. `12.0` and `12` are not reported, because the rule does
  not read numbers. There is one warning per group of such IDs; it lists the
  first row of every ID in the group. IDs of the events and attributes tables
  are not compared.
- **Invalid lab date.** A row whose lab date cell is present but not a valid
  date (see Dates) is rejected. The diagnostic quotes the cell and states the
  reason; the row is not imported.
- **Implausible lab date.** A row whose lab date lies after the import day or
  before 1927-05-18 is imported unchanged, with a warning (see Dates).
- **Empty lab date.** A row with an empty lab date is imported with no date and
  no import warning. It takes part in no dated calculation and is included in
  the Data page count "values without a date", which lists the rows on demand.
  It still contributes its sex to the sex vote and keeps its stated age (see
  Demographics resolution).
- **No numeric value.** A row whose value is empty, unparseable or a range is
  imported without a number and without an import warning. It is included in
  the Data page count "values without a numeric measurement", which lists the
  rows on demand, and enters no calculation. Its date, sex and stated age
  still feed demographics resolution.
- **Exact duplicates.** Two rows are duplicates when patient, lab date, test
  name, canonical unit and the raw value text are all equal. Duplicates are
  kept and each counts as a separate measurement. One sheet-level warning
  reports their number and the number of affected patients and lists the
  repeated rows (not the first occurrence). Because the raw text is compared,
  `1,5` and `1.5` on the same day are not duplicates.
- **Differing values on one day.** Per parameter (test name and unit), a
  patient-day is reported when its dated rows with a number carry at least two
  different values. Values are compared by number and operator: `1,5` and
  `1.50` are equal, `5` and `<5` differ. Rows without a date, without a number
  or without a test name are not compared. One sheet-level warning per
  parameter gives the number of such patient-days and patients and lists all
  rows of those days. Nothing is changed: every value stays a separate
  measurement in fits, endpoints and AKI detection (see
  [the detection rule](aki.md#kdigo-creatinine-aki-detection) for what
  same-day creatinine values do there). Example: a patient with `1,1` and
  `1,9` mg/dl creatinine on 2023-10-01 gives "Kreatinin [mg/dl]: 1 patient-day
  with differing values on the same day for 1 patient; all values are kept and
  each counts as a separate measurement."
- **Unreadable sex.** A sex cell in a spelling that is not accepted (see
  [Sex](demographics.md#sex)) leaves the row without a sex. One sheet-level
  warning quotes up to six such spellings, each with its number of rows and
  patients, counts further spellings and lists the rows.

Sheet-level warnings also report two columns for one field, day-first and
Excel-serial dates, merged unit spellings, values with three digits after a
comma or a point that may be thousands notation, and the number of `<` and `>`
values per parameter.

### Import findings

The import reports rejected rows and warnings as findings (`ImportDiagnostic`).
No finding changes an imported value.

- **Source row.** Every row read from a file keeps its row number as a
  spreadsheet shows it: the header row is 1 and the first data row is 2; blank
  rows count, and so does a leading `sep=` line. A finding about one row
  (rejected lab, event or attribute row, warning on an accepted event row,
  unreadable birth date, attribute row of an unknown patient) names that row.
  The row of an accepted event is used for its import warning only; it is not
  kept with the event.
- **Affected rows.** A collective warning lists the rows it counts with source
  row, patient, lab date, parameter and the cell as written: thousands
  notation, duplicates, differing values on one day, bounded values,
  unreadable sex, similar patient IDs and implausible lab dates. At most 1000
  rows are listed per warning; the warning keeps the total.
- **Per source table.** Findings belong to the table they came from: lab
  values, events or attributes. A workbook import sets all three. A later
  events or attributes upload replaces the findings of that table only; the
  lab findings stay. An upload that cannot be read or fails a column check
  leaves the findings as they were. An upload whose rows are all rejected
  ("No usable events …", "No usable attributes …") leaves the loaded table as
  it was but lists its rejected rows (since 2026-11-22): the findings of that
  file are added under "<file name> (rejected upload)" to those of the
  table, which keep their own, also when the rejected file has the name of
  the loaded one; a further rejected upload under the same file name replaces
  only the rejected rows of the earlier one. Example: `events.csv` is loaded
  with one warning, then `bad-events.csv` with two rejected rows; the events
  of `events.csv` stay, and the events list of the diagnostics reads
  "(events.csv, bad-events.csv (rejected upload), 2 rows rejected)" with
  three lines. A corrected but still unusable file uploaded again as
  `events.csv` is listed as "events.csv (rejected upload)" and leaves the
  warning of the loaded `events.csv` in place.
  Before, the rejected rows were named only in the error message.
- **Saved copy.** With "Remember on this device" the findings are saved with
  the dataset and restored with it. A copy saved before 2026-11-21 restores
  without findings and without source rows; the restore notice then adds:
  "This copy was saved by an earlier version: it has no import findings, no
  source rows and no times of day, so several creatinine values of one day
  are compared with earlier days only. Import the file again to get them."
  The sentence is shown until the copy is saved again by the current version.
  That happens with the next change of the lab rows, events, attributes,
  manual demographic entries, import findings, the file name or the analysis
  settings of the dataset (eGFR formula and source, AKI display and exclusion
  days, rapid-decline threshold). The rewritten copy holds an empty list of
  findings, so the sentence is no longer added although the source rows and
  times of day are still missing. A change of presets, trend or display
  settings alone writes only the settings record and leaves the sentence in
  place.
- **Data checks.** Four counts of the Data page are computed from the imported
  lab rows, not stored: values without a date, values without a numeric
  measurement, and exact dated serum creatinine values of zero or less or
  above 25 mg/dl. Each lists its rows on demand.
- **Export.** "Download import diagnostics (XLSX)" on the Data page and the
  sheet `import_diagnostics` of the cohort and patient workbooks hold the same
  table: the findings of all three tables, then the data checks. Columns:
  `source` (`labs`, `events`, `attributes`), `sheet` (sheet or file name),
  `kind` (`rejected`, `warning`, `data check`), `row`, `patient_id`, `date`,
  `parameter`, `value`, `message`. A finding about one row or without rows is
  one line; a collective warning is one line per listed row, each repeating
  the message, plus one line without a row when more rows were affected than
  listed. The download holds every line. The workbook sheet leaves out the
  lines about a loaded patient who is not part of the export, like that
  patient's measurements; lines without a patient stay, and a cohort workbook
  also keeps lines about IDs that never became a patient (all rows rejected,
  attribute or event rows of an unknown patient), while a patient workbook
  holds only that patient's lines and those without a patient. Parameters are
  not filtered. The sheet is the last sheet of the workbook and is empty when
  there is nothing to report; the download button is shown only when the
  import produced a finding.

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

Text dates and workbook date cells are not rejected for their year: any year
from 0100 to 9999 is accepted (`0203-01-05`, `3000-01-01`). Years 0000 to 0099
are rejected as impossible. Only serial numbers are rejected by range (below).

**Plausibility warning for lab dates (decided 2026-11-21).** A lab date after
the import day or before 1927-05-18 gives a warning; the row is imported and
used unchanged. The lower bound is the first day of the serial range for lab
dates (below). The import day is the calendar day of the device at the time of
the import; dates are compared as calendar days. A lab date equal to the
import day, or equal to 1927-05-18, gives no warning; the day after the import
day and 1927-05-17 do. There is one warning per affected patient. It gives the
number of rows, names up to three different dates in ascending order, each
with its reason, counts further dates and lists the rows. With import day
2026-11-21, a patient with rows on 1923-07-18, 0203-06-05 and 2026-12-15 gets
"3 lab rows with an implausible lab date: 0203-06-05 (before 1927-05-18),
1923-07-18 (before 1927-05-18), 2026-12-15 (after the import day 2026-11-21);
the rows are used unchanged." A date such as 2003-08-08 in a series of 2023 is
inside the range and is not reported. The warning is issued at import only: a
restored dataset is not checked again.

**Event dates and birth dates (decided 2026-11-22).** The same bounds apply to
the `date` and the `endDate` of every accepted event, in an events sheet of a
workbook and in a separately uploaded events file. There is one warning per
event row, naming the row and each implausible date with its reason; the
event is used unchanged. With import day 2026-11-21, a dialysis from
2026-11-01 to 2026-12-15 gets "Implausible end date 2026-12-15 (after the
import day 2026-11-21); the event is used unchanged.", and an event on
3024-05-08 "Implausible event date 3024-05-08 (after the import day
2026-11-21); …". Rejected event rows are not checked again. A **birth date
after the import day** gives a warning, from the lab column (once per patient
and value, at the first row with it) and from the `birthDate` attribute (per
attribute row): "Birth date 2030-02-01 is after the import day 2026-11-21; it
is used unchanged." A birth date equal to the import day gives none, and no
lower bound applies to birth dates. Before 2026-11-22, event dates, event end
dates and birth dates were not checked.

**Time of day and time zone.** A date may be followed by a time: `T` or spaces,
`h:mm` or `hh:mm`, optional seconds and fraction, and an optional `Z`,
`±hh:mm` or `±hhmm` offset. A time in another form (`+02`, `2:30 PM`) makes the
whole date unrecognised.
The time and the offset never change the date. The calendar day is taken as
written and is not converted between time zones: `2024-01-15T23:30:00+02:00`
is 15 January 2024, and `2024-01-14T23:00:00.000Z` is 14 January 2024. A
workbook date cell is read by its calendar day as shown in the workbook; a
cell holding 15 January 2024 14:30 is 15 January 2024. The day and the clock
time of a date cell do not depend on the time zone of the browser: a cell
holding 29 March 2026 02:30 is 29 March 2026 02:30 also where that hour is
skipped by daylight saving time (Europe/Berlin), as the text `2026-03-29
02:30` and the serial 46110.104167 are.

Since 2026-11-21 (issue #34) the time of day of a **lab date** is kept beside
the date (`LabRow.labTime`, milliseconds after midnight); before, it was
dropped. Text, workbook date cells and serial numbers follow the same rules:

| Source | Time of day |
| --- | --- |
| text with a time | the clock time as written; the offset is ignored, as for the day: `2024-01-15T23:30:00+02:00` is 23:30 |
| workbook date cell | the clock time as shown in the workbook: 15 January 2024 14:30 is 14:30 |
| serial number (numeric cell or five-digit text) | the fraction of the serial: 45000.75 and `45000,75` are 15 March 2023 18:00 |
| no time, or exactly 00:00:00 (also a date-only cell and a whole serial) | none |
| a time that does not exist (`25:00`, `12:60`) | none; the date is accepted, as before |

The time is rounded to whole seconds (`08:30:00,6` is 08:30:01); from
23:59:59.5 on it stays 23:59:59. Midnight counts as no time of day because a
date-only workbook cell cannot be told apart from a cell at midnight and
exports write 00:00 where no time was recorded.

The time of day has one use: it orders the serum creatinine values of one
date in AKI detection (see
[Measurements on the same date](aki.md#measurements-on-the-same-date), which
also states the rule for dates without a time and the note on the Data page).
Since 2026-11-22 it is also shown beside the date in the measurement table of
the patient view (`01/09/2026 06:00`, with seconds only when they are not
zero), where the rows of a date are ordered by it when every row of that date
has one and keep the row order of the file otherwise; the fit status of each
row moves with it. The table looks at every row of the date, bounds,
non-positive values and values under dialysis included, while AKI detection
looks at the positive exact values only: on 1 September 1.6 at 20:00, 1.0 at
06:00 (in this file order) and `<0.5` without a time stay in file order in
the table, while AKI detection compares 1.0 before 1.6. It is written to the column `time_of_day` of both
measurement sheets and read again from `raw_measurements` (see the app's own
workbook export under [Files and sheets](#files-and-sheets)). It is not shown
in the tooltips or the chart line, which keeps the values of one date in file
order, and it is not part of the duplicate comparison above: two rows of one date with the
same value at different times still count as duplicates. The times of event
dates and birth dates are read and ignored. The time is stored with a dataset
kept in the browser; a dataset stored before 2026-11-21 has none until the
file is imported again.

Two consequences follow. All measurements of one patient on one day share one
timestamp. The time between any two measurements is a whole multiple of 24
hours, so every rule elsewhere in this document that speaks of elapsed hours or
days operates on whole calendar days; a criterion stated as 48 hours can only
distinguish measurements zero, one, two or more calendar days apart.

**Numbers (Excel serial dates).** A numeric cell in a date column is an Excel
serial date in the 1900 date system; the 1904 system is not supported for
numeric cells. The fraction of a serial does not change the date; on a lab
date it is the time of day (see above).

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
Saved copies expire after seven days and are removed when the app is next
opened after that.

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

Regression evidence: [date tests](../../tests/core/parse/dates.test.ts)
(including the time of day from text, date cells and serials),
[same-day order tests](../../tests/core/aki/sameDayOrder.test.ts) (the time of
day through the reader and the loader),
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
re-import of an exported workbook, including a birth date on the lab rows.

