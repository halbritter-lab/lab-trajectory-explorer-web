# Method reference: Endpoints and individual projection

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

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

A third, name-only test (the name contains `egfr`, in any case) is used only
to preselect the outcome on the Cohort models page (since 2026-10-12;
`src/workspace/cohort-model-parameter.ts`). Candidates are the parameters with
at least one finite numeric value. They are ordered by that name test (eGFR
first), then by the number of patients with exact (`=`) numeric measurements
on at least three distinct dates, then by import order; this count is taken on
the analysed rows before any window, run-in or time balancing. The first
candidate whose count reaches 10 and whose whole-cohort rows, prepared with the
column's Trajectories settings and the page's preset-exclusion choice, pass the
model validation for the standard model (random intercept and slope, no
factors) is preselected. When no candidate passes, the first candidate is shown
and the page explains why it cannot be fitted. Example: the demo workbook's
imported eGFR has 25 qualifying patients and passes, so it is preselected ahead
of Kreatinin [mg/dl] (26). The preselection is recomputed whenever the data or those
settings change, until the user picks a parameter; choosing a model preset or
factors does not change it.

**Which endpoints.** The column's fit configuration has four toggles: observed
CKD G4, observed CKD G5, percent eGFR decline, and projected age to CKD G5
(the extrapolation to CKD G5), plus the minimum confirmation interval and,
since 2026-11-22, a fifth toggle for the confirmed 50 % decline
(`observedDecline50`, under percent eGFR decline; see "Total percent change
and confirmed 40 %/57 % decline"). The CKD progression preset turns observed
G4, observed G5 and percent decline on with 90 days and leaves the
extrapolation and the 50 % decline off (decided 2026-11-22, `proj` and `p50`,
issues #81 and #82; until then it turned all four on). General exploration,
Theil–Sen robust trend and Acute review turn all of them off. The
extrapolation is switched on per parameter, in the endpoint settings of the
shared settings or of a parameter's own settings ("Extrapolation to CKD G5
(off by default)"). The examples below that report or withhold a projected
age assume it switched on.

Settings saved on this device or applied from an export with the
extrapolation on keep it on, and the notice of the restore (or the list of
what was applied) names them: "The extrapolation to CKD G5 is switched on in
…, as saved: a conditional extrapolation of the fitted trend, not a
prognosis. …". A saved CKD-progression setting with the extrapolation on no
longer matches the preset's definition, so it is restored as "Custom
configuration" with its values, by the general rule for changed presets, and
the exported `fit_config` then gives preset `custom`. The `settings` sheet
records whether the extrapolation was on in `fit_config`
(`endpoints.projectedAgeToCkdG5`); no separate column was added. Its result
columns keep their positions and are empty while it is off.

**Which measurements.** Endpoint input is the column's measurements of the
patient that have a valid date, a finite numeric value and the operator `=`
(bounds are excluded by row whatever the column's bounded-value setting; see
"Bounded measurements"; a conclusive bound can only interrupt a G4/G5
candidate, see below), after this event
filter (`filterEndpointPointsForEvents`):

- Values on or after the earliest kidney transplant or chronic dialysis start
  are removed. The start day itself is removed.
- Values within a complete dated acute dialysis interval are removed,
  including its start and end dates. Later values remain eligible. An interval
  is complete when it has an end date not before its start date.
- Values dated after the patient's earliest `death` event are removed (since
  2026-11-22, issue #78): they can only be data errors, and the import warns
  about them (`values_after_death`). A value on the day of death is kept.
  Example: eGFR on 2019-01-01 and 2020-06-01, death on 2020-01-01: only the
  value of 2019-01-01 is endpoint input, and `last_eligible_date` is
  2019-01-01. Fits are unchanged: the display fit still uses the later value
  (**Open decision OD-79**).
- Unknown-intent dialysis, acute dialysis without an end date and `other`
  events remove nothing.

Dates compare by UTC calendar day. The filter is independent of the display-fit
censoring options and time balancing; a column with all censoring options off
still truncates its endpoint input at kidney replacement therapy.

**AKI windows (since 2026-11-05).** When the column's fit excludes AKI windows
(the fit configuration's AKI exclusion is on, as in the CKD progression preset,
or the slope mode is `aki-aware`), the rows inside those same windows are also
left out of two endpoint inputs: each window runs from the episode onset to
onset plus the column's window length (30 days by default), both ends
included, as in "AKI fit-exclusion window". The windows come from the same
episodes, from the same creatinine source and with the same length as the
display fit's. With AKI exclusion off nothing changes. The rule applies to
exactly two inputs, as issue #34 requested: the rows that form the decline
baseline and the rows of the projection fit (with its minimum dates, span and
latest row; ages are still anchored on all eligible rows). Observed G4 and G5, the total percent change and
the rows that start, confirm or recover a 40 % or 57 % decline still use every
eligible row, AKI windows included. So a low eGFR inside an AKI window can
still start or confirm an observed G4 or G5 or a decline event. This matters
in advanced CKD: the absolute KDIGO criterion (a rise of 0.3 mg/dl within 48
hours) is met by ordinary day-to-day variation at high creatinine, so whole
stretches of a sustained G5 can lie inside AKI windows (Example 3). The export
column `endpoint_input_policy` names the exclusion (see "Export provenance").

Example 1 (decided 2026-11-05): eGFR 34, 35, 36, repeating, on the first day of
each quarter from 2020-01-01 to 2023-01-01 (13 rows), then 26, 24, 22, 20,
18, 17, 16, 16 daily from 2023-02-01, with creatinine 1.8 mg/dl up to
2023-01-31 and 2.8 to 3.5 mg/dl from 2023-02-01 (AKI stage I, onset
2023-02-01, window to 2023-03-03). Under CKD progression, with a birth date of
1960-01-01, the display fit was already flat (slope 0.044 per year, bounds
[-0.54, 0.63]). Before, the endpoint fit used all 21 rows: slope bounds
[-7.43, -2.46] and a projected age of 65.0 (`G5 @ 65.0y`). Now the eight AKI
rows are left out of the projection fit, which equals the display fit, and the
projection is withheld as `non_declining_fit`. The total change still uses all
21 rows: (34 - 16) / 34 = 52.9 % (badge `-53%, G5 not projected`). The decline
baseline is 34 (2020-04-01 is day 91, outside the baseline period); 16 is a
52.9 % decline from it but has no confirmation, so no decline event, G4 or G5
is met.

Example 2 (decided 2026-11-05): eGFR 20 and 25 on 2020-01-03 and 2020-01-05
during an AKI (creatinine 1.0 on 2020-01-01, 2.6 on 2020-01-03, onset
2020-01-03), then 55 (2020-03-01), 58 (2020-05-01), 56 (2020-07-01), 33
(2021-01-01) and 32 (2021-06-01). Before, the baseline window ran from
2020-01-03 and its mean was (20 + 25 + 55) / 3 = 33.33; the later rows 58,
56, 33 and 32 are at most a 4.0 % decline from it (32), so no 40 % decline
was found. Now the baseline starts at the first row outside the AKI window.
Since 2026-11-22 the window runs to 90 days after the end of the episode (see
[AKI fit-exclusion window](aki.md#aki-fit-exclusion-window)): the episode
(creatinine 2.2 on 2020-01-05 joins it) is ended by the gap before the
creatinine of 2020-03-01, so its last day is 2020-01-07 (last value plus the
48-hour recovery window) and the window runs to 2020-04-06. The first row
outside it is 2020-05-01: (58 + 56) / 2 = 57 (from 2020-11-05 to 2026-11-22,
with the window of 30 days from the onset, the baseline started at
2020-03-01: (55 + 58) / 2 = 56.5). The decline events read every eligible row
after the baseline period, which ends 90 days after 2020-05-01 (2020-07-30):
33 is a 42.1 % and 32 a 43.9 % decline from 57, and the 40 % decline is
confirmed with first date 2021-01-01 (33) and confirmation 2021-06-01 (32,
151 days later); the 57 % decline is not met. The total change keeps the AKI
rows and stays a rise of 60 % from 20 to 32 (`endpoint_percent_change` 60,
badge `+60%`), next to a confirmed 40 % decline: the two answer different
questions. The projection moves as well: before 2026-11-05 the seven rows
gave slope bounds [-35.47, 33.46] and `slope_ci_includes_zero`; from
2026-11-05 to 2026-11-22 the five rows from 2020-03-01 gave bounds
[-40.83, -6.37] and, with a birth date of 1960-01-01, a projected age of
62.0; since 2026-11-22 the four rows from 2020-05-01 give bounds
[-55.69, 1.36], and the four rows span 13 months, short of the KDIGO minimum
of three years, so the projection is withheld as `kdigo_minimum_follow_up`
(checked before the interval, which also includes zero). The column's `aki_window` is
`episode_end_plus_90d` and `n_aki_excluded` 3 (20, 25 and 55).

Example 3 (regression, review follow-up of 2026-11-05): eGFR 14.2 and 13 with
creatinine 4.5 and 4.85 mg/dl on consecutive days, every 14 days for two
years from 2020-01-01 (104 rows of each). Each rise of 0.35 mg/dl within a day
above 4.0 mg/dl is a KDIGO stage-III episode, so 52 episodes are found and
their windows cover 103 of the 104 eGFR rows. When the AKI windows were
removed from all endpoint input (the first version of this change), one row
remained and the sustained observed G5 was lost. Now observed G4 and G5 use
all 104 rows and G5 is met from 2020-01-01 (14.2); the projection reports
`observed_ckd_g5`.

Remaining rows are sorted by date; rows on the same date keep source order.
Without AKI exclusion the same eligible rows feed every endpoint and the
projection fit; with it, the decline baseline and the projection fit read the
subset outside the AKI windows.

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

Regression evidence: [cohort cell tests](../../tests/core/cohort/screening.test.ts),
[bounded measurement tests](../../tests/core/censoredMeasurements.test.ts) and
[method contract tests](../../tests/workspace/method-contract.test.tsx). No
The unit rule is covered by the
[decision tests](../../tests/core/endpoints/decisions20261007.test.ts). No
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

**Confirmation presets (since 2026-11-22, issue #85, `confirm`).** Beside the
interval field the endpoint settings offer a choice "Confirmation preset" with
two entries: "90 days (default)" and "28 days (ISN trial definition)".
Choosing one sets the interval to that number; typing another number shows it
as "N days (own value)". The preset changes nothing but the interval, so the
export records it as `endpoint_confirmation_days` (and `confirmationDays` in
`fit_config`) like a typed value. 90 days follows the chronicity criterion of
KDIGO 2024 (PP 1.1.3.1, more than 3 months). The 28-day rule is attributed to
the ISN trial definition of a sustained decline (Levin A et al., Kidney Int
2020;98:849, PMID 32998816) and is **unverified**: only the abstract of that
paper was read, which speaks of a "sustained" decline without a duration; the
full text was not checked. Example: low values on 2020-01-01 and 2020-02-01
(31 days apart) confirm a G5 with the 28-day preset and not with the default.

**Maximum window.** Confirmed by the owner on 2026-10-07. Confirmation must occur within 12 UTC
calendar months of the candidate, inclusive of the anniversary day. Month
addition clamps to the last day of the destination month (2020-02-29 to
2021-02-28). The value 12 is fixed in code. The 12-month maximum is a rule of
this tool, not a published standard (labelled so since 2026-11-22, issue #85;
see [rules of this tool](../method-algorithms.md#rules-of-this-tool-that-are-not-published-standards));
the settings text says so.

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
confirm or recover an event. Since 2026-11-22 (issue #73) a bound `>x` with
x at or above the threshold, which passes the same event filter, proves the
value was not low that day and clears an unconfirmed candidate as in rule 3;
on the date of an exact observation it makes that observation not low. Other
bounds are ignored. Details and examples:
[Bounds and endpoints](bounded-measurements.md#bounds-and-endpoints-2026-11-22).

Examples (G5, default interval): values below 15 on January 14 and May 13 and
a value of 15 or more on November 20 give a January crossing, May confirmation
and November recovery. Low on January 14, 15 or more on March 20, low on May
13 gives no event yet: March clears the January candidate and May starts a new
one.

Regression evidence: [endpoint tests](../../tests/core/endpoints/ckdEndpoints.test.ts)
and [method contract tests](../../tests/workspace/method-contract.test.tsx). No
dedicated regression test for rounding a fractional interval down, for an
interval longer than the maximum window, or for the non-promotion of
intermediate low values.

### Single value below 15, unconfirmed (2026-11-22)

A value below 15 that is not confirmed is never an observed G5 (decided
2026-11-22, `g5single`; KDIGO 2024 PP 1.1.3.2: chronicity is not assumed from
a single abnormal eGFR). This was already so: an observed G5 needs a second
low value after the minimum interval (see "Observed G4/G5"). Since 2026-11-22
such a value is also named. With `g5SingleUnconfirmed` the endpoint result
records whether the eligible rows hold an isolated low date while no G5 is
confirmed:

- The eligible rows (all of them, AKI windows included, as for observed G5)
  are grouped by timestamp, that is by calendar day. A date is low when every
  value of it is below 15 (strictly; 15 is not low), as in "Same date".
- An isolated low date is a low date whose neighbouring dates, the eligible
  date directly before and the one directly after it, are not low or do not
  exist. A last value below 15 with no later value is isolated.
- A conclusive bound, `>x` with x at or above 15 among the event-eligible
  bounds (the bounds that clear a G5 candidate, see "Observed G4/G5"), counts
  as a date that is not low: on a date without exact values it is a date of
  its own, on the date of exact values it makes that date not low (merge of
  issues #73 and #82, 2026-11-22). Other bounds are ignored. Example: 12 on
  2021-01-15, `>20` on 2021-02-15 and 13 on 2021-03-15 under the 90-day
  interval: the bound clears the January candidate, so no G5 is confirmed, and
  both low dates are isolated, so the flag is `yes`. Without the bound the two
  low dates are neighbours and no flag is set (OD-41). Bounds never interrupt
  a 40 %, 50 % or 57 % decline candidate (OD-62).

  **Open decision OD-71.** That a conclusive bound counts as a date that is
  not low was set during the merge of 2026-11-22, not by an owner decision:
  the decision `g5single` speaks of values, and the bound-reset rule names
  only G4/G5 candidates. Ignoring bounds here would leave the example above
  unflagged.
- The flag is set when at least one isolated low date exists and no G5 is
  confirmed by the column's rule. It is evaluated when observed G5 or the
  extrapolation is switched on (with only the extrapolation on, a confirmed
  G5 is evaluated for this purpose with the column's interval, as for the
  projection); otherwise it is `null` and its export column is empty.

The table cell and the patient view show it as the endpoint badge
`single value <15, unconfirmed (possible AKI)`, with the detail that it is not
an observed CKD G5 and can reflect an acute kidney injury. The cohort sheet
gains the column `endpoint_g5_single_value_unconfirmed` (`yes`, otherwise
empty), the last column before `group`. The flag does not withhold the
extrapolation: no withheld reason reads it. A low value enters the endpoint
fit like any other eligible value, so it can still change the slope and its
interval.

Example: eGFR 40, 36, 12, 33 and 29 on 2020-01-15, 2021-01-15, 2021-06-01,
2022-01-15 and 2023-01-15. 12 is a low date between two dates that are not
low, so the flag is `yes` and observed G5 is not met. The extrapolation is not
withheld by it; it is withheld here by its own rule, because the value 12 widens
the slope interval to [-19.97, 13.68], which includes zero
(`slope_ci_includes_zero`).

Open decision OD-41: the decision names "a single value below 15". Two or more
neighbouring low dates that are not (yet) confirmed, for example 12 and 13
four weeks apart under the 90-day interval, are not flagged and have no label
of their own; the cell then shows neither `CKD G5` nor the label. The
conservative reading of "single" was implemented.

Regression evidence: [endpoint tests](../../tests/core/endpoints/ckdEndpoints.test.ts)
and [endpoint decision tests of 2026-11-22](../../tests/workspace/endpoint-decisions-20261122.test.tsx).

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

The two outputs use the same sign (owner decision 2026-11-16). The workbook
column `endpoint_percent_change` holds the change, `-decline`, unrounded:
negative for a fall, positive for a rise. The table badge shows the same
change rounded to a whole percent with an explicit plus sign for a rise, and
its detail text gives one decimal. First 50 and latest 30 export `-40` and
display `-40%`; first 40 and latest 50 export `25` and display `+25%`. The
column is a total, not a slope and not the confirmed 40 % or 57 % decline
event. The badge is not shown with fewer than two eligible rows or fewer than
two displayed points, where first and latest coincide; the export keeps the
computed 0. Until 2026-11-16 the column was named `endpoint_percent_decline`
and held `decline` (positive for a fall); it kept its position. The result
field of the core, `percentDecline.value`, is still the decline.

**Confirmed 40 % and 57 % decline.** These are separate observed events. The
57 % boundary serves as a serum-creatinine doubling surrogate.

- Baseline (window confirmed by the owner on 2026-10-07): the arithmetic mean of all eligible rows from
  the first eligible UTC date through 90 elapsed UTC calendar days, inclusive
  of the whole final day. Duplicate rows each contribute. One row suffices.
  When the column excludes AKI windows, the baseline is formed only from
  eligible rows outside them, and its 90 days run from the first such row
  (since 2026-11-05; see Example 2 under "Which measurements"). Without such
  a row there is no baseline and no decline event.
- The rows after the baseline window that can start, confirm or recover an
  event are all eligible rows, AKI windows included.
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

**Confirmed 50 % decline (since 2026-11-22, issue #82, `p50`).** A third
boundary, 50 %, is evaluated by exactly the same rule: one function
(`observeDecline` in `computeCkdEndpoints`) takes the boundary as its
parameter and is called with 40, 50 and 57; baseline, the start after the
baseline window, inclusive boundary with the 1e-12 tolerance, candidate,
interval, 12-month maximum, same-date and recovery rules are shared. It is
evaluated only when both "Percent eGFR decline" and "Also confirmed 50%
decline" (`observedDecline50`) are on; the second box is disabled while the
first is off, and a stored `observedDecline50` without percent decline is not
evaluated (Open decision OD-44). It is off in every preset. Its badge is
`50% decline`, its columns `endpoint_observed_decline_50` and
`endpoint_decline_50_*` (first, confirmed and recovery date, then the three
values) come after all earlier columns, before `group`, and `fit_config`
records the setting as `observedDecline50` after `projectedAgeToCkdG5`; a
column that never set it writes no key, so older `fit_config` texts are
unchanged.

Example: eGFR 60 (2020-01-15), 58 (2020-03-01), 31 (2021-01-15), 29
(2021-06-01), 27 (2021-09-01) and 24 (2022-03-01). The baseline is the mean of
the first two (day 46 is inside the 90 days): 59. The declines are 47.5 %,
50.8 %, 54.2 % and 59.3 %. 40 %: candidate 2021-01-15 (31), confirmed
2021-06-01 (29, 137 days later). 50 %: 31 is not a 50 % decline, so the
candidate is 2021-06-01 (29), confirmed 2021-09-01 (27, 92 days later). 57 %:
only 24 crosses, with no later value, so it is not met. Badges:
`-60%, 40% decline, 50% decline`.

A paediatric preset with the 50 % decline as its default decline endpoint, as
the decision `p50` foresees, is not built. Open decision OD-40: the app has no
paediatric preset, and the presets of the fit settings do not choose the eGFR
equation, which the paediatric work of issue #66 changes in a separate
package; a preset that differed from CKD progression only in the 50 % box
would suggest a paediatric method it is not. The conservative option was
taken: no new preset; the 50 % decline is switched on by hand.

Regression evidence: [endpoint tests](../../tests/core/endpoints/ckdEndpoints.test.ts),
[badge tests](../../tests/workspace/labels/qualityLabels.test.ts),
[method contract tests](../../tests/workspace/method-contract.test.tsx) and the
[decision tests of 2026-11-05](../../tests/core/endpoints/decisions20261105.test.ts)
for the baseline after an AKI window. No
dedicated regression test for the unavailable total change at a non-positive
first value or for the opposite signs of badge and export.

### Individual G5 projection

The projection reports the age at which the patient's fitted line reaches
15 mL/min/1.73 m². It is the intersection of a straight line with a boundary,
conditional on the fitted trend continuing unchanged. It is not a prognosis,
an expected event time or a probability, and its uncertainty in time is not
estimated. Only an age is produced, not a calendar date.

Since 2026-11-22 (decision `proj`, issue #81) it is off by default and
switched on per parameter, and the interface calls it a "conditional
extrapolation of the fitted trend, not a prognosis": the settings label
"Extrapolation to CKD G5 (off by default)" with that sentence below it, the
badge detail ("Conditional extrapolation of the fitted trend, not a
prognosis: the fitted line reaches CKD G5 at about N years of age …"), the
analysis record ("Extrapolation to CKD G5") and the `columns` and `about`
sheets. The badge label (`G5 @ ~66y`) and the export column names
(`endpoint_projected_age_to_ckd_g5`, `endpoint_prediction_*`) are unchanged,
so scripts that read them keep working. The basis of the decision: KDIGO 2024
recommends an externally validated risk equation for the absolute risk of
kidney failure (Rec 2.2.1) and endorses no extrapolation of an individual
slope. The methodology section moved from `#methods/endpoints/prediction` to
`#methods/endpoints/extrapolation` (heading id `methods-extrapolation`); the
old address opens the same section.

**Fit.** The projection fits the endpoint-eligible rows, without display-fit
censoring options or time balancing. It therefore includes recovery after an
acute dialysis interval and nothing from kidney replacement therapy on. When
the column excludes AKI windows, the rows inside them are not fitted and do
not count towards the minimum dates, the span or the latest row (since
2026-11-05; before, the endpoint fit kept them; see "Which measurements").
Whether G5 was already observed, which withholds the projection, is decided on
all eligible rows. The estimator follows the column's fit model:

| Column fit model | Endpoint fit |
| --- | --- |
| OLS, rolling OLS, segmented OLS | Global OLS over all eligible rows (`fitGlobal`). |
| Theil-Sen | Theil-Sen over all eligible rows (`fitTheilSen`; see "Theil-Sen"). |
| No fit | No endpoint fit; the projection is withheld. |

Time is elapsed UTC milliseconds since the first eligible row divided by
365.25 days per year, and the intercept refers to that first row. Display
slopes and their confidence bounds can differ from the endpoint fit, because
the display fit can use other rows. Once kidney failure is reached, no
endpoint fit is run, so no counterfactual projection for the time before
kidney replacement therapy exists (confirmed by the owner on 2026-10-08).

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

The table badge shows the projected age rounded to a whole number and marked
as approximate on either basis (`G5 @ ~66y`; decided 2026-11-16, because the
projection has no interval; until then a birth-date basis showed one decimal,
`G5 @ 66.3y`). `Math.round` is used, so 63.5 shows as `~64y`. On a whole-year
basis the tooltip states that the age was counted from the age in completed
years and can be up to one year higher; on a birth-date basis it states that
the projection has no interval and that the export holds the unrounded value.
The export carries the unrounded value in both cases and the basis in
`endpoint_prediction_age_basis`. The 20-year horizon is measured from the same
age and is unaffected by the basis.

**Minimum data.** Eligible rows on at least three distinct UTC calendar dates
are required (`MIN_PROJECTION_DATES`), and on at least five with the Theil-Sen
fit model (`MIN_THEIL_SEN_PROJECTION_DATES`). Both count dates, not rows
(decided 2026-11-05, issue #34; until then three rows sufficed for either
model, wherever they lay). Rows on one date still all enter the fit.

- Distinct dates. 40, 40.2 and 39.8 on 2020-01-01 and 30 on 2021-01-01 under
  OLS were projected before: slope -9.98 per year, bounds [-10.97, -8.99] and,
  with a birth date of 1960-01-01, `G5 @ 62.5y`. They are two dates and are
  now withheld as `insufficient_points`.
- Theil-Sen. With n observations on distinct dates and n up to 5, the 95 %
  rank bounds of "Theil-Sen" select the lowest and the highest pairwise slope.
  That range misses the true slope only when the residuals happen to be
  ordered like the dates, increasing or decreasing, so for independent errors
  without ties it covers the true slope with probability 1 - 2/n!: 66.7 % for
  n = 3, 91.7 % for n = 4 and 98.3 % for n = 5. Below five dates the "95 %"
  bounds are therefore not a 95 % interval, and the confidence gate passes
  every monotone series. 40, 39 and 30 on 2020-01-01, 2021-01-01 and
  2022-01-01 have pairwise slopes -1.00, -5.00 and -9.01 per year; the bounds
  were [-9.01, -1.00] and `G5 @ 65.8y` was reported, while OLS withholds the
  same series (bounds include zero). Now Theil-Sen withholds it as
  `theil_sen_insufficient_points`. Five rows on four dates are withheld in
  the same way. The estimator and its bounds are unchanged; only the
  projection gate moved.

**KDIGO minimum (since 2026-11-22, decision `minfu`).** After the date and
span minimums of this section, the projection additionally needs at least
four eligible rows on distinct dates (`KDIGO_PROJECTION_MIN_DATES`) over at
least three years, after KDIGO 2012 CKD, rationale to Rec 2.1.3, p. 66
(extrapolating the previous rate of change "required substantial information
(≥4 measurements over ≥3 years in most cases)"). The rows are those of the
projection fit (outside the AKI windows when the column excludes them), the
dates are counted as distinct UTC calendar days as above, and three years are
36 UTC calendar months (`KDIGO_PROJECTION_MIN_MONTHS`): the latest row's day
must be on or after the first row's day plus 36 months, with the month
addition of the maximum confirmation window (clamped at the month's end, so
2020-02-29 plus 36 months is 2023-02-28). Otherwise the projection is withheld
as `kdigo_minimum_follow_up` (badge `G5 < 4 dates/3 yrs`). Theil-Sen keeps its
five dates, which are checked first. Open decision OD-42: KDIGO speaks of
"measurements"; counting distinct dates rather than rows, and calendar months
rather than 3 × 365.25 days (1095.75 days), are this implementation's
reading.

- Three dates over three years. 40, 33 and 26 on 2020-01-15, 2021-07-15 and
  2023-01-15 have the OLS slope -4.666 per year with bounds [-4.728, -4.603];
  until 2026-11-22 they gave, with a birth date of 1960-01-01, a projected age
  of 65.40. Now they are withheld as `kdigo_minimum_follow_up`.
- Four dates over two years. 40, 36, 33 and 29 on 2020-01-15, 2020-09-15,
  2021-05-15 and 2022-01-15 are withheld the same way.
- Four dates over exactly three years. 40, 36, 33 and 29 on 15 January of
  2020 to 2023 are reported (bounds [-4.205, -2.994], projected age 66.96 with
  that birth date). With the last value on 2023-01-14, one day short of 36
  months, they are withheld.

The follow-up between the first and latest eligible rows
must be at least 365 days (`MIN_PROJECTION_SPAN_DAYS`), the same number as the
minimum fitted span of the slope reliability rule (decided 2026-10-07,
formerly OD-17; before, 365.25 days were required and one calendar year
without a leap day was withheld). The two rules still look at different rows:
endpoint-eligible rows here, fitted rows there. 2021-01-01, 2021-07-01,
2022-01-01 (365 days) passes this gate (and is then withheld by the KDIGO
minimum, `kdigo_minimum_follow_up`; until 2026-11-22 it was projected);
2021-01-01, 2021-07-01, 2021-12-31 (364 days) is withheld as `span_too_short`. The conversion of elapsed time to years
for the fit and the crossing is unchanged at 365.25 days per year.

**Confidence gate.** A crossing is reported only when both slope confidence
bounds of the endpoint fit are finite, ordered (low not above high) and the
interval does not contain zero (`low <= 0 and high >= 0` withholds). Because
the endpoint fit's slope is already negative and lies inside its own interval,
this means both bounds are strictly below zero. An interval touching or
straddling zero withholds the crossing. For OLS the
bounds are the two-sided 95 % Student-t interval `b ± t(0.975, n-2) * SE(b)`
with `SE(b) = sqrt(SSR / (n-2) / Sxx)`; the t quantile comes from a table of exact
values for 1 to 40 degrees of freedom and is computed exactly above that
(since 2026-11-22, OD-11; before, a stepwise table and 1.959963985 above 120
degrees of freedom; see "95 % confidence interval for the slope" in
[trend estimators](trend-estimators.md#95--confidence-interval-for-the-slope)). For Theil-Sen the bounds are the 95 % rank bounds of the
"Theil-Sen" section. These are slope bounds, not prediction intervals. The
level is not configurable.

Decided 2026-10-07 (formerly OD-4): the three-measurement minimum and the confidence gate stay. With three points the OLS 95 % interval uses t(1) = 12.706, so three measurements almost never yield a projection; the methodology page says so and shows the withheld example (60, 50, 25) beside one that is reported. That statement holds for OLS only: with three dates the Theil-Sen bounds pass every monotone series, which is why Theil-Sen needs five dates since 2026-11-05 (see "Minimum data"). The methodology page does not say so yet. Since 2026-11-22 the KDIGO minimum withholds every projection from three dates, whatever the interval.

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
| 3 | `insufficient_points` | Eligible rows on fewer than three distinct dates. | `G5 < 3 dates` |
| 4 | `theil_sen_insufficient_points` | Fit model Theil-Sen and eligible rows on three or four distinct dates (since 2026-11-05). | `G5 < 5 dates` |
| 5 | `span_too_short` | First to latest eligible row under 365 days. | `G5 < 1 yr` |
| 6 | `kdigo_minimum_follow_up` | Fewer than four distinct dates, or the latest row before the first row plus 36 calendar months (since 2026-11-22). | `G5 < 4 dates/3 yrs` |
| 7 | `no_fit` | Slope or intercept of the endpoint fit not finite; with four dates over three years this means fit model "No fit". | `G5 no fit` |
| 8 | `non_declining_fit` | Slope zero or positive. | `G5 not projected` |
| 9 | `already_below_threshold` | The fitted line reaches 15 at or before the latest eligible row (`t <= span`). | `G5 now` |
| 10 | `missing_age` | The latest eligible row has no age (see "Age at the latest eligible row"). | `G5 no age` |
| 11 | `slope_ci_unavailable` | A slope bound is missing or not finite, or the bounds are inverted. | `G5 not projected` |
| 12 | `slope_ci_includes_zero` | Lower bound at or below zero and upper bound at or above zero. | `G5 not projected` |
| 13 | `beyond_projection_horizon` | Crossing more than 20 years after the latest eligible row. | `G5 not projected` |

A table cell without any measurement of its parameter shows no `G5 < 3 dates`
badge (since 2026-10-12): the cell already reads "No numeric measurements with
a date". The reason code is unchanged, and the export still carries
`insufficient_points` for that patient and parameter. Other badges of the
cell, such as `Kidney failure reached`, are still shown.

Reasons 3 to 6 count the rows of the projection fit, which leave out the
column's AKI exclusion windows when it excludes them. The badge detail says so
(since 2026-11-15) when a window actually removed a row of this cell, that is
when the projection used fewer points than the endpoint input holds
(`projectionPointCount < endpointPointCount`). It then starts with
"Measurements inside AKI exclusion windows are left out of the projection."
and continues "The measurements used fall on fewer than three distinct dates,
…" or "The measurements used span less than one year, …"; the Theil-Sen text
follows the same first sentence. The same lead precedes two further details,
which then name "the latest measurement used": "The fitted crossing is more
than 20 years after the latest measurement used, …" (`G5 not projected`) and
"The fitted curve reaches 15 at or before the latest measurement used, …"
(`G5 now`), because both are measured from the last row outside the AKI
windows. When no row was removed, also in a column that excludes AKI windows
by its preset, the details read as before: "Usable measurements on fewer than
three distinct dates, …", "Less than one year between first and last
measurement, …", "… after the latest eligible eGFR measurement, …" and "… at
or before the latest measurement, …". Example: a CKD-progression column with
two eGFR values and no AKI episode shows `G5 < 3 dates` with the plain
detail. Labels, reason codes and export values are the same in all cases. Example: 104 eGFR values of 40 and
38 over two years with creatinine 4.5 and 4.85 mg/dl on consecutive days every
two weeks leave one row outside the AKI windows; the badge is `G5 < 3 dates`
with the AKI sentence. The first sentence states the column's rule and appears
whether or not a window removed a row of that patient.

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
[-72.519, 37.519], which include zero. Since 2026-11-22 these three dates over
two years are withheld earlier, as `kdigo_minimum_follow_up`; until then the reason was
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
  62.623 + 3.68457 = 66.307; the badge shows `G5 @ ~66y` and the export
  holds 66.307.
- Projected age without a birth date (the file states only ages 57 to 62):
  62 + 3.68457 = 65.68457; the badge shows `G5 @ ~66y`.
- With Theil-Sen selected: slope -3.8005, intercept 48, bounds
  [-4.0027, -3.0021], crossing 3.68371 years after the latest row.

Regression evidence: [endpoint tests](../../tests/core/endpoints/ckdEndpoints.test.ts),
[cohort cell tests](../../tests/core/cohort/screening.test.ts),
[export tests](../../tests/core/cohort/exportRecords.test.ts),
[label tests](../../tests/workspace/labels/qualityLabels.test.ts) and
[method contract tests](../../tests/workspace/method-contract.test.tsx). The
endpoint tests supply slope bounds directly rather than from a fit. The
[decision tests](../../tests/core/endpoints/decisions20261007.test.ts) cover the
two age bases, the 364-day versus 365-day span boundary, the projection with
the observed-G5 toggle off and the 365-day limit of the confirmation
interval. The [decision tests of 2026-11-05](../../tests/core/endpoints/decisions20261105.test.ts)
cover the AKI-window exclusion (Examples 1 to 3 under "Which measurements"),
the distinct-date minimum and the five-date Theil-Sen minimum with the
examples above. No dedicated regression test for the age of an earlier row carried
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
| `endpoint_percent_change` | Percent decline enabled, at least one eligible row, first value above zero. | Total change in percent from the first to the latest eligible value, negative for a fall, unrounded. Not a rate per year and not the confirmed 40 %/57 % decline event. |
| `endpoint_observed_ckd_g5` | Observed G5 confirmed. | `yes` |
| `endpoint_projected_age_to_ckd_g5` | A projection is reported. | Age in years, unrounded. |
| `endpoint_observed_ckd_g4` | Observed G4 confirmed. | `yes` |
| `endpoint_confirmation_days` | G4, G5, percent decline or the projection enabled. | Effective minimum interval in days, at most 365. |
| `endpoint_input_policy` | Any endpoint enabled. | Fixed text: "dated exact numeric measurements before first kidney transplant/chronic dialysis; dated acute dialysis intervals excluded (inclusive); values dated after a death excluded; bounds excluded" (the clause on death since 2026-11-22, issue #78), followed by "; AKI exclusion windows excluded from decline baseline and projection" when the column excludes AKI windows (since 2026-11-05). |
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
| `endpoint_observed_decline_50` (since 2026-11-22) | 50 % decline switched on and confirmed. | `yes` |
| `endpoint_decline_50_*` (same six, same order, since 2026-11-22) | As for G4. | Dates and eGFR values of the confirmed 50 % decline. |
| `endpoint_g5_single_value_unconfirmed` (since 2026-11-22) | Observed G5 or the projection enabled, no G5 confirmed, an isolated date with only values below 15. | `yes`; see "Single value below 15, unconfirmed". |

The three 2026-11-22 entries are the last columns before `group`, which stays
the last column of the sheet; every earlier column keeps its position. With
the extrapolation off, the default since 2026-11-22, the columns of the
projection (`endpoint_projected_age_to_ckd_g5`, `endpoint_prediction_*`) stay
in place and are empty, and `fit_config` on the `settings` sheet shows
`projectedAgeToCkdG5: false`.

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

The `about` sheet of the trajectories workbook states that
`endpoint_percent_change` is the total change with the badge's sign (negative
for a fall, positive for a rise), neither a yearly rate nor the confirmed
decline event, and that only eGFR series whose name ends in ", computed)", for example
"eGFR (CKD-EPI 2021, computed)", are calculated by the app (since 2026-11-16; before,
it said that eGFR is computed from creatinine, also for imported eGFR). It
also states that observed G4 below 30 and G5 below 15 use dated
exact numeric eGFR before the first kidney transplant or chronic dialysis and
outside complete acute dialysis intervals, that kidney replacement therapy
is reported separately, that the decline baseline and the individual
projection also leave out the AKI exclusion windows when the column excludes
them from its fit while observed G4/G5, total change and decline events keep
those rows, and that the individual extrapolation to CKD G5 is a conditional
extrapolation of the fitted trend, not a prognosis, off by default and
recorded in `fit_config`, fits the same rows, needs at least four distinct
measurement dates over at least three years (five dates for Theil-Sen), and
has slope bounds that are not prediction intervals (until 2026-11-22: "needs
at least three distinct measurement dates (five for Theil-Sen) over at least
365 days"; the row kept its position). A note appended at the end of the
sheet (2026-11-22) describes the 50 % decline columns, the unconfirmed single
value below 15 and the default of the extrapolation. The `events` sheet lists
the exported patients' events.

The export does not record:

- the length of the decline baseline window (90 days), the 40 % and 57 %
  definitions, or the candidate rules;
- the confidence level and method behind the OLS slope bounds (the `about`
  sheet names 95 % bounds for Theil-Sen only);
- the endpoint fit's slope and intercept; the `slope`, `intercept` and
  `slope_se` columns are those of the display fit;
- the number of endpoint-eligible rows; `n` counts raw rows and `n_fitted`
  the display fit;
- the age anchor used for the projected age, or that row ages are whole
  completed years;
- which measurements the event filter removed, and the same-date transplant
  tie rule;
- the G4/G5 thresholds as columns (they appear in the `about` text only).

Regression evidence: [export tests](../../tests/core/cohort/exportRecords.test.ts),
[workbook tests](../../tests/workspace/export.test.ts) and
[method contract tests](../../tests/workspace/method-contract.test.tsx).

These definitions intentionally replace the historical web rules. They are
owner-approved research definitions, not claims of clinical validation. The
owner confirmed the 12-month maximum confirmation window, the 90-day decline
baseline window and the 20-year projection horizon on 2026-10-07, and the
absence of a pre-KRT counterfactual projection on 2026-10-08. No default
remains marked as proposed. A projected crossing is a property of a
fitted line and must not be read or presented as a prognosis.

### Endpoint badges in the table (2026-11-22)

Which endpoint results the Trajectories table shows as badges is a view
setting (decided 2026-11-22, `badges`, issues #82 and #2): "Endpoint badges"
beside Cell details and Warnings, with one box each for total eGFR change,
kidney failure reached, CKD G4 (with its recovery), CKD G5 (with its
recovery), the single value below 15, the 40 %, 50 % and 57 % declines and
the extrapolation to CKD G5 (the age or the reason it is withheld). All are
on by default, which is the set shown before; a badge appears only for a
result that is evaluated and present, as before. A box switched off removes
that result from the badge label and from its detail text, and a cell
without any remaining result shows no endpoint badge. The setting changes no
computation: the export keeps every column and the row marks ("Endpoint
reached") are unchanged. It is saved with the view settings
(`hiddenEndpointBadges`, absent while every badge is shown) and listed in the
analysis record catalog as a setting without numeric effect. Open decision
OD-43: the choice applies to the table cells only; the patient view keeps
every badge, so that a hidden result is still found there.

Regression evidence: [endpoint decision tests of 2026-11-22](../../tests/workspace/endpoint-decisions-20261122.test.tsx).
