import { describe, expect, it } from 'vitest'
import { fitOls } from '../../../src/core/stats/ols'
import { fitGlobal, fitTheilSen, type SeriesPoint } from '../../../src/core/stats/series'

// Use exact 365.25-day offsets, independently of the production date helper.
const epoch = Date.UTC(2000, 0, 1)
const points = (years: number[], values: number[]): SeriesPoint[] =>
  years.map((year, i) => ({ date: new Date(epoch + year * 365.25 * 86_400_000), value: values[i] }))

describe('fitTheilSen numeric behavior', () => {
  it.each([
    { name: 'rising', values: [7, 8, 11, 15], slope: 2 },
    { name: 'falling', values: [7, 6, 3, -1], slope: -2 },
    { name: 'constant', values: [7, 7, 7, 7], slope: 0 },
  ])('fits a known $name line with irregular fractional-year spacing', ({ values, slope }) => {
    const fit = fitTheilSen(points([0, 0.5, 2, 4], values))
    expect(fit.slope).toBeCloseTo(slope, 12)
    expect(fit.intercept).toBeCloseTo(7, 12)
    expect(fit.reason).toBeNull()
  })

  it('anchors the intercept to the earliest date without reordering caller data', () => {
    const input = points([3, 0, 2, 1], [13, 7, 11, 9])
    const original = input.map(({ date, value }) => ({ date: new Date(date), value }))
    const fit = fitTheilSen(input)
    expect(fit.slope).toBeCloseTo(2, 12)
    expect(fit.intercept).toBeCloseTo(7, 12)
    expect(input).toEqual(original)
  })

  it('resists a gross endpoint outlier that pulls OLS upward', () => {
    // Four clean points give six slopes of 2; the outlier gives four larger
    // slopes. OLS adds 100 * (4 - mean(x)) / Sxx = 20 to the clean slope.
    const input = points([0, 1, 2, 3, 4], [0, 2, 4, 6, 108])
    const robust = fitTheilSen(input)
    const ols = fitGlobal(input)
    expect(robust.slope).toBeCloseTo(2, 12)
    expect(robust.intercept).toBeCloseTo(0, 12)
    expect(ols.slope).toBeCloseTo(22, 12)
    expect(robust.slope).toBeLessThan(ols.slope)
  })

  it('selects the middle of three pairwise slopes for three points', () => {
    // Pairwise slopes: 2, 5, 8. Residuals at slope 5: 0, -3, 0.
    const fit = fitTheilSen(points([0, 1, 2], [0, 2, 10]))
    expect(fit.slope).toBeCloseTo(5, 12)
    expect(fit.intercept).toBeCloseTo(0, 12)
  })

  it('averages the two middle slopes and residuals for four points', () => {
    // Sorted slopes: 0, 2, 3, 4, 4.5, 5 -> 3.5.
    // Sorted residuals: -3.5, -3, -1.5, 0 -> -2.25.
    // This is the median-residual intercept, not median(y) - slope*median(x)
    // (-3.25), which is the local Python/SciPy reference's default.
    const fit = fitTheilSen(points([0, 1, 2, 3], [0, 0, 4, 9]))
    expect(fit.slope).toBeCloseTo(3.5, 12)
    expect(fit.intercept).toBeCloseTo(-2.25, 12)
  })

  it('skips zero-duration pairs while retaining repeated-date observations', () => {
    // Valid slopes: -8, -1, 2, 4, 6 -> 2; residuals: 0, 10, 0, 4 -> 2.
    // Deduplicating the first date would change the estimate.
    const fit = fitTheilSen(points([0, 0, 1, 2], [0, 10, 2, 8]))
    expect(fit.slope).toBeCloseTo(2, 12)
    expect(fit.intercept).toBeCloseTo(2, 12)
    expect(fit.reason).toBeNull()
  })

  it.each([
    { name: 'empty input', years: [], values: [], reason: 'n_below_threshold' },
    { name: 'one point', years: [0], values: [7], reason: 'n_below_threshold' },
    { name: 'two identical timestamps', years: [0, 0], values: [7, 9], reason: 'identical_timestamps' },
    { name: 'three identical timestamps', years: [0, 0, 0], values: [7, 9, 11], reason: 'identical_timestamps' },
  ])('returns an unavailable fit for $name', ({ years, values, reason }) => {
    expect(fitTheilSen(points(years, values))).toEqual({
      slope: Number.NaN,
      intercept: Number.NaN,
      r2: Number.NaN,
      ciLow: Number.NaN,
      ciHigh: Number.NaN,
      reason,
    })
  })

  it('supports two distinct dates, unlike the fitOls numeric kernel', () => {
    // Characterize the existing web convention; Python Theil-Sen requires n>=3.
    const fit = fitTheilSen(points([0, 2], [7, 3]))
    expect(fit).toEqual({
      slope: -2,
      intercept: 7,
      r2: Number.NaN,
      ciLow: Number.NaN,
      ciHigh: Number.NaN,
      reason: null,
    })
    expect(fitOls([0, 2], [7, 3]).reason).toBe('n_below_threshold')
  })

  it('uses the OLS reason vocabulary for shared failure cases', () => {
    for (const [years, values] of [[[], []], [[0], [7]], [[0, 0, 0], [7, 9, 11]]]) {
      expect(fitTheilSen(points(years, values))).toEqual(fitOls(years, values))
    }
  })

  it('returns null reason but unavailable CI and R² for a successful fit', () => {
    const years = [0, 1, 2, 3]
    const values = [0, 0, 4, 9]
    const robust = fitTheilSen(points(years, values))
    const ols = fitOls(years, values)
    expect(robust.reason).toBeNull()
    expect(ols.reason).toBeNull()
    expect(robust.ciLow).toBeNaN()
    expect(robust.ciHigh).toBeNaN()
    expect(robust.r2).toBeNaN()
    // Missing robust uncertainty must not be mistaken for a zero-width CI.
    expect(Number.isFinite(ols.ciLow)).toBe(true)
    expect(Number.isFinite(ols.ciHigh)).toBe(true)
    expect(ols.ciLow).toBeLessThan(ols.ciHigh)
    expect(Number.isFinite(ols.r2)).toBe(true)
  })
})
