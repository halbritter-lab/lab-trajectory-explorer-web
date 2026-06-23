import { describe, it, expect } from 'vitest'
import { fitOls } from '../../../src/core/stats/ols'

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps

describe('fitOls', () => {
  it('returns n_below_threshold for fewer than 3 points', () => {
    const fit = fitOls([0, 1], [1, 2])
    expect(fit.reason).toBe('n_below_threshold')
    expect(Number.isNaN(fit.slope)).toBe(true)
  })

  it('returns identical_timestamps when all x equal', () => {
    const fit = fitOls([2, 2, 2], [1, 2, 3])
    expect(fit.reason).toBe('identical_timestamps')
    expect(Number.isNaN(fit.slope)).toBe(true)
  })

  it('fits a perfect line: slope 2, intercept 1, r2 1', () => {
    const fit = fitOls([0, 1, 2, 3], [1, 3, 5, 7])
    expect(fit.reason).toBeNull()
    expect(close(fit.slope, 2)).toBe(true)
    expect(close(fit.intercept, 1)).toBe(true)
    expect(close(fit.r2, 1)).toBe(true)
  })

  it('computes a 95% CI around the slope (perfect fit → zero width)', () => {
    const fit = fitOls([0, 1, 2, 3], [1, 3, 5, 7])
    expect(close(fit.ciLow, 2)).toBe(true)
    expect(close(fit.ciHigh, 2)).toBe(true)
  })

  it('matches scipy linregress on a noisy series within tolerance', () => {
    // x=[0,1,2,3,4], y=[1,2,1.3,3.75,2.25]; scipy: slope=0.425, intercept=1.21
    const fit = fitOls([0, 1, 2, 3, 4], [1, 2, 1.3, 3.75, 2.25])
    expect(close(fit.slope, 0.425, 1e-6)).toBe(true)
    expect(close(fit.intercept, 1.21, 1e-6)).toBe(true)
  })

  it('uses a Student-t critical value for small-sample 95% slope CI', () => {
    const fit = fitOls([0, 1, 2], [1, 3, 3])
    expect(close(fit.slope, 1, 1e-9)).toBe(true)
    expect(close(fit.ciLow, -6.335930725, 1e-6)).toBe(true)
    expect(close(fit.ciHigh, 8.335930725, 1e-6)).toBe(true)
  })
})
