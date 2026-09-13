# Endpoint analysis readiness — 2026-09-13

This is a technical inventory and decision record, not an approved endpoint
definition or a change to application methodology.

## Current implementation

- PR #11 implements configurable patient-level factors for trajectory level
  and slope; its GitHub CI passed. It remains a draft awaiting dataset/product
  acceptance. It does not implement event-time analysis.
- The bundled workbook contains 216 lab rows, 8 event rows and 8 attribute rows.
  Attributes include genotype, inheritance and cohort. These are demo/test data;
  they do not establish representativeness for a research cohort.
- `src/core/endpoints/ckdEndpoints.ts` currently projects from the latest
  measured value using the fitted annual slope, anchored to the latest age.
  This is not necessarily the threshold intersection of the fitted regression
  line, because the last measurement can differ from its fitted value.
- Observed G5 currently defaults to a value below 15 and confirmation at least
  90 days later. The algorithm rejects a candidate if any later measurement
  recovers above the threshold, even after confirmation. It also records the
  last qualifying confirmation date, rather than the earliest one. Neither
  behavior should silently define a first-event analysis.
- Existing clinical events are transplant, dialysis or other. Their fit
  exclusions are measurement-selection rules; they are not an event-time
  dataset with follow-up status, competing events and censoring reasons.

## Questions to settle before an event-time model

1. Target: first crossing below a selected threshold, first confirmed sustained
   crossing, or a composite that also includes kidney replacement therapy?
2. Time origin: first eligible measurement, cohort entry, diagnosis, treatment
   start, or age? How are patients already meeting the endpoint handled?
3. For confirmation: required spacing and recovery rule; event date at first
   crossing or at confirmation? Retain both dates in the derived data.
4. Observation end: which field establishes event-free follow-up? Last lab is
   usable only if it matches the endpoint's ascertainment process. A crossing
   between visits may be interval-censored, not precisely dated.
5. Death, transplant and dialysis: endpoint component, competing event, or
   censoring? This depends on the research question and cannot be inferred
   solely from existing exclusions.
6. Desired output: event probability by a specified year, median time, or
   restricted mean event-free time over a specified horizon? An unrestricted
   expected waiting time may be unidentified when follow-up does not cover
   the tail. A Cox hazard ratio alone does not report years to an event.

## Interpretation

Trajectory projection asks when a continued estimated course would intersect
a threshold. It can describe an individual or a modeled reference group.
Event-time analysis uses observed events and follow-up to estimate an event-time
distribution, potentially conditional on genotype, age and sex. It does not
interpolate a pooled eGFR trajectory. Both require assumptions; the former's
geometric crossing is not automatically an expected observed event time.

Methodological background: [Survival Analysis Part I: Basic concepts and first
analyses](https://pmc.ncbi.nlm.nih.gov/articles/PMC2394262/).

## Issue mapping

- #4: configurable factors delivered in PR #11; G4, mixed-model threshold
  projection and event-time definitions remain open. Do not close the issue
  when the factor PR merges.
- #6: numeric coverage supplied by the separate open PR #10; estimator
  conventions remain unresolved as recorded in that issue.
- #2: navigation/mode taxonomy and plot export remain separate work; this PR
  does not settle the mode taxonomy.

Next acceptance step: evaluate the factor dialog and fitted export with a
representative research dataset. Existing automated checks establish technical
behavior on fixtures and synthetic data, not research-data acceptance.
