import { describe, expect, it } from 'vitest'
import { fitTheilSen } from '../../src/core/stats/series'
import goldens from '../goldens/theil_sen.json'

// Full estimator-field parity with the recorded Python reference fixture.
describe('fitTheilSen Python estimator parity', () => {
  it.each(goldens)('$name', (g) => {
    const points = g.xYears.map((year, i) => ({
      date: new Date(Date.UTC(2000, 0, 1) + year * 365.25 * 86_400_000),
      value: g.values[i],
    }))
    const fit = fitTheilSen(points)
    expect(fit.reason).toBe(g.reason)
    for (const key of ['intercept', 'ciLow', 'ciHigh'] as const) {
      if (g[key] === null) expect(fit[key]).toBeNaN()
      else expect(fit[key]).toBeCloseTo(g[key], 10)
    }
    if (g.slope === null) expect(fit.slope).toBeNaN()
    else expect(fit.slope).toBeCloseTo(g.slope, 10)
    if (g.r2 === null) expect(fit.r2).toBeNaN()
    else expect(fit.r2).toBeCloseTo(g.r2, 10)
  })
})
