import { describe, expect, it } from 'vitest'
import { niceTicks } from '../../src/workspace/plot-ticks'

describe('niceTicks', () => {
  it('uses round steps inside the range and leaves the range alone', () => {
    expect(niceTicks(0, 96.9)).toEqual([0, 20, 40, 60, 80])
    expect(niceTicks(0, 4.2)).toEqual([0, 1, 2, 3, 4])
    expect(niceTicks(16.7, 104.2)).toEqual([20, 40, 60, 80, 100])
    expect(niceTicks(-0.42, 6, 5)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
  it('handles small steps without floating-point drift', () => {
    expect(niceTicks(0, 0.5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5])
    expect(niceTicks(1.02, 1.08)).toEqual([1.02, 1.04, 1.06, 1.08])
  })
  it('handles negative ranges and an empty span', () => {
    expect(niceTicks(-30, 10)).toEqual([-30, -20, -10, 0, 10])
    expect(niceTicks(5, 5)).toEqual([5])
    expect(niceTicks(Number.NaN, 5)).toEqual([])
  })
})
