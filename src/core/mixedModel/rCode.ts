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
      return `mm_levels <- c(${rStringLiteral(factor.reference!)}, sort(setdiff(unique(mm_${column}), ${rStringLiteral(factor.reference!)})))
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
export function mixedModelRScript(models: readonly { entity: string; result: MixedModelResult; identity?: { groupValue?: string } }[]): string[] {
  const comment = (text: string) => text.replace(/[\r\n\0\p{Cs}]+/gu, ' ')
  const lines = [
    '# Lab Trajectory Explorer: R refit of the cohort mixed models in this workbook.',
    '# Research use only. Not for clinical decision-making.',
    '#',
    '# Save this sheet as refit.R, for example:',
    '#   x <- readxl::read_excel("cohort-models.xlsx", sheet = "r_script")$line',
    '#   x[is.na(x)] <- ""; writeLines(x, "refit.R")',
    '# then set mm_workbook below and run source("refit.R"). Needs lme4 and readxl.',
    '#',
    '# The rows come from the model_rows sheet exactly as they were passed to R in the',
    '# browser; factors, reference levels, contrasts and the lmer call are the same code.',
    '# Non-reference levels are ordered by sort(); another locale may order them, and',
    '# so the coefficients, differently without changing any estimate.',
    '# Each unit is fitted in its own local() environment, so update(), anova() and',
    '# emmeans on any fit in mm_fits use that unit\'s rows. mm_fits is keyed by the',
    '# unit_key column of model_rows: "cohort" or "group:<value>".',
    '# Every model was fitted with REML = TRUE. For likelihood-ratio tests of fixed',
    '# effects refit with maximum likelihood, e.g. update(mm_fits[["cohort"]], REML = FALSE);',
    '# anova() on two lmer fits refits with ML itself.',
    '# For Satterthwaite degrees of freedom and p-values, run library(lmerTest) first',
    '# and replace lme4::lmer with lmerTest::lmer; the call is otherwise unchanged.',
    '',
    'mm_workbook <- "cohort-models.xlsx"',
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
    const unitLines = [
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
  lines.push('', 'sessionInfo()')
  return lines
}
