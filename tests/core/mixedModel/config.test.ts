import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MIXED_MODEL_CONFIG,
  mixedModelConfigLabel,
  mixedModelFormula,
  mixedModelFormulaKey,
  mixedModelConfigHashInput,
  validateMixedModelConfig,
  type MixedModelConfig,
} from '../../../src/core/mixedModel/config'

describe('mixed model config', () => {
  it('uses the R-script-compatible random slope model as the default', () => {
    expect(DEFAULT_MIXED_MODEL_CONFIG).toEqual({
      timeAxis: 'time_since_baseline',
      covariates: [],
      randomEffects: 'intercept_slope',
    })
    expect(mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)).toBe(
      'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
    )
  })

  it('builds every first-phase allowed formula', () => {
    const configs: Array<[MixedModelConfig, string, string]> = [
      [
        { timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept' },
        'time_since_baseline__none__intercept',
        'eGFR ~ time_since_baseline + (1 | patient_id)',
      ],
      [
        { timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept_slope' },
        'time_since_baseline__none__intercept_slope',
        'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
      ],
      [
        { timeAxis: 'time_since_baseline', covariates: ['baseline_age'], randomEffects: 'intercept' },
        'time_since_baseline__baseline_age__intercept',
        'eGFR ~ time_since_baseline + baseline_age_centered + (1 | patient_id)',
      ],
      [
        { timeAxis: 'time_since_baseline', covariates: ['baseline_age'], randomEffects: 'intercept_slope' },
        'time_since_baseline__baseline_age__intercept_slope',
        'eGFR ~ time_since_baseline + baseline_age_centered + (1 + time_since_baseline | patient_id)',
      ],
    ]

    for (const [config, key, formula] of configs) {
      expect(validateMixedModelConfig(config).ok).toBe(true)
      expect(mixedModelFormulaKey(config)).toBe(key)
      expect(mixedModelFormula(config)).toBe(formula)
    }
  })

  it('rejects age time axis until the age-axis phase is designed', () => {
    const validation = validateMixedModelConfig({
      timeAxis: 'age',
      covariates: [],
      randomEffects: 'intercept',
    })

    expect(validation).toEqual({
      ok: false,
      code: 'UNSUPPORTED_TIME_AXIS',
      message: 'Age as the mixed-model time axis is not supported yet.',
    })
  })

  it('rejects duplicate covariates', () => {
    const validation = validateMixedModelConfig({
      timeAxis: 'time_since_baseline',
      covariates: ['baseline_age', 'baseline_age'],
      randomEffects: 'intercept',
    })

    expect(validation).toEqual({
      ok: false,
      code: 'UNSUPPORTED_CONFIG',
      message: 'Duplicate mixed-model covariate: baseline_age.',
    })
  })

  it('builds a compact user-facing label', () => {
    expect(mixedModelConfigLabel(DEFAULT_MIXED_MODEL_CONFIG)).toBe(
      'eGFR ~ time_since_baseline + random patient intercept/slope',
    )
  })

  it('builds a clear unsupported label', () => {
    expect(
      mixedModelConfigLabel({
        timeAxis: 'age',
        covariates: [],
        randomEffects: 'intercept',
      }),
    ).toBe('Unsupported mixed model config: Age as the mixed-model time axis is not supported yet.')
  })

  it('builds hash input for model config', () => {
    expect(mixedModelConfigHashInput(DEFAULT_MIXED_MODEL_CONFIG)).toEqual({
      formulaKey: 'time_since_baseline__none__intercept_slope',
      formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
      config: DEFAULT_MIXED_MODEL_CONFIG,
    })
  })
})
