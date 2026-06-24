import { describe, it, expect } from 'vitest'
import { datesToYears } from '../../../src/core/stats/time'
import { fitGlobal } from '../../../src/core/stats/series'

const d = (s: string) => new Date(s)

describe('datesToYears', () => {
  it('expresses days as fractional years from the first date', () => {
    const ys = datesToYears([d('2000-01-01'), d('2001-01-01'), d('2000-07-01')])
    expect(ys[0]).toBe(0)
    expect(Math.abs(ys[1] - 366 / 365.25)).toBeLessThan(1e-9) // 2000 is a leap year
  })
})

describe('fitGlobal', () => {
  it('fits OLS over the whole series in years', () => {
    const pts = [
      { date: d('2000-01-01'), value: 1 },
      { date: d('2001-01-01'), value: 2 },
      { date: d('2002-01-01'), value: 3 },
    ]
    const fit = fitGlobal(pts)
    expect(fit.reason).toBeNull()
    expect(fit.slope).toBeGreaterThan(0.9)
    expect(fit.slope).toBeLessThan(1.1)
  })

  it('computes an exact two-point slope without confidence interval', () => {
    const fit = fitGlobal([
      { date: d('2000-01-01'), value: 1 },
      { date: d('2001-01-01'), value: 2 },
    ])
    expect(fit.reason).toBeNull()
    expect(fit.slope).toBeGreaterThan(0.9)
    expect(fit.slope).toBeLessThan(1.1)
    expect(fit.r2).toBe(1)
    expect(Number.isNaN(fit.ciLow)).toBe(true)
    expect(Number.isNaN(fit.ciHigh)).toBe(true)
  })

  it('returns n_below_threshold for one point', () => {
    const fit = fitGlobal([{ date: d('2000-01-01'), value: 1 }])
    expect(fit.reason).toBe('n_below_threshold')
  })
})
