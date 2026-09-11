import { describe, it, expect } from 'vitest'
import { buildCohortRows, cohortExportRecords, isRapidEgfrDecline, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import type { LabRow } from '../../../src/core/types'
import { acuteReviewConfig, ckdProgressionConfig } from '../../../src/core/fitPipeline/types'
import type { ClinicalEvent } from '../../../src/core/events/events'

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

  it('names the fit model, defaulting to ols when no fit config is set', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
    const rows = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 2.0 }),
    ]
    const recs = cohortExportRecords(buildCohortRows(rows, [1], [spec]))
    expect(recs[0].fit_model).toBe('ols')
  })

  it('reports the estimator that produced the scalar slope, not conflicting config metadata', () => {
    const rows = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 2.0 }),
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 3.0 }),
      row({ patientId: 1, labDatum: d('2022-01-01'), wertNum: 4.0 }),
      row({ patientId: 1, labDatum: d('2023-01-01'), wertNum: 100.0 }),
    ]
    const fitConfig = { ...ckdProgressionConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }), fitModel: 'theil-sen' as const }
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global', fitConfig }
    const recs = cohortExportRecords(buildCohortRows(rows, [1], [spec]))
    expect(recs[0].fit_model).toBe('ols')
    expect(recs[0].slope_mode).toBe('global')
    expect(recs[0].slope).toBeGreaterThan(15)
  })

  it('identifies and numerically exports a Theil-Sen scalar fit', () => {
    const rows = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 2.0 }),
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 3.0 }),
      row({ patientId: 1, labDatum: d('2022-01-01'), wertNum: 4.0 }),
      row({ patientId: 1, labDatum: d('2023-01-01'), wertNum: 100.0 }),
    ]
    const fitConfig = { ...ckdProgressionConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }), fitModel: 'theil-sen' as const }
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global-robust', fitConfig }
    const [record] = cohortExportRecords(buildCohortRows(rows, [1], [spec]))

    expect(record.fit_model).toBe('theil-sen')
    expect(record.slope).toBeGreaterThan(0.9)
    expect(record.slope).toBeLessThan(1.1)
  })

  it('flags a two-point fit that reason reports as clean', () => {
    // The case the reason field cannot express: fitGlobal special-cases n === 2,
    // so a two-point series over two years exports r2 = 1 with an empty reason
    // and is indistinguishable from the best-fitting series in the cohort.
    // Mirrors demo patient 3 on Kreatinin (mg/dl).
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
    const rows = [
      row({ patientId: 1, labDatum: d('2022-01-01'), wertNum: 0.9 }),
      row({ patientId: 1, labDatum: d('2024-01-01'), wertNum: 1.4 }),
    ]
    const [rec] = cohortExportRecords(buildCohortRows(rows, [1], [spec]))
    expect(rec.n).toBe(2)
    expect(rec.span_days).toBe(730)
    expect(rec.r2).toBe(1)
    expect(rec.reason).toBe('')
    expect(rec.unstable_slope).toBe('yes')
  })

  it('leaves a well-supported slope unflagged', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
    const rows = [
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2022-01-01'), wertNum: 1.2 }),
      row({ patientId: 1, labDatum: d('2023-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: d('2024-01-01'), wertNum: 1.9 }),
    ]
    const [rec] = cohortExportRecords(buildCohortRows(rows, [1], [spec]))
    expect(rec.unstable_slope).toBe('')
  })

  it('flags a fit that time balancing collapsed to two points', () => {
    // Eight raw values clustered in two quarters collapse to two aggregated
    // points under quarterly-median balancing — the CKD-progression default.
    // Counting raw measurements would report n = 8 and miss it entirely.
    const dates = [
      '2021-01-05', '2021-01-20', '2021-02-10', '2021-03-01',
      '2023-01-05', '2023-01-20', '2023-02-10', '2023-03-01',
    ]
    const rows = dates.map((date, i) =>
      row({ patientId: 1, labDatum: d(date), wertNum: i < 4 ? 1.0 : 2.0 }))
    const fitConfig = ckdProgressionConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global', fitConfig }
    const [rec] = cohortExportRecords(buildCohortRows(rows, [1], [spec]))
    expect(rec.n).toBe(8)
    expect(rec.reason).toBe('')
    expect(rec.unstable_slope).toBe('yes')
  })

  it('flags a short fitted span without changing the reference-compatible reason', () => {
    const rows = [
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 10 }),
      row({ patientId: 1, labDatum: d('2020-02-01'), wertNum: 9 }),
      row({ patientId: 1, labDatum: d('2020-03-01'), wertNum: 8 }),
      row({ patientId: 1, labDatum: d('2024-01-01'), wertNum: 100 }),
    ]
    const transplant: ClinicalEvent = {
      patientId: 1,
      type: 'kidney_transplant',
      date: d('2020-04-01'),
      title: 'Kidney transplant',
      description: null,
      endDate: null,
      intent: null,
      warning: '',
    }
    const spec: CohortSeriesSpec = {
      bezeichnung: 'Kreatinin',
      einheit: 'mg/dl',
      mode: 'global',
      clinicalEvents: [transplant],
    }

    const [rec] = cohortExportRecords(buildCohortRows(rows, [1], [spec]))

    expect(rec.span_days).toBeGreaterThan(365)
    expect(rec.reason).toBe('')
    expect(rec.unstable_slope).toBe('yes')
  })

  it('claims nothing about reliability when no fit was requested', () => {
    // The "Acute review" preset sets fitModel 'none', for which summarize emits
    // reason 'n_below_threshold' no matter how many points exist. Deriving the
    // flag from reason alone would assert "fewer than three measurements" here.
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ patientId: 1, labDatum: d(`202${Math.floor(i / 4) + 1}-0${(i % 4) + 1}-01`), wertNum: 1 + i * 0.1 }))
    const fitConfig = acuteReviewConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global', fitConfig }
    const [rec] = cohortExportRecords(buildCohortRows(rows, [1], [spec]))
    expect(rec.n).toBe(10)
    expect(rec.fit_model).toBe('none')
    expect(rec.unstable_slope).toBe('')
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

  it('flags patients whose demographics were contradictory', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }
    const rows = [
      row({ patientId: 1, labDatum: d('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: d('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: d('2021-01-01'), wertNum: 2.0 }),
    ]
    const cohort = buildCohortRows(rows, [1], [spec])
    expect(cohortExportRecords(cohort, 0, new Set(['1']))[0].demographics_conflict).toBe('yes')
    expect(cohortExportRecords(cohort, 0, new Set())[0].demographics_conflict).toBe('')
    expect(cohortExportRecords(cohort)[0].demographics_conflict).toBe('')
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
