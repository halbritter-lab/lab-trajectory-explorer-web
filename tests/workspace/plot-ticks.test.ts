import { describe, expect, it } from 'vitest'
import { niceTicks, tickLabels } from '../../src/workspace/plot-ticks'

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
  it('labels with two decimals at most, and with more only for a finer step', () => {
    expect(tickLabels(niceTicks(0, 96.9))).toEqual(['0', '20', '40', '60', '80'])
    expect(tickLabels(niceTicks(40.55, 42.55))).toEqual(['41', '41.5', '42', '42.5'])
    expect(tickLabels(niceTicks(1000, 9000))).toEqual(['2,000', '4,000', '6,000', '8,000'])
    // A zoomed small-valued series: 0.085 and 0.09 must not both read 0.09.
    expect(tickLabels(niceTicks(0.078, 0.102))).toEqual(['0.08', '0.085', '0.09', '0.095', '0.1'])
    expect(new Set(tickLabels(niceTicks(0, 0.03, 5))).size).toBe(niceTicks(0, 0.03, 5).length)
  })
})
