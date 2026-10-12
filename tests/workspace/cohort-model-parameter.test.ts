import { describe, expect, it } from 'vitest'
import { defaultModelParameterKey, modelablePatientCount } from '../../src/workspace/cohort-model-parameter'
import type { LabRow } from '../../src/core/types'

function rows(bezeichnung: string, einheit: string, patients: number, times = 3): LabRow[] {
  return Array.from({ length: patients }, (_, p) => Array.from({ length: times }, (_, t) => ({
    patientId: p + 1, labDatum: new Date(2022 + t, 0, 1), bezeichnung, einheit, wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
  }) satisfies LabRow)).flat()
}

const param = (bezeichnung: string, einheit: string) => ({ key: `${bezeichnung}||${einheit}`, bezeichnung, einheit })

describe('modelablePatientCount', () => {
  it('counts patients with at least three distinct dated numeric measurements', () => {
    const data = [...rows('eGFR', 'u', 4), ...rows('eGFR', 'u', 6, 2).map(r => ({ ...r, patientId: Number(r.patientId) + 10 }))]
    expect(modelablePatientCount(data, param('eGFR', 'u'), new Set(data.map(r => String(r.patientId))))).toBe(4)
  })

  it('ignores same-day repeats, missing dates and non-numeric values', () => {
    const base = rows('eGFR', 'u', 1)
    const noise = [{ ...base[1] }, { ...base[1], labDatum: null }, { ...base[1], labDatum: new Date(2030, 0, 1), wertNum: null }]
    expect(modelablePatientCount([base[1], base[2], ...noise], param('eGFR', 'u'), new Set(['1']))).toBe(0)
    expect(modelablePatientCount([...base, ...noise], param('eGFR', 'u'), new Set(['1']))).toBe(1)
  })
})

describe('defaultModelParameterKey', () => {
  it('prefers an eGFR parameter that reaches the model minimum', () => {
    const data = [...rows('Kreatinin', 'mg/dl', 13), ...rows('eGFR', 'u', 11)]
    const params = [param('Kreatinin', 'mg/dl'), param('eGFR', 'u')]
    expect(defaultModelParameterKey(params, data, new Set(data.map(r => String(r.patientId))))).toBe('eGFR||u')
  })

  it('skips an eGFR parameter below the minimum when another one can be fitted', () => {
    const data = [...rows('Kreatinin', 'mg/dl', 13), ...rows('eGFR', 'u', 5), ...rows('eGFR (CKD-EPI 2021, computed)', 'u', 12)]
    const params = [param('Kreatinin', 'mg/dl'), param('eGFR', 'u'), param('eGFR (CKD-EPI 2021, computed)', 'u')]
    expect(defaultModelParameterKey(params, data, new Set(data.map(r => String(r.patientId))))).toBe('eGFR (CKD-EPI 2021, computed)||u')
  })

  it('falls back to a fittable non-eGFR parameter before an unfittable eGFR one', () => {
    const data = [...rows('Kreatinin', 'mg/dl', 13), ...rows('eGFR', 'u', 5)]
    const params = [param('eGFR', 'u'), param('Kreatinin', 'mg/dl')]
    expect(defaultModelParameterKey(params, data, new Set(data.map(r => String(r.patientId))))).toBe('Kreatinin||mg/dl')
  })

  it('keeps eGFR first when nothing can be fitted, so the reason names the expected parameter', () => {
    const data = [...rows('Kreatinin', 'mg/dl', 4), ...rows('eGFR', 'u', 3)]
    const params = [param('Kreatinin', 'mg/dl'), param('eGFR', 'u')]
    expect(defaultModelParameterKey(params, data, new Set(data.map(r => String(r.patientId))))).toBe('eGFR||u')
  })

  it('does not count bounded values such as ">90", which the model never sees', () => {
    const bounded = rows('eGFR', 'u', 10).map((row, i) => i % 3 === 2 ? row : { ...row, wert: '>90', wertNum: 90, wertOperator: '>' as const })
    const data = [...rows('Kreatinin', 'mg/dl', 10), ...bounded]
    const params = [param('eGFR', 'u'), param('Kreatinin', 'mg/dl')]
    const ids = new Set(data.map(r => String(r.patientId)))
    expect(modelablePatientCount(data, param('eGFR', 'u'), ids)).toBe(0)
    expect(defaultModelParameterKey(params, data, ids)).toBe('Kreatinin||mg/dl')
  })

  it('skips a candidate that the real preparation and validation reject', () => {
    const data = [...rows('Kreatinin', 'mg/dl', 12), ...rows('eGFR', 'u', 11)]
    const params = [param('Kreatinin', 'mg/dl'), param('eGFR', 'u')]
    const ids = new Set(data.map(r => String(r.patientId)))
    const checked: string[] = []
    const key = defaultModelParameterKey(params, data, ids, candidate => { checked.push(candidate); return candidate !== 'eGFR||u' })
    expect(key).toBe('Kreatinin||mg/dl')
    expect(checked).toEqual(['eGFR||u', 'Kreatinin||mg/dl'])
  })

  it('returns an empty key without parameters', () => {
    expect(defaultModelParameterKey([], [], new Set())).toBe('')
  })
})

