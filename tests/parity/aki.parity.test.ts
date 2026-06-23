import { describe, it, expect } from 'vitest'
import { findKdigoAkiEpisodes } from '../../src/core/aki/kdigo'
import type { SeriesPoint } from '../../src/core/stats/series'
import goldens from '../goldens/aki.json'

interface AkiGolden {
  points: { date: string; value: number }[]
  episodes: { date: string; stage: number; criterion: string }[]
}

describe('findKdigoAkiEpisodes parity', () => {
  it.each(goldens as AkiGolden[])('case %#', (g) => {
    const pts: SeriesPoint[] = g.points.map((p) => ({ date: new Date(p.date), value: p.value }))
    const eps = findKdigoAkiEpisodes(pts)
    expect(eps).toHaveLength(g.episodes.length)
    eps.forEach((e, i) => {
      expect(e.stage).toBe(g.episodes[i].stage)
      expect(e.criterion).toBe(g.episodes[i].criterion)
      expect(e.date.getTime()).toBe(new Date(g.episodes[i].date).getTime())
    })
  })
})
