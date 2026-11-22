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
  [method algorithms](method-algorithms/aki.md#kdigo-creatinine-aki-detection). A clinically smaller
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
- **Not changed for now:** AKI episode merging and staging (staging revised
  on 2026-11-16, merging on 2026-11-22); the rapid-decline
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
  [method algorithms](method-algorithms/endpoints-and-projection.md#eligibility-and-kidney-failure-reached)
  are updated; the golden fixtures contain no such unit and are unchanged.
- **OD-8 confirmed.** The implemented reading stands: text with exactly three
  digits after a point is a decimal (`1.234` is 1.234, `0.850` is 0.85), and
  the import reports the affected values with a count and examples. The entry
  had been recorded from a free-text answer pending this confirmation.
- **No pre-KRT projection.** The last rule still marked *(proposed)* stays:
  once kidney failure was reached, no individual G5 projection is computed for
  the time before kidney replacement therapy. The mark is removed from
  [method algorithms](method-algorithms.md), where no value remains marked as
  proposed; the entries of 2026-10-06 above keep their marks as the record of
  that day.

### Release gate

- The retained extensions (dated interventions, event-time analysis, input
  column mapping, further derivations, saved projects, exploratory estimators)
  are deferred until after 0.3.0.
- Order: implement the decisions above in verified packages, run a code
  review, then the owner's research-data acceptance run on the finished state
  ([checklist](research-acceptance.md)), then the release PR. Publication still
  needs the owner's explicit acceptance.

## Decisions of 2026-11-05 (clinical-research review, issue #34)

The owner requested these fixes on 2026-11-05 in issue #34; merging the
implementing pull request is his sign-off.

### Creatinine source and AKI

- **Non-serum creatinine is not serum creatinine.** Besides urine (`urin`,
  `harn`, an upper-case `UR` suffix), names marking dialysate, puncture fluid,
  ascites, pleura, liquor, drainage, secretions (`sekret`), lymph (`lymphe`)
  or "fluid", and the tokens `i.U.` (also `i. U.`), a lone `U` (`U-Kreatinin`,
  `Kreatinin U.`, `Kreatinin/U`, `Kreatinin_U`), `SU` (also in `24h-SU`),
  `SU24h`, `SPU`, `PU`, `CSF`, `Drain`, `PD` and `Serom` are excluded (token
  list extended in the review follow-up of 2026-11-05; the slash now separates
  tokens, so `Kreatinin U/l` is excluded too). Such series
  are no eGFR source, detect no AKI and supply no AKI episodes to other
  columns. Serum spellings such as `Kreatinin i.S.`, `Kreatinin (enzym.)`,
  `Kreatinin Serum` and `S-Kreatinin` stay eligible. Classification change:
  a dataset with such a series loses its eGFR source option and its AKI
  episodes. A saved session whose chosen source is now non-serum computes no
  eGFR; the Data page says so and asks for another source.
- **A computed eGFR takes its AKI episodes from its own source.** The
  creatinine pair the eGFR was derived from supplies the episodes of the
  computed eGFR column, instead of the patient's creatinine pair with the most
  rows. Other non-creatinine columns are unchanged. Example: `Kreatinin` 1.0,
  2.0, 1.9 mg/dl on consecutive days plus five later rows of
  `Kreatinin enzym.` now give the computed eGFR column the stage-II episode
  (before: none, both AKI values stayed in the eGFR slope).
- **Creatinine plausibility warning** *(thresholds confirmed by the owner, 2026-11-13)*. The Data page
  counts exact serum creatinine above 25 mg/dl (µmol/l converted) and computed
  eGFR above 200 mL/min/1.73 m². Warning only; no value changes. The thresholds
  target a µmol/l column labelled mg/dl and similar unit errors; a urine series
  that escapes the name rule can stay below 25 mg/dl, so the name rule remains
  the protection against urine. The deny-list of non-serum spellings stays
  (owner decision 2026-11-13, no allow-list), and imported eGFR columns keep
  taking their episodes from the patient's serum creatinine pair with the most
  rows.

Details and boundaries: [eGFR derivation](method-algorithms/egfr.md#eligible-source-series)
and [KDIGO creatinine AKI detection](method-algorithms/aki.md#input-series-and-conversion).
The golden fixtures contain only `Kreatinin` (mg/dl and µmol/l) and no value
above either threshold; they are unchanged.

## Decisions of 2026-11-05: endpoint and projection input (issue #34)

Requested by the project owner after the clinical-research review of
2026-11-03 (issue #34, section "Endpoint and projection input"). Merging the
implementing pull request is the owner's sign-off. Details, boundaries and
recomputed examples are in
[method algorithms](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction).

- **Decline baseline and G5 projection leave out the column's AKI windows.**
  When a column's fit excludes AKI windows (fit configuration switch on, as in
  CKD progression, or slope mode `aki-aware`), the rows inside those windows
  are left out of the decline baseline and of the G5 projection fit, exactly
  the two inputs issue #34 named. Observed G4/G5, the total percent change and
  the rows that start or confirm a 40 %/57 % decline keep every eligible row
  (review follow-up of 2026-11-05: the first version removed the windows from
  all endpoint input, and in advanced CKD, where the 0.3 mg/dl criterion fires
  on ordinary variation, this lost a sustained observed G5 whose rows lay
  103 of 104 inside AKI windows). Without AKI exclusion nothing changes.
  `endpoint_input_policy` then ends in "; AKI exclusion windows excluded from
  decline baseline and projection". Example: stable eGFR 34-36 for three years
  followed by eight AKI values of 16-26 projected `G5 @ 65.0y` (bounds
  [-7.43, -2.46]); it is now withheld as `non_declining_fit`, while the total
  change stays -53 %. Values 20 and 25 during an AKI followed by 55, 58, 56,
  33, 32 had a decline baseline of 33.3 and no 40 % decline; the baseline is
  now 56.5 and the 40 % decline is confirmed, while the total change stays a
  rise of 60 % from 20.
- **Theil-Sen projection needs five distinct dates.** The Theil-Sen estimator
  and its 95 % bounds are unchanged. With up to five observations those
  bounds are the full range of pairwise slopes, whose actual coverage is
  1 - 2/n! (67 % for three, 92 % for four, 98 % for five). The G5 projection
  under Theil-Sen is therefore withheld below five distinct dates, with the
  new reason `theil_sen_insufficient_points` (badge `G5 < 5 dates`). Example:
  40, 39, 30 at years 0, 1, 2 gave bounds [-9.0, -1.0] and `G5 @ 65.8y`.
- **Minimum counts count distinct dates.** The slope reliability rule
  (`unstable_slope`, quality notes) and the projection's three-measurement
  minimum count distinct calendar dates instead of rows. `n` and `n_fitted`
  keep their meaning. Example: 40, 40.2 and 39.8 on one day and 30 a year
  later were a reliable slope with `G5 @ 62.5y`; the slope is now unstable
  (note "< 3 dates, uncertain slope") and the projection is withheld as
  `insufficient_points`.

Not changed: the display fit, `nNumeric`/`nFitted`, the Theil-Sen estimator,
and the golden fixtures (none covers endpoints or the reliability rule, so no
stored value moved). The methodology page still describes the earlier rules
in three places; its wording is the maintainer's call and is listed in the
pull request.

Owner answers to the review questions (2026-11-13):

- The AKI-window scope stays as described: decline baseline and projection
  only. Observed G4/G5 and confirmed declines keep every eligible row; their
  90-day confirmation protects them against transient AKI dips.
- The G5 projection stays an independent fit on unbalanced rows, so a
  balanced display note such as "n < 3, uncertain slope" can still sit next
  to a projection.
- `theil_sen_insufficient_points` keeps its position, directly after
  `insufficient_points`, and its export value.
- The methodology wording is written after the merges, together with the
  split of `method-algorithms.md` (issue #44).

## CKD-EPI 2009 equation (2026-11-05)

Requested by the project owner on 2026-11-05 in issue #4 ("Clinical review
2026-11-03: decisions needed", eGFR equations): CKD-EPI 2009 (Levey et al.,
Annals of Internal Medicine 2009;150:604-612) becomes a selectable eGFR
formula, so that computed series can be compared with GCKD analyses that used
it (Behning et al., Kidney International Reports 2026;11(2):103696,
doi:10.1016/j.ekir.2025.11.021).

- The default stays `off` (OD-5); CKD-EPI 2021, MDRD-4 and EKFC 2021 values are
  unchanged.
- Same conditions, age limit, sex handling (`d` as male) and rounding as
  CKD-EPI 2021. The series name is `eGFR (CKD-EPI 2009 (race-free), computed)`.
- Deviation from the published equation: the race coefficient (× 1.159) is not
  applied, because the data model carries no race. The result equals the
  published equation for a non-Black patient. Decided 2026-11-13: the label is
  `CKD-EPI 2009 (race-free)`, so the series name and export keys say so; the
  selector lists it directly after CKD-EPI 2021.
- Coefficients and worked values:
  [method algorithms](method-algorithms/egfr.md#formulas).

## Decisions of 2026-11-13 (R reproduction export, PR #43)

- **OD-30, full precision.** Estimates, intervals and variance parameters are
  returned from R at full precision (`digits = NA`) instead of four decimal
  places. A deliberate numeric change to stored results and exports; values
  move in the fifth decimal and beyond, and values between 1e-5 and 5e-5 are
  no longer stored as 0. No golden fixture holds a webR result, so none moved.
- **Level order.** Non-reference factor levels are ordered by code point
  (`sort(method = "radix")` in R, JavaScript default sort in the browser), so
  the coefficient order does not depend on the locale.
- **Accepted as implemented:** calendar dates outside the dataset hash, one
  `vcov` sheet with one block per model, `unit_key` next to `group`, a dropped
  `vcov` reported as a fit warning. The readxl type-guessing caveat for
  `group` is documented in the `about` sheet.

## Release review of 2026-11-15

A review of everything merged since version 0.3.7 found the points below. The
owner decided the creatinine name rule on 2026-11-15; the other items restore
or protect documented behaviour and change no fitted number.

- **A `u` between two blood-material words is "und", not urine** (owner
  decision 2026-11-15, resolves OD-32). The token rule of 2026-11-05 read the
  German abbreviation "u." as urine, so `Kreatinin im Serum u. Plasma`,
  `Kreatinin (Serum u. Plasma)`, `Kreatinin i.S. u. P.` and
  `Kreatinin vor u. nach Dialyse` lost their eGFR and AKI detection, although
  they were eligible in 0.3.7. A lone `u`, with or without a dot, is now
  removed only between two of the words Serum, Plasma, Vollblut, HP, S and P
  (so also `i.S.` and `i.P.`), or between `vor` and `nach`, separated by
  whitespace only. Everywhere else it stays urine: `Kreatinin U enzymatisch`,
  `24h U Kreatinin`, `Kreatinin U mg/dl`, `Kreatinin U u. S` and
  `Kreatinin S u. U` are non-serum. The owner chose this after a review showed
  that a wider first rule (any word on both sides) turned urine names into
  serum creatinine; an unknown spelling is now excluded, which the Data page
  shows, instead of being used silently. Square brackets and colons separate
  tokens, so `Kreatinin [U]` and `Kreatinin:U` are non-serum. Compared with
  `main` before this change, only the "und" names above become eligible and
  only `[U]` and `:U` become non-serum; no released version is affected,
  because the token rule was never released.
- **Withheld G5 projection names the AKI exclusion.** When AKI windows
  removed at least one row from a cell's projection input, the badge detail
  for `G5 < 3 dates`, `G5 < 5 dates` and `G5 < 1 yr` starts with
  "Measurements inside AKI exclusion windows are left out of the projection."
  and speaks of "the measurements used"; the details for a crossing beyond
  20 years and for a fitted curve already below 15 get the same lead and name
  "the latest measurement used". Before, a series of 104 values over two
  years, 103 of them inside AKI windows, was described as having measurements
  on fewer than three dates. A column that excludes AKI windows by its preset
  but lost no row to one keeps the plain detail, so AKI is not named as the
  cause where it is not (review of the fix, same day). Labels, reasons and
  export values are unchanged; the endpoint result gains
  `projectionPointCount`.
- **Reliability rule also tests the point count.** `isUnstableSlope` returns
  unstable for `nFitted < 3` as well as `nFittedDates < 3`. Dates never exceed
  points, so no result of the application changes; a caller of the library
  package without `nFittedDates` no longer gets "stable" for two points.
- **Cohort model workbook: stable positions and `unit_key` everywhere.**
  Sheets and columns of 0.3.7 keep their positions: `vcov`, `model_rows`,
  `model_input_flags` and `r_script` follow `about`, and `std_error` and
  `unit_key` are the last columns of every 0.3.7 sheet, also when its rows
  have different shapes (a failed fit beside a successful one, a numeric
  factor beside a categorical one). Every sheet that names a
  unit carries `unit_key`, so the two covariance matrices of a pooled model
  and a group named "Whole cohort" can be told apart.
- **AKI detection scans each patient's rows once.** The dataset pass buckets
  rows per patient. Same episodes and windows; a dataset of 1,500 patients
  with 120 creatinine values each is analysed in 2.5 s instead of 43.8 s on
  the development machine.

Details: [eGFR derivation](method-algorithms/egfr.md#eligible-source-series),
[reliability rule](method-algorithms/slope-quality.md#reliability-rule) and
[cohort mixed models](method-algorithms/cohort-models.md#cohort-mixed-models). The golden
fixtures contain only `Kreatinin` and are unchanged.

## Decisions of 2026-11-16 (science audit)

Taken by the project owner after an audit of the methods against their
published sources. Merging the implementing pull request is the owner's
sign-off. Details, boundaries and recomputed examples are in
[AKI staging](method-algorithms/aki.md#staging) and
[trend estimators](method-algorithms/trend-estimators.md).

- **AKI stages are graded against the seven-day minimum.** Until now a
  crossing detected by the absolute criterion (at least 0.3 mg/dl above the
  48-hour minimum) was graded against that 48-hour value, so an extra
  measurement on the day before a peak lowered the stage: 1.0 mg/dl on day 0,
  1.2 on day 3 and 3.2 on day 4 gave stage II (2.67-fold), where KDIGO grades
  3.2 against 1.0 as stage III. Now every crossing is graded against the
  lowest positive value of the seven days before it, and an episode reports
  the highest stage of its crossings. This revises the staging part of the
  2026-10-06 decision "Not changed for now: AKI episode merging and staging".
  Episode merging stays as decided then (revised on 2026-11-22, see
  [below](#decisions-of-2026-11-22-aki-episodes-separated-by-recovery-issue-67)): detection, the recorded baseline,
  the grouping of crossings into episodes, onset dates and exclusion windows
  are unchanged, so 1.0, 2.9 and 3.2 mg/dl on days 0, 5 and 6 remain two
  episodes (now stages II and III, formerly II and I). A stage is never lower
  than before. Slopes, endpoints and exclusion windows do not depend on the
  stage; chips, marker labels, tooltips and the `aki` export column can
  change. No golden fixture value and no stage in the bundled demo workbook
  moved (8 episodes checked). The episode marker's tooltip names the value and
  the seven-day reference that give the stage ("staged against 1 mg/dl, the
  lowest value of the 7 days before") in place of the detection baseline it
  printed before, which no longer explained the stage (3.2 against a
  "baseline 1.2" is 2.67-fold, not stage III).
- **Theil-Sen bounds on fewer than five dates are labelled a range.** The
  interface reads `Slope range` instead of `95% slope CI` for a Theil-Sen fit
  on fewer than five distinct fitted dates. The hint under the bounds says
  that this is not a 95 % interval because the fit has fewer than five
  distinct dates, and gives the coverage for one measurement on each of three
  or four dates (about 67 % or 92 %); with two dates or several measurements
  on one date no coverage figure is claimed. Numbers and the values of
  `ci_low` and `ci_high` are unchanged. The export gains the column
  `n_fitted_dates`, appended last, so that the affected rows can be
  identified, and the workbook's `about` sheet refers to it.
- **The methodology page follows both decisions (OD-33, resolved).** The
  maintainer approved four sentences on 2026-11-16: `Aki.tsx` now says that
  episodes are staged against the lowest value of the previous 7 days, that
  no earlier baseline is used (so an AKI present at the first measurement or
  a rise slower than 7 days is not detected), and that daily values of 1.0 to
  3.0 mg/dl give four episodes of stages I, II, II and III; `Fits.tsx` says
  that Theil-Sen bounds on fewer than five dates are not a 95% interval. The
  fuller texts of the [wording drafts](methodology-wording-drafts.md) (C8,
  D3) are still to be approved.

## Methodology wording approved on 2026-11-16

The project owner approved the wording drafts of Parts C, D and E1 of the
[methodology wording drafts](methodology-wording-drafts.md) for the in-app
methodology page, after a fact check against the code, an editorial review
and a pre-analysis. No rule and no numeric result changes with them.

- **Approved as a block:** C1 to C10 and C13, D1 (b), D3 (a) in its reduced
  form, D3 (b), (h) and (i), E1, and the alignment of terms ("time
  balancing", "Theil–Sen", "1.73 m²"). Two gaps found by the pre-analysis are
  closed with them: the AKI stage list refers to the lowest value of the
  previous 7 days and says that an episode gets the highest stage that any of
  its values reaches, and the status row "G5 no fit" names Trend being
  switched off.
- **Clinical rationale kept:** "at high creatinine, ordinary variation can
  meet the AKI criterion, so a sustained G5 can lie inside AKI windows and is
  still counted" (C6, C12).
- **C11 in two sentences:** the 57 % threshold only approximates a doubling
  of serum creatinine and depends on the equation; the percentages stay in the
  drafts file and are not on the page.
- **C12 approved:** the settings table "Settings that change which
  measurements are fitted" and the sentence on cohort models.
- **D2 approved:** the list "Rules of this tool that are not published
  standards", with "have not been validated against outcomes".
- **D3 (e), (f), (g) approved,** (f) without a literature reference.
- **Three interface wordings:** "projection" replaces "prediction" in the
  headings, navigation labels and text of the methodology page and in the
  endpoint hint of the settings (the section id `prediction` and with it the
  link `#methods/endpoints/prediction` stay); the projected age is shown as a
  whole number marked as approximate on either age basis (`G5 @ ~66y`), which
  extends the display rule of OD-16 to the birth-date basis, while the export
  keeps the unrounded value; the settings heading reads "AKI exclusion
  windows" instead of "AKI exclusions (KDIGO)", with a hint that detection
  follows KDIGO and the window length is a rule of this tool.
- **Not approved yet:** the full reference list D1 (a). It waits until the
  owner has compared the EKFC coefficients with the paper and the EMA
  guideline is confirmed. Only the CKD-EPI 2009 citation (C5) was added to
  the existing list.

## Decisions of 2026-11-16 (export column and saved settings)

Owner decisions after the simulated-user case studies.

- **`endpoint_percent_decline` is renamed `endpoint_percent_change` and takes
  the badge's sign.** The column is the total change from the first to the
  latest eligible value in percent: negative for a fall, positive for a rise
  (first 50, latest 30: `-40`, formerly `40`). It keeps its position. "Change"
  rather than "decline" because the value can rise, and rather than "slope"
  because it is not a rate per year; "decline" stays the word for the
  confirmed 40 %/57 % events. The core result field `percentDecline.value` is
  unchanged (a decline, positive for a fall); the sign is turned at the export
  boundary. This breaks scripts that read the old name, and silently flips the
  sign for scripts that read by position; the changelog says so. Details:
  [endpoints and projection](method-algorithms/endpoints-and-projection.md).
- **Saved analysis settings.** "Remember on this device" also keeps the
  Trajectories settings (fit settings, selected parameters, Trend, trend
  lines, display). No numeric rule changes: a restored setting gives the same
  result as choosing it again.
- **Several creatinine series are not merged for eGFR** for now; an explicit
  choice by the user is tracked in issue #4.

## Decisions of 2026-11-17 (rapid-decline flag and interval note)

Owner decisions after the simulated-user case studies (UX-17, UX-18), taken
on examples from the demo data.

- **The rapid-decline flag is not set on an unreliable slope.** A slope that
  meets the reliability rule (fewer than three fitted measurement dates or
  less than 365 days of fitted span) carries the reliability note alone;
  "rapid ↓" and `rapid_progression` are not set. This replaces the decision
  of 2026-10-06/07 (formerly OD-10), which kept the flag without a gate. It
  changes export values: `rapid_progression` turns from `yes` to blank for
  such cells. No slope, interval or `unstable_slope` value changes. Demo data,
  General exploration: patient 12 (−7.35 per year, follow-up under a year)
  loses the flag.
- **A 95% interval with zero inside is named, and nothing else follows from
  it.** The cell shows "Interval includes 0". The reliability rule is not
  extended: `unstable_slope` and the flag ignore the interval, so patient 6
  (−6.20 per year, interval −25.08 to 12.68) keeps "rapid ↓" and gets the
  note. Extending the rule was considered and not chosen.

Details: [rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag)
and [labels](method-algorithms/slope-quality.md#labels).

## Decisions of 2026-11-21 (persona review, issue #34)

Owner decision after the persona review of 2026-11-21 (item K26), taken on
synthetic files with several creatinine values per day; the demo data have no
such day.

- **The time of day orders the creatinine values of one day in AKI
  detection.** Where the file gives a time of day, it is kept at import and
  orders the values within the day; an earlier value of the day can be the
  baseline of a later one. Both KDIGO windows and the fit-exclusion window
  keep counting in calendar days. This replaces the earlier behaviour, in
  which the time was dropped and values of one day stayed in the row order of
  the file, so that a file with the newest row first reported a fall within a
  day as an episode and missed a rise.
- **Without a time of day there is no comparison within the day.** Values of
  the same day are compared only with values of earlier days, whatever the
  row order of the file. All values are kept and each is a possible baseline
  for later days. The alternative, reducing the day to its highest value, was
  considered and not chosen (the owner confirmed "no comparison within the
  day" on 2026-11-21). A rise within such a day is therefore not detected on
  that day.
- **The Data page names the affected patient-days.**
- **This changes numbers**: AKI episodes, their exclusion windows and
  therefore slopes, chips and the `aki_episodes` sheet, for files with
  several serum creatinine values per patient and day, with or without a time
  of day. Files with one value per day are unaffected. No golden fixture and
  no demo value moved, because none contains such a day.

Details chosen during implementation, **accepted by the owner with the merge
of PR #76 on 2026-11-22**:

- The time of day stays internal: a sort key that is not shown in the
  measurement table or the tooltips and is in no export (the review left
  this open). Consequence to weigh with it: a cohort workbook exported from
  a file with times and loaded again has no times, so AKI episodes can
  differ from the export although `input_data_id` is the same; the `about`
  sheet, the changelog and the method reference say so. Writing the time as
  an appended column of `raw_measurements`, reading it at re-import and
  taking it into `input_data_id` would remove the difference. *Superseded on
  2026-11-22*: the time is now shown and exported, see
  [the decisions of 2026-11-22](#decisions-of-2026-11-22-open-points-of-the-persona-review).
- The rule for days without a time applies per day of a series, not per
  file: one value without a time makes that day a day without time; the
  other days keep their time order.
- Midnight (00:00:00) counts as no time of day, so that a date-only workbook
  cell, a workbook cell at midnight and text with "00:00" behave alike.
- Values with the same time of day are not compared with each other.
- The patient-day count covers serum creatinine only, the one series the
  rule affects.
- "The import names the affected patient-days" is implemented as a note
  under "Demographics and data quality" on the Data page, which stays while
  the dataset is loaded, and as a sentence with the count in the message
  shown after an import of lab values. The count is not listed among the
  import diagnostics and is not part of the warning count, like the other
  creatinine notes of the Data page.

Details and examples:
[measurements on the same date](method-algorithms/aki.md#measurements-on-the-same-date)
and [dates at import](method-algorithms/import-and-values.md#dates). The
methodology page was not changed that day; its wording was drafted as G1 in
the [methodology wording drafts](methodology-wording-drafts.md), tracked as
OD-34 and applied on 2026-11-22.

## Decisions of 2026-11-21 (persona review, issues #74, #2, #34)

Owner decisions after the simulated-user review of 2026-11-21, taken on
synthetic examples and the demo data.

- **Implausible lab dates give a warning, not a rejection.** A lab date after
  the import day or before 1927-05-18 is reported once per affected patient
  with the date; the row stays in the analysis unchanged. The lower bound is
  the one that already applies to Excel serial numbers. No value, slope or
  export column changes. Example with import day 2026-11-21: 3024-05-08,
  1923-07-18, 0203-06-05 and 2026-12-15 are reported; a mistyped 2003-08-08
  in a series of 2023 is not. Event dates, event end dates and birth dates
  are not checked; whether they should be is open (decided on 2026-11-22:
  they are, see below).
  Details: [Dates](method-algorithms/import-and-values.md#dates).
- **Age conflicts keep one level and name the rows** (issue #2). Stated ages
  that fit no single birth date stay a "Conflict" whatever the size of the
  deviation, and the rule without tolerance stays. The message names the lab
  dates with the stated and the derived age (the number of differing lab
  dates and the first three) instead of the day count, which measured the gap
  between birth-date intervals and not the error. No age, eGFR value or
  export column changes; the text in the `warnings` column of the
  `demographics` sheet changes with the message.
  Details: [Age](method-algorithms/demographics.md#age).
- **The LOINC code marks the material for creatinine only** (issue #34;
  **changes numeric output** for files that carry such a code). Creatinine
  with a known non-serum code becomes its own, labelled series and is
  excluded from AKI detection and eGFR, like a non-serum name. The non-serum
  codes are 2161-8 and 14683-7 (urine), confirmed by the owner on 2026-11-21;
  whole-blood creatinine (38483-4, 59826-8) stays eligible like serum. Other
  series with several codes are only reported, and LOINC is shown and
  exported (`loinc` appended to `measurements`, `raw_measurements` and
  `parameters`). This complements the name rule of 2026-11-05 and does not
  replace it; merging series by LOINC stays undecided (issue #68).
  What moves: in a file where serum and urine creatinine share one test name,
  the urine rows leave the creatinine series. Its slope, the AKI episodes
  detected on it, the AKI exclusion windows of every column that takes its
  episodes from it, and the computed eGFR (fewer values, other slope) change.
  Synthetic example: eleven mixed values with five false stage 3 episodes
  become five serum and six urine values with no episode, and the computed
  eGFR has five values instead of eleven. (The five episodes had baseline and
  peak on one day without a time of day; under the same-day rule decided the
  same day the mixed series would no longer report them, the eleven eGFR
  values remain.) Files without these two codes on
  creatinine rows are unaffected: the demo data and the golden fixtures
  contain neither code, so no fixture moved.
  Details: [Series identity](method-algorithms/import-and-values.md#columns),
  [eligible source series](method-algorithms/egfr.md#eligible-source-series)
  and [AKI input](method-algorithms/aki.md#input-series-and-conversion).

## Decisions of 2026-11-21 (Trajectories table: slope order and decimals)

Owner decisions after the persona review of 2026-11-21, taken on examples
from the demo data. Neither changes a computed value.

- **A sort by slope places uncertain slopes after the reliable ones.** Under
  *Slope* and *Absolute slope*: first the slopes that do not meet the
  reliability rule, then the uncertain ones, then patients without a slope.
  The status line gives the number of rows moved back, and a switch restores
  the order by value. Demo data, imported eGFR ascending: patient 12 (−7.35
  per year over 151 days) moves from rank 9 to rank 25.
  Details accepted by the owner with the merge of PR #76 on 2026-11-22: the
  export keeps following the order of the table, so its row order changes
  with the new default; the switch is built.
- **One number of decimals per parameter for slopes.** As many decimals as
  give the median of the absolute slopes in the loaded dataset two
  significant digits, at least two; the same for the slope and its interval
  bounds, in the table, the patient view and on the Cohort models page.
  Display only; exports keep full precision. Demo data: creatinine in mg/dl
  takes three decimals (median 0.0948), eGFR stays at two.
  Details accepted by the owner with the merge of PR #76 on 2026-11-22: the
  number is derived from the slopes of the loaded dataset, not fixed per
  unit; it is limited to four decimals. Implemented without a separate decision: the slope is signed and
  padded in the patient view as in the table; every row of a model's
  coefficient table uses the number (before: three decimals for the estimate
  and two for the bounds), so an eGFR coefficient shows two decimals instead
  of three. This includes rows that are not slopes: the intercept and factor
  terms.
  Open for the owner: the median rule falls back to two decimals once the
  median absolute slope reaches 0.1, so small slopes of such a column read
  "+0.01 [0.01, 0.01]" again (demo creatinine under the CKD progression
  preset or Theil–Sen). Alternatives are a lower quantile than the median or
  the smallest interval width; nothing is changed until he decides.

Details: [table order, mark filters and displayed decimals](method-algorithms/slope-quality.md#table-order-mark-filters-and-displayed-decimals).

## Decisions of 2026-11-21 (plots and events, issues #70 and #2)

Owner decisions after the persona review of 2026-11-21 (items K27, K24 part 1
and K30). They concern display, image exports and one added export sheet.
**No number changes**: no estimate, flag, endpoint, AKI episode or existing
export column, and no golden fixture moved.

- **The user chooses the unit of the elapsed-time axis** (K27, option c).
  "Time axis" offers "Days since first measurement" beside "Years since first
  measurement". Nothing switches by itself, and the unit holds for the
  patient charts and the overlay until it is changed. Slopes stay per year.
  The calendar axis no longer repeats a date: a range under four days gets
  one label per day. The saved view accepts the new axis value
  `baselineDays`; a version of the app from before 2026-11-21 does not know
  it and falls back to years, naming "time axis" as not restored.
- **A dense overlay is drawn lighter in two steps, with a note** (K24 part 1,
  option a). From 51 trajectories the measurement points are off and the
  lines paler, from 201 paler still and thinner. The "Measurement points"
  switch stays and takes precedence. A median with a percentile band
  (part 2) was declined: the cohort-model line serves that purpose.
- **The shaded AKI window stays and is explained** (K30, option a). Legend
  and tooltip say that its length is the configured number of days after each
  onset, not the duration of the episode, and whether the column excludes the
  values from its fit.

Also added without a decision of its own, because the review items asked for
it: the export sheet `rolling_windows` (K18), one row per fitted Rolling OLS
window, placed after the sheets that existed before 2026-11-21 so that their
positions are unchanged. Another sheet added on the same day (`columns`,
cohort workbook) makes the same claim; **the order of the two is to be fixed
when both are merged**, and the wording here, in the changelog and in the
[trend estimators](method-algorithms/trend-estimators.md) then follows it.
The methodology page (Export) describes the sheet in one new row whose
wording awaits the maintainer's approval.

Details chosen during implementation, **accepted by the owner with the merge
of PR #76 on 2026-11-22**:

- Years stay the default of the elapsed-time axis, also when every loaded
  trajectory is short.
- The cohort-model preview stays in years. In the overlay the mixed-model
  line is also drawn on the days axis (model time × 365.25).
- The density note appears from 51 trajectories, not only from 201.
- The trajectories are counted per chart: those plotted in it, after the
  group legend and without series that have no numeric value. This is the
  count that decides the line density. A parameter that 5 of 60 patients have
  keeps its points while the chart of all 60 hides them; the switch is then
  shown as off.
- Points are hidden by the rule only while "Connecting lines" is on.
  Unticking the lines alone shows the points, so a chart is never left empty
  by the rule.
- The switch takes precedence from its first use and for good: that it was
  used is saved with the view (`pointsChosen`), so the choice holds after a
  reload. There is no control that returns to the automatic rule; clearing
  the saved data does.
- Image exports (SVG, PNG) of a dense overlay show what is on the screen,
  that is without points, and say so in their context line.
- "Acute review" gets no extra sentence under the chart; legend and tooltip
  carry the statement. *Superseded on 2026-11-22* by a sentence under the
  chart, see
  [the decisions of 2026-11-22](#decisions-of-2026-11-22-open-points-of-the-persona-review). The wording "this column has no fit, so nothing is
  excluded" also applies while Trend is not ticked for the column.
- Showing the actual episode duration as the band, once a recovery rule
  exists, is not decided.

## Decisions of 2026-11-21 (cohort workbook, persona review)

Owner decisions after the persona review of 2026-11-21 (issue #35). No
fitted number changes.

- **First and last value in the `cohort` sheet are the eligible ones.**
  `first_eligible_value` and `last_eligible_value` hold the measured values
  at `first_eligible_date` and `last_eligible_date`: exact values before the
  first kidney transplant or chronic dialysis, matching
  `endpoint_percent_change`, whatever the preset and also without a trend.
  They can differ from "latest" in the table.
- **`group` is always the last column, empty without grouping.** The
  ungrouped export keeps every position; only grouped exports change their
  layout.
- **The ID column is `PatientID` in every sheet, with one data type.**
  `events`, `patient_attributes` and `demographics` take the name of the
  result sheets. Scripts that read `patientId` there fail on the name.
- **A sheet `columns` at the end of the file** lists every column of the
  `cohort` sheet with meaning, unit and when the cell is empty.
- **The Theil–Sen preset is exported as `theil_sen`.** The export names the
  preset as the app does; the same values set by hand stay `custom`. Older
  exports show `custom` for the same choice. Saved settings are read as
  before.
- **`xAxis` is left out of the exported `fit_config`,** and the `about` sheet
  names the actual time axis of the trend. A script that reads `xAxis` no
  longer finds it.

Implemented on assumptions, **accepted by the owner with the merge of PR #76
on 2026-11-22**:

- `sex` and `baseline_age` were appended to the `cohort` sheet in the same
  step.
- The ID keeps the type the import gave it (a number for a numeric ID,
  otherwise text) in every sheet; `patient_attributes` no longer writes text
  for a numeric ID. Whether the ID should always be text is open; a dataset
  with both kinds of ID still has both cell types.
- `columns` covers the `cohort` (or `slopes`) sheet only.
- One `about` sentence says that the preset name only records how the
  settings were selected.
- `input_data_id` is defined as a 32-bit checksum of the rows of
  `raw_measurements` (issue #35, provenance item; no owner decision yet on
  the definition). It covers the imported birth date of the rows; events,
  attributes and manual demographic entries are not part of it.
- `patient_birth_date` was appended to the two measurement sheets, filled in
  `raw_measurements` only, so that a re-import of the workbook keeps an exact
  birth date instead of inferring an anchor from whole-year ages. The
  alternative is to leave the column out and state that birth dates are not
  restored.

New text that awaits the maintainer's approval: the section "Cohort-model
workbook" and the two changed table rows on the Methods page "Export &
reproducibility"; the line "Whole cohort, patients with enough measurement
times: n of m." in the fit summary of the Cohort models page; the new rows of
the two `about` sheets and the texts of the `columns` sheet. The note on
personal fields is to use the same wording as the notice of issue #75 (import
area) once that exists.

Implemented from issue #35 without a separate decision, export scope only:
the variance components on the `models` sheet (after `unit_key`, so
`unit_key` is no longer the last column of that sheet), the warnings of the
passed input check on the fitted result, and `app_version`/`exported_at` and
the personal-data note in the `about` sheets of both workbooks.

Still open, unchanged: whether patients who do not qualify stay in a cohort
model; whether the export records the grouping attribute (decided on
2026-11-22: it does, in `settings`);
whether the `cohort` sheet is reordered once; whether the Trajectories table
shows a bound with its sign ("latest <15"; decided on 2026-11-22: it does).

Details: [first and last eligible value, sex, baseline age and group](method-algorithms/fit-input-presets-and-time-balancing.md#first-and-last-eligible-value-sex-baseline-age-and-group),
[workbook sheets, column names and empty cells](method-algorithms/fit-input-presets-and-time-balancing.md#workbook-sheets-column-names-and-empty-cells)
and [fit axis](method-algorithms/fit-input-presets-and-time-balancing.md#fit-axis).

## Decisions of 2026-11-22 (open points of the persona review)

The owner merged PR #76 on 2026-11-22 and decided that everything decided on
2026-11-21 stands and that the open points of the persona review are
resolved. The details listed above as chosen during implementation are
accepted with that merge. No fitted number changes with any entry of this
section.

Confirmed as implemented, no change:

- Whole-blood creatinine (LOINC 38483-4, 59826-8) stays eligible like serum
  (K39).
- The patient ID keeps one consistent type per workbook, a number for a
  numeric ID, otherwise text; it is not forced to text (K40).
- The `columns` sheet covers the `cohort` (or `slopes`) sheet only (K37).
- The preview of the cohort models stays in years whatever the time axis
  (K27).
- The density note of the overlay appears from 51 trajectories (K24).
- The Excel export follows the order of the Trajectories table (K02).
- The age-conflict message carries no day count ("N days apart") anywhere
  (K13): it names the number of differing lab dates and the first three, on
  screen, in the `warnings` column of the `demographics` sheet and in the
  [method reference](method-algorithms/demographics.md#age), as implemented
  on 2026-11-21. Checked on 2026-11-22; nothing left to remove.

Resolved with a change:

- **The methodology page states the rule for several creatinine values on
  one day** (OD-34 resolved). Draft G1 of the
  [methodology wording drafts](methodology-wording-drafts.md) is applied as
  written to the block "AKI Timing, Episodes and the Fit-Exclusion Window".
  The points the draft left out (midnight counts as no time, values with the
  same time are not compared) stay in the
  [method reference](method-algorithms/aki.md#measurements-on-the-same-date).
- **The time of day is shown and exported** (K26 follow-up; replaces the
  accepted detail "the time of day stays internal" of 2026-11-21). Both
  measurement sheets gain the last column `time_of_day` (`HH:MM:SS`, empty
  when the file gave none); a re-import of the app's workbook reads it from
  `raw_measurements`, so AKI episodes are the same after a round trip; and
  `input_data_id` covers it. The measurement table of the patient view shows
  the time beside the date and orders the rows of one day by it. A real
  sample at 00:00 still counts as no time. AKI detection itself is unchanged;
  only a re-imported export now gives the episodes of the original file.
  Details of the implementation: the column is read only from a sheet named
  `raw_measurements`, and only where `Date` gives no time of its own;
  derived values (computed eGFR) have no time; `input_data_id` takes the time
  in only for rows that have one, so the identifier of a dataset without
  times does not change; the table orders the rows of a date by time only
  when every row of that date has one, bounds and values under dialysis
  included, and keeps the file order otherwise (AKI detection looks at the
  positive exact values only, so the two can differ on a date with an untimed
  bound), and the fit status moves with its row. Details:
  [Dates](method-algorithms/import-and-values.md#dates) and
  [workbook sheets](method-algorithms/fit-input-presets-and-time-balancing.md#workbook-sheets-column-names-and-empty-cells).
  The shipped demo workbook (`public/test_labs.xlsx`) stored its lab dates
  as serials with a time-zone remainder (01:00, 02:00 in summer time), which
  the new display and export would have shown as measured times in all 467
  measurement rows and which would have moved the demo's `input_data_id`
  from `b59dd57d` to `aea1a9a8`. Its date cells are stored at midnight
  (`scripts/strip_demo_lab_times.mjs`): the calendar days are unchanged, the
  demo shows and exports no times, and its exports match those of before
  cell by cell apart from the new columns and notes, `input_data_id`
  `b59dd57d` included, with no fit, OLS, the CKD progression, Theil-Sen,
  segmented and acute review settings.
- **The date warning also covers event dates, event end dates and future
  birth dates** (K10). An accepted event whose `date` or `endDate` lies after
  the import day or before 1927-05-18 gives a warning; a birth date after
  the import day gives one, from the lab column and from the attributes. A
  warning only: no event, row or age changes. Details of the implementation:
  one warning per event row (lab dates: one per patient), naming both dates
  when both are implausible; rejected event rows are not checked; a birth
  date is checked against the import day only, without a lower bound, once
  per patient and value in the lab column and once per attribute row.
  Details: [Dates](method-algorithms/import-and-values.md#dates).
- **The latest value in the Trajectories table keeps the sign of a bound**
  (K04): "latest <15" instead of "latest 15" when the last dated numeric
  row of the series is a bound (`<` or `>`). Display only. Detail of the
  implementation: the sign is written without a space, as in the review
  ("<15"); a value of another non-exact kind (a range) is shown without a
  sign, as before. Details:
  [first and last eligible value](method-algorithms/fit-input-presets-and-time-balancing.md#first-and-last-eligible-value-sex-baseline-age-and-group).
- **The starting level of a cohort model is written with the same decimals
  as its interval** (K35). In the results table of the Cohort models page the
  starting level and both bounds of its interval take the number of decimals
  of the parameter's slope column, as the `(Intercept)` row of the
  coefficient table already did; the factor terms there already used it for
  estimate and bounds. Display only. Detail of the implementation: the
  number is the slope-column number (not a separate one for levels), so the
  results row and the coefficient row read alike; an eGFR column gives
  "45.50 [44.12, 46.90]" instead of "45.5 [44.12, 46.9]", a creatinine column
  with three decimals "1.200 [1.050, 1.350]". Details:
  [displayed decimals](method-algorithms/slope-quality.md#table-order-mark-filters-and-displayed-decimals).
- **The cohort workbook records the grouping attribute** (K40). The
  `settings` sheet gains the last column `group_by`: the attribute the
  Trajectories table was grouped by, empty without grouping. Existing
  columns keep their positions. Detail of the implementation: the column is
  filled on every row of the sheet (one per parameter), also in the export
  of a single patient, where it names the grouping that was active in the
  table; the `about` note on `group` names it. Details:
  [workbook sheets](method-algorithms/fit-input-presets-and-time-balancing.md#workbook-sheets-column-names-and-empty-cells).
- **A column that does not exclude AKI windows says so under the chart**
  (K30; replaces the accepted detail "'Acute review' gets no extra sentence
  under the chart" of 2026-11-21). While the AKI bands of such a column are
  drawn, one sentence under the chart reads "In this column nothing is
  excluded for AKI (it has no fit): the shaded band only shows the
  configured 30 days after each onset." Legend and tooltip are unchanged.
  Details of the implementation: the sentence also appears for a column with
  a fit that keeps the values, then without "(it has no fit)"; it is shown
  only while bands are drawn (Display → "AKI windows and episodes", and for
  the highlighted patient in an overlay), once per chart. Details:
  [exclusion window](method-algorithms/aki.md#aki-fit-exclusion-window).
- **The model-validation warning says what it means and names the patients**
  (K34). On the Cohort models page each input warning of the model check is
  shown in plain words with the patient IDs concerned, up to five and then
  "and N more". The text stored with the fit and exported in
  `models.warnings` and `projections.warnings` keeps its wording, so scripts
  that match it keep working; the two wordings differ on purpose. Details of
  the implementation: the IDs are listed in the order of the model rows; the
  duplicate warning names each patient once although it counts rows;
  warnings from R are shown as recorded. Details:
  [minimum data and validity gates](method-algorithms/cohort-models.md#minimum-data-and-validity-gates).
- **The position of the page is shown on a phone; the header row of the
  Trajectories table does not stick** (K21). On a phone the position
  ("1–25 of 28") stands between Previous and Next. Display only. A sticky
  header row was tried and left out: inside the box that scrolls the table
  sideways, `position: sticky` sticks to that box, so the rows have to scroll
  inside a box of their own, at most as tall as the window. Checked with 800
  patients: at 1440 × 900 the box starts 402 px down, wheel scrolling over
  the table scrolls inside the box first while its lower 400 px stay below
  the window, and once the box is at its end the page scrolls on and the
  last rows are read without the header row; at 390 × 844 only the top
  175 px of the box are in sight at first. A header that sticks to the window
  needs a second header row kept in step with the sideways scroll, which is
  more than a display detail in a file other changes work on. The rows
  scroll with the page as before.
- **README and start notice** (K44, K46). The README names one concrete
  way to start a local copy (a static file server, `python3 -m http.server
  --directory dist`) and says that opening `index.html` by double-click does
  not work; the notice shown when the page is opened from a folder links to
  the online version. The README sentence "no data leaves the machine" is
  replaced by the descriptive wording of the Methods section: no network
  requests beyond loading the app, and the downloads of the R runtime for
  cohort models are downloads only, no measurements are sent. The host names
  and the Content-Security-Policy are left as they are (self-hosting of the
  R runtime is a separate change).
- **A file rejected as a whole still lists its rejected rows** (K09). When
  every row of a separately uploaded events or attributes file is rejected
  ("No usable events …"), the loaded table stays as it was and the rejected
  rows of that file are listed in the import diagnostics (and therefore in
  the `import_diagnostics` export sheet). Details of the implementation: the
  rows are added under "<file name> (rejected upload)" to the findings of
  the table, which keep those of the file that is still loaded, also when
  the rejected file has the same name; a further rejected upload under the
  same file name replaces only the rejected rows of the earlier one; the
  summary of the list names every file it holds. Details:
  [import findings](method-algorithms/import-and-values.md#import-findings).

## Decisions of 2026-11-22 (AKI episodes separated by recovery, issue #67)

The owner decided on 2026-11-21 (issue #67) to separate AKI episodes by
recovery following ADQI 16 (Chawla et al., Nat Rev Nephrol 2017, statement
1B), and on 2026-11-22 instructed to resolve the open points. This revises
the merging part of the 2026-10-06 decision "Not changed for now: AKI episode
merging and staging", which the 2026-11-16 decision had kept. Details,
boundaries and recomputed examples are in
[AKI episodes](method-algorithms/aki.md#episodes),
[episode list](method-algorithms/aki.md#episode-list) and
[AKI fit-exclusion window](method-algorithms/aki.md#aki-fit-exclusion-window).

- **A new episode starts only after creatinine has been back below the KDIGO
  criterion for at least 48 hours.** Crossings without such a recovery belong
  to one episode, which keeps its highest stage. The 48 hours are evaluated on
  calendar days like the 48-hour criterion and are a parameter of the
  detector (`AKI_RECOVERY_WINDOW_MS`, option `recoveryMs` of
  `findKdigoAkiEpisodes`). Daily values of 1.0, 1.4, 1.8, 2.2, 2.6 and
  3.0 mg/dl are one stage-III episode instead of four (I, II, II, III), and
  1.0, 2.9 and 3.2 mg/dl on days 0, 5 and 6 one stage-III episode instead of
  two (II, III).
- **The episode list gains the episode end and the first dialysis start.**
  The sheet `aki_episodes` gets `end_date` and then `dialysis_start`, both
  appended last; the Data page and the patient view show both after the
  creatinine parameter. A dialysis counts towards an episode when it starts
  between onset and end, both days included (owner decision on K29,
  2026-11-21); every intent is shown next to the date; the stage does not
  change.
- **Moved values.** Episode counts, stages per episode, onsets of later
  crossings, AKI exclusion windows and therefore fitted slopes and endpoint
  inputs can change wherever crossings without recovery between them were
  separate episodes. No value of the golden fixtures moved: the four cases of
  `tests/goldens/aki.json` keep their episodes (onsets 2020-01-02, 2020-01-05,
  2020-01-02 and none; stages 1, 1, 3) and the four cases of
  `tests/goldens/aki_aware.json` keep their kept indices and slopes. The
  bundled demo workbook keeps its eight episodes with unchanged onset, peak,
  baseline, stage and criterion (patient 6: one, 2022-09-08; patient 7:
  three, 2021-06-03, 2022-01-04, 2022-10-03; patient 11: one, 2022-07-12;
  patient 12: three, 2021-01-03, 2021-02-17, 2021-04-03), and no slope, fitted
  count or exclusion of the CKD progression preset moved; the episodes gain
  the end dates 2022-09-16; 2021-06-12, 2022-01-20, 2022-10-18; 2022-07-20;
  2021-01-20, 2021-03-10, 2021-04-20 and no dialysis start (the only acute
  dialysis, patient 7 in August 2020, lies before his episodes). Two unit
  tests changed their expectation deliberately (the sustained daily rise
  and the moved-baseline example in `tests/core/aki/kdigo.test.ts`).

Details fixed in the implementation (2026-11-22, the option that changes
least where there was a choice):

- **"Back below the criterion"** is a value of the detection input that meets
  neither criterion against its own 48-hour and 7-day minima. The first such
  value after the episode's last crossing is the candidate end; a crossing
  more than 48 hours (three calendar days or more) after it starts a new
  episode, a crossing two calendar days or fewer after it joins the episode
  and clears the candidate. The days in between need no measurement, but a
  gap without any value is not a recovery by itself.
- **A gap of more than seven days ends an episode** at the first value after
  it (a value without any earlier value in its 7-day window), or at an
  earlier candidate end. Without this, the strict rule joined crossings
  months apart into one episode with one 30-day window: the dialysis example
  of the method reference (episodes in January 2020, April 2020 and July
  2021) became one episode, and a regression test with stage-III crossings
  every two weeks for two years lost 98 of its 103 excluded values. Days of a
  dated acute dialysis interval do not count towards the gap (added after
  the review of 2026-11-22): an ICU course with CVVHDF from 3 to 13 January
  and creatinine of 3.2 on 2 January, 4.0 on 14 January and 6.5 on 16 January
  had given two stage-III episodes and is one. This rule lets a new episode
  start less than 48 hours after the previous one ended; it was open for the
  owner's confirmation (OD-35) and is kept (see the second review below).
- **Same day.** Values of one date are processed in the order of the
  2026-11-21 rule; on a date whose values cannot be ordered they ascend, so a
  date that contains a crossing continues the episode and none of its values
  ends it. The 48 hours count calendar days, not hours.
- **Dialysis.** A value whose next two calendar days include a day under
  dialysis (the days whose creatinine OD-14 leaves out: a dated acute
  dialysis interval, and a chronic dialysis from its start up to the next
  transplant) is no candidate end, so an episode does not end during such an
  interval or just before a chronic dialysis starts. Acute dialysis without
  an end date and unknown dialysis remove no value and do not block an end.
  Until the review of 2026-11-22 chronic dialysis did not block an end:
  1.0, 1.6 and 1.2 mg/dl on 1 to 3 January with chronic dialysis from
  4 January ended the episode on 3 January and listed no dialysis start.
- **Exclusion window.** It stays `[onset, onset + N days]` for every episode,
  also for a long one; counting N from the last crossing would have
  lengthened unchanged episodes as well. A merged episode therefore excludes
  less than the chain it replaces (2 January to 1 February instead of to
  5 February in the sustained-rise example).
- **End date.** The date of the value that ended the episode; empty for an
  episode still open at the last value. For an open episode, and for one
  ended by the first value after a gap, a dialysis start counts up to two
  calendar days after the episode's last value before the end (after the
  review of 2026-11-22; until then every later start counted for an open
  episode, also one years after the values stop). On one start date the first
  event of the events table is shown; a dialysis without intent is shown as
  `unknown`.
- **The recovery length is not an interface setting.** It is a constant and
  an option of the detector; no control changes it. Issue #67 asked for a
  setting, so this is open for the owner's decision (OD-35). Superseded by
  the second review below: it is a setting.
- **Moved values of the review follow-up.** No golden value and no value of
  the bundled demo workbook moved: its eight episodes keep onset, stage, peak,
  end date and the empty dialysis start listed above. One unit test changed
  its expectation deliberately: an open episode no longer lists a chronic
  dialysis that starts nine months after its last value
  (`tests/workspace/aki-episodes.test.ts`).

The Methods page states the rule in its AKI timing section and in the
sources overview, and names the dialysis start of the episode list (wording
applied on the owner's instruction of 2026-11-22 for the maintainer's
review). New or changed sentences:

- `Aki.tsx`, limitations list, added: "The episode list names the first
  dialysis that starts during an episode."
- `Aki.tsx`, timing section, replacing the paragraph on episodes sharing a
  baseline date and the chain of four episodes: "Each measurement that meets
  a criterion is a crossing. Crossings belong to one episode until creatinine
  has been back below the criterion for 48 hours (ADQI 16): a crossing starts
  a new episode only when the first value after the previous crossing that
  meets no criterion lies more than two calendar days before it. The first
  value after more than seven days without measurements also ends the
  episode; days of an acute dialysis with a recorded end date do not count
  towards the seven days. The onset is the date of the first crossing, the
  end the date of that value; a value followed within two calendar days by a
  day under dialysis, as defined above, does not end the episode. Daily
  values of 1.0, 1.4, 1.8, 2.2, 2.6 and 3.0 mg/dl give one episode of stage
  III."
- `Aki.tsx`, exclusion paragraph, inserted: "however long the episode
  lasts".
- `Sources.tsx`, item "AKI episodes", replacing the text on the shared
  baseline date and the chip *AKI I, 2×II, III*: "Measurements that meet a
  criterion belong to one episode until creatinine has been back below the
  criterion for 48 hours. ADQI 16 proposes the 48 hours and calls them
  arbitrary; applying them to calendar days, and ending an episode after
  more than seven days without measurements, are this tool's rules."

### Second review of 2026-11-22

Applied on the owner's instruction of 2026-11-22 to resolve the open points;
OD-35 is resolved.

- **A value without a reference does not end an episode.** After a gap that
  a dated acute dialysis interval bridges, the first value has no earlier
  value in its 7-day window. It was the candidate end, although it is
  compared with nothing; it now continues the episode as its last value, and
  the next value compared with it can end the episode. 1.0 and 3.2 mg/dl on
  1 and 2 January, CVVHDF from 3 to 13 January, then 4.0, 4.1, 4.2 and
  7.0 mg/dl on 14 to 17 January: one stage-III episode, open (4.1 on
  15 January is the candidate end and 7.0 joins two days later); before, the
  episode ended on 14 January at 4.0 mg/dl and 7.0 opened a second stage-III
  episode.
- **An episode ended by a gap has no end date in the list.** The first value
  after a gap of more than seven days shows no recovery, so `end_date` is
  empty for such an episode and the Data page and the patient view show
  "not observed: no values for more than 7 days after" the date of its last
  value. Two columns are appended to `aki_episodes`: `ended_by_gap`
  (`true`/`false`) and `last_value_date`. The dialysis start of such an
  episode still counts up to the recovery length after `last_value_date`, so
  the shown end and the dialysis window agree. Before, the list showed the
  first value after the gap, possibly weeks later, as the end, while a
  dialysis between the two dates was not listed.
- **The recovery length is a setting.** *Recovery between episodes (hours)*
  under "Detected AKI episodes" on the Data page, default 48, counted on
  calendar days (only multiples of 24 matter). It is one value per dataset
  (`recoveryHours` of the AKI module settings), not a column setting,
  because the episode list does not belong to a column; it decides the
  episodes of every column, the list and the export, is kept with the dataset
  copy (a copy saved earlier gets 48) and is exported in `analysis_settings`
  of the `settings` sheet. A change discards fitted cohort models.
- **Step 4 is kept.** A gap of more than seven days without values outside
  dated acute dialysis intervals ends an episode, so a new one can start
  less than the recovery length later; the episode list gives the former no
  end date (above).
- **Known limitation documented.** An episode end compares a value with the
  lowest value of the 48 hours and 7 days before it, not with the creatinine
  before the episode: on a plateau the reference catches up. 1.0 and
  2.0 mg/dl on days 0 and 1 and 3.0 daily on days 2 to 12 end the episode on
  day 9, and 4.6 on day 14 opens a second stage-III episode. Unchanged
  behaviour, now in the method reference and a regression test.
- **Moved values.** No golden value moved, and no episode count, onset,
  stage, peak, baseline, exclusion window, slope or dialysis start of the
  bundled demo workbook. All eight demo episodes end by a gap; their
  `end_date` moved from 2022-09-16 (patient 6, onset 2022-09-08);
  2021-06-12, 2022-01-20, 2022-10-18 (patient 7, onsets 2021-06-03,
  2022-01-04, 2022-10-03); 2022-07-20 (patient 11, onset 2022-07-12);
  2021-01-20, 2021-03-10, 2021-04-20 (patient 12, onsets 2021-01-03,
  2021-02-17, 2021-04-03) to empty, with `ended_by_gap` `true` and
  `last_value_date` equal to the onset date in each case. Unit tests changed
  their expectation deliberately: the episode list of the gap example
  (`tests/workspace/aki-episodes.test.ts`), the sheet header and the
  `about` note (`tests/workspace/export-schema.test.ts`,
  `tests/workspace/export.test.ts`), and the AKI settings in the registry
  tests, which now carry `recoveryHours`.

Methods page (`Aki.tsx`, timing section), changed sentences:

- "Crossings belong to one episode until creatinine has been back below the
  criterion for 48 hours (ADQI 16; 48 hours is the default of the setting
  "Recovery between episodes" on the Data page): a crossing starts a new
  episode only when the first value after the previous crossing that meets
  no criterion against an earlier value lies more than two calendar days
  before it."
- "The first value after more than seven days without measurements also
  ends the episode; no end date is given then, because that value is
  compared with no earlier value."
- "Days of an acute dialysis with a recorded end date do not count towards
  the seven days." (split from the previous sentence, wording unchanged)
- Added: "An end means that a value no longer meets the criterion against
  the lowest value of the 48 hours or 7 days before it, not that creatinine
  has returned to its level before the episode."

## Decisions of 2026-11-22 (before/after comparison and event axis, issues #64 and #70)

Owner decisions of 2026-11-21 on issue #64 and on item K16 of issue #70
(option a), implemented on 2026-11-22 after the owner's instruction of that
day to resolve the open points. **A numeric result for a new option only**:
no existing slope, interval, flag, endpoint, export column or golden fixture
moved. With the comparison off (the default) every number and every existing
sheet is as before; the cohort workbook gains the sheet `anchor_comparison`
(empty), the column `anchor_comparison` at the end of `settings` (empty) and
one note at the end of `about`.

- **Before/after comparison at an anchor event** (#64). One anchor event per
  patient: the first event, or the first whose title or type equals a chosen
  value. Per column the slope before, the slope after and the difference
  (after − before), each with n, span and 95 % interval; one export row per
  patient × column. **Measurements on the anchor date count as before.** An
  optional **exclusion window after the anchor**, in days per column,
  **default 0**; the points in it are drawn as grey open circles like other
  fit exclusions. The `event-driven` mode, which reported the segment with
  the largest absolute slope, stays unreachable.
- **Time axis "Years since event"** (K16, option a) for the patient charts
  and the overlay, zero at the anchor of the column's before/after
  comparison, so chart and numbers refer to the same day.

Details of the implementation, chosen where the decisions left them open
(the option that changes least), **not yet confirmed by the owner**:

- Both sides use the points of the column's own fit: the same censoring,
  dialysis-interval and AKI exclusions and the same time balancing, applied
  per side, so a month or quarter that contains the anchor gives one median
  per side. The estimator is the column's scalar one (OLS, also under
  Rolling and Segmented OLS; Theil-Sen). Without a fit (Trend off or fit
  model "none") only the anchor is determined.
- The reliability rule, the rapid eGFR decline flag and the endpoints stay on
  the column's slope of the whole series. The sides have no reliability note
  or flag of their own; their n and span are shown.
- The 95 % interval of the difference is the Welch interval from the two OLS
  standard errors: half-width t(0.975, ν) · √(SE_b² + SE_a²) with the
  Welch–Satterthwaite ν, truncated to a whole number as for the OLS interval.
  It assumes independent slope estimates; it is empty for Theil-Sen and for a
  side with the exact two-point line.
- The exclusion window covers the calendar days anchor + 1 to anchor + N,
  both included. Its points are left out of the after slope only; the
  column's slope keeps them, and the chart legend and measurement table say
  so; legend, tooltip and exported chart context count them apart from the
  measurements excluded from the fit.
- Title and type are matched exactly as stored. Among events of one date the
  first in the file is the anchor; an event with an end date anchors at its
  start. All loaded events of the patient are candidates.
- The setting belongs to the shared or a parameter's own analysis settings,
  is not part of `fit_config`, does not make the preset "custom", is kept
  when a preset is chosen and does not discard cohort models.
- The export is a new sheet `anchor_comparison` after `import_diagnostics`,
  with a row also for a patient without an anchor (values empty); `settings`
  records the setting as JSON.
- The event axis takes its anchor from the comparison only: with the
  comparison off for a parameter, its chart draws nothing on this axis and
  says where to switch it on. Patients without an anchor are not drawn and
  are counted under the chart. The axis label names the rule. Mixed-model
  reference lines are hidden on this axis. There is no days variant of the
  event axis.

The example of issue #64 (patient 2: before −17.4, after −9.6, difference
+7.8) came from the predecessor's demo data; the demo workbook of this
repository has no event for patient 2. Recomputed example: patient 13,
imported eGFR, General exploration, anchor of type `kidney_transplant`
(2022-07-01): before −12.828 per year (n = 6, 882 days), after −8.005 (n = 3,
365 days), difference +4.823 with 95 % interval [4.320, 5.326].

New methodology-page text, minimal and factual, awaiting the maintainer's
approval: one list item "Before/after comparison" in Fits → Fit pipeline, one
sentence on the event axis in Trajectories → Overlay, and one row for
`anchor_comparison` in Export → Workbook contents.

Details: [before/after comparison](method-algorithms/anchor-comparison.md#beforeafter-comparison-at-an-anchor-event-2026-11-22)
and [time axis "Years since event"](method-algorithms/anchor-comparison.md#time-axis-years-since-event-k16-2026-11-22).

## Approved requirements

### Observed events and recovery

> Superseded in part 2026-10-06: confirmation must also occur within 12
> calendar months of the candidate (a later low value then starts a new
> candidate), and input is limited to endpoint-eligible exact measurements
> before kidney replacement therapy. See "Decisions of 2026-10-06" above and
> [observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction).
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
> [observed endpoints and individual prediction](method-algorithms/endpoints-and-projection.md#observed-endpoints-and-individual-prediction).
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
