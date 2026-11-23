# Reference comparisons against native R

Stored reference cases from native R and established R packages, and the
Vitest tests that compare the application with them (issue #79, with the
cross-check moved from #34; owner decision of 2026-11-22, row `rref` of the
[method decisions](remaining-method-decisions.md)). Research use only. A
passing comparison shows agreement with another implementation of the same
definition, on synthetic or hand-made inputs. It is not a clinical validation,
and it says nothing where the definitions differ: those places are listed
below as they are, not aligned.

The older [golden fixtures](../tests/goldens/README.md) (Python `analyses`
package) stay the regression snapshots of the numeric core; the cases here are
a second, independent comparison.

## Regenerating

One command regenerates every stored case:

```sh
pnpm reference:generate                 # all cases with the installed packages
pnpm reference:generate -- --install    # first install the pinned R packages
pnpm reference:generate -- --webr       # also refit the mixed models in webR
pnpm reference:generate -- egfr aki     # only some parts: mixed, ols, theilsen, survival, egfr, aki
```

`scripts/reference/generate.sh` runs `scripts/reference/mixed_model_inputs.mjs`
(the mixed-model inputs, built by the app's own code) and then
`scripts/reference/generate.R`, which writes `tests/reference/*.json`. Each
file records the R version, the platform and the version of every package it
used (`environment`), and the date it was generated.

Set-up used for the stored files (2026-11-22, Ubuntu 24.04, x86_64):

- R 4.6.0 (the R version of the browser runtime, webR 0.6.0), from the CRAN
  Ubuntu repository (`r-base-core_4.6.0-4.2404.0`).
- `scripts/reference/install.R` installs from CRAN source into
  `R_REFERENCE_LIB` (default `~/.cache/lte-r-reference`): the lme4 stack at the
  versions pinned in `src/core/mixedModel/rRuntimePins.json` (lme4 2.0-6,
  Matrix 1.7-6, minqa 1.2.8, nlme 3.1-171, reformulas 0.4.4, Rcpp 1.1.2,
  RcppEigen 0.3.4.0.2, jsonlite 2.0.0 and the rest of the list), with one
  exception: **nloptr 2.2.1** from CRAN, because the browser's 2.2.1.9000 is a
  development build that CRAN does not carry and its source host was not
  reachable from the container. Further packages: lmerTest 3.2-1, numDeriv
  2016.8-1.1, survival 3.8-12, mblm 0.12.1, Kendall 2.2.2, zyp 0.11-1,
  egfr 2.0.0, kidney.epi 1.4.0, epocakir 1.0.0 (with their CRAN dependencies).
- System libraries for the source builds: a C, C++ and Fortran toolchain
  (`r-base-dev`), `cmake`, `libnlopt-dev`, `libudunits2-dev`.
- `--webr` needs the vendored runtime (`pnpm vendor:r`) and Chromium;
  `CHROMIUM_PATH` names the browser binary when Playwright's own build is not
  installed.

The webR fits (`tests/reference/mixed_models_webr.json`) are produced by the
production worker in headless Chromium, so a plain `pnpm reference:generate`
keeps them; refresh them with `--webr` whenever the inputs change. The test
`mixed-model reference inputs are still what the app builds` fails when they
are stale.

## What is compared with what

| Area | Application | Reference | Test | Tolerance |
| --- | --- | --- | --- | --- |
| Mixed models | webR lme4 fit by the production worker (`webr.worker.ts`) | native `lme4::lmer` on the same model rows, R data code (`mixedModelDataRCode`) and lmer call (`lme4ModelCall`) | `tests/reference/mixedModels.test.ts` | fixed effects, standard errors, Wald intervals: 1e-6 relative + 1e-8; variance components, correlation, residual SD: 1e-4 relative + 1e-6 |
| OLS | `fitOls`; two points: `fitGlobal` | `stats::lm(y ~ x)`, `confint` | `tests/reference/ols.test.ts` | 1e-9 relative + 1e-12 |
| Theil–Sen | `fitTheilSen` | `mblm::mblm(repeated = FALSE)`, `zyp::zyp.sen` and `confint.zyp`; median of pairwise slopes in R | `tests/reference/theilSen.test.ts` | slope and intercept 1e-9 relative + 1e-9; intervals: listed differences |
| eGFR | `formulas.ts` (CKD-EPI 2021 and 2009, MDRD-4, EKFC, CKiD U25, bedside Schwartz) | `egfr` 2.0.0 (full precision), `kidney.epi` 1.4.0 (rounded to 0.01 by the package) | `tests/reference/egfr.test.ts` | egfr: 1e-12 relative + 1e-12; kidney.epi: 0.005 + 1e-9 absolute |
| AKI | `kdigoStage`, `findKdigoAkiEpisodes` | `epocakir::aki_bCr`, `epocakir::aki_SCr` | `tests/reference/aki.test.ts` | stages are integers: exact |
| Kaplan–Meier, log-rank, median, Aalen–Johansen | `src/core/survival/survival.ts` (issue #78) | `survival::survfit`, `survdiff`, `coxph` score test, `quantile.survfit`, multi-state `survfit` | `tests/reference/timeToEvent.test.ts` (1e-10 relative, 1e-12 absolute) | see below |

### Mixed models

Three synthetic cohorts (`tests/reference/mixedModelCases.ts`): lab rows
prepared by the app's cohort-model path (`workspaceModelEntities`, quarterly
medians, the factor preparation and default references), giving

| Case | Formula | Rows | Patients |
| --- | --- | ---: | ---: |
| `random_slope_no_factors` | `value ~ time_since_baseline + (1 + time_since_baseline \| patient_id)` | 194 | 18 |
| `categorical_and_numeric_factor` | `value ~ time_since_baseline + factor_0_ + time_since_baseline:factor_0_ + factor_1_ + (1 + time_since_baseline \| patient_id)` | 264 | 24 |
| `random_intercept_baseline_age` | `value ~ time_since_baseline + baseline_age_centered + (1 \| patient_id)` | 162 | 15 |

`tests/reference/inputs/mixed_models.json` stores the rows, the formula, the R
data code and the lmer call; the test rebuilds them with the current code and
requires equality. `generate.R` binds the same vectors as the worker
(`bindRows`), evaluates the stored R code and the stored call (REML), and
records fixed effects, `sqrt(diag(vcov))`, Wald intervals (`confint(method =
"Wald")`), the patient variance components (`VarCorr`), `sigma`, the REML
criterion, the optimizer and, for reference only, lmerTest's Satterthwaite
degrees of freedom and p-values (the app reports Wald intervals only; the
exported R script runs lmerTest).

**Result (2026-11-22):** all three fits converged, none singular, optimizer
`nloptwrap` on both sides; every fixed effect, standard error, Wald bound,
standard deviation, correlation and residual SD of webR equals the native
value in all 15 significant digits that the JSON carries (difference 0).
`random_slope_no_factors`: intercept 64.6462044470534 (SE 1.4525012721065),
slope −2.53052648868442 (SE 0.228898980262211), intercept SD
6.09463601906211, slope SD 0.902341122755216, correlation
−0.197466955512899, residual SD 1.62777670521548.

Why the tolerances are wider than the agreement: the fit is an iterative
optimisation of the variance parameters, stopped by nloptr's tolerance; a
different nloptr build, BLAS or platform may move them in the 6th to 8th
significant digit, and the fixed effects follow through the generalised least
squares step. 1e-6 relative for fixed effects and 1e-4 for the variance
components accept such differences and still catch a different model, data
step or contrast, which change the estimates in the 1st to 3rd digit. The
nloptr version differs between the two sides (2.2.1 against 2.2.1.9000);
on these cases it changed nothing.

Not compared: the `webr-nlme` engine, models on the age axis, and fits that
fail or are singular.

### OLS

All 18 series of `tests/goldens/ols.json` and `tests/goldens/theil_sen.json`.
The app computes closed-form sums, R a QR decomposition; slope, intercept,
slope standard error, R² and the t-based 95 % slope interval agree within
1e-9 relative. Conventions that differ
and are asserted as such: below three points `fitOls` returns
`n_below_threshold`, while `lm` fits two points exactly without interval (the
app's `fitGlobal` returns that exact line, as CLAUDE.md notes) and nothing
below; when every point has the same time, neither has a slope; R² of a constant series is
undefined in both.

### Theil–Sen

The same 18 series. Slope: the median of the pairwise slopes (pairs with equal
time left out) in the app, mblm and zyp; equal in all 12 fitted series.

**Intercept: documented convention difference.** The app uses
`median(y) − slope × median(x)` (owner decision for issue #6, see
[trend estimators](method-algorithms/trend-estimators.md#theil-sen-2026-09-23));
mblm and zyp use `median(y − slope × x)`. They differ in 6 of the 12 series,
for example `even_pair_count` (x = 0, 1, 2, 3; y = 0, 0, 4, 9): −3.25 in the
app, −2.25 in mblm and zyp; `interior_ci_ranks`: 6.805556 against 7.722222.
The test recomputes the app's convention in R and lists the differing cases.

**Slope interval: difference, OD-87.** Both the app (SciPy's convention) and
`confint.zyp` use Sen's normal approximation with the variance of Kendall's S,
but the ranks differ: with N pairwise slopes and C = 1.96 × √V, the app takes
the 1-based ranks `roundEven((N − C)/2)` and `roundEven((N + C)/2) + 1`, zyp
`round((N − C)/2)` and `round((N + C)/2)`. The upper bound is therefore one
rank higher in the app: `interior_ci_ranks` (12 points, N = 66, C = 28.58,
ranks 19 and 48 against 19 and 47) gives [1.5, 2.3] in the app and
[1.5, 2.285714] in zyp. With three to five points zyp's lower rank falls to 0
and its interval collapses to one value (`odd_pair_count`: app [2, 8], zyp
[8, 8]). Intervals agree in 5 series, differ in 7. mblm's `confint` is a
Wilcoxon signed-rank interval of the pairwise slopes, another method; it is
stored, not compared. Which rank convention Sen (1968) and Hollander and
Wolfe prescribe was not checked against the texts in this container.

deming::theilsen was tried and left out: its slope is not the plain median of
the pairwise slopes (0.391511 against 0.39375 for `ols_1`), and its interval
needs a bootstrap.

### eGFR

A grid of creatinine (0.3 to 4.5 mg/dl), whole-year ages and sex: 128 adult
cases (ages 18 to 90) and 144 paediatric cases (ages 2 to 25, with a height
per age). The app's functions in `formulas.ts` are called directly, not the
derivation (age rule, height matching, formula choice per row).

- **egfr 2.0.0** agrees in every case and equation to 1e-12 relative: CKD-EPI
  2021, CKD-EPI 2009 (race-free), MDRD-4 (175), EKFC (adults and the
  age-dependent Q from 2 to 25), CKiD U25, bedside Schwartz.
- **kidney.epi 1.4.0** rounds to two decimals; within 0.005 the app agrees
  for CKD-EPI 2021, MDRD-4 (IDMS, 175), CKD-EPI 2009 for men, EKFC above 2
  up to 25, CKiD U25 below 15 and from 18, and bedside Schwartz (`equation_type
  "classic"`). Differences, asserted as they are:
  - **EKFC above 25, OD-85.** kidney.epi takes Q in µmol/l, 80 (men) and 62
    (women), the app 0.90 and 0.70 mg/dl (79.56 and 61.88 µmol/l with 88.4).
    kidney.epi's values are higher by up to 0.66 % (man, 70 years,
    4.5 mg/dl: 12.836 in the app, 12.92 in kidney.epi; man, 50 years,
    1.0 mg/dl: 86.130 against 86.67).
  - **CKiD U25 from 15 to under 18, OD-86.** kidney.epi uses a constant k of
    41.8 (boys) and 37.6 (girls) there; the app and egfr continue
    39.0 × 1.045^(age − 12) and 36.1 × 1.023^(age − 12) to 18. Up to 14 %
    apart (boy, 17 years, 172 cm, 0.3 mg/dl: 278.65 in the app, 239.65 in
    kidney.epi; boy, 16 years, 170 cm, 1.0 mg/dl: 79.06 against 71.06).
    kidney.epi's constant makes its boys' value drop at 15 (k 44.51 at 15 by
    the exponential, 41.8 by its constant). Resolved by the owner on
    2026-11-23: the app keeps its formula, which agrees with egfr 2.0.0 and
    the secondary sources; kidney.epi's constants do not match the published
    formula. The test keeps asserting the difference.
  - **CKD-EPI 2009 for women, OD-88.** kidney.epi uses the constant 144 of
    the table form of the equation, the app and egfr 141 × 1.018 = 143.538 of
    the single-expression form; kidney.epi's values are 0.32 % higher (woman,
    50 years, 1.0 mg/dl: 65.638 against 65.85).
  - **Age range.** kidney.epi's adult equations return no value at exactly 18
    and its EKFC none at exactly 2 (ranges "greater than 18" and "greater
    than 2"); the app computes there.
- **Primary publications.** No case in the test tree was taken from a table
  of a primary publication: none was accessible from this container, and
  values from memory are not stored. The comparison therefore shows agreement
  with two independent implementations of the published formulas, one of
  which (egfr) agrees exactly; it does not show agreement with the
  publications' own worked examples. Cases from Pottel et al. (Ann Intern Med
  2021;174:183), Inker et al. (N Engl J Med 2021;385:1737) and Pierce et al.
  (Kidney Int 2021;99:948), with the table named, remain to be added.

### AKI staging (KDIGO)

- **One value against a baseline** (38 pairs): `kdigoStage(baseline, value)`
  against `epocakir::aki_bCr`. Equal in every pair except where the value is
  at least 0.3 mg/dl above the baseline and below 1.5 times it: the app gives
  stage 1 (KDIGO's absolute criterion), aki_bCr 0, because epocakir checks the
  absolute rise only within 48 hours in aki_SCr (baseline 1.0, value 1.3).
- **Series** (8): `findKdigoAkiEpisodes` against `aki_SCr` (per value) and
  `aki_bCr` with the series' seven-day minimum as baseline. Equal where the
  definitions match (rise of 0.35 mg/dl on the next day; rise of 0.4 mg/dl
  within one day with times of day; no AKI). Differences, asserted as they
  are:
  - *48-hour boundary.* The app counts calendar days (values two calendar
    days apart lie within its 48-hour window, as decided; see
    [AKI](method-algorithms/aki.md)); epocakir requires strictly less than 48
    hours between time stamps. 1.0 and 1.4 mg/dl two days apart: stage 1 in
    the app, none in epocakir (whose aki_SCr stops with an error when no two
    values lie closer than 48 hours; recorded as `epocakirError`).
  - *Relative rise and higher stages.* aki_SCr detects only the 0.3 mg/dl rise
    and grades it as stage 1 (its stage 3 needs a rise of 4 mg/dl within 48
    hours); the 1.5-times criterion and stages 2 and 3 need a baseline given to
    aki_bCr. With the seven-day minimum as that baseline, epocakir gives the
    app's stage: 1.0 then 1.6 five days later (stage 1), 1.0 then 2.1 the next
    day (stage 2), 3.5 then 4.1 (stage 3 by the value 4.0).
  - Not compared: episodes, recovery, the look-back baseline of an admission,
    the dialysis rules and the fit-exclusion window. epocakir has no episode
    or recovery concept.

### Kaplan–Meier and log-rank (for issue #78)

`tests/reference/survival.json` holds four hand-made datasets: one group with
ties and a censoring at an event time; two groups; delayed entry (left
truncation) in one and in two groups. Schema (also in the file):

- `input`: `time` (exit or event time), `status` (1 event, 0 censored),
  `entry` (delayed-entry time, at risk on (entry, time]; absent: 0), `group`.
- `survfit`: one table per group (`all` without groups), one row per distinct
  time with an event or a censoring: `nRisk`, `nEvent`, `nCensor`, `survival`,
  `stdErrLogSurvival` (survfit's `std.err`, the Greenwood standard error of
  −log S), 95 % bounds for `conf.type = "log"` and `"log-log"`.
- `test`: `logRank` (survdiff, rho = 0: chisq, df, p, observed and expected
  events; only without entry times, since survdiff takes no entry times),
  `scoreEfron` and `scoreBreslow` (coxph score tests on Surv(entry, time,
  status) ~ group). Without entry times the Breslow score test equals the
  log-rank statistic only without tied event times; survdiff uses the
  hypergeometric variance (two groups: log-rank 3.314, Breslow score 3.123).

`survival.test.ts` checks the file itself: its shape, the risk sets and
event counts against the inputs, and that `survival` is the product-limit
estimate of the stored risk sets (1e-12). Since 2026-11-22 the app has the
estimators of issue #78, and `timeToEvent.test.ts` compares them with this
file (every row of every table; the log-rank test against `survdiff`, and
under delayed entry against the Breslow score test, which has the same
variance without tied event times) and with `tests/reference/time_to_event.json`,
written by `scripts/reference/time_to_event.R` (no jsonlite needed; survival
3.5-8 in this container): medians and their log-log limits, including a
curve at exactly 0.5, the delayed-entry log-rank of the exported `r_script`
and the Aalen–Johansen estimate. All agree within 1e-10 relative. See the
[time-to-event method reference](method-algorithms/time-to-event.md#r-reproduction).

## Not covered

- The confirmed endpoints (G4/G5, 40 % and 57 % decline, kidney failure): no
  independent public implementation of the same definitions was found; they
  remain covered by unit tests only.
- Rolling and segmented OLS (golden fixtures only).
- The eGFR derivation around the formulas (age in completed years, height
  matching, formula switches), the creatinine source selection and unit
  conversion.
- The `webr-nlme` engine and the projections of the cohort models.
