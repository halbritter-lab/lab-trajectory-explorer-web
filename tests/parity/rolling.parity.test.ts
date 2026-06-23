import { describe, it, expect } from 'vitest'
import { rollingSlopes } from '../../src/core/stats/rolling'
import type { SeriesPoint } from '../../src/core/stats/series'
import goldens from '../goldens/rolling.json'

interface RollGolden {
  points: { date: string; value: number }[]
  windows: { nInWindow: number; slope: number | null; r2: number | null }[]
}
const EPS = 1e-6

describe('rollingSlopes parity with Python _rolling_slopes_for_series', () => {
  it.each(goldens as RollGolden[])('case %#', (g) => {
    const pts: SeriesPoint[] = g.points.map((p) => ({ date: new Date(p.date), value: p.value }))
    const rolls = rollingSlopes(pts, 730, 180, 3)
    expect(rolls).toHaveLength(g.windows.length)
    rolls.forEach((r, i) => {
      expect(r.nInWindow).toBe(g.windows[i].nInWindow)
      if (g.windows[i].slope !== null) expect(Math.abs(r.slope - g.windows[i].slope!)).toBeLessThanOrEqual(EPS)
    })
  })
})
