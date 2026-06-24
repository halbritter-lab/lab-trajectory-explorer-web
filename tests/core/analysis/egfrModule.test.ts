import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../../src/core/types'
import { egfrModule } from '../../../src/core/analysis/egfrModule'
import { appendComputedEgfr, COMPUTED_BEZEICHNUNG_SUFFIX } from '../../../src/core/egfr/series'

function row(p: Partial<LabRow> = {}): LabRow {
  return {
    patientId: 1,
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1',
    wertNum: 1,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 50,
    ...p,
  }
}

describe('egfrModule', () => {
  it('returns the original row reference when off and no manual demographics are applied', () => {
    const rows = [row()]
    const out = egfrModule.apply({ rows, manualDemographics: {}, events: [] }, { formula: 'off', source: null })
    expect(out.rows).toBe(rows)
  })

  it('returns the original row reference when off and manual demographics do not match any row', () => {
    const rows = [row({ patientId: 1 })]
    const out = egfrModule.apply(
      { rows, manualDemographics: { 2: { sex: 'w', age: 64 } }, events: [] },
      { formula: 'off', source: null },
    )
    expect(out.rows).toBe(rows)
  })

  it('returns the original row reference when off and matching manual demographics are empty', () => {
    const rows = [row({ patientId: 1 })]
    const out = egfrModule.apply(
      { rows, manualDemographics: { 1: {} }, events: [] },
      { formula: 'off', source: null },
    )
    expect(out.rows).toBe(rows)
  })

  it('returns the original row reference when off and matching manual sex is null', () => {
    const rows = [row({ patientId: 1 })]
    const out = egfrModule.apply(
      { rows, manualDemographics: { 1: { sex: null } }, events: [] },
      { formula: 'off', source: null },
    )
    expect(out.rows).toBe(rows)
  })

  it('matches appendComputedEgfr for enabled CKD-EPI 2021', () => {
    const rows = [row({ wertNum: 1.1 })]
    const expected = appendComputedEgfr(rows, { formula: 'ckd-epi-2021', source: null })
    const out = egfrModule.apply({ rows, manualDemographics: {}, events: [] }, { formula: 'ckd-epi-2021', source: null })
    expect(out.rows).toEqual(expected)
    expect(out.rows?.some((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))).toBe(true)
  })

  it('applies manual demographics before computing eGFR', () => {
    const rows = [row({ patientSex: null, patientAgeAtLab: null })]
    const out = egfrModule.apply(
      { rows, manualDemographics: { 1: { sex: 'w', age: 64 } }, events: [] },
      { formula: 'ckd-epi-2021', source: null },
    )
    const computed = out.rows?.filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX)) ?? []
    expect(computed).toHaveLength(1)
    expect(computed[0].patientSex).toBe('w')
    expect(computed[0].patientAgeAtLab).toBe(64)
  })
})
