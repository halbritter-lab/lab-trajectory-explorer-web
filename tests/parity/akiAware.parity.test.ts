import { describe, it, expect } from 'vitest'
import { fitAkiAware } from '../../src/core/aki/akiAware'
import type { SeriesPoint } from '../../src/core/stats/series'
import goldens from '../goldens/aki_aware.json'

interface Golden {
  points: { date: string; value: number }[]
  exclusionDays: number
  keptIdx: number[]
  slope: number | null
  intercept: number | null
  r2: number | null
}
const EPS = 1e-6
const closeOrNaN = (got: number, exp: number | null) =>
  exp === null ? expect(Number.isNaN(got)).toBe(true) : expect(Math.abs(got - exp)).toBeLessThanOrEqual(EPS)

describe('fitAkiAware parity with Python aki-aware-ckd preset', () => {
  it.each(goldens as Golden[])('case %#', (g) => {
    const pts: SeriesPoint[] = g.points.map((p) => ({ date: new Date(p.date), value: p.value }))
    const r = fitAkiAware(pts, g.exclusionDays)
    expect(r.keptIdx).toEqual(g.keptIdx)
    closeOrNaN(r.fit.slope, g.slope)
    closeOrNaN(r.fit.intercept, g.intercept)
    closeOrNaN(r.fit.r2, g.r2)
  })
})
