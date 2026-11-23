# Release notes draft: method changes since v0.3.7

**Draft of 2026-11-22 for issue #80 (decision `release`). Not a release.**
No version is set, no tag is created and nothing is published; publication
follows the [release rules](release-process.md). The version number of the
next release is the owner's decision (`CITATION.cff` carries the placeholder
`0.4.0-draft`).

Scope: every change since the release v0.3.7 (2026-10-15) that changes a
number, a classification or an export value of an existing result, derived
from the `[Unreleased]` section of the [changelog](../CHANGELOG.md) and the
[method decisions](remaining-method-decisions.md). Dates are those of the
owner's decision; where implementation came later, both are given. Each item
links to the rule in the [method reference](method-algorithms.md).
Interface, wording and export-layout changes that move no value are not
listed, except for the export changes at the end that can break a script.
Research use only: none of the results below is a diagnosis or a prognosis.

## Summary

| Area | What moves | Decision |
| --- | --- | --- |
| eGFR | Patients with creatinine in µmol/l only gain a computed eGFR | 2026-11-21, issue #65 |
| eGFR, AKI | Urine and other non-serum creatinine no longer feeds eGFR or AKI detection | 2026-11-05 and 2026-11-15, issue #34; LOINC 2026-11-21 |
| AKI | Stages graded against the seven-day minimum | 2026-11-16 |
| AKI | Several values on one day ordered by time of day, otherwise not compared | 2026-11-21 |
| AKI | Episodes separated only by 48 hours of recovery | 2026-11-21, implemented 2026-11-22, issue #67 |
| Slopes | Reliability rule counts distinct dates | 2026-11-05, issue #34 |
| OLS | Exact t quantile above 40 degrees of freedom | 2026-10-07 (OD-11), implemented 2026-11-22 |
| Endpoints | AKI windows left out of decline baseline and G5 projection; Theil–Sen projection needs five dates | 2026-11-05, issue #34 |
| Endpoints | `endpoint_percent_change` takes the sign of the badge | 2026-11-16 |
| Rapid decline | No flag on an unreliable slope; two levels | 2026-11-17; 2026-11-21, issue #72 |
| Cohort models | Full precision from R; default reference level from the fitted data | 2026-11-13 (OD-30); 2026-10-07 (OD-29), implemented 2026-11-22 |
| Identifiers | `fitConfigHash` of every model; `input_data_id` of datasets with times of day | 2026-10-07 (OD-21), implemented 2026-11-22; 2026-11-22 |

The golden fixtures moved in one place only: `tests/goldens/egfr.json`
gained seven rows (creatinine source per patient). No other stored fixture
value moved; the demo workbook keeps its eight AKI episodes, their stages
and its slopes.

## eGFR and creatinine input

- **Creatinine source per patient** (decided 2026-11-21, issue #65; OD-36
  confirmed 2026-11-22). A patient without any serum creatinine in mg/dl now
  uses their own µmol/l series (÷ 88.42) instead of getting no eGFR. Series
  are still never merged. Demo data, CKD-EPI 2021: 27 of 28 patients have a
  computed eGFR (26 before); patient 10 gains seven values from 94.3 to
  58.0 mL/min/1.73 m². A saved workspace is derived again on load and gains
  these values too. Slopes, endpoints, flags and AKI windows of the computed
  eGFR follow. [Source selection](method-algorithms/egfr.md#source-selection).
- **Non-serum creatinine is excluded** (decided 2026-11-05, issue #34; name
  rule for "u." decided 2026-11-15). Creatinine named as urine, dialysate,
  puncture fluid, CSF, drain, seroma, lymph, secretion or another body fluid
  is no eGFR source and no AKI input. Compared with v0.3.7, `Kreatinin [U]`
  and `Kreatinin:U` also become non-serum, while "u." between two blood
  materials (`Kreatinin im Serum u. Plasma`) stays serum as in v0.3.7.
  Affected datasets lose that series' computed eGFR and AKI episodes.
  [Eligible source series](method-algorithms/egfr.md#eligible-source-series).
- **Urine creatinine by LOINC code** (decided 2026-11-21). Rows with LOINC
  2161-8 or 14683-7 are imported as a separate parameter even under a serum
  test name. In such files the creatinine slope, AKI episodes, AKI windows
  and the computed eGFR change; a dataset saved on the device is corrected
  when restored. Files without these codes, the demo and the fixtures are
  unaffected. [Import and values](method-algorithms/import-and-values.md).

## AKI detection

- **Stage against the seven-day minimum** (decided 2026-11-16). Every
  crossing is graded against the lowest value of the seven days before it;
  an episode reports the highest stage of its crossings. 1.0, 1.2 and
  3.2 mg/dl on days 0, 3 and 4 give stage III instead of II. Stages can rise,
  never fall; chips, marker labels and the `aki` column can change.
  Detection, onsets and exclusion windows did not change with this step.
  [Staging](method-algorithms/aki.md#staging).
- **Several values on one day** (decided 2026-11-21). The time of day orders
  the creatinine values of a day; without a time they are compared with
  earlier days only, not with each other. Before, the row order of the file
  decided, so a file with the newest row first could report a fall as an
  episode and miss a rise. Episodes, exclusion windows and with them slopes
  change for files with several values per patient and day. Since
  2026-11-22 the time is exported in `time_of_day` and read again, so a
  re-imported export gives the same episodes.
  [Measurements on the same date](method-algorithms/aki.md#measurements-on-the-same-date).
- **Episodes separated by recovery** (decided 2026-11-21 following ADQI 16,
  implemented and reviewed 2026-11-22, issue #67; OD-35 resolved). A new
  episode starts only after creatinine has been back below the criterion for
  48 hours, counted in calendar days (setting *Recovery between episodes*,
  default 48 hours, at most 2160). An episode also ends after more than
  seven days without values. Daily values of 1.0, 1.4, 1.8, 2.2, 2.6 and
  3.0 mg/dl were four episodes (I, II, II, III) and are one of stage III.
  Episode counts, stages, chips, `aki_episodes`, AKI exclusion windows and
  with them slopes and endpoint inputs change; the window stays onset + N
  days, so a merged episode excludes less than the chain it replaces.
  [Episodes](method-algorithms/aki.md#episodes).
- **A computed eGFR takes its AKI windows from its own source series**
  (decided 2026-11-05, issue #34), not from the patient's creatinine series
  with the most rows. Since 2026-11-21 that is the per-patient series above.

## Slopes and intervals

- **The reliability rule counts distinct dates** (decided 2026-11-05, issue
  #34). Fewer than three distinct fitted dates, or under 365 days of fitted
  span, mark a slope uncertain; before, rows were counted. 40, 40.2 and 39.8
  on one day and 30 a year later were a reliable slope and are now
  uncertain (`unstable_slope` = yes). Slopes themselves do not change.
  [Reliability rule](method-algorithms/slope-quality.md#reliability-rule).
- **Exact t quantile above 40 degrees of freedom** (OD-11, decided
  2026-10-07, implemented 2026-11-22). Up to 42 fitted points nothing
  changes. From 43 to 122 points the OLS interval becomes up to 0.62 %
  narrower (t at df 50: 2.021075 → 2.008559), from 123 points up to 1.01 %
  wider (df 121: 1.959964 → 1.979764). The projection's confidence gate and
  the before/after difference interval use the same value. Slopes, standard
  errors and R² are unchanged.
  [95 % interval](method-algorithms/trend-estimators.md#95--confidence-interval-for-the-slope).

## Endpoints and projection

- **AKI windows in the endpoint input** (decided 2026-11-05, issue #34;
  scope confirmed 2026-11-13). A column that excludes AKI windows from its
  fit also leaves them out of the decline baseline and the G5 projection.
  Example: stable eGFR 34–36 for three years followed by eight AKI values of
  16–26 projected `G5 @ 65.0y` and is now withheld (`non_declining_fit`).
  Observed G4/G5, the total change and the rows that start or confirm a
  40 %/57 % decline keep every eligible row.
- **G5 projection minimum in dates; five for Theil–Sen** (decided
  2026-11-05, issue #34). The projection needs three distinct dates, five
  under Theil–Sen (new reason `theil_sen_insufficient_points`, badge
  `G5 < 5 dates`). 40, 39 and 30 at years 0, 1 and 2 under Theil–Sen gave
  `G5 @ 65.8y` and are now withheld.
  [Observed endpoints and projection](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction).
- **Sign of the total change** (decided 2026-11-16). The export column
  `endpoint_percent_decline` is renamed `endpoint_percent_change` and is
  negative for a fall (first 50, latest 30: `-40`, formerly `40`). It keeps
  its position: a script that reads by position gets the opposite sign
  without an error.

## Rapid-decline flag

- **No flag on an unreliable slope** (decided 2026-11-17). A slope with the
  reliability note gets no flag; `rapid_progression` turns from `yes` to
  blank. Demo data, General exploration: patient 12 (−7.35 per year,
  follow-up under a year) loses the flag.
- **Two levels** (decided 2026-11-21, issue #72; OD-37 confirmed
  2026-11-22). "rapid ↓" (`yes`) needs the whole 95 % interval below minus
  the threshold; a slope below it whose interval reaches the threshold, or
  that has no 95 % interval, is "rapid ↓?" (`possible`). Demo data, eGFR,
  General exploration, OLS: patients 6, 7, 17, 19, 22 and 27 change from
  `yes` to `possible`; 4, 9, 20, 21, 24, 25, 26 and, in the computed column,
  2 stay `yes`. The default threshold, 5 mL/min/1.73 m² per year, is from
  KDIGO 2012; KDIGO 2024 gives no numeric threshold.
  [Rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag).

## Cohort models

- **Full precision** (OD-30, decided 2026-11-13). Estimates, intervals and
  variance parameters are no longer rounded to four decimals in R. Values
  move in the fifth decimal and beyond; slopes between 1e-5 and 5e-5 per
  year are no longer stored as 0.
- **Default reference level from the fitted data** (OD-29, decided
  2026-10-07, implemented 2026-11-22; kept by the owner on 2026-11-22, with a
  warning still to be built). A categorical factor without a chosen
  reference takes, per fitted unit, the first level among that unit's model
  rows. Estimates change only for a unit that lacked the dataset's first
  level, which could not be fitted before. A whole cohort and a group can
  now have different references.
  [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models).
- **R served with the app, versions pinned** (decided 2026-11-21, K43).
  No number moved: the pinned versions are those the fit loaded before.
  Listed because the recorded versions and `wasmAssetSource` change.

## Identifiers

- **`fitConfigHash`** (OD-21, decided 2026-10-07, implemented 2026-11-22):
  the unused `tolerance` constant left the hash input, so every model's
  hash differs from earlier exports of the same model and data (e3861a2b →
  74ba071d in the reference example). The `tolerance` column of `models`
  stays, empty.
- **`input_data_id`** (2026-11-22): covers the time of day of rows that
  have one. Unchanged for datasets without times; the demo keeps
  `b59dd57d`.

## New results; existing numbers unchanged

These add numbers for a new option only. With the option off every existing
value is as in the rows above.

- Logarithmic value axis with doubling or halving time (decided 2026-11-21,
  implemented 2026-11-22, issue #70), sheet `log_trend`.
  [Log scale](method-algorithms/log-scale-and-doubling-time.md).
- Creatinine after selected events (decided 2026-11-21, implemented
  2026-11-22, issue #69), sheet `peri_event_creatinine`.
  [Peri-event creatinine](method-algorithms/aki.md#peri-event-creatinine-2026-11-22).
- Before/after comparison at an anchor event and the axis "Years since
  event" (decided 2026-11-21, implemented 2026-11-22, issues #64 and #70),
  sheet `anchor_comparison`.
  [Anchor comparison](method-algorithms/anchor-comparison.md).
- CKD-EPI 2009 (race-free) as a selectable eGFR equation (decided
  2026-11-05, label 2026-11-13); the default stays Off.

## Export changes that can break a script

Values are as described above; these change where or how they are written.

- `PatientID` is the patient column in every sheet (was `patientId` in
  `events`, `patient_attributes` and `demographics`), decided 2026-11-21.
- `group` is always the last column of `cohort` and `slopes` (was column A
  of a grouped export), decided 2026-11-21.
- Empty numbers are empty cells, not empty strings, decided 2026-11-21.
- `endpoint_percent_decline` → `endpoint_percent_change` with the opposite
  sign (above).
- `fit_config` no longer has `xAxis`; the Theil–Sen preset is written as
  `theil_sen`.

## Still to do before a release

- Owner: version number, authors and their order (`CITATION.cff`), and
  acceptance of the release scope (docs/release-process.md).
- Methods page: the wording drafts of
  [Part H](methodology-wording-drafts.md#part-h-for-approval-2026-11-22)
  await the maintainer; H1 removes the external-comparison claim (#84).
- Licences of the served R runtime: see the
  [licence analysis](licence-analysis.md), in particular the missing
  source of nloptr.
- Decisions of 2026-11-22 marked *to implement* (for example `proj`,
  `minfu`, `censor`, `akiwin`) change numbers when they are built; each gets
  its own line here when it lands.
