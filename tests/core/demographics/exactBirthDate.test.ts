import { describe, expect, it } from 'vitest'
import { exactBirthDateByPatient, patientBirthAnchor } from '../../../src/core/demographics/exactBirthDate'
import { demographicWarningsByPatient } from '../../../src/core/demographics/describe'
import type { LabRow } from '../../../src/core/types'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const row = (age: number | null, birthDate?: Date): LabRow => ({
  patientId: 'P1', labDatum: utc('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: '1,0', wertNum: 1,
  wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: age, patientBirthDate: birthDate,
})

describe('patientBirthAnchor', () => {
  it('is exact for an attributes-table or lab-row birth date, estimated for an inferred or manual age', () => {
    const base = { patientId: 'P1', attributeBirthDate: undefined, manualAge: undefined }
    expect(patientBirthAnchor({ ...base, rows: [row(null)], attributeBirthDate: '1960-06-15' })).toEqual({ birthAnchor: utc('1960-06-15'), ageEstimated: false })
    expect(patientBirthAnchor({ ...base, rows: [row(null, utc('1961-02-03'))] })).toEqual({ birthAnchor: utc('1961-02-03'), ageEstimated: false })
    expect(patientBirthAnchor({ ...base, rows: [row(59)] }).ageEstimated).toBe(true)
    expect(patientBirthAnchor({ ...base, rows: [row(null, utc('1961-02-03'))], manualAge: 50 }).ageEstimated).toBe(true)
    expect(patientBirthAnchor({ ...base, rows: [row(null)] })).toEqual({ birthAnchor: null, ageEstimated: false })
  })

  it('keeps only exact anchors by patient key', () => {
    expect(exactBirthDateByPatient([
      { id: 1, birthAnchor: utc('1960-06-15'), ageEstimated: false },
      { id: 2, birthAnchor: utc('1960-06-15'), ageEstimated: true },
      { id: 3, birthAnchor: null, ageEstimated: false },
      { id: 4, birthAnchor: utc('1960-06-15') },
    ])).toEqual({ 1: utc('1960-06-15') })
  })
})

describe('demographicWarningsByPatient', () => {
  it('groups demographics messages by the patient key after segment two, colons included', () => {
    const warnings = demographicWarningsByPatient([
      { id: 'demographics:sex_tie:A:1', text: 'first' },
      { id: 'egfr:skipped:A:1', text: 'other module' },
      { id: 'demographics:age_source_disagreement:A:1', text: 'second' },
      { id: 'demographics:sex_tie:B', text: 'third' },
    ])
    expect([...warnings]).toEqual([['A:1', ['first', 'second']], ['B', ['third']]])
  })
})
