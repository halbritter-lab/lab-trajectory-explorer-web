import type { SeriesPoint } from './series'
import { fitGlobal, fitTheilSen } from './series'
import { fitSegments } from './segments'
import { rollingSlopes, type RollingSlope } from './rolling'
import { fitOls } from './ols'
import { datesToYears } from './time'
import type { FitModel, TimeBalancing } from '../fitPipeline/types'
import { applyExclusionWindows } from '../exclusions/windows'
import { balanceSeriesPoints } from './timeBalancing'
import type { SeriesExclusionWindows, SlopeMode } from './summarize'

export interface PlotModeConfig {
  mode: SlopeMode
  gapDays: number
  windowDays: number
  stepDays: number
  cutoffDays?: number
  eventDates?: Date[]
  fitModel?: FitModel
  timeBalancing?: TimeBalancing
  /** Censoring and exclusion windows, as summarizeByBezeichnung applies them. */
  exclusionWindows?: SeriesExclusionWindows
}

export interface LinePoint {
  date: Date
  value: number
}

const MS_PER_YEAR = 365.25 * 86_400_000

function lineFor(seg: SeriesPoint[], slope: number, intercept: number): LinePoint[] {
  const t0 = seg[0].date
  const tMax = seg[seg.length - 1].date
  const years = (tMax.getTime() - t0.getTime()) / MS_PER_YEAR
  return [
    { date: t0, value: intercept },
    { date: tMax, value: intercept + slope * years },
  ]
}

const MS_PER_DAY = 86_400_000

/**
 * The drawn line of one rolling window: the window's own OLS line over the
 * central `stepDays` of the window (centre ± stepDays / 2), clipped to the
 * dates of the first and last point inside the window. Consecutive windows
 * therefore tile the time axis instead of overlapping, and each stretch shows
 * the local slope estimated around it. Null when the points of the window do
 * not reach into its central stretch.
 */
export function rollingWindowLine(window: RollingSlope, stepDays: number): LinePoint[] | null {
  const halfStepMs = (stepDays / 2) * MS_PER_DAY
  const from = Math.max(window.windowCenter.getTime() - halfStepMs, window.firstDate.getTime())
  const to = Math.min(window.windowCenter.getTime() + halfStepMs, window.lastDate.getTime())
  if (!(from < to)) return null
  const valueAt = (t: number) => window.intercept + window.slope * ((t - window.firstDate.getTime()) / MS_PER_YEAR)
  return [
    { date: new Date(from), value: valueAt(from) },
    { date: new Date(to), value: valueAt(to) },
  ]
}

/** Build the slope overlay polyline(s) for the active mode. Each line is two
 * LinePoints (start/end). Global → one line; gap-split → one per fittable
 * segment (falling back to a single global line when no segment is fittable);
 * rolling → one line per window (see rollingWindowLine), none when the fitted
 * span holds no window; aki-aware → one line over the points
 * outside the exclusion windows, re-checked after time balancing and fitted
 * by plain OLS (no two-point rule). Returns [] when nothing is fittable. */
export function buildSlopeLines(points: SeriesPoint[], cfg: PlotModeConfig): LinePoint[][] {
  if (cfg.fitModel === 'none') return []
  const exclusions = cfg.exclusionWindows?.exclusions ?? []
  let numeric = applyExclusionWindows(
    [...points].sort((a, b) => a.date.getTime() - b.date.getTime()),
    cfg.exclusionWindows?.censoring ?? [],
  ).kept
  if (numeric.length > 0) numeric = applyExclusionWindows(numeric, exclusions).kept
  numeric = balanceSeriesPoints(numeric, cfg.timeBalancing)
  if (cfg.mode === 'global-robust') {
    const fit = fitTheilSen(numeric)
    if (fit.reason !== null) return []
    return [lineFor(numeric, fit.slope, fit.intercept)]
  }
  if (cfg.mode === 'chronic-ckd') {
    if (numeric.length === 0) return []
    const cutoff = numeric[0].date.getTime() + (cfg.cutoffDays ?? 90) * 86_400_000
    const chronic = numeric.filter((p) => p.date.getTime() > cutoff)
    const fit = fitGlobal(chronic)
    if (fit.reason !== null) return []
    return [lineFor(chronic, fit.slope, fit.intercept)]
  }
  if (cfg.mode === 'event-driven') {
    const events = (cfg.eventDates ?? []).map((x) => x.getTime()).sort((a, b) => a - b)
    const ranges: Array<[number, number]> = []
    let start = 0
    for (const event of events) {
      const idx = numeric.findIndex((p, i) => i >= start && p.date.getTime() >= event)
      if (idx > start) { ranges.push([start, idx]); start = idx }
    }
    if (start < numeric.length) ranges.push([start, numeric.length])
    if (ranges.length === 0 && numeric.length > 0) ranges.push([0, numeric.length])
    return ranges.flatMap(([a, b]) => {
      const seg = numeric.slice(a, b)
      const fit = fitGlobal(seg)
      return fit.reason === null ? [lineFor(seg, fit.slope, fit.intercept)] : []
    })
  }
  if (cfg.mode === 'aki-aware') {
    const kept = applyExclusionWindows(numeric, exclusions).kept
    const fit = fitOls(datesToYears(kept.map((p) => p.date)), kept.map((p) => p.value))
    if (fit.reason !== null) return []
    return [lineFor(kept, fit.slope, fit.intercept)]
  }
  if (cfg.mode === 'rolling') {
    return rollingSlopes(numeric, cfg.windowDays, cfg.stepDays, 3)
      .flatMap((window) => {
        const line = rollingWindowLine(window, cfg.stepDays)
        return line ? [line] : []
      })
  }
  if (cfg.mode === 'gap-split') {
    const segs = fitSegments(numeric, cfg.gapDays, 3)
    const fitted = segs
      .filter((s) => s.fittable)
      .map((s) => lineFor(numeric.slice(s.idxRange[0], s.idxRange[1]), s.slope, s.intercept))
    if (fitted.length > 0) return fitted
    // Fallback: no individual segment was fittable — try a global fit over all points
    const fit = fitGlobal(numeric)
    if (fit.reason !== null) return []
    return [lineFor(numeric, fit.slope, fit.intercept)]
  }
  const fit = fitGlobal(numeric)
  if (fit.reason !== null) return []
  return [lineFor(numeric, fit.slope, fit.intercept)]
}
