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

**Part C was drafted on 2026-11-14 and is not applied.** It covers the
changes of the clinical-review pull requests (#37, #39, #41) and a proposal
on which trend method suits which case. It awaits the owner's approval.

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
- **B2 and OD-11.** The t value is exact up to 42 points. From 43 to 122
  points a stepped table makes the interval up to 0.62 % wider than exact, and
  from 123 points the normal value 1.96 makes it up to 1.00 % narrower. The
  draft says only "Student's t"; OD-11 is scheduled after 0.3.0.
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
  - B4: the absolute criterion is tested first and fixes the 48-hour baseline,
    so a stage can be lower than against the 7-day minimum; the window length
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

## Part C: drafts after the clinical-review changes (revised 2026-11-16, not applied)

Drafted 2026-11-14 for [issue #44](https://github.com/halbritter-lab/lab-trajectory-explorer-web/issues/44),
after the pull requests #37, #39 and #41 were merged, and revised on
2026-11-16 after #47. **Nothing in Part C is on the methodology page yet.**
Until it is approved and applied, the page contradicts the application in the
places listed under C6 to C10.

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
