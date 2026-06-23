import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { patientWorkbookSheets } from '../../../src/core/patient/patientExport'
import { appendComputedEgfr, COMPUTED_BEZEICHNUNG_SUFFIX } from '../../../src/core/egfr/series'
import { sheetsToXlsxBytes } from '../../../src/io/export'
import { readWorkbook } from '../../../src/io/readWorkbook'
import type { CohortSeriesSpec } from '../../../src/core/cohort/screening'
import type { LabRow } from '../../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1.0', wertNum: 1.0, wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: 60,
    ...p }
}
const d = (s: string) => new Date(s)

// A small adult creatinine series; appendComputedEgfr synthesises the eGFR rows
// exactly as the patient view does before building the workbook.
const baseRows: LabRow[] = [
  row({ labDatum: d('2019-01-01'), wertNum: 1.0, wert: '1,0' }),
  row({ labDatum: d('2020-01-01'), wertNum: 1.5, wert: '1,5' }),
  row({ labDatum: d('2021-01-01'), wertNum: 2.0, wert: '2,0' }),
]
const displayRows = appendComputedEgfr(baseRows, { formula: 'ckd-epi-2021' })
const specs: CohortSeriesSpec[] = [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }]

describe('patientWorkbookSheets', () => {
  it('produces measurements, slopes and about sheets in order', () => {
    const sheets = patientWorkbookSheets(displayRows, 1, specs)
    expect(sheets.map((s) => s.name)).toEqual(['measurements', 'slopes', 'about'])
  })

  it('auto-includes the computed eGFR slope even though only Kreatinin was picked', () => {
    const sheets = patientWorkbookSheets(displayRows, 1, specs)
    const slopes = sheets[1].rows as { Bezeichnung: string }[]
    const names = slopes.map((r) => r.Bezeichnung)
    expect(names).toContain('Kreatinin')
    expect(names.some((n) => n.includes(COMPUTED_BEZEICHNUNG_SUFFIX))).toBe(true)
  })

  it('round-trips through xlsx with computed eGFR present in both data sheets', () => {
    const bytes = sheetsToXlsxBytes(patientWorkbookSheets(displayRows, 1, specs))
    const wb = XLSX.read(bytes, { type: 'array' })
    expect(wb.SheetNames).toEqual(['measurements', 'slopes', 'about'])

    const measurements = readWorkbook(bytes, 'measurements') as { Bezeichnung: string; Einheit: string }[]
    const egfrMeasurements = measurements.filter((r) => String(r.Bezeichnung).includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    expect(egfrMeasurements.length).toBe(3) // one per creatinine reading
    expect(egfrMeasurements[0].Einheit).toBe('ml/min/1,73m²')

    const slopes = readWorkbook(bytes, 'slopes') as { Bezeichnung: string; slope: number; slope_unit: string }[]
    const egfrSlope = slopes.find((r) => String(r.Bezeichnung).includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    expect(egfrSlope).toBeDefined()
    expect(egfrSlope!.slope_unit).toBe('ml/min/1,73m²/yr')
    // rising creatinine -> falling eGFR -> negative slope
    expect(egfrSlope!.slope).toBeLessThan(0)

    const about = readWorkbook(bytes, 'about') as { note: string }[]
    expect(about.some((r) => /Research use only/i.test(String(r.note)))).toBe(true)
  })

  it('emits no eGFR rows when eGFR computation is off (plain creatinine rows only)', () => {
    const sheets = patientWorkbookSheets(baseRows, 1, specs)
    const measurements = sheets[0].rows as { Bezeichnung: string }[]
    expect(measurements.every((r) => !r.Bezeichnung.includes(COMPUTED_BEZEICHNUNG_SUFFIX))).toBe(true)
  })
})
