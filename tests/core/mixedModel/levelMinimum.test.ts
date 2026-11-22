import { describe, expect, it } from 'vitest'
import { availableMixedModelFactors, logBaselineUacr, prepareMixedModelFactors, uacrSeries } from '../../../src/core/mixedModel/factors'
import { DEFAULT_MIXED_MODEL_CONFIG, POOLED_LEVEL, resolveMixedModelFactorReferences, validateMixedModelConfig, type MixedModelConfig } from '../../../src/core/mixedModel/config'
import { validateMixedModelRows } from '../../../src/core/mixedModel/validation'
import { isNotTestedValue } from '../../../src/core/attributes/notTested'
import type { MixedModelSpikeRow } from '../../../src/core/mixedModel/types'
import type { LabRow } from '../../../src/core/types'

// Decisions `genomin`, `genomiss` and `uacr` of 2026-11-22 (issue #4).
const genotype: MixedModelConfig = { ...DEFAULT_MIXED_MODEL_CONFIG, factors: [{ key: 'genotype', kind: 'categorical', effect: 'level' }] }

/** `n` patients p1…pn, each with `times` model rows starting on 2020-01-01. */
function modelRows(n: number, times = 3, prefix = 'p'): MixedModelSpikeRow[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).flatMap((patient_id, i) =>
    Array.from({ length: times }, (_, t) => ({ patient_id, time_since_baseline: t, value: 60 - i - t, date: `202${t}-01-01` })))
}
const attributes = (levels: Record<string, string>) => Object.fromEntries(Object.entries(levels).map(([id, value]) => [id, { genotype: value }]))

describe('minimum per factor level (genomin)', () => {
  // A: 7 patients, B: 3, C: 2 (one with a single row), D: 7.
  const rows = [...modelRows(18), { patient_id: 'q1', time_since_baseline: 0, value: 50, date: '2020-01-01' }]
  const levels: Record<string, string> = {}
  for (let i = 1; i <= 18; i += 1) levels[`p${i}`] = i <= 7 ? 'A' : i <= 10 ? 'B' : i <= 11 ? 'C' : 'D'
  levels.q1 = 'C'

  it('pools levels with fewer than 5 patients with 2 or more rows into "other (pooled)"', () => {
    const { rows: prepared, preparation } = prepareMixedModelFactors(rows, genotype, attributes(levels), [])
    expect(new Set(prepared.map(row => row.factorValues?.factor_0_))).toEqual(new Set(['A', 'D', POOLED_LEVEL]))
    // The value before pooling stays in factorRawValues (model_rows raw_factor_0_).
    expect(prepared.find(row => row.patient_id === 'p8')?.factorRawValues?.factor_0_).toBe('B')
    expect(preparation.levelPooling).toEqual([
      { factor: 'genotype', column: 'factor_0_', level: 'A', modelLevel: 'A', patients: 7, patientsWithRepeated: 7, action: 'kept' },
      { factor: 'genotype', column: 'factor_0_', level: 'B', modelLevel: POOLED_LEVEL, patients: 3, patientsWithRepeated: 3, action: 'pooled' },
      { factor: 'genotype', column: 'factor_0_', level: 'C', modelLevel: POOLED_LEVEL, patients: 2, patientsWithRepeated: 1, action: 'pooled' },
      { factor: 'genotype', column: 'factor_0_', level: 'D', modelLevel: 'D', patients: 7, patientsWithRepeated: 7, action: 'kept' },
    ])
    expect(preparation.excludedPatients).toEqual([])
  })

  it('counts patients with exactly 5 such patients as enough (boundary inclusive)', () => {
    const five: Record<string, string> = {}
    for (let i = 1; i <= 10; i += 1) five[`p${i}`] = i <= 5 ? 'A' : 'B'
    const { preparation } = prepareMixedModelFactors(modelRows(10), genotype, attributes(five), [])
    expect(preparation.levelPooling?.map(record => record.action)).toEqual(['kept', 'kept'])
    // Four with 2 rows and one with a single row: below the minimum.
    const short = modelRows(10).filter(row => !(row.patient_id === 'p5' && row.time_since_baseline > 0))
    expect(prepareMixedModelFactors(short, genotype, attributes(five), []).preparation.levelPooling?.[0]).toMatchObject({ level: 'A', patients: 5, patientsWithRepeated: 4, action: 'pooled' })
  })

  it('keeps small levels as they are with smallLevelPolicy keep', () => {
    const { rows: prepared, preparation } = prepareMixedModelFactors(rows, { ...genotype, smallLevelPolicy: 'keep' }, attributes(levels), [])
    expect(new Set(prepared.map(row => row.factorValues?.factor_0_))).toEqual(new Set(['A', 'B', 'C', 'D']))
    expect(preparation.levelPooling?.filter(record => record.action === 'kept_below_minimum').map(record => record.level)).toEqual(['B', 'C'])
    expect(validateMixedModelConfig({ ...genotype, smallLevelPolicy: 'other' as never }).ok).toBe(false)
  })

  it('never takes the pooled level as the default reference while another level exists', () => {
    const lower: Record<string, string> = Object.fromEntries(Object.entries(levels).map(([id, value]) => [id, value.toLowerCase()]))
    const prepared = prepareMixedModelFactors(rows, genotype, attributes(lower), []).rows
    // In plain string order "other (pooled)" would come before a level such as "p"; it is ranked last.
    expect(resolveMixedModelFactorReferences(genotype, prepared).factors?.[0].reference).toBe('a')
    const onlyPooled = prepared.map(row => ({ ...row, factorValues: { factor_0_: POOLED_LEVEL } }))
    expect(resolveMixedModelFactorReferences(genotype, onlyPooled).factors?.[0].reference).toBe(POOLED_LEVEL)
  })

  it('names a chosen reference that was pooled', () => {
    const prepared = prepareMixedModelFactors(rows, { ...genotype, factors: [{ ...genotype.factors![0], reference: 'B' }] }, attributes(levels), []).rows
    const validation = validateMixedModelRows(prepared, { ...genotype, factors: [{ ...genotype.factors![0], reference: 'B' }] })
    expect(validation.ok).toBe(false)
    if (!validation.ok) expect(validation.message).toBe('Reference level "B" of factor genotype has fewer than 5 patients with 2 or more measurements in this model and was pooled into "other (pooled)". Choose another reference or keep small levels.')
  })

  it('pools per unit: a group with few patients of a level pools it where the whole cohort does not', () => {
    const groupRows = rows.filter(row => ['p1', 'p2', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17'].includes(row.patient_id))
    const { preparation } = prepareMixedModelFactors(groupRows, genotype, attributes(levels), [])
    expect(preparation.levelPooling?.find(record => record.level === 'A')).toMatchObject({ patients: 2, action: 'pooled' })
  })
})

describe('"not tested" is its own level (genomiss)', () => {
  it('recognises a short, fixed vocabulary', () => {
    for (const value of ['not tested', 'Not Tested', ' NICHT  getestet ', 'n.t.', 'NT', 'nt']) expect(isNotTestedValue(value), value).toBe(true)
    for (const value of ['', 'no variant', 'negative', 'n.a.', 'NA', 'not done', 'n. t.', 'NTRK1', null, undefined]) expect(isNotTestedValue(value), String(value)).toBe(false)
  })

  it('enters as "not tested", apart from "no variant" and from blank, which stays missing', () => {
    const levels: Record<string, string> = {}
    for (let i = 1; i <= 17; i += 1) levels[`p${i}`] = i <= 6 ? 'PKD1' : i <= 11 ? 'no variant' : i <= 16 ? (i % 2 ? 'NT' : 'nicht getestet') : ''
    const { rows: prepared, preparation } = prepareMixedModelFactors(modelRows(17), genotype, attributes(levels), [])
    expect(new Set(prepared.map(row => row.factorValues?.factor_0_))).toEqual(new Set(['PKD1', 'no variant', 'not tested']))
    expect(prepared.find(row => row.patient_id === 'p13')?.factorRawValues?.factor_0_).toBe('NT')
    expect(preparation.excludedPatients).toEqual([{ patientId: 'p17', reasons: ['Missing genotype'] }])
    // Default reference: "not tested" is ranked last.
    expect(resolveMixedModelFactorReferences(genotype, prepared).factors?.[0].reference).toBe('PKD1')
  })

  it('leaves a small "not tested" level out with its patients instead of pooling it', () => {
    const levels: Record<string, string> = {}
    for (let i = 1; i <= 14; i += 1) levels[`p${i}`] = i <= 6 ? 'PKD1' : i <= 11 ? 'no variant' : i <= 12 ? 'PKD2' : 'n.t.'
    const { rows: prepared, preparation } = prepareMixedModelFactors(modelRows(14), genotype, attributes(levels), [])
    expect(new Set(prepared.map(row => row.factorValues?.factor_0_))).toEqual(new Set(['PKD1', 'no variant', POOLED_LEVEL]))
    expect(preparation.excludedPatients.map(patient => patient.patientId)).toEqual(['p13', 'p14'])
    expect(preparation.excludedPatients[0].reasons).toEqual(['Not tested genotype: fewer than 5 patients with 2 or more measurements'])
    expect(preparation.levelPooling?.[0]).toEqual({ factor: 'genotype', column: 'factor_0_', level: 'not tested', modelLevel: '', patients: 2, patientsWithRepeated: 2, action: 'excluded_not_tested' })
  })

  it('offers the level as "not tested" in the reference list and keeps a numeric attribute with NT categorical', () => {
    const lab: LabRow = { patientId: 'p1', patientSex: null, patientAgeAtLab: 40, labDatum: new Date('2024-01-01'), bezeichnung: 'eGFR', einheit: 'ml', wert: '60', wertNum: 60, wertOperator: '=', loinc: null }
    const rowsInScope = ['p1', 'p2', 'p3'].map(patientId => ({ ...lab, patientId }))
    const available = availableMixedModelFactors(rowsInScope, { p1: { stage: '1' }, p2: { stage: 'NT' }, p3: { stage: '2' } })
    expect(available.find(factor => factor.key === 'stage')).toMatchObject({ levels: ['1', '2', 'not tested'], numeric: false })
  })
})

describe('log baseline UACR covariate (uacr)', () => {
  const uacr = (patientId: string, date: string, value: number, operator: LabRow['wertOperator'] = '='): LabRow => ({
    patientId, patientSex: null, patientAgeAtLab: 40, labDatum: new Date(`${date}T10:00:00Z`), bezeichnung: 'UACR', einheit: 'mg/g', wert: String(value), wertNum: value, wertOperator: operator, loinc: null,
  })

  it('finds one UACR series by name and none when two series match', () => {
    expect(uacrSeries([uacr('p1', '2020-01-01', 30)])).toEqual({ name: 'UACR', unit: 'mg/g' })
    expect(uacrSeries([{ ...uacr('p1', '2020-01-01', 30), bezeichnung: 'Albumin/Kreatinin-Quotient' }])).toEqual({ name: 'Albumin/Kreatinin-Quotient', unit: 'mg/g' })
    expect(uacrSeries([uacr('p1', '2020-01-01', 30), { ...uacr('p1', '2020-01-01', 3), einheit: 'mg/mmol' }])).toBeNull()
    expect(uacrSeries([{ ...uacr('p1', '2020-01-01', 30), bezeichnung: 'Albumin' }])).toBeNull()
  })

  it('takes the value nearest to the model baseline within 90 days, the earlier date at equal distance', () => {
    expect(logBaselineUacr([uacr('p1', '2019-12-01', 50), uacr('p1', '2020-01-11', 20)], '2020-01-01')).toBeCloseTo(Math.log(20), 12)
    // 10 days before and 10 days after: the value before.
    expect(logBaselineUacr([uacr('p1', '2019-12-22', 40), uacr('p1', '2020-01-11', 20)], '2020-01-01')).toBeCloseTo(Math.log(40), 12)
    // Two values on that date: their median.
    expect(logBaselineUacr([uacr('p1', '2020-01-05', 10), uacr('p1', '2020-01-05', 40)], '2020-01-01')).toBeCloseTo(Math.log(25), 12)
    // Exactly 90 days counts, 91 does not.
    expect(logBaselineUacr([uacr('p1', '2020-03-31', 12)], '2020-01-01')).toBeCloseTo(Math.log(12), 12)
    expect(logBaselineUacr([uacr('p1', '2020-04-01', 12)], '2020-01-01')).toBeNull()
  })

  it('enters as a centred numeric factor; a patient without a baseline value is removed', () => {
    const config: MixedModelConfig = { ...DEFAULT_MIXED_MODEL_CONFIG, factors: [{ key: 'log_baseline_uacr', kind: 'numeric', effect: 'level', series: { name: 'UACR', unit: 'mg/g' } }] }
    expect(validateMixedModelConfig(config).ok).toBe(true)
    expect(validateMixedModelConfig({ ...config, factors: [{ key: 'log_baseline_uacr', kind: 'numeric', effect: 'level' }] }).ok).toBe(false)
    const lab = [uacr('p1', '2020-01-15', Math.E), uacr('p2', '2019-12-01', Math.E ** 3), uacr('p3', '2020-01-01', 0), uacr('p4', '2020-01-01', 5, '<')]
    const { rows: prepared, preparation } = prepareMixedModelFactors(modelRows(4), config, {}, lab)
    expect(preparation.centers).toEqual({ factor_0_: 2 })
    expect(prepared.filter(row => row.time_since_baseline === 0).map(row => [row.patient_id, row.factorValues?.factor_0_])).toEqual([['p1', -1], ['p2', 1]])
    expect(preparation.excludedPatients).toEqual([{ patientId: 'p3', reasons: ['Missing log_baseline_uacr'] }, { patientId: 'p4', reasons: ['Missing log_baseline_uacr'] }])
  })

  it('is offered, off by default, only when one UACR series exists', () => {
    const lab = [uacr('p1', '2020-01-15', 30)]
    expect(availableMixedModelFactors(lab, {}).find(factor => factor.key === 'log_baseline_uacr')).toMatchObject({ label: 'Log baseline UACR (possible mediator)', numeric: true, typeSwitchable: false, series: { name: 'UACR', unit: 'mg/g' } })
    expect(availableMixedModelFactors([{ ...lab[0], bezeichnung: 'eGFR' }], {}).some(factor => factor.key === 'log_baseline_uacr')).toBe(false)
  })
})
