import { mixedModelFactorColumn, mixedModelFactors, mixedModelFormula, POOLED_LEVEL, type MixedModelConfig } from './config'
import type { MixedModelResult } from './types'
import { entityKey } from './cohortModelEntity'
import { INFORMATIVE_DROPOUT_SHARE, type MixedModelDropout } from './dropout'

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
/** The lmerTest refit with Satterthwaite degrees of freedom (decision
 * `inference`, 2026-11-22). Runs only where lmerTest is installed; the
 * browser fit never loads it. */
export function lmerTestLines(config: MixedModelConfig): string[] {
  return [
    '# Inference (decision of 2026-11-22): lmerTest with Satterthwaite degrees of freedom.',
    'if (requireNamespace("lmerTest", quietly = TRUE)) {',
    `  mm_fit_satterthwaite <- ${lme4ModelCall(config).replace('lme4::lmer(', 'lmerTest::lmer(')}`,
    '  # Omnibus F test per model term: all levels of a factor in one test (type III). For a',
    '  # factor with level and slope, the time_since_baseline:<factor> row tests the slope difference.',
    '  print(anova(mm_fit_satterthwaite, type = "III", ddf = "Satterthwaite"))',
    '  # Contrasts against the reference level: exploratory, unadjusted for multiple comparisons.',
    '  mm_contrasts <- summary(mm_fit_satterthwaite, ddf = "Satterthwaite")$coefficients',
    '  print(mm_contrasts)',
    '  # Optional Holm adjustment of the contrast p-values (all terms but the intercept):',
    '  # print(p.adjust(mm_contrasts[-1, "Pr(>|t|)"], method = "holm"))',
    '} else message("lmerTest is not installed; install.packages(\"lmerTest\") adds the Satterthwaite F tests.")',
  ]
}

/** Commented joint-model suggestion when more than 10 % of the unit reached
 * KRT or died within follow-up (decision `dropout`, 2026-11-22). */
export function jointModelSuggestionLines(config: MixedModelConfig, dropout: MixedModelDropout | undefined, unitKey: string): string[] {
  if (!dropout?.informative) return []
  const all = dropout.counts[0]
  const events = all.krt + (all.death ?? 0)
  const fixed = mixedModelFormula(config).replace(/ \+ \(1( \+ time_since_baseline)? \| patient_id\)$/, '')
  const random = config.randomEffects === 'intercept' ? '~ 1 | patient_id' : '~ time_since_baseline | patient_id'
  return [
    `# Dropout: ${events} of ${all.patients} patients (${(all.krtOrDeathShare * 100).toFixed(1)} %) reached kidney replacement therapy${dropout.deathRecorded ? ' or died' : ''} within`,
    `# follow-up, more than ${Math.round(INFORMATIVE_DROPOUT_SHARE * 100)} % (a rule of this tool). When dropout depends on the course of the outcome,`,
    '# the slope above can be biased. A joint model of the outcome and the time to that event is a',
    '# sensitivity analysis to consider, for example with JMbayes2 (a sketch, not run; needs nlme,',
    '# survival and JMbayes2; add factors to the Cox model as needed):',
    '#   mm_dp <- as.data.frame(readxl::read_excel(mm_workbook, sheet = "dropout_patients", trim_ws = FALSE))',
    `#   mm_dp <- mm_dp[mm_dp$unit_key == ${rStringLiteral(unitKey)}, , drop = FALSE]`,
    '#   mm_dp$event <- as.integer(mm_dp$reason %in% c("krt", "death"))',
    `#   mm_lme <- nlme::lme(${fixed}, random = ${random}, data = mm_data, method = "REML")`,
    '#   mm_cox <- survival::coxph(survival::Surv(years_to_end, event) ~ 1, data = mm_dp)',
    '#   mm_joint <- JMbayes2::jm(mm_cox, mm_lme, time_var = "time_since_baseline", id_var = "patient_id")',
    '#   summary(mm_joint)',
  ]
}

export function mixedModelRScript(models: readonly { entity: string; result: MixedModelResult; identity?: { groupValue?: string }; dropout?: MixedModelDropout }[], workbookName = 'cohort-models.xlsx', exportId = ''): string[] {
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
    '# Where lmerTest is installed, each unit is also refitted with lmerTest::lmer (the same',
    '# call): anova() then gives an omnibus F test per factor with Satterthwaite degrees of',
    '# freedom, and the coefficient table gives t tests of the contrasts against the reference',
    '# level, which are exploratory and unadjusted. A Holm adjustment is a commented line.',
    '# The app itself reports Wald intervals only. lmerTest: Kuznetsova A, Brockhoff PB,',
    '# Christensen RHB. J Stat Softw. 2017;82(13):1-26. doi:10.18637/jss.v082.i13.',
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
  for (const { entity, result, identity, dropout } of models) {
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
      // Levels below the minimum per level, pooled before R saw the rows (decision `genomin`).
      const pooled = (result.metadata.preparation?.levelPooling ?? []).filter(item => item.column === column && item.action === 'pooled').map(item => item.level)
      const pooling = pooled.length ? `; levels ${pooled.join(', ')} pooled into "${POOLED_LEVEL}"` : ''
      return `# ${column} = ${comment(factor.key)}: ${type}${comment(reference)}${comment(pooling)}`
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
      ...lmerTestLines(config),
      ...jointModelSuggestionLines(config, dropout, mixedModelUnitKey(identity)),
      'mm_fit',
    ]
    // local() keeps each unit's mm_data in the formula environment of its fit.
    lines.push(`# ${comment(entity)}`, `mm_fits[[${name}]] <- local({`, ...unitLines.map((line) => `  ${line}`), '})')
  }
  lines.push('', 'sessionInfo()')
  return lines
}
