import { fitOls } from './ols'
import { datesToYears } from './time'
import type { SeriesPoint } from './series'

const MS_PER_DAY = 86_400_000

/** Positional [start, endExclusive) ranges split where the day gap between
 * consecutive sorted dates exceeds gapDays (strict >). Mirrors
 * analyses/lab_explorer.py:split_into_segments. */
export function splitIntoSegments(sortedDates: Date[], gapDays: number): Array<[number, number]> {
  const n = sortedDates.length
  if (n === 0) return []
  if (n === 1) return [[0, 1]]
  const breaks = [0]
  for (let i = 1; i < n; i++) {
    const gap = (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / MS_PER_DAY
    if (gap > gapDays) breaks.push(i)
  }
  breaks.push(n)
  const out: Array<[number, number]> = []
  for (let i = 0; i < breaks.length - 1; i++) out.push([breaks[i], breaks[i + 1]])
  return out
}

export interface SegmentFit {
  idxRange: [number, number]
  tStart: Date
  tEnd: Date
  n: number
  slope: number
  intercept: number
  r2: number
  ciLow: number
  ciHigh: number
  fittable: boolean
}

const NAN = Number.NaN

/** Split into gap segments and OLS-fit each. Segments with n < minNPerSegment
 * (or a degenerate fit) are returned with NaN fit fields and fittable=false so
 * the plot can still draw their points. Mirrors analyses/lab_explorer.py:fit_segments. */
export function fitSegments(points: SeriesPoint[], gapDays: number, minNPerSegment = 3): SegmentFit[] {
  if (points.length === 0) return []
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const dates = sorted.map((p) => p.date)
  const ranges = splitIntoSegments(dates, gapDays)
  return ranges.map(([start, end]) => {
    const seg = sorted.slice(start, end)
    const n = seg.length
    const base = { idxRange: [start, end] as [number, number], tStart: seg[0].date, tEnd: seg[n - 1].date, n }
    if (n >= minNPerSegment) {
      const years = datesToYears(seg.map((p) => p.date))
      const fit = fitOls(years, seg.map((p) => p.value))
      if (fit.reason === null) {
        return { ...base, slope: fit.slope, intercept: fit.intercept, r2: fit.r2, ciLow: fit.ciLow, ciHigh: fit.ciHigh, fittable: true }
      }
    }
    return { ...base, slope: NAN, intercept: NAN, r2: NAN, ciLow: NAN, ciHigh: NAN, fittable: false }
  })
}
