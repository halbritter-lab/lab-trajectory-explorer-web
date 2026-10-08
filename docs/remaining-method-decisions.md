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
proceed; the owner confirmed all of them on 2026-10-07 and 2026-10-08 (see
"Proposed defaults confirmed" below). The marks are kept here as the record
of that day.

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
  Confirmed by the owner on 2026-10-08.
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
  `nFitted` counts the points handed to the fit after windows and time
  balancing (one monthly or quarterly bin is one point); it is zero if the sole
  exact point is excluded or the fit model is disabled, while `nNumeric` still
  reports the original dated numeric row count.
- **KDIGO threshold comparisons** use an inclusive 1e-12 tolerance in the
  compared quantity (mg/dl for absolute values, dimensionless for ratios), so
  a rise of exactly 0.3 mg/dl or exactly 1.5× is detected despite binary
  rounding. The stage-1 floor and stage-2/3 boundaries use the same rule;
  episode clustering and staging priority are unchanged and are written out in
  [method algorithms](method-algorithms.md#kdigo-creatinine-aki-detection). A clinically smaller
  rise such as 0.299999 mg/dl remains below threshold. Implemented in this P4
  package.
- **AKI detection and eGFR derivation** accept eligible serum creatinine in
  mg/dl or µmol/l, converting the latter to mg/dl by division by the central
  88.42 constant before comparison or formula evaluation (the EKFC Q
  polynomial alone uses 88.4; open decision OD-12). Common micro-sign,
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
  invalidates fitted models and projections. Later time balancing and factor
  removals are not included in that count; a chronic run-in stage exists in the
  core but no interface path selects it. As implemented, the Cohort models page
  builds the series configuration as general exploration, so these windows are
  empty there and the count is always 0 (open decision OD-1).
- **Mixed models.** Implemented in P5: a technical minimum of ten qualifying
  patients with three distinct times for random slopes or two for random
  intercepts; singular fits flagged, their projections withheld, and time
  origin and dropout assumptions documented on the methodology page. The
  minimum is not a statistical power guarantee. It counts qualifying patients
  and does not remove the others, and it applies to the pooled model and to
  each group separately.
- **Not changed for now:** AKI episode merging and staging; the rapid-decline
  flag; quarterly calendar-median aggregation (made visible only). Their rules
  as implemented are written out in [method algorithms](method-algorithms.md):
  the AKI rules under *Known limitations* of the AKI section, the missing
  reliability gate of the flag as open decision OD-10, and the bin and
  representative-date rules under *Time balancing*.
- **Architecture.** Analyses become modular: domain rules (nephrology) live in
  modules on top of a generic core. The workspace becomes the only interface;
  the legacy interface at `index.html` is removed.

## Documentation review of 2026-10-07

A review compared every implemented rule with the documentation. The
[algorithm reference](method-algorithms.md) was then completed to describe the
application as implemented, including import and value interpretation,
demographics resolution, the fit pipeline and presets, time balancing, OLS,
rolling and segmented OLS, eGFR formulas, AKI episodes and exclusion windows,
clinical events, and the cohort mixed-model specification and projections.

No behaviour was changed. Where implemented behaviour conflicts with
user-facing documentation or looks unintended, the reference describes it as it
is and marks it **Open decision OD-n**. The
[list of open decisions](method-algorithms.md#open-decisions) has 29 entries;
each needs an owner decision to change either the code or the description. The
methodology page was not edited; wording changes there remain the owner's call.

## Decisions of 2026-10-07 (open-decision walkthrough)

Taken by the project owner in a walkthrough of the 29 open decisions and the
three defaults marked *(proposed)* above.

Status on 2026-10-07: the 19 behaviour changes below and the text change of
OD-6 are implemented, each with tests, a changelog entry and an updated
section in [method algorithms](method-algorithms.md#resolved-decisions); one
stored regression case moved deliberately (`"1.234"` in
`tests/goldens/wert.json`, OD-8). The owner approved Part A of the
[methodology wording drafts](methodology-wording-drafts.md) on the same day;
it is applied to the methodology page, and the markers of OD-3, OD-4, OD-5,
OD-10 and OD-12 are removed. Part B of the drafts, topics the page did not
cover, was approved on 2026-10-08 and is applied as well (see "Follow-up
decisions of 2026-10-08"). Details of the implementation that the
decisions did not spell out are listed under "Implementation notes" below and
are open to the owner's revision.

Release scope: 0.3.0 resolves the items listed under "before 0.3.0". The four
items under "after 0.3.0" ship with their markers in place.

### Proposed defaults confirmed

- Individual G5 projection horizon: 20 years after the latest eligible
  measurement.
- Percent-decline baseline: mean of the eligible values in the first 90 days;
  candidate search starts after that window.
- Maximum confirmation window: 12 calendar months, for G4/G5 and percent
  decline.
- Confirmed on 2026-10-08: once kidney failure was reached, no individual G5
  projection is computed for the time before kidney replacement therapy.

### Change the behaviour before 0.3.0

| ID | Decision |
| --- | --- |
| OD-1 | The Cohort models page uses the preset selected under Trajectories, so event censoring, AKI windows and time balancing take effect there. |
| OD-2 | Implement rolling OLS as described: the reported slope stays the global OLS slope (reliability, rapid-decline flag and sorting unchanged); the window slopes are drawn as lines, and the number of windows and the smallest and largest window slope appear in the table and the export. |
| OD-7 | Dialysis intent is matched without regard to case, like the event type. |
| OD-8 | Text values with exactly three decimals after a dot (`0.850`, `1.234`) are read as decimals, and the import reports the affected values with a count and examples. Confirmed by the owner as implemented on 2026-10-08. |
| OD-9 | When all fitted points share one date, a separate neutral note states that no slope exists; the "slope was fitted" caveat is not shown. |
| OD-13 | Creatinine values of zero or less are excluded from AKI detection, as in eGFR derivation, and counted as implausible in the import. |
| OD-14 | No AKI episodes from the start of chronic dialysis (until a later transplant) or inside a dated acute-dialysis interval. Detection continues after transplantation. |
| OD-15 | A derived eGFR inherits the non-exact status of its creatinine row and stays out of fits and endpoints. |
| OD-16 | The projected age starts from the exact age when a birth date is known. Otherwise it starts from whole years and is displayed as a whole number with a note. |
| OD-17 | The projection's minimum follow-up becomes 365 days, the same as the slope reliability rule. |
| OD-18 | A confirmed observed G5 always suppresses the projection, also when the observed-G5 endpoint is switched off. |
| OD-19 | A minimum confirmation interval longer than 12 months is rejected with an explanation. |
| OD-20 | One rule everywhere: a series counts as eGFR by the unit ml/min/1.73 m², whatever its name. A clearance in ml/min no longer receives endpoints or the rapid-decline flag. |
| OD-23 | The "Group interaction" preset stores a numeric attribute as a numeric factor without a reference level. |
| OD-24 | The JavaScript date-parser fallback for attribute birth dates is removed; a rejected date is ignored with a warning. |
| OD-25 | Two accepted headers for the same lab or event column produce a warning naming the column used. |
| OD-26 | Lab rows without a patient ID are counted and listed as rejected. |
| OD-27 | With pre-parsed value columns, an empty operator beside a valid number counts as exact. |
| OD-28 | The age-plausibility rules stay; changed and dropped ages are counted and reported in the import. |

### Keep the behaviour, correct the description before 0.3.0

| ID | Decision |
| --- | --- |
| OD-3 | Segmented OLS stays as implemented. The methodology page describes splitting at gaps over 180 days only, one line per fitted segment and the global slope as the reported number; events as split points are no longer claimed. |
| OD-4 | The three-measurement minimum and the confidence gate stay. The methodology page states that three measurements almost never yield a projection and shows an example that does. |
| OD-5 | The eGFR formula default stays `off`. The methodology page no longer labels CKD-EPI 2021 the default. |
| OD-6 | The "Group interaction" preset text describes estimated slope differences with 95 % confidence intervals; no p-values are computed. |
| OD-10 | The flag stays without a reliability gate (decision of 2026-10-06). The methodology page describes it as a screening mark on any computed slope, to be read with the reliability note. |
| OD-12 | Both constants stay: 88.42 for measured creatinine, 88.4 inside the EKFC Q polynomial. The methodology page names both. |

### After 0.3.0, markers remain

| ID | Intended direction |
| --- | --- |
| OD-11 | Exact t quantiles above 40 degrees of freedom. |
| OD-21 | Remove the unused `tolerance` export field; pin R package versions. |
| OD-22 | A control to switch a factor between numeric and categorical. |
| OD-29 | Choose the default reference level from the fitted data. |

### Implementation notes

Choices made while implementing the decisions, each documented in the section
of [method algorithms](method-algorithms.md) concerned:

- **OD-2.** A window's line is drawn over the 180 days around the window
  centre, clipped to the window's own measurements, so that the lines of
  consecutive windows adjoin instead of overlapping.
- **OD-8.** The warning also counts bounds such as `< 1.234`. Typed numeric
  workbook cells and pre-parsed numbers are not counted.
- **OD-13.** The number of non-positive creatinine values is shown on the Data
  page under "Demographics and data quality", not in the import notice.
- **OD-14.** The creatinine values under dialysis are removed from the
  detection input, so they are neither a baseline nor a peak; a chronic
  dialysis ends on the day of the next kidney transplant on or after its start.
- **OD-16.** "Birth date known" means a birth date from the attributes table
  or the lab rows; a manual age and an age inferred from stated ages count as
  whole years. Without a birth date the badge shows the rounded value with a
  tilde (`G5 @ ~66y`); the export keeps the unrounded value and adds
  `endpoint_prediction_age_basis`.
- **OD-19.** The limit is 365 days. The input rejects a larger entry; a larger
  value in a stored configuration is evaluated as 365.
- **OD-20.** The accepted spellings were at first those the projection
  presets already accepted (`ml/min/1.73m2` after ignoring case and spaces,
  with a decimal comma, `²` or `^2`). An eGFR series imported with the bare
  unit `ml/min` no longer receives endpoints. The owner decided on 2026-10-08
  that `mL/min/{1.73_m2}` (UCUM), `ml/min/1.73qm` and `mL/min per 1.73 m2` are
  accepted as well; see "Follow-up decisions of 2026-10-08" below.
- **OD-18.** With the observed-G5 endpoint off, the cell shows
  `G5 not projected` and names the confirmed event in its detail text.
- **OD-26.** A row without a patient ID that is empty in every recognised
  column is still skipped silently.
- **OD-27.** The operator cell is trimmed before it is compared.
- **OD-28.** The report is a demographics conflict (`age_implausible`) under
  "Conflicts and their resolution" on the Data page.
- **OD-1.** A change under Trajectories to the fit model, time balancing,
  censoring or AKI exclusion of a parameter discards the cohort models fitted
  for that parameter. A parameter's own settings keep applying to its cohort
  model when the parameter is no longer shown as a Trajectories column.

### Follow-up decisions of 2026-10-08

Taken by the project owner on the points the walkthrough had left open.

- **Methodology page, Part B.** The seven new blocks of the
  [methodology wording drafts](methodology-wording-drafts.md) are approved as
  drafted and applied to the methodology page. The existing "Age" bullet of
  the eGFR section, which overlapped block B6, was shortened and refers to the
  new block. No behaviour changes.

- **eGFR unit spellings (OD-20).** Three further ways of writing
  mL/min/1.73 m² count as eGFR: `mL/min/{1.73_m2}` (UCUM), `ml/min/1.73qm` and
  `mL/min per 1.73 m2`, each with the same tolerance for letter case, spacing,
  decimal comma, `²` and `^2` as the plain form. This is a classification
  change: a series with such a unit now receives CKD endpoints, kidney failure
  reached, the rapid-decline flag and the cohort-model projection presets.
  Implemented as a list of four accepted comparison forms, so nothing else is
  widened: a unit with trailing text such as `ml/min/1,73 m² KOF` and
  `ml per min per 1.73 m2` are still not recognised. Tests, the changelog and
  [method algorithms](method-algorithms.md#eligibility-and-kidney-failure-reached)
  are updated; the golden fixtures contain no such unit and are unchanged.
- **OD-8 confirmed.** The implemented reading stands: text with exactly three
  digits after a point is a decimal (`1.234` is 1.234, `0.850` is 0.85), and
  the import reports the affected values with a count and examples. The entry
  had been recorded from a free-text answer pending this confirmation.
- **No pre-KRT projection.** The last rule still marked *(proposed)* stays:
  once kidney failure was reached, no individual G5 projection is computed for
  the time before kidney replacement therapy. The marks are removed here and
  in [method algorithms](method-algorithms.md); no value remains marked as
  proposed.

### Release gate

- The retained extensions (dated interventions, event-time analysis, input
  column mapping, further derivations, saved projects, exploratory estimators)
  are deferred until after 0.3.0.
- Order: implement the decisions above in verified packages, run a code
  review, then the owner's research-data acceptance run on the finished state
  ([checklist](research-acceptance.md)), then the release PR. Publication still
  needs the owner's explicit acceptance.

## Approved requirements

### Observed events and recovery

> Superseded in part 2026-10-06: confirmation must also occur within 12
> calendar months of the candidate (a later low value then starts a new
> candidate), and input is limited to endpoint-eligible exact measurements
> before kidney replacement therapy. See "Decisions of 2026-10-06" above and
> [observed endpoints and individual prediction](method-algorithms.md#observed-endpoints-and-individual-prediction).
> The steps below are kept as the 2026-09-23 record.

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

> Superseded 2026-10-06: prediction input is truncated at the first kidney
> transplant or chronic dialysis start and excludes complete dated acute
> dialysis intervals and bounds; a crossing is withheld when the slope
> confidence interval includes zero or lies more than 20 years ahead. See
> "Decisions of 2026-10-06" above and
> [observed endpoints and individual prediction](method-algorithms.md#observed-endpoints-and-individual-prediction).
> Only the first sentence of the first paragraph below is superseded: within
> the eligible rows the input is still not truncated at an observed laboratory
> event, and recovery values stay in the fit. The fitted-curve anchor in the
> second paragraph still applies.

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

Evidence: [implementation](../src/core/domains/nephrology/endpoints/ckdEndpoints.ts),
[generic evaluators](../src/core/endpoints/thresholdEndpoints.ts),
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
