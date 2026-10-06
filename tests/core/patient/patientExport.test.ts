import { describe, it, expect } from 'vitest'
import { patientMeasurementRecords } from '../../../src/core/patient/patientExport'
import type { LabRow } from '../../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}
const d = (s: string) => new Date(s)

describe('patientMeasurementRecords', () => {
  it('emits one record per row for the patient, sorted by date, incl. computed eGFR', () => {
    const rows: LabRow[] = [
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 1.5, wert: '1,5' }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.0, wert: '1,0' }),
      row({ patientId: 1, labDatum: d('2020-06-01'), bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', wertNum: 75, wert: '75,0' }),
      row({ patientId: 2, labDatum: d('2020-01-01'), wertNum: 9.9 }), // other patient excluded
    ]
    const recs = patientMeasurementRecords(rows, 1)
    expect(recs).toHaveLength(3)
    expect(recs.map((r) => r.Datum)).toEqual(['2020-01-01', '2020-06-01', '2021-01-01'])
    expect(recs.some((r) => r.Bezeichnung.includes('computed'))).toBe(true)
    expect(recs[0]).toMatchObject({ PatientID: 1, Bezeichnung: 'Kreatinin', Einheit: 'mg/dl', WertNum: 1.0 })
  })

  it('formats missing values as empty strings', () => {
    const recs = patientMeasurementRecords([row({ patientId: 1, labDatum: null, wertNum: null, wert: 'n.d.', bezeichnung: 'HbA1c', einheit: '%' })], 1)
    expect(recs[0]).toMatchObject({ Datum: '', WertNum: '', Wert: 'n.d.' })
  })
})
