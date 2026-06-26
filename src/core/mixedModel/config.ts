export type MixedModelTimeAxis = 'time_since_baseline' | 'age'
export type MixedModelCovariate = 'baseline_age'
export type MixedModelRandomEffects = 'intercept' | 'intercept_slope'

export interface MixedModelConfig {
  timeAxis: MixedModelTimeAxis
  covariates: MixedModelCovariate[]
  randomEffects: MixedModelRandomEffects
}

export type MixedModelConfigValidation =
  | { ok: true }
  | { ok: false; code: 'UNSUPPORTED_TIME_AXIS' | 'UNSUPPORTED_CONFIG'; message: string }

export const DEFAULT_MIXED_MODEL_CONFIG: MixedModelConfig = {
  timeAxis: 'time_since_baseline',
  covariates: ['baseline_age'],
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
  const covariates = [...config.covariates].sort()
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
  const covariateKey = config.covariates.includes('baseline_age') ? 'baseline_age' : 'none'
  return `${config.timeAxis}__${covariateKey}__${config.randomEffects}`
}

export function mixedModelFormula(config: MixedModelConfig): string {
  const validation = validateMixedModelConfig(config)
  if (!validation.ok) return ''
  const fixed = config.covariates.includes('baseline_age') ? 'time_since_baseline + baseline_age_centered' : 'time_since_baseline'
  const random =
    config.randomEffects === 'intercept_slope' ? '(1 + time_since_baseline | patient_id)' : '(1 | patient_id)'
  return `eGFR ~ ${fixed} + ${random}`
}

export function mixedModelConfigLabel(config: MixedModelConfig): string {
  const validation = validateMixedModelConfig(config)
  if (!validation.ok) return `Unsupported mixed model config: ${validation.message}`
  const covariate = config.covariates.includes('baseline_age') ? ' + centered baseline age' : ''
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
