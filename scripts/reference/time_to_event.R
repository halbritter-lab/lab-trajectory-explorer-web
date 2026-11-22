# Reference values for the time-to-event area (issue #78): median and its
# log-log interval (survfit, quantile), the log-rank test on delayed-entry
# risk sets (the function of the app's r_script, cross-checked against
# survdiff where there is no delayed entry), and the Aalen-Johansen estimate
# (multi-state survfit). Writes tests/reference/time_to_event.json.
# Run from the repository root: Rscript scripts/reference/time_to_event.R
suppressPackageStartupMessages({ library(survival); library(jsonlite) })

logrank_lt <- function(entry, exit, event, group) {
  g <- factor(group); k <- nlevels(g)
  O <- E <- numeric(k); V <- matrix(0, k, k)
  for (t in sort(unique(exit[event]))) {
    r <- entry < t & t <= exit
    n_g <- tabulate(as.integer(g[r]), k); n <- sum(n_g)
    d_g <- tabulate(as.integer(g[event & exit == t]), k); d <- sum(d_g)
    O <- O + d_g; E <- E + d * n_g / n
    if (n > 1) V <- V + d * (n - d) / (n - 1) * (diag(n_g / n, k) - outer(n_g / n, n_g / n))
  }
  used <- head(which(diag(V) > 1e-12), -1)
  u <- (O - E)[used]
  chisq <- drop(t(u) %*% solve(V[used, used, drop = FALSE], u))
  list(observed = O, expected = E, chisq = chisq, df = length(used), p = pchisq(chisq, length(used), lower.tail = FALSE))
}

num <- function(x) ifelse(is.na(x), NA, x)

km_case <- function(name, entry, exit, status, group) {
  d <- data.frame(entry, exit, status, group)
  fit <- survfit(Surv(entry, exit, status == 1) ~ group, data = d, conf.type = "log-log")
  q <- quantile(fit, probs = 0.5)
  groups <- levels(factor(group))
  medians <- lapply(seq_along(groups), function(i) list(group = groups[i], median = num(q$quantile[i]), lower = num(q$lower[i]), upper = num(q$upper[i])))
  out <- list(name = name, input = list(entry = entry, exit = exit, status = status, group = group), medians = medians)
  if (length(groups) > 1) {
    lr <- logrank_lt(entry, exit, status == 1, group)
    out$logRank <- list(observed = lr$observed, expected = lr$expected, chisq = lr$chisq, df = lr$df, p = lr$p)
    if (all(entry == 0)) out$survdiffChisq <- survdiff(Surv(exit, status == 1) ~ group, data = d)$chisq
  }
  if (any(status == 2)) {
    d$state <- factor(status, levels = 0:2, labels = c("censored", "endpoint", "death"))
    d$id <- seq_len(nrow(d))
    aj <- survfit(Surv(entry, exit, state) ~ 1, data = d, id = id)
    out$aalenJohansen <- list(time = aj$time, endpoint = aj$pstate[, which(aj$states == "endpoint")], death = aj$pstate[, which(aj$states == "death")])
  }
  out
}

cases <- list(
  km_case("right_censored_two_groups",
    rep(0, 12), c(1, 3, 4, 6, 7, 9, 2, 2, 5, 8, 10, 11), c(1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0), rep(c("A", "B"), each = 6)),
  km_case("delayed_entry_two_groups",
    c(0, 2, 3, 1, 5, 0, 1, 4, 2, 6), c(4, 5, 6, 3, 8, 7, 9, 6, 5, 10), c(1, 0, 1, 1, 1, 1, 0, 1, 1, 0), rep(c("A", "B"), each = 5)),
  km_case("median_flat_at_half",
    rep(0, 6), c(1, 2, 3, 4, 5, 6), c(1, 0, 1, 0, 1, 0), rep("all", 6)),
  km_case("competing_death",
    rep(0, 5), c(1, 2, 3, 4, 5), c(1, 2, 1, 0, 2), rep("all", 5))
)

doc <- list(
  about = "Median (survfit quantile, conf.type log-log), log-rank on delayed-entry risk sets (logrank_lt, the function of the app's r_script; survdiff where all entries are 0) and Aalen-Johansen (multi-state survfit) for issue #78. Research use only.",
  generatedBy = "scripts/reference/time_to_event.R",
  environment = list(R = paste(R.version$major, R.version$minor, sep = "."), survival = as.character(packageVersion("survival"))),
  cases = cases
)
writeLines(toJSON(doc, auto_unbox = TRUE, digits = NA, pretty = TRUE, na = "null"), "tests/reference/time_to_event.json")
