# Method reference: Demographics resolution

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

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
as no sex for that row. The original text is kept. The lab import reports the
unreadable spellings in one warning, each with its number of rows and patients
(see [Row acceptance](import-and-values.md#row-acceptance)), whether or not an
eGFR formula is selected and whatever the patient's resolved sex: a file with
`x` on two rows of one patient gives 'Unreadable sex value: "x" (2 rows, 1
patient); read as no sex.', followed by the accepted spellings. In addition,
when an eGFR formula is selected, the Data page quotes the unreadable
spellings of creatinine source rows whose patient still has no resolved sex.
An unrecognised value in the `sex` column of the attributes table is treated
as absent and produces no warning.

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
  always one row's midpoint. `age_no_common_birth_date` is reported, and the
  ages of all dated rows are recomputed from the anchor. Each row has equal
  weight, so a parameter measured more often has more influence.

  The message names the lab dates whose stated age the anchor does not
  reproduce (decided 2026-11-21; every such contradiction stays one conflict,
  without a severity level). Rows are grouped by lab date and stated age, so
  several parameters measured on one day count once. The message gives the
  number of differing lab dates out of all lab dates with a stated age and
  names the first three in ascending order, each with the stated and the
  derived age; further ones are counted ("and 1 more"). A derived age reads
  "none" when the anchor lies after the lab date. The gap in days between the
  latest lower bound and the earliest upper bound is still computed
  (`gapDays`) but no longer quoted, because it is not the size of the error:
  the example below has a gap of 3 days and an age that is off by a year.

  Example: stated ages 54, 54, 54, 55, 55, 55, 56 on 2023-01-10, 2023-04-12,
  2023-07-11, 2023-10-10, 2024-01-09, 2024-04-09 and 2024-07-09. The median
  anchor is 1968-07-11. It gives the ages 54, 54, 55, 55, 55, 55, 55, and the
  message
  reads: "Patient A1: the age values fit no single birth date — ages derived
  from the median instead. The stated age differs from the derived age on 2 of
  7 lab dates: 2023-07-11 (stated 54, derived 55), 2024-07-09 (stated 56,
  derived 55)."

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
birth date — ages derived from the median instead. The stated age differs from
the derived age on 1 of 3 lab dates: 2021-08-20 (stated 55, derived 54)." The
203 days are not quoted.

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
| `cohort` or `slopes` | `sex`, `baseline_age` | the patient's resolved sex (`m`, `w`, `d`; blank when unresolved) and the `baseline_age` of the `demographics` sheet, repeated on each of the patient's rows (since 2026-11-21) |
| `demographics` | `baseline_age` | resolved age at the patient's earliest dated row; blank when unavailable |
| `demographics` | `birth_anchor` | the birth-date anchor as a calendar date; blank when the patient has none |
| `demographics` | `age_estimated` | true when a manual age is set, or when the anchor was inferred from stated ages without any explicit birth date; false otherwise |
| `demographics` | `manual_override` | the manual entry for the patient as JSON; `{}` when there is none |
| `demographics` | `warnings` | the texts of the patient's conflict messages |
| `measurements` | `patient_sex`, `patient_age_at_lab` | resolved values; column `demographics` reads "resolved analysis values" |
| `raw_measurements` | `patient_sex`, `patient_age_at_lab` | values as imported; column `demographics` reads "as imported" |
| `raw_measurements` | `patient_birth_date` | the birth date read from the lab row as a calendar date; blank when the row had none or it was unreadable (since 2026-11-21) |
| `measurements` | `patient_birth_date` | always blank; the resolved date is `birth_anchor` of `demographics` |

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

Regression evidence: [sex resolution tests](../../tests/core/demographics/resolveSex.test.ts),
[age resolution tests](../../tests/core/demographics/resolveAge.test.ts),
[birth-date interval tests](../../tests/core/demographics/birthDate.test.ts),
[row resolution tests](../../tests/core/demographics/resolve.test.ts),
[conflict wording tests](../../tests/core/demographics/describe.test.ts),
[demographics module tests](../../tests/core/analysis/demographicsModule.test.ts),
[registry tests](../../tests/core/analysis/registry.test.ts),
[loader tests](../../tests/core/parse/loader.test.ts),
[workbook export tests](../../tests/workspace/export.test.ts),
[cohort export record tests](../../tests/core/cohort/exportRecords.test.ts) and
[Data page tests](../../tests/workspace/data-ui.test.tsx). No dedicated regression
test: the full list of accepted sex spellings (only some are tested); an
unrecognised sex in the attributes table; a vote among three codes and the
voting of undated rows; truncation of a decimal stated age and the absence of a
plausibility range; the 1 March rule for a 29 February birth date in
`completedYears`; the `baseline_age` and `manual_override` export columns; the
fixed module order as such.

