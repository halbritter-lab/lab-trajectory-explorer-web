import { describe, expect, it } from 'vitest'
import { availableMixedModelFactors, prepareMixedModelFactors } from '../../../src/core/mixedModel/factors'
import { DEFAULT_MIXED_MODEL_CONFIG, type MixedModelConfig } from '../../../src/core/mixedModel/config'
import type { MixedModelSpikeRow } from '../../../src/core/mixedModel/types'
import type { LabRow } from '../../../src/core/types'

const rows: MixedModelSpikeRow[] = [
  { patient_id: '1', time_since_baseline: 0, eGFR: 60, baseline_age: 40, baseline_age_centered: -10 },
  { patient_id: '1', time_since_baseline: 1, eGFR: 58, baseline_age: 40, baseline_age_centered: -10 },
  { patient_id: '2', time_since_baseline: 0, eGFR: 70, baseline_age: 60, baseline_age_centered: 10 },
  { patient_id: '3', time_since_baseline: 0, eGFR: 80, baseline_age: 80, baseline_age_centered: 30 },
]
const lab = (id: number, sex: LabRow['patientSex'] = null): LabRow => ({
  patientId: id, patientSex: sex, patientAgeAtLab: 40, labDatum: new Date('2024-01-01'),
  bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '60', wertNum: 60, wertOperator: '=', loinc: null,
})
const config: MixedModelConfig = { ...DEFAULT_MIXED_MODEL_CONFIG, factors: [
  { key: 'genotype', kind: 'categorical', effect: 'level_slope', reference: 'A' },
  { key: 'baseline_age', kind: 'numeric', effect: 'level_slope' },
] }

describe('prepareMixedModelFactors', () => {
  it('excludes whole incomplete patients and centers after exclusion with one vote per patient', () => {
    const result = prepareMixedModelFactors(rows, config, { '1': { genotype: 'A' }, '2': { genotype: 'B' } }, [])
    expect(result.rows.map((r) => r.patient_id)).toEqual(['1', '1', '2'])
    expect(result.rows.map((r) => r.factorValues)).toEqual([
      { factor_0_: 'A', baseline_age_centered: -10 },
      { factor_0_: 'A', baseline_age_centered: -10 },
      { factor_0_: 'B', baseline_age_centered: 10 },
    ])
    expect(result.preparation.centers).toEqual({ baseline_age_centered: 50 })
    expect(result.preparation.excludedPatients).toEqual([{ patientId: '3', reasons: ['Missing genotype'] }])
    expect(result.preparation.nPatientsBefore).toBe(3)
    expect(result.preparation.nMeasurementsBefore).toBe(4)
    expect(rows[0].factorValues).toBeUndefined()
  })

  it('uses resolved sex instead of a disagreeing attributes value', () => {
    const cfg: MixedModelConfig = { ...config, factors: [{ key: 'sex', kind: 'categorical', effect: 'level', reference: 'w' }] }
    const result = prepareMixedModelFactors(rows, cfg, { '1': { sex: 'male' } }, [lab(1, 'w'), lab(2, 'm')])
    expect(result.rows[0].factorValues).toEqual({ factor_0_: 'w' })
    expect(result.preparation.excludedPatients).toEqual([{ patientId: '3', reasons: ['Missing sex'] }])
  })

  it('treats empty/invalid numeric values as missing and retains numeric-looking categories', () => {
    const cfg: MixedModelConfig = { ...config, factors: [
      { key: 'dose', kind: 'numeric', effect: 'level' },
      { key: 'code', kind: 'categorical', effect: 'level', reference: '01' },
    ] }
    const result = prepareMixedModelFactors(rows, cfg, {
      '1': { dose: ' 2.5 ', code: '01' }, '2': { dose: ' ', code: '02' }, '3': { dose: '0x10', code: '03' },
    }, [])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].factorValues).toEqual({ factor_0_: 0, factor_1_: '01' })
    expect(result.preparation.centers).toEqual({ factor_0_: 2.5 })
    expect(result.preparation.excludedPatients).toHaveLength(2)
  })

  it('preserves the unadjusted and legacy model rows', () => {
    expect(prepareMixedModelFactors(rows, DEFAULT_MIXED_MODEL_CONFIG, {}, []).rows).toEqual(rows)
    expect(prepareMixedModelFactors(rows, { ...DEFAULT_MIXED_MODEL_CONFIG, covariates: ['baseline_age'] }, {}, []).rows).toEqual(rows)
  })

  it('records the patient-weighted age center for unchanged legacy age-adjusted fits', () => {
    const result = prepareMixedModelFactors(rows, { ...DEFAULT_MIXED_MODEL_CONFIG, covariates: ['baseline_age'] }, {}, [])
    expect(result.rows).toEqual(rows)
    expect(result.preparation.centers).toEqual({ baseline_age_centered: 60 })
  })

  it('reports each missing selected factor and allows absent unused attributes', () => {
    const result = prepareMixedModelFactors(rows, { ...config, factors: [
      { key: 'genotype', kind: 'categorical', effect: 'level', reference: 'A' },
      { key: 'dose', kind: 'numeric', effect: 'level' },
    ] }, { '1': { genotype: 'A', dose: '1' } }, [])
    expect(result.preparation.excludedPatients[0]).toEqual({ patientId: '2', reasons: ['Missing genotype', 'Missing dose'] })
    expect(result.rows).toHaveLength(2)
  })
})

describe('availableMixedModelFactors', () => {
  it('offers built-ins and scoped attributes without duplicate sex or unknown-patient levels', () => {
    const options = availableMixedModelFactors([lab(1, 'w'), lab(2, 'm')], {
      '1': { sex: 'female', genotype: '01', dose: '2.5' },
      '2': { genotype: '02', dose: '5' }, '999': { other: 'irrelevant', genotype: '99' },
    })
    expect(options.filter((x) => x.key === 'sex')).toHaveLength(1)
    expect(options.find((x) => x.key === 'sex')?.levels).toEqual(['m', 'w'])
    expect(options.find((x) => x.key === 'genotype')?.levels).toEqual(['01', '02'])
    expect(options.find((x) => x.key === 'dose')?.numeric).toBe(true)
    expect(options.some((x) => x.key === 'other')).toBe(false)
    expect(options.some((x) => x.key === 'baseline_age')).toBe(true)
  })
})

it('does not mistake inherited object properties for patient attributes', () => {
  const cfg: MixedModelConfig = { ...config, factors: [{ key: 'toString', kind: 'categorical', effect: 'level', reference: 'A' }] }
  const attributes = { '1': { toString: 'A' }, '2': {} }
  const result = prepareMixedModelFactors(rows, cfg, attributes, [])
  expect(result.rows.map(row => row.patient_id)).toEqual(['1', '1'])
  expect(result.preparation.excludedPatients).toHaveLength(2)
  expect(availableMixedModelFactors([lab(1), lab(2)], attributes).find(factor => factor.key === 'toString')?.levels).toEqual(['A'])
})
