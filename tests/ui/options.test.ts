import { describe, it, expect } from 'vitest'
import { seriesOptions, patientLabel } from '../../src/ui/options'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'A', einheit: 'u',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('seriesOptions', () => {
  it('lists distinct (bezeichnung, einheit) for a patient', () => {
    const rows = [row({ bezeichnung: 'A', einheit: 'u' }), row({ bezeichnung: 'A', einheit: 'u' }), row({ bezeichnung: 'B', einheit: 'v' })]
    const opts = seriesOptions(rows, 1)
    expect(opts).toHaveLength(2)
  })
})

describe('patientLabel', () => {
  it('is the bare patient id (names are not stored or displayed)', () => {
    expect(patientLabel([row({ patientId: 5 })], 5)).toBe('5')
  })
})
