import { fitOls } from './ols'
import { datesToYears } from './time'
import type { SeriesPoint } from './series'

const MS_PER_DAY = 86_400_000

export interface RollingSlope {
  windowCenter: Date
  windowStart: Date
  windowEnd: Date
  nInWindow: number
  slope: number
  intercept: number
  r2: number
}

/** Rolling-window OLS slopes. Centre walks from min+halfWindow to max-halfWindow
 * in stepDays; halfWindow = floor(windowDays/2) days. Only windows with
 * nInWindow >= minNPerWindow that produce a real fit are emitted. Mirrors
 * analyses/methods.py:_rolling_segmenter + _rolling_slopes_for_series. */
export function rollingSlopes(
  points: SeriesPoint[],
  windowDays = 730,
  stepDays = 180,
  minNPerWindow = 3,
): RollingSlope[] {
  if (points.length === 0) return []
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const halfMs = Math.floor(windowDays / 2) * MS_PER_DAY
  const minT = sorted[0].date.getTime()
  const maxT = sorted[sorted.length - 1].date.getTime()
  const startCentre = minT + halfMs
  const endCentre = maxT - halfMs
  if (startCentre > endCentre) return []
  const stepMs = stepDays * MS_PER_DAY
  const out: RollingSlope[] = []
  for (let centre = startCentre; centre <= endCentre; centre += stepMs) {
    const winStart = centre - halfMs
    const winEnd = centre + halfMs
    const inWin = sorted.filter((p) => {
      const t = p.date.getTime()
      return t >= winStart && t <= winEnd
    })
    if (inWin.length < minNPerWindow) continue
    const years = datesToYears(inWin.map((p) => p.date))
    const fit = fitOls(years, inWin.map((p) => p.value))
    if (fit.reason !== null) continue
    out.push({
      windowCenter: new Date(centre),
      windowStart: new Date(winStart),
      windowEnd: new Date(winEnd),
      nInWindow: inWin.length,
      slope: fit.slope,
      intercept: fit.intercept,
      r2: fit.r2,
    })
  }
  return out
}
