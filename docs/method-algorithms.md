# Implemented method algorithms

This reference records what the application computes today: every rule that
decides which data are analysed, how a number is derived from them, and how a
result is classified. It describes implemented behaviour, including behaviour
that is questionable; it does not describe intended behaviour. Approved
requirements and the reasons behind them are tracked in
[method decisions](remaining-method-decisions.md).

All of it is for research use. No rule here is a claim of clinical validation,
and no projected value is a prognosis.

## How to read this reference

- **Completeness.** A rule that affects a result belongs here with its concrete
  values, units, boundary conventions (inclusive or exclusive, strict or
  non-strict) and a worked example where the arithmetic is not obvious. A
  change to a rule updates its topic file in the same change; see `CLAUDE.md`.
- **Regression evidence.** Each section, or each subsection of the larger ones,
  names the tests that pin its rules and, where they were identified, the rules
  that no test pins. The sections carried over from earlier versions (Bounded
  measurements, Theil-Sen) and the export-provenance subsection name their
  tests only.
- **Open decisions.** Where implemented behaviour conflicts with user-facing
  documentation or looks unintended, the behaviour is described as it is and a
  marker **Open decision OD-n** follows. Nothing marked this way has been
  changed; each needs an owner decision to change either the code or the
  description. The [list of open decisions](#open-decisions) collects them.
- **Known limitations.** Behaviour the owner has decided not to change for now
  is documented as a limitation, without a marker.
- **Not reachable.** Code that exists only for tests is listed separately and
  is not part of the method description.

Conventions used throughout:

- **Dates are calendar days.** Import keeps the calendar day as written and
  stores it at midnight UTC. Measurements of one day share one timestamp, and
  every elapsed-time rule works in whole days. A time of day on a lab date is
  kept beside the date and used for ordering only: it orders the creatinine
  values of one day in AKI detection, chooses the latest of several values
  of the baseline day in the peri-event creatinine analysis (and, for
  display, orders the rows of one day in the measurement table); it is
  exported as `time_of_day`. Event dates carry no time of day.
- **A year is 365.25 days** wherever elapsed time is converted to years.
- **A series** is one patient, one parameter name and one unit, compared as
  stored after import. Different names or units are never pooled
  automatically; a merge chosen by the user adds a separate derived series and
  keeps its sources (since 2026-11-22; see
  [series comparison and merge](method-algorithms/series-comparison-and-merge.md#series-comparison-and-deliberate-merge-2026-11-22)).
- **An exact measurement** is a dated numeric row whose operator is `=`.
  Bounded rows (`<x`, `>x`) are shown and counted as raw rows. They enter a
  column's individual fits and lines as its bounded-value setting says (at the
  limit by default since 2026-11-22), but no endpoint, AKI detection or cohort
  model; a conclusive bound only interrupts a G4/G5 candidate. A bounded creatinine row still
  yields a derived eGFR bound, and its sex and stated age still feed
  demographics resolution; see
  [bounded measurements](method-algorithms/bounded-measurements.md#bounded-measurements-2026-10-06).

Since 2026-11-14 the rules are in topic files under
[`method-algorithms/`](method-algorithms/); this index keeps the reading
conventions, the contents and the decision lists. The split moved text only.

Contents:

1. [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation)
    - [Series comparison and deliberate merge](method-algorithms/series-comparison-and-merge.md#series-comparison-and-deliberate-merge-2026-11-22)
2. [Demographics resolution](method-algorithms/demographics.md#demographics-resolution)
3. [Bounded measurements](method-algorithms/bounded-measurements.md#bounded-measurements-2026-10-06)
    - [Bounded values in individual fits](method-algorithms/bounded-measurements.md#bounded-values-in-individual-fits-2026-11-22)
      and [bounds and endpoints](method-algorithms/bounded-measurements.md#bounds-and-endpoints-2026-11-22)
4. [Fit pipeline and fit-input selection](method-algorithms/fit-input-presets-and-time-balancing.md#fit-pipeline-and-fit-input-selection)
5. [Fit presets](method-algorithms/fit-input-presets-and-time-balancing.md#fit-presets)
6. [Time balancing](method-algorithms/fit-input-presets-and-time-balancing.md#time-balancing)
7. [Ordinary least squares](method-algorithms/trend-estimators.md#ordinary-least-squares)
8. [Theil-Sen](method-algorithms/trend-estimators.md#theil-sen-2026-09-23)
9. [Rolling and segmented OLS](method-algorithms/trend-estimators.md#rolling-and-segmented-ols)
    - [Before/after comparison at an anchor event](method-algorithms/anchor-comparison.md#beforeafter-comparison-at-an-anchor-event-2026-11-22)
      and the [time axis "Years since event"](method-algorithms/anchor-comparison.md#time-axis-years-since-event-k16-2026-11-22)
    - [Logarithmic value axis and doubling time](method-algorithms/log-scale-and-doubling-time.md#logarithmic-value-axis-and-doubling-time-2026-11-22)
10. [Reason codes and the slope reliability rule](method-algorithms/slope-quality.md#reason-codes-and-the-slope-reliability-rule)
    - [Slope tier](method-algorithms/slope-quality.md#slope-tier)
11. [Rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag)
    - [Table order, mark filters and displayed decimals](method-algorithms/slope-quality.md#table-order-mark-filters-and-displayed-decimals)
12. [eGFR derivation](method-algorithms/egfr.md#egfr-derivation)
13. [KDIGO creatinine AKI detection](method-algorithms/aki.md#kdigo-creatinine-aki-detection)
14. [AKI fit-exclusion window](method-algorithms/aki.md#aki-fit-exclusion-window)
    - [Peri-event creatinine](method-algorithms/aki.md#peri-event-creatinine-2026-11-22)
15. [Clinical events](method-algorithms/clinical-events.md#clinical-events)
    - [Kidney replacement therapy in every preset](method-algorithms/clinical-events.md#kidney-replacement-therapy-in-every-preset)
16. [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction)
17. [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models)
18. [Cohort-model projections](method-algorithms/cohort-models.md#cohort-model-projections)
    - [Time to event](method-algorithms/time-to-event.md#time-to-event-2026-11-22)
19. [Fit code not reachable from the interface](method-algorithms/unreachable-code.md#fit-code-not-reachable-from-the-interface)

## Rules of this tool that are not published standards

Rules that decide a mark or a classification and that no guideline or
publication defines in this form. A number taken from a source is named with
it; the way the tool applies it is its own.

| Rule | What is from a source, and what is this tool's | Section |
| --- | --- | --- |
| Rapid eGFR decline flag, two levels | The default threshold of 5 mL/min/1.73 m² per year goes back to the KDIGO 2012 CKD guideline; KDIGO 2024 gives no numeric threshold for rapid progression. The threshold is a configurable convention. Applying it to one fitted slope without testing that the decline is sustained, and the two levels "rapid ↓" (whole 95 % interval below −threshold) and "rapid ↓?" (only the slope below it), are this tool's rules (decided 2026-11-21). | [Rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag) |
| Height for CKiD U25 and bedside Schwartz | The equations (Pierce 2021, Schwartz 2009) need a height; how a creatinine value gets one is this tool's rule: the height of the same day, or a linear interpolation between two heights both at most 90 days away, never extrapolated (owner decision `height`, 2026-11-22; no source sets the gap). The decision's 30 days under 2 years has no case, since no eGFR is computed under 2 (OD-70). | [Children and adolescents](method-algorithms/egfr.md#children-and-adolescents) |
| Bounded-value substitution and the 20 % warning | Substituting the limit or half of it for a censored value is a common convention whose bias at high censored fractions is documented (Hornung and Reed 1990; Hughes 1999). The three settings, the default `limit`, counting a median bin as bounded when it holds a bound and the warning at 20 % of the fitted points are this tool's rules (decided 2026-11-21 and 2026-11-22). | [Bounded values in individual fits](method-algorithms/bounded-measurements.md#bounded-values-in-individual-fits-2026-11-22) |
| Slope reliability rule | Fewer than three fitted dates or under 365 days of fitted span: a clinical rule of thumb, not a published cut-off. | [Reliability rule](method-algorithms/slope-quality.md#reliability-rule) |
| Minimum per cohort-model factor level | Pre-specified variant classes follow Cornec-Le Gall et al. (JASN 2016); the minimum of 5 patients with 2 or more model rows per level, pooling into "other (pooled)" and removing a small "not tested" level are this tool's rules (decided 2026-11-22). | [Factors and covariates](method-algorithms/cohort-models.md#factors-and-covariates) |
| "Not tested" vocabulary | Keeping "not tested" apart from "no variant" follows Groenwold et al. (CMAJ 2012); the four recognised texts are this tool's list (2026-11-22). | [Columns](method-algorithms/import-and-values.md#columns) |
| Baseline UACR window | The 90-day window around the model baseline and the nearest-date rule for the optional log baseline UACR covariate are this tool's rules (2026-11-22). | [Factors and covariates](method-algorithms/cohort-models.md#factors-and-covariates) |
| Dropout report and joint-model suggestion | KRT and death as informative dropout follow Vonesh et al. (Stat Med 2006); the event types counted as KRT, loss after 365 days without a model row before the data end and the suggestion above 10 % KRT or death are this tool's rules (decided 2026-11-22). | [Which measurements enter](method-algorithms/cohort-models.md#which-measurements-enter) |
| Maximum confirmation window of observed endpoints | The minimum interval of 90 days follows the KDIGO 2024 chronicity criterion (more than 3 months); the 28-day preset is attributed to the ISN trial definition (Levin 2020) and is unverified, because the full text of that paper was not checked. That a confirming value must follow within 12 calendar months of the first low value is this tool's rule (labelled so on 2026-11-22, issue #85). | [Maximum window](method-algorithms/endpoints-and-projection.md#observed-g4g5) |
| Minimum data of the extrapolation to CKD G5 | Four measurements over three years are from KDIGO 2012 CKD (p. 66, "in most cases"); counting them as distinct dates over 36 calendar months, the 365-day and three-date minimums before it and the 20-year horizon are this tool's (2026-11-22). | [Minimum data](method-algorithms/endpoints-and-projection.md#individual-g5-projection) |
| Slope tier "reliable" | At least 4 fitted dates over at least 2 × 365.25 days: the owner's decision of 2026-11-22, resting on KDIGO 2012 CKD (≥ 4 measurements over ≥ 3 years for extrapolating a rate of change) and Grams 2019 (longer slopes associated more strongly with kidney failure); neither defines the tier. | [Slope tier](method-algorithms/slope-quality.md#slope-tier) |
| Admission proxy for the AKI look-back baseline | The look-back mean of 7 to 365 days and the 1.5-fold criterion follow KDIGO 2012 AKI (ch. 2.4); what counts as an admission (a gap of more than seven days followed by values on consecutive days) is this tool's (decided 2026-11-22, OD-45). | [First value of an admission](method-algorithms/aki.md#first-value-of-an-admission) |
| Merged series | That a change of method can shift creatinine (Jaffe against enzymatic) is published; merging only by an explicit mapping, converting only serum creatinine (88.42 µmol/l per mg/dl), keeping every value of a day with two sources and the comparison lines without the column's settings are this tool's rules (decided 2026-11-16, 2026-11-21 and 2026-11-22, OD-80 to OD-84). | [Series comparison and merge](method-algorithms/series-comparison-and-merge.md#series-comparison-and-deliberate-merge-2026-11-22) |
| Time to event: entry, exit and exclusions | Kaplan–Meier with delayed entry on the age scale follows Thiébaut and Bénichou (Stat Med 2004) and Pencina et al. (Stat Med 2007); death as competing event follows Noordzij et al. (NDT 2013). Entry at the first eligible measurement, exit at the last one, the event at the first crossing, leaving out patients with the endpoint at or before entry and the death vocabulary are this tool's (decided 2026-11-22; details OD-73 to OD-79). | [Time to event](method-algorithms/time-to-event.md#entry-exit-and-status) |
| Shorter AKI window where too few values remain | The 90 days after an AKI episode follow the duration of acute kidney disease (KDIGO 2024); the fallback to 30 days from the onset and its test by the reliability rule are this tool's (decided 2026-11-22, OD-48). | [Enough values](method-algorithms/aki.md#enough-values) |

## Open decisions

Each entry is described in full in the section named, with an example where
one applies. The documentation review of 2026-10-07 produced 29 entries; the
owner decided all of them on the same day (see
[method decisions](remaining-method-decisions.md)). Those settled since are
listed under *Resolved decisions* below. None of the group scheduled
for after release 0.3.0 remains: OD-11, OD-21, OD-22 and OD-29 were
implemented on 2026-11-22 as decided. OD-30, added on 2026-11-05 with the R reproduction export, was
decided on 2026-11-13. OD-32 was added on 2026-11-15 with the rule for a
`u` that abbreviates "und" in creatinine names and was decided the same day.
OD-31 is not used on `main`; the number is reserved by the deferred MCP
server work. OD-33 was added on 2026-11-16 because the in-app methodology page lagged
behind two decisions of that day; the maintainer approved its wording the
same day. OD-34 was added on 2026-11-21 because the methodology page did not
yet state the rule for several creatinine values on one day decided that day;
the owner resolved it on 2026-11-22 and the drafted wording (G1) is applied.
OD-35 was added on 2026-11-22 with the review of the AKI recovery
rule and resolved on the second review of the same day, on the owner's
instruction of 2026-11-22 to resolve the open points. OD-36 and OD-37, added
on 2026-11-22 during implementation, were confirmed by the owner the same day
(see [method decisions](remaining-method-decisions.md)). OD-37 was added on
2026-11-22 with the two levels of the rapid-decline flag (issue #72), whose
decision does not say what a slope without a 95 % interval gets.
OD-36 was added on 2026-11-22 with the per-patient creatinine source of
issue #65: the cases the owner decision of 2026-11-21 does not name are
implemented with the option that changes least. OD-38 was added on
2026-11-22 with the peri-event creatinine analysis (issue #69) on a misreading
of its decision and resolved the same day: the decision prescribes calendar
days.

OD-40 to OD-44 were added on 2026-11-22 with the endpoint decisions of
that day (issues #81, #82, #85, #4): each records a gap the decision leaves,
implemented with the option that changes least.
OD-45 to OD-49 were added on 2026-11-22 with the AKI decisions of that day
(rows `akifirst` and `akiwin`, issue #4): the decisions leave the definition
of an admission, of outpatient values and of "enough values", and the
treatment of an episode without an observed end, to the implementation,
which took the conservative option in each case.
OD-50 to OD-54 were added on 2026-11-22 with the censoring at kidney
replacement therapy in every preset, the policy for undated dialysis of
unknown intent and the slope tier (owner decisions `censor`, `dial` and
`minfu`, issue #4); each was implemented with the conservative reading.
OD-55 to OD-59 were added on 2026-11-22 with the cohort-model decisions of that day (`genomin`,
`genomiss`, `uacr`, `dropout`; issue #4), for the details those decisions
leave open; each is implemented with the conservative option.
OD-60 to OD-63 were added on 2026-11-22 with the bounded-value setting of
issue #73, for cases its decisions of 2026-11-21 and 2026-11-22 do not name;
each is implemented with the option that changes least.
OD-65 to OD-69 were added on 2026-11-22 with the equations for children and
adolescents (issue #66): where the decisions `peds-eq`, `height` and `switch`
leave a gap, the conservative option is implemented.
OD-85 to OD-88 were added on 2026-11-22 with the comparisons against native
R and R packages (issue #79, decision `rref`; see
[reference comparisons](reference-comparisons.md)): each records a place where
an independent implementation differs from the app; the app's numbers are
unchanged. OD-89 of that range is not used.
OD-70 to OD-72 were added on 2026-11-22 from the code review of that day's
merges, for rules that were implemented without an owner decision; the
behaviour is unchanged.
OD-80 to OD-84 were added on 2026-11-22 with the comparison and deliberate
merge of series (issue #68): the decisions leave the same-day rule, the
treatment of absent series, AKI detection across sources, the known unit
pairs and the comparison lines to the implementation, which took the
conservative option in each case.
OD-73 to OD-79 were added on 2026-11-22 with the event type `death` and the
time-to-event area (decisions `km`, `death` and `taxonomy`, issue #78), for
the details those decisions leave open; each is implemented with the
conservative option.

| ID | Open question, and what is implemented | Section |
| --- | --- | --- |
| OD-40 | The decision `p50` makes the 50 % decline the default decline endpoint of a paediatric preset, but the app has no paediatric preset and the fit presets do not choose the eGFR equation (issue #66 changes that in a separate package). Implemented: no new preset; the 50 % decline is off everywhere and switched on by hand. | [Confirmed 50 % decline](method-algorithms/endpoints-and-projection.md#total-percent-change-and-confirmed-40-57--decline) |
| OD-41 | "A single value below 15" is read as an isolated low date (the neighbouring eligible dates are not low). Two or more neighbouring low dates that are not confirmed get no label. | [Single value below 15](method-algorithms/endpoints-and-projection.md#single-value-below-15-unconfirmed-2026-11-22) |
| OD-42 | KDIGO's "≥ 4 measurements over ≥ 3 years" is counted as four distinct dates of the projection fit (outside AKI windows where the column excludes them) and 36 UTC calendar months from the first to the latest of them. | [Minimum data](method-algorithms/endpoints-and-projection.md#individual-g5-projection) |
| OD-43 | The choice of endpoint badges applies to the Trajectories table only; the patient view shows every badge. | [Endpoint badges](method-algorithms/endpoints-and-projection.md#endpoint-badges-in-the-table-2026-11-22) |
| OD-44 | The confirmed 50 % decline is a sub-option of "Percent eGFR decline" (it needs its baseline), not an independent endpoint; a stored `observedDecline50` without percent decline is not evaluated. | [Confirmed 50 % decline](method-algorithms/endpoints-and-projection.md#total-percent-change-and-confirmed-40-57--decline) |
| OD-45 | The data hold no admission dates. An admission is taken to begin at the first value of a series or after more than seven days without values, and only when a further value follows on one of the next two calendar days; a single value after a gap is never compared with a look-back baseline. | [First value of an admission](method-algorithms/aki.md#first-value-of-an-admission) |
| OD-46 | Outpatient values cannot be told apart: the look-back mean takes every detection value 7 to 365 days before, including values of earlier admissions and AKI episodes. | [First value of an admission](method-algorithms/aki.md#first-value-of-an-admission) |
| OD-47 | Only the first values of an admission are compared with the look-back mean, by the 1.5-fold criterion only; the retrospective fall (an option, off by default) is tested only when no look-back value exists. | [First value of an admission](method-algorithms/aki.md#first-value-of-an-admission) |
| OD-48 | The fallback to 30 days from the onset is decided once per column for all its episodes, by the reliability rule (3 fitted dates over 365 days) on the column's own measurements after censoring, the longer windows and time balancing. | [Enough values](method-algorithms/aki.md#enough-values) |
| OD-49 | An episode without an observed end (open at the last value, or ended by a gap) counts its 90 days from the recovery window of its last value, the convention of the episode list. | [AKI fit-exclusion window](method-algorithms/aki.md#aki-fit-exclusion-window) |
| OD-50 | With the values after KRT included, only the first KRT event starts a separate segment; a later kidney transplant or chronic dialysis ends it, and its values are in no fit whatever its option. Whether a second segment (for example graft failure, then dialysis) should be fitted is open. | [Kidney replacement therapy in every preset](method-algorithms/clinical-events.md#kidney-replacement-therapy-in-every-preset) |
| OD-51 | The decision names fits of native kidney function; the presets apply the censoring to every parameter of the column settings (as CKD progression always did), also to parameters that are not kidney function, so the censoring options are shown for every parameter. Whether other parameters should keep their values after KRT by default is open. | [Kidney replacement therapy in every preset](method-algorithms/clinical-events.md#kidney-replacement-therapy-in-every-preset) |
| OD-52 | The separate segment is an additional result: no rapid-decline flag, tier, endpoint, cohort-model row or log-axis fit of its own, and its line is drawn in the overlay only for the highlighted patient. | [Kidney replacement therapy in every preset](method-algorithms/clinical-events.md#kidney-replacement-therapy-in-every-preset) |
| OD-53 | Settings saved, or applied from a workbook, under General exploration or Theil–Sen before 2026-11-22 keep their values as custom settings without censoring, so the values after KRT become the separate segment rather than censored; a returning user is told the settings were kept as custom, not that the default changed. CKD progression settings saved before keep the policy `exclude-dated-interval` in the same way. | [Kidney replacement therapy in every preset](method-algorithms/clinical-events.md#kidney-replacement-therapy-in-every-preset) |
| OD-54 | An undated dialysis of unknown intent under CKD progression censors from its start without limit; the 90-day convention named with the decision (unverified) is not applied, and no later value restores the fit. | [Display-fit censoring and exclusion](method-algorithms/clinical-events.md#display-fit-censoring-and-exclusion) |
| OD-55 | Owner-defined classes of factor levels (for example truncating and non-truncating variants) need a mapping from levels to classes, which is not built; every small level is pooled into "other (pooled)". | [Factors and covariates](method-algorithms/cohort-models.md#factors-and-covariates) |
| OD-56 | A pooled level that still has fewer than 5 patients with 2 or more model rows is kept in the model with a note; when all levels are pooled the factor fails for lack of variation. The removal of small "not tested" levels runs once, before pooling. | [Factors and covariates](method-algorithms/cohort-models.md#factors-and-covariates) |
| OD-57 | The "not tested" vocabulary applies to cohort-model factors only; grouping keeps the imported spellings, so `NT` and `not tested` are two groups there. | [Columns](method-algorithms/import-and-values.md#columns) |
| OD-58 | The UACR series of the log baseline UACR covariate is recognised by name; with several UACR series (for example in mg/g and mg/mmol) the covariate is not offered and the user cannot choose one. | [Factors and covariates](method-algorithms/cohort-models.md#factors-and-covariates) |
| OD-59 | The dropout report counts a kidney transplant or chronic dialysis as KRT (not dialysis of unknown intent), calls a patient lost after more than 365 days without a model row before the latest lab date of the dataset, and applies the 10 % threshold to the whole unit, not per level. Death is counted since the event type `death` exists (2026-11-22). | [Which measurements enter](method-algorithms/cohort-models.md#which-measurements-enter) |
| OD-60 | `n_bounded` and the 20 % warning are defined on fitted values (decision of 2026-11-21), so under `exclude` they are 0 and silent even when most raw values of a series are bounds and leaving them out biases the slope. Should `exclude` warn on the raw share? | [Bounded values in individual fits](method-algorithms/bounded-measurements.md#bounded-values-in-individual-fits-2026-11-22) |
| OD-61 | A conclusive bound (for example `>60`) after a confirmed G4/G5 event is not recorded as recovery; the decision of 2026-11-22 names only the reset of a candidate. Should it record recovery, with the limit as value? | [Bounds and endpoints](method-algorithms/bounded-measurements.md#bounds-and-endpoints-2026-11-22) |
| OD-62 | Bounds do not interrupt a 40 % or 57 % decline candidate, although `>x` can prove the decline from the baseline was below the threshold that day; the decision names G4/G5 only. | [Bounds and endpoints](method-algorithms/bounded-measurements.md#bounds-and-endpoints-2026-11-22) |
| OD-63 | Settings saved on the device or exported before 2026-11-22 carry no bounded-value setting and load with the new default `limit`, so their slopes of series with bounds change without a choice by the user; "Apply settings from an export" names the affected parameters. Should they load as `exclude` instead? | [Bounded values in individual fits](method-algorithms/bounded-measurements.md#bounded-values-in-individual-fits-2026-11-22) |
| OD-65 | CKiD U25 and the EKFC Q value use age in whole completed years; the published equations use decimal age, so the CKiD U25 constant steps at each birthday (boys: 48.60 at 17, 50.8 at 18). | [Children and adolescents](method-algorithms/egfr.md#children-and-adolescents) |
| OD-66 | Under the full-age formula CKiD U25 is used up to 25 completed years (until the day before the 26th birthday); the decision and the source say "up to 25" and "1 to 25". | [Children and adolescents](method-algorithms/egfr.md#children-and-adolescents) |
| OD-67 | CKiD U25 or EKFC is chosen per creatinine value, so a child with heights on some dates only alternates between equations, each alternation a formula change; per patient would be the alternative. | [Children and adolescents](method-algorithms/egfr.md#children-and-adolescents) |
| OD-68 | A height is interpolated only between two heights both at most 90 days away, and never carried before the first or after the last height, however close. | [Children and adolescents](method-algorithms/egfr.md#children-and-adolescents) |
| OD-69 | The series name of an adult formula is kept when it holds minors' CKiD U25 or EKFC values (the equation is named per value in `egfr_equation`), and a copy saved before 2026-11-22 is read with the default rule for children without a notice. | [Children and adolescents](method-algorithms/egfr.md#children-and-adolescents) |
| OD-70 | CKiD U25 is published for ages 1 to 25 and the decision `height` set a 30-day height limit under 2 years, but no eGFR is computed under 2 (EKFC from 2, decision of 2026-11-21), so that limit has no case. Should CKiD U25 apply from age 1 with the 30-day limit? | [Children and adolescents](method-algorithms/egfr.md#children-and-adolescents) |
| OD-71 | A conclusive bound (`>x` with x at or above 15, for example `>20`) counts as a date that is not low for the flag "single value below 15, unconfirmed"; set during the merge of 2026-11-22 without an owner decision. Should bounds be ignored there? | [Single value below 15](method-algorithms/endpoints-and-projection.md#single-value-below-15-unconfirmed-2026-11-22) |
| OD-72 | The segment after kidney replacement therapy and both sides of the before/after comparison at an anchor event take bounded values by the column's `boundedValues` setting, as its own fit; set during the merge of 2026-11-22 without an owner decision. | [Kidney replacement therapy in every preset](method-algorithms/clinical-events.md#kidney-replacement-therapy-in-every-preset), [Points and boundaries](method-algorithms/anchor-comparison.md#points-and-boundaries) |
| OD-73 | A death ends time-to-event follow-up at its date even long after the last eligible measurement; the gap counts as event-free. Alternative: censor at the last measurement. | [Time to event](method-algorithms/time-to-event.md#open-decisions) |
| OD-74 | Without the KRT endpoint, kidney replacement therapy censors at the last eligible measurement and a later death is not counted; KRT is never a competing event in the Aalen–Johansen estimate. | [Time to event](method-algorithms/time-to-event.md#open-decisions) |
| OD-75 | The time-to-event export is a workbook of its own, not a last sheet of the model or cohort workbook. | [Time to event](method-algorithms/time-to-event.md#export) |
| OD-76 | A first crossing on the first eligible date counts as "at or before entry" and excludes the patient; patients without a value of the grouping attribute are left out rather than grouped as "(ungrouped)". | [Time to event](method-algorithms/time-to-event.md#entry-exit-and-status) |
| OD-77 | Ages on the time-to-event age scale come from the birth anchor, rounded to whole days; an anchor estimated from completed years can be up to a year off and is stated, not corrected. | [Time to event](method-algorithms/time-to-event.md#entry-exit-and-status) |
| OD-78 | Aalen–Johansen has no interval; the log-rank test drops groups without variance, and with delayed entry and tied event times its hypergeometric variance has no direct R counterpart. | [Estimators](method-algorithms/time-to-event.md#estimators) |
| OD-79 | Values after a death are left out of endpoint input and time to event but stay in tables, charts and fits, with an import warning; the death vocabulary is `death`, `deceased`, `Tod`, `verstorben`; the time-to-event settings are session only (not saved with the dataset); the analysis record lists them and the time-to-event workbook records them (`tte_settings`), the cohort workbook does not. | [Type and intent vocabulary](method-algorithms/clinical-events.md#type-and-intent-vocabulary) |
| OD-80 | Values of two source series on one day are all kept in the merged series; no source is preferred, and time balancing and the same-day rules (medians, AKI comparison with earlier values only) decide. The decision does not say which. | [Values of two sources on one day](method-algorithms/series-comparison-and-merge.md#values-of-two-sources-on-one-day) |
| OD-81 | "Apply settings from an export" leaves out a merge when any one of its source series is not in the loaded dataset, and names it; a stored merge of a saved copy is formed from the present sources when at least two remain. Should an applied merge also use the present sources? | [Interaction with eGFR, AKI and the analysis record](method-algorithms/series-comparison-and-merge.md#interaction-with-egfr-aki-and-the-analysis-record) |
| OD-82 | A merged series is recognised by its own name and unit: a merged serum creatinine series detects AKI on itself across its sources, so a rise between two methods can form an episode that neither source shows, and the episode list names it beside the episodes of the sources; named without "Kreatinin"/"Creatinin" it is not creatinine at all. | [Interaction with eGFR, AKI and the analysis record](method-algorithms/series-comparison-and-merge.md#interaction-with-egfr-aki-and-the-analysis-record) |
| OD-83 | Only serum creatinine converts between units (mg/dl and µmol/l, 88.42); the decision says "units converted where known", and no other pair is listed, so other analytes merge only within one unit. The value text of a converted row is rounded (two decimals below 10, one from 10); the number is not. | [Deliberate merge](method-algorithms/series-comparison-and-merge.md#deliberate-merge) |
| OD-84 | The comparison lines of the patient view are OLS over all exact values of each series, without the column's time balancing, censoring, exclusion windows or bounded-value setting; they can differ from the column's slope. | [Comparison view](method-algorithms/series-comparison-and-merge.md#comparison-view) |
| OD-85 | EKFC above 25 years uses Q = 0.90 and 0.70 mg/dl; the R package `kidney.epi` uses 80 and 62 µmol/l (0.905 and 0.701 mg/dl), so its values are up to 0.66 % higher (man, 50 years, 1.0 mg/dl: 86.130 against 86.67). Which unit's constants are primary? | [Formulas](method-algorithms/egfr.md#formulas) |
| OD-86 | CKiD U25 from 15 to under 18 years: the app (and `egfr`) use 39.0 × 1.045^(age − 12) and 36.1 × 1.023^(age − 12); `kidney.epi` uses the constants 41.8 and 37.6, up to 14 % lower (boy, 17 years, 172 cm, 0.3 mg/dl: 278.6 against 239.65). Pierce 2021 itself was not checked for these ages. | [Children and adolescents](method-algorithms/egfr.md#children-and-adolescents) |
| OD-87 | The Theil–Sen upper slope bound is taken one rank higher than in the R package `zyp` (1-based ranks 19 and 48 against 19 and 47 for N = 66: [1.5, 2.3] against [1.5, 2.285714]); the app keeps the SciPy convention, which was not checked against Sen 1968 or Hollander and Wolfe. | [Theil-Sen](method-algorithms/trend-estimators.md#theil-sen-2026-09-23) |
| OD-88 | CKD-EPI 2009 for women uses 141 × 1.018 = 143.538; `kidney.epi` uses the table constant 144, 0.32 % higher (woman, 50 years, 1.0 mg/dl: 65.638 against 65.85). | [Formulas](method-algorithms/egfr.md#formulas) |

### Resolved decisions

Decided by the owner on 2026-10-07 (see
[method decisions](remaining-method-decisions.md)) and settled since, by a
change to the behaviour or, where the behaviour stays, by a correction of the
methodology page. The numbers are not reused.

| ID | Resolution | Section |
| --- | --- | --- |
| OD-1 | Cohort models prepare their measurements with the analysis settings chosen under Trajectories. | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) |
| OD-2 | Rolling OLS draws its window lines and reports the window statistics; the reported slope stays global. | [Rolling and segmented OLS](method-algorithms/trend-estimators.md#rolling-and-segmented-ols) |
| OD-3 | Segmented OLS stays as implemented; the methodology page describes it. | [Rolling and segmented OLS](method-algorithms/trend-estimators.md#rolling-and-segmented-ols) |
| OD-4 | The three-measurement minimum and the confidence gate stay; the methodology page explains the consequence. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-5 | The eGFR formula default stays `off`; the methodology page no longer calls CKD-EPI 2021 the default. | [eGFR derivation](method-algorithms/egfr.md#egfr-derivation) |
| OD-6 | The "Group interaction" text no longer promises p-values. | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) |
| OD-7 | Dialysis intent is matched without regard to case. | [Clinical events](method-algorithms/clinical-events.md#clinical-events) |
| OD-8 | Text with three digits after a point is read as a decimal and reported. | [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation) |
| OD-9 | Fitted points on one date get their own "no slope" note. | [Reason codes and the slope reliability rule](method-algorithms/slope-quality.md#reason-codes-and-the-slope-reliability-rule) |
| OD-10 | The rapid-decline flag stayed without a reliability gate (2026-10-07). Replaced on 2026-11-17: the flag is not set on a slope that meets the reliability rule. Since 2026-11-21 the flag has two levels by the slope's 95 % interval; the gate stays. | [Rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag) |
| OD-11 | The OLS t critical value is the exact Student-t quantile above 40 degrees of freedom (the table of exact values up to 40 stays); implemented 2026-11-22. | [Ordinary least squares](method-algorithms/trend-estimators.md#95--confidence-interval-for-the-slope) |
| OD-12 | Both creatinine conversion constants stay; the methodology page names them. | [eGFR derivation](method-algorithms/egfr.md#egfr-derivation) |
| OD-13 | Creatinine of zero or less takes no part in AKI detection. | [KDIGO creatinine AKI detection](method-algorithms/aki.md#kdigo-creatinine-aki-detection) |
| OD-14 | Creatinine measured under dialysis is left out of AKI detection. | [KDIGO creatinine AKI detection](method-algorithms/aki.md#kdigo-creatinine-aki-detection) |
| OD-15 | A derived eGFR inherits the non-exact status of its creatinine row. | [eGFR derivation](method-algorithms/egfr.md#egfr-derivation) |
| OD-16 | The projected age starts from the exact age when the birth date is known. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-17 | The projection needs 365 days of follow-up, like the reliability rule. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-18 | A confirmed observed G5 always withholds the projection. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-19 | The minimum confirmation interval is at most 365 days. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-20 | eGFR is recognised by the unit mL/min/1.73 m² everywhere, in four accepted spellings. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-21 | The unused model `tolerance` is no longer in the result metadata or `fitConfigHash`; the `models` column stays, empty, for column positions; the R package versions are pinned; implemented 2026-11-22. | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) |
| OD-22 | The type of an attribute factor can be switched between numeric and categorical; the automatic type stays the default; implemented 2026-11-22. | [Factors and covariates](method-algorithms/cohort-models.md#factors-and-covariates) |
| OD-23 | The "Group interaction" preset builds a valid numeric factor. | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) |
| OD-24 | The JavaScript date-parser fallback for attribute birth dates is removed. | [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation) |
| OD-25 | Two accepted headers for one lab or event field produce a warning naming the column used. | [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation) |
| OD-26 | Lab rows without a patient ID are listed as rejected. | [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation) |
| OD-27 | An empty pre-parsed operator beside a number means an exact value. | [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation) |
| OD-28 | Implausible stated ages are reported as `age_implausible`. | [Demographics resolution](method-algorithms/demographics.md#demographics-resolution) |
| OD-29 | Without a chosen reference, each fitted unit takes the first level among its own model rows; a chosen reference is kept; implemented 2026-11-22. | [Factors and covariates](method-algorithms/cohort-models.md#factors-and-covariates) |
| OD-30 | Every number returned from R is serialized at full precision (`digits = NA`); decided 2026-11-13. | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) |
| OD-32 | A lone `u` in a creatinine name is "und" only between two blood-material words or in "vor u. nach"; next to any other word it stays urine; decided 2026-11-15. | [eGFR derivation](method-algorithms/egfr.md#eligible-source-series) |
| OD-33 | The methodology page describes AKI staging against the lowest value of the previous 7 days and the "Slope range" label for Theil-Sen bounds on fewer than five dates; wording approved 2026-11-16. | [AKI staging](method-algorithms/aki.md#staging) |
| OD-34 | The methodology page states the rule for several creatinine values on one day: ordered by the time of day where every value has one, otherwise compared with earlier days only; wording G1 applied 2026-11-22. | [Measurements on the same date](method-algorithms/aki.md#measurements-on-the-same-date) |
| OD-35 | The recovery that separates two AKI episodes is a dataset-level setting (*Recovery between episodes (hours)*, default 48, `recoveryHours` in the exported analysis settings); a gap of more than seven days without creatinine values outside dated acute dialysis intervals still ends an episode (step 4), which the episode list then gives without an end date; decided 2026-11-22. | [Episodes](method-algorithms/aki.md#recovery-length) |
| OD-36 | No µmol/l fallback when mg/dl creatinine exists under another name, when several µmol/l series exist without one under the selected name, or when the selected source is in µmol/l; the patients stay counted and named; confirmed by the owner 2026-11-22. | [eGFR source selection](method-algorithms/egfr.md#source-selection) |
| OD-37 | A slope below the negative threshold without a 95 % interval is marked "rapid ↓?"; confirmed by the owner 2026-11-22. | [Rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag) |
| OD-38 | The peri-event windows of 48 and 72 hours count calendar days after the event day and a value on the event day is a baseline value, as the decision of 2026-11-21 (issue #69) prescribes; the marker had been added on a misreading that the decision asked for exact hours. | [Peri-event creatinine](method-algorithms/aki.md#days-baseline-window-and-criterion) |

