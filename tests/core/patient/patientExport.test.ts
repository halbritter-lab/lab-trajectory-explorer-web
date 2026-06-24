import { describe, it, expect } from 'vitest'
import { patientMeasurementRecords, patientSlopeRecords, computedEgfrSpecs, slopeSpecsWithComputedEgfr, patientWorkbookSheets } from '../../../src/core/patient/patientExport'
import type { CohortSeriesSpec } from '../../../src/core/cohort/screening'
import type { LabRow } from '../../../src/core/types'
import { ckdProgressionConfig } from '../../../src/core/fitPipeline/types'

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

describe('patientSlopeRecords', () => {
  const specs: CohortSeriesSpec[] = [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }]
  it('produces a slope row with the configured mode and a null reason on a clean fit', () => {
    const rows: LabRow[] = [
      row({ labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ labDatum: d('2020-01-01'), wertNum: 1.5 }),
      row({ labDatum: d('2021-01-01'), wertNum: 2.0 }),
    ]
    const recs = patientSlopeRecords(rows, 1, specs)
    expect(recs).toHaveLength(1)
    expect(recs[0]).toMatchObject({ PatientID: 1, Bezeichnung: 'Kreatinin', Mode: 'global', n: 3, reason: '' })
    expect(typeof recs[0].slope).toBe('number')
    expect(recs[0].slope_unit).toBe('mg/dl/yr')
    expect(typeof recs[0].r2).toBe('number')
    expect(typeof recs[0].ci_low).toBe('number')
    expect(typeof recs[0].ci_high).toBe('number')
    expect(recs[0].slope as number).toBeCloseTo(0.5, 1) // ~0.5 mg/dl per year
  })

  it('returns an empty array when no series are configured', () => {
    expect(patientSlopeRecords([row({})], 1, [])).toEqual([])
  })

  it('includes CKD endpoint columns for eGFR slope rows', () => {
    const spec: CohortSeriesSpec = {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1,73m²',
      mode: 'global',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }),
    }
    const rows = [
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2020-01-01'), wertNum: 60, patientAgeAtLab: 60 }),
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2021-01-01'), wertNum: 45, patientAgeAtLab: 61 }),
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2022-01-01'), wertNum: 30, patientAgeAtLab: 62 }),
    ]

    const [rec] = patientSlopeRecords(rows, 1, [spec])

    expect(rec.endpoint_percent_decline).toBeCloseTo(50)
    expect(rec.endpoint_observed_ckd_g5).toBe('')
    expect(rec.endpoint_projected_age_to_ckd_g5).toBeCloseTo(63, 1)
  })

  it('uses clinical event censoring for workbook slope rows', () => {
    const rows = [
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2020-01-01'), wertNum: 60, patientAgeAtLab: 60 }),
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2021-01-01'), wertNum: 50, patientAgeAtLab: 61 }),
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2021-07-01'), wertNum: 45, patientAgeAtLab: 61.5 }),
      row({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: d('2022-01-01'), wertNum: 5, patientAgeAtLab: 62 }),
    ]
    const spec: CohortSeriesSpec = {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1,73m²',
      mode: 'global',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }),
    }
    const transplant = {
      patientId: 1,
      type: 'kidney_transplant' as const,
      date: d('2022-01-01'),
      title: 'Kidney transplant',
      description: '',
      endDate: null,
      intent: null,
      warning: '' as const,
    }

    const sheets = patientWorkbookSheets(rows, 1, [spec], [transplant])
    const slopes = sheets.find((sheet) => sheet.name === 'slopes')!.rows as Array<{ slope: number | ''; n: number }>

    expect(slopes[0].n).toBe(4)
    expect(slopes[0].slope).toBeCloseTo(-10, 1)
  })
})

describe('computed eGFR auto-inclusion in the slopes export', () => {
  const EGFR = 'eGFR (CKD-EPI 2021, computed)'
  const egfrRow = (date: string, v: number): LabRow =>
    row({ patientId: 1, labDatum: d(date), bezeichnung: EGFR, einheit: 'ml/min/1,73m²', wertNum: v, wert: String(v) })

  it('detects the computed eGFR series present for a patient', () => {
    const rows = [row({ patientId: 1, wertNum: 1.0 }), egfrRow('2020-01-01', 80)]
    const specs = computedEgfrSpecs(rows, 1)
    expect(specs).toHaveLength(1)
    expect(specs[0]).toMatchObject({ bezeichnung: EGFR, einheit: 'ml/min/1,73m²', mode: 'global' })
  })

  it('finds nothing when no computed eGFR rows exist', () => {
    expect(computedEgfrSpecs([row({ patientId: 1 })], 1)).toEqual([])
  })

  it('appends computed eGFR to configured specs without duplicating an already-picked one', () => {
    const rows = [egfrRow('2020-01-01', 80)]
    const kreat = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' as const }
    // not yet configured -> appended
    expect(slopeSpecsWithComputedEgfr([kreat], rows, 1).map((s) => s.bezeichnung)).toEqual(['Kreatinin', EGFR])
    // already configured (with a different mode) -> kept once, user's spec wins
    const already = [{ bezeichnung: EGFR, einheit: 'ml/min/1,73m²', mode: 'aki-aware' as const }]
    const merged = slopeSpecsWithComputedEgfr(already, rows, 1)
    expect(merged).toHaveLength(1)
    expect(merged[0].mode).toBe('aki-aware')
  })

  it('produces an eGFR slope row in the export when eGFR is present but unpicked', () => {
    const rows = [
      egfrRow('2020-01-01', 90), egfrRow('2020-07-01', 80), egfrRow('2021-01-01', 70),
    ]
    const merged = slopeSpecsWithComputedEgfr([], rows, 1)
    const recs = patientSlopeRecords(rows, 1, merged)
    expect(recs).toHaveLength(1)
    expect(recs[0].Bezeichnung).toBe(EGFR)
    expect(recs[0].n).toBe(3)
    expect(typeof recs[0].slope).toBe('number')
  })
})
