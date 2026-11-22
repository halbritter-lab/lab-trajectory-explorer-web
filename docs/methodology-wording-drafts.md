# Methodology page: wording drafts for owner approval

Prepared 2026-10-07 after the [open-decision walkthrough](remaining-method-decisions.md#decisions-of-2026-10-07-open-decision-walkthrough).
The methodology page (`src/workspace/methods/Methodology.tsx`) is published
under the maintainer's authorship, so wording changes need his approval.

**Part A was approved by the owner on 2026-10-07 and is applied** as written
below; "Current" there refers to the text it replaced. The markers of OD-3,
OD-4, OD-5, OD-10 and OD-12 in [method algorithms](method-algorithms.md) were
removed with it.

**Part B was approved by the owner as drafted on 2026-10-08 and is applied.**
It adds topics the page did not cover. The overlap noted under B6 was resolved
by shortening the existing **Age** bullet of the eGFR section, which now
refers to the new block. Placement on the page: B3 and B1 after *Fit
Pipeline*, B2 after *Choosing a Fit Model*, B5 and B6 after the eGFR section,
B4 after *AKI Detection*, B7 after *Cohort Screening*.

Two sentences were made more precise on the owner's instruction of 2026-10-08,
after a comparison of the blocks with the code: in B2, R² is unavailable for
identical values only from three points on (two identical values give slope 0
and R² = 1); in B6, the birth date comes from the earliest dated lab row that
carries one. The blocks below show the adjusted wording.

**Part C was approved by the owner on 2026-11-16 and is applied** (pull
request #53). It covers the changes of the clinical-review pull requests
(#37, #39, #41) and which trend method suits which case. C11 went onto the
page in a two-sentence version; the blocks below keep the drafted wording
and the notes say where the page differs.

**Part D was approved by the owner on 2026-11-16 and is applied, except
D1 (a)** (pull request #53; D3 (c) and (d2) already with #50). It follows
two audits of the scientific basis. **The full reference list D1 (a) is
still open:** it waits until the owner has compared the EKFC coefficients
with the paper and the EMA guideline is confirmed. Of the "Notes for code
changes", the settings heading and the whole-year display of the projected
age are made; the lme4 citation in the R script is not.

**Part E (E1) was approved by the owner on 2026-11-16 and is applied** (pull
request #53).

**Part G (G1) was drafted on 2026-11-21 and applied on 2026-11-22** (OD-34
resolved by the owner). It follows the decision of 2026-11-21 on several
creatinine values on one day.

**Part H was drafted on 2026-11-22 and awaits the maintainer's approval.**
It removes the statement on the external OLS comparison (issue #84) and
describes four features the page does not yet cover in full: the
logarithmic axis with doubling time, creatinine after selected events, the
source of the two-level rapid-decline flag and the creatinine source per
patient. Nothing of it is applied.

**How the page differs from the blocks of Parts C, D and E** (code and page
win over the draft):

- C1: the paragraph is split after the new text; "Only dated exact numeric
  values are used" starts its own paragraph.
- C3, C4, E1: order in the **Units** bullet of `Data.tsx` is the existing
  conversion sentence with "A value stored under the wrong unit would
  therefore yield a wrong eGFR", then E1, then C4; C3 is its own bullet.
- C5: the `Sources.tsx` entry was added to the existing list in its style.
- C8: the six-value example stays in the OLS paragraph; the Theil–Sen part
  follows as its own paragraph.
- C9: in addition, the row **G5 no fit** names Trend being switched off, the
  method No fit, or a failed fit, as the badge tooltip does.
- C11: two sentences only: "The 57% threshold only approximates a doubling
  of serum creatinine, and the match depends on the equation. Below the
  equation's breakpoint the decline is smaller."
- D2: "have not been validated against outcomes" instead of "are not
  validated"; the example chip is *AKI I, 2×II, III*; the opening says the
  thresholds "are published standards" and the 40 % and 57 % "are published
  endpoint thresholds", not "come from the publications below", because the
  reference list D1 (a) is not on the page yet.
- D3 (a): reduced to dropping "95%" from "The reported 95% bounds" in
  `Fits.tsx` and from "95% slope bounds" in `Sources.tsx`; the sentence added
  with #50 stays.
- D3 (d2): the sentence approved with #50 stays ("… to the lowest value of
  the previous 7 days:"); the stage list now refers to that lowest value, and
  the sentence "An episode gets the highest stage that any of its values
  reaches." follows the list.
- D3 (f): without a literature reference.
- D1 (b): the EKFC entry in `Sources.tsx` links to
  `https://doi.org/10.7326/M20-4366`.
- "Projection" replaces "prediction" in headings, navigation labels and text
  of the page; the section id `prediction` is unchanged. The sentence on the
  displayed age now says that the table shows a whole number marked as
  approximate on either age basis and that the export keeps the unrounded
  value.
- Follow-up edits: "aggregation" and "Display-fit AKI exclusions" are gone
  from the page, "Theil–Sen" and "1.73 m²" are uniform, and the 20-year
  horizon reads "latest measurement used".

## Part A: passages that no longer match the application

### A1. Cohort models follow the Trajectories settings (OD-1)

Section *Fit Pipeline*, first paragraph. Current: "Cohort models have a
separate checkbox for applying the active preset's event censoring and AKI
exclusion windows. It starts on. …"

Proposed:

> Cohort models prepare their measurements with the analysis settings chosen
> for the same parameter under Trajectories: its event censoring, AKI exclusion
> windows and time balancing. With general exploration, the setting of a newly
> loaded dataset, nothing is excluded or aggregated. The Cohort models page
> states the settings in use. A separate checkbox, on by default, applies the
> event censoring and AKI windows; turning it off retains the eligible exact
> dated measurements inside those windows, while time balancing still applies.
> A parameter set to "No fit" supplies no model rows. The preview, each model
> status and the workbook record the selected policy and the number of
> measurements removed by the union of those windows. This count is taken
> before time balancing and missing-factor exclusions. Changing these settings
> under Trajectories discards fitted models.

### A2. Which series count as eGFR; limit of the confirmation interval (OD-19, OD-20)

Section *Fit Pipeline*, bullet **Endpoints**. Current: "eGFR series can report
total percent change … The minimum confirmation interval defaults to 90 days
and is configurable as positive whole days."

Proposed change to the first sentence and the last sentence only:

> **Endpoints** — a series counts as eGFR when its unit is mL/min/1.73 m²,
> whatever it is called; a clearance in ml/min does not. Such series can report
> total percent change from the first to latest eligible measurement, …

> … The minimum confirmation interval defaults to 90 days and can be set from
> 1 to 365 whole days; a longer interval could never be met, because a
> confirming value must follow within 12 calendar months.

### A3. Rolling OLS (OD-2)

Section *Choosing a Fit Model*. Current: "**Rolling OLS** — a separate OLS fit
inside a sliding window. … It describes a sequence of local slopes rather than
one summary number, so it answers "when did the decline accelerate" better than
"how fast is the decline"."

Proposed:

> **Rolling OLS** — a separate OLS fit inside each two-year window (730 days),
> moved forward in steps of 180 days; a window needs at least three fitted
> measurements. Appropriate when the rate of change itself changes over the
> observation period and a single slope would average a fast phase together
> with a slow one. The chart draws each window's line over the 180 days around
> the window centre, and the table gives the number of windows with the
> smallest and largest window slope. The slope, R² and confidence interval
> reported for the column, and the rapid-decline flag, remain those of the
> single OLS line through all fitted measurements. A fitted span under two
> years has no window and therefore no local slopes.

### A4. Segmented OLS (OD-3)

Same section. Current: "**Segmented OLS** — separate OLS fits per segment,
split at long measurement gaps or at configured events. …"

Proposed:

> **Segmented OLS** — separate OLS fits per segment. A new segment starts
> wherever two consecutive fitted measurements lie more than 180 days apart;
> clinical events do not split a series. A segment needs at least three
> measurements to be fitted, and the chart draws one line per fitted segment.
> The slope, R² and confidence interval reported for the column remain those of
> the single OLS line through all fitted measurements; the segment slopes are
> shown as lines only. Use event censoring or exclusion when an event should
> remove data.

### A5. Relation to the Python package

Section *How far each model is verified*, first bullet. Current: "**Parity
against the reference implementation** — automated tests assert this port
against golden values generated from the Python `analyses` package. …"

Proposed:

> **Stored regression cases** — automated tests compare the results with stored
> cases that were originally generated by the Python `analyses` package. Since
> October 2026 the application may deviate from that package deliberately; each
> such change is documented and the affected case updated. The cases cover OLS,
> rolling OLS, segmented OLS and Theil-Sen, for Theil-Sen including the slope,
> separate-median intercept, 95% slope bounds and unavailable-fit cases.

Applied with it: the later sentence "The numeric **reason** field is left
reference-compatible" now reads "left unchanged", and the phrase "This
reference-compatible field" in *Quality Flags* is gone (see A7).

### A6. Individual endpoint prediction (OD-4, OD-16, OD-17, OD-18)

Section *Individual endpoint prediction algorithm*, both paragraphs. Current
first paragraph ends: "Add the remaining time after the latest measurement to
its age. A confirmed G5 event takes precedence over projection." Current second
paragraph begins: "Require three measurements, at least one year of follow-up,
…" and uses the example 60, 50, 25.

Proposed end of the first paragraph:

> Add the remaining time after the latest measurement to the age at that
> measurement. When the birth date is known, this is the exact age. Otherwise
> the age is known in completed years only; the projected age can then be up to
> one year too low, and the table shows it as a whole number marked as
> approximate. A confirmed G5 event takes precedence over projection, whether
> or not the observed G5 endpoint is displayed.

Proposed second paragraph:

> Require three measurements, at least 365 days between the first and the
> latest, a finite declining fit, a future crossing and an age at the latest
> measurement. Report a future crossing only within 20 years after the latest
> eligible measurement, including the boundary. The endpoint fit's slope
> confidence interval must have finite ordered bounds strictly below zero;
> missing bounds or an interval that includes zero withhold the crossing. With
> only three measurements this interval is so wide that it almost always
> includes zero: for values 60, 50, 25 at years 0, 1, 2 the slope is −17.5 per
> year but its interval runs from −72.5 to 37.5, so no crossing is reported.
> In practice a projection needs more measurements. Example: eGFR 48, 44, 41,
> 36, 33 and 29 on 15 January of six consecutive years gives a slope of −3.80
> per year with an interval from −4.10 to −3.50; the fitted line reaches 15
> about 3.7 years after the latest measurement. The displayed slope interval
> may differ because it can use different prepared rows. New measurements can
> change this prediction; they do not revoke a confirmed event.

### A7. Quality flags (OD-9)

Section *Quality Flags*. Current bullet: "**span_too_short** — a slope is
produced, but the raw numeric observation span is fewer than 365 days. This
reference-compatible field intentionally describes the unfiltered series; …"
Current paragraph: "… grey text (n < 3) means no slope was produced at all, an
amber note (…) means a slope exists but should be treated as unstable."

Proposed bullet:

> **span_too_short** — the raw numeric observation span is fewer than 365 days.
> A slope is normally produced; the exception is a series whose fitted
> measurements all share one date, for which no slope exists. This field
> describes the unfiltered series; the displayed reliability rule below also
> checks the fitted span.

Proposed addition to the paragraph, after the sentence on grey and amber:

> When all fitted measurements share one date, the grey note reads "All fitted
> measurements on one date".

### A8. Why an endpoint has no value (OD-16, OD-17, OD-18)

Section *Why an Endpoint Has No Value*, last two bullets. Current: "**G5 no
age** — no age is recorded for the latest measurement, so the projection has
nothing to anchor to." and "**G5 n < 3** and **G5 < 1 yr** — the same
stability thresholds as above, applied to the projection."

Proposed:

> **G5 no age** — no age is available for the latest eligible measurement, so
> the projection has nothing to anchor to.

> **G5 n < 3** and **G5 < 1 yr** — fewer than three eligible measurements, or
> fewer than 365 days between the first and the latest. These are the same
> numbers as the stability thresholds above, applied to the endpoint-eligible
> measurements rather than to the fitted ones.

Proposed new bullet:

> **G5 not projected** can also mean that the data contain a confirmed G5
> event while the observed G5 endpoint is switched off; the badge says so, and
> the export gives the reason `observed_ckd_g5`. With the observed endpoint
> on, the CKD G5 badge with its dates is shown instead.

### A9. eGFR default (OD-5)

Section *eGFR*. Current: "**CKD-EPI 2021** (default) — race-free equation …"

Proposed: remove "(default)" and add one sentence before the list:

> No eGFR is computed until a formula is applied under Data; the formula
> selector starts at "Off". CKD-EPI 2021 is the first entry of the selector.

### A10. Creatinine conversion constants (OD-12)

Section *eGFR*, bullet **Units**. Current: "Values recorded in µmol/l are
converted automatically (÷ 88.42); …"

Proposed addition at the end of the bullet:

> The EKFC equation's own age-specific Q values for ages 18 to 25 are converted
> with the factor 88.4; the difference changes an eGFR by at most
> about 0.03 mL/min/1.73 m².

### A11. AKI detection: implausible values and dialysis (OD-13, OD-14)

Section *AKI Detection*, first paragraph, and the limitations list. Current
first paragraph: "… Only dated exact numeric values are used. …" Current
limitation: "Staging is by creatinine ratio / absolute level only; it does not
consider renal replacement therapy or paediatric eGFR criteria."

Proposed addition to the first paragraph:

> Values of zero or less are ignored. Creatinine measured under dialysis is
> ignored as well: from the start of a chronic dialysis until a later kidney
> transplant, and during an acute dialysis with a recorded end date, both
> boundary days included. Detection continues after transplantation. Dialysis
> of unknown intent and acute dialysis without an end date exclude nothing.

Proposed limitation:

> Staging is by creatinine ratio / absolute level only. Renal replacement
> therapy does not raise the stage (KDIGO stage 3 by initiation of renal
> replacement therapy is not applied); creatinine values measured under
> dialysis are left out of detection as described above. Paediatric eGFR
> criteria are not considered.

### A12. Rapid decline flag (OD-10)

Section *Cohort Screening*. Current: "An eGFR series whose fitted slope falls
faster than the configured threshold (default 5 mL/min/1.73m² per year,
matching the KDIGO definition of rapid CKD progression as a sustained decline
faster than 5 mL/min/1.73m²/yr) is marked …"

Proposed:

> An eGFR series whose fitted slope falls faster than the configured threshold
> is marked rapid ↓ in the table when the fit is shown, and carries a
> `rapid_progression` column in the export. The default threshold of
> 5 mL/min/1.73m² per year is the number KDIGO uses for rapid CKD progression,
> which KDIGO defines as a sustained decline. The flag itself does not test
> whether a decline is sustained: it is set for any computed slope beyond the
> threshold, including one from two measurements or from a few weeks of
> follow-up. Read it together with the reliability note of the same cell.

The remaining sentences of that paragraph (adjusting the threshold, screening
signal) stay as they are.

Changed on 2026-11-17 with the owner's decision to gate the flag on the
reliability rule (see the [method decisions](remaining-method-decisions.md)).
The last two sentences of the proposal above no longer describe the code. The
page now reads, pending the owner's reading of the wording itself:

> The flag itself does not test whether a decline is sustained. Since
> 2026-11-17 it is not set on a slope that carries the reliability note (fewer
> than three fitted measurement dates or less than one year of fitted
> follow-up); a slope with a wide interval can still be flagged, so read the
> interval beside it.

## Part B: topics the page did not cover (applied 2026-10-08)

Seven new blocks, each drafted from the matching sections of
[method algorithms](method-algorithms.md). They were compared with the code
except where "Points to check" says otherwise. Each block was kept short;
what was left out is listed at the end so that it can be added where wanted.

### B1. Time balancing

> #### Time Balancing: Monthly and Quarterly Medians
>
> With monthly or quarterly medians, the measurements that remain after
> exclusions are grouped by UTC calendar month or calendar quarter
> (January–March, April–June, July–September, October–December). Periods are
> not counted from the patient's first measurement; 31 December and 1 January
> fall in different periods.
>
> Each period with at least one measurement contributes one point. Its value
> is the median; with an even count this is the mean of the two middle values.
> Its date is the date of the lower-middle measurement in date order (the
> earlier of two, the middle of three, the second of four), so it is always a
> date on which a measurement exists. Periods without measurements contribute
> nothing; no value is interpolated.
>
> Example: 50, 44, 47 and 41 on 10 January, 20 February, 5 March and 25 March
> 2021 give the quarterly point 45.5 on 20 February 2021. Minimum point counts
> and the fitted span refer to these points, not to the raw measurements.

### B2. Ordinary least squares

> #### Ordinary Least Squares (OLS)
>
> The OLS fit is unweighted: every fitted point has the same weight. Time is
> measured in years of 365.25 days from the first fitted point (1 January 2020
> to 1 January 2021 is 366 / 365.25 = 1.002 years), and the intercept is the
> fitted value at that point.
>
> A regular fit needs at least three points. Exactly two points on different
> dates give the exact line through both, with R² = 1 and no confidence
> interval: 60 on 1 January 2020 and 56 on 1 January 2021 give −3.99 per year.
> R² is the squared correlation of time and value; with three or more points
> it is unavailable when all fitted values are identical.
>
> The 95% interval is the slope ± t × standard error, where the standard error
> comes from the residual sum of squares with n − 2 degrees of freedom and t is
> the two-sided 95% value of Student's t distribution. It describes uncertainty
> in the slope, not a prediction interval.

### B3. Analysis presets

> #### Analysis Presets
>
> A preset sets every analysis setting at once. Changing a single setting
> afterwards marks the configuration as custom.
>
> - **General exploration** (the starting configuration) — OLS on raw
>   measurements; no event censoring, no AKI exclusion, no time balancing, no
>   endpoints.
> - **Theil–Sen robust trend** — General exploration with the Theil–Sen
>   estimator instead of OLS. Exports record it as a custom configuration.
> - **CKD progression** — OLS on quarterly medians; values censored from kidney
>   transplant and from chronic dialysis start; acute dialysis intervals and
>   dated dialysis intervals of unknown intent excluded; a 30-day window after
>   each AKI onset excluded; percent decline, observed G4, observed G5 and
>   projected age to G5 switched on, with a 90-day minimum confirmation
>   interval.
> - **Acute review** — raw measurements without a fit; no event censoring, no
>   AKI exclusion, no endpoints.
>
> Every preset sets the rapid-decline threshold to 5 mL/min/1.73m² per year.
> Endpoint settings take effect on eGFR series only.

### B4. AKI timing, episodes and the exclusion window

> #### AKI Timing, Episodes and the Fit-Exclusion Window
>
> Lab dates are calendar days without a time of day. The 48-hour window
> therefore covers earlier measurements on the same date or one or two calendar
> days earlier, and the 7-day window those up to seven calendar days earlier,
> limits included. A rise from 1.0 to 1.3 mg/dl two days apart is detected;
> three days apart it is not.
>
> Each measurement that meets a criterion is a crossing. Consecutive crossings
> form one episode only while they share the same baseline date; the onset is
> the date of the first crossing. An episode has no end date, so a sustained
> rise is reported as a chain of episodes: daily values of 1.0, 1.4, 1.8, 2.2,
> 2.6 and 3.0 mg/dl give four Stage I episodes.
>
> With AKI exclusion on, each episode removes from the fit all measurements
> from the onset date through onset + 30 days (default), both ends included:
> onset 2 January 2020 excludes 2 January to 1 February 2020.

### B5. eGFR: conditions, age and rounding

> #### eGFR: Conditions, Age and Rounding
>
> A creatinine measurement yields an eGFR value only when it has a lab date and
> a numeric value, the creatinine is greater than 0 mg/dl after conversion, the
> patient's sex is resolved, and the age is known and at least 18 (17 gives no
> value, 18 does). Otherwise no value is produced.
>
> Age is the number of whole completed years at the lab date. It changes on the
> birthday; fractional age is not used. A series therefore shows a small step
> at each birthday: one further year lowers CKD-EPI 2021 by 0.62%.
>
> Each result is rounded to one decimal, and the rounded value is used in every
> later calculation: fits, observed G4/G5, percent decline, projections, the
> rapid-decline flag and cohort models. CKD-EPI 2021 for a male aged 65 with
> 2.35 mg/dl gives 29.96, which is stored as 30.0 and is therefore not below
> the G4 boundary of 30. No upper or lower limit is applied to the result.

### B6. Resolving sex and age

> #### Resolving Sex and Age
>
> Sex and a birth-date anchor are resolved once per patient.
>
> - **Sex** — accepted spellings, ignoring case: m, male, man, mann, männlich,
>   maennlich, mannlich; w, f, female, woman, weiblich, frau; d, divers,
>   diverse. Other values, such as other or unknown, count as no sex. Sources in
>   order: manual entry, attributes table, the code stated most often on the
>   patient's lab rows. If the two most frequent codes tie, the rows yield no
>   sex.
> - **Age** — sources in order: manual age (read as the age at the earliest
>   dated row), attributes-table birth date, birth date on the earliest dated
>   lab row that carries one, stated ages. Each stated age defines a one-year interval of
>   possible birth dates; the anchor is the midpoint of their intersection.
>   Without a common birth date, the median of the interval midpoints is used.
> - **Reported as conflicts** — differing sex codes, a tie, differing birth
>   dates, stated ages contradicting the birth date or each other, implausible
>   stated ages. A manual sex or age suppresses the corresponding reports.

This block overlaps the existing **Age** bullet in the eGFR section. Applied
by shortening that bullet to: "the equations use the patient's age at the date
of measurement. This app does not read the age stated on each row directly. It
derives every row's age from one birth-date anchor per patient (see *Resolving
Sex and Age* below). A stated age that contradicts the others is corrected
rather than used, and the contradiction is reported. Ages shown and exported
can therefore differ from the values in the source file, usually by a year,
and the eGFR follows that correction." Only the list of anchor sources was
removed; every remaining sentence is the earlier wording.

### B7. Cohort models

> #### Cohort Model Specification, Intervals and Projections
>
> The cohort model is a linear mixed model of the measured value on time in
> years, with a random intercept and slope per patient by default, estimated by
> restricted maximum likelihood (REML). A "level" factor shifts the level;
> "level and slope" also adds an interaction with time. Numeric factors,
> including baseline age, are centred at their mean over the modelled patients,
> one value each. Categorical factors use treatment contrasts: each coefficient
> is the difference from the reference level. Fixed effects have 95% Wald
> intervals; no p-values are computed.
>
> The model line shows the reference profile — numeric factors at their
> centres, categorical factors at their reference levels — from fixed effects
> only, within observed model time.
>
> A projection is the time at which a profile's fixed-effect line reaches a
> threshold; it has no interval. It is reported only within the horizon
> (default 20 years, exactly 20 included) and is withheld unless the fit
> converged, is not singular and matches the current data and settings.

### Points to check in Part B

- **Not compared with the code**, taken from the reference only: that every
  preset resets the rapid-decline threshold to 5 (B3); that centring is done
  per fitted unit, and the extent of the model line (B7).
- **B2 and OD-11.** Since 2026-11-22 the t value is the exact Student-t
  quantile for every number of points (OD-11 implemented), so the draft's
  "Student's t" is accurate as it stands. Before, from 43 to 122 points a
  stepped table made the interval up to 0.62 % wider than exact, and from 123
  points the normal value 1.96 made it up to 1.00 % narrower.
- **B7 and OD-22, OD-29.** Automatic numeric or categorical typing and the
  dataset-wide default reference level are not mentioned.
- **B5.** A bounded creatinine row (`<x`, `>x`) produces a displayed eGFR bound
  with the inequality reversed, which is excluded from all calculations; the
  existing paragraph on bounds covers this.
- **Left out for length**, available in the reference:
  - B1: the median value need not have been measured on the representative
    date.
  - B2: points that all share one date give no slope; same-date rows each
    count as a point.
  - B4: the absolute criterion is tested first and fixes the 48-hour baseline
    (until 2026-11-16 a stage could therefore be lower than against the 7-day
    minimum; stages now use the 7-day minimum, see D3 (d2)); the window length
    can be changed; the windows apply to any analyte column with the switch on.
  - B6: the row vote counts all lab rows and is a plurality; an explicit birth
    date always wins over stated ages; the 29 February rule.
  - B7: the random-intercept-only option; removal of patients who lack a
    factor value; the statuses shown instead of a time (already met, flat,
    moving away, beyond horizon); the slope interval is not used to withhold a
    cohort projection, unlike the individual G5 projection. This block is the
    most compressed and could be split into model and projections.
- The existing Fit Pipeline paragraph says a singular fit withholds
  projections and model lines; a non-converged fit does so as well, as B7
  states.

## Part C: drafts after the clinical-review changes (applied 2026-11-16, PR #53)

Drafted 2026-11-14 for [issue #44](https://github.com/halbritter-lab/lab-trajectory-explorer-web/issues/44),
after the pull requests #37, #39 and #41 were merged, and revised on
2026-11-16 after #47. **Part C was approved by the owner on 2026-11-16 and is
on the methodology page since pull request #53**; "Current" below refers to
the text it replaced or follows, and the line numbers to the files before
that change. Where the page differs from a block, the list at the top of this
file says so.

**What was checked on 2026-11-16.**

- Code comparison: every statement in C1 to C13 was read against the code of
  this branch, and every quoted current sentence and line number against the
  topic files.
- Recomputation: the OLS example and the Theil–Sen coverage figures in C8 and
  the percentages in C11 were recomputed with the application's own functions.
- Literature: the CKD-EPI 2009 citation and DOI were confirmed through
  Crossref. The origin of the 40 % and 57 % thresholds was checked through
  search results only; the full papers were not read.
- Editorial: wording, length at the place of insertion, terms and typography
  were reviewed against the existing page.
- Left for the maintainer: the clinical rationale in C6 and C12 ("at high
  creatinine, ordinary variation can meet the AKI criterion"), the
  recommendation texts in C12, and whether C11 belongs on the page.

Each draft names the file and line of the current text
(`src/workspace/methods/topics/`, state of 2026-11-16), the proposed text, the
rule of the [method reference](method-algorithms.md) it reflects, what the
check found, and what was left out on purpose.

Terms used in all drafts: *time balancing* (not "aggregation"), *projection*
(not "prediction") in new text, *AKI window* for the period, and the setting by
its interface label *Exclude AKI windows from fit*. Links into the
methodology page are written as text with their target, for example
"AKI detection (link to `#methods/aki/detection`)"; every target was checked
against the topic and section ids of the page.

### Status of the earlier checklist in issue #4

The eight open boxes of the 2026-10-07 list in issue #4 ("Methodology page
wording") are covered by blocks that are already applied. The boxes can be
ticked once the owner agrees:

| Box in issue #4 | Applied block | On the page |
| --- | --- | --- |
| Time balancing | B1 | `Fits.tsx`, *Time Balancing: Monthly and Quarterly Medians* |
| OLS | B2 | `Fits.tsx`, *Ordinary Least Squares (OLS)* |
| Preset contents | B3 | `Fits.tsx`, *Analysis Presets* |
| AKI timing, episodes, exclusion window | B4 | `Aki.tsx`, *AKI Timing, Episodes and the Fit-Exclusion Window* |
| eGFR rounding, age, conditions | B5 | `Data.tsx`, *eGFR: Conditions, Age and Rounding* |
| Sex and age resolution | B6 | `Data.tsx`, *Resolving Sex and Age* |
| Endpoints: withheld reasons, three-point example | A6, A8 | `Endpoints.tsx`; one badge is still missing, see C9 |
| Cohort models | B7 | `Cohort.tsx`, *Cohort Model Specification, Intervals and Projections* |

### C1. Creatinine from other materials is not used

`Aki.tsx`, lines 5–6. Current, unchanged: "AKI detection accepts serum
creatinine in mg/dl or µmol/l; µmol/l values are divided by 88.42 before KDIGO
comparisons."

Proposed, to follow that sentence:

> Creatinine from other materials is not used. A series counts as creatinine
> when its name contains "Kreatinin" or "Creatinin" and its unit is mg/dl or
> µmol/l. It is left out when the name points to another material: urine (for
> example "Kreatinin i.U.", "U-Kreatinin", "Sammelurin"), dialysate, ascites,
> pleural or another fluid, cerebrospinal fluid ("Liquor", "CSF") or a drain.
> Aspirate, seroma, secretions and lymph are recognised in their German
> spelling only ("Punktat", "Serom", "Sekret", "Lymphe"). A single letter "U"
> in the name also counts as urine, except where "u." stands for "und"
> between two blood materials ("Serum u. Plasma") or in "vor u. nach". The
> rule reads the parameter name only. Every other creatinine name is treated
> as serum creatinine, so check the *Creatinine source* under Data.

Reflects: [eligible source series](method-algorithms/egfr.md#eligible-source-series)
and [AKI input series](method-algorithms/aki.md#input-series-and-conversion).

Checked 2026-11-16 against the code: `isCreatinineName`, `isNonSerumName` and
`isSerumCreatinineSeries` in `src/core/domains/nephrology/analytes.ts`. The
first draft was misleading in two places: "lymph" and "secretions" match in
German only, and a name without "Kreatinin"/"Creatinin" (for example "Krea")
is no creatinine series at all. The three example names are excluded.

Left out on purpose: the full list of markers ("Harn", `SU`, `SU24h`, `SPU`,
`PU`, `PD`, the upper-case suffix `UR`), the characters that separate name
parts, and the exact blood-material words of the "u." rule (Serum, Plasma,
Vollblut, HP, S, P). They are in the method reference.

### C2. Which creatinine series supplies the episodes of a column

`Aki.tsx`, lines 48–52. Current, unchanged: "AKI chips in the patient table
summarise detected stages as Roman numerals (e.g. *AKI I, II*). …"

Proposed, as a new paragraph after it:

> Each parameter column shows the AKI episodes that apply to it. A serum
> creatinine column (mg/dl or µmol/l) shows the episodes detected in its own
> values. A computed eGFR column uses the creatinine series it was computed
> from. Every other column, including an imported eGFR and a creatinine
> column in another material or unit, uses the patient's serum creatinine
> series that has the largest number of dated exact values. Two columns of
> the same patient can therefore show different episodes.

Reflects: [where results appear](method-algorithms/aki.md#where-results-appear).

Checked 2026-11-16 against the code: `episodesForSeries` in
`src/core/domains/nephrology/aki/akiAware.ts`. The first draft said "a
creatinine column"; only an eligible serum creatinine column detects on
itself.

Left out on purpose: on a tie the series that comes first in the data is
used; the count is taken before values of zero or less and values under
dialysis are dropped.

### C3. Plausibility warnings

`Data.tsx`, list *Inputs and assumptions*. Proposed as a new bullet after the
**Units** bullet (which ends on line 49), not inside it: with C4 the Units
bullet would otherwise grow to about twelve sentences.

> **Plausibility warnings** — the Data page warns when dated exact values of
> any serum creatinine series are above 25 mg/dl (2210.5 µmol/l), and when
> exact computed eGFR values in the preview under *3. Derive eGFR* are above
> 200 mL/min/1.73 m². A value of exactly 25 mg/dl or exactly 200 gives no
> warning. The usual cause is a µmol/l column labelled mg/dl. No value is
> changed or excluded. The warnings do not detect every wrong source: a urine
> series with an unrecognised name can stay below both limits. Imported eGFR
> series are not checked.

Reflects: the paragraph "Plausibility warnings" under
[rounding and limits](method-algorithms/egfr.md#rounding-and-limits).

Checked 2026-11-16 against the code: `IMPLAUSIBLE_CREATININE_ABOVE_MGDL` (25)
and `IMPLAUSIBLE_EGFR_ABOVE` (200) in `constants.ts`, both compared with
"greater than"; 25 × 88.42 = 2210.5. The creatinine warning counts every
eligible serum creatinine series, not only the selected source; the eGFR
warning counts the previewed calculation for the selected formula and source.

Left out on purpose: bounded values (`>30`) are not counted (the text says
"exact"); the eGFR is compared after rounding to one decimal.

### C4. A source that is not serum creatinine

`Data.tsx`, lines 44–46, bullet **Units**. Current: "Values recorded in
*µmol/l* are converted automatically (÷ 88.42); other units are not used as an
eGFR source."

Proposed, to follow that sentence:

> Creatinine from urine, dialysate or another body fluid is not used as an
> eGFR source either (see AKI detection (link to `#methods/aki/detection`) for how such
> series are recognised). If a saved session selects such a series, or a
> series in another unit, the Data page says so while a formula is selected,
> and computes no eGFR until another source or *Automatic* is chosen.

Reflects: [eligible source series](method-algorithms/egfr.md#eligible-source-series)
and [source selection](method-algorithms/egfr.md#source-selection) ("An
explicitly selected pair that is not an eligible serum-creatinine source
produces no eGFR rows").

Checked 2026-11-16 against the code: the notice in
`src/workspace/DataWorkspace.tsx` appears only while a formula other than
*Off* is selected, and also for a source in another unit. The line reference
was 45–46; the sentence starts on line 44. The link target resolves (topic
`aki`, section `detection`).

Left out on purpose: nothing.

### C5. CKD-EPI 2009 (race-free)

`Data.tsx`, after the **CKD-EPI 2021** bullet (lines 12–16). The selector
offers the equation, but the page does not describe it.

Proposed new bullet:

> **CKD-EPI 2009 (race-free)** — creatinine equation published by Levey et al.
> (Annals of Internal Medicine 2009). It is offered so that results can be
> compared with analyses that use this equation. The published coefficient
> for Black race (× 1.159) is **not applied**, because the app records no
> race. For patients to whom that coefficient does not apply, the result
> equals the published equation. Used when the formula selector is set to
> *CKD-EPI 2009 (race-free)*.

`Sources.tsx`, list *Medical Sources*, after the CKD-EPI 2021 item (lines
54–63). Proposed new item; the citation is the link, as in the neighbouring
items, with the target
`https://doi.org/10.7326/0003-4819-150-9-200905050-00006`:

> CKD-EPI 2009 creatinine equation: Levey AS et al., Annals of Internal
> Medicine 2009;150(9):604–612.

Reflects: [formulas](method-algorithms/egfr.md#formulas).

Checked 2026-11-16 against the code: `ckdEpi2009` in
`src/core/domains/nephrology/egfr/formulas.ts` (141; κ 0.7/0.9; α
−0.329/−0.411; −1.209; 0.993 per year of age; × 1.018 for women; no race
factor) and the selector label in `DataWorkspace.tsx`. Citation and DOI were
confirmed through Crossref; the coefficients were compared with the
publication from memory, not from the paper.

Left out on purpose: "equals the published equation" holds within the
conventions the page states elsewhere (sex "d" uses the male coefficients,
adults only, one-decimal rounding).

### C6. Endpoint input and AKI windows

Four places. The first draft put seven sentences into the page lead; the
detail now goes to the calculation details.

**(a)** `Endpoints.tsx`, line 6 (page lead). Current: "Display-fit AKI
exclusions and time aggregation do not change these endpoint inputs."

Proposed replacement:

> Time balancing does not change these endpoint inputs. AKI exclusion changes
> two of them: the baseline of the 40% and 57% decline and the fit of the G5
> projection (see calculation details (link to `#methods/endpoints/observed`)).

**(b)** `Endpoints.tsx`, lines 45–47 (decline baseline). Current: "Their
baseline is the arithmetic mean of all eligible exact eGFR measurements from
the first eligible date through 90 elapsed UTC days inclusive, counting
duplicate rows."

Proposed, to follow that sentence:

> When *Exclude AKI windows from fit* is on for the column, the baseline uses
> only measurements outside AKI windows, and its 90 days start at the first
> such measurement. If no measurement lies outside AKI windows, there is no
> baseline and no decline event. Observed G4 and G5, the total percent change
> and the values that start or confirm a decline use every eligible
> measurement, including those inside AKI windows. The reason: at high
> creatinine, ordinary variation can meet the AKI criterion, so a sustained
> G5 can lie inside AKI windows and is still counted.

**(c)** `Endpoints.tsx`, lines 59–60. Current: "Display-fit AKI exclusions and
aggregation do not affect this endpoint prediction."

Proposed replacement:

> Time balancing does not affect this endpoint projection. When *Exclude AKI
> windows from fit* is on for the column, measurements inside AKI windows are
> not fitted. They also do not count for the minimum number of dates or the
> follow-up span, and the latest measurement is the latest one outside these
> windows.

**(d)** `Fits.tsx`, lines 137–139. Current: "Endpoints use dated exact numeric
eGFR measurements before the first kidney transplant or chronic dialysis start
and outside complete dated acute dialysis intervals, independently of
display-fit AKI exclusions or aggregation."

Proposed replacement of the last clause:

> … and outside complete dated acute dialysis intervals, independently of time
> balancing. AKI exclusion applies to the decline baseline and the G5
> projection only; see Endpoints (link to `#methods/endpoints`).

Reflects: the paragraph "AKI windows" under
[eligibility and kidney failure reached](method-algorithms/endpoints-and-projection.md#eligibility-and-kidney-failure-reached),
the baseline rule under
[total percent change and confirmed decline](method-algorithms/endpoints-and-projection.md#total-percent-change-and-confirmed-40-57--decline)
and the paragraph "Fit" under
[individual G5 projection](method-algorithms/endpoints-and-projection.md#individual-g5-projection).

Checked 2026-11-16 against the code: baseline and projection use the points
outside AKI windows, observed G4/G5, total change and decline candidates use
all eligible points (`ckdEndpoints.ts`, `endpointContext` in
`src/core/cohort/screening.ts`); minimum dates, span, latest measurement and
the 20-year horizon are taken from the points used
(`src/core/endpoints/thresholdEndpoints.ts`). All four line references and
both link targets are right.

For the maintainer to confirm: the sentence "at high creatinine, ordinary
variation can meet the AKI criterion" is a clinical rationale, not something
the code states. The regression case supports it arithmetically: 4.5 to
4.85 mg/dl is a rise of 0.35 mg/dl within 48 hours, which meets the absolute
criterion of 0.3 mg/dl, and is 8 % in relative terms. The sentence can be
dropped if the page should state rules only.

Left out on purpose: eligible values before the first measurement outside AKI
windows are neither baseline nor candidate; the window is the onset date
through onset plus the column's window length, both ends included (C13 and
the AKI topic state this); a rise in total percent change can stand next to a
confirmed 40 % decline, because the two start from different values (Example
2 of the method reference).

### C7. Minimum for a projection: dates, not measurements

`Endpoints.tsx`, lines 68–69. Current: "Require three measurements, at least
365 days between the first and the latest, a finite declining fit, a future
crossing and an age at the latest measurement."

Proposed replacement:

> Require measurements on at least three different dates (five with
> Theil–Sen); several measurements on one day count as one date. Also require
> at least 365 days between the first and the latest measurement, a finite
> declining fit, a future crossing and an age at the latest measurement.

Reflects: [individual G5 projection](method-algorithms/endpoints-and-projection.md#individual-g5-projection),
reasons `insufficient_points` and `theil_sen_insufficient_points`.

Checked 2026-11-16 against the code:
`src/core/endpoints/thresholdEndpoints.ts` withholds below three distinct UTC
dates, below five with Theil–Sen, and below a span of 365 days. Correct as
drafted; only the sentence was split.

Left out on purpose: with AKI exclusion on, the counts refer to measurements
outside AKI windows. C6 (c) says so in the sentences just before.

### C8. The three-point interval holds for OLS only

`Endpoints.tsx`, lines 73–76. Current: "With only three measurements this
interval is so wide that it almost always includes zero: for values 60, 50, 25
at years 0, 1, 2 the slope is −17.5 per year but its interval runs from −72.5
to 37.5, so no crossing is reported. In practice a projection needs more
measurements."

Proposed replacement (the example is unchanged). The paragraph is already
long, so the Theil–Sen part starts a new paragraph:

> With OLS and only three dates this interval is so wide that it almost
> always includes zero: for values 60, 50, 25 at years 0, 1, 2 the slope is
> −17.5 per year but its interval runs from −72.5 to 37.5, so no crossing is
> reported. In practice an OLS projection needs more than three dates.
>
> With Theil–Sen and one measurement on each of up to five dates, the bounds
> are the smallest and the largest pairwise slope. With three or four dates
> these bounds contain the true slope less often than 95% of the time (about
> 67% and 92%; about 98% with five). A Theil–Sen projection therefore
> requires five dates.

Reflects: [Theil-Sen](method-algorithms/trend-estimators.md#theil-sen-2026-09-23)
and the example "Theil-Sen" under
[individual G5 projection](method-algorithms/endpoints-and-projection.md#individual-g5-projection).

Checked 2026-11-16 against the code and by recomputation:

- OLS: slope −17.5, interval −72.52 to 37.52 (`ols.ts`, t interval with
  n − 2 degrees of freedom; with three points that is one degree of freedom,
  t = 12.706). Its coverage stays at 95 %.
- Theil–Sen: the range of pairwise slopes misses the true slope only when the
  residuals rise or fall strictly over time, which is 2 of n! orderings, so
  the coverage is 1 − 2/n!. Simulated through `fitTheilSen`: 66.7 % (three),
  91.8 % (four), 98.3 % (five).
- The first draft was wrong at the boundary: "fewer than five dates". The
  bounds are still the full range with five points and narrow only from six
  (`theilSenBounds` in `src/core/stats/series.ts`).
- The first draft's "would pass every steadily falling series" is true for
  any number of points, so it did not explain the limit and was removed.

Left out on purpose: the bounds depend on the number of measurements, not of
dates, so several measurements on one date can give narrower bounds (hence
"one measurement on each"); the figures assume independent errors without
ties. The badge tooltip for `G5 < 5 dates` has the same simplification.

### C9. Status table: new badges

`Endpoints.tsx`, lines 24–25, last row of the table *Endpoint status
explanations*. Current: "**G5 n < 3** and **G5 < 1 yr** — fewer than three
eligible measurements, or fewer than 365 days between the first and the
latest. These thresholds apply to endpoint-eligible measurements rather than
to the display-fit measurements. See fit quality flags for the separate
display-fit rules." with "Check the eligible point count and follow-up span;
display-fit counts can differ."

Proposed replacement by two rows (three badges in one row were hard to scan):

> **G5 < 3 dates** and **G5 < 5 dates** — measurements on fewer than three
> different dates, or, with Theil–Sen, on three or four dates (export reason
> `theil_sen_insufficient_points`). The count refers to the measurements used
> for the projection: endpoint-eligible measurements, outside AKI windows
> when *Exclude AKI windows from fit* is on. It does not refer to the
> display-fit measurements. See fit quality flags (link to `#methods/fits/quality`)
> for the separate display-fit rules.
>
> What to check: Check the number of measurement dates; display-fit counts
> can differ.

> **G5 < 1 yr** — fewer than 365 days between the first and the latest
> measurement used for the projection.
>
> What to check: Check the follow-up span.

Proposed new row. The badge exists and the table does not list it:

> **G5 not projected after KRT** — kidney replacement therapy (KRT) has
> started and no G5 was confirmed before it. KRT here is the first dated
> kidney transplant or chronic dialysis; acute dialysis and dialysis of
> unknown intent do not count. No projection is made for the time after the
> start.
>
> What to check: Review the kidney replacement therapy event and its date.

Reflects: the reason table under
[individual G5 projection](method-algorithms/endpoints-and-projection.md#individual-g5-projection).

Checked 2026-11-16 against the code: the four badge strings and the export
reason are as in `src/workspace/labels/qualityLabels.ts`. `G5 < 5 dates`
appears only with three or four dates, because the three-date check runs
first. The retained sentence "These thresholds apply to endpoint-eligible
measurements" was no longer true with AKI exclusion on and is revised above.
KRT events: `src/core/domains/nephrology/endpoints/endpointEventPolicy.ts`.

Left out on purpose: nothing.

### C10. Reliability rule counts dates

`Fits.tsx`, lines 44–47. Current: "The badge and the `unstable_slope` export
column therefore test both the fitted count and fitted span directly: fewer
than three fitted measurements, or under a year between the first and last
fitted points."

Proposed replacement:

> The badge and the `unstable_slope` export column therefore test the number
> of fitted dates and the fitted span directly: fitted measurements on fewer
> than three different dates, or under a year between the first and last
> fitted points. Three values from one day and one value a year later are two
> dates, so their slope is marked as uncertain.

`Fits.tsx`, lines 32–34, list of amber notes. Current: "an amber note
(*n < 3, uncertain slope*, *Follow-up < 1 year, uncertain slope*) means a
slope exists but should be treated as unstable."

Proposed: add the third note to the list:

> an amber note (*n < 3, uncertain slope*, *< 3 dates, uncertain slope*,
> *Follow-up < 1 year, uncertain slope*) means a slope exists but should be
> treated as unstable.

Reflects: [reliability rule](method-algorithms/slope-quality.md#reliability-rule)
and [labels](method-algorithms/slope-quality.md#labels).

Checked 2026-11-16 against the code: `isUnstableSlope` in
`src/core/stats/slopeQuality.ts` (fewer than three fitted dates, or a fitted
span under 365 days); all three amber notes are rendered
(`src/workspace/TrajectoriesWorkspace.tsx`). The line reference was 45–47;
the sentence starts on line 44.

Left out on purpose: nothing.

### C11. What 57% stands for

`Endpoints.tsx`, lines 44–45. Current: "Confirmed 40% and 57% eGFR decline are
independent observed endpoints; 57% is a serum-creatinine doubling surrogate."

Proposed as a short paragraph of its own after the paragraph that contains
that sentence (it ends on line 52); six numbers inside that paragraph would
be too dense:

> The 57% threshold only approximates a doubling of serum creatinine, and the
> match depends on the equation. At constant age, a doubling lowers eGFR by
> 54–57% (CKD-EPI 2021: 56.5%; CKD-EPI 2009: 56.7%; MDRD-4: 55.1%; EKFC:
> 54.4%) when the starting creatinine is at or above the equation's
> breakpoint. The breakpoint is 0.7 mg/dl for women and 0.9 mg/dl for men in
> CKD-EPI and, for adults over 25, in EKFC; MDRD-4 has none. Below the
> breakpoint the decline is smaller: with CKD-EPI 2021, a rise from 0.6 to
> 1.2 mg/dl in a woman gives about 50%. When both values lie below the
> breakpoint, a doubling gives only about 15–25%, depending on equation and
> sex. The 40% threshold is a decline in eGFR and has no creatinine
> equivalent.

Reflects: the method reference states only that 57 % "serves as a
serum-creatinine doubling surrogate"
([confirmed decline](method-algorithms/endpoints-and-projection.md#total-percent-change-and-confirmed-40-57--decline)).
The breakpoints and exponents are under
[formulas](method-algorithms/egfr.md#formulas).

Checked 2026-11-16 by recomputation with the application's own functions, at
constant age (eGFR decline when creatinine doubles):

| Equation | Start at or above the breakpoint | Woman, 0.6 to 1.2 mg/dl | Man, 0.6 to 1.2 mg/dl | Both values below the breakpoint |
| --- | --- | --- | --- | --- |
| CKD-EPI 2021 | 56.47 % | 49.54 % | 37.35 % | 15.4 % (women), 18.9 % (men) |
| CKD-EPI 2009 | 56.74 % | 50.46 % | 40.22 % | 20.4 % (women), 24.8 % (men) |
| MDRD-4 | 55.06 % | 55.06 % | 55.06 % | no breakpoint |
| EKFC | 54.37 % | 48.30 % | 36.63 % | 20.0 % |

The first draft named the breakpoint for CKD-EPI only and said "above"; EKFC
has the same breakpoint for adults over 25 (age-dependent up to 25), and the
starting value must be at or above it.

Literature, from search results only (full papers not read): a doubling of
serum creatinine is equated with a 57 % eGFR decline and was the established
endpoint (Coresh et al., JAMA 2014); the NKF–FDA workshop (AJKD 2014) found a
30 % decline acceptable in some settings and 40 % more broadly. The first
author of the workshop report could not be confirmed from the results, so
the draft names no author.

For the maintainer to decide: whether this paragraph belongs on the page at
all; it explains a property of the threshold, not a rule of the application.

Left out on purpose: the age term. It lowers eGFR further per year of age by
0.62 % (CKD-EPI 2021), 0.70 % (CKD-EPI 2009) and 1.00 % (EKFC above age 40;
none between 25 and 40); in MDRD-4 the effect shrinks with age (1.09 % at 18,
0.40 % at 50, 0.25 % at 80). Over a long follow-up this adds to a decline.

### C12. Proposal: which trend method for which case

**This block is a methodological recommendation and therefore the
maintainer's to write.** It is a proposal that only restates what each method
does. It answers the question for which kinds of cases each method or setting
is meant.

`Fits.tsx`, lines 6–12, table *Fit model comparison* under *Choosing a Fit
Model*. The five existing rows and their "When to use it" texts stay. Settings
and the cohort model are not entries of the model selector and do not fit the
third column ("What the summary slope means"), so they go into a second table
and one sentence below it.

**(a)** Theil–Sen row, column "What the summary slope means". Current: "Median
of pairwise slopes; at least three observations and two distinct dates."
Proposed:

> Median of pairwise slopes; at least three observations and two distinct
> dates. No R² is reported. A G5 projection needs five distinct dates.

**(b)** Proposed second table below the first, titled *Settings that change
which measurements are fitted* (columns: Setting, When to consider it, What
it does):

> **Exclude AKI windows from fit** — The question concerns the long-term
> trend, and acute episodes should not influence it. — Leaves out all
> measurements from each AKI onset date through 30 days after it, both ends
> included; the length is a default and can be changed. This applies to the
> fit and, for an eGFR column with endpoints switched on, to the decline
> baseline and the G5 projection. At high creatinine, ordinary variation can
> meet the AKI criterion and remove much of a series; compare the two counts
> in "x fitted of y measurements".
>
> **Time balancing** (monthly or quarterly median) — Measurement density
> varies strongly, for example many inpatient values next to few outpatient
> values. — Uses one point per calendar month or quarter, so a densely
> measured period does not outweigh a sparse one. The display fit's minimum
> counts and span refer to these points; endpoints and the G5 projection use
> the single measurements.

**(c)** Proposed sentence below the second table:

> For questions about a group (its average slope, or a difference between
> groups, which needs the grouping variable as a factor in the model), use
> Cohort models (link to `#methods/cohort`) instead: one linear mixed model for all
> patients, which estimates population associations, not the course of one
> patient.

Reflects: [fit model and slope mode](method-algorithms/fit-input-presets-and-time-balancing.md#fit-model-and-slope-mode),
[Theil-Sen](method-algorithms/trend-estimators.md#theil-sen-2026-09-23),
[AKI fit-exclusion window](method-algorithms/aki.md#aki-fit-exclusion-window),
[time balancing](method-algorithms/fit-input-presets-and-time-balancing.md#time-balancing)
and [model specification](method-algorithms/cohort-models.md#model-specification).

Checked 2026-11-16 against the code:

- Theil–Sen reports no R² (`src/core/stats/series.ts`) and its projection
  needs five dates.
- The AKI window length is an editable setting with a default of 30 days
  ("Exclusion window (days)"), both ends included. The first draft stated the
  30 days as fixed.
- The first draft's "Minimum counts and the follow-up span refer to these
  points" was wrong for projections: the G5 projection and the endpoints use
  the single measurements, not the medians (`endpointContext` in
  `src/core/cohort/screening.ts`).
- "compare n and n fitted" named labels the interface does not show; the
  interface says "x fitted of y measurements".
- The cohort model is one `lmer` fit with a random intercept and slope per
  patient by default, fitted with REML, with Wald intervals
  (`src/core/mixedModel/`). A group difference needs a factor in the model.
- The link target `#methods/cohort` resolves.

For the maintainer to confirm: the two "When to consider it" texts and the
cohort sentence are new recommendation text. The clause "at high creatinine,
ordinary variation can meet the AKI criterion" is the same clinical rationale
as in C6.

Left out on purpose: the first draft's sentence "Rolling and segmented OLS
change what the chart shows, not the reported slope" repeats the cells of the
first table. The slope mode `aki-aware` exists in the code but cannot be
selected in the interface
([code not reachable](method-algorithms/unreachable-code.md#fit-code-not-reachable-from-the-interface)),
so the draft describes the setting.

### C13. AKI exclusion also affects the decline baseline and the projection

`Aki.tsx`, lines 96–98. Current, unchanged: "With AKI exclusion on, each
episode removes from the fit all measurements from the onset date through
onset + 30 days (default), both ends included: onset 2 January 2020 excludes
2 January to 1 February 2020."

Proposed, to follow that sentence:

> For an eGFR column, the same windows are also left out of the baseline of
> the 40% and 57% decline and of the G5 projection. Observed G4 and G5 still
> use every eligible measurement (see
> Endpoints (link to `#methods/endpoints/observed`)).

Reflects: the paragraph "AKI windows" under
[eligibility and kidney failure reached](method-algorithms/endpoints-and-projection.md#eligibility-and-kidney-failure-reached).

Checked 2026-11-16 against the code: same rule as C6. Without this pointer
the AKI topic would say that the exclusion affects the fit only. The link
target resolves (topic `endpoints`, section `observed`).

Left out on purpose: nothing.

### Follow-up edits in the same files

Existing sentences that should be aligned when the drafts are applied. They
are wording only; none changes a statement.

- **"aggregation".** `Endpoints.tsx` lines 6 and 59 and `Fits.tsx` line 139
  are replaced by C6. Two more remain and describe the same setting:
  `Cohort.tsx` line 11 ("excluded or aggregated") and `Fits.tsx` line 122
  ("pre-event aggregates").
- **"Display-fit AKI exclusions".** `Endpoints.tsx` lines 6 and 59 and
  `Fits.tsx` line 139, all replaced by C6. The term should not come back: the
  exclusion no longer affects the display only.
- **"Theil-Sen" with a hyphen.** `Endpoints.tsx` line 59, `Fits.tsx` lines 64
  and 125, and `Sources.tsx` lines 38 (twice) and 48. The table in `Fits.tsx`
  and the drafts use the en dash.
- **"1.73m²" without a space.** `Endpoints.tsx` line 5, `Fits.tsx` lines 108
  and 186, and `Trajectories.tsx` line 44. The other places and the drafts
  write "1.73 m²".
- **"latest eligible measurement".** `Endpoints.tsx` lines 17–18 and 70 (the
  20-year horizon) and lines 23–24 (age). With AKI exclusion on, the
  projection counts from the latest measurement outside AKI windows. C6 (c)
  says so once; these sentences can stay or read "latest measurement used".
- **"prediction".** The heading "Individual endpoint prediction algorithm",
  the navigation labels and several body sentences in `Endpoints.tsx` and
  `Fits.tsx` say "prediction", the badges and the table "projected". New text
  says "projection". Renaming the heading is the maintainer's call.
- **Counts in dates.** After C7, C9 and C10 the minimums are counted in
  dates. `Endpoints.tsx` line 25, "Check the eligible point count", is
  replaced by C9; read the neighbouring sentences once more after insertion.

### Points to check in Part C

- **Line numbers** refer to the topic files as of 2026-11-16 and move with any
  edit.
- **C6 and C12.** The rationale sentence about ordinary variation at high
  creatinine is the maintainer's statement to confirm.
- **C8.** The coverage figures hold for independent errors without tied
  values; the draft says "about".
- **C11.** The percentages come from the application's functions; the
  statements about the origin of the thresholds rest on search results, not
  on the papers.
- **C12.** "When to consider it" for the two settings and the cohort sentence
  are new recommendation text, not a restatement of an approved sentence.
- **Not drafted:** a note for imported eGFR series whose laboratory changed
  the equation mid-series. It is deferred as a feature in issue #4.

## Part D: sources, own rules and corrected statements after the science audits (applied 2026-11-16, PR #53, except D1 a)

Drafted 2026-11-16 after two read-only audits of the nephrology and the
statistical methods on `main`. **Part D was approved by the owner on
2026-11-16 and is on the methodology page since pull request #53, except the
reference list D1 (a), which is still open** (D3 (c) and (d2) went in with
#50, D3 (d) is superseded). Result of the audits in one sentence:
every coefficient and threshold in the code matched its published source; the
gaps are missing or incomplete citations, a few statements that claim too
much, and own rules that a reader could take for published standards.

**What was checked, and how.**

- Recomputation: the OLS formulas, the worked examples of the page and the
  Theil–Sen coverage for 3 to 30 measurements (audit); the examples in D3 (b),
  (c) and (d) were run through the application's own functions on 2026-11-16.
- Crossref: every DOI in D1 was resolved on 2026-11-16; authors, title,
  journal, volume, issue and pages are copied from the Crossref record.
- Document text: the KDIGO AKI 2012 staging table, the KDIGO 2012 wording on
  rapid progression as quoted in the KDOQI commentary, the EMA guideline
  (audit) and the two NIDDK pages (fetched 2026-11-16).
- Memory only, therefore not for publication yet: see "Could not be verified"
  under D1. No DOI in Part D is guessed.
- Left for the maintainer: all wording, which is published under his
  authorship; whether to change the AKI staging order instead of disclosing it
  (D3 d); the label of the Theil–Sen bounds below five dates (D3 a); and the
  notes for code changes at the end.

Form and terms are those of Part C. Links into the methodology page are
written as text with their target; every target was checked against the topic
and section ids of the page.

### D1. Sources page: a full reference list

**D1 (a) is NOT applied (open).** The owner decided on 2026-11-16 that the
full list waits until he has compared the EKFC coefficients with the paper
and the EMA guideline is confirmed. Only the CKD-EPI 2009 entry (C5) and the
DOI link of the EKFC entry were added to the existing list. D1 (b) is applied.

**(a)** `Sources.tsx`, list *Medical Sources* (lines 52–92). Current: five
items that are link texts without authors, title, year, volume, pages or DOI:
"CKD-EPI 2021 creatinine equation: National Kidney Foundation formula page and
NIDDK adult eGFR equations reference." (lines 54–63), "MDRD-4 175-coefficient
equation: NIDDK previous adult eGFR equations reference." (64–69), "EKFC 2021
creatinine equation: Pottel et al., Annals of Internal Medicine 2021." (70–75,
linked to an institutional research portal), "AKI detection and staging
thresholds: KDIGO 2012 Clinical Practice Guideline for Acute Kidney Injury and
the KDIGO AKI / AKD guideline update page." (76–85) and "Rapid CKD progression
threshold: KDOQI US Commentary on the 2012 KDIGO CKD guideline." (86–91).
CKD-EPI 2009, the G4 and G5 boundaries, the 40% and 57% decline, every
statistical method and the software have no entry.

Proposed replacement. The heading becomes *References*; each DOI is rendered
as a link to `https://doi.org/` followed by the DOI.

> **References**
>
> Primary publications for the methods of this tool. The equations and
> thresholds in the application were compared with these sources.
>
> *eGFR equations*
>
> - CKD-EPI 2021 creatinine equation: Inker LA et al. New Creatinine- and
>   Cystatin C–Based Equations to Estimate GFR without Race. New England
>   Journal of Medicine 2021;385(19):1737–1749. doi:10.1056/NEJMoa2102953
> - CKD-EPI 2009 creatinine equation, used here without its coefficient for
>   Black race: Levey AS et al. A New Equation to Estimate Glomerular
>   Filtration Rate. Annals of Internal Medicine 2009;150(9):604–612.
>   doi:10.7326/0003-4819-150-9-200905050-00006
> - MDRD-4 in its 175-coefficient form for standardised creatinine, used here
>   without its race multiplier: Levey AS et al. Using Standardized Serum
>   Creatinine Values in the Modification of Diet in Renal Disease Study
>   Equation for Estimating Glomerular Filtration Rate. Annals of Internal
>   Medicine 2006;145(4):247–254.
>   doi:10.7326/0003-4819-145-4-200608150-00004
> - EKFC creatinine equation: Pottel H et al. Development and Validation of a
>   Modified Full Age Spectrum Creatinine-Based Equation to Estimate
>   Glomerular Filtration Rate. Annals of Internal Medicine
>   2021;174(2):183–191. doi:10.7326/M20-4366
>
> *Acute kidney injury*
>
> - Detection thresholds and stages: KDIGO Clinical Practice Guideline for
>   Acute Kidney Injury. Kidney International Supplements 2012;2(1):1–138.
>   Full text at
>   https://kdigo.org/wp-content/uploads/2016/10/KDIGO-2012-AKI-Guideline-English.pdf
>
> *CKD stages and progression*
>
> - GFR categories G4 and G5, the duration of more than three months, and the
>   definition of rapid progression: KDIGO 2012 Clinical Practice Guideline
>   for the Evaluation and Management of Chronic Kidney Disease. Kidney
>   International Supplements 2013;3(1):1–150. Full text at
>   https://kdigo.org/wp-content/uploads/2017/02/KDIGO_2012_CKD_GL.pdf
> - Current guideline, with the same GFR categories: Stevens PE et al. KDIGO
>   2024 Clinical Practice Guideline for the Evaluation and Management of
>   Chronic Kidney Disease. Kidney International 2024;105(4S):S117–S314.
>   doi:10.1016/j.kint.2023.10.018
>
> *eGFR decline as an endpoint (40% and 57%)*
>
> - Levey AS et al. GFR Decline as an End Point for Clinical Trials in CKD: A
>   Scientific Workshop Sponsored by the National Kidney Foundation and the US
>   Food and Drug Administration. American Journal of Kidney Diseases
>   2014;64(6):821–835. doi:10.1053/j.ajkd.2014.07.030
> - Coresh J et al. Decline in Estimated Glomerular Filtration Rate and
>   Subsequent Risk of End-Stage Renal Disease and Mortality. JAMA
>   2014;311(24):2518. doi:10.1001/jama.2014.6634
>
> *Statistics*
>
> - Least-squares regression and its confidence interval: Draper NR, Smith H.
>   Applied Regression Analysis. Wiley, 1998. doi:10.1002/9781118625590
> - Theil–Sen slope: Theil H. A Rank-Invariant Method of Linear and Polynomial
>   Regression Analysis. First published 1950; reprinted in Raj B, Koerts J
>   (eds). Henri Theil's Contributions to Economics and Econometrics. Springer,
>   1992, pages 345–381. doi:10.1007/978-94-011-2546-8_20
> - Theil–Sen bounds: Sen PK. Estimates of the Regression Coefficient Based on
>   Kendall's Tau. Journal of the American Statistical Association
>   1968;63(324):1379–1389. doi:10.1080/01621459.1968.10480934. The intercept
>   and the handling of tied values follow SciPy `theilslopes`
>   (https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html).
> - Linear mixed models: Laird NM, Ware JH. Random-Effects Models for
>   Longitudinal Data. Biometrics 1982;38(4):963. doi:10.2307/2529876
>
> *Software for cohort models*
>
> - lme4: Bates D, Mächler M, Bolker B, Walker S. Fitting Linear Mixed-Effects
>   Models Using lme4. Journal of Statistical Software 2015;67(1).
>   doi:10.18637/jss.v067.i01
> - R: R Core Team. R: A Language and Environment for Statistical Computing.
>   R Foundation for Statistical Computing, Vienna, Austria.
>   https://www.R-project.org/. The R version and the package versions of each
>   fit are recorded in the model export.
> - webR, which runs R in the browser: https://docs.r-wasm.org/webr/latest/
> - lmerTest, which the exported R script names for degrees of freedom and
>   p-values: Kuznetsova A, Brockhoff PB, Christensen RHB. lmerTest Package:
>   Tests in Linear Mixed Effects Models. Journal of Statistical Software
>   2017;82(13). doi:10.18637/jss.v082.i13
>
> *Caveats named on these pages*
>
> - Slopes, dropout and mixed models: Janmaat CJ et al. Pitfalls of linear
>   regression for estimating slopes over time and how to avoid them by using
>   linear mixed-effects models. Nephrology Dialysis Transplantation
>   2019;34(4):561–566. doi:10.1093/ndt/gfy128
> - Intervals and tests in small mixed models: Luke SG. Evaluating
>   significance in linear mixed-effects models in R. Behavior Research
>   Methods 2017;49(4):1494–1502. doi:10.3758/s13428-016-0809-y
>
> *Further reading*
>
> - National Kidney Foundation, CKD-EPI creatinine equation (2021); NIDDK,
>   eGFR equations for adults; NIDDK, previous eGFR equations for adults.
> - NIDDK, eGFR equations for children, adolescents and young adults. This
>   page holds the NIDDK note on the EKFC equation.
> - KDIGO AKI and AKD guideline update page.
> - Inker LA et al. KDOQI US Commentary on the 2012 KDIGO Clinical Practice
>   Guideline for the Evaluation and Management of CKD. American Journal of
>   Kidney Diseases 2014;63(5):713–735. doi:10.1053/j.ajkd.2014.01.416

How the two KDIGO guidelines of 2012 are cited. The DOIs often quoted for
them, 10.1038/kisup.2012.1 and 10.1038/kisup.2012.73, resolve in Crossref to a
one-page item titled "Notice", the first page of each supplement issue. The
guidelines were published as separate sections, each with its own DOI, so no
single DOI stands for the whole guideline. The draft therefore gives the
supplement reference (volume, issue and page range, confirmed from the
Crossref records of the first and last items of each issue) and the full text
at kdigo.org, and no DOI.

**(b)** `Data.tsx`, **EKFC 2021** bullet, lines 29–31. Current: "The NIDDK
notes that EKFC creatinine was developed mainly in White European populations,
uses population-specific Q scaling, and does not meet US race-free equation
recommendations." The statement is NIDDK's, but it stands on the NIDDK page
for children, adolescents and young adults, not on the adults page that
`Sources.tsx` links. Proposed, closer to the source:

> The NIDDK notes that the EKFC creatinine equation was developed in a
> population of White European children and adults, has not yet been fully
> validated in diverse populations, rescales creatinine by a Q value for which
> no factors have been established for the United States, and does not meet
> recommendations for race-free equations.

The link for this sentence is
`https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/children-adolescents-young-adults`.
The EKFC item itself links to the DOI instead of the research portal.

Reflects: [formulas](method-algorithms/egfr.md#formulas),
[detection](method-algorithms/aki.md#detection),
[observed G4/G5](method-algorithms/endpoints-and-projection.md#observed-g4g5),
[Theil–Sen](method-algorithms/trend-estimators.md#theil-sen-2026-09-23) and
[reproducibility](method-algorithms/cohort-models.md#reproducibility).

Checked 2026-11-16: all 16 DOIs of the list, and the two named under
"Could not be verified", resolve in Crossref to the stated work. Print
years are Crossref's "published-print" (Janmaat: online 2018, print 2019;
Luke: online 2016, print 2017). The KDIGO page ranges 1–138 and 1–150 follow
from the last Crossref items of the two issues ("References", pages 124–138
and 136–150). The NIDDK note was read on the page named above; the adults
page mentions EKFC without this note. kdigo.org, R-project.org and
docs.r-wasm.org answered. The exported R script names lmerTest
(`src/core/mixedModel/rCode.ts`), and the export records the R and package
versions (`webr.worker.ts`, `modelExport.ts`).

**Could not be verified, do not publish yet.**

- **EMA guideline** EMA/CHMP/500825/2016, which prefers a loss in GFR "such as
  50%" and is the contrasting position to the 40% endpoint. **Confirmed on
  2026-11-18** from the document itself: the title is "Guideline on the
  clinical investigation of medicinal products to prevent development/slow
  progression of chronic renal insufficiency", the link is
  <https://www.ema.europa.eu/en/documents/scientific-guideline/guideline-clinical-investigation-medicinal-products-prevent-developmentslow-progression-chronic-renal-insufficiency_en.pdf>,
  and section 6.2.2 (secondary prevention) recommends the "time to a
  predefined and justified loss in GFR, such as 50%", with lower magnitudes
  allowed when qualified. The guideline does not name 40% or 57%, a
  confirmation interval or a rate that defines rapid progression; it names
  MDRD and CKD-EPI as examples of validated equations. It can be added under
  *eGFR decline as an endpoint*; whether to publish is the owner's call.
- **Theil 1950, original publication.** Only the 1992 reprint is confirmed.
  The original journal reference (Proceedings of the Koninklijke Nederlandse
  Akademie van Wetenschappen, volume 53) is from memory.
- **End pages** where Crossref records the first page only: Coresh (2518) and
  Laird and Ware (963). Bates et al. has no page range in Crossref.
- **Edition of Draper and Smith.** The 1998 book is, from memory, the third
  edition; the Crossref record does not say so.
- **EKFC coefficients against the paper's text.** The citation is confirmed;
  the paper is behind a paywall, so the coefficients were compared from
  memory. The same holds for the Q value above age 25 (0.90 mg/dl in the
  code; 80 µmol/l in the paper according to the audit).
  **Compared with secondary sources on 2026-11-18, not with the paper:** every
  coefficient in `formulas.ts` matches. 107.3, the exponents −0.322 and −1.132
  and 0.990^(age − 40): Delanaye et al., Clin Kidney J 2023 (PMID 37664574).
  Male Q polynomial: Ahmed et al., EJIFCC 2024 (PMID 39810889). Female Q
  polynomial: a validation study in Chinese patients (PMC9848359) and Risch,
  Pipette 6/2020. Q above age 25, 80 µmol/l (0.90 mg/dl) for men and 62 µmol/l
  (0.70 mg/dl) for women: two online calculators only. The owner's comparison
  with the paper's own text is still open.
- **Whether KDIGO 2024 keeps the definition of rapid progression.** The audit
  did not find it there by text search. D3 (h) therefore names KDIGO 2012.
- **Content of Janmaat 2019 and Luke 2017.** Their bibliographic data are
  confirmed; the papers were not read in full. Confirm that each supports
  the sentence it is cited for (the dropout paragraph in `Cohort.tsx` lines
  27–32, and D3 f).
- **Two verified references that carry statements from memory** and are
  therefore not in the list: Levin A et al., Kidney International
  2020;98(4):849–859, doi:10.1016/j.kint.2020.07.013 (kidney-failure
  definitions for trials, see D3 i), and the ADQI 16 report, Nature Reviews
  Nephrology 2017;13(4):241–257, doi:10.1038/nrneph.2017.2 (acute kidney
  disease, see D2).

Left out on purpose: the names of the webR authors (not confirmed); a
reference for small-sample degrees of freedom beyond lmerTest; and any
citation for the rules listed in D2, which have none.

### D2. Rules of this tool that are not published standards

`Sources.tsx`, new section between *Validation scope* (ends at line 51) and
the reference list. Current text on this point is one sentence, lines 49–50:
"The observed G4/G5 and endpoint prediction rules are this application's own
research definitions: unit tests cover them, but neither check above applies."
It stays; the new section lists every such rule in one place.

Proposed new section:

> **Rules of this tool that are not published standards**
>
> The thresholds for eGFR, AKI detection and CKD stages come from the
> publications listed below. The following rules do not. They are research
> definitions of this tool, chosen to be simple and reproducible, and they
> are not validated.
>
> - **Uncertain slope.** A slope is marked as uncertain when the fitted
>   measurements fall on fewer than three different dates, or when fewer than
>   365 days lie between the first and the last fitted measurement.
> - **Two measurements.** Two measurements on different dates give the exact
>   line through both, with R² = 1 and no interval.
> - **Rolling and segmented OLS.** Windows of 730 days moved in steps of 180
>   days; a new segment where two consecutive fitted measurements lie more
>   than 180 days apart; at least three measurements per window or segment.
> - **Time balancing.** One point per calendar month or quarter. Its value is
>   the median of the measurements in that period. Its date is the date of the
>   middle measurement, or of the earlier of the two middle ones.
> - **AKI window.** From the onset date through 30 days after it (default,
>   adjustable), both ends included. KDIGO defines how AKI is detected and
>   staged; it defines no such window.
> - **AKI episodes.** Consecutive measurements that meet a criterion form one
>   episode only while they share the same baseline date, and an episode has
>   no end. A chip such as *AKI 4×I* therefore counts crossings against a
>   moving baseline, not clinical episodes.
> - **Confirmation of an observed event.** A later low value at least 90 days
>   (default, adjustable) and at most 12 calendar months after the first.
>   This resembles the KDIGO duration of more than three months but is not
>   the same rule.
> - **Baseline of the 40% and 57% decline.** The mean of the eligible eGFR
>   values of the first 90 days. The two percentages come from the
>   publications below; the baseline and the confirmation are this tool's.
> - **Kidney failure reached.** The first dated kidney transplant or the first
>   dialysis recorded as chronic. No duration is checked, and a low eGFR is
>   reported as CKD G5 instead.
> - **G5 projection.** Reported only with measurements on at least three
>   different dates (five with Theil–Sen), at least 365 days of follow-up, a
>   declining fit whose slope interval lies entirely below zero, and a
>   crossing no more than 20 years after the latest measurement used.
> - **Rapid decline flag.** The number, 5 mL/min/1.73 m² per year, is from
>   KDIGO 2012. Applying it to a fitted slope, without testing that the
>   decline is sustained, is this tool's rule.
> - **Cohort models.** At least ten patients with repeated measurements at
>   different times: three times per patient for a random intercept and
>   slope, two for a random intercept alone.
> - **eGFR conventions.** Sex "d" uses the male coefficients. Age is counted
>   in whole completed years, and no eGFR is computed below 18 years.
>   "CKD-EPI 2009 (race-free)" is the published 2009 equation without its
>   coefficient for Black race, not a separately published equation.

Reflects: [reliability rule](method-algorithms/slope-quality.md#reliability-rule),
[rolling and segmented OLS](method-algorithms/trend-estimators.md#rolling-and-segmented-ols),
[time balancing](method-algorithms/fit-input-presets-and-time-balancing.md#time-balancing),
[AKI fit-exclusion window](method-algorithms/aki.md#aki-fit-exclusion-window),
[episodes](method-algorithms/aki.md#episodes),
[observed G4/G5](method-algorithms/endpoints-and-projection.md#observed-g4g5),
[decline baseline](method-algorithms/endpoints-and-projection.md#total-percent-change-and-confirmed-40-57--decline),
[kidney failure reached](method-algorithms/endpoints-and-projection.md#eligibility-and-kidney-failure-reached),
[individual G5 projection](method-algorithms/endpoints-and-projection.md#individual-g5-projection),
[rapid decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag),
[minimum data](method-algorithms/cohort-models.md#minimum-data-and-validity-gates)
and [formulas](method-algorithms/egfr.md#formulas).

Checked 2026-11-16 against the code: `isUnstableSlope` (fewer than three
fitted dates, or a span under 365 days); `fitGlobal` for two points;
`rollingSlopes` and `fitSegments` (730, 180, gap strictly above 180, three
per window or segment); `medianPoint` in `timeBalancing.ts` (median value,
date of the lower-middle measurement by date);
`DEFAULT_AKI_EXCLUSION_DAYS = 30`; `clusterEpisodes`;
`DEFAULT_CONFIRMATION_DAYS = 90` with the 12-month limit;
`MIN_PROJECTION_DATES = 3`, `MIN_THEIL_SEN_PROJECTION_DATES = 5`,
`MIN_PROJECTION_SPAN_DAYS = 365`, the interval test and the 20-year limit in
`ckdEndpoints.ts`; `DEFAULT_RAPID_EGFR_DECLINE = 5`;
`MIN_QUALIFYING_PATIENTS = 10`; sex "d" in `formulas.ts`.

Left out on purpose: the plausibility limits (25 mg/dl and 200), which C3
already presents as warnings of this tool; the MDRD-4 race multiplier, which
the page states at the equation; the one-decimal rounding of eGFR, described
under *eGFR: Conditions, Age and Rounding*; and the fixed tolerance of the
KDIGO comparisons. The audit's remark that the nearest published concept to
the AKI window is acute kidney disease, 7 to 90 days after AKI (ADQI 16),
rests on memory and is not in the text.

### D3. Statements that claim too much

Each block quotes the current sentence and gives a corrected one.

**(a) Theil–Sen "95% bounds".** `Fits.tsx`, lines 69–70. Current: "The
reported 95% bounds describe uncertainty in the slope, not a prediction
interval for individual values." Proposed:

> The reported bounds describe uncertainty in the slope, not a prediction
> interval for individual values. They are 95% bounds from five measurement
> dates on. With one measurement on each of three or four dates they are the
> smallest and the largest pairwise slope, and they contain the true slope in
> only about 67% and 92% of cases.

`Sources.tsx`, lines 38–39. Current: "… for Theil-Sen including the slope,
separate-median intercept, 95% slope bounds and unavailable-fit cases."
Proposed: "… for Theil–Sen including the slope, separate-median intercept,
slope bounds and unavailable-fit cases."

Reflects: [Theil–Sen](method-algorithms/trend-estimators.md#theil-sen-2026-09-23).

Checked: the audit computed the exact coverage without tied values as 66.7%
for three, 91.7% for four and 98.3% for five measurements, and at least 95.09%
up to thirty. This agrees with C8. Coverage with several measurements on one
date was not computed.

Left out on purpose: the table cell itself shows "95% slope CI" for every
number of dates; see the notes for code changes.

**(b) Theil–Sen and outliers.** `Fits.tsx`, lines 64–65. Current: "the median
of all pairwise slopes, which makes it insensitive to a minority of outlying
points." Proposed:

> the median of all pairwise slopes, which makes it less sensitive than OLS to
> single outlying measurements in a longer series. With three measurements it
> gives no protection, because one outlier changes two of the three pairwise
> slopes: 60, 55 and 10 at years 0, 1 and 2 give about −25 per year. With
> five measurements, 60, 57, 54, 51 and 10 give −3.0 per year.

The rest of the bullet stays.

Reflects: [Theil–Sen](method-algorithms/trend-estimators.md#theil-sen-2026-09-23).

Checked 2026-11-16 by running `fitTheilSen`: −24.98 and −3.00 per year.

**(c) The AKI baseline does not "maximise sensitivity".** `Aki.tsx`, lines
42–46. Current: "The reference baseline is the **lowest creatinine within the
lookback window** (48 h for the absolute criterion, 7 days for the relative
criterion) — a pragmatic baseline for automated detection that maximises
sensitivity." Proposed:

> The reference baseline is the **lowest creatinine within the lookback
> window** (48 h for the absolute criterion, 7 days for the relative
> criterion). No earlier value is used: no outpatient or historical baseline
> and no estimated one. Detection therefore finds rises against recent
> values and misses two situations. An AKI that is already present at the
> first measurement is not detected: 3.0 and 3.1 mg/dl on consecutive days,
> followed by 1.0 mg/dl three weeks later, give no episode. A rise that is
> slower than the windows is not detected either: 1.0, 1.6 and 2.4 mg/dl
> eight days apart give no episode.

Reflects: [detection](method-algorithms/aki.md#detection) and
[known limitations](method-algorithms/aki.md#known-limitations).

Checked 2026-11-16 by running `findKdigoAkiEpisodes` on both examples: no
episode in either.

**(d) AKI stage and the order of the criteria. SUPERSEDED on 2026-11-16: do
not apply this block; apply (d2) below instead.** The owner decided to grade
every stage against the seven-day minimum, and the code now does so, so the
limitation this block describes no longer exists. The block is kept as the
record of the earlier behaviour. `Aki.tsx`, line 28, and the
stage list, lines 29–41. Current: "AKI episodes are staged by the ratio of
peak creatinine to the reference baseline:". The sentence stays. Proposed
addition after the list:

> The stage refers to the baseline of the criterion that detected the
> episode. The absolute criterion is checked first. When it is met, the
> baseline is the lowest value of the last 48 hours, even if a lower value
> lies within the last seven days. A stage can therefore be lower than a
> grading against the lowest value of the last seven days: 1.0 mg/dl on
> 1 January, 2.9 on 6 January and 3.3 on 7 January give a Stage II episode
> (2.9 against 1.0) and a Stage I episode (3.3 against 2.9), where 3.3
> against 1.0 would be Stage III.

Reflects: [staging](method-algorithms/aki.md#staging) and
[known limitations](method-algorithms/aki.md#known-limitations).

Checked 2026-11-16 by running `findKdigoAkiEpisodes`: two episodes, onset
6 January (baseline 1.0, peak 2.9, stage II, relative criterion) and onset
7 January (baseline 2.9, peak 3.3, stage I, absolute criterion).

This block described the code as it was until 2026-11-16. The owner had
decided on 2026-10-06 not to change AKI episode merging and staging; on
2026-11-16 he decided to grade against the seven-day minimum. With the new
code the same values give Stage II (2.9 against 1.0) and Stage III (3.3
against 1.0).

**(d2) AKI stage: reference value, and a sentence that is now wrong
(needed, replaces (d)).** Since the staging change of 2026-11-16 one sentence
of the page states a wrong result and one is incomplete.

`Aki.tsx`, line 28. Current: "AKI episodes are staged by the ratio of peak
creatinine to the reference baseline:". Proposed:

> AKI episodes are staged by the ratio of creatinine to the lowest value of
> the seven days before the measurement, whichever criterion detected the
> episode. An episode gets the highest stage that one of its measurements
> reaches:

`Aki.tsx`, lines 91–92. Current: "… a sustained rise is reported as a chain
of episodes: daily values of 1.0, 1.4, 1.8, 2.2, 2.6 and 3.0 mg/dl give four
Stage I episodes." This is no longer what the app shows. Proposed:

> … a sustained rise is reported as a chain of episodes: daily values of 1.0,
> 1.4, 1.8, 2.2, 2.6 and 3.0 mg/dl give four episodes of Stage I, II, II and
> III, each staged against the lowest value of the last seven days (1.0).

Reflects: [staging](method-algorithms/aki.md#staging) and
[known limitations](method-algorithms/aki.md#known-limitations).

Checked 2026-11-16 by running `findKdigoAkiEpisodes` with the new rule: the
chain gives onsets 2, 4, 5 and 6 January with stages I, II, II, III (chip
`AKI I, 2×II, III`); 1.0, 1.2 and 3.2 mg/dl on days 0, 3 and 4 give one
Stage III episode.

Left out on purpose: that the recorded detection baseline can be higher than
the staging reference, and that the stage of an episode need not come from its
peak measurement. The marker tooltip names both numbers the stage follows
from ("staged [from … mg/dl on …] against … mg/dl, the lowest value of the 7
days before"); it does not show the recorded detection baseline. An earlier
note here said the interface does not show the baseline at all; until the
review of 2026-11-16 the tooltip did print it, next to a stage it no longer
explained.

**(e) What the OLS interval assumes.** `Fits.tsx`, lines 226–231. Current:
"The 95% interval is the slope ± t × standard error, where the standard error
comes from the residual sum of squares with n − 2 degrees of freedom and t is
the two-sided 95% value of Student's t distribution. It describes uncertainty
in the slope, not a prediction interval." Proposed addition at the end of the
paragraph:

> The interval assumes independent measurement errors of equal size.
> Repeated eGFR values of one patient are usually correlated, so the interval
> tends to be too narrow. With time balancing it describes the monthly or
> quarterly medians, not the single measurements.

Reflects: [ordinary least squares](method-algorithms/trend-estimators.md#ordinary-least-squares)
and [time balancing](method-algorithms/fit-input-presets-and-time-balancing.md#time-balancing).

Checked: the audit recomputed the formulas in `ols.ts`. That serial eGFR
values are correlated is a statistical statement, not something the code
shows; it is the maintainer's to confirm.

**(f) Intervals of the cohort model.** `Cohort.tsx`, lines 48–49. Current:
"Fixed effects have 95% Wald intervals; no p-values are computed." Proposed:

> Fixed effects have 95% Wald intervals (estimate ± 1.96 standard errors).
> They are approximate and tend to be too narrow when the model has few
> patients. No degrees of freedom and no p-values are computed, and nothing
> is adjusted for testing several coefficients or groups. For tests, the
> exported R script names the lmerTest package.

Lines 34–37 ("This is an input safeguard, not evidence of adequate statistical
power.") stay as they are.

Reflects: [confidence intervals](method-algorithms/cohort-models.md#confidence-intervals)
and [minimum data](method-algorithms/cohort-models.md#minimum-data-and-validity-gates).

Checked against the code: `confint(method = "Wald")` in `webr.worker.ts`, no
p-values or degrees of freedom in the result, `MIN_QUALIFYING_PATIENTS = 10`,
and the lmerTest comment in `rCode.ts`. "Too narrow with few patients" rests
on Luke 2017, which was not read in full.

**(g) What the individual projection assumes.** `Endpoints.tsx`, prediction
algorithm, after line 67 ("… whether or not the observed G5 endpoint is
displayed."). Proposed addition:

> The projection assumes that the fitted linear decline continues unchanged.
> It has no interval of its own. Because a projected age is reported only
> when the slope interval lies entirely below zero, the reported ages come
> from clearly declining series. A missing projected age does not mean a
> stable course.

Reflects: [individual G5 projection](method-algorithms/endpoints-and-projection.md#individual-g5-projection).

Checked against the code: the crossing of the fitted line and the interval
test in `ckdEndpoints.ts`; no interval is computed for the projected age.

Left out on purpose: the number of decimals of the projected age; see the
notes for code changes.

**(h) Rapid decline: KDIGO 2012.** `Trajectories.tsx`, lines 44–45. Current:
"The default threshold of **5 mL/min/1.73m² per year** is the number KDIGO
uses for rapid CKD progression, which KDIGO defines as a sustained decline."
Proposed:

> The default threshold of **5 mL/min/1.73 m² per year** comes from the KDIGO
> 2012 CKD guideline, which defines rapid progression as a sustained decline
> in eGFR of more than 5 mL/min/1.73 m² per year.

The following sentences (lines 46–48), which say that the flag does not test
whether a decline is sustained, stay.

Reflects: [rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag).

Checked: `DEFAULT_RAPID_EGFR_DECLINE = 5` and the strict comparison in
`rapidEgfrDeclineModule.ts`. The KDIGO wording was read by the audit as
quoted in the KDOQI commentary, not in the guideline itself.

**(i) "Kidney failure reached" is narrower than the usual term.** `Fits.tsx`,
lines 139–141. Current: "Kidney replacement therapy is reported separately as
kidney failure reached with its type and date, independently of lab-confirmed
G5." Proposed addition after this sentence:

> "Kidney failure reached" here means the first dated kidney transplant or
> the first dialysis recorded as chronic. This is narrower than the usual
> term, which also covers a GFR below 15 without kidney replacement therapy;
> the tool reports that as CKD G5. Whether a dialysis is chronic is taken
> from the imported event; no minimum duration is checked.

Reflects: [eligibility and kidney failure reached](method-algorithms/endpoints-and-projection.md#eligibility-and-kidney-failure-reached).

Checked against the code: `endpointEventPolicy.ts` (earliest transplant or
chronic dialysis) and the label in `endpointLabels.ts` ("distinct from
lab-confirmed CKD G5"). That KDIGO counts a GFR below 15 as kidney failure is
the audit's reading of the guideline.

Left out on purpose: the trial definition of Levin et al. 2020 (maintenance
dialysis for at least four weeks), which the audit had from memory only. The
first clause of the current sentence is replaced by C6 (d); apply both
together.

### Notes for code changes from Part D

These are decisions about the interface, not wording of the methodology page.
Made on 2026-11-16 (pull request #53): the settings heading with its hint, and
the projected age in whole years on either age basis (`G5 @ ~64y`; the export
keeps the unrounded value). Made earlier that day: the "Slope range" label and
the AKI staging. Not made: the lme4 citation in the R export.

- **Settings heading "AKI exclusions (KDIGO)"**
  (`src/workspace/trajectory-ui/NephrologySettings.tsx` line 67 and
  `src/workspace/WorkspaceAnalysisSettings.tsx` line 198). The detection is
  KDIGO, the window is not. Proposed heading: "AKI exclusion windows", with
  the hint "Episodes are detected with the KDIGO creatinine criteria. The
  length of the window is a rule of this tool."
- **Table cell "95% slope CI"** (`src/workspace/TrajectoriesWorkspace.tsx`).
  Decided and changed on 2026-11-16: for Theil–Sen on fewer than five
  distinct fitted dates the cell reads "Slope range", and a hint printed under
  it says "Not a 95% interval: the fit has fewer than 5 distinct dates. With
  one measurement on each of three or four dates, the Theil–Sen bounds are
  the full range of pairwise slopes and cover the true slope only about 67 %
  or 92 % of the time." D3 (a) should use the same term when it is applied.
- **Projected age with one decimal** ("G5 @ 54.3y" when the birth date is
  known, `src/workspace/labels/endpointLabels.ts`). The projection has no
  interval, so one decimal suggests more precision than it has. Option: whole
  years, as already shown without a birth date.
- **R export.** The exported script and workbook name no reference for lme4
  or R. Option: add the lme4 citation from D1 to the script header.
- **AKI staging order** (D3 d). Decided and changed on 2026-11-16: every
  stage is graded against the seven-day minimum. D3 (d) is superseded by
  D3 (d2), which is now needed because one page sentence states the old
  result.

### Points to check in Part D

- **Line numbers** refer to the topic files as of 2026-11-16 and move with any
  edit, including the edits of Part C.
- **D1.** Publish only the entries of the proposed list; the items under
  "Could not be verified" wait.
- **D2.** The list states rules; the sentence "they are not validated" is the
  maintainer's to confirm.
- **D3 (c) and (d2)** change how the AKI page describes its own limits. The
  staging order was decided on 2026-11-16: D3 (d) is superseded, and D3 (d2)
  corrects a page sentence that states the old result.
- **D3 (e) and (f)** are statistical statements that do not follow from the
  code.
- **Overlap with Part C.** D3 (a) and C8 give the same coverage figures; D3
  (i) and C6 (d) touch the same sentence in `Fits.tsx`; D3 (h) and the
  follow-up list of Part C both correct "1.73m²" in `Trajectories.tsx`.

## Part E: draft after the simulated-user case studies (applied 2026-11-16, PR #53)

One sentence of the methodology page was read wrongly in the simulated-user
case studies of 2026-11-16 (case A, own data). The owner approved
E1 on 2026-11-16 and it is applied (pull request #53).

### E1. What "converted automatically" covers

Target: `src/workspace/methods/topics/Data.tsx`, **Units** bullet, lines
44–46.

Current text:

> … Values recorded in *µmol/l* are converted automatically (÷ 88.42); other
> units are not used as an eGFR source.

Proposed addition after that sentence:

> The calculation reads one creatinine source: one test name with one unit.
> If that source is recorded in *µmol/l*, its values are converted. Creatinine
> values of the same patient under another test name or in another unit form a
> separate parameter and are not added to the source. The Data page lists
> such series under "Not used for this eGFR".

Rests on: the eGFR derivation in `src/core/domains/nephrology/egfr/series.ts`
(rows are selected by the source's name and unit; µmol/l values are divided by
88.42) and the notice in `src/workspace/DataWorkspace.tsx`.

Checked 2026-11-16 by reading the code: only rows whose name and unit equal
the source are computed, so a `Kreatinin [µmol/l]` row beside the source
`Kreatinin [mg/dl]` stays its own parameter and gets no computed eGFR.

Left out on purpose: how the default source is chosen (already described in
the eGFR section).

## Part F: Cohort models page, interface wording (applied 2026-11-17)

After the UI critique of 2026-11-17 (priority issue "Cohort models speaks R,
not nephrology") and findings UX-50 to UX-57 of the
[simulated-user case studies](ux-case-studies-2026-11-16.md). The texts are on
the Cohort models page (`src/workspace/CohortModelsWorkspace.tsx`,
`src/workspace/models/CohortModelTable.tsx`), not on the methodology page.
They state what a model estimates and how to read it, so they need the
owner's approval like the methodology wording. **The owner approved F1 to F8
as drafted on 2026-11-17 and they are applied**, with two notes: the plot chip
of F6 already read "Whole cohort, reference profile" for a model with a
factor-by-time term and is left as it is; the sentence of F4 also carries the
counts, so there is no separate "In the model" line. The executed formula of
a fitted model stays in its details and is not part of the technical record;
the item "Slope 95% CI" there is removed, because the interval now stands
beside the estimate. No model, estimate or export changes with any of it.

Two points a review raised were decided by the owner on 2026-11-17 and are
applied. With a factor on level and slope the sentence of F4 reads "Change of
eGFR per year for the reference group across …" ("reference profile" when
such a factor is numeric), because the time coefficient is then the slope at
the reference level and not an average. The introduction of F1 reads "Each
patient keeps an own starting level and, by default, an own rate", because a
custom model can use a random intercept only.

### F1. What the page is for (new, under the page heading)

Current: no introduction. The first statement is the description of the
selected model type.

Proposed:

> A cohort model estimates the average change per year of one parameter
> across patients. Each patient keeps an own starting level and an own rate;
> the model reports the average and how much patients differ. Use it to
> describe a cohort or to compare groups. For one patient's course, use
> Trajectories.

Rests on: the default model, value on time in years with a random intercept
and slope per patient (`selectPreset('unadjusted')`).

### F2. Model types: names and one-line descriptions

| Current name | Proposed name | Current description | Proposed description |
| --- | --- | --- | --- |
| Standard (Overall) | Whole cohort | Overall progression rate without covariates. | Average change per year across all patients, without further factors. |
| Subgroup comparison | Separate model per group | Stratified analysis: Fits independent mixed models for each subgroup of the selected attribute. | One model for each group of the chosen attribute. The groups' slopes are shown side by side. Their difference and its interval are not estimated; for that, use "Difference between groups". |
| Demographic adjustment | Adjusted for age and sex | Standard epidemiological model: Y ~ Time + Baseline age + Sex + (1 + Time \| Patient). | Adds baseline age and sex. Both shift the level only; they do not change the slope unless set to "Shifts level and slope". |
| Group interaction | Difference between groups | Slope interaction test: Y ~ Time * Group + (1 + Time \| Patient). Estimates slope differences with 95% confidence intervals; no p-values are computed. | One model with the group as a factor. Reports how much faster or slower each group changes than the reference group, with a 95% interval. No p-values are computed. |
| Custom model | Custom model | Full custom model: Select specific covariates, effects, reference categories, and random effects. | Choose the factors, their effect, the reference levels and the random effects yourself. |

Rests on: `selectPreset` (the factor sets of each type) and the separate fits
per group of the stratified type. "Subgroup comparison" fits independent
models and reports no difference (UX-51); the proposed name says so.

Open point for the owner: "Difference between groups" drops the word
"interaction". The R formula stays available in the details (F5).

### F3. Effect of a factor

| Current | Proposed |
| --- | --- |
| Level (Shift) | Shifts the level |
| Level & Slope (Interaction) | Shifts level and slope |

Rests on: a "level" factor adds a main effect; "level and slope" also adds its
interaction with time (methodology page, *Cohort Model Specification*).

### F4. Fit summary: a sentence before the formula

Current: "Model: eGFR ~ Time (years) + (1 + Time (years) | Patient)" and
"Complete cases: 25 patients / 28 (211 measurements)".

Proposed, built from the configuration:

> Average change of eGFR per year across 25 of 28 patients (211
> measurements). Each patient has an own starting level and rate.

With factors: "… , with cohort (shifts level and slope) and baseline age
(shifts the level)." With random intercept only: "Each patient has an own
starting level; the rate is common to all."

"Complete cases: 25 patients / 28" becomes "In the model: 25 of 28 patients".

### F5. Formula and technical record

The formula moves from the lead line of the fit summary into "Preparation and
fitting details", labelled "Model formula (R syntax)". In a model's details,
"Engine", "Dataset" and "Fit config" move under one collapsed heading:

> Technical record (for a methods section)

No text changes there otherwise.

### F6. Results table

| Current | Proposed |
| --- | --- |
| Column "Unit" | "Group" |
| Columns "Slope", "Intercept" | "Change per year", "Starting level", each followed by its 95% interval in the same cell |
| "Reference slope", "Reference intercept" (adjusted models) | "Change per year (reference)", "Starting level (reference)" |
| Button "Fit models (3 units)" | "Fit models (3)" |
| Plot chip "Whole cohort: -4.77 …" in a model with a group factor | "Reference (cohort A): -4.77 …" |

Rests on: the intervals exist in the result (`fixedEffectTerms`) and are shown
today only in the details; the chip shows the reference group's slope
(UX-56).

### F7. Reading an interval without a p-value (new, under the results)

Current: "no p-values are computed", and nothing more (UX-57).

Proposed:

> How to read the intervals: an estimate with a 95% interval that excludes 0
> is unlikely to be explained by chance alone under this model. The intervals
> are approximate and tend to be too narrow with few patients, and nothing is
> adjusted for comparing several groups or factors. Report the estimate with
> its interval; do not report it as a p-value. For tests, the exported R
> script names the lmerTest package.

Rests on: 95% Wald intervals without degrees of freedom (methodology page,
*Cohort Model Specification*); the lmerTest note in the exported script.

This is statistical guidance and the passage most in need of the owner's own
wording.

### F8. First fit

Current: the button reads "Fitting 1 of 3 …" for the whole time, including the
download of R.

Proposed status text under the button while the first fit of a session runs:

> The first fit of a session loads R into the browser; this can take a few
> minutes. Later fits take seconds.

A Cancel button and a separate download status are implementation questions
and not part of this wording draft.

## Part G: draft after the persona review of 2026-11-21 (applied 2026-11-22)

Follows the [decision of 2026-11-21](remaining-method-decisions.md#decisions-of-2026-11-21-persona-review-issue-34)
on several creatinine values on one day. The owner resolved OD-34 on
2026-11-22 ([method algorithms](method-algorithms.md#resolved-decisions)); the
draft below is applied as written, in two paragraphs.

### G1. Several creatinine values on one day (OD-34)

Topic *AKI detection*, block "AKI Timing, Episodes and the Fit-Exclusion
Window" (`src/workspace/methods/topics/Aki.tsx`), first paragraph.

Current:

> Lab dates are calendar days without a time of day. The 48-hour window
> therefore covers earlier measurements on the same date or one or two calendar
> days earlier, and the 7-day window those up to seven calendar days earlier,
> limits included. A rise from 1.0 to 1.3 mg/dl two days apart is detected;
> three days apart it is not.

Draft:

> Lab dates are calendar days. The 48-hour window covers earlier measurements
> one or two calendar days earlier, and the 7-day window those up to seven
> calendar days earlier, limits included. A rise from 1.0 to 1.3 mg/dl two
> days apart is detected; three days apart it is not.
>
> Several creatinine values on one day are ordered by their time of day when
> the file gives one for each of them; an earlier value of the day can then be
> the baseline of a later one. The windows still count calendar days. Without
> a time of day the order within the day is unknown: these values are compared
> with values of earlier days only, not with each other, so a rise within
> that day is not detected on that day. The Data page states how many
> patient-days this concerns.

Not in the draft, for the owner to add or leave out: midnight counts as no
time of day; values with the same time are not compared with each other; the
time of day is not shown or exported.

## Part H, for approval 2026-11-22

Drafted on 2026-11-22 after the owner decisions of that day
([decision artifact](remaining-method-decisions.md#decisions-of-2026-11-22-decision-artifact-issues-2-4-6585),
rows `sources` and `release`) and the standing practice that new method
wording goes to the maintainer as a draft. **Nothing of Part H is applied**:
`src/workspace/methods/` is unchanged. H1 removes a claim; H2 to H5 describe
features that are in the application and in the
[method reference](method-algorithms.md) but not, or only partly, on the
Methods page. Line numbers refer to the files as of commit `cbc3d18`.

### H1. Remove the external OLS comparison (issue #84)

Decision `sources`: the statement on the external comparison is removed until
issue #79 provides comparisons that readers can inspect. No such comparison
is in the repository or its documentation, so the page cannot point to one.
Two places make the claim.

**(a)** Topic *Limitations & sources*, block "Validation scope"
(`src/workspace/methods/topics/Sources.tsx`, lines 29–52, from the heading
to the end of the paragraph "In short: …").

Current:

> **How far each model is verified.** Two different checks apply, and they
> do not cover the same models:
>
> - **Stored regression cases** — automated tests compare the results with
>   stored cases that were originally generated by the Python `analyses`
>   package. Since October 2026 the application may deviate from that package
>   deliberately; each such change is documented and the affected case
>   updated. The cases cover OLS, rolling OLS, segmented OLS and Theil–Sen,
>   for Theil–Sen including the slope, separate-median intercept, slope
>   bounds and unavailable-fit cases.
> - **External comparison against an established clinical workflow** — a
>   manual cross-check by an outside group, which so far covers the **OLS**
>   results only. It found no discrepancy. The other models have not been
>   through this check.
>
> In short: OLS has both checks; rolling OLS, segmented OLS and Theil–Sen
> have the automated one only and are less verified than OLS. The observed
> G4/G5 and endpoint projection rules are this application's own research
> definitions: unit tests cover them, but neither check above applies. None
> of this replaces acceptance with representative research data.

Draft:

> **How far each model is verified.** Automated tests compare the results
> with stored regression cases that were originally generated by the Python
> `analyses` package. Since October 2026 the application may deviate from
> that package deliberately; each such change is documented and the affected
> case updated. The cases cover OLS, rolling OLS, segmented OLS and
> Theil–Sen, for Theil–Sen including the slope, separate-median intercept,
> slope bounds and unavailable-fit cases.
>
> No comparison with an independent reference implementation is published
> yet. Reference cases computed with established R packages are planned and
> will be listed here once they can be inspected. The observed G4/G5 and
> endpoint projection rules are this application's own research
> definitions: unit tests cover them, but the regression cases above do not.
> None of this replaces acceptance with representative research data.

The list becomes a paragraph because one check is left. The link
"observed G4/G5 and endpoint projection rules" (`#methods/endpoints`) stays
on the same words.

**(b)** Topic *Fits & slopes*, the paragraph after the model table
(`src/workspace/methods/topics/Fits.tsx`, line 18), second sentence.

Current:

> OLS has automated and external comparison checks; the other estimators
> have automated checks only.

Draft:

> All estimators are checked against stored regression cases; none has yet
> been compared with an independent reference implementation.

The link "validation scope and limitations" that follows stays.

Not in the draft, for the maintainer: whether the page should name issue
#79; once its reference fixtures exist, a new draft will describe what they
cover.

### H2. Logarithmic value axis and doubling time (issue #70)

Method reference: [logarithmic value axis and doubling time](method-algorithms/log-scale-and-doubling-time.md).
The page does not mention the option.

**(a)** Topic *Trajectories* (`src/workspace/methods/topics/Trajectories.tsx`),
a new section after "Cohort Screening": insert on line 75 between
`</section>` and the closing paragraph "For analysis settings, see …", as
`<section className="methodology-section"><h3 id="methods-log" tabIndex={-1}>Logarithmic Value Axis and Doubling Time</h3>`,
with the navigation entry `{ id: 'log', label: 'Log axis' }` appended to the
`sections` of `trajectories` in `src/workspace/methods/method-navigation.ts`.

Draft:

> The toggle **log** beside a parameter's trend controls draws that
> parameter's table, overlay and patient charts on a base-10 logarithmic
> value axis. It is off by default and changes the display only: the slope,
> its interval, the reliability note, the rapid-decline flag, the endpoints
> and the cohort models stay those of the values on their own scale. Values
> of zero or less have no position on a logarithmic axis; they are not
> drawn, and a note under the chart counts them. The cohort mixed-model line
> is not drawn on a logarithmic axis.
>
> With Trend on, the parameter's fit is repeated on the natural logarithm of
> the values, with the same estimator, exclusions and time balancing; values
> of zero or less are left out of it. Under monthly or quarterly medians the
> medians are taken of the logarithms. The slope *k* of this fit, per year,
> gives the **doubling time** ln 2 / *k* in years; a negative *k* gives a
> **halving time** of ln 2 / |*k*|. Its interval is ln 2 divided by the
> bounds of *k* when both bounds lie on the same side of zero; when the
> interval of *k* includes zero, the time has no bound. The reliability rule
> of the slope applies to this fit as well. Example: values of 2.0, 2.6,
> 3.9, 5.1 and 7.8 ng/ml at six-month intervals give a slope of 0.681 per
> year on the logarithms and a doubling time of 1.02 years (95% CI 0.888 to
> 1.19 years).
>
> A doubling time assumes that the values change by a constant factor per
> year over the fitted period. It describes that period and is not a
> projection.

**(b)** Topic *Export & reproducibility* (`src/workspace/methods/topics/Export.tsx`),
table "Workbook contents", a new last row after `peri_event_creatinine`
(line 17).

Draft:

> | log_trend | For every exported parameter on a logarithmic axis, one row per patient: the fit on the natural logarithm of the values, its slope per year with interval, the number of values of zero or less left out, and the doubling or halving time in years with its interval (negative for a halving time). Present only when at least one exported parameter uses the logarithmic axis. |

### H3. Creatinine after selected events (issue #69)

Method reference: [peri-event creatinine](method-algorithms/aki.md#peri-event-creatinine-2026-11-22).
The page mentions the analysis only as the sheet `peri_event_creatinine` in
the export table.

**(a)** Topic *AKI & exclusions* (`src/workspace/methods/topics/Aki.tsx`), a
new section after the section "AKI Detection (KDIGO Criteria)" and before the
calculation details: insert on line 103, between `</section>` and
`<details className="methodology-calculations">`, as
`<section className="methodology-section"><h3 id="methods-peri-event" tabIndex={-1}>Creatinine After Selected Events</h3>`,
with the navigation entry `{ id: 'peri-event', label: 'Creatinine after events' }`
inserted after `detection` in the `sections` of `aki` in
`src/workspace/methods/method-navigation.ts`.

Draft:

> Under *Creatinine after selected events* on the Data page, every event of
> a chosen title or type, for example a contrast administration or a cardiac
> catheterisation, is checked for a rise in serum creatinine. The baseline
> is the last value on or before the event day, however long before the
> event it lies; the list shows how many days that is. The highest value in
> the 48-hour (default) or 72-hour window after the event is compared with
> it. The KDIGO creatinine criterion is met by a rise of at least 0.3 mg/dl
> or to at least 1.5 times the baseline, both limits included.
>
> Event dates have no time of day, so the window counts calendar days: 48
> hours are the two calendar days after the event day, 72 hours the three
> after it. A value on the event day is always a baseline, also where lab
> values carry a time of day, so a rise later on the event day is not seen.
> With several values on the baseline day, the latest is used when each of
> them has a time of day, otherwise the lowest.
>
> The series is the patient's serum creatinine series with the most usable
> values; µmol/l is divided by 88.42. Values on days under dialysis are
> neither baseline nor peak, and an event on such a day is not evaluable. A
> dialysis that starts in the window is named but does not meet the
> criterion. Each event is evaluated on its own, also when the windows of two
> events overlap; the overlap is counted. An event is also not evaluable
> without creatinine, without a value on or before the event day, or without
> a value in the window.
>
> The list is separate from AKI detection: it changes no AKI episode,
> exclusion window, fit or endpoint. It is automated screening for research
> use, not a diagnosis of contrast-associated AKI. The ACR/NKF consensus of
> 2020 defines contrast-associated AKI as KDIGO AKI within 48 hours after
> contrast; the ESUR uses 48 to 72 hours.

**(b)** Topic *Limitations & sources* (`Sources.tsx`), list "Rules of this
tool that are not published standards", a new item after "AKI episodes"
(after line 90).

Draft:

> **Creatinine after selected events.** The KDIGO creatinine criterion is
> published. The baseline (the last value on or before the event day, at any
> distance), the windows in calendar days and the choice of the series are
> this tool's rules.

**(c)** Same file, list "Medical Sources", a new item after the AKI entry
(after line 168), with two entries for the `SOURCES` object at the top of
the file.

Draft:

> Contrast-associated AKI within 48 hours: Davenport MS et al., Use of
> intravenous iodinated contrast media in patients with kidney disease:
> consensus statements from the American College of Radiology and the
> National Kidney Foundation, Radiology 2020;294(3):660–668
> (`https://doi.org/10.1148/radiol.2019192094`). 48 to 72 hours: van der
> Molen AJ et al., Post-contrast acute kidney injury – Part 1, European
> Radiology 2018;28:2845–2855 (`https://doi.org/10.1007/s00330-017-5246-5`).

Both DOIs were checked in Crossref on 2026-11-22 (title, journal, volume and
pages). That these two papers are the sources the decision of 2026-11-21
names as "ACR/NKF consensus of 2020" and "ESUR" is an inference from the
names; the maintainer confirms it.

### H4. The two levels of the rapid-decline flag and their source (issue #72)

Method reference: [rapid eGFR decline flag](method-algorithms/slope-quality.md#rapid-egfr-decline-flag).
The page already describes both levels (Trajectories, "Cohort Screening").
It does not say that a slope without a 95 % interval is "possible" (OD-37,
confirmed 2026-11-22), that KDIGO 2024 gives no numeric threshold, or which
KDIGO 2012 recommendation the number comes from; the list of the tool's own
rules still describes one level.

**(a)** Topic *Trajectories* (`Trajectories.tsx`), section "Cohort
Screening", last paragraph (lines 56–73), the sentences from "The default
threshold" (line 63) to "is marked only as possible." (line 69).

Current:

> The default threshold of **5 mL/min/1.73 m² per year** comes from the
> KDIGO 2012 CKD guideline, which defines rapid progression as a sustained
> decline in eGFR of more than 5 mL/min/1.73 m² per year. The flag itself
> does not test whether a decline is sustained. Since 2026-11-17 it is not
> set on a slope that carries the reliability note (fewer than three fitted
> measurement dates or less than one year of fitted follow-up); a slope
> whose interval reaches the threshold or above is marked only as possible.

Draft:

> The default threshold of **5 mL/min/1.73 m² per year** comes from the
> KDIGO 2012 CKD guideline (Recommendation 2.1.3), which defines rapid
> progression as a sustained decline in eGFR of more than
> 5 mL/min/1.73 m² per year. The KDIGO 2024 guideline gives no numeric
> threshold for rapid progression; it speaks of a change of more than 20% on
> a subsequent test (Practice Point 2.1.3). The threshold is therefore a
> configurable convention, and the two levels are a rule of this tool. The
> flag itself does not test whether a decline is sustained. Since 2026-11-17
> it is not set on a slope that carries the reliability note (fewer than
> three fitted measurement dates or less than one year of fitted
> follow-up). A slope whose interval reaches minus the threshold or above,
> or that has no 95% interval (Theil–Sen on fewer than five fitted dates), is
> marked only as possible.

**(b)** Topic *Limitations & sources* (`Sources.tsx`), list "Rules of this
tool that are not published standards", item "Rapid decline flag"
(lines 112–116).

Current:

> **Rapid decline flag.** The number, 5 mL/min/1.73 m² per year, is from
> KDIGO 2012. Applying it to a fitted slope, without testing that the
> decline is sustained, is this tool's rule.

Draft:

> **Rapid decline flag.** The number, 5 mL/min/1.73 m² per year, is from
> KDIGO 2012 (Recommendation 2.1.3); KDIGO 2024 gives no numeric threshold.
> Applying it to a fitted slope without testing that the decline is
> sustained is this tool's rule, and so are the two levels: "rapid ↓" when
> the whole 95% interval of the slope lies below minus the threshold,
> "rapid ↓?" when only the slope does or the slope has no 95% interval.

**(c)** Same file, list "Medical Sources", item "Rapid CKD progression
threshold" (lines 169–174): name the guideline itself before the KDOQI
commentary, with a new `SOURCES` entry
`kdigoCkd2012Progression: 'https://doi.org/10.1038/kisup.2012.65'`.

Draft:

> Rapid CKD progression threshold: KDIGO 2012 CKD guideline, Chapter 2:
> Definition, identification, and prediction of CKD progression, Kidney
> International Supplements 2013;3:63–72, and the KDOQI US Commentary on the
> 2012 KDIGO CKD guideline.

The DOI 10.1038/kisup.2012.65 (Chapter 2, pages 63–72) was checked in
Crossref on 2026-11-22. The sentence on KDIGO 2024 follows the owner's issue
comment of 2026-11-22 and the instruction for this draft (KDIGO 2024,
Practice Point 2.1.3, page S196); check its wording against S196 before it
goes on the page.

### H5. Creatinine source per patient (issue #65)

Method reference: [source selection](method-algorithms/egfr.md#source-selection).
The page states the µmol/l fallback but not when it does not apply (OD-36,
confirmed 2026-11-22), nor that the export names the series per patient.

**(a)** Topic *Data & eGFR* (`src/workspace/methods/topics/Data.tsx`),
section "eGFR", bullet **Units** (lines 56–72), the sentences from "It is the
selected creatinine source" to "its values are converted." (lines 60–63).

Current:

> It is the selected creatinine source; a patient without any serum
> creatinine in *mg/dl* uses their own *µmol/l* series instead when the
> selected source is in mg/dl. If that series is recorded in *µmol/l*, its
> values are converted.

Draft:

> It is the selected creatinine source wherever the patient has values in
> it. When the selected source is in *mg/dl* and a patient has no serum
> creatinine in mg/dl at all, the patient's own *µmol/l* series is used
> instead and converted: the one under the same test name, or the only
> µmol/l series the patient has. A patient with mg/dl creatinine under
> another test name only, or with several µmol/l series and none under the
> selected name, gets no eGFR; so does a patient without the selected
> source when that source is itself in µmol/l. The Data page counts these
> patients, and their eGFR cell names the reason. The export names the
> series of each patient (`egfr_source_parameter` and `egfr_source_unit` in
> the demographics sheet).

The sentences that follow ("Other creatinine values of the same patient form
a separate parameter …") stay.

**(b)** Topic *Export & reproducibility* (`Export.tsx`), table "Workbook
contents", row `events / patient_attributes / demographics` (line 10).

Current:

> Event context, attributes, resolved demographics, overrides and warnings.

Draft:

> Event context, attributes, resolved demographics, overrides and warnings,
> and the creatinine series each patient's computed eGFR was derived from.

### Points to check in Part H

- H1 removes the only statement on an external check. If the outside
  comparison can be documented before #79 (who compared, on which data, with
  which result), the maintainer may prefer to keep a sentence that points to
  that record.
- H2 and H3 add two navigation entries; the section ids `log` and
  `peri-event` are proposals.
- H3 (c) and H4 (c) add references to the "Medical Sources" list while the
  full reference list D1 (a) is still open; they can wait for it.
- No numeric rule changes with Part H, and no Open decision marker is added
  or removed.

## Part I, for approval 2026-11-22: eGFR for children and adolescents (issue #66)

Applied on 2026-11-22 were only the minimal corrections of sentences that the
change made false: in *Data*, "All computed equations are adult-only in this
app …" now reads "The four equations above are used from 18 years at the time
of measurement. Under 18 the setting “Under 18 years” on the Data page
decides; by default CKiD U25 is used where a height is available and EKFC 2021
otherwise. No eGFR is computed below 2 years or when the age is missing.";
the EKFC Q values are "age-specific up to 25 years"; the conditions name
"an equation applies at that age (from 18 for the adult equations; from 2
under the setting “Under 18 years”)"; in *Sources*, "no eGFR is computed below
2 years". The paragraphs below are new and wait for the maintainer.

### Children and adolescents (new, after the list of equations in *Data*)

> **CKiD U25** — creatinine equation for ages 1 to 25 published by Pierce et
> al. (Kidney International 2021). It multiplies height in metres by a
> constant that depends on sex and age and divides by creatinine. **Bedside
> Schwartz** (Schwartz et al., JASN 2009, 0.413 × height in cm ÷ creatinine)
> is offered only to compare with older studies. KDIGO 2024 names CKiD U25
> and EKFC as validated equations for children; both avoid a change of
> equation at 18 years.
>
> Under 18 years the setting “Under 18 years” decides: by default CKiD U25 is
> used where a height is available and EKFC 2021 otherwise; with “Bedside
> Schwartz” a value without a height is left out; with “None” no eGFR is
> computed under 18. The formula “CKiD U25 / EKFC (full age range)” applies
> CKiD U25 with a height up to 25 years and EKFC otherwise, and therefore
> also changes values of adults. No eGFR is computed below 2 years.

### Height (new, under *Inputs and assumptions*)

> **Height** — read from a lab parameter named Größe, Körpergröße or height
> in cm, or with LOINC 8302-2. A creatinine value uses the height of the same
> day, or a height interpolated between the measurements before and after it
> when both are at most 90 days away. Heights are never extrapolated. These
> limits are a rule of this tool; no source sets them.

### Change of equation (new, under *Inputs and assumptions*)

> **Change of equation** — one computed series can change its equation, for
> example from CKiD U25 to CKD-EPI 2021 at 18 years or where heights are
> missing. Equations do not agree at such a change: Pottel et al. (Kidney
> International 2019) report a mean jump of 23 mL/min/1.73 m² from CKiD to
> CKD-EPI at 18 years. The Data page counts the patients concerned, the
> patient chart marks the date, and a slope fitted across a change carries a
> notice. The slope itself is not corrected.

Points to check: whether "rule of this tool" should name OD-68 (both
neighbours within 90 days); whether the methodology page should say that age
is counted in whole years also for CKiD U25 (OD-65).
