# Method reference: AKI detection and exclusion window

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

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
non-serum names (urine, dialysate, puncture fluid, secretions, lymph,
CSF and other body fluids; since 2026-11-05 also tokens such as `i.U.`,
`U`, `SU`, `SPU`, `PU`, `PD` and `U-`), with mg/dl or µmol/l
(including common case, space and micro-sign spellings; see
[eGFR derivation](egfr.md#eligible-source-series) for the exact tokens). A non-serum
series detects no episodes and supplies none to other columns.
Only dated exact numeric rows enter detection; bounded rows (`<x`, `>x`) and
rows without a number are ignored and cannot establish an episode.

Each eligible creatinine series detects AKI on itself. A computed eGFR column
uses the creatinine pair it was computed from (decided 2026-11-05, issue #34):
every computed row carries its source pair (`LabRow.sourceSeries`), and the
patient's rows of that pair are the detection input. Before, a computed eGFR
column was treated like any other analyte. For any other analyte column the
patient's eligible creatinine pair with the most exact dated rows is used;
ties retain the first encountered pair. Bounds do not win source selection by
inflating the row count. The choice is made per patient. Rows with different
names or units are never pooled into one detection series.

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
baseline 1.0. No other value is removed. The Data page reports
the number of exact dated serum-creatinine rows of zero or less ("… not
plausible, so not used for AKI detection or eGFR") and warns about values
above 25 mg/dl, which stay in detection (see the
[plausibility warnings](egfr.md#rounding-and-limits) of eGFR derivation).

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

Because a creatinine column detects on itself and every other imported column
uses the patient's creatinine pair with the most exact dated rows, two
creatinine columns of one patient can show different episodes, and an
imported eGFR column can take its episodes from another creatinine pair than
the one it was measured with. A computed eGFR column always uses the pair it
was derived from (since 2026-11-05).
Example (issue #34): a patient has `Kreatinin [mg/dl]` with 1.0, 2.0 and
1.9 mg/dl on 2020-01-01, -02 and -03, and five rows of
`Kreatinin enzym. [mg/dl]` in 2021, after the laboratory switched method. The
eGFR default source is `Kreatinin [mg/dl]`; the computed CKD-EPI 2021 eGFR is
86.2, 37.5 and 39.9 (male, 60 years). The `Kreatinin` column shows one
stage-II episode with onset 2020-01-02 (peak 2.0, baseline 1.0). The computed
eGFR column now shows the same episode, and with AKI exclusion its 30-day
window from 2020-01-02 removes 37.5 and 39.9 from the eGFR fit. Before, the
computed eGFR column used `Kreatinin enzym.` (five rows), showed no episode
and kept both AKI values in its slope. A `HbA1c` column of the same patient
still uses `Kreatinin enzym.` and shows none.

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
[method decisions](../remaining-method-decisions.md)); they are documented here
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

Regression evidence: [KDIGO boundary tests](../../tests/core/aki/kdigo.test.ts)
(tolerance, exact 0.3 mg/dl and 1.5-fold boundaries, stage values, the
4.0 mg/dl rule), [AKI source tests](../../tests/core/aki/akiAware.test.ts)
(eligible names and units, µmol/l conversion, source selection without
pooling, bounded rows), [creatinine source tests](../../tests/core/aki/creatinineSource.test.ts)
(non-serum names, the computed eGFR source example above, its fit input and
episode cache), [AKI module tests](../../tests/core/analysis/akiModule.test.ts)
(episodes reused on computed eGFR and other columns),
[AKI fixture tests](../../tests/parity/aki.parity.test.ts) (episode dates,
stages and criteria on fixture series),
[cohort screening tests](../../tests/core/cohort/screening.test.ts) (chip and
tooltip text) and
[censored measurement tests](../../tests/core/censoredMeasurements.test.ts).
No dedicated regression test: inclusive window bounds at exactly two and
seven days, the oldest-value tie rule for the baseline, same-date row order,
the sustained-rise and plateau chains, the stage effect of the absolute-first
order, and a computed eGFR column whose AKI source differs from its eGFR
source. Non-positive values and creatinine under dialysis are covered by the
[dialysis and positivity tests](../../tests/core/aki/dialysisAndPositivity.test.ts).

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
are unchanged. Since 2026-11-05 the same windows are also left out of the
decline baseline and the individual endpoint prediction when the column
excludes them; observed G4/G5, the total change and the decline events still
keep those rows (see "Which measurements" under "Observed endpoints and
individual prediction"). Before, endpoints did not use AKI windows. Cohort mixed models use them when the analysis settings
chosen for that parameter under Trajectories have the switch on and the *Apply
preset event and AKI exclusions* checkbox of the Cohort models page is on (see
[cohort mixed models](cohort-models.md#cohort-mixed-models)).

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

Regression evidence: [AKI source tests](../../tests/core/aki/akiAware.test.ts)
(band construction and merging, exclusion of points inside a 30-day window),
[cohort screening tests](../../tests/core/cohort/screening.test.ts) (window
exclusion through the fit configuration, a length of 0 excluding only the
onset measurement, bands on a non-creatinine column without exclusion),
[AKI module tests](../../tests/core/analysis/akiModule.test.ts) (one window per
episode with its length),
[summary tests](../../tests/core/stats/summarize.test.ts) (exclusion windows in
the fit) and [workspace chart tests](../../tests/workspace/trajectories.test.tsx)
(marker off a measurement). The
[fit configuration tests](../../tests/core/fitPipeline/types.test.ts) assert that
general exploration leaves the switch off. No dedicated regression test: the
inclusive end bound of the window at exactly onset + N days, fractional N,
the handling of empty or negative length input, the 30-day length of any
preset, the AKI switch of the Theil–Sen and acute review presets (the CKD
progression switch is exercised indirectly by the cohort screening test and
the workspace chart test that selects the preset), and the 2-day marker
boundary.

