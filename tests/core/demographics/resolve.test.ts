import { describe, it, expect } from 'vitest'
import { resolveDemographics } from '../../../src/core/demographics/resolve'
import type { LabRow } from '../../../src/core/types'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function row(patientId: number, date: string, sex: LabRow['patientSex'], age: number | null): LabRow {
  return {
    patientId,
    labDatum: utc(date),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1,0',
    wertNum: 1,
    wertOperator: '=',
    loinc: null,
    patientSex: sex,
    patientAgeAtLab: age,
  }
}

describe('resolveDemographics', () => {
  it('returns the very same array when the data is already consistent', () => {
    const rows = [
      row(1, '2022-01-15', 'w', 46),
      row(1, '2022-07-20', 'w', 46),
      row(1, '2023-03-02', 'w', 47),
    ]
    const out = resolveDemographics(rows, {}, {})
    expect(out.rows).toBe(rows)
    expect(out.conflicts).toEqual([])
  })

  it('unifies a stray sex across the patient and reports it', () => {
    const rows = [row(1, '2022-01-15', 'w', 46), row(1, '2022-07-20', 'm', 46)]
    const out = resolveDemographics(rows, {}, {})
    // Two rows, one each: a tie, so sex becomes unknown for the whole patient.
    expect(out.rows.map((r) => r.patientSex)).toEqual([null, null])
    expect(out.conflicts.map((c) => c.kind)).toEqual(['sex_tie'])
  })

  it('rewrites a typo age from the anchor the other rows imply', () => {
    const rows = [
      row(1, '2022-01-15', 'w', 46),
      row(1, '2022-07-20', 'w', 46),
      row(1, '2023-03-02', 'w', 64),
    ]
    const out = resolveDemographics(rows, {}, {})
    expect(out.rows[2].patientAgeAtLab).toBe(47)
    expect(out.conflicts.map((c) => c.kind)).toEqual(['age_no_common_birth_date'])
  })

  it('ages a manually entered age across the series', () => {
    const rows = [row(1, '2014-01-15', 'w', null), row(1, '2022-01-15', 'w', null)]
    const out = resolveDemographics(rows, {}, { '1': { age: 46 } })
    expect(out.rows.map((r) => r.patientAgeAtLab)).toEqual([46, 54])
  })

  it('reads sex and birthDate from the attributes table', () => {
    const rows = [row(1, '2022-01-15', 'w', 46)]
    const out = resolveDemographics(rows, { '1': { sex: 'male', birthDate: '1980-02-03' } }, {})
    expect(out.rows[0].patientSex).toBe('m')
    expect(out.rows[0].patientAgeAtLab).toBe(41)
    // The attributes birth date (implying 41) also contradicts the row's stated
    // age of 46 — reported, not silently overridden, same as the sex conflict.
    expect(out.conflicts.map((c) => c.kind)).toEqual(['age_source_disagreement', 'sex_source_disagreement'])
  })

  it('keeps patients independent of one another', () => {
    const rows = [
      row(1, '2022-01-15', 'w', 46),
      row(2, '2022-01-15', 'm', 46),
      row(2, '2023-03-02', 'm', 64),
    ]
    const out = resolveDemographics(rows, {}, {})
    expect(out.rows[0]).toBe(rows[0])
    expect(out.conflicts.every((c) => c.patientId === 2)).toBe(true)
  })
})
