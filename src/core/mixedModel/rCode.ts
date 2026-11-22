import { mixedModelFactorColumn, mixedModelFactors, mixedModelFormula, type MixedModelConfig } from './config'
import type { MixedModelResult } from './types'
import { entityKey } from './cohortModelEntity'

/** R string literal; JSON escapes are valid R escapes except \u0000 and lone
 * surrogates, which R refuses to parse, so those become U+FFFD. */
export function rStringLiteral(value: string): string {
  return JSON.stringify(value.replace(/[\0\p{Cs}]/gu, '�'))
}

/** The unambiguous `unit_key` of an exported model: `cohort` or `group:<value>`. */
export function mixedModelUnitKey(identity: { groupValue?: string } | undefined): string {
  return entityKey(identity?.groupValue === undefined ? { kind: 'cohort' } : { kind: 'group', value: identity.groupValue })
}

/** Builds `mm_data` from the vectors `mm_patient_id`, `mm_value`, `mm_time`,
 * `mm_baseline_age_centered` and `mm_<column>` per factor. Shared by the webR
 * worker and the exported R script so both build the same factors and contrasts. */
export function mixedModelDataRCode(config: MixedModelConfig): string {
  return `
    mm_data <- data.frame(
      patient_id = factor(mm_patient_id),
      value = as.numeric(mm_value),
      time_since_baseline = as.numeric(mm_time),
      baseline_age_centered = as.numeric(mm_baseline_age_centered)
    )
    ${mixedModelFactors(config).map((factor,index) => {
      const column = mixedModelFactorColumn(factor,index)
      if (factor.kind === 'numeric') return `mm_data$${column} <- as.numeric(mm_${column})`
      return `mm_levels <- c(${rStringLiteral(factor.reference!)}, sort(setdiff(unique(mm_${column}), ${rStringLiteral(factor.reference!)}), method = "radix"))
      mm_data$${column} <- factor(mm_${column}, levels = mm_levels)
      contrasts(mm_data$${column}) <- contr.treatment(mm_levels, base = 1)`
    }).join('\n')}`
}

/** The exact lme4 call the worker evaluates. */
export function lme4ModelCall(config: MixedModelConfig): string {
  return `lme4::lmer(${mixedModelFormula(config)}, data = mm_data, REML = TRUE, na.action = na.fail)`
}

/** Lines of an R script that refits every successful lme4 model of a model
 * workbook from its `model_rows` sheet with the worker's own R code. */
export function mixedModelRScript(models: readonly { entity: string; result: MixedModelResult; identity?: { groupValue?: string } }[], workbookName = 'cohort-models.xlsx', exportId = ''): string[] {
  // File names come from the app (letters, digits, dot, hyphen); anything else falls back to the default.
  const workbook = /^[\w.-]+$/.test(workbookName) ? workbookName : 'cohort-models.xlsx'
  const comment = (text: string) => text.replace(/[\r\n\0\p{Cs}]+/gu, ' ')
  const lines = [
    '# Lab Trajectory Explorer: R refit of the cohort mixed models in this workbook.',
    '# Research use only. Not for clinical decision-making.',
    '#',
    '# Save this sheet as refit.R, for example:',
    `#   x <- readxl::read_excel("${workbook}", sheet = "r_script")$line`,
    '#   x[is.na(x)] <- ""; writeLines(x, "refit.R")',
    '# then run source("refit.R") in the folder that holds the workbook. mm_workbook below',
    '# is the file name as downloaded; change it if you renamed or moved the file, or if',
    '# the browser saved it under another name (a second download can become "... (1).xlsx").',
    '# The script stops when the workbook it opens is not the export this sheet came from.',
    '# Needs lme4 and readxl.',
    '# The models are fitted with lme4: Bates D, Maechler M, Bolker B, Walker S.',
    '# Fitting linear mixed-effects models using lme4. J Stat Softw. 2015;67(1):1-48.',
    '# doi:10.18637/jss.v067.i01. In R, citation("lme4") and citation() give the',
    '# references for the installed versions.',
    '#',
    '# The rows come from the model_rows sheet exactly as they were passed to R in the',
    '# browser; factors, reference levels, contrasts and the lmer call are the same code.',
    '# Non-reference levels are ordered by sort(method = "radix"): by code point,',
    '# the same order in every locale and the same as in the browser.',
    '# Each unit is fitted in its own local() environment, so update(), anova() and',
    '# emmeans on any fit in mm_fits use that unit\'s rows. mm_fits is keyed by the',
    '# unit_key column of model_rows: "cohort" or "group:<value>".',
    '# Every model was fitted with REML = TRUE. For likelihood-ratio tests of fixed',
    '# effects refit with maximum likelihood, e.g. update(mm_fits[["cohort"]], REML = FALSE);',
    '# anova() on two lmer fits refits with ML itself.',
    '# For Satterthwaite degrees of freedom and p-values, run library(lmerTest) first',
    '# and replace lme4::lmer with lmerTest::lmer; the call is otherwise unchanged.',
    '',
    `mm_workbook <- "${workbook}"`,
    ...(/^[\w-]+$/.test(exportId) ? [
      `mm_export_id <- "${exportId}"`,
      'mm_about <- as.character(readxl::read_excel(mm_workbook, sheet = "about")$note)',
      'if (!any(mm_about == paste0("export_id: ", mm_export_id))) stop("This script belongs to export ", mm_export_id, ", but ", mm_workbook, " is another export. Set mm_workbook to the workbook this r_script sheet came from.")',
    ] : []),
    'mm_rows <- as.data.frame(readxl::read_excel(mm_workbook, sheet = "model_rows", trim_ws = FALSE))',
    'mm_coefficients <- as.data.frame(readxl::read_excel(mm_workbook, sheet = "coefficients", trim_ws = FALSE))',
    'mm_fits <- list()',
  ]
  for (const { entity, result, identity } of models) {
    const config = result.metadata.modelConfig
    lines.push('')
    if (result.status !== 'success' || result.metadata.engine !== 'webr-lme4' || !config) {
      lines.push(`# ${comment(entity)}: not refitted (status ${result.status}, engine ${result.metadata.engine ?? 'unknown'}).`)
      continue
    }
    const name = rStringLiteral(mixedModelUnitKey(identity))
    const versions = Object.entries(result.metadata.packageVersions).map(([pkg, version]) => `${pkg} ${version}`).join('; ')
    const factorNotes = mixedModelFactors(config).map((factor, index) => {
      const column = mixedModelFactorColumn(factor, index)
      const type = `${factor.kind}${factor.kindSource === 'user' ? ' (type chosen by the user)' : ' (automatic type)'}`
      const reference = factor.kind !== 'categorical' ? ''
        : `, reference ${factor.reference ?? 'unknown'}${factor.referenceSource === 'default' ? ' (default: first level among these model rows)' : ' (chosen by the user)'}`
      return `# ${column} = ${comment(factor.key)}: ${type}${comment(reference)}`
    })
    const unitLines = [
      ...factorNotes,
      `cat(${rStringLiteral(`Browser fit of ${entity}: R ${result.metadata.runtimeVersion ?? 'version unknown'} (webR); ${versions || 'package versions unknown'}`)}, "\\n")`,
      `mm_unit <- mm_rows[mm_rows$unit_key == ${name}, , drop = FALSE]`,
      'mm_patient_id <- as.character(mm_unit$patient_id)',
      'mm_value <- mm_unit$value',
      'mm_time <- mm_unit$time_since_baseline',
      'mm_baseline_age_centered <- if (is.null(mm_unit$baseline_age_centered)) NA_real_ else mm_unit$baseline_age_centered',
      ...mixedModelFactors(config).flatMap((factor, index) => {
        const column = mixedModelFactorColumn(factor, index)
        if (column === 'baseline_age_centered') return []
        return [`mm_${column} <- ${factor.kind === 'categorical' ? `as.character(mm_unit[[${rStringLiteral(column)}]])` : `mm_unit[[${rStringLiteral(column)}]]`}`]
      }),
      ...mixedModelDataRCode(config).split('\n').filter((line) => line.trim()).map((line) => line.replace(/^ {4}/, '')),
      `mm_fit <- ${lme4ModelCall(config)}`,
      'print(summary(mm_fit))',
      `mm_browser <- mm_coefficients[mm_coefficients$unit_key == ${name}, , drop = FALSE]`,
      'print(data.frame(term = mm_browser$term, browser = mm_browser$estimate, refit = unname(lme4::fixef(mm_fit)[mm_browser$term])))',
      'mm_fit',
    ]
    // local() keeps each unit's mm_data in the formula environment of its fit.
    lines.push(`# ${comment(entity)}`, `mm_fits[[${name}]] <- local({`, ...unitLines.map((line) => `  ${line}`), '})')
  }
  lines.push('', ...CENSORED_SENSITIVITY_LINES, '', 'sessionInfo()')
  return lines
}

/** A commented suggestion for a censored mixed model (decided 2026-11-22,
 * issue #73). Comments only: the script runs without the packages it names. */
export const CENSORED_SENSITIVITY_LINES: readonly string[] = [
  '# Sensitivity analysis (a suggestion; these lines are comments and need no package to run the script):',
  '# the models above leave bounded values (<x, >x) out, as every cohort model of the app does',
  '# (decided 2026-11-22). When many values of a series are bounded, leaving them out or',
  '# substituting the limit can bias slopes (Hornung RW, Reed LD. Appl Occup Environ Hyg',
  '# 1990;5:46-51. Hughes JP. Biometrics 1999;55:625-629). A censored linear mixed model uses',
  '# each bound as "below x" or "above x" instead. model_input_flags lists every measurement of',
  '# the series with its operator; reason "bound_value" alone marks a bound outside the event and',
  '# AKI windows of the column. The sketch fits the raw measurements (no time balancing, no run-in)',
  '# with a random intercept and slope per patient and no covariates; add the factors of the model',
  '# to X as mm_data builds them. Its time is years since each patient\'s first row used here,',
  '# which can differ from time_since_baseline in model_rows.',
  '#   mm_flags <- as.data.frame(readxl::read_excel(mm_workbook, sheet = "model_input_flags", trim_ws = FALSE))',
  '#   d <- mm_flags[mm_flags$unit_key == "cohort" & (mm_flags$status != "excluded" | mm_flags$reason == "bound_value"), ]',
  '#   d$day <- as.numeric(as.Date(d$date))',
  '#   d$time <- (d$day - ave(d$day, d$patient_id, FUN = min)) / 365.25',
  '#   d <- d[order(d$patient_id, d$time), ]',
  '#   # lmec (Vaida F, Liu L. J Comput Graph Stat 2009;18:797-817) takes left censoring (<x) only:',
  '#   d_left <- d[d$operator != ">", ]',
  '#   fit <- lmec::lmec(yc = d_left$value, cens = as.integer(d_left$operator == "<"),',
  '#     X = cbind(1, d_left$time), Z = cbind(1, d_left$time),',
  '#     cluster = as.integer(factor(d_left$patient_id, levels = unique(d_left$patient_id))), method = "ML")',
  '#   fit$beta  # intercept and slope per year',
  '#   # Both directions, for example with brms:',
  '#   # d$censoring <- ifelse(d$operator == "<", "left", ifelse(d$operator == ">", "right", "none"))',
  '#   # brms::brm(value | cens(censoring) ~ time + (time | patient_id), data = d)',
]
