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
  it('contributes nothing when the formula is off', () => {
    const rows = [row()]
    const out = egfrModule.apply(
      { rows, manualDemographics: {}, patientAttributes: {}, events: [] },
      { formula: 'off', source: null },
    )
    expect(out).toEqual({})
  })

  it('contributes nothing when off even if manual demographics are present', () => {
    const rows = [row({ patientId: 1 })]
    const out = egfrModule.apply(
      { rows, manualDemographics: { 1: { sex: 'w', age: 64 } }, patientAttributes: {}, events: [] },
      { formula: 'off', source: null },
    )
    expect(out).toEqual({})
  })

  it('matches appendComputedEgfr for enabled CKD-EPI 2021', () => {
    const rows = [row({ wertNum: 1.1 })]
    const expected = appendComputedEgfr(rows, { formula: 'ckd-epi-2021', source: null })
    const out = egfrModule.apply(
      { rows, manualDemographics: {}, patientAttributes: {}, events: [] },
      { formula: 'ckd-epi-2021', source: null },
    )
    expect(out.rows).toEqual(expected)
    expect(out.rows?.some((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))).toBe(true)
  })

  it('computes from the rows it is handed and does not apply manual demographics itself', () => {
    // Demographics resolution runs earlier in the pipeline, so a row that still
    // has no sex or age here stays uncomputable however the manual entry reads.
    const rows = [row({ patientSex: null, patientAgeAtLab: null })]
    const out = egfrModule.apply(
      { rows, manualDemographics: { 1: { sex: 'w', age: 64 } }, patientAttributes: {}, events: [] },
      { formula: 'ckd-epi-2021', source: null },
    )
    expect(out.rows?.filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))).toHaveLength(0)
  })

  it('computes eGFR from demographics already resolved onto the rows', () => {
    const rows = [row({ patientSex: 'w', patientAgeAtLab: 64 })]
    const out = egfrModule.apply(
      { rows, manualDemographics: {}, patientAttributes: {}, events: [] },
      { formula: 'ckd-epi-2021', source: null },
    )
    const computed = out.rows?.filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX)) ?? []
    expect(computed).toHaveLength(1)
    expect(computed[0].patientSex).toBe('w')
    expect(computed[0].patientAgeAtLab).toBe(64)
  })
})
