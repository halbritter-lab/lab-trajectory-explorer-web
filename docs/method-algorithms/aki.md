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
series detects no episodes and supplies none to other columns. Creatinine
imported with the urine LOINC code 2161-8 or 14683-7 is such a series: the
import stores it under a name ending in ` (urine, LOINC <code>)` (decided
2026-11-21; see [Series identity](import-and-values.md#columns)), so serum and
urine values delivered under one test name no longer form one detection
input. In the example given there, five stage 3 episodes with baseline and
peak on the same day disappear.
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
The patient view names these values (since 2026-11-21): for a serum
creatinine series, the tooltip of a measurement point and the column "AKI
detection" of the measurement table read "not used for AKI detection
(dialysis)" for every value whose day `isUnderDialysis` leaves out, and a
line under the chart gives their number. The mark is shown with every preset
and with or without a fit, and it is separate from the fit exclusion "acute
dialysis interval" of the column's censoring options. It is shown for serum
creatinine series only, not for the other parameters that take their episodes
from them. Example: acute dialysis from 2026-03-05 with end date 2026-03-07
and one creatinine value per day from 1 to 12 March: the values of 5, 6 and
7 March carry the mark, those of 4 and 8 March do not. A peak inside the
interval is therefore visible in the chart but is not the peak of an episode.
Detection continues after transplantation, so a creatinine rise of the
transplant is detected. A transplant before the start of a chronic dialysis
does not end it. This filter is independent of the column's censoring options
and of the endpoint filter; it applies wherever episodes are used (chips,
markers, exclusion windows, cohort-model exclusions).

Example: creatinine 1.0 and 1.7 mg/dl on 2020-01-01 and 2020-01-03, 4.0 and
8.0 on 2020-04-01 and 2020-04-02, 1.2 and 2.0 on 2021-07-01 and 2021-07-02.
Without events there are three episodes (2020-01-03, 2020-04-02, 2021-07-02).
Each later episode follows a gap of more than seven days, which ends the
previous one at the first value after it (see [Episodes](#episodes)): the
episodes end on 2020-04-01 and 2021-07-01, and the third is open.
With chronic dialysis from 2020-03-01 only the episode of 2020-01-03 remains.
With an additional kidney transplant on 2021-06-01 the episode of 2021-07-02
is detected again.

### Time resolution and windows

Every imported lab date is a calendar day at midnight UTC. A time of day in
the source is not part of the date; it is kept beside it and only orders the
values of one date (see
[Measurements on the same date](#measurements-on-the-same-date)). Differences
between measurements are therefore whole multiples of 24 hours, and the two
KDIGO windows mean:

| Window | Constant | Earlier measurements inside the window |
| --- | --- | --- |
| 48 hours | `KDIGO_ABSOLUTE_WINDOW_MS` | 1 or 2 calendar days earlier; of the same date, those ordered before the measurement |
| 7 days | `KDIGO_RELATIVE_WINDOW_MS` | 1 to 7 calendar days earlier; of the same date, those ordered before the measurement |

Both bounds are inclusive: an earlier measurement is inside the window when
the elapsed time is less than or equal to the window length. A rise from 1.0
to 1.3 mg/dl two days apart is detected, three days apart it is not. A rise
from 1.0 to 1.5 mg/dl seven days apart is detected, eight days apart it is
not.

The windows count calendar days whatever the times of day (decided
2026-11-21): 1.0 mg/dl on 1 September at 05:00 and 1.3 mg/dl on 3 September at
07:00 are 50 hours but two calendar days apart, and the rise is detected.
1.0 mg/dl on 1 September at 23:00 and 1.3 mg/dl on 4 September at 01:00 are
also 50 hours but three calendar days apart, and it is not.

### Detection

Points are sorted by date and, within a date, as described under
[Measurements on the same date](#measurements-on-the-same-date). For each
point in turn, the **baseline** of a window is the lowest value among the
points that precede it in this order and lie inside the window. The point
itself is never part of its own baseline, and neither is a point of the same
date whose order relative to it is unknown.
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

Rows of the selected series on the same date are all kept. Their order
follows from the time of day and never from the row order of the file
(decided 2026-11-21, issue #34). Which rows carry a time of day is set at
import (see [Dates](import-and-values.md#dates)); midnight counts as no time.

| Values of the date | Order and comparison |
| --- | --- |
| every value has a time of day | Ordered by time. An earlier value of the date is a valid baseline and staging reference for a later one. Values with the same time are not compared with each other. |
| at least one value has no time of day | No value of the date is a baseline or staging reference for another value of that date. Each is compared only with values of earlier dates inside the window; all of them are possible baselines for later dates. Times that some of the values carry are not used. |

The rule is applied per date of the detection series: one date without a time
does not affect the time order on the other dates. A date is not reduced to
its maximum or to any other single value. Values that are not compared with
each other are processed in ascending order of value, which fixes the fields
that would otherwise follow the row order: the staging value of an episode is
the lowest value of the date that reaches the episode's stage, and when the
values of one date cross by different criteria the lower one comes first.

The time of day is a sort key only. Onset, peak, baseline and staging dates
are calendar days, and both KDIGO windows and the fit-exclusion window count
calendar days. Since 2026-11-22 the time is shown in the measurement table of
the patient view and exported in the column `time_of_day`, and a re-import of
the app's workbook reads it again, so the episodes are the same after a round
trip (see [Dates](import-and-values.md#dates)); it is not shown in the
tooltips.

Before 2026-11-21 the time was dropped at import and rows of one date stayed
in source row order, an earlier row being a valid baseline for a later row of
the same date. A file sorted with the newest row first therefore reported a
fall within a day as an episode and missed a rise. Examples (mg/dl,
September 2026; "newest first" and "oldest first" are the row orders of the
file):

| Values | Result | Before 2026-11-21 |
| --- | --- | --- |
| 1 Sep 06:00 1.4, 1 Sep 20:00 1.0, 2 Sep 06:00 0.9 | no episode | newest first: stage I, onset 1 Sep, baseline 1.0, peak 1.4; oldest first: no episode |
| 1 Sep 06:00 1.0, 1 Sep 20:00 1.6, 4 Sep 06:00 1.2 | stage I, onset 1 Sep, baseline 1.0 on 1 Sep, peak 1.6, absolute criterion | newest first: no episode; oldest first: this episode |
| 1 Sep 1.4 and 1.0 without time, 2 Sep 0.9 | no episode | 1.0 before 1.4 in the file: stage I, onset 1 Sep; 1.4 before 1.0: no episode |
| 1 Sep 1.0 and 1.6 without time, 4 Sep 1.2 | no episode: the direction within the day is unknown | 1.0 before 1.6 in the file: stage I, onset 1 Sep; 1.6 before 1.0: no episode |
| 1 Sep 1.0, 2 Sep 1.1 and 1.5 without time | stage I, onset 2 Sep, baseline 1.0 on 1 Sep, peak 1.5 | the same in both row orders |
| 1 Sep 1.4 and 1.0 without time, 2 Sep 1.3 | stage I, onset 2 Sep, baseline 1.0 on 1 Sep, peak 1.3 | 1.0 before 1.4: stage I, onset 1 Sep, peak 1.4; 1.4 before 1.0: as now |
| 1 Sep 06:00 1.0, 1 Sep 1.6 without time | no episode: one value of the date has no time | 1.0 before 1.6: stage I; 1.6 before 1.0: no episode |
| 1 Sep 06:00 1.0, 1 Sep 20:00 1.2 and 1.6 | stage I, onset 1 Sep, baseline 1.0, peak 1.6; staging value 1.6 (1.2 does not cross) | depended on the row order |

A rise within a date without a time of day is therefore not detected on that
date (fourth row); it is detected against an earlier date when one lies in
the window (fifth row). With the daily maximum as the only value of 1 Sep the
sixth row would give no episode.

**Data page note.** The Data page states how many patient-days this concerns:
"2 patient-days in 2 patients with several serum creatinine values whose
order within the day is unknown (no time of day, or the same time): AKI
detection compares these values with earlier values only, not with each
other." (`sameDayUnorderedCreatinine` in `aki/akiAware.ts`). Earlier values
are those of earlier dates and, where only a shared time is the reason,
also the values of the date with an earlier time (eighth row). The message
shown after an import of lab values repeats the count: "… 0 rows rejected; 0
warnings. 2 patient-days with several serum creatinine values whose order
within the day is unknown: see “Demographics and data quality”."; the count
is not an import diagnostic and not part of the warning count. A
patient-day is counted when one eligible serum creatinine series of the
patient has two or more exact dated values above zero on that date and at
least one of them has no time of day or two of them share a time. A date
counts once per patient, whatever the number of series. Values measured under
dialysis are counted although detection leaves them out. Without such a date
there is no note; dates whose values are all ordered by time are not counted.
In the examples above the third to seventh rows are one counted patient-day
each, the eighth is one (two values at 20:00), the first two are none.

The methodology page of the app states the rule of this section (wording G1
of the
[methodology wording drafts](../methodology-wording-drafts.md#part-g-draft-after-the-persona-review-of-2026-11-21-applied-2026-11-22),
applied 2026-11-22, formerly OD-34). Before, it read "Lab dates are calendar
days without a time of day. The 48-hour window therefore covers earlier
measurements on the same date or one or two calendar days earlier".

### Staging

`kdigoStage` grades a crossing from a reference value and the crossing value.
The **reference is the lowest positive value of the seven days before the
crossing** (the 7-day baseline of [Detection](#detection), with the same
window bounds and the same tie rule), whichever criterion detected the
crossing. The ratio is crossing value divided by reference; a reference of
zero or less gives an infinite ratio, which detection never passes on because
such values are removed beforehand. The rows are tested from top to bottom and
the first match applies.

| Stage | Condition (inclusive, with the 1e-12 tolerance) |
| --- | --- |
| III | crossing value at least 4.0 mg/dl, **or** ratio at least 3.0 |
| II | ratio at least 2.0 |
| I | ratio at least 1.5, **or** crossing value minus reference at least 0.3 mg/dl |

In this section "reference" always means the staging reference, the 7-day
minimum; "recorded baseline" means the detection baseline of
[Detection](#detection), which can be the 48-hour minimum. The 4.0 mg/dl rule
applies to every detected crossing whatever the size of the rise: 4.2 to
4.5 mg/dl on consecutive days is stage III. Exactly 2.0-fold is stage II and
exactly 3.0-fold is stage III.

The methodology page of the app states the same rule and the same example
(wording approved 2026-11-16, formerly OD-33).

**The staging reference can be lower than the recorded baseline** (decided
2026-11-16). The absolute criterion is tested first and records the 48-hour
baseline; the stage still uses the 7-day minimum, which is never higher,
because the 48-hour window lies inside the 7-day window. When both are the
same value, nothing differs. Until 2026-11-16 the stage was graded against the
recorded baseline, so an extra measurement on the day before a peak lowered
the stage.

| Values (mg/dl) and days | Recorded baseline | Staging reference | Stage | Before 2026-11-16 |
| --- | --- | --- | --- | --- |
| 1.0 (day 0), 3.2 (day 4) | 1.0, relative criterion | 1.0 | III (3.2-fold) | III |
| 1.0 (day 0), 1.2 (day 3), 3.2 (day 4) | 1.2, absolute criterion | 1.0 | III (3.2-fold) | II (2.67-fold) |
| 1.0 (day 0), 1.4 (day 1) | 1.0, absolute criterion | 1.0 | I | I |

The stage is never lower than under the earlier rule. Detection, the recorded
baseline, the grouping into episodes, onset dates and exclusion windows are
unchanged by that decision; only the stage and what is derived from it (chip,
marker label and tooltip, the `aki` export column) could differ. The grouping
into episodes changed on 2026-11-22 (see [Episodes](#episodes)).

### Episodes

Crossings are grouped into episodes in detection order (`clusterEpisodes`
in `aki/kdigo.ts`) by recovery, following the ADQI 16 consensus (Chawla et
al., Nat Rev Nephrol 2017, statement 1B: at least 48 hours of sustained
reversal separate two episodes; decided 2026-11-21, issue #67, details of
2026-11-22). The rule uses every value of the detection input, crossing or
not, in the order of [Detection](#detection):

1. The first crossing of the series, or the first crossing after an episode
   has ended, opens an episode.
2. While an episode is open, the first later value that is not a crossing
   (it meets neither criterion against its own 48-hour and 7-day minima) and
   has at least one earlier value in its 7-day window is its **candidate
   end**, provided that none of the calendar days of its recovery window is
   a day under dialysis (see below). A value without an earlier value in its
   7-day window is compared with nothing and shows no reversal; it is never a
   candidate end (since the second review of 2026-11-22; see step 4 for the
   only case in which such a value reaches step 2). The
   recovery window is the calendar days after the value up to the recovery
   length, **48 hours** by default (see [Recovery length](#recovery-length)):
   the next two calendar days. A later value that is not a crossing does not
   replace a candidate.
3. A crossing **joins** the open episode when the episode has no candidate
   end or when the crossing lies at most the recovery length after it (two
   calendar days or fewer, inclusive, as for the 48-hour criterion); it
   clears the candidate end. A crossing more than the recovery length after
   the candidate end (three calendar days or more) **ends** the open episode
   at the candidate end and opens a new episode.
4. A value without any earlier value in its 7-day window, which happens only
   after a gap of more than seven days without detection values, ends the
   open episode: at the candidate end when there is one, otherwise at the
   date of this value (`endedByGap`). Detection starts afresh there, so the
   next crossing opens a new episode however close it follows. Days of a
   dated acute dialysis interval do not count towards the gap: when the
   calendar days strictly between this value and the previous detection value
   that lie outside such intervals number fewer than seven, step 4 does not
   apply: the value continues the open episode, becomes its last value
   (`lastValueDate`) and is not a candidate end, because it has no earlier
   value to be compared with (decided 2026-11-22 after the review of the same
   day; until the second review of that day it was a candidate end, so a
   crossing three or more days later opened a new episode).
5. After the last value, an episode with a candidate end ends there, also
   when fewer than two days of data follow it; an episode without one is
   still open and has no end date.

A gap without measurements is therefore not a recovery by itself: an
episode ends with a value that is back below the criterion (step 2) or with
the first value after a gap of more than seven days (step 4), never on a day
without a value. Because dates are calendar days, the recovery window counts
calendar days whatever the times of day: a value back below the criterion on
1 March at 23:00 followed by a crossing on 4 March at 01:00 (50 hours) gives
two episodes; 1 March at 01:00 followed by 3 March at 23:00 (70 hours) gives
one. On a date whose values cannot be ordered (see
[Measurements on the same date](#measurements-on-the-same-date)) the values
are processed in ascending order; when one of them crosses, the lower ones
come first, so the date continues the episode and none of its values is a
candidate end.

**Dialysis.** Creatinine under dialysis is not in the detection input (see
above) and cannot show recovery. A value whose recovery window contains a day
under dialysis (`isUnderDialysis` in `aki/akiAware.ts`: from a chronic
dialysis start up to, not including, the next transplant, and a dated acute
dialysis interval, `date` through `endDate`, both included) is not a candidate
end, so an episode does not end during such an interval or just before a
chronic dialysis starts; the first value after an acute interval can end it.
Acute dialysis without an end date and dialysis of unknown intent remove no
value and do not block a candidate end. Days of a dated acute dialysis
interval (`isInAcuteDialysisInterval`) do not count towards the gap of step 4,
so an episode continues across an acute interval of any length. Days under a
chronic dialysis do count: the transplant that ends it starts detection
afresh, and a transplant rise after more than seven days of dialysis is
separated from an earlier episode by step 4. Until the review of 2026-11-22
only a dated acute interval blocked a candidate end, and an acute interval of
more than seven days ended the episode at the first value after it.

#### Recovery length

The recovery length is a setting since 2026-11-22 (issue #67; OD-35
resolved): *Recovery between episodes (hours)* under "Detected AKI episodes"
on the Data page, stored as `recoveryHours` of the dataset-level AKI module
settings (`AkiModuleSettings` in `aki/akiModule.ts`), default **48**
(`DEFAULT_AKI_RECOVERY_HOURS`). It is one value for the dataset, not a column
setting: it decides the episodes of every column (chip, markers, bands, AKI
windows of the fits and of the endpoints), the episode list and the sheet
`aki_episodes`, and it is written with the other analysis settings into the
`analysis_settings` column of the `settings` sheet. It is kept with the
dataset copy on the device; a copy saved before 2026-11-22 has no value and
gets 48. The field applies its value on leaving it or on Enter (spin buttons
and arrow keys at once); an empty or non-numeric entry changes nothing, and
the value is rounded down to a multiple of 24 and limited to 0 to 2160 hours
(`MAX_AKI_RECOVERY_HOURS`, 90 days; `akiRecoveryFieldHours`): 36 is stored
as 24, 100000 as 2160, −5 as 0 (since the review of the combined branch,
2026-11-22; before, every keystroke was applied, an emptied field as 0). A
stored value that is not a finite number of at least 0 invalidates the
stored analysis settings, as for `exclusionDays`; a larger stored value is
used as stored. Changing it discards fitted cohort models,
like a change of the eGFR formula.

The hours are counted on calendar days (`findKdigoAkiEpisodes`, option
`recoveryMs`): the recovery window of a value is the calendar days *d* ≥ 1
after it with 24·*d* ≤ hours, and a crossing joins the episode when its date
lies at most the given hours after the candidate end. With whole-day dates
only multiples of 24 matter; other values act like the next lower multiple
(36 like 24). 24 hours: the next calendar day; a crossing two days after the
candidate end opens a new episode (values 1.0, 1.6, 1.0, 1.6 on days 0, 1, 2
and 4: two episodes, end day 2; with 48 hours one). 0 hours: any later
crossing on a later date opens a new episode, and no day under dialysis is
checked. The dialysis start of an open or gap-ended episode in the
[episode list](#episode-list) counts up to the same length after its last
value.

Step 4 is a rule of this tool, fixed on 2026-11-22 and kept on the owner's
instruction of that day to resolve the open points (OD-35 resolved): it lets
a new episode start less than the recovery length after the end of the
previous one (days 0, 1, 20 and 21 in the examples below), although the
owner's rule starts a new episode only after 48 hours back below the
criterion. Without it, the strict rule joins crossings months apart into one
episode with one exclusion window: in the example of
[KDIGO creatinine AKI detection](#kdigo-creatinine-aki-detection) with a
transplant, the rise after the transplant in July 2021 would join the episode
of January 2020, and a regression test with stage-III crossings every two
weeks for two years would keep 98 more values in the fit. Such an episode has
no observed end: the [episode list](#episode-list) gives no end date for it.

An episode consists of:

| Field | Definition |
| --- | --- |
| Onset | date of the first crossing of the episode |
| Baseline | baseline date and value of the first crossing |
| Peak | highest crossing value of the episode and its date; the earlier date on equal values |
| Criterion | criterion of the first crossing |
| Stage | the highest stage of the episode's crossings, each graded against its own 7-day minimum (see [Staging](#staging)) |
| Staging value and reference | value and date of the first crossing that reached the episode's stage, and value and date of its reference (`stageValue`, `stageDate`, `stageReferenceValue`, `stageReferenceDate`); `kdigoStage(stageReferenceValue, stageValue)` gives the stage |
| End | date of the value that ended the episode (`endDate`, steps 3 and 4); empty while the episode is open. `endedByGap` is true when step 4 ended the episode at its own value without an earlier candidate end; the [episode list](#episode-list) then gives no end date |
| Last value | date of the episode's last value before its end (`lastValueDate`): its last crossing, or a later value that could not be a candidate end because of dialysis or because it had no earlier value in its 7-day window (step 4, gap bridged by an acute dialysis interval); for an open episode its last such value. Only the [episode list](#episode-list) uses it |

Examples (mg/dl, one value per day, days counted from day 0):

| Values | Episodes | Until 2026-11-22 |
| --- | --- | --- |
| 1.0, 1.6, 2.1 on 1, 2 and 3 January | one, onset 2 January, peak 2.1 on 3 January, stage II, open | the same, without end |
| 1.0, 1.4, 1.8, 2.2, 2.6, 3.0 on 1 to 6 January | one, onset 2 January, baseline 1.0 on 1 January, peak 3.0 on 6 January, stage III (3.0-fold), open | four, stages I, II, II, III |
| 1.0, 1.0, 1.3, 1.3 on four consecutive days | one stage-I episode, onset day 2 | two stage-I episodes |
| 1.0 (day 0), 2.9 (day 5), 3.2 (day 6) | one, onset day 5, peak 3.2, stage III | two, stages II and III |
| 1.0, 1.6, 1.0, 1.6 on days 0, 1, 2, 4 | one, onset day 1, open: day 4 lies two days after the 1.0 of day 2 | two (baselines day 0 and day 2) |
| 1.0, 1.6, 1.0, 1.6 on days 0, 1, 2, 5 | two: onset day 1, end day 2; onset day 5, open | one (same baseline day 0) |
| 1.0, 1.6, 1.0, 1.6 on days 0, 1, 20, 21 | two: onset day 1, end day 20 (step 4); onset day 21, open | two |
| 1.0, 1.6, 1.0, 1.6 on days 0, 1, 2, 6, acute dialysis days 3 to 4 | one, onset day 1, open: day 2 is no candidate end | one |
| 1.0, 1.6, 1.2 on days 0, 1, 2, chronic dialysis from day 3 | one, onset day 1, open: day 2 is no candidate end | one (until the review of 2026-11-22: end day 2) |
| 1.0, 3.2, 4.0, 4.2, 6.5 on days 0, 1, 13, 14, 15, acute dialysis days 2 to 12 | one, onset day 1, stage III, open: day 13 has no reference and the gap lies in the interval, so it continues the episode; day 14 (4.2 against 4.0) is the candidate end and the crossing of day 15 (6.5, 2.5 mg/dl above the 4.0 of day 13 within 48 hours) joins | two (until the review of 2026-11-22 as well: end day 13; onset day 15) |
| 1.0, 3.2, 4.0, 4.2, 6.5 on days 0, 1, 13, 14, 15 without dialysis, or with acute dialysis on days 2 to 4 only | two: onset day 1, end day 13 (step 4); onset day 15, open | two |
| 1.0, 3.2, 4.0, 4.1, 4.2, 7.0 on days 0, 1, 13, 14, 15, 16, acute dialysis days 2 to 12 | one, onset day 1, stage III, open: day 14 (4.1 against 4.0) is the candidate end, the crossing of day 16 (7.0, 2.9 mg/dl above the 4.1 of day 14 within 48 hours) lies two days after it | two until the second review of 2026-11-22: day 13 (4.0, no reference) was the candidate end, three days before day 16 |
| 1.0, 2.0, then 3.0 daily on days 2 to 12, 4.6 on day 14 | two: onset day 1, stage III, end day 9; onset day 14, stage III, open (see [Known limitations](#known-limitations)) | two |

The row with days 0, 1, 2 and 5 shows that the rule can also separate
crossings that the earlier merge by shared baseline date kept together: the
crossing of day 5 is detected against day 0 but follows three days of
recovery. In the first row the
two later values cross against the 1 January baseline. The 7-day minimum
moves as earlier values leave the window, so the stage need not come from
the peak crossing: values of 1.0 mg/dl on day 0, 1.4 on day 6, 3.1 on day 7
and 3.3 on day 8 form one episode (baseline 1.4 on day 6, onset day 7, peak
3.3 on day 8). On day 7 the 7-day minimum is still 1.0 (exactly seven days
back, inside the window): 3.1-fold, stage III. On day 8 the 1.0 has left the
window and the minimum is 1.4: 3.3 is 2.36-fold, stage II. The episode is
stage III, its staging value is 3.1 on day 7 and its staging reference is
1.0 on day 0.

Until 2026-11-22 a crossing joined the preceding episode only when its
baseline date equalled that episode's baseline date, and episodes had no end.
Because the baseline is a sliding minimum, each move of it started a new
episode, and a sustained rise was reported as a chain of episodes.

### Where results appear

Every column of a patient that has at least one dated numeric row receives the
episodes that apply to it, on creatinine and non-creatinine columns alike:

- a **chip** in the patient table and the `aki` export column;
- an **episode marker** labelled `AKI I`, `AKI II` or `AKI III` at the peak
  date and the shaded AKI windows, when *AKI windows and episodes* is
  switched on. The marker's tooltip names the numbers the stage follows from:
  "AKI stage III, onset 05/01/2024, creatinine peak 3.2 mg/dl on 05/01/2024;
  staged against 1 mg/dl, the lowest value of the 7 days before" (1.0, 1.2 and
  3.2 mg/dl on 1, 4 and 5 January 2024). When the stage comes from an earlier
  crossing than the peak, that value is named too: "…creatinine peak
  3.3 mg/dl on 09/01/2024; staged from 3.1 mg/dl on 08/01/2024 against
  1 mg/dl, the lowest value of the 7 days before". The recorded baseline is
  not shown (until 2026-11-16 the tooltip ended in "(baseline … mg/dl)").
  The marker sits on the column's measurement nearest to the peak date when
  one lies within two days, otherwise on the time axis. Where the column has
  several measurements on that date, the marker takes the first of them,
  except in the creatinine column the episodes were detected in: there it
  takes the value nearest to the peak (1.0 at 06:00 and 1.6 at 20:00 with
  peak 1.6: the marker is on 1.6; until 2026-11-21 it was on the first value
  of the day in every column). Display only;
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
- Start of renal replacement therapy is not treated as stage III. The
  [episode list](#episode-list) names the first dialysis that starts during
  an episode; the stage stays as detected.
- The paediatric stage-III criterion (eGFR below 35 mL/min/1.73 m²) is not
  evaluated.
- There is no outpatient, historical or back-calculated baseline; the only
  reference is the lowest earlier value within 48 hours or 7 days.

### Known limitations

The following properties are deliberate current behaviour (see
[method decisions](../remaining-method-decisions.md)); they are documented
here so that episode counts and stages are read correctly.

**Episode counts are counts of episodes separated by recovery as defined
above, not of clinical events.** The 48 hours of ADQI 16 are applied to
calendar-day data and to the values that happen to be measured: a rise and
fall within one gap of the measurements is not seen, and an episode ends
only with a measured value.

**An episode end is not a return to the creatinine before the episode.**
"Back below the criterion" compares a value with the lowest value of the
48 hours and 7 days before it, so on a sustained plateau the reference
catches up and the episode ends while creatinine stays raised. Values of 1.0
and 2.0 mg/dl on days 0 and 1 and 3.0 mg/dl daily from day 2 to day 12 give
one stage-III episode with onset day 1 (2.0, criterion absolute; stage III
from 3.0 against 1.0 on day 2) that ends on day 9: from that day the 1.0 and
2.0 have left the 7-day window, the 7-day minimum is 3.0 and 3.0 meets no
criterion. 4.6 mg/dl on day 14 rises 1.6 mg/dl above the 3.0 of day 12 and opens a
second stage-III episode (4.6 ≥ 4.0 mg/dl) with its own exclusion window, although
creatinine never returned towards 1.0. The same follows after a long acute
dialysis interval: the values after it are compared with each other only.

**A long episode keeps one exclusion window from its onset** (see
[AKI fit-exclusion window](#aki-fit-exclusion-window)). Crossings later than
the configured length after the onset are not covered by a window of their
own. Until 2026-11-22 such crossings could start episodes of their own, with
their own windows. An episode that continues across a dated acute dialysis
interval longer than the window (see [Episodes](#episodes)) is such an
episode: a crossing after the interval adds no window.

**The absolute criterion decides the recorded baseline first.** When the
absolute criterion fires, the relative criterion is not tested, and the
recorded baseline is the 48-hour minimum even when the 7-day minimum is lower.
This affects the baseline field, not the stage (see [Staging](#staging)) and,
since 2026-11-22, not the grouping into episodes. Values of 1.0 mg/dl on 1 January, 1.4 on 5 January
and 3.2 on 6 January give one episode with onset 6 January and recorded
baseline 1.4 mg/dl; its stage is III, because 3.2 mg/dl is 3.2 times the 7-day
minimum of 1.0 (until 2026-11-16: stage II, ratio 2.29 against 1.4). The
marker tooltip shows the stage, onset and peak of an episode together with its
staging value and reference (see [Where results appear](#where-results-appear)),
not its recorded baseline; the exports carry the chip (`aki`) only.

Regression evidence: [KDIGO boundary tests](../../tests/core/aki/kdigo.test.ts)
(tolerance, exact 0.3 mg/dl and 1.5-fold boundaries, stage values, the
4.0 mg/dl rule, staging against the 7-day minimum with the examples above,
the inclusive bound at exactly seven days, the staging value and reference of
each episode, and the sustained daily rise as one stage-III episode),
[recovery tests](../../tests/core/aki/recovery.test.ts) (the plateau, the
two- and three-day boundaries of the recovery window, calendar days against
hours, a date whose values cannot be ordered, the recovery length as an
option, the gap of more than seven days against one of exactly seven, the
plateau whose reference catches up, the exclusion window of a merged
episode, dated acute dialysis in and after the recovery window and without
an end date, and the first value after a long acute interval, which is no
candidate end), [AKI module tests](../../tests/core/analysis/akiModule.test.ts)
also cover the recovery length of the dataset settings (chip, cohort cell and
fit inputs with 24 and 48 hours), [registry tests](../../tests/core/analysis/registry.test.ts)
a stored setting without it, [same-day order tests](../../tests/core/aki/sameDayOrder.test.ts)
(the examples of "Measurements on the same date" in both row orders, with and
without a time of day, from text, workbook date cells and serial numbers, the
windows in calendar days and the patient-day count),
[AKI source tests](../../tests/core/aki/akiAware.test.ts)
(eligible names and units, µmol/l conversion, source selection without
pooling, bounded rows), [creatinine source tests](../../tests/core/aki/creatinineSource.test.ts)
(non-serum names, the computed eGFR source example above, its fit input and
episode cache), [AKI module tests](../../tests/core/analysis/akiModule.test.ts)
(episodes reused on computed eGFR and other columns, the marker tooltip with
its staging value and reference),
[AKI fixture tests](../../tests/parity/aki.parity.test.ts) (episode dates,
stages and criteria on fixture series),
[cohort screening tests](../../tests/core/cohort/screening.test.ts) (chip and
tooltip text) and
[censored measurement tests](../../tests/core/censoredMeasurements.test.ts).
No dedicated regression test: the inclusive window bound at exactly two days,
the oldest-value tie rule for the baseline, and a computed eGFR column whose AKI source differs from its eGFR
source. Non-positive values and creatinine under dialysis are covered by the
[dialysis and positivity tests](../../tests/core/aki/dialysisAndPositivity.test.ts).

### Episode list

Since 2026-11-17 the detected episodes are listed by name
(`akiEpisodeRows` in `src/workspace/aki-episodes.ts`): on the Data page
("Detected AKI episodes"), in the patient view ("AKI episodes for this
patient") and in the workbook sheet `aki_episodes`. The list runs
`episodesForSeries` once per patient and eligible serum creatinine series, so
each series detects on itself with the same detector, dialysis rule and
µmol/l conversion as above. Series are not pooled: a patient with two
creatinine series that both show a rise is listed once per series. The list
covers all analysis rows of the dataset; it does not depend on the selected
parameters, a preset or a column's exclusion setting, and it does not show
which episode a given column uses (for a column that is not creatinine and not
a computed eGFR, that is the patient's creatinine series with the most exact
dated rows, see above).

Each row gives patient, stage, onset date (`AkiEpisode.date`), peak date and
value, baseline date and value, the criterion that detected the episode
(`absolute_0_3_mg_dl_48h` or `relative_1_5x_7d`), the creatinine series, the
end date (since 2026-11-22) and the first dialysis start (since 2026-11-22).
All values are in mg/dl. Rows are ordered by patient, then by onset date. The sheet columns are `PatientID`,
`creatinine_parameter`, `creatinine_unit`, `stage`, `onset_date`, `peak_date`,
`peak_value_mg_dl`, `baseline_date`, `baseline_value_mg_dl`, `criterion`,
`end_date`, `dialysis_start`, `ended_by_gap`, `last_value_date` (the last
two since the second review of 2026-11-22); the
sheet is restricted to the exported patients and is present with no rows when
no episode was detected.

**End.** `end_date` is `AkiEpisode.endDate` (see [Episodes](#episodes)) as
`YYYY-MM-DD`, the date of the first value back below the criterion. It is
empty for an episode that is still open at the last value and for one that
step 4 ended at the first value after a gap of more than seven days
(`endedByGap`): that value is compared with no earlier value, so no end was
observed. `ended_by_gap` is `true` for the latter, otherwise `false`;
`last_value_date` is `AkiEpisode.lastValueDate` for every episode. The Data
page and the patient view show the date; "not observed: no values for more
than 7 days after 02/01/2024" (the last value) for an episode ended by a gap;
or "open at the last value". An acute or unknown-intent dialysis without an
end date blocks no end (see [Episodes](#episodes)), so an end on or after its
start can come from the dialysis rather than from recovery: when such a
dialysis starts between the onset and the end date, both days included, the
Data page and the patient view add it to the date, "09/06/2026 (after
dialysis start 06/06/2026 without end date)" (`endAfterOpenDialysis`, since
the review of the combined branch of 2026-11-22; the first such start; the
`about` note of `aki_episodes` says so, the sheet has no column for it).
Until the second review of 2026-11-22 the list
and `end_date` gave the date of the first value after the gap, while the
dialysis start was counted only up to two days after the last value.

**Dialysis start** (owner decision 2026-11-21, review item K29). The first
dialysis event of the patient whose start date lies between the onset and
the end of the episode, both calendar days included, is shown with its
intent: `2026-03-05 (acute)` in `dialysis_start`, "05/03/2026 (acute)" on the
Data page and in the patient view, "none" or an empty cell without one. For
an episode that is still open, and for one that step 4 ended at its own value
(`endedByGap`), that is whenever `end_date` is empty, the end is replaced by
the last day of the recovery window of the episode's last value
(`last_value_date` plus the recovery length, two calendar days by default;
`dialysisWindowEnd`), so that a dialysis after the values
stop is not attributed to the episode: an open episode whose last value is
on 4 March counts a start on 6 March, not one on 7 March or a year later
(decided 2026-11-22 after the review of the same day; until then every start
on or after the onset counted for an open episode). Every intent
counts (`acute`, `chronic`, `unknown`; a dialysis without intent is shown as
`unknown`); when two dialyses start on the same day, the first in the events
table is shown. The dialysis does not change the stage, the episode or any
other column: start of renal replacement therapy is still not treated as
stage III (see [Not implemented](#not-implemented)).

Example: creatinine 1.0 mg/dl on 2022-03-01 and 1.6 mg/dl on 2022-03-02 gives
one row with stage 1, onset and peak 2022-03-02, peak value 1.6, baseline 1.0
on 2022-03-01, criterion `absolute_0_3_mg_dl_48h` and empty `end_date` and
`dialysis_start`. Second example: 1.0, 1.6, 2.4 and 3.1 mg/dl from 1 to
4 March 2026, then 2.0, 1.4 and 1.2 on 9, 10 and 11 March, with an acute
dialysis from 5 to 8 March, an unknown-intent dialysis from 6 March and a
chronic dialysis from 12 March: one stage-III episode (3.1 against 1.0),
onset 2026-03-02, `end_date` 2026-03-09 (2.0 is not a crossing against the
seven-day minimum 1.6 and the next two days hold none), `dialysis_start`
`2026-03-05 (acute)`. A dialysis starting on 1 or 10 March would not be
listed. Third example: 1.0, 1.6 and 1.2 mg/dl on 1 to 3 January 2024 and a
chronic dialysis from 4 January: one open stage-I episode, onset
2024-01-02, empty `end_date` (1.2 is followed by a day under dialysis),
`dialysis_start` `2024-01-04 (chronic)`. Fourth example: 1.0 and 1.6 on 1 and
2 January 2024 and 1.0 on 1 March: step 4 ends the episode at 1 March;
`end_date` is empty, `ended_by_gap` is `true`, `last_value_date` is
2024-01-02, and the list shows "not observed: no values for more than 7 days
after 02/01/2024"; an acute dialysis starting on 4 January is listed, one
starting on 1 February is not. With a recovery length of 24 hours, one
starting on 4 January is not listed either (last day 3 January). Regression evidence:
[episode list tests](../../tests/workspace/aki-episodes.test.ts).

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
itself (a baseline earlier on the onset date by its time of day, see above:
the window covers the whole onset date, including values timed before the
rise), and so does any measurement after
the window even when creatinine is still raised. N is the column's
`akiExclusionDays`; the default is **30** (`DEFAULT_AKI_EXCLUSION_DAYS`).

The window does not depend on the episode end (decided 2026-11-22 with the
recovery rule of [Episodes](#episodes)). An episode that joins crossings over
more than N days keeps the one window from its onset; the alternative of
counting N from the last crossing was not taken because it would also have
lengthened the windows of episodes that the recovery rule leaves unchanged.
Merged episodes therefore exclude less than the chain of episodes they
replace: the sustained rise from 1 to 6 January (see the examples under
[Episodes](#episodes)) excludes 2 January to 1 February with N = 30; until
2026-11-22 its four episodes excluded 2 January to 5 February.

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
cover the same dates. Episodes with onsets on 2, 4, 5 and 6 January give four
windows (2 January to 1 February, 4 January to 3 February, 5 January to
4 February, 6 January to 5 February) and one band from 2 January to
5 February; the sustained-rise example, one episode since 2026-11-22, gives
one window and one band from 2 January to 1 February. The band is drawn with the column's window length whether or
not the column excludes the window from its fit. Since 2026-11-21 the legend
and the tooltip of the band state which case applies (owner decision
2026-11-21; the band itself is unchanged): "the configured N days after each
onset (not the duration of the episode)", followed by "values inside are
excluded from this fit" when the column excludes AKI windows, "values inside
are not excluded from this fit" when it has a fit that keeps them, and "this
column has no fit, so nothing is excluded" with fit model "No fit" or while
"Trend" is not ticked. The tooltip gives the dates and the length of the
drawn band, which exceeds N when windows were merged (39 days for the
windows of a first and a last episode whose onsets lie nine days apart and
N = 30). Since 2026-11-22 a column that does
not exclude the window (fit model "No fit", "Trend" not ticked, or a fit that
keeps the values) also carries one sentence under the chart while its bands
are drawn: "In this column nothing is excluded for AKI (it has no fit): the
shaded band only shows the configured 30 days after each onset." for the
first two cases ("Acute review", for example) and the same without "(it has
no fit)" for the third. A column that excludes the window has no such
sentence.

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


## Peri-event creatinine (2026-11-22)

Owner decision of 2026-11-21 (issue #69); implemented on 2026-11-22. Code:
`periEventCreatinine` and `periEventCreatinineRows` in
`src/core/domains/nephrology/aki/periEvent.ts`; list and export rows in
`src/workspace/peri-event.ts`. For every selected event, for example a
contrast administration or a cardiac catheterisation, the analysis reports
the last serum creatinine value on or before the event (baseline), the
highest value in a window after it, the absolute and relative rise and
whether the KDIGO creatinine criterion is met. It is a listing beside
[AKI detection](#kdigo-creatinine-aki-detection): it changes no episode,
chip, marker, fit, flag, endpoint or cohort-model input. Automated screening
for research use, not a diagnosis of contrast-associated AKI. Evidence named
in the decision: the ACR/NKF consensus of 2020 defines contrast-associated AKI
as KDIGO AKI within 48 hours after contrast; ESUR uses 48 to 72 hours.

### Setting and event selection

Data page → "Creatinine after selected events". Dataset-level, stored as
`aki.periEvent` in the analysis settings (`{ rule, windowHours }`; absent
while no events are selected, the default). It is saved with the dataset copy
and exported in `analysis_settings` of the `settings` sheet. A stored value
that cannot be read is dropped (no events selected); the other AKI settings
stay readable. Changing it does not discard fitted cohort models.

- **Events.** "None", or every event whose **title** or whose **type** equals a
  chosen value, compared exactly as stored, including case and spaces
  (`eventMatchesRule`, the matching of the
  [anchor event](anchor-comparison.md#anchor-event) of the before/after
  comparison). Unlike the anchor, **every** matching event is analysed, not
  only the first. The menu offers the titles and types of the loaded events,
  prefixed "Title:" and "Type:". An event with an end date is evaluated at
  its start date.
- **Window**: 48 hours (default) or 72 hours. No other length is accepted.

### Input series and values

- **Series.** Per patient, the eligible serum creatinine series (name and
  unit) with the most exact dated numeric rows; on a tie the series met first
  in the rows (`largestCreatinineSeries`, the choice AKI detection makes for a
  column that is neither creatinine nor computed eGFR; see
  [Input series and conversion](#input-series-and-conversion)). Eligible
  means a creatinine name that is not a non-serum material (urine, dialysate,
  puncture fluid and the other materials of `isNonSerumName`, and creatinine
  with the urine LOINC codes 2161-8 and 14683-7) with the unit mg/dl or µmol/l.
  Series are not pooled; the row names the series used.
- **Values.** Exact dated values above zero. Bounds (`<x`, `>x`), rows
  without a number and values of zero or less are not used, so the baseline
  is always above zero and the relative criterion is always defined.
- **Unit.** µmol/l is divided by **88.42**; every value and rise is in mg/dl.
- **Dialysis.** Values on a day under dialysis (`isUnderDialysis`, see
  [Input series and conversion](#input-series-and-conversion): from a chronic
  dialysis start until the next kidney transplant, and inside a dated acute
  dialysis interval, both boundary days included) are neither baseline nor
  peak. The values of the window left out this way are counted
  (`n_window_values_under_dialysis`).

### Days, baseline, window and criterion

Event dates have no time of day (it is discarded at import, see
[Dates](clinical-events.md#dates)). The rule therefore works in calendar days
(UTC), with the event day `A` and `N = window hours / 24` (2 or 3):

| Calendar day `d` of a value | Role |
| --- | --- |
| `d ≤ A` (the event day included) | baseline candidate |
| `A < d ≤ A + N` | window |
| `d > A + N` | not used |

- **Baseline**: the values of the last calendar day `≤ A` that has a value.
  With one value it is that value. With several, it is the one with the
  latest time of day when every value of that day has a time, otherwise
  (order unknown) the lowest; among values with the same latest time also
  the lowest. The number of values of the baseline day is reported
  (`n_baseline_day_values`). There is **no look-back limit**: a value years
  before the event is the baseline, and its distance is reported
  (`baseline_days_before_event`).
- **Peak**: the highest value of the window; on a tie the earliest (date,
  then time of day, then row order). The number of window values used is
  reported (`n_window_values`).
- **Rise**: `absolute = peak − baseline` (mg/dl, can be negative) and
  `ratio = peak / baseline`.
- **Criterion** (KDIGO creatinine rise): met when `absolute ≥ 0.3 mg/dl` or
  `ratio ≥ 1.5`. Both comparisons are inclusive with the KDIGO tolerance of
  1e-12 (`value + 1e-12 ≥ threshold`), as in
  [Detection](#detection): 1.1 → 1.4 mg/dl is met, 1.1 → 1.399999 is not;
  0.4 → 0.6 mg/dl (ratio 1.5, rise 0.2) is met by the ratio, 0.4 → 0.59 is
  not. The criterion field names which rule fired: `absolute_0_3_mg_dl`,
  `relative_1_5x` or `both`. Both rules use the same window of 48 or 72
  hours; the 7-day window of the relative rule in AKI detection does not
  apply here.

A value on the event day is a baseline candidate, never a window value, also
where the lab values carry a time of day: a blood draw on the day of a
procedure is usually its baseline, as for the anchor of the before/after
comparison. A rise measured later on the event day is therefore not seen, and
the 48-hour window covers between 48 and 72 hours of elapsed time after an
event depending on when on day `A` it took place. The Data page states this
limitation. **Open decision OD-36**: the decision asks for exact hours when
event and values have times; because the import keeps no time of day on
events, the calendar-day rule is applied in every case, and an exact-hour rule
would need event times.

### Status and reasons

Each event gets `met`, `not_met` or `not_evaluable`. Not evaluable has one
reason, tested in this order:

| Reason | When |
| --- | --- |
| `no_creatinine` | The patient has no usable value of an eligible serum creatinine series (also a patient with events but no lab rows, and one with only non-serum creatinine). |
| `event_under_dialysis` | The event day itself is under dialysis (`isUnderDialysis`). Selecting the type `dialysis` therefore makes a chronic dialysis start and a dated acute dialysis not evaluable. |
| `no_baseline` | No usable value on or before the event day. |
| `no_value_in_window` | No usable value in the window. |

Baseline and peak are reported whenever they exist, also for a not-evaluable
event (for example the peak of an event without baseline); rise, ratio,
criterion and `criterion_met` are empty for it.

### Several events and dialysis in the window

- **Each event is evaluated on its own**, including events of one patient
  whose windows overlap and events on the same day (two identical rows).
  The later of two close events takes as baseline the last value on or before
  its own day, which can already be raised by the first. Each row counts the
  other selected events of the patient within `N` calendar days before or
  after it (`overlapping_events`).
- **Dialysis start in the window**: the first dialysis event of the patient
  (any intent; not the event itself) that starts on day `A` to `A + N` is
  named with its intent, for example `2026-03-02 (acute)`. Start of renal
  replacement therapy does not make the criterion met (see
  [Not implemented](#not-implemented)); a dialysis without an end date or of
  unknown intent leaves the values in, as in AKI detection.

### Where results appear

- **Data page**, "Creatinine after selected events (n)", next to "Detected
  AKI episodes": the selection, the window, the day-resolution note, a count
  line ("3 events: criterion met for 2, not met for 0, not evaluable for 1.")
  and one row per event with patient (opens the patient), event date, title
  and type, baseline with its date and the days before the event, highest
  value in the window with its date, rise, ratio ("1.35 ×"), the criterion
  ("Met: rise ≥ 0.3 mg/dl", "Not met", "Not evaluable: no value in the
  window"), the creatinine series and notes (overlapping events, dialysis
  start, values under dialysis left out, a baseline chosen among several
  values of its day). Rows are ordered by patient, then event date, then
  the order of the events table.
- **Workbook** (cohort and patient), last sheet `peri_event_creatinine`,
  restricted to the exported patients and empty while no events are
  selected: `PatientID`, `event_date`, `event_type`, `event_title`,
  `event_rule` (`title:<value>` or `type:<value>`), `window_hours`,
  `window_end_date` (`A + N`), `creatinine_parameter`, `creatinine_unit`,
  `baseline_date`, `baseline_value_mg_dl`, `baseline_days_before_event`,
  `n_baseline_day_values`, `peak_date`, `peak_value_mg_dl`,
  `n_window_values`, `absolute_rise_mg_dl`, `ratio_to_baseline`,
  `criterion_met` (`true`, `false`, empty when not evaluable), `criterion`,
  `status`, `reason`, `dialysis_start_in_window`,
  `n_window_values_under_dialysis`, `overlapping_events`. Values are
  unrounded. The `about` sheet ends with a note on the sheet; no earlier
  sheet, column or note moved.

### Worked example

Serum creatinine `Kreatinin [mg/dl]` of one patient: 0.9 on 2026-03-01, 1.0
on 03-03, 1.2 on 03-04, 1.35 on 03-05 and 1.6 on 03-06. Events of type
`other`: "Contrast CT" on 2026-03-03, "Cardiac catheterisation" on 03-04 and
"Visit" on 2026-02-01. Selection "Type: other".

| Event | Window | Baseline | Peak in window | Rise | Ratio | Result |
| --- | --- | --- | --- | ---: | ---: | --- |
| Visit 02-01 | 48 h: 02-02 to 02-03 | none | none | | | not evaluable, `no_baseline` |
| Contrast CT 03-03 | 48 h: 03-04 to 03-05 | 1.0 on 03-03 (0 days) | 1.35 on 03-05 | 0.35 | 1.35 | met, `absolute_0_3_mg_dl`; 1 overlapping event |
| Catheterisation 03-04 | 48 h: 03-05 to 03-06 | 1.2 on 03-04 | 1.6 on 03-06 | 0.40 | 1.333 | met, `absolute_0_3_mg_dl`; 1 overlapping event |
| Contrast CT 03-03 | 72 h: 03-04 to 03-06 | 1.0 on 03-03 | 1.6 on 03-06 | 0.60 | 1.60 | met, `both` |
| Catheterisation 03-04 | 72 h: 03-05 to 03-07 | 1.2 on 03-04 | 1.6 on 03-06 | 0.40 | 1.333 | met, `absolute_0_3_mg_dl` |

The value of 03-01 is not the baseline of the contrast CT, because a later
value lies on the event day. The catheterisation takes 1.2 as its baseline,
the value already raised one day after the contrast CT: each event is
evaluated on its own, and the overlap is only counted. The same values in
µmol/l (0.9 → 79.578, 1.0 → 88.42, 1.35 → 119.367 µmol/l) give the same rows.
Demo workbook: it has no contrast or catheterisation events, and none of its
events is evaluable. "Title: Study medication" lists patient 11 (2022-05-15):
baseline 1.08 mg/dl on 2022-04-10, 35 days before, no value in the window,
not evaluable (`no_value_in_window`). "Type: dialysis" lists four events;
the chronic starts of patients 9 and 12 and the acute dialysis of patient 7
are `event_under_dialysis`, the unknown-intent interval of patient 9 is
`no_value_in_window`. With an events file that adds a contrast
administration for patient 11 on 2022-07-10 (the browser regression test
does this): baseline 1.1 on 2022-07-10, peak 1.8 on 2022-07-12 in the
48-hour window, rise 0.7 mg/dl, ratio 1.64, met by both rules.

### Regression evidence

`tests/core/aki/periEvent.test.ts` (0.3 mg/dl and 1.5-fold boundaries,
48/72-hour calendar windows at `A + 2` and `A + 3`, event-day value as
baseline with a time of day, unlimited look-back, baseline among several
values of a day with and without times, peak tie, µmol/l conversion, series
choice with non-serum and bounded rows, values of zero or less, no baseline,
no creatinine, event under dialysis, window values under dialysis and
dialysis starts, overlapping and same-day events, exact title and type
matching, patient order, stored settings);
`tests/workspace/peri-event.test.tsx` (Data page section, window switch,
count line, models kept, export sheet and the worked example);
`tests/workspace/export-schema.test.ts` (sheet position and columns);
`tests/e2e/peri-event.e2e.ts` (the demo in Chromium, desktop and phone
width).
