import { describe, it, expect } from 'vitest'
import { findKdigoAkiEpisodes, kdigoStage } from '../../../src/core/aki/kdigo'
import type { SeriesPoint } from '../../../src/core/stats/series'

const d = (s: string) => new Date(s)

describe('kdigoStage', () => {
  it('grades by peak/baseline ratio with absolute override', () => {
    expect(kdigoStage(1.0, 1.6)).toBe(1)
    expect(kdigoStage(1.0, 2.2)).toBe(2)
    expect(kdigoStage(1.0, 3.1)).toBe(3)
    expect(kdigoStage(3.5, 4.1)).toBe(3)
  })

  it('is self-guarding: returns 0 below the KDIGO floor', () => {
    expect(kdigoStage(2.0, 2.2)).toBe(0)        // ratio 1.1x, rise ~0.2 — no AKI
    expect(kdigoStage(1.5, 1.6)).toBe(0)        // ratio 1.07x, rise ~0.1 — no AKI
    expect(kdigoStage(2.0, 2.5)).toBe(1)        // ratio 1.25x but absolute rise 0.5 — stage 1
    expect(kdigoStage(1.0, 1.5)).toBe(1)        // exactly 1.5x — stage 1
  })
})

describe('findKdigoAkiEpisodes', () => {
  it('detects an absolute >=0.3 rise within 48h', () => {
    const pts: SeriesPoint[] = [
      { date: d('2020-01-01T00:00:00Z'), value: 1.0 },
      { date: d('2020-01-02T00:00:00Z'), value: 1.4 },
    ]
    const eps = findKdigoAkiEpisodes(pts)
    expect(eps).toHaveLength(1)
    expect(eps[0].stage).toBeGreaterThanOrEqual(1)
  })

  it('detects a relative >=1.5x rise within 7 days', () => {
    const pts: SeriesPoint[] = [
      { date: d('2020-01-01T00:00:00Z'), value: 1.0 },
      { date: d('2020-01-05T00:00:00Z'), value: 1.6 },
    ]
    const eps = findKdigoAkiEpisodes(pts)
    expect(eps).toHaveLength(1)
  })

  it('returns no episodes for a stable series', () => {
    const pts: SeriesPoint[] = [
      { date: d('2020-01-01T00:00:00Z'), value: 1.0 },
      { date: d('2020-02-01T00:00:00Z'), value: 1.05 },
      { date: d('2020-03-01T00:00:00Z'), value: 1.0 },
    ]
    expect(findKdigoAkiEpisodes(pts)).toEqual([])
  })
})
