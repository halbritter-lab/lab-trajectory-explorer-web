# Method reference: Series comparison and merge

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Series comparison and deliberate merge (2026-11-22)

Issue #68. Owner decisions: 2026-11-16 (series are never merged
automatically), 2026-11-21 (series of one analyte from different
laboratories or methods stay separate by default; a comparison view and a
deliberate merge by an explicit mapping are added; an optional laboratory or
method column is carried through) and 2026-11-22 (implemented as the next
package; values from different laboratories may not be comparable, so the
merge stays a deliberate, visible step). See
[method decisions](../remaining-method-decisions.md#decisions-of-2026-11-22-decision-artifact-issues-2-4-6585),
row `merge`.

Code: `src/core/analysis/seriesMerge.ts` (the merge),
`src/core/domains/nephrology/seriesMergeModule.ts` (the analysis module and
the unit conversion), `src/workspace/SeriesComparison.tsx` (the comparison
view) and `src/workspace/WorkspaceSeriesMerge.tsx` (the Data page section).

### Why series stay separate

A laboratory that changes its creatinine method often renames the test
(issue #34): `Kreatinin` and `Kreatinin enzym.`. Calibration to an IDMS
reference does not remove the non-specificity of Jaffe methods: in one study
with commutable specimens, Jaffe methods overestimated creatinine by 21 %,
12 % and 10 % at 52, 73 and 94 µmol/l
([PMC5220660](https://pmc.ncbi.nlm.nih.gov/articles/PMC5220660), cited in
issue #68). A slope fitted
across a change of method can therefore show the method rather than the
patient. Real-world data networks keep the source data and harmonise
selectively per test, with the mapping recorded (Sentinel laboratory data,
ISPE 2025:
[slides](https://sentinelinitiative.org/sites/default/files/documents/ISPE2025_SentinelLabData.pdf);
LOINC and unit harmonisation, JMIR Med Inform 2026:
[e81254](https://medinform.jmir.org/2026/1/e81254)). The tool follows that
pattern: nothing is merged by name or LOINC code on its own, and a merge
keeps the sources and records the mapping.

### Comparison view

The patient view of Trajectories has a card *Compare series* below the
charts of the shown parameters. It lists every series of the patient with at
least one dated numeric value (imported, merged and computed series alike) as
a checkbox. Rules:

- **Display unit.** The first ticked series sets the unit. A further series
  can be ticked when it converts to that unit by the rule of the merge (below):
  the same unit by unit key, or serum creatinine between mg/dl and µmol/l. A
  series that does not convert is shown greyed out with "not convertible to
  <unit>". With fewer than two ticked series no chart is drawn.
- **Points.** Every dated numeric value of each ticked series, converted
  (unrounded), on a calendar-date axis. Each series has its own colour and
  marker shape, in the order ticked: circle, square, triangle, diamond, then
  again. Bounds (`<x`, `>x`) are open markers at their limits. The tooltip
  names the series, the date, the value in the display unit, the value as
  measured when it was converted, the source series of a merged value and the
  laboratory or method.
- **Comparison lines.** One line per series: OLS (`fitGlobal`) over the exact
  values of the series in the display unit, on years since its first exact
  value, drawn from its first to its last exact date; none below two distinct
  dates. Two dates give the exact two-point line of `fitGlobal` without an
  interval, as for any column. The table below the chart gives
  per series the number of values, the period, the slope per year with its
  95 % interval and the laboratories or methods. The lines use no time
  balancing, censoring, exclusion window or bounded-value setting: they
  compare the series and can differ from the slope of a column, which follows
  its analysis settings. Open decision OD-84.
- The selection is a view state of the session: it is not saved, not
  exported and changes no number elsewhere.

### Deliberate merge

On the Data page, section *4. Merge series*, the user ticks two or more
imported series, chooses the unit of the merged series among their units and
a name (default: the first ticked name followed by ` (merged)`), and presses
*Merge selected series*. *Choose by LOINC code* lists the codes that occur in
at least two imported series; choosing one ticks exactly those series and
records the code with the merge (`loinc`), but merges nothing until the
button is pressed. The merge is applied to the analysis at once; *Remove*
takes it out again.

The setting is the list `seriesMerge.merges` of the analysis settings, each
entry `{ name, unit, sources: [{ bezeichnung, einheit }, …], loinc? }`. The
module `seriesMerge` runs after demographics resolution and before the eGFR
derivation, so the merged rows carry resolved sex and age, and a merged
creatinine series can be chosen as the eGFR source.

A draft cannot be merged (the form names the reason) and a stored merge is
not formed (the Data page shows a warning) when:

| Condition | Draft | Stored merge |
| --- | --- | --- |
| fewer than two series ticked | blocked | — (a stored entry needs two sources to be read at all) |
| empty name | blocked | not readable |
| name and unit equal an imported series | blocked | not formed (`name_taken`) |
| name and unit equal an earlier merge | blocked | not formed (`duplicate_name`) |
| a series already belongs to an earlier merge | blocked | not formed (`source_in_other_merge`) |
| a source unit neither equals the target unit nor converts | blocked | not formed (`unit_not_convertible`) |
| fewer than two of the sources occur in the dataset | — | not formed (`too_few_sources`) |

A stored merge whose sources are partly absent but at least two present is
formed from the present ones, with the warning "Merged series … : … not in
this dataset." Only imported rows are sources: a computed eGFR row or a row of
another merged series never is.

**Unit conversion** (`mergeUnitConversion`): factor 1 when the source unit
and the target unit have the same unit key (the import's comparison form:
`mg/dL` = `mg/dl`); for a serum creatinine series (`isSerumCreatinineSeries`:
creatinine name, no non-serum material, unit mg/dl or µmol/l) 1/88.42 from
µmol/l to mg/dl and 88.42 from mg/dl to µmol/l, the factor of eGFR and AKI
detection; no other pair. Open decision OD-83.

**Derived rows.** For every row of a source series, in file order, one row is
appended with:

- name and unit of the merge;
- `wertNum` = value × factor, unrounded; `wert` (the value text) unchanged for
  factor 1, otherwise the converted number with a decimal comma, two decimals
  below 10 and one from 10 (110 µmol/l → `1,24` mg/dl; 1.1 mg/dl →
  `97,3` µmol/l); a row without a number keeps its text and stays without one;
- operator, date, time of day, sex, age, birth date, LOINC code and laboratory
  or method copied; `mergedFrom` naming the source series; no source row
  number.

The source series stay unchanged: their columns, slopes, endpoints and AKI
episodes are what they were without the merge.

### Values of two sources on one day

Open decision OD-80. The decision does not say whether a day with values of
two sources keeps both or prefers one. The implemented rule is the
conservative one: every value is kept, so the merged series has several
values on such a day, and the existing rules for same-day values apply
unchanged: raw fits use each value as a point, monthly and quarterly time
balancing take the median of the period, endpoints and AKI detection treat
them like any same-day values (AKI detection compares untimed same-day
values with earlier values only). The Data page counts these patient-days per
merge ("… patient-days with values of two or more sources: all are kept").
No source is preferred.

### Interaction with eGFR, AKI and the analysis record

- **eGFR source.** The per-patient creatinine rule of issue #65
  ([source selection](egfr.md#source-selection)) is unchanged while the
  merged series is not chosen: `patientCreatinineSources` ignores merged rows
  unless their (name, unit) is the selected pair, and *Automatic* chooses
  among the imported series only (`importedCreatinineSourceOptions`). A merged
  serum-creatinine series is offered in *Creatinine source* with
  "– merged series". Chosen, it is the selected pair: a patient with a row in
  it uses it, other patients keep the rules of the table (a patient without
  any source row keeps its gap or fallback among the imported series).
  Removing the merge returns the source to *Automatic*.
- **AKI detection.** The own-source rule applies: a merged series whose name
  and unit are serum creatinine detects AKI on itself, in mg/dl, across its
  sources; a merged series of another analyte (for example eGFR) takes the
  episodes of the patient's largest imported creatinine series, as any other
  column; the largest-series choice, the peri-event analysis and the Data
  page's creatinine checks ignore merged rows. A computed eGFR from a merged
  source detects on the merged series it was computed from. Open decision
  OD-82: a rise between values of two methods can form an episode in the
  merged series that neither source shows.
- **Recognition.** A merged series is recognised by its own name and unit,
  as any series: named without "Kreatinin" or "Creatinin" it is not serum
  creatinine for AKI detection or eGFR; in mL/min/1.73 m² it is eGFR for the
  endpoints (OD-82).
- **Analysis record and export.** `analysisSettings.seriesMerge.merges` has
  its catalog entry (export field `analysis_settings`, `measurements.source_parameter`,
  `measurements.source_unit`, `parameters.formula`, `parameters.source_parameter`;
  control: Data → Merge series). In the measurement sheets the last three
  columns are `lab_method`, `source_parameter` and `source_unit`; for a
  merged value in `measurements` `origin` is `derived`, `formula` is
  `series_merge` and the source columns name the imported series; for a
  computed eGFR value they name its creatinine series; both are empty for
  imported values and in `raw_measurements`. In `parameters` a merged series
  has `formula` `series_merge` and lists its sources in `source_parameter`
  and `source_unit`, separated by "; ". `input_data_id` includes
  `lab_method` for rows that have one, so a dataset without the column keeps
  its identifier.
- **Saved and applied settings.** The list is saved with the dataset copy
  (analysis settings) and written to `analysis_settings` of the `settings`
  sheet. *Apply settings from an export* applies a merge only when every one
  of its source series is an imported series of the loaded dataset;
  otherwise it lists "merged series … (… not in this dataset; the merge is
  left out)" (OD-81). The settings of a merged parameter in the export apply
  when the merge does. A creatinine source that is a merged series of the
  export counts as present when that merge applies.

### Worked example (demo workbook)

The demo workbook holds eGFR under three names, `eGFR` (228 values),
`eGFR (CKD-EPI)` (6) and `eGFR (CKD-EPI 2021)` (6), all in `ml/min/1,73m²`,
and creatinine in two units, `Kreatinin [mg/dl]` (234) and
`Kreatinin [µmol/l]` (11). Merging the three eGFR names into
`eGFR (merged) [ml/min/1,73m²]` adds 240 rows (factor 1). Patient 3 has
`eGFR (CKD-EPI)` from 2022-01-01 to 2022-12-17 (72.0 to 65.29) and
`eGFR (CKD-EPI 2021)` from 2023-06-01 to 2024-05-16 (70.0 to 63.77). Each
series alone falls by −7.00 and −6.50 per year (OLS, all values exact); the
merged series of 12 values falls by −2.22 per year (95 % interval −3.70 to
−0.74), because the second series starts 4.7 higher than the first ended.
The comparison view shows this jump before a merge is made.

Merging `Kreatinin [mg/dl]` and `Kreatinin [µmol/l]` into
`Kreatinin (merged) [mg/dl]` adds 245 rows. Patient 2 has 14 mg/dl values
(1.1 on 2021-06-01 to 1.77 on 2024-02-01) and 4 µmol/l values in 2023
(110.0, 114.93, 119.86, 124.78), converted to 1.244, 1.300, 1.356 and 1.411
mg/dl (value text `1,24`, `1,30`, `1,36`, `1,41`). The mg/dl series rises by
0.250 mg/dl per year; the merged series of 18 values by 0.215 (95 % interval
0.150 to 0.281), because the µmol/l values lie about 0.25 mg/dl below the
mg/dl values of the same months. Patient 10 has µmol/l values only: the
merged series rises by 15.618 / 88.42 = 0.1766 mg/dl per year. The eGFR keeps
reading `Kreatinin [mg/dl]` (and patient 10's µmol/l fallback) until
`Kreatinin (merged) [mg/dl]` is chosen as the creatinine source.

### Regression evidence

- [Merge, conversion, skip reasons, eGFR and AKI interplay, laboratory column, demo example](../../tests/core/analysis/seriesMerge.test.ts)
- [Data page form, comparison view and apply from an export](../../tests/workspace/series-merge.test.tsx)
- [Export columns and notes](../../tests/workspace/export.test.ts),
  [schema](../../tests/workspace/export-schema.test.ts),
  [analysis record completeness and round trip](../../tests/workspace/analysis-record.test.ts)
