import type { SeriesPoint } from './series'
import { fitGlobal, fitTheilSen } from './series'
import { fitSegments } from './segments'
import { fitAkiAware } from '../aki/akiAware'
import type { AkiEpisode } from '../aki/kdigo'
import type { ClinicalEvent } from '../events/events'
import { filterFitPointsByClinicalEvents } from '../events/fitExclusions'
import type { FitConfig } from '../fitPipeline/types'
import { balanceSeriesPoints } from './timeBalancing'
import type { SlopeMode } from './summarize'

export interface PlotModeConfig {
  mode: SlopeMode
  gapDays: number
  windowDays: number
  stepDays: number
  exclusionDays?: number
  cutoffDays?: number
  eventDates?: Date[]
  clinicalEvents?: ClinicalEvent[]
  clinicalEventCensoring?: FitConfig['censoring']
  excludeAkiWindows?: boolean
  fitModel?: FitConfig['fitModel']
  timeBalancing?: FitConfig['timeBalancing']
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

/** Build the slope overlay polyline(s) for the active mode. Each line is two
 * LinePoints (start/end). Global → one line; gap-split → one per fittable
 * segment (falling back to a single global line when no segment is fittable);
 * rolling → the global trend line; aki-aware → one line over the kept points
 * (episodes optionally precomputed for cross-series detection). Returns []
 * when nothing is fittable. */
export function buildSlopeLines(points: SeriesPoint[], cfg: PlotModeConfig, episodes?: AkiEpisode[]): LinePoint[][] {
  if (cfg.fitModel === 'none') return []
  let numeric = filterFitPointsByClinicalEvents(
    [...points].sort((a, b) => a.date.getTime() - b.date.getTime()),
    cfg.clinicalEvents,
    cfg.clinicalEventCensoring,
  ).points
  if (cfg.excludeAkiWindows && episodes && numeric.length > 0) {
    const r = fitAkiAware(numeric, cfg.exclusionDays ?? 30, episodes)
    numeric = r.keptIdx.map((i) => numeric[i])
  }
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
    const r = fitAkiAware(numeric, cfg.exclusionDays ?? 30, episodes)
    if (r.fit.reason !== null) return []
    const kept = r.keptIdx.map((i) => numeric[i])
    return [lineFor(kept, r.fit.slope, r.fit.intercept)]
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
