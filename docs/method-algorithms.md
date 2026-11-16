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
  stores it at midnight UTC; a time of day is dropped. Measurements of one day
  share one timestamp, and every elapsed-time rule works in whole days.
- **A year is 365.25 days** wherever elapsed time is converted to years.
- **A series** is one patient, one parameter name and one unit, compared as
  stored after import. Different names or units are never pooled.
- **An exact measurement** is a dated numeric row whose operator is `=`.
  Bounded rows (`<x`, `>x`) are shown and counted as raw rows but enter no fit,
  endpoint, AKI detection or cohort model. A bounded creatinine row still
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
4. [Fit pipeline and fit-input selection](method-algorithms/fit-input-presets-and-time-balancing.md#fit-pipeline-and-fit-input-selection)
5. [Fit presets](method-algorithms/fit-input-presets-and-time-balancing.md#fit-presets)
6. [Time balancing](method-algorithms/fit-input-presets-and-time-balancing.md#time-balancing)
7. [Ordinary least squares](method-algorithms/trend-estimators.md#ordinary-least-squares)
8. [Theil-Sen](method-algorithms/trend-estimators.md#theil-sen-2026-09-23)
9. [Rolling and segmented OLS](method-algorithms/trend-estimators.md#rolling-and-segmented-ols)
10. [Reason codes and the slope reliability rule](method-algorithms/slope-quality.md#reason-codes-and-the-slope-reliability-rule)
11. [Rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag)
12. [eGFR derivation](method-algorithms/egfr.md#egfr-derivation)
13. [KDIGO creatinine AKI detection](method-algorithms/aki.md#kdigo-creatinine-aki-detection)
14. [AKI fit-exclusion window](method-algorithms/aki.md#aki-fit-exclusion-window)
15. [Clinical events](method-algorithms/clinical-events.md#clinical-events)
16. [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction)
17. [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models)
18. [Cohort-model projections](method-algorithms/cohort-models.md#cohort-model-projections)
19. [Fit code not reachable from the interface](method-algorithms/unreachable-code.md#fit-code-not-reachable-from-the-interface)

## Open decisions

Each entry is described in full in the section named, with an example where
one applies. The documentation review of 2026-10-07 produced 29 entries; the
owner decided all of them on the same day (see
[method decisions](remaining-method-decisions.md)). Those settled since are
listed under *Resolved decisions* below. Four remain, **OD-11, OD-21, OD-22
and OD-29: to be changed after release 0.3.0.** Their behaviour is unchanged
until then. OD-30, added on 2026-11-05 with the R reproduction export, was
decided on 2026-11-13. OD-32 was added on 2026-11-15 with the rule for a
`u` that abbreviates "und" in creatinine names and was decided the same day.
OD-31 is not used on `main`; the number is reserved by the deferred MCP
server work.

| ID | Section | Implemented behaviour that needs a decision |
| --- | --- | --- |
| OD-11 | [Ordinary least squares](method-algorithms/trend-estimators.md#ordinary-least-squares) | The t critical value is a step function above 40 degrees of freedom, untested against a reference in that range. |
| OD-21 | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) | The exported model `tolerance` is used by no fit, and R packages are not version-pinned. |
| OD-22 | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) | Numeric or categorical factor type is assigned automatically and cannot be changed. |
| OD-29 | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) | The default reference level of a factor is taken from all patients of the dataset and can be absent from the fitted series or group, which then cannot be fitted until another reference is chosen. |

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
| OD-10 | The rapid-decline flag stays without a reliability gate; the methodology page says so. | [Rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag) |
| OD-12 | Both creatinine conversion constants stay; the methodology page names them. | [eGFR derivation](method-algorithms/egfr.md#egfr-derivation) |
| OD-13 | Creatinine of zero or less takes no part in AKI detection. | [KDIGO creatinine AKI detection](method-algorithms/aki.md#kdigo-creatinine-aki-detection) |
| OD-14 | Creatinine measured under dialysis is left out of AKI detection. | [KDIGO creatinine AKI detection](method-algorithms/aki.md#kdigo-creatinine-aki-detection) |
| OD-15 | A derived eGFR inherits the non-exact status of its creatinine row. | [eGFR derivation](method-algorithms/egfr.md#egfr-derivation) |
| OD-16 | The projected age starts from the exact age when the birth date is known. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-17 | The projection needs 365 days of follow-up, like the reliability rule. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-18 | A confirmed observed G5 always withholds the projection. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-19 | The minimum confirmation interval is at most 365 days. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-20 | eGFR is recognised by the unit mL/min/1.73 m² everywhere, in four accepted spellings. | [Observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction) |
| OD-23 | The "Group interaction" preset builds a valid numeric factor. | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) |
| OD-24 | The JavaScript date-parser fallback for attribute birth dates is removed. | [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation) |
| OD-25 | Two accepted headers for one lab or event field produce a warning naming the column used. | [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation) |
| OD-26 | Lab rows without a patient ID are listed as rejected. | [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation) |
| OD-27 | An empty pre-parsed operator beside a number means an exact value. | [Import and value interpretation](method-algorithms/import-and-values.md#import-and-value-interpretation) |
| OD-28 | Implausible stated ages are reported as `age_implausible`. | [Demographics resolution](method-algorithms/demographics.md#demographics-resolution) |
| OD-30 | Every number returned from R is serialized at full precision (`digits = NA`); decided 2026-11-13. | [Cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models) |
| OD-32 | A lone `u` in a creatinine name is "und" only between two blood-material words or in "vor u. nach"; next to any other word it stays urine; decided 2026-11-15. | [eGFR derivation](method-algorithms/egfr.md#eligible-source-series) |

