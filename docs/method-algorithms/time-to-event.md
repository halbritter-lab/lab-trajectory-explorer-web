# Method reference: Time to event

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only: the estimates describe a cohort; none is a prognosis for a patient.

## Time to event (2026-11-22)

Owner decisions `km`, `death` and `taxonomy` of 2026-11-22 (issue #78; see
[method decisions](../remaining-method-decisions.md#decisions-of-2026-11-22-decision-artifact-issues-2-4-6585)).
The Cohort models page has two areas, *Slope models* (the cohort mixed models)
and *Time to event*. The time-to-event area estimates the time to a confirmed
eGFR endpoint per group. It needs no R and runs on every change of its
settings. Code: `src/core/survival/survival.ts` (estimators),
`src/core/domains/nephrology/endpoints/timeToEvent.ts` (entry, exit and
status), `src/workspace/time-to-event.ts` (input, export, R script) and
`src/workspace/models/TimeToEventPanel.tsx` (the area).

Sources: Kaplan–Meier with left truncation on the age scale, Thiébaut ACM,
Bénichou J, Stat Med 2004;23:3803 (PMID 15580597) and Pencina MJ et al., Stat
Med 2007;26:1343 (PMID 16955538); competing risk of death, Noordzij M et al.,
NDT 2013;28:2670 (PMID 23975843).

### Settings

The settings are those of the area and last for the session; they are not
saved and are not part of the analysis record (like the grouping of the
slope models). Every one is written to the export.

| Setting | Values | Default |
| --- | --- | --- |
| Parameter | The parameters with an eGFR unit (`isEgfrUnit`) and at least one numeric value. | The first in import order. |
| Endpoint | Confirmed CKD G4, confirmed CKD G5, confirmed 40 %, 50 % or 57 % decline, kidney replacement therapy (KRT). Only the endpoints that the parameter's endpoint settings under Trajectories evaluate are offered: G4 and G5 with their own toggles, 40 % and 57 % with "Percent eGFR decline", 50 % with that and "Also confirmed 50% decline"; KRT always. | The first offered other than KRT; KRT when none is. |
| Or kidney replacement therapy, whichever comes first | On or off; disabled for the KRT endpoint. | Off. |
| Time scale | Age, with entry at the first eligible measurement (delayed entry); or years since the first eligible measurement. | Age (decision `km`). |
| Grouping | No grouping, or one attribute (sex from the lab rows, and the attributes table). | No grouping. |

The endpoint definition (thresholds, confirmation interval, 12-month
maximum, decline baseline) is not set here. The area shows it, read-only, as
the parameter's endpoint settings give it, with a button to Trajectories,
and writes the same text into the export (`endpoint_definition`). Example:
"CKD G4: eGFR below 30 mL/min/1.73 m², confirmed by a value at least 90 days
and at most 12 calendar months after the first crossing; the event is dated
at the first crossing". The per-patient results are the ones of the
Trajectories table: the area builds the parameter's cells with
`buildCohortRows` under the same settings, so the endpoint in the view is
the endpoint of the table.

### Entry, exit and status

Per patient, with dates as UTC calendar days:

- **Entry** `F`: the first eligible eGFR measurement (`first_eligible_date`
  of the table: exact, dated, before the first kidney transplant or chronic
  dialysis start, not after a death, outside dated acute dialysis
  intervals; see [which measurements](endpoints-and-projection.md#eligibility-and-kidney-failure-reached)).
  `L` is the last eligible measurement.
- **Event date** `E`: the first crossing (`firstDate`) of the confirmed lab
  endpoint (decided: first crossing, the ISN consensus of Levin 2020); for
  the KRT endpoint, or with the composite, the date of the first kidney
  transplant or chronic dialysis start (`kidneyFailureReached`) when that is
  earlier. The confirmation date is exported (`endpoint_confirmed_date`).
- **Death** `D`: the patient's earliest `death` event.

Rules, in order:

1. With a grouping, a patient without a value for the attribute is left out
   (`no_group_value`, OD-76).
2. Without an eligible measurement: left out as `endpoint_before_entry` when
   the endpoint uses KRT and the patient has a KRT date (KRT before every
   measurement removes them all), otherwise as `no_eligible_measurement`.
3. `E` on or before `F` (same day included): left out (`endpoint_before_entry`,
   decided "excluded and counted"). A G4 or G5 whose first crossing is the
   first eligible measurement is such a case (OD-76).
4. Without the KRT endpoint, a kidney transplant or chronic dialysis start on
   or before the death ends the observation of native kidney function: the
   patient is censored at `L`, a later death does not count (OD-74).
5. Otherwise a death before `E` (strictly earlier day), or without `E`, ends
   follow-up: exit `D`, status death (2) (OD-73). On the same day as `E` the
   endpoint counts.
6. Otherwise, with `E`: exit `E`, status 1 (outcome `endpoint`, or
   `kidney_replacement_therapy` when KRT came first).
7. Otherwise: censored at `L`, status 0.
8. Time on the scale, in whole days: on the age scale the days from the birth
   anchor to `F` and to the exit, each rounded to a whole day (a patient
   without a birth anchor, or with one after `F`, is left out as `no_age`);
   on the other scale entry 0 and exit the days from `F`. Years are days /
   365.25. The birth anchor is the birth date, or estimated from ages in
   completed years or a manual age; such ages can be up to a year off, the
   area says how many patients this concerns and the export marks them
   (`age_estimated`, OD-77).
9. Exit on or before entry (a single eligible date and no later event, or a
   death on the day of the first measurement): left out (`no_follow_up`).

Every patient left out is listed under "Patients not in the analysis (n)"
with the reason, and in the export with `included = no`.

### Estimators

A patient is at risk at time t when entry < t ≤ exit (the counting-process
convention of R `Surv(entry, exit, status)`); on the time since the first
measurement every entry is 0, so this is ordinary right censoring.

- **Kaplan–Meier.** At each distinct exit time t with d endpoint events among
  n at risk, S(t) = S(t−) · (1 − d/n). Patients who died (status 2) are
  censored. Greenwood: V(t) = Σ d / (n (n − d)) over the event times, the
  variance of log S; standard error S·√V. Pointwise 95 % interval on the
  log-log scale: S^exp(±1.959964 · √V / |log S|), the lower limit with +.
  At S = 1 both limits are 1; at S = 0 (n = d) they and the standard error
  are undefined (R `conf.type = "log-log"`).
- **Median and its interval** (Brookmeyer–Crowley on that interval): the
  first event time at which S, the lower limit or the upper limit is at or
  below 0.5 gives the median, its lower and its upper limit. When the curve is
  exactly 0.5 (within 1e-10) at that time, the midpoint between it and the
  next event time is taken, as R's `quantile.survfit` takes the middle of a
  flat stretch at 0.5; at the last event time that time itself (OD-78). A
  curve that stays above 0.5 gives "not reached".
- **Log-rank test** on the same risk sets: at each endpoint time t with d
  events among n at risk, n_g in group g: E_g += d n_g / n; V_gh += d (n − d) /
  (n − 1) · (n_g / n) · (δ_gh − n_h / n), nothing when n = 1. χ² = (O − E)'
  V⁻¹ (O − E) over the groups with V_gg > 1e-12 less the last of them, df =
  their number less one; p from the χ² distribution. Unadjusted; no test with
  fewer than two groups, or when fewer than two groups have positive variance
  (shown as "not computed").
- **Aalen–Johansen** (shown when any patient in the analysis has a recorded
  death): at each time with d1 endpoints and d2 deaths among n at risk, F1 +=
  S(t−) d1 / n, F2 += S(t−) d2 / n, S(t) = S(t−) (1 − (d1 + d2) / n). F1 is the
  cumulative incidence of the endpoint with death as the competing event,
  shown beside 1 − KM, which treats the patients who died as if they could
  still reach the endpoint and so overstates its risk. No interval for F1
  (OD-78). Kidney replacement therapy is not a competing event here (OD-74).
- **Number at risk** under the chart, at each axis tick τ (in years): entry <
  τ·365.25 ≤ exit; at τ = 0 on the time since the first measurement, every
  patient. The ticks are steps of 1, 2 or 5 × 10^k giving at most about eight.

The area shows per group: patients, events, censored (including those who
died), of which died, and the median in years with its interval; the
log-rank statistic with observed and expected events per group; the curves
(event-free probability, or with deaths the choice "Cumulative incidence:
1 − KM and Aalen–Johansen"), ticks for censored patients, and the tables of
the number at risk and, in the cumulative-incidence view, 1 − KM and
Aalen–Johansen at the ticks.

### Export

"Export time to event (XLSX)" writes a workbook of its own
(`lab-trajectory-time-to-event-<time>.xlsx`) rather than a sheet of the
model workbook, which exists only after an R fit, or of the cohort workbook
of Trajectories, which does not know the settings of this area (OD-75). The
first sheet holds one row per patient; the others follow:

| Sheet | Contents |
| --- | --- |
| `time_to_event` | `patient_id`, `group`, `included` (yes/no), `exclusion_reason`, `entry_date`, `exit_date`, `entry_years`, `exit_years`, `entry_days`, `exit_days`, `status` (0, 1, 2), `outcome` (`endpoint`, `kidney_replacement_therapy`, `death`, `censored`), `endpoint_confirmed_date`, `time_scale` (`age`, `time_since_entry`), `age_estimated`, `endpoint_definition`, `parameter`. |
| `km` | Per group and exit time: `time_years`, `time_days`, `n_risk`, `n_event`, `n_censor`, `n_death`, `survival`, `std_err`, `lower_95`, `upper_95`. |
| `km_summary` | Per group: patients, events, censored, of which died, median and its interval in years ("not reached"). |
| `logrank` | Per group observed, expected and variance; a row `test` with `chi_square`, `df`, `p_value`. |
| `cumulative_incidence` | Only with recorded deaths: per group and time, the Aalen–Johansen incidence of the endpoint and of death and 1 − KM. |
| `about` | The research-use note, the endpoint and its definition, the time scale and these rules. |
| `r_script` | R code that reads `time_to_event` and reproduces the estimates (below). |

The chart downloads as SVG or PNG through the app's chart export, with the
definition and the time scale in its caption.

### R reproduction

`r_script` reads `time_to_event` (all columns as text), keeps `included =
yes` and computes `entry = entry_days / 365.25`, `exit = exit_days / 365.25`:

- `survfit(Surv(entry, exit, status == 1) ~ group, conf.type = "log-log")`
  (`~ 1` without grouping), `summary()` and `print()` for the median;
- a function `logrank_lt` that computes the log-rank test on the
  delayed-entry risk sets as above, because `survdiff` accepts right-censored
  data only; on the time since the first measurement also
  `survdiff(Surv(exit, status == 1) ~ group)`, which must agree;
- with deaths, `survfit(Surv(entry, exit, state) ~ group, id = patient_id)`
  with `state` the factor of `status` (censored, endpoint, death), the
  Aalen–Johansen estimate of the multi-state `survfit`.

The comparison of the app's numbers with R `survival` on stored cases is
**pending issue #79** (native R is not installed in the build environment).
Until then the tests compare with values computed by hand from the
definitions above (product limit, Greenwood, log-log, log-rank O/E/V,
Aalen–Johansen), including a case with delayed entry and one with tied
events.

### Recomputed examples

Estimators (`tests/core/survival/survival.test.ts`):

- Exits 2 (event), 3 (censored), 5, 7 (events), 8 (censored), entry 0: S =
  0.8, 0.8, 0.5333, 0.2667, 0.2667; Greenwood at 5: 1/20 + 1/6 = 0.21667;
  log-log interval at 5: 0.0683 to 0.8631; median 7, lower limit 2 (the lower
  curve is 0.2038 at 2), upper limit not reached.
- Delayed entry (entry, exit, status) = (0,4,1), (2,5,0), (3,6,1), (1,3,1),
  (5,8,1): at t = 3 three at risk (the patient entering at 3 is not), S =
  2/3; t = 4: S = 4/9; t = 6: two at risk, S = 2/9; t = 8: S = 0; median 4.
- Log-rank, A: events at 1 and 3, censored at 4; B: events at 2 and 5,
  censored at 6: O_A = 2, E_A = 0.5 + 0.4 + 0.5 = 1.4, V = 0.25 + 0.24 + 0.25 =
  0.74, χ² = 0.36 / 0.74 = 0.4865, 1 df, p = 0.4855. Two events at one time
  among 2 + 2: V = 2·2/3 · 1/4 = 1/3.
- Aalen–Johansen, exits 1 (endpoint), 2 (death), 3 (endpoint), 4
  (censored), 5 (death): F1 = 0.2, 0.2, 0.4, 0.4; F2 ends at 0.6; 1 − KM at 3
  is 0.4667.

Patients (`tests/workspace/time-to-event.test.tsx`), eGFR in mL/min/1.73 m²,
born 1970-01-01 unless stated, CKD G4 switched on, 90-day confirmation:

| Patient | Data | Time since the first measurement | Age scale |
| --- | --- | --- | --- |
| P1 | 50, 45, 28, 25 on 2019-01-01, 2020-01-01, 2021-01-01, 2021-06-01 | G4 from 2021-01-01 (confirmed 2021-06-01): exit 731 days, status 1 | entry 17897, exit 18628 days of age |
| P2 | 60, 55, 50 on 2019-01-01 to 2021-01-01, born 1960-01-01; death 2021-06-01 | exit 882, status 2 | 21550 to 22432 |
| P3 | 40, 35 on 2019-01-01, 2020-01-01; transplant 2020-06-01; 33 on 2021-01-01 | censored at 365 (the transplant ends observation); with the composite or the KRT endpoint, event at 517 | |
| P4 | 25, 24 on 2019-01-01, 2019-06-01 | left out: G4 at entry | |
| P5 | 70 on 2019-01-01 | left out: no follow-up | |
| P6 | 70 on 2019-01-01, 68 on 2020-06-01; death 2020-01-01 (import warning `values_after_death`) | exit 365 (the later value is not eligible), status 2 | |

Kaplan–Meier, whole cohort, time since the first measurement: at 365 days 4
at risk, 2 censored (P3, P6); at 731 days 2 at risk, 1 event, S = 0.5; at 882
days the death of P2 is censored. The median is 731 days (2.0 years): the
curve is exactly 0.5 at its last event time. Aalen–Johansen: death
incidence 0.25 at 365, endpoint incidence 0.75 · 1/2 = 0.375 at 731 (1 − KM:
0.5), death incidence 0.625 at 882. On the age scale only P1 is at risk at
18628 days (P3 and P6 left at 18262, P2 enters at 21550), so S falls to 0.
Grouped by cohort (A: P1, P2; B: P3, P4, P6; P5 has none): P4 and P5 are
listed (G4 at entry; no value for cohort), A has 2 patients and 1 event, B 2
and 0; the one event time has nobody of B at risk, so the variance is 0 and
the log-rank test is not computed.

Regression evidence: [estimator tests](../../tests/core/survival/survival.test.ts),
[time-to-event tests](../../tests/workspace/time-to-event.test.tsx) (rules,
export sheets and R script, the area on the page) and the
[death import tests](../../tests/core/events/events.test.ts). No test pins the
number-at-risk ticks of the chart beyond the three values of the example, or
the PNG download (jsdom has no canvas).

### Open decisions

- **Open decision OD-73.** A death ends follow-up at its date even when it
  lies long after the last eligible measurement; the time between counts as
  event-free, although an endpoint could have occurred unobserved. The
  alternative is to censor at the last measurement (and to count the death as
  competing only within a time limit).
- **Open decision OD-74.** Without the KRT endpoint, kidney replacement
  therapy censors at the last eligible measurement, and a death after it is
  not counted; KRT is never a competing event in the Aalen–Johansen estimate.
- **Open decision OD-75.** The export is a workbook of its own, not a new last
  sheet of the model workbook or of the cohort workbook (both named in the
  task): the model workbook exists only after an R fit, and the cohort
  workbook of Trajectories does not know this area's settings.
- **Open decision OD-76.** A first crossing on the first eligible date counts
  as "at or before entry" and leaves the patient out; patients without a
  value of the grouping attribute are left out rather than forming a group
  "(ungrouped)".
- **Open decision OD-77.** Ages on the age scale come from the birth anchor
  and are rounded to whole days; an anchor estimated from ages in completed
  years can shift entry and exit by up to a year, which is stated but not
  corrected.
- **Open decision OD-78.** The median at exactly 0.5 takes the midpoint to the
  next event time, at the last event time that time; the same rule gives the
  interval limits. The Aalen–Johansen estimate has no interval. The log-rank
  test drops groups without variance (a generalised inverse). These details
  are to be checked against R `survival` when the comparison of issue #79
  runs.
- **Open decision OD-79.** Values dated after a death are left out of endpoint
  input and the time-to-event analysis but stay in tables, charts and fits,
  with an import warning; the death vocabulary is four words (`death`,
  `deceased`, `Tod`, `verstorben`). The settings of the area are not saved
  and not part of the analysis record of the cohort workbook.

### Not built

The entry point from the endpoint column of the Trajectories table (issue #78,
"Place in the user flow") is not built; the area is reached from the Cohort
models page. The statement that projections are conditional on survival
(decision `death`) is drafted for the methodology page (Part TTE of the
[wording drafts](../methodology-wording-drafts.md)), not applied.
