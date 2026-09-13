import { expect, it } from 'vitest'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFactors, mixedModelFactorColumn, mixedModelFormula, mixedModelFormulaKey, validateMixedModelConfig, type MixedModelConfig } from '../../../src/core/mixedModel/config'
import { hashMixedModelInput, validateMixedModelRows } from '../../../src/core/mixedModel/validation'

const config: MixedModelConfig = { ...DEFAULT_MIXED_MODEL_CONFIG, factors: [
  { key: 'unsafe key; stop()', kind: 'categorical', effect: 'level_slope', reference: 'A' },
  { key: 'baseline_age', kind: 'numeric', effect: 'level' },
] }
const rows = ['a','b','c','d'].flatMap((patient_id, i) => [0,1,2].map(time_since_baseline => ({
  patient_id, time_since_baseline, eGFR: 60-i-time_since_baseline,
  baseline_age: 40+i, baseline_age_centered: i-1.5,
  factorValues: { factor_0_: i % 2 ? 'B' : 'A', baseline_age_centered: i-1.5 },
})))

it('generates safe factor formulas with explicit interactions and distinct reference identity', () => {
  expect(mixedModelFactors({...DEFAULT_MIXED_MODEL_CONFIG,covariates:['baseline_age']})).toEqual([{key:'baseline_age',kind:'numeric',effect:'level'}])
  expect(mixedModelFactors(config)).toEqual(config.factors)
  expect(mixedModelFactorColumn(config.factors![0],0)).toBe('factor_0_')
  expect(mixedModelFactorColumn(config.factors![1],1)).toBe('baseline_age_centered')
  expect(mixedModelFormula(config)).toBe('eGFR ~ time_since_baseline + factor_0_ + time_since_baseline:factor_0_ + baseline_age_centered + (1 + time_since_baseline | patient_id)')
  expect(mixedModelFormulaKey(config)).not.toBe(mixedModelFormulaKey({...config, factors: [{...config.factors![0], reference: 'B'}, config.factors![1]]}))
  expect(mixedModelFormula({...config, covariates: ['baseline_age'], factors: []})).not.toContain('baseline_age_centered')
})
it('rejects duplicate factors, invalid kinds/effects and absent categorical references', () => {
  for (const factors of [[config.factors![0],config.factors![0]], [{key:'x',kind:'bad',effect:'level'}], [{key:'x',kind:'numeric',effect:'bad'}], [{key:'x',kind:'categorical',effect:'level'}]]) {
    expect(validateMixedModelConfig({...config, factors} as MixedModelConfig).ok).toBe(false)
  }
})
it('requires complete, patient-constant factors and existing reference levels', () => {
  expect(validateMixedModelRows(rows, config).ok).toBe(true)
  expect(validateMixedModelRows(rows.map(r => ({...r, factorValues: {}})), config).ok).toBe(false)
  expect(validateMixedModelRows(rows, {...config, factors:[{...config.factors![0],reference:'absent'}]}).ok).toBe(false)
  expect(validateMixedModelRows(rows.map((r,i) => i===0 ? {...r,factorValues:{...r.factorValues,factor_0_:'B'}}:r), config).ok).toBe(false)
  expect(validateMixedModelRows(rows.map(r => ({...r, factorValues:{...r.factorValues,baseline_age_centered:NaN}})), config).ok).toBe(false)
  expect(validateMixedModelRows(rows.map(r => ({...r, factorValues:{...r.factorValues,factor_0_:'A'}})), config).ok).toBe(false)
})
it('hashes factor values with stable record key order', () => {
  expect(hashMixedModelInput(rows)).not.toBe(hashMixedModelInput(rows.map(r => ({...r, factorValues:{...r.factorValues,factor_0_:'C'}}))))
  expect(hashMixedModelInput(rows)).toBe(hashMixedModelInput(rows.map(r => ({...r, factorValues:{baseline_age_centered:r.baseline_age_centered,factor_0_:r.factorValues.factor_0_}}))))
})
