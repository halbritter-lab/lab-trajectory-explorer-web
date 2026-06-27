import { describe, it, expect } from 'vitest'
import { buildCohortRows, cohortExportRecords, isRapidEgfrDecline, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import type { LabRow } from '../../../src/core/types'
import { ckdProgressionConfig } from '../../../src/core/fitPipeline/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2019-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}
const d = (s: string) => new Date(s)

describe('cohortExportRecords', () => {
  it('flattens cohort rows into one record per patient×series', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
    const rows = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 2.0 }),
    ]
    const cohort = buildCohortRows(rows, [1], [spec])
    const recs = cohortExportRecords(cohort)
    expect(recs).toHaveLength(1)
    expect(recs[0].PatientID).toBe(1)
    expect(recs[0].Bezeichnung).toBe('Kreatinin')
    expect(recs[0].Einheit).toBe('mg/dl')
    expect(recs[0].slope_mode).toBe('global')
    expect(recs[0].n).toBe(3)
    expect(typeof recs[0].slope).toBe('number')
  })

  it('labels the slope unit per year and carries r2/CI', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
    const rows = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 2.0 }),
    ]
    const [rec] = cohortExportRecords(buildCohortRows(rows, [1], [spec]))
    expect(rec.slope_unit).toBe('mg/dl/yr')
    expect(typeof rec.r2).toBe('number')
    expect(typeof rec.ci_low).toBe('number')
    expect(typeof rec.ci_high).toBe('number')
    // ~0.5 mg/dl per year over this 2-year linear rise
    expect(rec.slope as number).toBeCloseTo(0.5, 1)
  })

  it('flags rapid eGFR decline in the export when the threshold is set', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', mode: 'global' }
    // ~ -10 mL/min/1.73m² per year (90 -> 70 over 2 years)
    const rows = [
      row({ patientId: 1, bezeichnung: spec.bezeichnung, einheit: 'ml/min/1,73m²', labDatum: d('2019-01-01'), wertNum: 90 }),
      row({ patientId: 1, bezeichnung: spec.bezeichnung, einheit: 'ml/min/1,73m²', labDatum: d('2020-01-01'), wertNum: 80 }),
      row({ patientId: 1, bezeichnung: spec.bezeichnung, einheit: 'ml/min/1,73m²', labDatum: d('2021-01-01'), wertNum: 70 }),
    ]
    const cohort = buildCohortRows(rows, [1], [spec])
    expect(cohortExportRecords(cohort, 5)[0].rapid_progression).toBe('yes')
    expect(cohortExportRecords(cohort, 0)[0].rapid_progression).toBe('') // disabled
    expect(cohortExportRecords(cohort, 50)[0].rapid_progression).toBe('') // not steep enough
  })

  it('adds a leading group column only when rows carry a groupValue', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
    const rows = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 2.0 }),
    ]

    const ungrouped = cohortExportRecords(buildCohortRows(rows, [1], [spec]))
    expect('group' in ungrouped[0]).toBe(false)

    const grouped = cohortExportRecords(buildCohortRows(rows, [1], [spec], 'genotype', { '1': { genotype: 'A' } }))
    expect(grouped[0].group).toBe('A')
    // group is the first column
    expect(Object.keys(grouped[0])[0]).toBe('group')
  })

  it('exports CKD endpoint values for eGFR cohort records', () => {
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

    const [rec] = cohortExportRecords(buildCohortRows(rows, [1], [spec]))

    expect(rec.endpoint_percent_decline).toBeCloseTo(50)
    expect(rec.endpoint_observed_ckd_g5).toBe('')
    expect(rec.endpoint_projected_age_to_ckd_g5).toBeCloseTo(63, 1)
  })
})

describe('isRapidEgfrDecline', () => {
  it('flags only eGFR-unit series declining faster than the threshold', () => {
    expect(isRapidEgfrDecline('ml/min/1,73m²', -6, 5)).toBe(true)
    expect(isRapidEgfrDecline('ml/min/1,73m²', -4, 5)).toBe(false) // not steep enough
    expect(isRapidEgfrDecline('ml/min/1,73m²', 6, 5)).toBe(false)  // rising, not declining
    expect(isRapidEgfrDecline('mg/dl', -100, 5)).toBe(false)        // not an eGFR unit
    expect(isRapidEgfrDecline('ml/min/1,73m²', -6, 0)).toBe(false)  // threshold 0 = off
    expect(isRapidEgfrDecline('ml/min/1,73m²', Number.NaN, 5)).toBe(false)
  })
})
