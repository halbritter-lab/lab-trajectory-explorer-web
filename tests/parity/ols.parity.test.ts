import { describe, it, expect } from 'vitest'
import { fitOls } from '../../src/core/stats/ols'
import goldens from '../goldens/ols.json'

interface OlsGolden {
  xYears: number[]
  values: number[]
  slope: number | null
  intercept: number | null
  r2: number | null
  ciLow: number | null
  ciHigh: number | null
  reason: string | null
}

const EPS = 1e-6

function expectClose(got: number, expected: number | null) {
  if (expected === null) {
    expect(Number.isNaN(got)).toBe(true)
  } else {
    expect(Math.abs(got - expected)).toBeLessThanOrEqual(EPS)
  }
}

describe('fitOls golden behavior', () => {
  it.each(goldens as OlsGolden[])('matches expected OLS output for %#', (g) => {
    const fit = fitOls(g.xYears, g.values)
    expect(fit.reason).toBe(g.reason)
    expectClose(fit.slope, g.slope)
    expectClose(fit.intercept, g.intercept)
    expectClose(fit.r2, g.r2)
    expectClose(fit.ciLow, g.ciLow)
    expectClose(fit.ciHigh, g.ciHigh)
  })
})
