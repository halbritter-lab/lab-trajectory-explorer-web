# Research models: proposed scope

## Status update — 2026-09-14

PRs #11 and #12 are merged through #13. Patient-factor configuration and fitted-curve threshold projections are technically integrated; research-data and redesigned-workflow acceptance remain outstanding. The approved genotype example includes baseline age and sex for both level and slope. Sections below retain the proposal history, including superseded delivery order and open-choice wording. Current decisions and remaining questions: [requirements reconciliation](../../requirements-reconciliation.md).


Status: patient-factor configuration and the genotype example were approved on
2026-09-13 and are implemented on `feat/configurable-mixed-model-factors`.
Baseline age and sex can affect both level and slope; each factor remains
configurable. Trajectory extrapolation was selected as the next threshold-time
increment on 2026-09-13. Time-to-event analysis is an optional later extension;
dated intervention models also remain proposals requiring further definition.

## Confirmed research needs

The primary questions concern associations between kidney-function trajectories
and genes, treatments, or interventions. Sex is one of several explanatory
variables. Time to a specified kidney-function stage has been explicitly
requested. The first increment will address trend-based threshold projection;
observed event-time analysis is deferred as a possible later extension.

Patient characteristics usually accompany patient data. There is no externally
mandated schema. Retain the optional three-sheet workbook:

- `labs`: dated repeated measurements.
- `attributes`: one row per patient, with genotype, sex, treatment group, and
  other patient-level characteristics.
- `events`: dated interventions; extend their semantics only when implementing
  intervention models. Existing events currently also control censoring, so a
  treatment event must not silently acquire an exclusion effect.

Separate-file uploads remain supported. A treatment-group attribute supports
group comparisons; it does not supply a treatment start date.

## Proposed first increment: patient-level associations

Current mixed models fit the whole cohort or each attribute group separately.
The only optional fixed covariate is baseline age. Separate group fits do not
provide a joint adjusted group contrast.

Add a joint model with one primary explanatory variable and optional adjustment
variables selected from patient attributes. Explicitly distinguish categorical
and numeric variables; do not infer that numeric-looking category codes are
continuous measurements. Show reference categories and numeric units.

Illustrative formula for a genotype comparison:

```text
eGFR ~ time * genotype + baseline_age_centered + sex
       + (1 + time | patient)
```

This is a proposed formula, not an automatic default for every study. The
genotype main effects describe level differences at the selected time origin;
time interactions describe differences in slope. Sex could instead be the
primary variable, or have its own time interaction when that is the question.
Adjustment variables are chosen for the study, not automatically added based
on availability or significance.

Expose the time origin, fit population, exclusions, reference categories,
formula, coefficient units, intervals, and convergence/singularity warnings.
Missing selected covariates must have an explicit policy with patient counts;
do not silently impute values or interpret missing as a biological category.
Retain existing random-effect choices and report any failed configuration;
do not silently simplify a failed model.

Sex in an eGFR calculation and sex as a model covariate have distinct roles.
The outcome calculation must remain visible in model metadata. Existing handling
of sex categories in the eGFR equations is not changed by this proposal.

## Concrete example for review: genotype and eGFR decline

Question: "Do annual eGFR changes differ by genotype, accounting for baseline
age and sex?" This example defines a reviewable study setup; it does not
prescribe adjustment variables for every dataset.

Inputs:

| Input | Proposed handling |
| --- | --- |
| Repeated eGFR values | Use the selected eGFR series and existing exclusions/time balancing; record the formula when calculated from creatinine. |
| `genotype` | Categorical patient attribute, with an explicitly selected reference group. |
| Baseline age | Existing resolved age at the first retained model point; center across included patients. |
| `sex` | Resolved patient-level value; show categories and the selected reference explicitly. |
| Time | Years since each patient's first retained model point; display that origin. |

For slope adjustment as well as level adjustment, the candidate formula is:

```text
eGFR ~ time * (genotype + baseline_age_centered + sex)
       + (1 + time | patient)
```

Compared with the earlier illustrative formula, this also allows age and sex
to be associated with slopes. A main effect such as `+ sex` alone permits a
level difference; `time * sex` also includes a time-by-sex interaction. The UI
must expose this distinction per variable. R's expansion of `*` into main
effects and interactions is documented in the
[R formula manual](https://www.stat.ethz.ch/R-manual/R-devel/library/stats/html/formula.html);
the mixed-model notation is documented by
[lme4](https://lme4.github.io/lme4/reference/lmer.html).

Proposed output emphasizes the genotype-by-time coefficients, in eGFR units
per year relative to the reference genotype, with intervals. Level contrasts
remain available separately. Display the number of included patients and
measurements, group counts, and reasons for exclusions. Explain that an
association is conditional on the selected model and study population.

### Proposed first-release choices to review

- One primary variable, with selectable level-only or level-and-slope effects.
  Additional adjustment variables have the same explicit choice.
- Numeric versus categorical treatment is confirmed in the model dialog;
  numeric-looking genotype codes remain categorical unless explicitly changed.
- Missing selected patient covariates exclude that patient's entire trajectory
  from this model, with a preview of counts and reasons before fitting. Other
  application views retain those patients. No automatic imputation.
- Complete-case membership is resolved before centering numeric variables.
  No automatic choice of covariates, reference group, or model based on p-values.
- Detect unusable designs, absent reference levels, and non-estimable terms;
  report failure or a clear limitation instead of silently dropping terms.
- Existing per-group descriptive fits remain available; the new joint fit is
  labeled as an adjusted comparison so users can distinguish their purposes.

These choices need review before implementation. In particular, the richer
slope-adjustment example must not replace the existing formula silently.

## Later increment: dated interventions

Start/end dates, repeated episodes, changes in treatment, and a comparison group
need explicit representation before fitting intervention models. Specify whether
the question concerns a level change, a slope change, or both. Do not describe
an observational association or an unadjusted before/after comparison as a
causal treatment effect.

## Threshold times

Keep the requested threshold-time feature in scope, with distinct outputs:

1. Observed threshold crossing under an explicit event definition.
2. Projected crossing of a fitted trajectory, conditional on extrapolation.
3. An optional later event-time analysis accounting for incomplete follow-up.

Delivery decision (2026-09-13): implement trajectory extrapolation first.
Event-time analysis remains recorded in issue #4 as a possible extension, not
a requirement for the first projection release. Its event-definition decisions
are deferred and do not block trajectory projection.

For a linear fitted trajectory `y(t) = a + b*t`, its threshold intersection is
`(threshold - a) / b` when applicable. It is not automatically the expected event
time. Define the reference date before presenting remaining years. Separate a
cohort/group curve intersection from an individual projection; neither is
automatically the average of individual event times.

Decisions still required:

- Which threshold/stage and whether one measurement or confirmation defines an
  observed event; distinguish stage thresholds from dialysis/transplant events.
- Individual versus cohort/group projections, and their intended use.
- Projection horizon and how uncertainty and unavailable results are displayed.
- Study-specific adjustment variables, category coding, and missing-data policy.

## Delivery order

Finish PR #9 import correctness and independently characterize Theil-Sen first.
Review this model proposal before implementing the joint association model on
a new branch. Use concrete example datasets to finalize model and UI choices.
Keep navigation changes separate from scientific formula changes.
