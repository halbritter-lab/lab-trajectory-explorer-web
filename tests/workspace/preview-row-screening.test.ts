import { describe, expect, it } from 'vitest'
import { compareSlopeCells, hasUncertainSlope } from '../../src/workspace/trajectory-ui/rowScreening'

type Cell = Parameters<typeof compareSlopeCells>[0]
const cell = (slope: number, fittedSpanDays = 800, nFittedDates = 4): Cell => ({ slope, reason: null, nFitted: nFittedDates, nFittedDates, fittedSpanDays, fitModel: 'ols' })
const none: Cell = { ...cell(Number.NaN, 0, 1), reason: 'n_below_threshold' }
const sortIds = (cells: Record<string, Cell>, options: Parameters<typeof compareSlopeCells>[2]) =>
  Object.keys(cells).sort((a, b) => compareSlopeCells(cells[a], cells[b], options) || a.localeCompare(b))

describe('hasUncertainSlope', () => {
  it('is true only for a slope that exists and fails the reliability rule', () => {
    expect(hasUncertainSlope(cell(-3))).toBe(false)
    // 364 days fail the rule, 365 pass it.
    expect(hasUncertainSlope(cell(-3, 364))).toBe(true)
    expect(hasUncertainSlope(cell(-3, 365))).toBe(false)
    expect(hasUncertainSlope(cell(-3, 800, 2))).toBe(true)
    // No slope: unstable by the rule, but there is nothing to rank.
    expect(hasUncertainSlope(none)).toBe(false)
    expect(hasUncertainSlope({ ...cell(-3, 100), fitModel: 'none' })).toBe(false)
  })
})

describe('compareSlopeCells', () => {
  // The demo case of the decision: an uncertain -7.35 between reliable declines.
  const cells = { a: cell(-16.53), b: cell(-7.73), u: cell(-7.35, 151), c: cell(-6.2), d: cell(25.29), n: none, v: cell(0.4, 200) }

  it('ranks by value alone when uncertain slopes are not set apart', () => {
    expect(sortIds(cells, { absolute: false, ascending: true, uncertainLast: false })).toEqual(['a', 'b', 'u', 'c', 'v', 'd', 'n'])
  })
  it('puts uncertain slopes in their own block, sorted like the reliable ones', () => {
    expect(sortIds(cells, { absolute: false, ascending: true, uncertainLast: true })).toEqual(['a', 'b', 'c', 'd', 'u', 'v', 'n'])
    expect(sortIds(cells, { absolute: false, ascending: false, uncertainLast: true })).toEqual(['d', 'c', 'b', 'a', 'v', 'u', 'n'])
    expect(sortIds(cells, { absolute: true, ascending: false, uncertainLast: true })).toEqual(['d', 'a', 'b', 'c', 'u', 'v', 'n'])
  })
  it('reports a tie for equal slopes and for two cells without a slope', () => {
    expect(compareSlopeCells(cell(-2), cell(-2), { absolute: false, ascending: true, uncertainLast: true })).toBe(0)
    expect(compareSlopeCells(none, none, { absolute: false, ascending: true, uncertainLast: true })).toBe(0)
  })
})
