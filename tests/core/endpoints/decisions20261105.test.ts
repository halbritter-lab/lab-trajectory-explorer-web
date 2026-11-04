import { describe, expect, it } from 'vitest'
import { buildCohortRows, cohortExportRecords, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import { ckdProgressionConfig } from '../../../src/core/domains/nephrology/fitConfig'
import { generalExplorationConfig, theilSenConfig } from '../../../src/core/analysis/fitConfig'
import { summarizeByBezeichnung } from '../../../src/core/stats/summarize'
import { isUnstableSlope } from '../../../src/core/stats/slopeQuality'
import { endpointBadge } from '../../../src/workspace/labels/endpointLabels'
import { slopeQualityLabel } from '../../../src/workspace/labels/qualityLabels'
import type { FitConfig } from '../../../src/core/analysis/fitConfig'
import type { LabRow } from '../../../src/core/types'

// Owner decisions of 2026-11-05 (issue #34, "Endpoint and projection input").
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const egfr = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }
const crea = { bezeichnung: 'Kreatinin', einheit: 'mg/dl' }
const row = (p: Partial<LabRow>): LabRow => ({ patientId: 1, labDatum: d('2020-01-01'), ...egfr, wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null, ...p })
const series = (parameter: typeof egfr, values: [string, number][]) => values.map(([date, wertNum]) => row({ ...parameter, labDatum: d(date), wertNum }))
const exactBirthDateByPatient = { '1': d('1960-01-01') }
const cellFor = (rows: LabRow[], fitConfig: FitConfig, mode: CohortSeriesSpec['mode'] = 'global') => {
  const cohort = buildCohortRows(rows, [1], [{ ...egfr, mode, fitConfig, exactBirthDateByPatient }])
  return { cell: cohort[0].cells[0], record: cohortExportRecords(cohort)[0] }
}
const withProjection = (config: FitConfig): FitConfig => ({ ...config, endpoints: { ...config.endpoints, projectedAgeToCkdG5: true } })

describe('endpoint input excludes the column\'s AKI windows', () => {
  // Stable eGFR 34-36 every quarter for three years, then a terminal admission
  // with eight daily AKI values; creatinine rises from 1.8 to 2.8 mg/dl
  // (stage I) on the first admission day, so the 30-day window covers all eight.
  const akiValues = [26, 24, 22, 20, 18, 17, 16, 16]
  const quarters = Array.from({ length: 13 }, (_, q) => new Date(Date.UTC(2020, q * 3, 1)).toISOString().slice(0, 10))
  const admission = akiValues.map((_, i) => `2023-02-0${i + 1}`)
  const terminalAki = [
    ...series(egfr, [...quarters.map((date, q): [string, number] => [date, [34, 35, 36][q % 3]]), ...admission.map((date, i): [string, number] => [date, akiValues[i]])]),
    ...series(crea, [...quarters.map((date): [string, number] => [date, 1.8]), ['2023-01-31', 1.8], ...admission.map((date, i): [string, number] => [date, 2.8 + i * 0.1])]),
  ]

  it('withholds the G5 projection a terminal AKI admission produced (example 1)', () => {
    const { cell, record } = cellFor(terminalAki, ckdProgressionConfig(egfr))
    expect(cell.excludedIdx).toEqual([13, 14, 15, 16, 17, 18, 19, 20])
    // Before: endpoint fit over all 21 rows, slope CI [-7.43, -2.46], "G5 @ 65.0y".
    expect(cell.endpoints.endpointPointCount).toBe(13)
    expect(cell.endpoints.projectedAgeToCkdG5).toMatchObject({ value: null, reason: 'non_declining_fit' })
    expect(cell.endpoints.projectedAgeToCkdG5.slopeCiLow).toBeCloseTo(-0.5432, 4)
    expect(cell.endpoints.projectedAgeToCkdG5.slopeCiHigh).toBeCloseTo(0.6311, 4)
    expect(cell.endpoints.percentDecline).toMatchObject({ value: 0, baselineValue: 34, latestValue: 34 })
    expect(record.endpoint_input_policy).toBe('dated exact numeric measurements before first kidney transplant/chronic dialysis; dated acute dialysis intervals excluded (inclusive); bounds excluded; AKI exclusion windows excluded')
    expect(endpointBadge(cell.endpoints, cell.points.length)?.label).toBe('0%, G5 not projected')
  })

  it('keeps AKI values in the endpoint input when the column does not exclude AKI windows', () => {
    const { cell, record } = cellFor(terminalAki, withProjection(generalExplorationConfig(egfr)))
    expect(cell.endpoints.endpointPointCount).toBe(21)
    expect(cell.endpoints.projectedAgeToCkdG5.value).toBeCloseTo(64.9767, 3)
    expect(cell.endpoints.projectedAgeToCkdG5.slopeCiLow).toBeCloseTo(-7.4350, 3)
    expect(cell.endpoints.projectedAgeToCkdG5.slopeCiHigh).toBeCloseTo(-2.4558, 3)
    expect(record.endpoint_input_policy).toBe('dated exact numeric measurements before first kidney transplant/chronic dialysis; dated acute dialysis intervals excluded (inclusive); bounds excluded')
  })

  it('takes the decline baseline after the AKI window (example 2)', () => {
    const rows = [
      ...series(egfr, [['2020-01-03', 20], ['2020-01-05', 25], ['2020-03-01', 55], ['2020-05-01', 58], ['2020-07-01', 56], ['2021-01-01', 33], ['2021-06-01', 32]]),
      ...series(crea, [['2020-01-01', 1.0], ['2020-01-03', 2.6], ['2020-01-05', 2.2], ['2020-03-01', 1.0]]),
    ]
    const { cell, record } = cellFor(rows, ckdProgressionConfig(egfr))
    // Before: baseline (20 + 25 + 55) / 3 = 33.3, percent decline -60, no 40 % event.
    expect(cell.endpoints.declineBaselineValue).toBe(56.5)
    expect(cell.endpoints.percentDecline.value).toBeCloseTo(41.818, 3)
    expect(cell.endpoints.observedDecline40).toMatchObject({ met: true, firstDate: d('2021-01-01'), firstValue: 33, confirmedDate: d('2021-06-01'), confirmedValue: 32 })
    expect(cell.endpoints.observedDecline57.met).toBe(false)
    expect(record.endpoint_observed_decline_40).toBe('yes')
  })
})

describe('Theil-Sen projection needs five distinct dates', () => {
  const theilSen = withProjection(theilSenConfig(egfr))

  it('withholds a three-point Theil-Sen projection with its own reason (example)', () => {
    const { cell, record } = cellFor(series(egfr, [['2020-01-01', 40], ['2021-01-01', 39], ['2022-01-01', 30]]), theilSen, 'global-robust')
    // Before: bounds [-9.0, -1.0] (the full range of the three pairwise slopes) and "G5 @ 65.8y".
    expect(cell.endpoints.projectedAgeToCkdG5).toMatchObject({ value: null, reason: 'theil_sen_insufficient_points' })
    expect(cell.endpoints.projectedAgeToCkdG5.slopeCiLow).toBeCloseTo(-9.006, 3)
    expect(record.endpoint_prediction_reason).toBe('theil_sen_insufficient_points')
    expect(endpointBadge(cell.endpoints, cell.points.length)?.label).toBe('G5 n < 5')
  })

  it('counts dates, not rows, and projects from five distinct dates', () => {
    const fourDates = series(egfr, [['2020-01-01', 41], ['2020-01-01', 40], ['2021-01-01', 38], ['2022-01-01', 34], ['2023-01-01', 31]])
    expect(cellFor(fourDates, theilSen, 'global-robust').cell.endpoints.projectedAgeToCkdG5.reason).toBe('theil_sen_insufficient_points')
    const fiveDates = series(egfr, [['2019-01-01', 41], ['2020-01-01', 40], ['2021-01-01', 38], ['2022-01-01', 34], ['2023-01-01', 31]])
    const projected = cellFor(fiveDates, theilSen, 'global-robust').cell.endpoints.projectedAgeToCkdG5
    expect(projected.reason).toBeNull()
    expect(projected.value).not.toBeNull()
  })

  it('leaves OLS at three distinct dates', () => {
    const rows = series(egfr, [['2020-01-01', 40], ['2021-01-01', 39], ['2022-01-01', 30]])
    expect(cellFor(rows, withProjection(generalExplorationConfig(egfr))).cell.endpoints.projectedAgeToCkdG5.reason).toBe('slope_ci_includes_zero')
  })
})

describe('minimum counts count distinct measurement dates', () => {
  // Three rows on one day and one value a year later (General exploration).
  const sameDay = series(egfr, [['2020-01-01', 40], ['2020-01-01', 40.2], ['2020-01-01', 39.8], ['2021-01-01', 30]])

  it('flags the slope as unstable and withholds the projection (example)', () => {
    const { cell, record } = cellFor(sameDay, withProjection(generalExplorationConfig(egfr)))
    expect(cell.nFitted).toBe(4)
    expect(cell.nFittedDates).toBe(2)
    expect(cell.fittedSpanDays).toBe(366)
    // Before: reliable, projection with bounds [-11.0, -9.0] and "G5 @ 62.5y".
    expect(record.unstable_slope).toBe('yes')
    expect(slopeQualityLabel(cell)).toMatchObject({ label: '< 3 dates', caveat: true })
    expect(cell.endpoints.projectedAgeToCkdG5).toMatchObject({ value: null, reason: 'insufficient_points' })
    expect(record.n).toBe(4)
  })

  it('reports distinct fitted dates in the summary without changing nFitted', () => {
    const [summary] = summarizeByBezeichnung(sameDay, 1, 'global')
    expect(summary).toMatchObject({ nNumeric: 4, nFitted: 4, nFittedDates: 2 })
    expect(isUnstableSlope({ ...summary, fitModel: 'ols' })).toBe(true)
    expect(isUnstableSlope({ reason: null, nFitted: 4, nFittedDates: 3, fittedSpanDays: 400, fitModel: 'ols' })).toBe(false)
  })
})
