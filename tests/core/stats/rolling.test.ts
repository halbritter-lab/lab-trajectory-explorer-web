import { describe, it, expect } from 'vitest'
import { rollingSlopes } from '../../../src/core/stats/rolling'
import type { SeriesPoint } from '../../../src/core/stats/series'

const d = (s: string) => new Date(s)

describe('rollingSlopes', () => {
  it('returns empty when the span is shorter than the window', () => {
    const pts: SeriesPoint[] = [
      { date: d('2020-01-01'), value: 1 },
      { date: d('2020-02-01'), value: 2 },
      { date: d('2020-03-01'), value: 3 },
    ]
    expect(rollingSlopes(pts, 730, 180, 3)).toEqual([])
  })

  it('recovers the true per-year slope of a linear series in every window', () => {
    // value = 0.5 per year exactly -> every window slope should be ~0.5/yr, r2~1.
    const start = d('2018-01-01').getTime()
    const DAY = 86_400_000
    const pts: SeriesPoint[] = []
    for (let i = 0; i <= 48; i++) {
      const days = i * 30
      pts.push({ date: new Date(start + days * DAY), value: (days / 365.25) * 0.5 })
    }
    const rolls = rollingSlopes(pts, 730, 180, 3)
    expect(rolls.length).toBeGreaterThan(0)
    for (const r of rolls) {
      expect(r.slope).toBeCloseTo(0.5, 6)
      expect(r.r2).toBeCloseTo(1, 6)
    }
  })

  it('produces window fits over a long, dense series', () => {
    const pts: SeriesPoint[] = []
    const start = d('2018-01-01').getTime()
    for (let i = 0; i < 40; i++) {
      pts.push({ date: new Date(start + i * 60 * 86_400_000), value: i * 0.1 })
    }
    const rolls = rollingSlopes(pts, 730, 180, 3)
    expect(rolls.length).toBeGreaterThan(0)
    for (const r of rolls) {
      expect(r.nInWindow).toBeGreaterThanOrEqual(3)
      expect(r.windowStart.getTime()).toBeLessThanOrEqual(r.windowCenter.getTime())
      expect(r.windowEnd.getTime()).toBeGreaterThanOrEqual(r.windowCenter.getTime())
    }
  })
})
