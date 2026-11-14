import type { TimeBalancing } from '../fitPipeline/types'
import type { SeriesPoint } from './series'

export function balanceSeriesPoints(points: SeriesPoint[], mode: TimeBalancing = 'raw'): SeriesPoint[] {
  return balanceSeriesPointGroups(points, mode).map((group) => group.point)
}

/** The balanced points with the input points each one was built from. In raw
 * mode every point is its own group and `point` is the input object itself. */
export function balanceSeriesPointGroups<P extends SeriesPoint>(points: readonly P[], mode: TimeBalancing = 'raw'): Array<{ point: SeriesPoint; members: P[] }> {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  if (mode === 'raw') return sorted.map((point) => ({ point, members: [point] }))
  const period = mode === 'monthly-median' ? 'month' : 'quarter'
  const groups = new Map<string, P[]>()
  for (const point of sorted) {
    const key = periodKey(point.date, period)
    groups.set(key, [...(groups.get(key) ?? []), point])
  }
  return [...groups.values()].map((members) => ({ point: medianPoint(members), members })).sort((a, b) => a.point.date.getTime() - b.point.date.getTime())
}

function periodKey(date: Date, period: 'month' | 'quarter'): string {
  const month = date.getUTCMonth()
  const bucket = period === 'month' ? month : Math.floor(month / 3)
  return `${date.getUTCFullYear()}-${bucket}`
}

function medianPoint(points: SeriesPoint[]): SeriesPoint {
  const sortedByDate = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const sortedValues = points.map((p) => p.value).sort((a, b) => a - b)
  const mid = Math.floor(sortedValues.length / 2)
  const dateMid = Math.floor((sortedByDate.length - 1) / 2)
  const value = sortedValues.length % 2 === 0
    ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
    : sortedValues[mid]
  return { date: sortedByDate[dateMid].date, value }
}
