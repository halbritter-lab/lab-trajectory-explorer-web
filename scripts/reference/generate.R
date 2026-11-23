# Regenerates every stored native-R reference case in tests/reference/*.json
# (issue #79). Research use only. Run from the repository root through
# `pnpm reference:generate` (scripts/reference/generate.sh), which installs the
# pinned packages first when asked to and writes the mixed-model inputs.
#
# Each output file records the R version and the version of every package it
# used. What is compared with what, and with which tolerance, is in
# docs/reference-comparisons.md.
options(warn = 1, digits = 15)
lib <- Sys.getenv("R_REFERENCE_LIB", file.path(Sys.getenv("HOME"), ".cache", "lte-r-reference"))
.libPaths(c(lib, .libPaths()))
suppressPackageStartupMessages({
  library(jsonlite)
})
OUT <- "tests/reference"

versions <- function(pkgs) {
  list(
    R = paste(R.version$major, R.version$minor, sep = "."),
    platform = R.version$platform,
    packages = as.list(setNames(vapply(pkgs, function(p) as.character(packageVersion(p)), ""), pkgs))
  )
}

num <- function(x) if (length(x) == 0 || is.na(x) || !is.finite(x)) NULL else unname(as.numeric(x))

write_reference <- function(file, about, pkgs, cases, extra = list()) {
  body <- c(list(about = about, generatedBy = "scripts/reference/generate.R",
                 generated = format(Sys.Date()), environment = versions(pkgs)), extra, list(cases = cases))
  writeLines(toJSON(body, auto_unbox = TRUE, null = "null", na = "null", digits = NA, pretty = 1),
             file.path(OUT, file))
  cat("Wrote", file.path(OUT, file), "\n")
}

# ---------------------------------------------------------------------------
# Mixed models: the inputs the app sends to webR, fitted with native lme4.
# ---------------------------------------------------------------------------
mixed_models <- function() {
  suppressPackageStartupMessages({ library(lme4); library(lmerTest) })
  input <- fromJSON(file.path(OUT, "inputs", "mixed_models.json"), simplifyVector = FALSE)
  cases <- lapply(input$cases, function(item) {
    env <- new.env(parent = globalenv())
    rows <- item$rows
    field <- function(name) vapply(rows, function(r) if (is.null(r[[name]])) NA_real_ else as.numeric(r[[name]]), 0)
    # The vectors the worker binds (bindRows in src/core/mixedModel/webr.worker.ts).
    env$mm_patient_id <- vapply(rows, function(r) r$patient_id, "")
    env$mm_value <- field("value")
    env$mm_time <- field("time_since_baseline")
    env$mm_baseline_age_centered <- field("baseline_age_centered")
    factors <- item$config$factors
    # Without factors, the legacy covariate baseline_age reads baseline_age_centered,
    # which is bound above (mixedModelFactorColumn in src/core/mixedModel/config.ts).
    if (!is.null(factors)) {
      for (i in seq_along(factors)) {
        column <- if (identical(factors[[i]]$key, "baseline_age")) "baseline_age_centered" else sprintf("factor_%d_", i - 1)
        values <- lapply(rows, function(r) r$factorValues[[column]])
        assign(paste0("mm_", column),
               if (factors[[i]]$kind == "categorical") vapply(values, function(v) if (is.null(v)) NA_character_ else as.character(v), "")
               else vapply(values, function(v) if (is.null(v)) NA_real_ else as.numeric(v), 0), envir = env)
      }
    }
    eval(parse(text = item$dataRCode), envir = env)
    warnings <- character()
    fit <- withCallingHandlers(eval(parse(text = item$modelCall), envir = env),
                               warning = function(w) { warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning") })
    fixed <- fixef(fit)
    vc <- as.matrix(vcov(fit))
    wald <- confint(fit, parm = names(fixed), method = "Wald")
    varcorr <- as.data.frame(VarCorr(fit))
    pv <- varcorr[varcorr$grp == "patient_id", ]
    pick <- function(mask) num(pv$sdcor[which(mask)[1]])
    satterthwaite <- summary(lmerTest::as_lmerModLmerTest(fit), ddf = "Satterthwaite")$coefficients
    messages <- fit@optinfo$conv$lme4$messages
    list(
      name = item$name,
      formula = item$formula,
      nObservations = nobs(fit),
      nPatients = unname(ngrps(fit)[["patient_id"]]),
      converged = is.null(fit@optinfo$conv$opt) || identical(as.numeric(fit@optinfo$conv$opt), 0),
      singular = isSingular(fit, tol = 1e-4),
      warnings = I(unique(c(warnings, if (is.null(messages)) character() else messages))),
      optimizer = fit@optinfo$optimizer,
      remlCriterion = num(-2 * as.numeric(logLik(fit))),
      fixedEffectTerms = lapply(names(fixed), function(term) list(
        term = term,
        estimate = num(fixed[[term]]),
        standardError = num(sqrt(vc[term, term])),
        waldInterval = c(num(wald[term, 1]), num(wald[term, 2])),
        satterthwaiteDf = num(satterthwaite[term, "df"]),
        satterthwaiteP = num(satterthwaite[term, "Pr(>|t|)"])
      )),
      randomEffects = list(
        interceptSd = pick(pv$var1 == "(Intercept)" & is.na(pv$var2)),
        slopeSd = pick(pv$var1 == "time_since_baseline" & is.na(pv$var2)),
        interceptSlopeCorrelation = pick(!is.na(pv$var2))
      ),
      residualSd = num(sigma(fit))
    )
  })
  write_reference("mixed_models.json",
    "Native R lme4 fits of tests/reference/inputs/mixed_models.json (the model rows, R data code and lmer call the app sends to webR). Synthetic data. Research use only.",
    c("lme4", "Matrix", "nloptr", "minqa", "lmerTest", "jsonlite"), cases)
}

# ---------------------------------------------------------------------------
# OLS and Theil-Sen on the golden series.
# ---------------------------------------------------------------------------
golden_series <- function() {
  ols <- fromJSON("tests/goldens/ols.json", simplifyVector = FALSE)
  ts <- fromJSON("tests/goldens/theil_sen.json", simplifyVector = FALSE)
  c(lapply(seq_along(ols), function(i) list(source = "ols.json", index = i - 1, name = sprintf("ols_%d", i - 1),
                                             x = as.numeric(unlist(ols[[i]]$xYears)), y = as.numeric(unlist(ols[[i]]$values)))),
    lapply(seq_along(ts), function(i) list(source = "theil_sen.json", index = i - 1, name = ts[[i]]$name,
                                           x = as.numeric(unlist(ts[[i]]$xYears)), y = as.numeric(unlist(ts[[i]]$values)))))
}

ols_cases <- function() {
  cases <- lapply(golden_series(), function(s) {
    out <- list(source = s$source, index = s$index, name = s$name, x = I(s$x), y = I(s$y))
    if (length(s$x) < 2 || length(unique(s$x)) < 2) return(c(out, list(fitted = FALSE)))
    fit <- lm(y ~ x, data = data.frame(x = s$x, y = s$y))
    co <- summary(fit)$coefficients
    ci <- suppressWarnings(confint(fit, "x", level = 0.95))
    c(out, list(
      fitted = TRUE,
      intercept = num(coef(fit)[["(Intercept)"]]),
      slope = num(coef(fit)[["x"]]),
      slopeSe = if ("x" %in% rownames(co) && ncol(co) >= 2) num(co["x", 2]) else NULL,
      r2 = num(summary(fit)$r.squared),
      slopeCi95 = c(num(ci[1, 1]), num(ci[1, 2])),
      dfResidual = fit$df.residual
    ))
  })
  write_reference("ols.json",
    "stats::lm(y ~ x) on every series of tests/goldens/ols.json and tests/goldens/theil_sen.json: coefficients, slope standard error, R squared and the t-based 95% slope interval (confint). Research use only.",
    c("stats"), cases)
}

theil_sen_cases <- function() {
  suppressPackageStartupMessages({ library(mblm); library(zyp) })
  cases <- lapply(golden_series(), function(s) {
    out <- list(source = s$source, index = s$index, name = s$name, x = I(s$x), y = I(s$y))
    if (length(s$x) < 3 || length(unique(s$x)) < 2) return(c(out, list(fitted = FALSE)))
    d <- data.frame(x = s$x, y = s$y)
    m <- mblm::mblm(y ~ x, dataframe = d, repeated = FALSE)
    m_ci <- tryCatch(suppressWarnings(confint(m, level = 0.95)), error = function(e) NULL)
    z <- zyp::zyp.sen(y ~ x, d)
    z_ci <- tryCatch(suppressWarnings(confint(z, level = 0.95)), error = function(e) NULL)
    pairs <- combn(length(s$x), 2)
    slopes <- apply(pairs, 2, function(p) { dx <- s$x[p[2]] - s$x[p[1]]; if (dx == 0) NA else (s$y[p[2]] - s$y[p[1]]) / dx })
    c(out, list(
      fitted = TRUE,
      pairwiseSlopeMedian = num(median(slopes, na.rm = TRUE)),
      nPairwiseSlopes = sum(!is.na(slopes)),
      # Slope: median of the pairwise slopes; intercept: median(y - slope * x);
      # interval: Wilcoxon signed-rank interval of the pairwise slopes (confint.mblm).
      mblm = list(slope = num(coef(m)[["x"]]), intercept = num(coef(m)[["(Intercept)"]]),
                  slopeCi95 = if (is.null(m_ci)) NULL else c(num(m_ci["x", 1]), num(m_ci["x", 2]))),
      # Slope: median of the finite pairwise slopes; intercept: median(y - slope * x);
      # interval: Sen's normal approximation with Kendall's variance of S,
      # sorted slopes at 1-based ranks round((N -/+ C)/2) (confint.zyp).
      zyp = list(slope = num(coef(z)[["x"]]), intercept = num(coef(z)[["Intercept"]]),
                 slopeCi95 = if (is.null(z_ci)) NULL else c(num(z_ci[2, 1]), num(z_ci[2, 2]))),
      # The app's intercept convention, computed in R from mblm's slope.
      interceptMedianYMinusSlopeMedianX = num(median(s$y) - coef(m)[["x"]] * median(s$x))
    ))
  })
  write_reference("theil_sen.json",
    "Theil-Sen on every series of tests/goldens/ols.json and tests/goldens/theil_sen.json with mblm::mblm(repeated = FALSE) and zyp::zyp.sen with their confint methods, plus the median of the pairwise slopes (pairs with equal x left out) and the intercept median(y) - slope * median(x) computed in R. Research use only.",
    c("mblm", "zyp", "Kendall", "stats"), cases)
}

# ---------------------------------------------------------------------------
# Kaplan-Meier and log-rank (for issue #78): small hand-made datasets.
# ---------------------------------------------------------------------------
survival_cases <- function() {
  suppressPackageStartupMessages(library(survival))
  datasets <- list(
    list(name = "single_group_ties_and_censoring",
         description = "One group; an event and a censoring at the same time (time 6: the censored subject is at risk at 6).",
         time = c(1, 2, 2, 3, 4, 4, 5, 6, 6, 8, 9, 12), status = c(1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0),
         entry = NULL, group = NULL),
    list(name = "two_groups",
         description = "Two groups A and B; log-rank with survdiff (rho = 0).",
         time = c(2, 3, 4, 5, 6, 7, 9, 10, 12, 15, 1, 2, 2, 3, 4, 5, 6, 8, 8, 9),
         status = c(1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1),
         entry = NULL, group = c(rep("A", 10), rep("B", 10))),
    list(name = "delayed_entry_one_group",
         description = "Left truncation: Surv(entry, time, status); a subject is at risk on (entry, time].",
         time = c(3, 5, 6, 7, 8, 10, 11, 12), status = c(1, 1, 0, 1, 1, 0, 1, 0),
         entry = c(0, 0, 2, 4, 1, 6, 3, 9), group = NULL),
    list(name = "delayed_entry_two_groups",
         description = "Left truncation in two groups; the log-rank statistic is the coxph score test on Surv(entry, time, status) ~ group (survdiff does not take entry times).",
         time = c(4, 6, 7, 9, 10, 12, 14, 3, 5, 5, 8, 9, 11, 13),
         status = c(1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1),
         entry = c(0, 1, 2, 0, 5, 3, 8, 0, 0, 2, 4, 1, 6, 7), group = c(rep("A", 7), rep("B", 7)))
  )
  cases <- lapply(datasets, function(d) {
    df <- data.frame(time = d$time, status = d$status)
    if (!is.null(d$entry)) df$entry <- d$entry
    if (!is.null(d$group)) df$group <- d$group
    surv <- if (is.null(d$entry)) Surv(df$time, df$status) else Surv(df$entry, df$time, df$status)
    rhs <- if (is.null(d$group)) "1" else "group"
    f <- as.formula(paste("surv ~", rhs))
    km <- survfit(f, data = df, conf.type = "log")
    km_ll <- survfit(f, data = df, conf.type = "log-log")
    split_strata <- function(fit) {
      if (is.null(fit$strata)) return(list(all = seq_along(fit$time)))
      ends <- cumsum(fit$strata); starts <- c(1, head(ends, -1) + 1)
      setNames(lapply(seq_along(ends), function(i) starts[i]:ends[i]), sub("^group=", "", names(fit$strata)))
    }
    idx <- split_strata(km)
    tables <- lapply(names(idx), function(g) {
      i <- idx[[g]]
      list(group = g, time = I(km$time[i]), nRisk = I(km$n.risk[i]), nEvent = I(km$n.event[i]), nCensor = I(km$n.censor[i]),
           survival = I(km$surv[i]), stdErrLogSurvival = I(km$std.err[i]),
           lowerLog = I(km$lower[i]), upperLog = I(km$upper[i]),
           lowerLogLog = I(km_ll$lower[i]), upperLogLog = I(km_ll$upper[i]))
    })
    test <- NULL
    if (!is.null(d$group)) {
      if (is.null(d$entry)) {
        sd <- survdiff(Surv(time, status) ~ group, data = df)
        test <- list(method = "survdiff (log-rank, rho = 0)", chisq = num(sd$chisq), df = length(sd$n) - 1,
                     p = num(pchisq(sd$chisq, length(sd$n) - 1, lower.tail = FALSE)),
                     observed = I(as.numeric(sd$obs)), expected = I(as.numeric(sd$exp)))
      }
      cx <- coxph(Surv(if (is.null(d$entry)) rep(0, nrow(df)) else entry, time, status) ~ group, data = df, ties = "efron")
      score <- list(method = "coxph score test (Efron ties)", chisq = num(cx$score), df = 1,
                    p = num(pchisq(cx$score, 1, lower.tail = FALSE)))
      cxb <- coxph(Surv(if (is.null(d$entry)) rep(0, nrow(df)) else entry, time, status) ~ group, data = df, ties = "breslow")
      scoreBreslow <- list(method = "coxph score test (Breslow ties; without entry times it equals the survdiff log-rank statistic only when no event times are tied, since survdiff uses the hypergeometric variance)",
                           chisq = num(cxb$score), df = 1, p = num(pchisq(cxb$score, 1, lower.tail = FALSE)))
      test <- list(logRank = test, scoreEfron = score, scoreBreslow = scoreBreslow)
    }
    list(name = d$name, description = d$description,
         input = list(time = I(d$time), status = I(d$status), entry = if (is.null(d$entry)) NULL else I(d$entry),
                      group = if (is.null(d$group)) NULL else I(d$group)),
         survfit = tables, test = test)
  })
  write_reference("survival.json",
    "Kaplan-Meier (survival::survfit) and log-rank (survival::survdiff; with entry times the coxph score test) on small hand-made datasets, for the comparison in issue #78. Research use only.",
    c("survival"), cases,
    extra = list(schema = list(
      input = "time: exit or event time; status: 1 event, 0 censored; entry: delayed-entry time (absent: 0), at risk on (entry, time]; group: group label (absent: one group)",
      survfit = "one table per group (group 'all' without groups), one row per distinct time with an event or a censoring: nRisk, nEvent, nCensor, survival (Kaplan-Meier), stdErrLogSurvival (Greenwood standard error of -log S, survfit's std.err), lowerLog/upperLog (conf.type 'log', 95%), lowerLogLog/upperLogLog (conf.type 'log-log', 95%)",
      test = "logRank: survdiff chisq, df, p, observed and expected events per group (only without entry times); scoreEfron, scoreBreslow: coxph score tests on Surv(entry, time, status) ~ group"
    )))
}

args <- commandArgs(trailingOnly = TRUE)
parts <- list(mixed = mixed_models, ols = ols_cases, theilsen = theil_sen_cases, survival = survival_cases)
if (file.exists("scripts/reference/generate_kidney.R")) {
  source("scripts/reference/generate_kidney.R", local = TRUE)
  parts$egfr <- egfr_cases
  parts$aki <- aki_cases
}
selected <- if (length(args)) args else names(parts)
for (name in selected) parts[[name]]()
