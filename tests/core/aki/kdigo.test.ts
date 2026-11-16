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

// Decided 2026-11-16: the stage is graded against the lowest value of the
// seven days before a crossing, not against the 48-hour detection baseline.
describe('findKdigoAkiEpisodes staging against the seven-day minimum', () => {
  const day = (n: number) => new Date(Date.UTC(2024, 0, 1 + n))
  const run = (pts: [number, number][]) => findKdigoAkiEpisodes(pts.map(([n, value]) => ({ date: day(n), value })))

  it('does not lower the stage when a value the day before the peak exists', () => {
    // 3.2 / 1.0 = 3.2-fold. The 48-hour criterion fires against 1.2 (2.67-fold, formerly stage 2).
    expect(run([[0, 1.0], [3, 1.2], [4, 3.2]])).toMatchObject([
      { date: day(4), baselineDate: day(3), baselineValue: 1.2, peakValue: 3.2, criterion: 'absolute_0_3_mg_dl_48h', stage: 3 },
    ])
    expect(run([[0, 1.0], [4, 3.2]])).toMatchObject([{ baselineValue: 1.0, criterion: 'relative_1_5x_7d', stage: 3 }])
  })

  it('keeps two episodes when the baseline moves and stages each against its seven-day minimum', () => {
    // The second episode is detected against 2.9 and was stage 1; 3.2 / 1.0 is stage 3.
    expect(run([[0, 1.0], [5, 2.9], [6, 3.2]])).toMatchObject([
      { date: day(5), baselineDate: day(0), peakValue: 2.9, stage: 2 },
      { date: day(6), baselineDate: day(5), baselineValue: 2.9, peakValue: 3.2, stage: 3 },
    ])
  })

  it('reports the highest stage reached by any crossing of an episode', () => {
    // Day 7: 3.1 against the seven-day minimum 1.0 (exactly seven days back, still inside) is stage 3.
    // Day 8: 3.3 is the peak, but 1.0 has left the window; 3.3 / 1.4 = 2.36-fold is stage 2.
    expect(run([[0, 1.0], [6, 1.4], [7, 3.1], [8, 3.3]])).toMatchObject([
      { date: day(7), baselineDate: day(6), baselineValue: 1.4, peakValue: 3.3, peakDate: day(8), stage: 3 },
    ])
  })

  it('changes nothing when the seven-day minimum is the detection baseline', () => {
    expect(run([[0, 1.0], [1, 1.4]])).toMatchObject([{ baselineValue: 1.0, stage: 1 }])
    expect(run([[0, 1.0], [1, 2.1]])).toMatchObject([{ baselineValue: 1.0, stage: 2 }])
  })
})
