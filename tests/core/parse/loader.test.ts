import { describe, it, expect } from 'vitest'
import { loadLabRows, REQUIRED_COLUMNS } from '../../../src/core/parse/loader'
import type { RawRow } from '../../../src/io/readWorkbook'

const base: RawRow = {
  PatientID: 1,
  LabDatum: '2024-01-15',
  Bezeichnung: 'Kreatinin',
  Einheit: 'mg/dl',
  Wert: '1,2',
}

describe('loadLabRows', () => {
  it('throws naming the missing required columns', () => {
    expect(() => loadLabRows([{ PatientID: 1 }])).toThrow(/patientId|labDate|testName|unit|value/)
    expect(REQUIRED_COLUMNS).toContain('value')
  })

  it('parses Wert into wertNum/wertOperator when absent', () => {
    const [row] = loadLabRows([base])
    expect(row.wertNum).toBe(1.2)
    expect(row.wertOperator).toBe('=')
  })

  it('parses LabDatum to a Date', () => {
    const [row] = loadLabRows([base])
    expect(row.labDatum?.getUTCFullYear()).toBe(2024)
    expect(row.labDatum?.getUTCMonth()).toBe(0)
    expect(row.labDatum?.getUTCDate()).toBe(15)
  })

  it('uses pre-parsed Wert_num/Wert_operator when present', () => {
    const [row] = loadLabRows([{ ...base, Wert_num: 9.9, Wert_operator: '=' }])
    expect(row.wertNum).toBe(9.9)
  })

  it('lowercases PatientSex', () => {
    const [row] = loadLabRows([{ ...base, PatientSex: 'W' }])
    expect(row.patientSex).toBe('w')
  })

  it('prefers PatientAgeAtLab over birthdate', () => {
    const [row] = loadLabRows([
      { ...base, PatientAgeAtLab: 50, PatientGeburtsdatum: '1900-01-01' },
    ])
    expect(row.patientAgeAtLab).toBe(50)
  })

  it('derives completed years from PatientGeburtsdatum when age column absent', () => {
    const passed = loadLabRows([
      { ...base, LabDatum: '2024-08-01', PatientGeburtsdatum: '1980-03-10' },
    ])
    expect(passed[0].patientAgeAtLab).toBe(44)
    const notYet = loadLabRows([
      { ...base, LabDatum: '2024-02-01', PatientGeburtsdatum: '1980-03-10' },
    ])
    expect(notYet[0].patientAgeAtLab).toBe(43)
  })

  it('uses calendar birthdays instead of 365.25-day rounding for age', () => {
    const [row] = loadLabRows([
      { ...base, LabDatum: '2019-01-01', PatientGeburtsdatum: '2001-01-01' },
    ])
    expect(row.patientAgeAtLab).toBe(18)
  })

  it('sets wertNum null for unparseable text values', () => {
    const [row] = loadLabRows([{ ...base, Wert: 'positiv' }])
    expect(row.wertNum).toBeNull()
    expect(row.wertOperator).toBe('unparseable')
  })

  it('parses German DD.MM.YYYY CSV dates to UTC midnight', () => {
    const [row] = loadLabRows([{ ...base, LabDatum: '15.03.2024' }])
    expect(row.labDatum?.getUTCFullYear()).toBe(2024)
    expect(row.labDatum?.getUTCMonth()).toBe(2) // March
    expect(row.labDatum?.getUTCDate()).toBe(15)
    expect(row.labDatum?.getUTCHours()).toBe(0)
  })

  it('keeps string PatientID values and still drops blank ids', () => {
    const rows = loadLabRows([{ ...base, PatientID: 1 }, { ...base, PatientID: 'abc-123' }, { ...base, PatientID: null }])
    expect(rows).toHaveLength(2)
    expect(rows[0].patientId).toBe(1)
    expect(rows[1].patientId).toBe('abc-123')
  })

  it('accepts English and long-form sex spellings', () => {
    expect(loadLabRows([{ ...base, PatientSex: 'male' }])[0].patientSex).toBe('m')
    expect(loadLabRows([{ ...base, sex: 'female' }])[0].patientSex).toBe('w')
    expect(loadLabRows([{ ...base, PatientSex: 'f' }])[0].patientSex).toBe('w')
    expect(loadLabRows([{ ...base, PatientSex: 'd' }])[0].patientSex).toBe('d')
  })

  it('still rejects sex values that are not a recognised spelling', () => {
    expect(loadLabRows([{ ...base, PatientSex: 'unknown' }])[0].patientSex).toBeNull()
  })

  it('falls back to "unparseable" for an unknown pre-parsed Wert_operator', () => {
    const [row] = loadLabRows([{ ...base, Wert_num: 5, Wert_operator: 'BOGUS' }])
    expect(row.wertOperator).toBe('unparseable')
    expect(row.wertNum).toBe(5)
  })

  it('loads a workbook using the canonical camelCase headers', () => {
    const [row] = loadLabRows([{
      patientId: 7,
      labDate: '2024-01-15',
      testName: 'Creatinine',
      unit: 'mg/dl',
      value: '1,2',
      loinc: '2160-0',
      sex: 'w',
      ageAtLab: 46,
    }])
    expect(row.patientId).toBe(7)
    expect(row.labDatum?.getUTCFullYear()).toBe(2024)
    expect(row.bezeichnung).toBe('Creatinine')
    expect(row.einheit).toBe('mg/dl')
    expect(row.wertNum).toBe(1.2)
    expect(row.loinc).toBe('2160-0')
    expect(row.patientSex).toBe('w')
    expect(row.patientAgeAtLab).toBe(46)
  })

  it('matches headers case-insensitively and ignores separators', () => {
    const [row] = loadLabRows([{
      'patient id': 3,
      LABDATE: '2024-01-15',
      Test_Name: 'Creatinine',
      Unit: 'mg/dl',
      VALUE: '2,5',
    }])
    expect(row.patientId).toBe(3)
    expect(row.bezeichnung).toBe('Creatinine')
    expect(row.wertNum).toBe(2.5)
  })

  it('accepts the canonical camelCase name for pre-parsed values', () => {
    const [row] = loadLabRows([{ ...base, valueNum: 9.9, valueOperator: '<' }])
    expect(row.wertNum).toBe(9.9)
    expect(row.wertOperator).toBe('<')
  })

  it('accepts birthDate as an alias for PatientGeburtsdatum', () => {
    const [row] = loadLabRows([{ ...base, LabDatum: '2024-08-01', birthDate: '1980-03-10' }])
    expect(row.patientAgeAtLab).toBe(44)
  })

  it('prefers the canonical spelling when a file carries both', () => {
    // A file round-tripped through an older export could end up with both
    // spellings. Alias order decides, so the result never depends on key order.
    const [row] = loadLabRows([{ ...base, value: '3,5', Wert: '9,9' }])
    expect(row.wertNum).toBe(3.5)
  })

  it('truncates to whole days when dates carry a time component', () => {
    // 365 whole days apart, but the lab cell carries a late time-of-day pushing
    // the fractional span to 365.98 d. Whole-day truncation (matching pandas
    // Timedelta.days) must yield 0 completed years; keeping the fractional ms
    // would wrongly cross the 365.25 boundary to 1.
    const birth = new Date('2020-01-01T00:00:00Z')
    const lab = new Date('2020-12-31T23:30:00Z')
    const [row] = loadLabRows([
      { ...base, LabDatum: lab, PatientGeburtsdatum: birth },
    ])
    expect(row.patientAgeAtLab).toBe(0)
  })
})
