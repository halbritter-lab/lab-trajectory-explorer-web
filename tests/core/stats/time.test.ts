import { describe, it, expect } from 'vitest'
import { datesToYears } from '../../../src/core/stats/time'

const DAY = 86_400_000

describe('datesToYears', () => {
  it('returns [] for no dates', () => {
    expect(datesToYears([])).toEqual([])
  })

  it('measures fractional years from the earliest date using a 365.25-day year', () => {
    const t0 = new Date('2020-01-01T00:00:00Z').getTime()
    const out = datesToYears([
      new Date(t0),
      new Date(t0 + 365.25 * DAY),
      new Date(t0 + 2 * 365.25 * DAY),
    ])
    expect(out[0]).toBeCloseTo(0, 10)
    expect(out[1]).toBeCloseTo(1, 10)
    expect(out[2]).toBeCloseTo(2, 10)
  })

  it('uses the minimum date as the origin regardless of input order', () => {
    const t0 = new Date('2021-06-15T00:00:00Z').getTime()
    const [a, b] = datesToYears([new Date(t0 + 365.25 * DAY), new Date(t0)])
    expect(a).toBeCloseTo(1, 10) // first input is one year after the origin
    expect(b).toBeCloseTo(0, 10)
  })
})
