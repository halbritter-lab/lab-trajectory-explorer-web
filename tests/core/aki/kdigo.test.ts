import { describe, it, expect } from 'vitest'
import { findKdigoAkiEpisodes, kdigoStage } from '../../../src/core/domains/nephrology/aki/kdigo'
import type { SeriesPoint } from '../../../src/core/stats/series'

const d = (s: string) => new Date(s)

describe('kdigoStage', () => {
  it('keeps an exact 0.3 mg/dl rise at the stage-1 floor despite binary rounding', () => {
    expect(kdigoStage(1.1, 1.4)).toBe(1)
    expect(kdigoStage(1.1, 1.399999)).toBe(0)
  })
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
  it('detects an exact 0.3 mg/dl rise but not a clinically smaller rise', () => {
    const baseline = { date: d('2020-01-01T00:00:00Z'), value: 1.1 }
    expect(findKdigoAkiEpisodes([baseline, { date: d('2020-01-02T00:00:00Z'), value: 1.4 }])).toMatchObject([
      { criterion: 'absolute_0_3_mg_dl_48h', stage: 1 },
    ])
    expect(findKdigoAkiEpisodes([baseline, { date: d('2020-01-02T00:00:00Z'), value: 1.399999 }])).toEqual([])
  })

  it('detects an exact 1.5-fold rise after 48 hours but not a smaller ratio', () => {
    const baseline = { date: d('2020-01-01T00:00:00Z'), value: 0.7 }
    expect(findKdigoAkiEpisodes([baseline, { date: d('2020-01-04T00:00:00Z'), value: 0.7 * 1.5 }])).toMatchObject([
      { criterion: 'relative_1_5x_7d', stage: 1 },
    ])
    expect(findKdigoAkiEpisodes([baseline, { date: d('2020-01-04T00:00:00Z'), value: 1.049999 }])).toEqual([])
  })
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
