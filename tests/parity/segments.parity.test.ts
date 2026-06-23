import { describe, it, expect } from 'vitest'
import { fitSegments } from '../../src/core/stats/segments'
import type { SeriesPoint } from '../../src/core/stats/series'
import goldens from '../goldens/segments.json'

interface SegGolden {
  points: { date: string; value: number }[]
  segments: { n: number; fittable: boolean; slope: number | null; intercept: number | null; r2: number | null }[]
}
const EPS = 1e-6
const closeOrNull = (got: number, exp: number | null) =>
  exp === null ? expect(Number.isNaN(got)).toBe(true) : expect(Math.abs(got - exp)).toBeLessThanOrEqual(EPS)

describe('fitSegments parity with Python fit_segments', () => {
  it.each(goldens as SegGolden[])('case %#', (g) => {
    const pts: SeriesPoint[] = g.points.map((p) => ({ date: new Date(p.date), value: p.value }))
    const segs = fitSegments(pts, 180, 3)
    expect(segs).toHaveLength(g.segments.length)
    segs.forEach((s, i) => {
      expect(s.n).toBe(g.segments[i].n)
      expect(s.fittable).toBe(g.segments[i].fittable)
      if (g.segments[i].fittable) {
        closeOrNull(s.slope, g.segments[i].slope)
        closeOrNull(s.r2, g.segments[i].r2)
      }
    })
  })
})
