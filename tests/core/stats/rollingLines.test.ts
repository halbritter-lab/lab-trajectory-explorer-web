import { describe, expect, it } from 'vitest'
import { rollingSlopes } from '../../../src/core/stats/rolling'
import { buildSlopeLines, rollingWindowLine } from '../../../src/core/stats/slopeLines'
import { buildCohortRows, cohortExportRecords, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import { fitGlobal } from '../../../src/core/stats/series'
import type { LabRow } from '../../../src/core/types'

const DAY = 86_400_000
const YEAR = 365.25 * DAY
const day = (date: Date) => date.toISOString().slice(0, 10)
// One value at the start of every quarter from 2018-01-01 to 2022-01-01: flat
// at 60 for two years, then falling by 8 per year from 2020-01-01.
const turn = Date.UTC(2020, 0, 1)
const points = Array.from({ length: 17 }, (_, i) => {
  const date = new Date(Date.UTC(2018, i * 3, 1))
  return { date, value: date.getTime() <= turn ? 60 : 60 - 8 * ((date.getTime() - turn) / YEAR) }
})
const rows: LabRow[] = points.map((p) => ({ patientId: 1, labDatum: p.date, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', wert: String(p.value),
  wertNum: p.value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null }))
const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', mode: 'rolling' }
const config = { mode: 'rolling' as const, gapDays: 180, windowDays: 730, stepDays: 180 }

// Decided 2026-10-07 (formerly OD-2): the window slopes used to be computed and
// discarded, and rolling mode drew no line.
describe('rolling OLS window lines', () => {
  const windows = rollingSlopes(points, 730, 180, 3)

  it('draws one line per window over the central step of the window', () => {
    const lines = buildSlopeLines(points, config)
    expect(windows.map((w) => day(w.windowCenter))).toEqual(['2019-01-01', '2019-06-30', '2019-12-27', '2020-06-24', '2020-12-21'])
    expect(lines).toHaveLength(5)
    lines.forEach((line, i) => {
      expect(line[0].date.getTime()).toBe(windows[i].windowCenter.getTime() - 90 * DAY)
      expect(line[1].date.getTime()).toBe(windows[i].windowCenter.getTime() + 90 * DAY)
      const slope = (line[1].value - line[0].value) / ((line[1].date.getTime() - line[0].date.getTime()) / YEAR)
      expect(slope).toBeCloseTo(windows[i].slope, 10)
    })
    // The lines tile the time axis: each starts where the previous one ended.
    for (let i = 1; i < lines.length; i++) expect(lines[i][0].date.getTime()).toBe(lines[i - 1][1].date.getTime())
  })
  it('follows the local trend: flat in the first window, the full decline in the last', () => {
    expect(windows[0].slope).toBeCloseTo(0, 10)
    expect(windows[4].slope).toBeCloseTo(-8, 10)
    const first = buildSlopeLines(points, config)[0]
    expect(first[0].value).toBeCloseTo(60, 10)
    expect(first[1].value).toBeCloseTo(60, 10)
  })
  it('clips a line to the points of its window and drops it when they miss the central stretch', () => {
    const window = { ...windows[0], firstDate: new Date(windows[0].windowCenter.getTime() - 30 * DAY), lastDate: new Date(windows[0].windowCenter.getTime() + 400 * DAY) }
    const line = rollingWindowLine(window, 180)!
    expect(line[0].date.getTime()).toBe(window.firstDate.getTime())
    expect(line[1].date.getTime()).toBe(window.windowCenter.getTime() + 90 * DAY)
    expect(rollingWindowLine({ ...window, firstDate: new Date(window.windowCenter.getTime() + 100 * DAY) }, 180)).toBeNull()
  })
  it('draws nothing when the fitted span holds no window or the fit is off', () => {
    expect(buildSlopeLines(points.slice(0, 8), config)).toEqual([])  // 2018-01-01 to 2019-10-01: 638 days
    expect(buildSlopeLines(points, { ...config, fitModel: 'none' })).toEqual([])
  })
})

describe('rolling OLS in the cohort cell and the export', () => {
  const cell = buildCohortRows(rows, [1], [spec])[0].cells[0]

  it('keeps the global OLS slope as the reported slope and adds the window statistics', () => {
    const global = fitGlobal(points)
    expect(cell.slope).toBeCloseTo(global.slope, 12)
    expect(cell.r2).toBeCloseTo(global.r2, 12)
    expect(cell.rolling).toMatchObject({ windowDays: 730, stepDays: 180, nWindows: 5 })
    expect(cell.rolling!.slopeMin).toBeCloseTo(-8, 10)
    expect(cell.rolling!.slopeMax).toBeCloseTo(0, 10)
    expect(cell.fitLines).toHaveLength(5)
  })
  it('reports no window for a span under 730 days and nothing for other modes', () => {
    const short = buildCohortRows(rows.slice(0, 8), [1], [spec])[0].cells[0]
    expect(short.rolling).toMatchObject({ nWindows: 0 })
    expect(short.rolling!.slopeMin).toBeNaN()
    expect(short.fitLines).toEqual([])
    expect(buildCohortRows(rows, [1], [{ ...spec, mode: 'global' }])[0].cells[0].rolling).toBeUndefined()
  })
  it('has no rolling summary for a series without a fitted value', () => {
    const bounds = rows.map((row) => ({ ...row, wertOperator: '<' as const }))
    const cell = buildCohortRows(bounds, [1], [spec])[0].cells[0]
    expect(cell.rolling).toBeUndefined()
    expect(cohortExportRecords(buildCohortRows(bounds, [1], [spec]))[0]).toMatchObject({ rolling_windows: '', rolling_window_days: '' })
  })
  it('appends the rolling columns after every other column', () => {
    const [record] = cohortExportRecords(buildCohortRows(rows, [1], [spec]))
    expect(Object.keys(record).slice(-5)).toEqual(['rolling_window_days', 'rolling_step_days', 'rolling_windows', 'rolling_slope_min', 'rolling_slope_max'])
    expect(record).toMatchObject({ slope_mode: 'rolling', fit_model: 'ols', rolling_window_days: 730, rolling_step_days: 180, rolling_windows: 5 })
    expect(record.rolling_slope_min).toBeCloseTo(-8, 10)
    const [short] = cohortExportRecords(buildCohortRows(rows.slice(0, 8), [1], [spec]))
    expect(short).toMatchObject({ rolling_windows: 0, rolling_slope_min: '', rolling_slope_max: '' })
    const [other] = cohortExportRecords(buildCohortRows(rows, [1], [{ ...spec, mode: 'global' }]))
    expect(other).toMatchObject({ rolling_window_days: '', rolling_step_days: '', rolling_windows: '', rolling_slope_min: '', rolling_slope_max: '' })
  })
})
