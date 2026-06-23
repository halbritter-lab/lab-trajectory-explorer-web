import { describe, it, expect } from 'vitest'
import { splitIntoSegments, fitSegments } from '../../../src/core/stats/segments'
import type { SeriesPoint } from '../../../src/core/stats/series'

const d = (s: string) => new Date(s)

describe('splitIntoSegments', () => {
  it('returns one segment when no gap exceeds threshold', () => {
    const dates = [d('2020-01-01'), d('2020-03-01'), d('2020-05-01')]
    expect(splitIntoSegments(dates, 180)).toEqual([[0, 3]])
  })

  it('splits where a gap exceeds gapDays', () => {
    const dates = [d('2020-01-01'), d('2020-02-01'), d('2021-06-01')]
    expect(splitIntoSegments(dates, 180)).toEqual([[0, 2], [2, 3]])
  })

  it('does not split at exactly gapDays (strict >)', () => {
    const dates = [d('2020-01-01'), d('2020-06-29')] // 180 days apart
    expect(splitIntoSegments(dates, 180)).toEqual([[0, 2]])
  })

  it('handles empty and single', () => {
    expect(splitIntoSegments([], 180)).toEqual([])
    expect(splitIntoSegments([d('2020-01-01')], 180)).toEqual([[0, 1]])
  })
})

describe('fitSegments', () => {
  it('fits each segment with >= minN points and flags short ones', () => {
    const pts: SeriesPoint[] = [
      { date: d('2020-01-01'), value: 1 },
      { date: d('2020-02-01'), value: 2 },
      { date: d('2020-03-01'), value: 3 },
      { date: d('2022-01-01'), value: 9 }, // isolated -> short segment
    ]
    const segs = fitSegments(pts, 180, 3)
    expect(segs).toHaveLength(2)
    expect(segs[0].fittable).toBe(true)
    expect(segs[0].n).toBe(3)
    expect(segs[1].fittable).toBe(false)
    expect(Number.isNaN(segs[1].slope)).toBe(true)
  })
})
