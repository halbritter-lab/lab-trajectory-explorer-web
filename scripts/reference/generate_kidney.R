# eGFR and KDIGO AKI reference cases (issue #79, moved from #34), sourced by
# scripts/reference/generate.R. Research use only.

# ---------------------------------------------------------------------------
# eGFR: the app's equations against the R packages egfr and kidney.epi.
# ---------------------------------------------------------------------------
egfr_cases <- function() {
  suppressPackageStartupMessages({ library(egfr); library(kidney.epi) })
  scr <- c(0.3, 0.5, 0.7, 0.9, 1.0, 1.3, 2.0, 4.5)
  adult_ages <- c(18, 25, 26, 40, 41, 50, 70, 90)
  child_ages <- c(2, 5, 8, 11, 12, 14, 15, 16, 17, 18, 21, 25)
  # A plausible height per age (cm); only its use in the equations matters.
  height_for <- function(age) c(`2` = 88, `5` = 110, `8` = 128, `11` = 145, `12` = 150, `14` = 162,
                                `15` = 167, `16` = 170, `17` = 172, `18` = 173, `21` = 174, `25` = 175)[[as.character(age)]]
  kepi <- function(f, ...) {
    # kidney.epi rounds to two decimals and returns NA (with a message) outside its age range.
    suppressWarnings(suppressMessages(tryCatch(as.numeric(f(...)), error = function(e) NA_real_)))
  }
  sex_kepi <- function(sex) if (sex == "m") "Male" else "Female"
  sex_egfr <- function(sex) if (sex == "m") "male" else "female"
  adults <- list()
  for (s in c("m", "w")) for (a in adult_ages) for (cr in scr) {
    adults[[length(adults) + 1]] <- list(
      scrMgdl = cr, ageYears = a, sex = s,
      egfr = list(
        ckdEpi2021 = num(egfr_ckdepi_cr_2021(cr, a, sex_egfr(s))),
        ckdEpi2009 = num(egfr_ckdepi_cr_2009(cr, a, sex_egfr(s))),
        mdrd4 = num(egfr_mdrd(cr, a, sex_egfr(s))),
        ekfc = num(egfr_ekfc_cr(cr, a, sex_egfr(s)))
      ),
      kidneyEpi = list(
        ckdEpi2021 = num(kepi(egfr.ckdepi.cr.2021, creatinine = cr, age = a, sex = sex_kepi(s), creatinine_units = "mg/dl")),
        ckdEpi2009 = num(kepi(egfr.ckdepi.cr.2009, creatinine = cr, age = a, sex = sex_kepi(s), ethnicity = "none", creatinine_units = "mg/dl")),
        mdrd4 = num(kepi(egfr.mdrd4, creatinine = cr, age = a, sex = sex_kepi(s), ethnicity = "none", creatinine_units = "mg/dl", creatinine_method = "IDMS")),
        ekfc = num(kepi(egfr.ekfc.cr, creatinine = cr, age = a, sex = sex_kepi(s), creatinine_units = "mg/dl"))
      )
    )
  }
  children <- list()
  for (s in c("m", "w")) for (a in child_ages) for (cr in c(0.2, 0.3, 0.5, 0.7, 1.0, 1.5)) {
    h <- height_for(a)
    children[[length(children) + 1]] <- list(
      scrMgdl = cr, ageYears = a, sex = s, heightCm = h,
      egfr = list(
        ekfc = num(egfr_ekfc_cr(cr, a, sex_egfr(s))),
        ckidU25 = num(egfr_ckid_u25_cr(cr, a, sex_egfr(s), h)),
        bedsideSchwartz = num(egfr_schwartz(cr, h))
      ),
      kidneyEpi = list(
        ekfc = num(kepi(egfr.ekfc.cr, creatinine = cr, age = a, sex = sex_kepi(s), creatinine_units = "mg/dl")),
        ckidU25 = num(kepi(egfr.ckid_u25.cr, creatinine = cr, age = a, sex = sex_kepi(s), height_cm = h, creatinine_units = "mg/dl")),
        bedsideSchwartz = num(kepi(egfr.schwartz.cr, creatinine = cr, age = a, sex = sex_kepi(s), height_cm = h, creatinine_units = "mg/dl", equation_type = "classic"))
      )
    )
  }
  write_reference("egfr.json",
    "eGFR equations from the R packages egfr (full precision) and kidney.epi (rounded to two decimals by the package; its bedside Schwartz is equation_type 'classic', 0.413 x height / creatinine) on a grid of creatinine (mg/dl), age (whole years) and sex, for comparison with src/core/domains/nephrology/egfr/formulas.ts. CKD-EPI 2009 and MDRD without the race coefficient; MDRD with the IDMS-traceable constant 175. Research use only.",
    c("egfr", "kidney.epi"), list(adults = adults, children = children))
}

# ---------------------------------------------------------------------------
# KDIGO AKI staging against epocakir.
# ---------------------------------------------------------------------------
aki_cases <- function() {
  suppressPackageStartupMessages({ library(epocakir); library(units) })
  stage_number <- function(f) c(`No AKI` = 0L, `AKI Stage 1` = 1L, `AKI Stage 2` = 2L, `AKI Stage 3` = 3L)[as.character(f)]
  # (1) Staging of one value against a given baseline: epocakir::aki_bCr.
  pairs <- list()
  for (b in c(0.5, 1.0, 1.5, 2.0)) for (f in c(1.0, 1.2, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0)) pairs[[length(pairs) + 1]] <- c(b, b * f)
  pairs <- c(pairs, list(c(1.0, 1.3), c(1.0, 1.29), c(2.5, 3.99), c(2.5, 4.0), c(3.5, 4.0), c(0.8, 1.1)))
  staging <- lapply(pairs, function(p) list(
    baselineMgdl = p[1], valueMgdl = p[2],
    epocakirStage = unname(stage_number(aki_bCr(set_units(p[2], "mg/dl"), set_units(p[1], "mg/dl"))))
  ))
  # (2) Series: epocakir::aki_SCr (rise of at least 0.3 mg/dl within 48 hours) and
  # aki_bCr per value against a given baseline (the seven-day minimum of the series).
  series <- list(
    list(name = "rise_0_3_next_day", comparison = "match",
         points = list(c("2020-01-01T00:00:00Z", 1.0), c("2020-01-02T00:00:00Z", 1.35))),
    list(name = "rise_within_one_day_with_times", comparison = "match",
         points = list(c("2020-01-01T08:00:00Z", 1.0), c("2020-01-01T20:00:00Z", 1.4))),
    list(name = "no_aki", comparison = "match",
         points = list(c("2020-01-01T00:00:00Z", 1.0), c("2020-01-02T00:00:00Z", 1.1), c("2020-01-03T00:00:00Z", 1.2), c("2020-01-04T00:00:00Z", 1.25))),
    list(name = "exactly_48_hours", comparison = "difference: 48-hour boundary",
         points = list(c("2020-01-01T00:00:00Z", 1.0), c("2020-01-03T00:00:00Z", 1.4))),
    list(name = "rise_over_two_days_in_steps", comparison = "difference: 48-hour boundary",
         points = list(c("2020-01-01T00:00:00Z", 1.0), c("2020-01-02T00:00:00Z", 1.2), c("2020-01-03T00:00:00Z", 1.4))),
    list(name = "relative_rise_within_7_days", comparison = "difference: 7-day criterion needs a baseline in epocakir", baselineMgdl = 1.0,
         points = list(c("2020-01-01T00:00:00Z", 1.0), c("2020-01-06T00:00:00Z", 1.6))),
    list(name = "doubling_within_48_hours", comparison = "difference: staging without a baseline", baselineMgdl = 1.0,
         points = list(c("2020-01-01T00:00:00Z", 1.0), c("2020-01-02T00:00:00Z", 2.1))),
    list(name = "value_reaching_4", comparison = "difference: stage 3 by value 4.0", baselineMgdl = 3.5,
         points = list(c("2020-01-01T00:00:00Z", 3.5), c("2020-01-02T00:00:00Z", 4.1)))
  )
  series_out <- lapply(series, function(s) {
    dttm <- as.POSIXct(vapply(s$points, `[[`, "", 1), format = "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
    scr <- as.numeric(vapply(s$points, `[[`, "", 2))
    # aki_SCr stops with an error when no two values lie less than 48 hours
    # apart (epocakir 1.0.0); the error is recorded instead of a stage.
    error <- NULL
    run <- function(expr) tryCatch(expr, error = function(e) { error <<- conditionMessage(e); NULL })
    by_scr <- run(stage_number(aki_SCr(set_units(scr, "mg/dl"), dttm, rep("pt", length(scr)))))
    with_baseline <- if (is.null(s$baselineMgdl)) NULL else
      unname(stage_number(aki_bCr(set_units(scr, "mg/dl"), set_units(rep(s$baselineMgdl, length(scr)), "mg/dl"))))
    list(name = s$name, comparison = s$comparison,
         points = lapply(seq_along(scr), function(i) list(datetime = s$points[[i]][1], valueMgdl = scr[i])),
         baselineMgdl = s$baselineMgdl,
         epocakirStageBySCr = if (is.null(by_scr)) NULL else I(unname(by_scr)),
         epocakirError = error,
         epocakirStageByBaseline = if (is.null(with_baseline)) NULL else I(with_baseline))
  })
  write_reference("aki.json",
    "KDIGO AKI staging by epocakir: aki_bCr (one value against a given baseline) and, for short series, aki_SCr (rise of at least 0.3 mg/dl within 48 hours, per value) and aki_bCr per value against the series' given baseline. For comparison with src/core/domains/nephrology/aki/kdigo.ts; the differences are documented in docs/reference-comparisons.md, not aligned. Research use only.",
    c("epocakir", "units", "dplyr"), list(staging = staging, series = series_out))
}
