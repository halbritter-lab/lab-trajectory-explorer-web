import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { anchorEvent, anchorRuleLabel, compareAtAnchor, differenceInterval, type AnchorSide } from '../../../src/core/cohort/anchorComparison'
import { buildCohortRows, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import { clinicalEventsByPatient, cohortSeriesSpec } from '../../../src/core/cohort/specs'
import { generalExplorationConfig } from '../../../src/core/analysis/fitConfig'
import { ckdProgressionConfig } from '../../../src/core/domains/nephrology/fitConfig'
import { computeAnalysisResult, defaultAnalysisSettings } from '../../../src/core/analysis/registry'
import { loadDatasetFromWorkbook } from '../../../src/io/loadDataset'
import type { ClinicalEvent } from '../../../src/core/events/events'
import type { LabRow } from '../../../src/core/types'
import type { SeriesPoint } from '../../../src/core/stats/series'

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const YEAR = 365.25 * 86_400_000
const event = (date: string, title = 'Start', type: ClinicalEvent['type'] = 'other', patientId: string | number = 'P'): ClinicalEvent =>
  ({ patientId, type, date: day(date), title, description: null, endDate: null, intent: null, warning: '' } as ClinicalEvent)
const point = (date: string, value: number): SeriesPoint => ({ date: day(date), value })
/** Exactly linear points: value = start + slope × years since `origin`. */
const linear = (dates: string[], origin: string, start: number, slope: number) =>
  dates.map(date => point(date, start + slope * (day(date).getTime() - day(origin).getTime()) / YEAR))
const compare = (points: SeriesPoint[], events: ClinicalEvent[], extra: Partial<Parameters<typeof compareAtAnchor>[0]> = {}) => compareAtAnchor({
  points, available: points.map(() => true), events, settings: { rule: { kind: 'first' }, exclusionDays: 0 }, fitModel: 'ols', timeBalancing: 'raw', ...extra,
})

describe('anchor event', () => {
  const events = [event('2022-03-01', 'B', 'dialysis'), event('2021-06-01', 'A', 'other'), event('2021-06-01', 'C', 'other'), event('2023-01-01', 'B', 'kidney_transplant')]
  it('is the earliest event, the first in file order among events of one date', () => {
    expect(anchorEvent(events, { kind: 'first' })?.title).toBe('A')
  })
  it('is the first event with the chosen title or type, compared exactly', () => {
    expect(anchorEvent(events, { kind: 'title', value: 'B' })?.date).toEqual(day('2022-03-01'))
    expect(anchorEvent(events, { kind: 'type', value: 'kidney_transplant' })?.date).toEqual(day('2023-01-01'))
    expect(anchorEvent(events, { kind: 'title', value: 'b' })).toBeNull()
    expect(anchorEvent(events, { kind: 'title', value: 'B ' })).toBeNull()
    expect(anchorEvent([], { kind: 'first' })).toBeNull()
  })
  it('names the rule', () => {
    expect(anchorRuleLabel({ kind: 'first' })).toBe('first event')
    expect(anchorRuleLabel({ kind: 'title', value: 'ACE inhibitor start' })).toBe('first event titled “ACE inhibitor start”')
    expect(anchorRuleLabel({ kind: 'type', value: 'kidney_transplant' })).toBe('first event of type kidney_transplant')
  })
})

describe('before/after comparison', () => {
  const before = linear(['2020-01-01', '2020-07-01', '2021-01-01', '2021-07-01'], '2020-01-01', 80, -10)
  const after = linear(['2021-08-01', '2022-02-01', '2022-08-01'], '2021-08-01', 60, 2)
  it('fits each side with the column estimator and reports after − before', () => {
    const result = compare([...before, ...after], [event('2021-07-15')])
    expect(result.before!.slope).toBeCloseTo(-10, 9)
    expect(result.after!.slope).toBeCloseTo(2, 9)
    expect(result.difference).toBeCloseTo(12, 9)
    expect(result.before).toMatchObject({ nFitted: 4, nFittedDates: 4, fittedSpanDays: 547, firstDate: day('2020-01-01'), lastDate: day('2021-07-01') })
    expect(result.after).toMatchObject({ nFitted: 3, fittedSpanDays: 365, firstDate: day('2021-08-01') })
  })

  it('counts a measurement on the anchor date as before', () => {
    const result = compare([...before, ...after], [event('2021-07-01')])
    expect(result.before!.lastDate).toEqual(day('2021-07-01'))
    expect(result.before!.nFitted).toBe(4)
    expect(result.after!.nFitted).toBe(3)
  })

  it('leaves the days anchor + 1 to anchor + window out of the after side only, both included', () => {
    const points = [...before, point('2021-07-02', 40), point('2021-07-15', 41), point('2021-07-16', 59), ...after]
    const none = compare(points, [event('2021-07-01')])
    expect(none.windowIdx).toEqual([])
    expect(none.after!.nFitted).toBe(6)
    const window = compare(points, [event('2021-07-01')], { settings: { rule: { kind: 'first' }, exclusionDays: 14 } })
    expect(window.windowIdx).toEqual([4, 5])
    expect(window.after!.firstDate).toEqual(day('2021-07-16'))
    expect(window.after!.nFitted).toBe(4)
    expect(window.before!.nFitted).toBe(4)
  })

  it('uses only the points the column fit can use', () => {
    const points = [...before, ...after]
    const result = compare(points, [event('2021-07-15')], { available: points.map((_, i) => i !== 0) })
    expect(result.before!.nFitted).toBe(3)
    expect(result.before!.firstDate).toEqual(day('2020-07-01'))
  })

  it('balances each side on its own: a month with the anchor gives one median per side', () => {
    const points = [point('2021-05-10', 50), point('2021-06-02', 48), point('2021-06-03', 46), point('2021-06-20', 70), point('2021-06-25', 72), point('2021-07-10', 71)]
    const result = compare(points, [event('2021-06-03')], { timeBalancing: 'monthly-median' })
    expect(result.before).toMatchObject({ nFitted: 2, lastDate: day('2021-06-02') })
    expect(result.after).toMatchObject({ nFitted: 2, firstDate: day('2021-06-20') })
  })

  it('reports Theil-Sen sides with their bounds and no interval for the difference', () => {
    const result = compare([...before, ...after], [event('2021-07-15')], { fitModel: 'theil-sen' })
    expect(result.before!.slope).toBeCloseTo(-10, 9)
    expect(Number.isFinite(result.before!.ciLow)).toBe(true)
    expect(result.before!.slopeSe).toBeNaN()
    expect(result.difference).toBeCloseTo(12, 9)
    expect(result.differenceCiLow).toBeNaN()
  })

  it('has no interval for the difference when a side is the exact two-point line', () => {
    const result = compare([...before, ...after.slice(0, 2)], [event('2021-07-15')])
    expect(result.after!.nFitted).toBe(2)
    expect(result.after!.slope).toBeCloseTo(2, 9)
    expect(result.after!.ciLow).toBeNaN()
    expect(result.difference).toBeCloseTo(12, 9)
    expect(result.differenceCiLow).toBeNaN()
  })

  it('reports the anchor but no sides without a fit, and nothing without an anchor', () => {
    const noFit = compare([...before, ...after], [event('2021-07-15')], { fitModel: 'none', settings: { rule: { kind: 'first' }, exclusionDays: 30 } })
    expect(noFit.anchor?.date).toEqual(day('2021-07-15'))
    expect(noFit.before).toBeNull()
    expect(noFit.windowIdx).toEqual([])
    const missing = compare([...before, ...after], [event('2021-07-15')], { settings: { rule: { kind: 'type', value: 'kidney_transplant' }, exclusionDays: 0 } })
    expect(missing.anchor).toBeNull()
    expect(missing.before).toBeNull()
    expect(missing.difference).toBeNaN()
  })
})

describe('interval of the difference', () => {
  const side = (slope: number, slopeSe: number, nFitted: number): AnchorSide => ({ slope, slopeSe, nFitted, nFittedDates: nFitted, fittedSpanDays: 365, firstDate: null, lastDate: null, ciLow: Number.NaN, ciHigh: Number.NaN })
  it('is the Welch interval from the two standard errors', () => {
    // SE 1 and 2, n 5 and 12: ν = 25 / (1/3 + 16/10) = 12.93 → 12 → t = 2.17881283.
    const [low, high] = differenceInterval(side(-10, 1, 5), side(-4, 2, 12))
    const half = 2.17881283 * Math.sqrt(5)
    expect(low).toBeCloseTo(6 - half, 9)
    expect(high).toBeCloseTo(6 + half, 9)
  })
  it('is a single value when both standard errors are zero, and missing without one', () => {
    expect(differenceInterval(side(-10, 0, 3), side(-4, 0, 3))).toEqual([6, 6])
    expect(differenceInterval(side(-10, Number.NaN, 2), side(-4, 1, 5)).every(Number.isNaN)).toBe(true)
  })
})

describe('before/after comparison in cohort cells', () => {
  const lab = (date: string, value: number): LabRow => ({ patientId: 'P', labDatum: day(date), bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: 60 })
  const rows = ['2020-01-01', '2020-07-01', '2021-01-01', '2021-07-01', '2021-08-01', '2022-02-01', '2022-08-01'].map((date, i) => lab(date, [60, 56, 51, 47, 46, 45, 44][i]))
  const parameter = { bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²' }
  const events = [event('2021-07-01', 'Transplant', 'kidney_transplant')]
  const spec = (config = generalExplorationConfig(parameter), exclusionDays = 0): CohortSeriesSpec =>
    ({ ...cohortSeriesSpec(parameter, config, { clinicalEventsByPatient: clinicalEventsByPatient(events) }), anchorComparison: { rule: { kind: 'first' }, exclusionDays } })

  // Since 2026-11-22 every preset censors from a transplant on; a column that
  // includes those values fits them as a separate segment, and the comparison
  // uses them for its after side.
  const including = { ...generalExplorationConfig(parameter), censoring: { ...generalExplorationConfig(parameter).censoring, censorAfterKidneyTransplant: false } }

  it('has no after side at a transplant under the default censoring of General exploration', () => {
    const cell = buildCohortRows(rows, ['P'], [spec()])[0].cells[0]
    expect(cell.anchorComparison!.before!.nFitted).toBe(3)
    expect(cell.anchorComparison!.after!.nFitted).toBe(0)
    expect(cell.krtSegment).toBeUndefined()
  })

  it('is an additional result: slope, exclusions and counts of the column stay as without it', () => {
    const plain = buildCohortRows(rows, ['P'], [{ ...spec(including), anchorComparison: undefined }])[0].cells[0]
    const cell = buildCohortRows(rows, ['P'], [spec(including, 40)])[0].cells[0]
    expect(plain.anchorComparison).toBeUndefined()
    expect(cell.slope).toBe(plain.slope)
    expect(cell.ciLow).toBe(plain.ciLow)
    expect(cell.nFitted).toBe(plain.nFitted)
    expect(cell.pointExclusionReasons).toEqual(plain.pointExclusionReasons)
    expect(cell.anchorComparison!.windowIdx).toEqual([4])
    expect(cell.anchorComparison!.after!.nFitted).toBe(2)
  })

  it('applies the column censoring to both sides', () => {
    const cell = buildCohortRows(rows, ['P'], [spec(ckdProgressionConfig(parameter))])[0].cells[0]
    // CKD progression censors from the transplant on; the anchor day itself is before and censored too.
    expect(cell.anchorComparison!.before!.lastDate).toEqual(day('2021-01-01'))
    expect(cell.anchorComparison!.after!.nFitted).toBe(0)
    expect(cell.anchorComparison!.after!.slope).toBeNaN()
    expect(cell.anchorComparison!.difference).toBeNaN()
  })
})

describe('demo workbook example (method reference)', () => {
  const buffer = readFileSync(resolve(__dirname, '../../../public/test_labs.xlsx'))
  const dataset = loadDatasetFromWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  const analysis = computeAnalysisResult({ rows: dataset.rows, manualDemographics: {}, patientAttributes: dataset.patientAttributes, events: dataset.events, settings: defaultAnalysisSettings() })
  const parameter = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }
  const cellFor = (patientId: number, exclusionDays: number) => buildCohortRows(analysis.rows, [patientId], [{
    ...cohortSeriesSpec(parameter, { ...generalExplorationConfig(parameter), censoring: { ...generalExplorationConfig(parameter).censoring, censorAfterKidneyTransplant: false } }, { clinicalEventsByPatient: clinicalEventsByPatient(dataset.events) }),
    anchorComparison: { rule: { kind: 'type', value: 'kidney_transplant' }, exclusionDays },
  }])[0].cells[0]

  it('patient 13, imported eGFR, general exploration with the values after the transplant included, anchor of type kidney_transplant', () => {
    const cell = cellFor(13, 0)
    const comparison = cell.anchorComparison!
    expect(comparison.anchor?.date).toEqual(day('2022-07-01'))
    // The column's slope is that of the values before the transplant since
    // 2026-11-22 (4.372 across it before); the values after it are a separate segment.
    expect(cell.slope).toBeCloseTo(-12.828, 3)
    expect(cell.krtSegment!.fit).toMatchObject({ nFitted: 3, fittedSpanDays: 365 })
    expect(cell.krtSegment!.fit.slope).toBeCloseTo(-8.005, 3)
    expect(comparison.before).toMatchObject({ nFitted: 6, fittedSpanDays: 882 })
    expect(comparison.before!.slope).toBeCloseTo(-12.828, 3)
    expect(comparison.before!.ciLow).toBeCloseTo(-13.320, 3)
    expect(comparison.before!.ciHigh).toBeCloseTo(-12.337, 3)
    expect(comparison.after).toMatchObject({ nFitted: 3, fittedSpanDays: 365 })
    expect(comparison.after!.slope).toBeCloseTo(-8.005, 3)
    expect(comparison.after!.ciLow).toBeCloseTo(-8.488, 3)
    expect(comparison.after!.ciHigh).toBeCloseTo(-7.523, 3)
    expect(comparison.difference).toBeCloseTo(4.823, 3)
    expect(comparison.differenceCiLow).toBeCloseTo(4.320, 3)
    expect(comparison.differenceCiHigh).toBeCloseTo(5.326, 3)
  })

  it('patient 13 with a 60-day window: the value of 2022-08-10 leaves the after side', () => {
    const comparison = cellFor(13, 60).anchorComparison!
    expect(comparison.windowIdx).toHaveLength(1)
    expect(comparison.after).toMatchObject({ nFitted: 2, firstDate: day('2023-02-10') })
    // 68 to 64 over 181 days: −4 / (181 / 365.25), the exact two-point line.
    expect(comparison.after!.slope).toBeCloseTo(-8.072, 3)
    expect(comparison.difference).toBeCloseTo(4.757, 3)
    expect(comparison.differenceCiLow).toBeNaN()
  })

  it('patient 2 has no event in this demo workbook', () => {
    expect(dataset.events.some(item => String(item.patientId) === '2')).toBe(false)
  })
})
