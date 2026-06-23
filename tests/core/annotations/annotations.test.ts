import { describe, it, expect } from 'vitest'
import { normalizeAnnotations, validateAnnotations } from '../../../src/core/annotations/annotations'
import type { RawRow } from '../../../src/io/readWorkbook'
import type { LabRow } from '../../../src/core/types'

describe('normalizeAnnotations', () => {
  it('accepts canonical columns', () => {
    const rows: RawRow[] = [{ PatientID: 1, ReferenceDate: '2020-01-01', label: 'biopsy' }]
    const out = normalizeAnnotations(rows)
    expect(out[0].patientId).toBe(1)
    expect(out[0].label).toBe('biopsy')
    expect(out[0].referenceDate?.getUTCFullYear()).toBe(2020)
  })

  it('infers aliased columns (pat_id, Datum)', () => {
    const rows: RawRow[] = [{ pat_id: 7, Datum: '2021-06-01' }]
    const out = normalizeAnnotations(rows)
    expect(out[0].patientId).toBe(7)
    expect(out[0].referenceDate?.getUTCFullYear()).toBe(2021)
    expect(out[0].label).toBe('')
  })

  it('throws when required columns cannot be found', () => {
    expect(() => normalizeAnnotations([{ foo: 1, bar: 2 }])).toThrow(/required/i)
  })
})

describe('validateAnnotations', () => {
  const labRow = (id: number): LabRow => ({ patientId: id, labDatum: new Date('2020-01-01'), bezeichnung: 'A', einheit: 'u',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null })

  it('rejects missing id / invalid date, warns on unknown patient', () => {
    const anns = normalizeAnnotations([
      { PatientID: 1, ReferenceDate: '2020-01-01', label: 'ok' },
      { PatientID: 999, ReferenceDate: '2020-02-01', label: 'unknown pat' },
      { PatientID: null, ReferenceDate: '2020-03-01', label: 'no id' },
      { PatientID: 2, ReferenceDate: 'not-a-date', label: 'bad date' },
    ])
    const { valid, rejects } = validateAnnotations(anns, [labRow(1)])
    expect(valid).toHaveLength(2)
    expect(valid.find((v) => v.patientId === 999)?.warning).toBe('unknown_patient')
    expect(rejects).toHaveLength(2)
  })
})
