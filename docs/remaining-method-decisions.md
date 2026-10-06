# Method decisions and remaining acceptance

Prepared 2026-09-23; updated after the project owner's decision walkthrough.
The decisions below are approved requirements. Numerical implementation began
after `09fb02b`; the earlier technical workspace package at `d88493c` did not
change them. Current algorithm details and limitations are recorded in
[implemented method algorithms](method-algorithms.md); verification and acceptance
are tracked separately in the [backlog](workspace-completion-backlog.md).

## Decisions of 2026-10-06 (full repository review)

Taken by the project owner after a full review with synthetic cases. Where they
conflict with older entries below, these take precedence. Defaults marked
*(proposed)* were chosen during implementation on the owner's instruction to
proceed and remain open to the owner's revision.

- **Python reference no longer binding.** The TypeScript core may deviate from
  the Python `analyses` package. Golden fixtures remain as regression tests;
  every deliberate numeric change is documented here, in
  [method algorithms](method-algorithms.md) and the changelog, and the affected
  fixtures are updated with the reason.
- **Endpoints stop at kidney replacement therapy.** Endpoint input (observed
  G4/G5, percent decline, individual G5 projection) is truncated at the first
  kidney transplant or chronic dialysis start. A dated acute-dialysis interval
  is excluded only for its duration. The start of a transplant or chronic
  dialysis itself counts as *kidney failure reached* on that date. This
  replaces the earlier "use all dated measurements, including later recovery"
  rule for individual prediction below.
  Implemented endpoint policy: compare UTC calendar dates; the KRT start date
  itself is excluded, and the earliest transplant/chronic dialysis date wins.
  Complete dated acute intervals exclude both boundary dates, with later values
  retained. Unknown-intent dialysis and acute intervals without a valid end
  date do not exclude endpoint input. Endpoint filtering does not depend on
  display-fit toggles or AKI windows. Kidney failure reached is independent of
  lab-confirmed G5 and is reported for eGFR cells with measurements even when
  observed G5 is disabled; empty eGFR cells add no patient-level result.
  Review follow-up: a nonempty eGFR series reports KRT even if every lab is on
  or after KRT. Once kidney failure was reached, a future individual G5
  projection is withheld with reason `kidney_failure_reached`; a prior observed
  G5 and KRT remain visible together. This omits a possible pre-KRT
  counterfactual projection, which the owner may revisit if useful.
- **Individual G5 projection.** No projected crossing beyond 20 years after
  the last measurement *(proposed horizon)*; no projected crossing when the
  slope confidence interval includes zero. The "unlikely" wording is replaced
  by a neutral statement of what was or was not computed.
  Implemented using the endpoint-only fit's slope bounds, separate from the
  displayed cohort slope bounds. A finite interval touching zero at either end
  withholds the projection; missing/nonfinite or inverted bounds withhold it
  under a separate reason. The 20-year limit is measured from the latest
  endpoint-eligible measurement using 365.25-day years; exactly 20 years is
  included. Existing observed G5, KRT and no-fit reasons retain precedence.
- **Confirmed percent-decline endpoints.** 40 % and 57 % eGFR decline (57 %
  corresponds to doubling of serum creatinine). Baseline: mean of the values
  within the first 90 days of follow-up *(proposed)*. Confirmation uses the
  same configurable minimum interval as G4/G5.
- **Maximum confirmation window.** A confirming value must follow the
  candidate within 12 months *(proposed)*; this applies to G4/G5 and percent
  decline alike.
  Implemented as 12 UTC calendar months, inclusive, with end-of-month clamping
  (February 29, 2020 → February 28, 2021). A later crossing expires the old
  candidate and starts a new one at that measurement. The 40 % and 57 % decline
  comparisons include equality, while G4/G5 still require values strictly below
  their boundaries. The decline baseline is the arithmetic mean of every
  eligible exact eGFR row from the first eligible UTC date through 90 elapsed
  UTC days inclusive, including the whole final calendar day; duplicate rows
  count separately. Candidate search begins
  strictly after that window, so no observation defines the baseline and also
  establishes a decline event. A nonpositive baseline makes both decline events
  unavailable. This withholds early confirmed decline dates if the owner
  intended candidates inside the baseline window and can be revised on review.
- **Censored values** (`<x`, `>x`) are excluded by row operator from all fits,
  endpoint evaluation and prediction, AKI detection and cohort mixed models.
  Raw values, limits and chart points remain visible; raw numeric counts include
  them. An exact row on the same date remains eligible. Bound-only series have
  no fit or endpoint; a bound cannot start, confirm, interrupt or recover an
  observed event. Derived eGFR may display a reversed bound but is excluded
  downstream. This numeric policy is implemented in the first P4 package.
  `nFitted` counts fit-eligible points after windows; it is zero if the sole
  exact point is excluded or the fit model is disabled, while `nNumeric` still
  reports the original dated numeric row count.
- **KDIGO threshold comparisons** use an inclusive 1e-12 tolerance in the
  compared quantity (mg/dl for absolute values, dimensionless for ratios), so
  a rise of exactly 0.3 mg/dl or exactly 1.5× is detected despite binary
  rounding. The stage-1 floor and stage-2/3 boundaries use the same rule;
  episode clustering and staging priority are unchanged. A clinically smaller
  rise such as 0.299999 mg/dl remains below threshold. Implemented in this P4
  package.
- **AKI detection and eGFR derivation** accept eligible serum creatinine in
  mg/dl or µmol/l, converting the latter to mg/dl by division by the central
  88.42 constant before comparison or formula evaluation. Common micro-sign,
  case and spacing unit spellings are eligible; urine sources and operator-bound
  rows remain excluded from AKI. AKI uses the current creatinine pair on its
  own series or selects the patient's pair with the most eligible exact dated
  rows for another analyte, without pooling names or units. eGFR continues to
  use one selected name/unit pair. Implemented in this P4 package.
- **Cohort models** may apply the analysis preset's censoring and AKI
  exclusions. Whether they do, and how many measurements were excluded, is
  shown in the interface and recorded in exports. Implemented in P5 package 1:
  application defaults on, the count uses eligible exact dated measurements
  removed by the union of event and AKI windows, and switching the policy
  invalidates fitted models and projections. Later time balancing, run-in and
  factor removals are not included in that count.
- **Mixed models.** Stricter minimum data requirements, singular fits flagged
  and their projections withheld, and the time origin and dropout assumptions
  documented on the methodology page. The earlier methodology wording may be
  replaced.
- **Not changed for now:** AKI episode merging and staging; the rapid-decline
  flag; quarterly calendar-median aggregation (made visible only).
- **Architecture.** Analyses become modular: domain rules (nephrology) live in
  modules on top of a generic core. The workspace becomes the only interface;
  the legacy interface at `index.html` is removed.

## Approved requirements

### Observed events and recovery

Evaluate G4 and G5 independently, using default eGFR thresholds of strictly
below 30 and below 15 ml/min/1.73 m² respectively. The owner clarified that
the requested configurable setting is the confirmation interval; this decision
does not additionally require configurable observed-event value thresholds.

For each endpoint, process dated measurements in chronological order:

1. The first value below the threshold starts an unconfirmed candidate.
2. A subsequent value below the same threshold confirms that candidate if at
   least the configured minimum number of days has elapsed. Default: 90 days.
   Earlier low values do not move the candidate date or restart the interval.
3. A value at or above the threshold before confirmation interrupts the
   candidate. A later low value starts a new candidate and confirmation interval.
4. Record the candidate's first crossing as the event date and the earliest
   qualifying later measurement as the confirmation date. Retain the associated
   measurements; a candidate alone is not a confirmed event.
5. Once confirmed, preserve the event, its dates and associated measurements.
   Show subsequent recovery separately; it does not revoke or redate the event.

Examples (G5, default interval): January 14, May 13, November 20 gives a January
event date, May confirmation and separately visible November recovery.
January 14, March 20, May 13 interrupts the January candidate; May starts a new
candidate requiring its own later confirmation.

### Individual prediction

Use all dated exact numeric measurements initially, including later recovery values.
Do not truncate the prediction input at an observed event or discard recovery
values to preserve an earlier prediction. Future changes to input selection need
an explicit documented policy. When connecting this rule to existing optional
censoring, AKI exclusions and aggregation, document the effective input policy;
do not silently describe a filtered or aggregated fit as using all measurements.

Continue the fitted trend line rather than shifting its origin to the latest
measurement. For a linear fit `y(t) = intercept + slope*t`, a target `q` is
crossed at model time `(q - intercept) / slope` when a crossing exists in the
intended direction and time domain. New data may change a recalculated prediction;
the already confirmed observed event remains unchanged.

### Theil-Sen

- Require at least three usable observations. With fewer, keep measurements
  visible but do not compute a Theil-Sen trend.
- Use the Python reference convention:
  `intercept = median(y) - slope * median(x)`.
- Include slope confidence bounds using the Python reference algorithm and
  confidence-level convention. These describe uncertainty in the estimated
  slope, not a prediction interval for future individual measurements.

### Required documentation and implementation acceptance

All substantive decisions and algorithms must be documented. For each numerical
change, update this decision record, the user-facing methodology, relevant
configuration help and export provenance together. Specify inputs, units,
defaults, configurable settings, formulas or algorithm steps, missing/duplicate
data handling, boundary cases and limitations, with worked examples and tests.
Record any remaining edge-case decisions rather than silently inventing a rule.
Update parity fixtures deliberately and describe changes from prior outputs.
Implementation, tests and research acceptance remain separate checklist items.

## Historical comparison used in the decision walkthrough

The following describes the pre-change code and alternatives presented to the
owner. The approved requirements above resolve these choices.

## Observed G4/G5 events — issue #4

The pre-change observed-G5 code checked a value below 15, confirmation at least
90 days later and no subsequent recovery. The following synthetic sequence
illustrates why a first-event definition needs a separate decision:

| Date | Value | Consequence of the existing rule |
| --- | ---: | --- |
| 2020-01-01 | 14 | Candidate first crossing |
| 2020-05-01 | 13 | Qualifying confirmation |
| 2020-09-01 | 12 | Becomes the recorded confirmation date |
| 2020-11-01 | 20 | Invalidates that candidate despite the earlier confirmation |

Decision: preserve confirmed events after recovery, retain both dates, and use
the independently evaluated endpoints and configurable interval specified above.

Evidence: [implementation](../src/core/endpoints/ckdEndpoints.ts),
[current tests](../tests/core/endpoints/ckdEndpoints.test.ts),
[event-time questions](research-endpoint-readiness.md).

## Individual projection anchor — issue #4

Consider values 60, 50 and 25 at model years 0, 1 and 2. OLS gives intercept
62.5 and slope -17.5 per year; the fitted value at year 2 is 27.5.

For a target value of 15:

| Anchor | Remaining years after year 2 |
| --- | ---: |
| Latest measured value, 25 | (25 - 15) / 17.5 = 0.5714 |
| Fitted value at year 2, 27.5 | (27.5 - 15) / 17.5 = 0.7143 |

The legacy individual endpoint uses the latest-measurement anchor; the newer
mixed-model projection contract uses the fitted curve. The owner selected
migration of the individual path to the fitted curve. This migration
changes existing numbers and needs corresponding export/methodology updates.

## Theil-Sen conventions — issue #6

| Decision | Current web behavior | Python reference behavior |
| --- | --- | --- |
| Minimum number of observations | Two | Three |
| Intercept | Median of y - slope*x | Median(y) - slope*median(x) |
| Slope confidence bounds | Unavailable | Non-parametric bounds |

For x = [0, 1, 2, 3] and y = [0, 0, 4, 9], both slopes are 3.5;
the intercept is -2.25 on the web and -3.25 in the Python reference. Agreement
on slope alone therefore does not establish agreement on plotted lines or
threshold crossings. The owner selected the Python convention for minimum
counts, intercepts and slope confidence bounds as recorded above.

Evidence and reproducible fixture provenance:
[Theil-Sen reference record](../tests/goldens/theil_sen.md).

## Research and product acceptance

The remaining input is a set of representative research files and intended
questions (including desired covariates and outcomes), plus first-user workflow
acceptance. The automated large-cohort check uses synthetic data; it does not
define adequate performance or statistical validity for a real research cohort.

Intervention models, event-time analysis, arbitrary input mapping, additional
derivations and complete saved projects still need their own concrete scope.
They are retained in the [completion backlog](workspace-completion-backlog.md),
not silently treated as finished or removed.
