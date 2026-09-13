export type MixedModelTimeAxis = 'time_since_baseline' | 'age'
export type MixedModelCovariate = 'baseline_age'
export type MixedModelRandomEffects = 'intercept' | 'intercept_slope'

export interface MixedModelFactor {
  key: string
  kind: 'numeric' | 'categorical'
  effect: 'level' | 'level_slope'
  reference?: string
}

export interface MixedModelConfig {
  timeAxis: MixedModelTimeAxis
  covariates: MixedModelCovariate[]
  randomEffects: MixedModelRandomEffects
  factors?: MixedModelFactor[]
}

export function mixedModelFactors(config: MixedModelConfig): MixedModelFactor[] {
  return config.factors ?? config.covariates.map(key => ({ key, kind: 'numeric', effect: 'level' }))
}

export function mixedModelFactorColumn(factor: MixedModelFactor, index: number): string {
  return factor.key === 'baseline_age' ? 'baseline_age_centered' : `factor_${index}_`
}

export type MixedModelConfigValidation =
  | { ok: true }
  | { ok: false; code: 'UNSUPPORTED_TIME_AXIS' | 'UNSUPPORTED_CONFIG'; message: string }

export const DEFAULT_MIXED_MODEL_CONFIG: MixedModelConfig = {
  timeAxis: 'time_since_baseline',
  covariates: [],
  randomEffects: 'intercept_slope',
}

export function validateMixedModelConfig(config: MixedModelConfig): MixedModelConfigValidation {
  if (config.timeAxis !== 'time_since_baseline') {
    return {
      ok: false,
      code: 'UNSUPPORTED_TIME_AXIS',
      message: 'Age as the mixed-model time axis is not supported yet.',
    }
  }
  if (config.factors !== undefined) {
    if (!Array.isArray(config.factors)) return { ok: false, code: 'UNSUPPORTED_CONFIG', message: 'Factors must be an array.' }
    const seen = new Set<string>()
    for (const factor of config.factors) {
      if (!factor || typeof factor.key !== 'string' || !factor.key.trim() || seen.has(factor.key) ||
          !['numeric', 'categorical'].includes(factor.kind) || !['level', 'level_slope'].includes(factor.effect) ||
          (factor.kind === 'categorical' && (typeof factor.reference !== 'string' || !factor.reference.trim())) ||
          (factor.kind === 'numeric' && factor.reference !== undefined) ||
          (factor.key === 'baseline_age' && factor.kind !== 'numeric')) {
        return { ok: false, code: 'UNSUPPORTED_CONFIG', message: 'Invalid or duplicate mixed-model factor; categorical factors require a reference level.' }
      }
      seen.add(factor.key)
    }
  }
  const covariates = config.factors === undefined ? [...config.covariates].sort() : []
  const duplicateCovariate = covariates.find((covariate, index) => covariate === covariates[index - 1])
  if (duplicateCovariate) {
    return {
      ok: false,
      code: 'UNSUPPORTED_CONFIG',
      message: `Duplicate mixed-model covariate: ${duplicateCovariate}.`,
    }
  }
  const unsupportedCovariate = covariates.find((covariate) => covariate !== 'baseline_age')
  if (unsupportedCovariate) {
    return {
      ok: false,
      code: 'UNSUPPORTED_CONFIG',
      message: `Unsupported mixed-model covariate: ${unsupportedCovariate}.`,
    }
  }
  if (config.randomEffects !== 'intercept' && config.randomEffects !== 'intercept_slope') {
    return { ok: false, code: 'UNSUPPORTED_CONFIG', message: 'Unsupported mixed-model random-effects setting.' }
  }
  return { ok: true }
}

export function mixedModelFormulaKey(config: MixedModelConfig): string {
  const validation = validateMixedModelConfig(config)
  if (!validation.ok) return `unsupported__${config.timeAxis}`
  if (config.factors !== undefined) return `${config.timeAxis}__factors_${JSON.stringify(config.factors)}__${config.randomEffects}`
  const covariateKey = config.covariates.includes('baseline_age') ? 'baseline_age' : 'none'
  return `${config.timeAxis}__${covariateKey}__${config.randomEffects}`
}

export function mixedModelFormula(config: MixedModelConfig): string {
  const validation = validateMixedModelConfig(config)
  if (!validation.ok) return ''
  const fixed = ['time_since_baseline', ...mixedModelFactors(config).flatMap((factor, index) => {
    const column = mixedModelFactorColumn(factor, index)
    return factor.effect === 'level_slope' ? [column, `time_since_baseline:${column}`] : [column]
  })].join(' + ')
  const random =
    config.randomEffects === 'intercept_slope' ? '(1 + time_since_baseline | patient_id)' : '(1 | patient_id)'
  return `eGFR ~ ${fixed} + ${random}`
}

export function mixedModelConfigLabel(config: MixedModelConfig): string {
  const validation = validateMixedModelConfig(config)
  if (!validation.ok) return `Unsupported mixed model config: ${validation.message}`
  const covariate = mixedModelFactors(config).map(factor => ` + ${factor.key === 'baseline_age' ? 'centered baseline age' : factor.key}${factor.effect === 'level_slope' ? ' (level and slope)' : ''}`).join('')
  const random =
    config.randomEffects === 'intercept_slope' ? 'random patient intercept/slope' : 'random patient intercept'
  return `eGFR ~ time_since_baseline${covariate} + ${random}`
}

export function mixedModelConfigHashInput(config: MixedModelConfig) {
  return {
    formulaKey: mixedModelFormulaKey(config),
    formula: mixedModelFormula(config),
    config,
  }
}
