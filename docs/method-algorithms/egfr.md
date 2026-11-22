# Method reference: eGFR

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## eGFR derivation

A computed eGFR series is derived, for each patient, from one
serum-creatinine series of that patient and the patient's resolved sex and
age. It is an automated research derivation, not a
validated clinical result. The implementation is `appendComputedEgfr` in
`src/core/domains/nephrology/egfr/series.ts`, the equations are in
`egfr/formulas.ts`, and the name and unit rules are in
`src/core/domains/nephrology/analytes.ts`.

### Activation, default and output series

The eGFR module setting holds one formula (`off`, `ckd-epi-2021`,
`ckd-epi-2009`, `mdrd-4` or `ekfc-2021`) and one optional source pair. The default is `formula: 'off'`,
`source: null`: no eGFR series exists until a formula is applied under Data.
With `off` the module contributes nothing. Only one formula is active at a
time. A saved setting whose formula is not one of these values is rejected
when settings are loaded.

Decided 2026-10-07 (formerly OD-5): the default stays `off`. The methodology page no longer labels CKD-EPI 2021 the default.

Computed rows are appended to the imported rows; source rows are never
changed. The series name is `eGFR (<formula label>, computed)` with the labels
`CKD-EPI 2021`, `CKD-EPI 2009 (race-free)`, `MDRD-4` and `EKFC 2021`, so a
CKD-EPI 2009 series (`eGFR (CKD-EPI 2009 (race-free), computed)`) is a separate parameter from a
CKD-EPI 2021 series in tables, fits and exports. The unit is written
`ml/min/1,73m²`. The workspace blocks the calculation when an imported series
already has that name and unit, so imported and computed values are never
combined.

### Eligible source series

A (name, unit) pair is an eligible serum-creatinine source when all three
conditions hold (`isSerumCreatinineSeries`):

- **Name contains** `kreatinin` or `creatinin`. The test ignores case,
  surrounding whitespace and non-breaking spaces. It is a substring test.
- **Name is not a non-serum name** (`isNonSerumName`, decided 2026-11-05,
  issue #34; before, only the urine rule below existed and was called
  `isUrineName`). A name marks a material other than serum or plasma when any
  of these holds, after non-breaking spaces and surrounding whitespace are
  ignored:
  - it contains, in any case, `urin`, `harn` (covering "Urin", "Urine",
    "Harn", "Sammelurin"), `dialysat` ("Dialysat", "dialysate"), `punktat`,
    `fluid`, `aszites`, `ascites`, `pleura`, `liquor`, `drainage`, `sekret`
    ("Sekret", "Wundsekret") or `lymphe`;
  - after `i.` followed by whitespace and `U` is read as `i.U`, a `u` that
    abbreviates "und" is removed (next paragraph), and the name is split at
    whitespace, commas, semicolons, colons, slashes, underscores, hyphens,
    parentheses and square brackets, one token is, in any case and ignoring
    trailing dots, `i.U` (im Urin), a lone `U` (`U-Kreatinin`,
    `Kreatinin (U)`, `Kreatinin [U]`, `Kreatinin:U`, `Kreatinin U.`,
    `Kreatinin/U`, `Kreatinin_U`), `SU` (Sammelurin; also the `SU` of
    `24h-SU`), `SU24h`, `SPU` (Spontanurin), `PU` (Punktat or Portionsurin;
    both are non-serum), `CSF`, `Drain`, `PD` (peritoneal dialysate) or
    `Serom`;
  - it ends with upper-case `UR`. This suffix test is case-sensitive:
    `Kreatinin UR` is excluded, `Kreatinin ur` is not.

  Excluded therefore: `Kreatinin i.U.`, `Kreatinin i. U.`, `U-Kreatinin`,
  `Kreatinin U.`, `Kreatinin/U`, `Kreatinin_U`, `Kreatinin SU`,
  `Kreatinin 24h-SU`, `Kreatinin SU24h`, `Kreatinin SpU`, `Kreatinin PU`,
  `Kreatinin CSF`, `Kreatinin Drain`, `Kreatinin PD`, `Kreatinin Serom`,
  `Kreatinin Lymphe`, `Kreatinin (Wund)sekret`, `Kreatinin Dialysat`,
  `Kreatinin Punktat`, `Kreatinin [U]`, `Kreatinin:U`. Still eligible:
  `Kreatinin`, `Kreatinin i.S.`,
  `Kreatinin i.P.`, `Kreatinin (enzym.)`, `Kreatinin (S)`, `Kreatinin Serum`,
  `Kreatinin Plasma`, `S-Kreatinin`, `Kreatinin HP`, `Kreatinin BGA`,
  `Kreatinin Vollblut`, `Creatinine serum`, `Kreatinin mg/dl`. Tokens are
  compared whole, so `Kreatinin Pumpe` or `Kreatinin enzym.` mark nothing.
  Since the review follow-up of 2026-11-05 the slash separates tokens:
  `Kreatinin U/l` is excluded (token `U`). Creatinine is not reported in the
  enzyme unit U/l, so no serum spelling is lost. Prefixes such as `S-` or `P-`
  mark nothing.

  **A `u` that abbreviates "und"** (decided 2026-11-15, formerly OD-32;
  `UND_ABBREVIATION`). A lone `u`, in any case and with or without one dot,
  is not urine in exactly two positions, and is then removed before the name
  is split:
  - between two blood-material words. The words are `Serum`, `Plasma`,
    `Vollblut`, `HP`, `S` and `P`, in any case and as whole words (no letter
    or digit directly before or after), so `i.S.` and `i.P.` count through
    their `S` and `P`. Only whitespace separates the `u` from both words;
    the word before may be followed by one dot and one closing bracket, the
    word after may be preceded by one opening bracket;
  - between `vor` and `nach`, separated by whitespace only.

  `Kreatinin im Serum u. Plasma`, `Kreatinin (Serum u. Plasma)`,
  `Kreatinin i.S. u. P.`, `Kreatinin Serum u Plasma`,
  `Kreatinin HP u. Vollblut`, `Kreatinin (S) u. (P)` and
  `Kreatinin vor u. nach Dialyse` are therefore eligible, as they were up to
  version 0.3.7; between 2026-11-05 and 2026-11-15 the development version
  excluded them. A lone `U` stays urine everywhere else, so an unknown
  spelling is excluded visibly instead of being read as serum:
  - at the end or the start of the name: `Kreatinin U.`, `Kreatinin u`,
    `Kreatinin (U)`, `U Kreatinin`, `U-Kreatinin`;
  - next to any word that is not a blood-material word:
    `24h U Kreatinin`, `Spontan U Kreatinin`, `Kreatinin im U quant.`,
    `Kreatinin U enzymatisch`, `Kreatinin U. enzym.`, `Kreatinin U mg/dl`,
    `Kreatinin U spontan`, `Kreatinin U, enzymatisch`,
    `Kreatinin U. (enzym.)`, `Kreatinin Serum u. Urin`,
    `Kreatinin vor u. Dialyse`;
  - when only one side is a blood-material word, which includes a `U` beside
    the abbreviation itself: `Kreatinin U u. S` and `Kreatinin S u. U` name
    urine and serum and are excluded;
  - before a number, or next to any separator other than whitespace:
    `Kreatinin U 24h`, `Kreatinin/U`, `Kreatinin U/l`, `Kreatinin_U`,
    `Kreatinin:U`, `Kreatinin [U]`.

  A first version of this rule (same day, never merged) read a `u` between
  any two words as "und"; it turned `Kreatinin U enzymatisch` and
  `24h U Kreatinin` into serum creatinine and was replaced by the owner's
  decision above.
- **Unit is mg/dl or µmol/l** after unit-key normalisation (below).

The LOINC code is not part of this test. Creatinine rows with the urine codes
2161-8 or 14683-7 are stored at import under a name that ends in
` (urine, LOINC <code>)` and therefore fail the non-serum condition above
(decided 2026-11-21; see
[Series identity](import-and-values.md#columns)). Rows with any other code,
including whole-blood creatinine (38483-4, 59826-8), are judged by name and
unit alone.

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

The setting holds one (name, unit) pair, the *selected source*. Since
2026-11-21 (owner decision, issue #65; see
[method decisions](../remaining-method-decisions.md#creatinine-source-per-patient-decided-2026-11-21-issue-65))
the series is chosen per patient (`patientCreatinineSources` in
`egfr/series.ts`). Rows belong to a series when their name and unit strings
equal the pair exactly, as stored after import (the import already rewrites
unit spellings with the same unit key within one test name to a single
spelling). A patient "has" a pair when at least one imported row of the
patient carries it, whatever its date, value or demographics. Only eligible
serum-creatinine pairs count. The first rule that matches decides:

| Patient | Series used |
| --- | --- |
| has the selected pair | the selected pair |
| selected pair in µmol/l, patient without it | none |
| selected pair in mg/dl, patient without it but with serum creatinine in mg/dl under another name | none |
| selected pair in mg/dl, no serum creatinine in mg/dl, a µmol/l series under the selected pair's name | that µmol/l series (the *fallback*) |
| selected pair in mg/dl, no serum creatinine in mg/dl, exactly one µmol/l series | that series (the fallback) |
| selected pair in mg/dl, no serum creatinine in mg/dl, several µmol/l series, none under the selected name | none |
| no eligible serum creatinine | none |

Every patient's eGFR reads exactly one series; series are never merged
(decision of 2026-11-16), so a patient with both units keeps the selected
mg/dl series and the µmol/l values stay unused. Each computed row records the
series it came from (`LabRow.sourceSeries`); the AKI windows of the computed
eGFR column and the export column `egfr_source_parameter` read it. Since the
import stores at most one unit spelling per test name, a patient has at most
one µmol/l pair under the selected name. An explicitly selected pair that is
not an eligible serum-creatinine source produces no eGFR rows for anyone.

OD-36, confirmed by the owner on 2026-11-22: the decision names the mg/dl series of a patient first
and the µmol/l series otherwise; it does not say what happens when the
patient's mg/dl series is not the selected one, when the patient has several
µmol/l series, or when the selected pair is itself in µmol/l. The
implementation takes the option that changes least: the selected pair stays
the only mg/dl series used (a patient with `Kreatinin HP [mg/dl]` only gets
no eGFR under `Kreatinin [mg/dl]`, as before, and its µmol/l values are not
used either, because the patient has mg/dl values); several µmol/l series
without one under the selected name give no eGFR; a selected µmol/l pair has
no fallback. The note of such a patient names the case (below).

Example (demo workbook, CKD-EPI 2021, *Automatic* = `Kreatinin [mg/dl]`):
patient 10 has `Kreatinin [µmol/l]` only, seven values from 82 to 121
µmol/l. Before 2026-11-21 it had no eGFR; it now uses the fallback. 82 µmol/l
÷ 88.42 = 0.927392 mg/dl, male, 60 years: 142 × (0.927392/0.9)^−1.2 ×
0.9938^60 = 94.3; 121 µmol/l at 63 years gives 58.0. Patient 2 has both
units and keeps its mg/dl series. 27 of the 28 patients have a computed
eGFR (26 before); patient 5 has neither sex nor age.

A saved workspace stores the imported rows and the setting, and its computed
rows are derived again on load. The stored pair keeps its meaning as the
selected source: a patient with values in it keeps the same eGFR values, and
a patient without serum creatinine in mg/dl gains the fallback values when a
copy saved before 2026-11-21 is loaded. No setting is rewritten and no notice
is shown.

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
`Creatinine B`, the alphabetically first. These rules choose the selected
source for the dataset; the per-patient fallback above applies after them.

**On the Data page** under *Derive eGFR*, the counts of source values and of
reasons cover the rows of each patient's own series. "Patients without serum
creatinine in mg/dl use their µmol/l series: Kreatinin (µmol/l) for 1
patient." names the fallback; "Not used for this eGFR" lists, per eligible
pair, the values no patient's eGFR reads (demo: `Kreatinin (µmol/l), 4
values` of patient 2); two further notices count the patients left without a
series because they have mg/dl creatinine under another name only, or several
µmol/l series.

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

**Where the reason is named.** `egfrGapReason`
(`src/workspace/egfr-gaps.ts`) reports the first condition of the table a
source row fails, in the table's order, on the rows after demographic
resolution. The Data page counts the rows per reason under *Derive eGFR*,
every row once under its first reason: a row without sex and without age
counts under "Sex missing or unresolved" only.
Since 2026-11-21 a patient without a single computed value also carries the
reasons in the empty cell of the computed parameter under Trajectories and
in the patient view. There `egfrGapReasons` reports every condition a row
fails, not only the first (date; value missing or else not positive; sex;
age missing or else under 18), so the note names all that has to be
supplied: every reason found among the patient's source rows, in the
table's order, each with the number of creatinine values that fail it (a
row failing two conditions counts under both), and a pointer to "Review and
edit patients" naming the sex, the age or both. The cell itself shows the
first reason ("No eGFR: sex missing"), or "No eGFR: sex and age missing"
when both are missing. For a patient without a series of
their own (see [Source selection](#source-selection)) the note names the
case instead (since 2026-11-21, issue #65): without any serum creatinine,
"No eGFR: no serum creatinine" ("No eGFR for this patient: no serum
creatinine value in mg/dl or µmol/l."); with mg/dl creatinine under another
name only, "No eGFR: creatinine under another name"; with several µmol/l
series, "No eGFR: several µmol/l series"; under a selected µmol/l source,
"No eGFR: no creatinine in the source", naming the unused series. The
reasons of a patient who uses the fallback are counted on the µmol/l rows,
and the note adds "Creatinine source of this patient: Kreatinin [µmol/l],
because the patient has no serum creatinine in mg/dl." Examples: four creatinine values with an age and no
resolved sex give "No eGFR for this patient: sex missing (4 creatinine
values). Enter the sex under Data → “Review and edit patients”." Patient 5
of the demo data has four creatinine values and neither sex nor age: "No
eGFR for this patient: sex missing (4 creatinine values); age missing (4
creatinine values). Enter the sex and the age under Data → “Review and edit
patients”.", while the Data page counts "4: Sex missing or unresolved".
A value of 0 at age 12 and a second value at age 13 give "creatinine not
positive (1 creatinine value); age under 18 (2 creatinine values)". A patient
with at least one computed value gets no note, also when other rows of the
patient fail a condition. Display only.

All four formulas are adult-only here. This includes EKFC, whose published
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
(factor 0.9938), CKD-EPI 2009 by 0.70 % (factor 0.993) and EKFC above 40 years by 1.0 % (factor 0.990), so a series
shows a small step at each birthday. The rules that resolve sex and the
birth-date anchor are not repeated here.

**Sex.** The resolved patient sex is used. `m` and `w` select the male and
female coefficients. `d` uses the male coefficients in all four formulas,
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

**CKD-EPI 2009 creatinine** (Levey et al., Annals of Internal Medicine
2009;150:604-612), added 2026-11-05 for comparability with analyses that use
it (see [method decisions](../remaining-method-decisions.md#ckd-epi-2009-equation-2026-11-05)).
The published race coefficient (× 1.159) is not applied, because the data
model carries no race; this is a deviation from the published equation, and
the result equals the published value for a non-Black patient. The label
`CKD-EPI 2009 (race-free)` says so (owner decision 2026-11-13). The conditions,
age, sex handling and rounding are the same as for CKD-EPI 2021:

```
eGFR = 141 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^(−1.209) × 0.993^age × F
```

| Sex | κ | α | F |
| --- | ---: | ---: | ---: |
| `w` | 0.7 | −0.329 | 1.018 |
| `m`, `d` | 0.9 | −0.411 | 1.000 |

At `Scr = κ` both branches give 1, so the two branches meet there; the α branch
applies only below κ.

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

**Plausibility warnings** (added 2026-11-05, issue #34; thresholds confirmed
by the owner on 2026-11-13: they target swapped units, not urine). Warnings only: no value is changed, removed or
excluded. The Data page shows, with the number of affected values:

- under *Demographics and data quality*, exact dated serum creatinine values
  strictly above **25 mg/dl** (`IMPLAUSIBLE_CREATININE_ABOVE_MGDL`;
  `implausiblyHighCreatinineCount`), µmol/l values divided by 88.42 first, so
  the µmol/l limit is 2210.5 µmol/l (2210 is not counted, 2211 is). Only
  eligible serum-creatinine pairs are counted; bounds such as `>30` are not.
  The typical cause is a µmol/l column labelled mg/dl: 120 "mg/dl" gives
  CKD-EPI 2021 0.3 (0.275614) for a male aged 60 and silent G5 endpoints.
- under *Derive eGFR*, for the previewed calculation, exact computed eGFR
  values strictly above **200 mL/min/1.73 m²** (`IMPLAUSIBLE_EGFR_ABOVE`;
  `implausiblyHighEgfrCount`). Bounds are not counted: `<0,3` mg/dl gives a
  `>` bound, not an implausible measurement. Imported eGFR series are not
  checked. Example: CKD-EPI 2021 for a male aged 20 gives 243.5 at 0.1 mg/dl
  (counted) and 149.7 at 0.5 mg/dl (not counted).

### Duplicates and bounded rows

Each eligible source row produces its own eGFR row. Rows of the same patient
on the same date are neither removed nor averaged; two identical creatinine
rows yield two identical eGFR rows.

A bounded creatinine row (`<x` or `>x`) is evaluated at its numeric limit and
the inequality is reversed, because eGFR falls as creatinine rises. With
CKD-EPI 2021 for a male aged 60, `<0,5` mg/dl becomes `>116.8` and `>5` mg/dl
becomes `<12.5`. These
rows stay visible and are excluded from all calculations by their operator,
as described under [bounded measurements](bounded-measurements.md#bounded-measurements-2026-10-06).

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
| CKD-EPI 2009 | `m` | 141 × 1 × (1.2/0.9)^−1.209 × 0.993^60 = 141 × 0.706235 × 0.656077 | 65.331569 | 65.3 |
| CKD-EPI 2009 | `w` | 141 × 1 × (1.2/0.7)^−1.209 × 0.656077 × 1.018 = 141 × 0.521187 × 0.656077 × 1.018 | 49.081204 | 49.1 |
| CKD-EPI 2009 | `w`, 0.6 mg/dl, 40 years | 141 × (0.6/0.7)^−0.329 × 1 × 0.993^40 × 1.018 = 141 × 1.052024 × 0.755040 × 1.018 | 114.015087 | 114.0 |
| CKD-EPI 2009 | `m`, 0.6 mg/dl, 40 years | 141 × (0.6/0.9)^−0.411 × 1 × 0.993^40 | 125.765801 | 125.8 |
| MDRD-4 | `m` | 175 × 1.2^−1.154 × 60^−0.203 = 175 × 0.810261 × 0.435547 | 61.758706 | 61.8 |
| MDRD-4 | `w` | the male result × 0.742 | 45.824960 | 45.8 |
| EKFC 2021 | `m` | 107.3 × (1.2/0.90)^−1.132 × 0.990^20 = 107.3 × 0.722053 × 0.817907 | 63.368432 | 63.4 |
| EKFC 2021 | `m`, 20 years, 0.9 mg/dl | Q = 76.1966/88.4 = 0.861953; 107.3 × (0.9/0.861953)^−1.132 | 102.179692 | 102.2 |

Regression evidence: [formula tests](../../tests/core/egfr/formulas.test.ts)
(invalid inputs, `d` as male, CKD-EPI 2009 values of the worked examples,
EKFC reference values including the
age-specific Q, sex spellings),
[eGFR source tests](../../tests/core/egfr/series.test.ts) (urine exclusion,
formula-specific series names including CKD-EPI 2009,
default-source rules 1, 2 and 4, µmol/l conversion and spellings, reversed
bound, under-18 rows, rejected non-serum source, every row of the per-patient
source table, the recorded source and the AKI windows of a fallback),
[creatinine source tests](../../tests/core/aki/creatinineSource.test.ts)
(non-serum and serum names, plausibility counts at both thresholds),
[Data page tests](../../tests/workspace/data-ui.test.tsx) (both plausibility
notices, a saved non-serum source, the fallback and the two notices without
a series),
[eGFR gap tests](../../tests/workspace/egfr-gaps.test.tsx) (order of the
reasons, the age boundary at 18, sex and age missing on the same rows, the
note per patient in cell and patient view, the notes without a series
and on a fallback),
[eGFR module tests](../../tests/core/analysis/egfrModule.test.ts) (formula
`off` contributes nothing, saved formula names validated), [unit-key tests](../../tests/core/parse/units.test.ts)
and [eGFR fixture tests](../../tests/parity/egfr.parity.test.ts). The golden
fixtures carry no CKD-EPI 2009 values; its values are pinned by the formula
tests only. No dedicated
regression test: one-decimal rounding at a threshold, the absence of caps,
same-date duplicate source rows and default-source rule 3. The inherited
operator of a non-exact source row is covered by the
[decision tests](../../tests/core/endpoints/decisions20261007.test.ts). The 88.4 constant has no test of its own but is pinned indirectly:
the fixture row for `w`, 0.6 mg/dl, 25 years and the formula test for `w`,
0.7 mg/dl, 18 years both fail with 88.42.

