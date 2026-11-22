# Method reference: Cohort models and their projections

Part of the [implemented method algorithms](../method-algorithms.md), which
hold the reading conventions and the list of open decisions. Research use
only.

## Cohort mixed models

The Cohort models page fits one linear mixed-effects model per fitted unit: the
whole cohort and, when a grouping attribute is chosen, each group. The fit runs
in the browser through webR. This section records what the code does today,
including behaviour that is open to an owner decision. Open points are marked.
The models are exploratory research estimates, not clinical predictions.

### Model specification

The model is a linear mixed model with a Gaussian response and identity link.
The outcome is the selected series' numeric value in its imported unit; it is
not transformed. Time enters linearly only: there is no quadratic, spline or
piecewise term. Each patient is one grouping level (`patient_id`).

`mixedModelFormula` (`src/core/mixedModel/config.ts`) builds the formula. The
fixed part is `time_since_baseline`, followed by one column per configured
factor in the configured order. A factor with the effect *level* adds its
column. A factor with the effect *level and slope* adds its column and its
interaction with time. The built-in baseline age uses the column
`baseline_age_centered`; every other factor uses the positional column
`factor_<i>_`, where `i` is the zero-based position in the factor list, so
attribute names supplied by the user never enter R code.

```r
# no factors, random intercept and slope (default)
value ~ time_since_baseline + (1 + time_since_baseline | patient_id)

# no factors, random intercept only
value ~ time_since_baseline + (1 | patient_id)

# baseline age (level) and sex (level), random intercept and slope
value ~ time_since_baseline + baseline_age_centered + factor_1_ +
  (1 + time_since_baseline | patient_id)

# one factor with level and slope, random intercept and slope
value ~ time_since_baseline + factor_0_ + time_since_baseline:factor_0_ +
  (1 + time_since_baseline | patient_id)
```

The fit summary states the model in a sentence (since 2026-11-17): "Average
change of <series> per year across n of all patients (m measurements)", the
factors with "shifts the level" or "shifts level and slope", and "Each patient
has an own starting level and rate." or, with a random intercept only, "Each
patient has an own starting level; the rate is common to all." The counts are
those of the whole-cohort model. The sentence is not shown without a parameter
or with the data preparation "No fit". With a factor on level and slope the
time coefficient is the slope at the reference level, not an average over the
groups; the sentence then begins "Change of <series> per year for the
reference group" ("reference profile" when such a factor is numeric). "Preparation and fitting details", below the Fit button and collapsed
by default, shows a readable form of the formula ("Model formula (R syntax)"):
the series name without unit as outcome, `Time (years)`, `Patient`, and the
quoted factor names instead of the column names. The unit's Details panel and the export show the
executable formula with `value` replaced by the series name and unit, for
example `eGFR (ml/min/1.73m2) ~ time_since_baseline + …`.

- **Random effects.** The default is a random intercept and a random slope per
  patient, and every interface preset sets it. A random intercept alone is a
  manual choice. With intercept and slope the 2 × 2 random-effect covariance is
  unstructured: both variances and their correlation are estimated.
- **Residuals.** One residual variance; no residual correlation structure and no
  variance function.
- **Estimation.** Restricted maximum likelihood (REML).
- **Optimizer and control.** Package defaults. No `lmerControl` or `lmeControl`
  is passed.
- **Missing values.** `na.action = na.fail`. Rows reaching R are complete by
  construction (see *Factors and covariates*); a missing value is an error, not
  a silent row drop.
- **Model time.** Only `time_since_baseline` is supported. A configuration with
  age as the model time is rejected ("Age as the mixed-model time axis is not
  supported yet.").
- **Engine.** The interface always fits with lme4:

```r
lme4::lmer(<formula>, data = mm_data, REML = TRUE, na.action = na.fail)
```

A second engine is implemented in the worker but is reachable only from tests
and the verification scripts:

```r
nlme::lme(<fixed part>, random = ~ time_since_baseline | patient_id,
          data = mm_data, method = "REML", na.action = na.fail)
# random intercept only: random = ~ 1 | patient_id
```

**Interface presets.** Since 2026-11-17 the interface names them *Whole
cohort* (formerly "Standard (Overall)"), *Separate model per group* (formerly
"Subgroup comparison"), *Adjusted for age and sex* (formerly "Demographic
adjustment"), *Difference between groups* (formerly "Group interaction") and
*Custom model*; the configurations are unchanged. The factor effects read
"Shifts the level" (`level`) and "Shifts level and slope" (`level_slope`).
*Whole cohort* has no factors. *Separate model per group* has no
factors and fits per group (see *Stratified (grouped) fits*); it keeps the
current grouping attribute or else selects the first groupable attribute in
numeric-aware, case-insensitive order, which can be `birthDate` or `sex`.
*Adjusted for age and sex* adds baseline age (level) and sex (level).
*Difference between groups* adds, with level and slope, the first groupable attribute other
than `sex` in that order; when `sex` is the only one it uses `sex`. A
categorical attribute becomes a categorical factor with its first sorted level
as reference. A numeric attribute becomes a numeric factor without a reference
level (`groupInteractionFactor`; decided 2026-10-07, formerly OD-23: before,
the preset stored a reference level with the numeric factor, which
`validateMixedModelConfig` rejects, so nothing could be fitted). When the
dataset has no attribute and no resolved sex the preset stores a factor
`genotype` without a reference level, which is an invalid configuration: the
readable formula in the details is empty, every unit with model rows shows "Invalid or duplicate
mixed-model factor; categorical factors require a reference level." and
nothing is fitted. *Custom model* leaves the choice to the user.

The *Difference between groups* description reads "Reports how much faster or slower
each group changes than the reference group, with a 95% interval. No p-values
are computed." (wording of 2026-11-17; decided 2026-10-07, formerly OD-6;
before, it promised p-values). Under the results table the page states how to
read the intervals: not as a p-value, approximate, too narrow with few
patients, not adjusted for several comparisons. No p-value is computed,
displayed or exported for any model, only Wald confidence intervals.

### Which measurements enter

`prepareMixedModelCohortRows` (`src/core/mixedModel/cohortDataset.ts`) builds
the model rows per patient in these stages, in this order.

1. **Row eligibility.** Rows of the selected series only: identical name and
   identical unit (a missing unit matches only a missing unit), a numeric value,
   a date, and an exact value. Rows whose operator is not `=` never enter. Rows are
   ordered by date. Different names or units are never pooled.
2. **Disabled fit.** A series whose configuration has `fitModel: none` supplies
   no model rows. The page then states that no cohort model is prepared for
   this parameter.
3. **Preset exclusion windows.** The cohort-model exclusion checkbox starts on.
   When on, the series configuration's clinical-event censoring windows and AKI
   windows remove eligible rows. A row is inside a window when
   `start <= date <= end`, both bounds included; a censoring window without an
   end is open-ended. When off, those windows are skipped for cohort
   mixed-model rows only.
4. **Time balancing.** The series configuration's time balancing is applied to
   the rows that remain. `raw` keeps every row. `monthly-median` and
   `quarterly-median` reduce each UTC calendar month or quarter (January–March,
   April–June, …) to one point. Its value is the median, the mean of the two
   middle values for an even count. Its date is the date of the observation at
   zero-based position `floor((n - 1) / 2)` in date order, the earlier of the
   two middle observations for an even count. The point's age is taken from a
   source row at the same timestamp, preferring one with the same value.
5. **Chronic run-in.** See *Implemented but not reachable from the interface*.
6. **Patients without a retained point** are left out of the model and of its
   patient count. They are not listed among excluded patients.

**Count.** The per-unit count `excludedByPreset` is the number of eligible exact
dated rows inside the union of the active event and AKI windows; overlapping
windows count a row once. It is computed for the whole cohort and for each group
separately. Time balancing, chronic run-in and missing-factor removal are later
stages and do not increase this count. The policy and count are stored with each
fitted unit, displayed in the model workspace, and exported in the `models`
worksheet. Changing the policy invalidates fitted results and their projections.

**What the interface supplies** (decided 2026-10-07, formerly OD-1). The
series configuration of a cohort model is the stored preparation configuration
shared with Trajectories for the same parameter: the parameter's own settings when
it has some, otherwise the shared settings (`workspaceModelSpec`,
`trajectoryFitConfig`). These settings live in the shared application state;
Trajectories reads and writes them there, and the *Data preparation* select on
the Cohort models page writes the same settings (see below). The model
therefore receives the measurements selected by the configured preparation
(independently of the per-parameter trajectory activation switch): the same event
censoring, AKI windows and time balancing, and none for fit model "No fit".
The fit model otherwise has no effect on the mixed model; with Theil-Sen,
rolling or segmented OLS the rows are the same as with OLS. Before, the page
always used general exploration, so no window and no time balancing could
apply and the count was always 0.

- Until a preset is chosen, and for a dataset just loaded, the configuration
  is general exploration: no event censoring, no AKI exclusion, raw time
  balancing. When the Trajectories page is unmounted, which happens when
  another dataset is loaded, the settings return to these defaults.
- **Data preparation on the Cohort models page.** The select
  offers the same presets as *Analysis preset* under Trajectories and has the
  same effect: choosing a preset replaces the settings with that preset's
  defaults, endpoint and rapid-decline settings included. Specialist presets
  always create or replace the model parameter's own settings. General presets
  write to its own settings when present, otherwise to shared settings. A note
  states the current scope and that specialist choices are parameter-specific;
  a shared general change applies to every column without own settings.
  "Custom configuration" is listed only while edited settings are in use and
  cannot be chosen otherwise. Choosing a preset also fixes the model parameter
  to the one shown, because the preselection depends on these settings and
  could otherwise move to another parameter. Example: the shared settings are
  general exploration with fit model "No fit", so the Fit button is disabled;
  choosing CKD progression creates an independent quarterly-median preparation
  for the selected parameter and enables its Fit button, while shared settings
  and unrelated parameter settings remain unchanged.
- Below the checkbox the page states the configuration in use and whether it
  is the shared one or the parameter's own, for example "CKD progression
  (own settings): quarterly medians; event windows after kidney transplant,
  after chronic dialysis start, acute dialysis intervals, dated dialysis of
  unknown intent; AKI windows 30 days." A preset that was edited is named
  "Edited settings". A parameter that is not among the Trajectories columns
  keeps own settings given to it earlier.
- With fit model "No fit" the page says that no cohort model is prepared, the
  Fit button is disabled and the count of excluded measurements is not shown.
  The page points to the *Data preparation* select and to Trajectories.
- The checkbox *Apply preset event and AKI exclusions* switches stage 3 only.
  Time balancing (stage 4) and the "No fit" rule (stage 2) apply in either
  position.
- A change, under Trajectories or through *Data preparation*, to the fit model, the time balancing, the
  censoring options or the AKI exclusion of a parameter discards the fitted
  models and projections when a model of that parameter is stored, like every
  other change to the model data; a running fit is stopped by any such change.
  On the Cohort models page *Data preparation* asks before such a change
  (since 2026-11-17); the other controls and the Trajectories page do not.
  *Cancel* (since 2026-11-17) stops a running fit: none of that run's models
  is stored, including groups already fitted in it, and models stored before
  stay. A stopped fit ends the fit worker, so R is loaded again with the next
  fit.
  Changes to endpoint settings, to the rapid-decline threshold or to the
  settings of another parameter do not. The identity of a fitted result
  depends on the same four settings and on nothing else of the fit
  configuration; the display axis of a preset is not part of it.
- The reference line drawn in the Trajectories overlay is looked up with the
  same configuration.

For a patient with exact values on 2020-01-01, 2020-07-01 and 2021-01-01 and a
kidney transplant on 2020-07-01, general exploration keeps all three rows and
reports a count of 0. With the CKD progression preset selected under
Trajectories one row is kept and the count is 2; with the checkbox off all
three rows are kept, the count is 0, and quarterly medians still apply.

**Model time.** For each patient, `time_since_baseline` is measured in
fractional years from that patient's first retained model measurement after
exclusion windows, time balancing, and any chronic run-in removal:

`time_since_baseline = (date - first retained date) in ms / (365.25 × 86 400 000)`

The result is rounded to 10 decimals. The first retained row of every patient
has time 0. A bound does not supply a time origin. It is not time since a shared
calendar date or disease onset, and patients need not enter on the same date.
Example: exact values on 2020-01-01, 2020-07-01 and 2021-01-01 have model times
0, 0.4982888433 and 1.0020533881; a `<` value on 2020-01-01 changes nothing.

**Baseline age** is the age at measurement (`patientAgeAtLab`) of the patient's
first retained model row. It is missing when that row has no finite age.

**Follow-up process.** The model uses observed eligible visits and does not fit
a visit or dropout process. A trend can be biased when the chance of a later
visit or dropout depends on an unobserved outcome; review follow-up patterns
and use a study-specific sensitivity analysis.

### Minimum data and validity gates

`validateMixedModelRows` (`src/core/mixedModel/validation.ts`) decides whether a
unit can be fitted. It runs in the interface, where a failing unit is disabled
and shows the message, and again in the worker before R is started. The checks
run in this order; the first failure is reported.

1. At least one row; every row has a non-empty patient id and a finite value
   and time.
2. The configuration is valid: each factor key appears once, a categorical
   factor names a reference level, a numeric factor names none, and baseline
   age is numeric.
3. The factor validity gate, for each configured factor:
   - every model row carries a valid value (a finite number, or non-blank text);
   - the value is constant within each patient;
   - at least two distinct values occur across the model rows;
   - for a categorical factor, the reference level occurs in the model rows;
   - for a factor with level and slope (since 2026-11-05), the time interaction
     must not make the fixed-effect design rank-deficient. For a categorical
     factor every level, the reference included, needs at least two distinct
     `time_since_baseline` values among its rows: with treatment contrasts each
     level has its own intercept and slope column, so a level whose patients
     were all measured at one model time (every row at time 0) gives an
     all-zero interaction column (or, for the reference level, a time column
     equal to the sum of the interaction columns). For a numeric factor the
     rows with a non-zero time need at least two distinct values; otherwise
     `time_since_baseline:<column>` is a multiple of `time_since_baseline`.
     Unlike the other factor checks, this failure is reported only after
     items 4 and 5 pass, so a unit that is too small reports its size first.
     The failure (code `RANK_DEFICIENT_FACTOR`) names the factor, and for a
     categorical factor every such level with its number of patients, for
     example `Factor gene with level and slope: level "PKD2" (1 patient) has
     measurements at only one model time, so its slope cannot be estimated
     (rank-deficient design).` The same level as a level-only term passes.
     Collinearity that arises only from several factors together is not
     checked here and is left to the R rank check below.

   There is no minimum number of patients per level; a level held by a single
   patient passes unless the check above applies. A minimum per level is an
   owner decision tracked in issue #4. Levels are always taken from the model
   rows of the unit, so a level absent from a unit cannot enter its design;
   only an absent reference level fails.

   **Per-level counts.** `mixedModelFactorLevelCounts` reports, for each
   categorical factor, the number of patients and of qualifying patients (the
   rule in item 5) per level, levels in ascending string order. The Model
   Studio shows them for the whole cohort's complete cases below the reference
   categories, for example `Whole cohort, patients per level (with enough
   measurement times): genotype: A 7 (7), B 3 (3)`. Groups are not listed
   separately; a group's failing level is named in its validation message.
4. At least 10 patients have a model row.
5. At least 10 patients qualify. A patient qualifies with at least two rows and
   at least three distinct `time_since_baseline` values for a random intercept
   and slope, or at least two distinct values for a random intercept alone.
   Distinct means unequal after the 10-decimal rounding.

The minimum is a technical input guard, not a power calculation or guarantee of
adequacy.

**Patients who do not qualify stay in the fit.** The gate counts qualifying
patients; it does not remove the others. A patient with one measurement, or
with too few distinct times, contributes all of its rows to the model.
**Rows of one patient at the same model time are all kept**, for example two
values on one day. `validateMixedModelRows` returns a warning text for each of
these three situations (duplicate times are counted for qualifying patients
only). Since 2026-11-21 the warnings of a passing validation are attached to
the fitted result, before the warnings of R: they are shown in the model's
details, carried into an applied projection and exported in `models.warnings`
(and `projections.warnings`). Before, they were used only when the validation
failed. The texts are, with the counts of the unit:

- "1 patient has fewer than 2 repeated measurements and contributes limited
  within-patient information." (a patient with a single row);
- "1 patient has fewer than 3 distinct time_since_baseline values and
  contributes limited within-patient time information." (at least two rows,
  but fewer distinct times than the minimum of item 5: 3, or 2 for a random
  intercept alone);
- "1 duplicate patient/time row was retained for mixed model fitting." (each
  row after the first at the same model time of a qualifying patient).

Example: ten patients with three times each, one patient with two times, one
with a single row, and a second value at one time of a qualifying patient
give these three warnings, each with the count 1, and all 36 rows enter the
fit. The warnings change no estimate; whether such patients should stay in
the fit is a separate question that has not been decided.

**Interface and export word the warnings differently** (since 2026-11-22).
The texts above are stored with the fit and exported unchanged in
`models.warnings` and `projections.warnings`, so scripts that match them keep
working. The model's details on the Cohort models page show each of them in
plain words instead, followed by the patient IDs concerned in the order of
the model rows, up to five and then "and N more" (`mixedModelWarningDetails`,
the same rule as `validateMixedModelRows`):

| Exported text | Shown in the interface |
| --- | --- |
| "7 patients have fewer than 2 repeated measurements and contribute limited within-patient information." | "7 patients have a single measurement in this model. They count towards the starting level but say nothing about the change over time within the patient. Patients: s0, s1, s2, s3, s4 and 2 more." |
| "1 patient has fewer than 3 distinct time_since_baseline values and contributes limited within-patient time information." | "1 patient has measurements at fewer than 3 different times since the first measurement, so it says little about the change over time within the patient. Patient: 11." |
| "1 duplicate patient/time row was retained for mixed model fitting." | "1 measurement has the same time as another measurement of the same patient; it is kept in the model. Patient: 1." |

The duplicate warning counts rows, its patient list names each patient with
such a row once. Warnings from R and lme4 are shown as recorded.

Without a categorical factor, the fit summary names the count behind item 5
for the whole cohort: "Whole cohort, patients with enough measurement times:
26 of 27." (qualifying patients of the patients with a model row). With a
categorical factor the per-level line of item 3 takes its place.

**The gate applies per unit.** The whole cohort and each group are checked
separately with the same thresholds. *Fit* submits only the units that pass.

**Rank-deficient design.** Before fitting, R builds the fixed-effect model
matrix and compares its QR rank with its number of columns. The level check in
item 3 catches the single-factor cases first, so this message is left for
collinearity across factors. A lower rank stops
with "Fixed-effect design is rank deficient; no terms were dropped." For lme4, a
fit that dropped fixed-effect columns is also rejected. A fit whose intercept or
time slope is not finite, or that does not return a finite estimate for every
design column, is rejected. Each of these is reported as a failed fit; no term
is ever dropped silently.

### Factors and covariates

Factors are patient-level covariates: the built-in `baseline_age` and `sex`, and
every column of the imported attributes table that holds a value for a patient
in scope. `prepareMixedModelFactors` (`src/core/mixedModel/factors.ts`) prepares
them for each fitted unit.

**Type.** `baseline_age` is numeric and `sex` is categorical. Any other
attribute is numeric when it has at least one non-blank value and every
non-blank trimmed value among the patients in scope matches the numeric grammar
and converts to a finite number (`1e999` does not), and categorical otherwise. The grammar is an optional sign, digits with an
optional decimal point (or a leading point), and an optional exponent:
`^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$`. A decimal comma (`1,5`), a
thousands separator or inner whitespace does not match, so one such value makes
the whole attribute categorical. The interface applies this type when the
factor is added and offers no control to change it.

> **Open decision OD-22.** The factor type (numeric or categorical) is chosen automatically with no control to override it (a comment in `src/core/mixedModel/factors.ts` still says the dialog selects factor kinds); numerically coded categories such as 0/1/2 therefore enter as one linear term. Behaviour is unchanged pending an owner decision.

**Complete cases.** A patient is removed from a unit's model, with all of its
rows, when any configured factor has no usable value: a missing or blank value
(`Missing <factor>`) or, for a numeric factor, text that fails the grammar
(`Invalid numeric <factor>`). Nothing is imputed. The removal affects this model
only. Removed patients are listed with their reasons in the fit summary, in the
unit's status cell ("Excluded for factor values") and in the `excluded_patients`
worksheet. The list in the fit summary, "Patients not in the model", accounts
for every patient behind the count in the fit summary ("across n of all
patients"; until 2026-11-17 "Complete cases: n patients / all"): besides the
patients removed for a factor value it names each patient who has no usable
measurement of the outcome after data preparation, with that reason (since
2026-11-16; before, only the factor removals were listed, so 25 of 28 complete
cases could stand next to one listed patient). When no model rows exist
because the data preparation is No fit, or no parameter is selected, the list
is replaced by one line with that reason. The `excluded_patients`
worksheet is unchanged and holds the factor removals only.

**Centring.** Each numeric factor is centred at the arithmetic mean of its raw
values over the complete-case patients of that unit, one value per patient
regardless of the number of measurements. The centred value is rounded to 10
decimals. The centre is stored with the fit and exported in the `centering`
worksheet as `patient_weighted_mean`. Example: complete-case baseline ages 40,
50 and 60 give the centre 50 and centred values −10, 0 and 10; a fourth patient
aged 70 without a value for another configured factor does not enter the mean.

**Meaning of the intercept and slope.** The intercept is the fitted value at
model time 0 for a patient whose numeric factors equal their centres and whose
categorical factors are at their reference levels. The `time_since_baseline`
coefficient is the slope per year for that same profile. The results table
therefore heads these columns *Starting level (reference)* and *Change per
year (reference)* when factors are configured (until 2026-11-17 *Reference
intercept* and *Reference slope*; without factors *Starting level* and *Change
per year*). Each cell shows the estimate followed by its 95% Wald interval
when the fit recorded one: the interval of `time_since_baseline`, and the
interval of the `(Intercept)` term.

**Categorical coding.** Treatment contrasts with the configured reference level
first and the remaining observed levels in code-point order,
`sort(..., method = "radix")` (`contr.treatment(levels, base = 1)`). Radix
sorting ignores the R locale and gives the same order as the browser's
JavaScript default sort, so the order of the coefficients does not depend on
the machine: levels `b`, `Ä`, `B`, `a`, `A` with reference `A` give
`B`, `a`, `b`, `Ä`, where a German collation would give `a`, `Ä`, `B`, `b`
(decided 2026-11-13; before, plain `sort()` used the R session's locale). Each non-reference level has one
coefficient, the difference from the reference level, named
`<column><level>`. With level and slope, `time_since_baseline:<column><level>`
is the difference in slope per year from the reference level.

**Default reference level.** The first level in ascending string order
(JavaScript default sort: digits before upper-case before lower-case letters)
among all patients of the loaded dataset that have a lab row of any series. It
is not restricted to the selected series or to a group. The default, and any
level offered in the selector, can therefore be absent from a unit's model
rows; that unit then fails the factor validity gate ("Factor … requires
variation and an observed reference level.") until another reference is
chosen. The same reference applies to the pooled fit and to every group. The
page names the reference in use and marks it as the default. *Demographic
adjustment* uses the first sorted sex code of the dataset (`d` before `m`
before `w`), or `w` when no sex is available.

> **Open decision OD-29.** The default reference level of a categorical factor is taken from all patients of the dataset, not from the fitted series or group, so it can be a level that the fitted unit does not contain; that unit then cannot be fitted until another reference is chosen, and one reference is shared by the pooled fit and all groups. Behaviour is unchanged pending an owner decision.

**Category text.** Values are trimmed and otherwise compared exactly, including
case: `A1` and `a1` are different levels.

**Source of `sex`.** The factor value is the patient's resolved sex (see
"Demographics resolution": manual entry, else the recognised attributes-table
sex, else the most frequent row code; a tie yields none). A patient without a
resolved sex is removed as a complete-case exclusion (`Missing sex`).
`prepareMixedModelFactors` also contains rules for unresolved input (exactly
one recognised row code is used, several count as missing, the normalised
attribute `sex` is a fallback when rows carry none); the interface never
supplies such input.

**Coefficient units in the export.** Level terms carry the outcome unit, slope
terms the outcome unit per year. A numeric factor adds "per year of baseline
age" or `per unit of <factor>`.

### Convergence and singularity

Singularity is reported separately from optimizer convergence.

**Converged, lme4.** The optimizer's convergence code (`optinfo$conv$opt`) is
absent or 0, and lme4 recorded no convergence message other than messages
containing "singular" (case-insensitive). A boundary fit alone therefore does
not count as non-convergence.

**Converged, nlme.** No warning raised during the fit contains "converg"
(case-insensitive). A hard failure is an R error and is reported as a failed
fit.

**Singular, lme4.** `isSingular` with relative tolerance `1e-4`.

**Singular, nlme.** For a random intercept, the random-intercept standard
deviation divided by the residual standard deviation is below `1e-4`. For an
intercept and slope, the square root of the ratio of the smaller to the larger
eigenvalue of the 2 × 2 random-effect covariance is below `1e-4`. A fit is also
treated as singular when a standard deviation or the correlation needed for the
check is missing or not finite, the residual standard deviation is not positive
(intercept only), a random-effect standard deviation is not positive or the
correlation lies outside [−1, 1] (intercept and slope), or the larger eigenvalue
is not positive.

**Warnings.** R warnings raised during the fit and all lme4 messages are stored
with the result, shown in the unit's details and exported.

| Fit state | Coefficients, intervals, standard deviations | Export | Fitted model line | Projections |
| --- | --- | --- | --- | --- |
| Converged, not singular | Shown | `models`, `coefficients`, `projections` | Drawn | Available |
| Singular | Shown; status "singular fit; projection withheld" | `models` (`singular` true), `coefficients` | Withheld | Withheld |
| Not converged | Shown; status "did not converge" | `models` (`converged` false), `coefficients` | Withheld | Withheld |
| Failed (R error, timeout, runtime) | None; status `Fit failed: <message>` | `models` row with `status` and `message` | None | None |
| Fails the validity gate | None; the validation message | None (never fitted) | None | None |

Singular and non-converged coefficients remain inspectable and exportable; they
are estimates from a fit that should not be relied on without review.

### Confidence intervals

Intervals are reported for fixed effects only, at the packages' default level of
95 %.

- **lme4:** `confint(fit, method = "Wald")`, the estimate plus or minus the
  normal quantile times its standard error.
- **nlme:** `intervals(fit, which = "fixed")`, nlme's approximate intervals.

When the interval call fails or returns a non-finite bound, the interval is
unavailable: the coefficient table in a model's details shows "n/a", and the
results table shows the estimate without an interval. No interval is computed for the random-effect
standard deviations, their correlation or the residual standard deviation. No
p-value or other test statistic is computed, displayed or exported.

### Stratified (grouped) fits

Choosing a grouping attribute fits one independent model per group value in
addition to the pooled whole-cohort model, each with the same formula. Units
are fitted one after another and a failure in one does not stop the others.
There is no joint model and no test between groups; differences between group
slopes are not accompanied by an interval. A factor with level and slope in a
single pooled model is the implemented way to estimate a slope difference.

**Group value.** `groupPatients` (`src/core/grouping/grouping.ts`) uses the
trimmed attribute value. Comparison is exact and case-sensitive: `B` and `b`
are two groups. A patient with a missing or blank value belongs to the group
`(ungrouped)`, which is fitted like any other group. Named groups are ordered by
a numeric-aware, case-insensitive comparison (`9` before `10`) and `(ungrouped)`
comes last. Values that differ only in case keep the order in which they first
occur in the patient list. Example: values ` B `, `b`, `B`, `10`, `9` and a blank give the
groups `9`, `10`, `B` (two patients), `b`, `(ungrouped)`.

**Per-group preparation.** Row selection, the exclusion count, complete-case
removal, centring and all gates run separately for each group. Numeric factors
are therefore centred at each group's own mean, and the reference intercepts of
two groups refer to different covariate values unless their centres coincide.

**Omitted groups.** A group with no model rows and no rows removed by preset
windows is not listed. A group that has rows but fails a gate is listed with its
message and is not fitted.

**Group sizes before fitting (since 2026-10-12).** With a grouping, the studio
lists for every group the patients that count towards the ten-patient minimum:
at least two rows and at least three distinct times (two with a random
intercept only), the same rule as the validation
(`qualifyingMixedModelPatients`, `src/core/mixedModel/validation.ts`). Example:
"Patients with enough measurement times per group: A: 12, B: 10, C: 3. Each
group needs at least 10." When every group fails for lack of such patients
(`INSUFFICIENT_PATIENTS` or `INSUFFICIENT_REPEATED_MEASURES`) while the pooled
cohort passes, the per-group messages are replaced by one sentence naming the
largest group, and the action reads "Fit whole cohort only"; only the pooled
model is submitted. If any group fails for another reason, such as a factor
without variation, the per-group messages are kept.

**Sex as grouping attribute and as factor.** In the interface both uses read
the same resolved sex (see "Demographics resolution"), so they cannot disagree:
grouping by `sex` gives `m`, `w`, `d` and `(ungrouped)` for patients without a
resolved sex, and the `sex` factor removes exactly those `(ungrouped)` patients
as `Missing sex`. An unrecognised attribute spelling never becomes a group.
The grouping and factor functions would treat raw conflicting sources
differently (attribute over first row sex, versus rows over attribute), but the
workspace passes them resolved values only.

### Reproducibility

- **Served with the app** (since 2026-11-22, K43). Every build carries the R
  runtime and a fixed set of R packages next to `index.html`, and the worker
  loads both from the app's own address: webR from `webr/`, the packages from
  `r-packages/bin/emscripten/contrib/4.6/`. No fit makes a request to another
  host; a fit works where only the app's address can be reached.
  `scripts/vendor_r_runtime.mjs` puts the files there during `pnpm build` and
  `pnpm dev` and stops the build when a file's SHA-256 or the installed `webr`
  version differs from the pins in `src/core/mixedModel/rRuntimePins.json`.
- **Runtime.** webR 0.6.0 (the npm dependency `webr`, locked to 0.6.0) with
  R 4.6.0.
- **R packages.** webR binary builds, taken from
  `https://repo.r-wasm.org/bin/emscripten/contrib/4.6` when the build runs:
  lme4 2.0-6, Matrix 1.7-6, jsonlite 2.0.0, MASS 7.3-66, Rcpp 1.1.2,
  Rdpack 2.6.6, boot 1.3-32, lattice 0.23-1, minqa 1.2.8, nlme 3.1-171,
  nloptr 2.2.1.9000, rbibutils 2.4.1 and reformulas 0.4.4. That is the
  dependency closure (Depends and Imports) of `lme4` and `jsonlite`; the
  packages of R itself come with the runtime. The worker reads the build's
  `PACKAGES` index and calls webR's installer (`webr::install`) with it,
  which mounts `lme4` (or `nlme`), `jsonlite` and their dependencies from the
  served archives. These are the versions the fit loaded from webR's public
  repository before the pin (measured on 2026-11-21 and 2026-11-22), so the
  numbers did not change: the exported model workbook of the demo fit equals
  the one fitted before in every cell apart from `packageVersions`,
  `wasmAssetSource`, the version line of each fitted unit in `r_script`
  (`Browser fit of …`, which lists `packageVersions`), the export identifier,
  the time and the file name.
  Changing a version is a method decision.
- **Recorded per result.** The R version, the version of every pinned package
  the fit loaded and of webR's support package `webr`, the optimizer name,
  the browser user agent, a hash of the model rows and a hash of the fit
  configuration.
- **Timeout.** A fit job is abandoned after 120 seconds, including the
  first-time download and installation, and reported as failed with the status
  `timeout`. The worker is then discarded and the next job reloads the runtime.
- **No random numbers.** No seed is set; `randomSeed` is always empty.

The `models` worksheet has one row per fitted unit:

| Column | Content |
| --- | --- |
| `entity` | "Whole cohort" or the group value |
| `series_key`, `outcome`, `outcome_unit` | Fitted series |
| `status` | `success` or the failure status |
| `engine` | `webr-lme4` |
| `formula` | Executable formula with the series name and unit as outcome |
| `modelConfig` | JSON: time axis, factors with type, effect and reference, random effects |
| `preparation` | JSON: patients and measurements before factor exclusion, excluded patients with reasons, centres, exclusion policy and count |
| `preset_exclusion_policy`, `excluded_by_preset` | Exclusion policy and count |
| `reml` | Always true |
| `optimizer` | Optimizer reported by lme4, or `lme4-default` when it reports none |
| `runtimeVersion` | R version of the webR runtime |
| `packageVersions` | JSON: loaded versions of `lme4` and `Matrix` (or `nlme`) and `jsonlite`, then of every other loaded pinned package and of `webr`, as R's `packageVersion` writes them (for example `"lme4":"2.0.6"`); `Matrix` since 2026-11-05, the others since 2026-11-22 |
| `browserUserAgent`, `wasmAssetSource` | Browser and runtime source: `self-hosted` since 2026-11-22, `cdn` before |
| `datasetId`, `datasetHash`, `fitConfigHash` | The constant `cohort`, and hashes of the model rows and of the configuration |
| `randomSeed` | Empty |
| `warnings` | The warnings of the passed input check (since 2026-11-21; see "Patients who do not qualify stay in the fit"), then R warnings and lme4 messages, joined by "; " |
| `patients`, `measurements`, `converged`, `singular` | Successful fits |
| `message` | Failed fits |
| `unit_key` | `cohort` or `group:<value>` (since 2026-11-15) |
| `intercept_sd`, `slope_sd`, `intercept_slope_correlation`, `residual_sd` | Variance components of a successful fit (since 2026-11-21), unrounded: standard deviation of the patient random intercept and of the random slope (per year), their correlation, and the residual standard deviation (`VarCorr`, `sigma`). Empty for a failed fit; `slope_sd` and the correlation are empty with a random intercept alone, and any of them where R reports none |

A fit that fails before the worker answers (for example a timeout) has only
part of this provenance. The other worksheets are, in workbook order,
`coefficients` (every fixed effect with unit, estimate, interval bounds and
standard error), `factors`, `centering`, `excluded_patients`, `projections`
when a projection is applied, `about`, and then the sheets added after
version 0.3.7: `vcov`, `model_rows`, `model_input_flags` and `r_script`.

**Positions and `unit_key` (since 2026-11-15).** Sheets and columns that
existed in version 0.3.7 keep their positions; new sheets follow `about` and
new columns are the last of their sheet. `coefficients` therefore reads
`entity`, `outcome`, `unit`, `term`, `label`, `estimate`, `ci_lower`,
`ci_upper`, `std_error`, `unit_key`. Every sheet that names a fitted unit
carries `unit_key`: `cohort` for the whole cohort and `group:<value>` for a
group. `entity` is the display label and can repeat: a group whose value is
"Whole cohort" has the same `entity` as the pooled model and the `unit_key`
`group:Whole cohort`. On the sheets that predate it (`models`, `coefficients`,
`factors`, `centering`, `excluded_patients`, `projections`) the columns added
since 0.3.7, `std_error` and `unit_key`, are the last columns of the sheet,
after every 0.3.7 column (`newColumnsLast`). This also holds when the rows of
a sheet have different shapes. The 0.3.7 columns keep the order in which
they first appear across the rows, which is how the workbook was written
then; that order depends on the rows exported, as it did in 0.3.7. Example:
with the factors baseline age (numeric, no reference) and sex (categorical),
`factors` reads `entity`, `key`, `kind`, `effect`, `column`, `reference`,
`unit_key`, and the baseline-age row has an empty `reference` cell; with a
successful whole-cohort fit and a failed group fit, `models` ends in
`singular`, `message`, `unit_key`. On `vcov`, `model_rows` and
`model_input_flags` `unit_key` follows `entity`. The four variance-component
columns added on 2026-11-21 follow `unit_key` on `models`, so that sheet ends
in `unit_key`, `intercept_sd`, `slope_sd`, `intercept_slope_correlation`,
`residual_sd`; `unit_key` stays the last column of the other sheets.

**`about` (rows appended on 2026-11-21).** After the `export_id` and
`unit_key` rows the sheet explains the variance-component columns and the
content of `warnings`, lists the personal and device-related fields of the
file (patient IDs as imported in `model_rows`, `model_input_flags` and
`excluded_patients`; dated values and factor values; `browserUserAgent` in
`models`; the workbook name in `r_script`) with a request to check them
before the file is passed on, and ends with `app_version: <version>` (the app
that wrote the file; left out when the export function is called without a
version, as the library package does), `exported_at: <ISO 8601 time in UTC>`
and one row explaining both. `export_id` keeps its row, which the R script
reads.

**R reproduction (since 2026-11-05).** These outputs let a fit be rebuilt and
extended in R. They add no estimate and change none.

- **`model_rows`.** One row per row the worker received for the stored result,
  in the order sent, taken from the same prepared rows (`workspaceModelEntities`)
  and not derived again: `entity`, `unit_key` (`cohort` for the whole cohort,
  `group:<value>` for a group, so a group named "Whole cohort" stays distinct),
  `group` (the group value, empty for
  the whole cohort), `patient_id`, `date` (UTC date of the model point; for a
  time-balancing median the date of the median point), `value`,
  `time_since_baseline`, and per factor the column passed to R
  (`baseline_age_centered`, `factor_<i>_`) followed by its value before
  centring (`baseline_age`, `raw_factor_<i>_`). Categorical values are passed
  unchanged, so both columns are equal. The date and raw values are not part of
  the dataset hash; R never reads them.
- **`model_input_flags`.** One row per measurement of the modelled series
  (same name and unit) of every patient in the unit, patients in model order
  and each patient's measurements in import order, with
  `entity`, `unit_key`, `group`, `patient_id`, `date`, `value`, `status`,
  `reason` and `model_date`. `status` is `entered` (the value entered unchanged as the model
  row dated `model_date`), `aggregated_into_median` (one of at least two
  values of a calendar month or quarter whose median is the model row dated
  `model_date`) or `excluded`. `reason` is set for `excluded` only, from the
  first stage that removed the measurement (see *Which measurements enter*):
  `no_date`, `no_numeric_value`, `bound_value` (operator other than `=`), the
  reasons of every event or AKI window containing the date joined by `; `
  (`post_kidney_transplant`, `post_chronic_dialysis`, `acute_dialysis`,
  `unknown_dialysis_interval`, `aki`), `run_in` (the measurement or its median
  lies in the chronic run-in), or `patient_excluded: <reasons>` when the
  factor preparation removed the patient (for example
  `patient_excluded: Missing genotype`). The window reasons come from the same
  `applyExclusionWindows` decision and the aggregation from the same
  `balanceSeriesPointGroups` grouping as the model rows; nothing is
  recomputed. Example, the patient from *Which measurements enter* under CKD
  progression: 2020-01-01 is `entered` with `model_date` 2020-01-01, and
  2020-07-01 and 2021-01-01 are `excluded` with `post_kidney_transplant`.
- **Standard errors and `vcov`.** The worker returns `vcov(fit)` as a matrix
  and `sqrt(diag(vcov(fit)))` (lme4 and nlme alike). `std_error` in
  `coefficients` is that square root. The `vcov` sheet has, per unit, one row
  per term in the order of `coefficients` with `entity`, `unit_key`, `term`
  and one column per term; with several units the columns are the union of their terms and
  cells of absent terms are empty. Both are serialized at R's full JSON
  precision (`digits = NA`, 15 significant digits). Results fitted before this
  change have neither; their cells are empty. A covariance that does not match
  the term order or is not square does not fail the fit: it is dropped with
  the warning "The fixed-effect covariance matrix could not be read; standard
  errors and vcov are not exported for this fit.", and estimates and intervals
  are kept.
- **`r_script`.** An R script, one line per row in the column `line`, that
  sets `mm_workbook` to the file name of the download
  (`cohort-models-<timestamp>.xlsx`; the fixed name `cohort-models.xlsx` until
  2026-11-16, which did not match the downloaded file), stops unless the
  `about` sheet of that workbook carries the script's own `export_id` (a random
  id written to both at export, so a browser-renamed second download cannot be
  refitted in place of the first),
  reads `model_rows` and `coefficients` with `readxl` (`trim_ws = FALSE`),
  selects each unit's rows by `unit_key`, rebuilds `mm_data`,
  factors, reference levels and treatment contrasts with the worker's own R
  code (`mixedModelDataRCode`), runs the worker's exact call
  `lme4::lmer(<formula>, data = mm_data, REML = TRUE, na.action = na.fail)`
  per successful lme4 unit, prints the browser and refitted estimates side by
  side and ends with `sessionInfo()`. Each unit runs inside its own `local()`
  block whose value is stored in `mm_fits[[<unit_key>]]`; the fit's formula
  environment holds that unit's `mm_data`, so `update()`, `anova()` or
  `emmeans` on any fit use its own rows even after later units were fitted.
  Names in string literals have NUL characters and unpaired UTF-16 surrogates
  replaced by U+FFFD, since R cannot parse those escapes. It states the R and package versions of
  the browser fit (`lme4`, `Matrix`, `jsonlite`), or "unknown" when not
  recorded, how to refit with `REML = FALSE` for likelihood-ratio tests and
  how to use `lmerTest` for Satterthwaite degrees of freedom. Non-reference
  levels are ordered by `sort(method = "radix")`, so every locale gives the
  browser's order (see *Categorical coding*). Verified with real webR, lme4 2.0.6 and readxl
  (`scripts/verify_mixed_model_r_export.mjs`) for the whole cohort (138 rows)
  and a group literally named "Whole cohort" (96 rows): each refit equals its
  browser covariance and its browser estimates to 1e-9,
  and `update(fit, REML = FALSE)` on either fit, run after both, uses that
  unit's row count.

**Precision of returned numbers** (OD-30, decided 2026-11-13). Every number the worker returns from R, including estimates, interval bounds, random-effect standard deviations, the residual standard deviation, standard errors and `vcov`, is serialized by `jsonlite::toJSON` with `digits = NA`, that is 15 significant digits. The random-effect standard deviations, their correlation and the residual standard deviation are exported only since 2026-11-21 (`intercept_sd`, `slope_sd`, `intercept_slope_correlation`, `residual_sd` on `models`); until then they were stored at full precision but only shown, with two decimals, in the model's details (for example 0.21, 0.05, 0.18 and 0.31). Before, `toJSON`'s default `digits = 4` rounded all but the standard errors and `vcov`: a slope of 0.00034 per year was stored, shown and exported as 0.0003, and values between 1e-5 and 5e-5 became 0 or −0 (`toJSON(c(0.00034, 3.4e-6, -0.000049))` gave `[0.0003, 3.4e-06, -0]`). Stored results and exports carry the full value, so an R refit now matches the browser estimates to 1e-9. Results fitted and saved before this change keep their four-decimal values until they are refitted.

**No `tolerance` field** (OD-21, decided 2026-10-07, implemented
2026-11-22). Until 2026-11-22 every result carried a constant `tolerance` of
`1e-6` that no fit used (the only tolerance in a fit is lme4's `1e-4`
singularity check, see *Singular, lme4*). It was exported as a column of
`models` between `reml` and `datasetId` and was part of the input of
`fitConfigHash`. Both are removed:

- `models` no longer has the column `tolerance`. This is a deliberate
  exception to "0.3.7 columns keep their positions": every column that
  followed it (`datasetId`, `datasetHash`, `randomSeed`, `fitConfigHash`,
  `preset_exclusion_policy` and the later ones) is one position further left;
  names and values are unchanged, so a reader that selects columns by header
  is not affected.
- `fitConfigHash` is computed from the same configuration without the
  constant, so every value differs from the one an earlier version gave for
  the same model and data. Example: eGFR in `ml/min/1.73m2`, global OLS, the
  default model and no fit settings gave `e3861a2b` and now gives
  `74ba071d`. Model results are not saved across a reload, so no stored
  result becomes outdated; only a comparison of `fitConfigHash` with a
  workbook exported before 2026-11-22 reports a difference. `datasetHash`,
  the result identity's other fields and all fitted numbers are unchanged.

The other half of the entry, R packages without pinned versions, was settled
on 2026-11-22: the versions are pinned and served with the app (see
*Reproducibility*).

### Fitted model line

`mixedModelMeanLinePoints` (`src/core/mixedModel/resultIdentity.ts`) draws a
unit's fitted line as

`value(t) = intercept + time slope × t`

using the fixed-effect intercept and `time_since_baseline` coefficient only.
(The function can also shift the line by a centred baseline age; the interface
always passes none or 0, so that path is not reachable.)
With factors this is the *reference profile*: numeric factors at their centres
and categorical factors at their reference levels. It is not an average over the
cohort's categories, and random effects do not enter.

- **Extent.** The line runs from the smallest to the largest
  `time_since_baseline` among the unit's model rows after complete-case removal.
  It is not extended beyond observed model time. No line is drawn when all
  model times are equal. Example: intercept 62, slope −3 and model times from 0
  to 4.5 years give the segment from (0, 62) to (4.5, 48.5).
- **When it is drawn.** Only for a successful, converged, non-singular result
  whose stored identity matches the current series, unit, data, preparation and
  model configuration. Display filters do not refit or redefine it.
- **Cohort models preview.** The x-axis is model time. Points are the pooled
  model rows before complete-case removal; lines are the pooled fit and each
  fitted group.
- **Trajectory overlay.** Off by default ("Show model line in overlay"). The
  line is drawn on the axes "Years since first measurement", "Days since
  first measurement" (model time × 365.25) and "Age", not on the calendar
  axis. Group lines appear when the overlay is grouped by the
  attribute the groups were fitted under, for groups that are visible.
- **Years axis.** The line is placed at its model time. Patient curves on this
  axis start at each patient's first plotted value of the series, which
  includes `<`/`>` values; model time starts at the first retained exact value.
- **Age axis.** x = mean baseline age + model time. The mean takes one baseline
  age per patient over the unit's modelled patients with a known baseline age.
  No line is drawn when none has one. Example: mean baseline age 55 places the
  segment above at ages 55 to 59.5.

### Implemented but not reachable from the interface

The following rules exist in the core and are covered by unit tests, but no
interface path selects them. They are documented so that the code and this
reference agree; they do not affect results produced through the interface.

- **Chronic run-in removal.** For a series in slope mode `chronic-ckd`, model
  rows dated on or before the first retained row's date plus the cutoff (default
  90 days) are removed after time balancing; only rows strictly later than that
  moment remain, and the first of them becomes the time origin and baseline-age
  source. `modeForFitModel` never returns this mode.
- **The nlme engine**, including its convergence and singularity rules above.
  The interface always requests `webr-lme4`.
- **Legacy baseline-age covariate.** A configuration with
  `covariates: ['baseline_age']` and no factor list centres baseline age at the
  mean over all modelled patients with a known age and fails validation when
  any modelled patient lacks one, instead of removing that patient. The
  initial configuration has no factor list and no covariates, which gives the
  same model as *Standard*; every preset and factor edit sends a factor list.
  No interface path produces `covariates: ['baseline_age']` without one.

Regression evidence:
[row preparation](../../tests/core/mixedModel/cohortDataset.test.ts),
[minimum-data and duplicate rules](../../tests/core/mixedModel/validation.test.ts),
[factor formulas and factor validity](../../tests/core/mixedModel/configuredFactors.test.ts),
[complete cases, centring, sex source and typing](../../tests/core/mixedModel/factors.test.ts),
[generated R code](../../tests/core/mixedModel/webrWorkerRuntime.test.ts),
[result extraction](../../tests/core/mixedModel/webrWorkerExtraction.test.ts),
[fitted line and result identity](../../tests/core/mixedModel/resultIdentity.test.ts),
[export worksheets](../../tests/core/mixedModel/modelExport.test.ts),
[timeout and worker handling](../../tests/core/mixedModel/browserClient.test.ts),
[grouping](../../tests/core/grouping/grouping.test.ts),
[workspace exclusion count, lines and withholding](../../tests/workspace/model-validity.test.tsx),
[presets and reference categories](../../tests/workspace/cohort-models.test.tsx)
and [results table](../../tests/workspace/models/CohortModelTable.test.tsx).
The R code is asserted as text against a mocked runtime; the browser tests
replace the worker. Real webR fits run only in
[the factor verification script](../../scripts/verify_mixed_model_factors.mjs) and
[the projection verification script](../../scripts/verify_mixed_model_projections.mjs),
which are not part of `pnpm test` or CI. No dedicated regression test: the
numeric grammar's rejection of decimal commas, the shared resolved sex behind
grouping and the `sex` factor, a default reference level absent from a unit
(OD-29), the calendar-axis restriction of the overlay line, the status text of
a non-converged fit, and the fact that validation warnings are not surfaced.
The [model validity tests](../../tests/workspace/model-validity.test.tsx) cover
the Trajectories settings reaching the model rows, the discarding of fitted
models and the Group interaction factor.

## Cohort-model projections

A projection reports when the fitted fixed-effect line of a chosen covariate
profile reaches a threshold. It is a crossing of a fitted line, conditional on
the trend continuing unchanged. It is not an expected event time, a
patient-specific prediction, a confirmed clinical stage or a prognosis.

### Profile line

`resolveProjectionProfile` (`src/core/mixedModel/projectionProfile.ts`) turns a
profile, one value per configured factor, into a line `y(t) = a + b × t`:

- `a` starts at the fitted intercept and `b` at the `time_since_baseline`
  coefficient.
- A numeric factor with profile value `x` and fitted centre `c` adds
  `coefficient × (x − c)` to `a`. Profile values are entered on the raw scale,
  for example an age in years.
- A categorical factor at its reference level adds nothing. At another level it
  adds that level's coefficient to `a`.
- A factor with level and slope adds, in the same way, its
  `time_since_baseline:` coefficient times `(x − c)`, or the level's interaction
  coefficient, to `b`. A level-only factor never changes `b`.

Only fixed effects enter. The line describes the population average for that
profile; no patient's random intercept or slope is used.

The default profile sets every categorical factor to its reference level and
every numeric factor to its fitted centre, so `a` and `b` equal the reference
intercept and slope. A model without factors has the single unadjusted profile.

The profile is unavailable, and every enabled target then reports "Profile
unavailable" with the reason, when a numeric value is missing or not finite, a
category is missing, a fitted centre or a required coefficient is absent, or a
chosen category does not occur among the complete-case patients of the fitted
unit ("Profile category is not present in the fitted population").

### Crossing time and status

`projectLinearThreshold` (`src/core/projection/linearProjection.ts`) evaluates
one target with threshold `q` and direction *below* or *above*, a reference
time `r` and a horizon `h`, both in years:

`model time t* = (q − a) / b`, `remaining years = t* − r`

Model time is years since each patient's own first retained measurement (see
*Which measurements enter*), not calendar time and not age. The reference time
is a point on that same scale; "remaining" counts from it.

The checks run in this order and the first match is reported.

| Order | Status | Condition |
| --- | --- | --- |
| 1 | `invalid` | `a`, `b`, `r`, `h` or `q` is not finite, `r < 0`, `h <= 0`, or the direction is unknown |
| 2 | `incompatible_target` | The target's outcome name or unit differs from the fitted series |
| 3 | `invalid` | `a + b × r` is not finite |
| 4 | `already_met` | *below*: `a + b × r < q`; *above*: `a + b × r > q` (strict) |
| 5 | `flat` | `b = 0` exactly |
| 6 | `away` | *below* with `b > 0`; *above* with `b < 0` |
| 7 | `crossing` | `a + b × r = q` exactly: model time `r`, remaining 0 |
| 8 | `invalid` | `t*` or the remaining time is not finite, or the remaining time is negative |
| 9 | `beyond_horizon` | remaining `> h`; a remaining time of exactly `h` is a crossing |
| 10 | `crossing` | Otherwise: model time `t*`, remaining `t* − r` |

Boundary cases for a *below* target of 30 at `r = 0`, `h = 20`: `a = 30`,
`b = −2` is a crossing at model time 0; `a = 30`, `b = 0` is `flat`; `a = 30`,
`b = 2` is `away`; `a = 29.9`, `b = −2` is `already_met`; `a = 70`, `b = −2`
is a crossing with exactly 20 remaining years; `a = 70.1`, `b = −2` is
`beyond_horizon`.

Two further row states come from the settings: `disabled` for a target the user
switched off, and `unavailable_profile` as described above.

### Settings and targets

- **Defaults.** Reference time 0 years, horizon 20 years, the default profile,
  and every preset target enabled.
- **Editable ranges.** The reference time must be finite and at least 0. The
  horizon must be finite and greater than 0. Thresholds must be finite. Target
  labels must not be empty. Changes take effect only after *Apply*. While
  valid changes are unapplied, a line below the controls previews them: for
  each enabled target its remaining years, rounded to two decimals, or its
  status. It is computed by the same function as the applied rows
  (`projectionRows`); the results table and the export keep the applied
  settings until *Apply*.
- **Preset targets.** For an eGFR outcome the presets are the G4 boundary
  (*below* 30) and the G5 boundary (*below* 15), with the fitted series' own
  name and unit. They are offered when the unit is mL/min/1.73 m² in one of
  the four accepted spellings, whatever the outcome is called (`isEgfrUnit`,
  the rule of the individual eGFR endpoints; the spellings are listed under
  "Eligibility and kidney failure reached"). `eGFR (CKD-EPI 2021, computed)`,
  `eGFRcys` and `GFR (CKD-EPI)` in `ml/min/1,73m²` qualify, as does `eGFR` in
  `mL/min/{1.73_m2}`; the unit `ml/min` does not.
  Other outcomes have no preset.
- **Custom targets.** Any number can be added for the fitted outcome and unit.
  A new custom target starts as *below* 0 and enabled; its label, threshold and
  direction are editable. No unit conversion is applied.
- **Scope.** Settings are kept for the session per series and fitted unit, for
  as long as that unit's stored result is the one they were applied to. They
  are reset to the defaults when it is replaced by a result with a different
  identity, including a fit of another series.

### Uncertainty

Time uncertainty is not estimated: a projected time has no interval, and the
panel and export say so. The confidence interval of the slope is not used to
withhold a projection. A profile line whose slope interval includes zero still
reports a crossing whenever its point estimate moves toward the target within
the horizon. This differs from the individual G5 projection, which is withheld
when the endpoint fit's slope interval touches or includes zero.

### When projections are withheld

No projection is offered or exported for a unit unless its fit succeeded,
converged, is not singular, and its stored identity matches the current series,
unit, model rows, preparation and model configuration. A singular fit shows
"Projection unavailable: the random-effects fit is singular."; otherwise the
text is "Projection unavailable: a current converged fit is required." Changing
the loaded data, events, patient attributes, manual demographics, the eGFR
formula or source, the factors or random effects (including re-selecting a
preset) or the exclusion policy discards all fitted results and their
projection settings. Results are stored per unit, not per series: a stored
result that no longer matches the selected series or its current rows is
hidden, and it is overwritten, together with its projection settings, as soon
as that unit is fitted again.

### Export

The `projections` worksheet has one row per target with the unit, outcome and
unit, the source identity, the applied profile and settings, the profile line's
`intercept` and `slope_per_year`, `reference_time_years`, `horizon_years`, the
target's label, threshold, direction and enabled state, `status`, `reason`,
`model_time_years` and `remaining_years`. Every row states the anchor ("Fitted
model curve; years since each patient's first retained measurement") and
`time_uncertainty` = "not estimated". A unit without targets has one row with
the status `no_targets`.

### Worked example

Model: baseline age (level) and sex (level and slope, reference `w`), random
intercept and slope. Fitted centre of baseline age: 55 years. Fixed effects:
intercept 62, `time_since_baseline` −3, `baseline_age_centered` −0.4,
`factor_1_m` −2, `time_since_baseline:factor_1_m` −0.5.

- Default profile (age 55, `w`): `a = 62`, `b = −3`. With reference time 0 and
  horizon 20, the G4 boundary is crossed at model time 10.67 years and the G5
  boundary at 15.67 years.
- Profile age 65, `m`: `a = 62 − 0.4 × (65 − 55) − 2 = 56` and
  `b = −3 − 0.5 = −3.5`. G4 is crossed at `(30 − 56) / −3.5 = 7.43` years and G5
  at `(15 − 56) / −3.5 = 11.71` years.
- The same profile with reference time 2: remaining 5.43 and 9.71 years. With a
  horizon of 5 years both targets are `beyond_horizon`.
- The same profile with reference time 8: the line is at `56 − 3.5 × 8 = 28`,
  below 30, so G4 is `already_met`; G5 has 3.71 remaining years.

The panel shows times with two decimals; the export keeps full precision.

Regression evidence:
[profile line](../../tests/core/mixedModel/projectionProfile.test.ts),
[crossing and status rules](../../tests/core/projection/linearProjection.test.ts),
[snapshot, presets and withholding](../../tests/core/projection/projectionSnapshot.test.ts),
[projection panel](../../tests/workspace/models/ModelProjectionPanel.test.tsx),
[projection export](../../tests/core/mixedModel/modelExport.test.ts),
[results table and singular fits](../../tests/workspace/models/CohortModelTable.test.tsx)
and the [browser projection workflow](../../tests/e2e/model-projections.e2e.ts).
No dedicated regression test: that a projection is still reported when the
slope confidence interval includes zero.

