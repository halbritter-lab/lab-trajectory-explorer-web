import { describe, expect, it } from 'vitest'
import { buildCohortRows, cohortExportRecords, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import { doublingTime, logTransformedRows } from '../../../src/core/cohort/logTrend'
import { generalExplorationConfig } from '../../../src/core/analysis/fitConfig'
import type { LabRow } from '../../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'CEA', einheit: 'ng/ml',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null, ...p }
}
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const parameter = { bezeichnung: 'CEA', einheit: 'ng/ml' }
const spec = (extra: Partial<CohortSeriesSpec> = {}): CohortSeriesSpec => ({ ...parameter, mode: 'global', fitConfig: generalExplorationConfig(parameter), ...extra })
/** Worked example of the method reference: CEA every six months. */
const example = [['2021-01-04', 2.0], ['2021-07-05', 2.6], ['2022-01-03', 3.9], ['2022-07-04', 5.1], ['2023-01-02', 7.8]] as const
const exampleRows = example.map(([date, value]) => row({ labDatum: day(date), wertNum: value, wert: String(value) }))

describe('doubling time', () => {
  it('is ln 2 / slope: positive for doubling, negative for halving', () => {
    expect(doublingTime(Math.LN2 / 4, Number.NaN, Number.NaN).years).toBeCloseTo(4, 12)
    expect(doublingTime(-Math.LN2 / 2, Number.NaN, Number.NaN).years).toBeCloseTo(-2, 12)
  })
  it('has no value for a slope of zero or a missing slope', () => {
    expect(doublingTime(0, -1, 1).years).toBeNaN()
    expect(doublingTime(Number.NaN, 0.1, 0.2).years).toBeNaN()
  })
  it('takes its interval from the slope bounds, unbounded when they include zero', () => {
    expect(doublingTime(0.3, 0.1, 0.5)).toEqual({ years: Math.LN2 / 0.3, ciLow: Math.LN2 / 0.5, ciHigh: Math.LN2 / 0.1 })
    expect(doublingTime(-0.3, -0.5, -0.1)).toEqual({ years: Math.LN2 / -0.3, ciLow: Math.LN2 / -0.1, ciHigh: Math.LN2 / -0.5 })
    const open = doublingTime(0.3, -0.1, 0.5)
    expect(open.ciLow).toBeNaN(); expect(open.ciHigh).toBeNaN()
    const touching = doublingTime(0.3, 0, 0.5)
    expect(touching.ciLow).toBeNaN()
  })
})

describe('log trend of a cell', () => {
  it('is absent unless the spec asks for it, and leaves the column unchanged', () => {
    const [off] = buildCohortRows(exampleRows, [1], [spec()])
    const [on] = buildCohortRows(exampleRows, [1], [spec({ logTrend: true })])
    expect(off.cells[0].logTrend).toBeUndefined()
    const { logTrend, ...rest } = on.cells[0]
    expect(logTrend).toBeDefined()
    expect(rest).toEqual(off.cells[0])
    expect(cohortExportRecords([on])).toEqual(cohortExportRecords([off]))
  })

  it('doubles every four years for 10, 20, 40 four years apart', () => {
    const rows = [['2020-01-01', 10], ['2024-01-01', 20], ['2028-01-01', 40]].map(([date, value]) => row({ labDatum: day(date as string), wertNum: value as number }))
    const trend = buildCohortRows(rows, [1], [spec({ logTrend: true })])[0].cells[0].logTrend!
    expect(trend.slope).toBeCloseTo(Math.LN2 / 4, 12)
    expect(trend.doublingTimeYears).toBeCloseTo(4, 10)
    // Back-transformed fit line: straight on a log axis, through the values.
    expect(trend.fitLines[0][0].value).toBeCloseTo(10, 10)
    expect(trend.fitLines[0][1].value).toBeCloseTo(40, 10)
  })

  it('matches the worked example of the method reference', () => {
    const trend = buildCohortRows(exampleRows, [1], [spec({ logTrend: true })])[0].cells[0].logTrend!
    expect(trend.nFitted).toBe(5)
    expect(trend.slope).toBeCloseTo(0.68147, 5)
    expect(trend.ciLow).toBeCloseTo(0.58220, 5)
    expect(trend.ciHigh).toBeCloseTo(0.78074, 5)
    expect(Math.exp(trend.intercept)).toBeCloseTo(1.9338, 4)
    expect(trend.doublingTimeYears).toBeCloseTo(1.0171, 4)
    expect(trend.doublingCiLow).toBeCloseTo(0.8878, 4)
    expect(trend.doublingCiHigh).toBeCloseTo(1.1906, 4)
  })

  it('leaves out values of zero or less and treats bounds by the column setting', () => {
    const rows = [...exampleRows, row({ labDatum: day('2023-07-03'), wertNum: 0, wert: '0' }), row({ labDatum: day('2023-08-01'), wertNum: 20, wert: '>20', wertOperator: '>' })]
    const excluded = buildCohortRows(rows, [1], [spec({ logTrend: true, fitConfig: { ...generalExplorationConfig(parameter), boundedValues: 'exclude' } })])[0].cells[0]
    expect(excluded.logTrend!.nNonPositive).toBe(1)
    expect(excluded.logTrend!.nFitted).toBe(5)
    expect(excluded.logTrend!.slope).toBeCloseTo(0.68147, 5)
    // Issue #73: under the default 'limit' the bound enters at ln 20.
    const limit = buildCohortRows(rows, [1], [spec({ logTrend: true })])[0].cells[0]
    expect(limit.logTrend!.nNonPositive).toBe(1)
    expect(limit.logTrend!.nFitted).toBe(6)
  })

  it('uses the column estimator: Theil-Sen on log values', () => {
    const cell = buildCohortRows(exampleRows, [1], [spec({ logTrend: true, mode: 'global-robust', fitConfig: { ...generalExplorationConfig(parameter), fitModel: 'theil-sen' } })])[0].cells[0]
    expect(cell.fitModel).toBe('theil-sen')
    // The median of the ten pairwise slopes of the log values.
    const years = example.map(([date]) => (day(date).getTime() - day(example[0][0]).getTime()) / (365.25 * 86_400_000))
    const logs = example.map(([, value]) => Math.log(value))
    const pairs = years.flatMap((x, i) => years.slice(i + 1).map((y, j) => (logs[i + 1 + j] - logs[i]) / (y - x))).sort((a, b) => a - b)
    expect(cell.logTrend!.slope).toBeCloseTo((pairs[4] + pairs[5]) / 2, 12)
    expect(cell.logTrend!.doublingTimeYears).toBeCloseTo(1.0202, 4)
  })

  it('has no doubling time without a fit', () => {
    const cell = buildCohortRows(exampleRows, [1], [spec({ logTrend: true, fitConfig: { ...generalExplorationConfig(parameter), fitModel: 'none' } })])[0].cells[0]
    expect(cell.logTrend!.doublingTimeYears).toBeNaN()
    expect(cell.logTrend!.fitLines).toEqual([])
  })

  it('transforms only the rows of the series', () => {
    const other = row({ bezeichnung: 'Other', wertNum: -3 })
    const { rows, nNonPositive } = logTransformedRows([...exampleRows, other], r => r.bezeichnung === 'CEA')
    expect(nNonPositive).toBe(0)
    expect(rows.at(-1)).toBe(other)
    expect(rows[0].wertNum).toBeCloseTo(Math.log(2), 12)
  })
})
