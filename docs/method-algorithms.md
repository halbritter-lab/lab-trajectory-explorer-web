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
  stored after import. Different names or units are never pooled.
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
11. [Rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag)
    - [Table order, mark filters and displayed decimals](method-algorithms/slope-quality.md#table-order-mark-filters-and-displayed-decimals)
12. [eGFR derivation](method-algorithms/egfr.md#egfr-derivation)
13. [KDIGO creatinine AKI detection](method-algorithms/aki.md#kdigo-creatinine-aki-detection)
14. [AKI fit-exclusion window](method-algorithms/aki.md#aki-fit-exclusion-window)
    - [Peri-event creatinine](method-algorithms/aki.md#peri-event-creatinine-2026-11-22)
15. [Clinical events](method-algorithms/clinical-events.md#clinical-events)
16. [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction)
17. [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models)
18. [Cohort-model projections](method-algorithms/cohort-models.md#cohort-model-projections)
19. [Fit code not reachable from the interface](method-algorithms/unreachable-code.md#fit-code-not-reachable-from-the-interface)

## Rules of this tool that are not published standards

Rules that decide a mark or a classification and that no guideline or
publication defines in this form. A number taken from a source is named with
it; the way the tool applies it is its own.

| Rule | What is from a source, and what is this tool's | Section |
| --- | --- | --- |
| Rapid eGFR decline flag, two levels | The default threshold of 5 mL/min/1.73 m² per year goes back to the KDIGO 2012 CKD guideline; KDIGO 2024 gives no numeric threshold for rapid progression. The threshold is a configurable convention. Applying it to one fitted slope without testing that the decline is sustained, and the two levels "rapid ↓" (whole 95 % interval below −threshold) and "rapid ↓?" (only the slope below it), are this tool's rules (decided 2026-11-21). | [Rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag) |
| Bounded-value substitution and the 20 % warning | Substituting the limit or half of it for a censored value is a common convention whose bias at high censored fractions is documented (Hornung and Reed 1990; Hughes 1999). The three settings, the default `limit`, counting a median bin as bounded when it holds a bound and the warning at 20 % of the fitted points are this tool's rules (decided 2026-11-21 and 2026-11-22). | [Bounded values in individual fits](method-algorithms/bounded-measurements.md#bounded-values-in-individual-fits-2026-11-22) |
| Slope reliability rule | Fewer than three fitted dates or under 365 days of fitted span: a clinical rule of thumb, not a published cut-off. | [Reliability rule](method-algorithms/slope-quality.md#reliability-rule) |

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

OD-60 to OD-63 were added on 2026-11-22 with the bounded-value setting of
issue #73, for cases its decisions of 2026-11-21 and 2026-11-22 do not name;
each is implemented with the option that changes least.

| ID | Open question | Section |
| --- | --- | --- |
| OD-60 | `n_bounded` and the 20 % warning are defined on fitted values (decision of 2026-11-21), so under `exclude` they are 0 and silent even when most raw values of a series are bounds and leaving them out biases the slope. Should `exclude` warn on the raw share? | [Bounded values in individual fits](method-algorithms/bounded-measurements.md#bounded-values-in-individual-fits-2026-11-22) |
| OD-61 | A conclusive bound (for example `>60`) after a confirmed G4/G5 event is not recorded as recovery; the decision of 2026-11-22 names only the reset of a candidate. Should it record recovery, with the limit as value? | [Bounds and endpoints](method-algorithms/bounded-measurements.md#bounds-and-endpoints-2026-11-22) |
| OD-62 | Bounds do not interrupt a 40 % or 57 % decline candidate, although `>x` can prove the decline from the baseline was below the threshold that day; the decision names G4/G5 only. | [Bounds and endpoints](method-algorithms/bounded-measurements.md#bounds-and-endpoints-2026-11-22) |
| OD-63 | Settings saved on the device or exported before 2026-11-22 carry no bounded-value setting and load with the new default `limit`, so their slopes of series with bounds change without a choice by the user; "Apply settings from an export" names the affected parameters. Should they load as `exclude` instead? | [Bounded values in individual fits](method-algorithms/bounded-measurements.md#bounded-values-in-individual-fits-2026-11-22) |

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

