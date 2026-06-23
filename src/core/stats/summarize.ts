import type { LabRow } from '../types'
import type { SeriesPoint } from './series'
import { fitGlobal, fitTheilSen } from './series'
import { fitSegments } from './segments'
import { rollingSlopes } from './rolling'
import { fitAkiAware, episodesForSeries } from '../aki/akiAware'
import { fitInputForSeries } from '../analysis/types'
import type { AnalysisFitInputContribution } from '../analysis/types'

export type SlopeMode = 'global' | 'gap-split' | 'rolling' | 'global-robust' | 'chronic-ckd' | 'aki-aware' | 'event-driven'

export interface SeriesSummary {
  bezeichnung: string
  einheit: string
  nTotal: number
  nNumeric: number
  nText: number
  spanDays: number
  slope: number
  intercept: number
  r2: number
  ciLow: number
  ciHigh: number
  reason: 'no_numeric_values' | 'n_below_threshold' | 'span_too_short' | null
  nSegments?: number
  nWindows?: number
  slopeMin?: number
  slopeMax?: number
  slopeRange?: number
  slopeVar?: number
}

export interface SummarizeParams {
  gapDays?: number
  windowDays?: number
  stepDays?: number
  minNPerWindow?: number
  minNPerSegment?: number
  exclusionDays?: number
  cutoffDays?: number
  eventDates?: Date[]
  fitInputs?: AnalysisFitInputContribution[]
}

const NAN = Number.NaN
const MS_PER_DAY = 86_400_000

function groupKey(bez: string | null, einheit: string | null): string {
  return `${bez ?? ' '}|${einheit ?? ' '}`
}

/** One row per (Bezeichnung, Einheit) for one patient, mirroring
 * analyses/lab_explorer.py:summarize_by_bezeichnung including reason precedence
 * and mode-specific extra columns. */
export function summarizeByBezeichnung(
  rows: LabRow[],
  patientId: number,
  mode: SlopeMode = 'global',
  params: SummarizeParams = {},
): SeriesSummary[] {
  const { gapDays = 180, windowDays = 730, stepDays = 180, minNPerWindow = 3, minNPerSegment = 3, exclusionDays = 30, cutoffDays = 90, eventDates = [], fitInputs = [] } = params
  const sub = rows.filter((r) => r.patientId === patientId)

  const order: string[] = []
  const groups = new Map<string, LabRow[]>()
  for (const r of sub) {
    const k = groupKey(r.bezeichnung, r.einheit)
    if (!groups.has(k)) { groups.set(k, []); order.push(k) }
    groups.get(k)!.push(r)
  }

  const out: SeriesSummary[] = []
  for (const k of order) {
    const group = groups.get(k)!
    const numericRows = group
      .filter((r) => r.wertNum !== null && r.labDatum !== null)
      .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    const nTotal = group.length
    const nNumeric = numericRows.length
    const nText = nTotal - nNumeric
    const spanDays =
      nNumeric > 0
        ? Math.trunc(
            (numericRows[nNumeric - 1].labDatum!.getTime() - numericRows[0].labDatum!.getTime()) / MS_PER_DAY,
          )
        : 0
    const first = group[0]
    const base = {
      bezeichnung: first.bezeichnung ?? '(unnamed)',
      einheit: first.einheit ?? '(no unit)',
      nTotal, nNumeric, nText, spanDays,
    }
    const emptyFit = { slope: NAN, intercept: NAN, r2: NAN, ciLow: NAN, ciHigh: NAN }

    let summary: SeriesSummary
    if (nNumeric === 0) {
      summary = { ...base, ...emptyFit, reason: 'no_numeric_values' }
    } else if (nNumeric < 3) {
      summary = { ...base, ...emptyFit, reason: 'n_below_threshold' }
    } else if (mode === 'global-robust') {
      const points: SeriesPoint[] = numericRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
      const fit = fitTheilSen(points)
      summary = {
        ...base,
        slope: fit.slope, intercept: fit.intercept, r2: fit.r2, ciLow: fit.ciLow, ciHigh: fit.ciHigh,
        reason: spanDays < 365 ? 'span_too_short' : null,
      }
    } else if (mode === 'chronic-ckd') {
      const firstDate = numericRows[0].labDatum!
      const cutoffMs = firstDate.getTime() + cutoffDays * MS_PER_DAY
      const chronicRows = numericRows.filter((r) => r.labDatum!.getTime() > cutoffMs)
      const points: SeriesPoint[] = chronicRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
      const fit = fitGlobal(points)
      summary = {
        ...base,
        slope: fit.slope, intercept: fit.intercept, r2: fit.r2, ciLow: fit.ciLow, ciHigh: fit.ciHigh,
        reason: fit.reason === 'n_below_threshold' ? 'n_below_threshold' : spanDays < 365 ? 'span_too_short' : null,
        nSegments: points.length > 0 ? 1 : 0,
      }
    } else if (mode === 'aki-aware') {
      const points: SeriesPoint[] = numericRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
      const input = fitInputForSeries(fitInputs, patientId, { bezeichnung: base.bezeichnung, einheit: first.einheit ?? null })
      const episodes = input?.episodes ?? episodesForSeries(sub, patientId, first.bezeichnung, first.einheit)
      const r = fitAkiAware(points, exclusionDays, episodes)
      summary = {
        ...base,
        slope: r.fit.slope, intercept: r.fit.intercept, r2: r.fit.r2, ciLow: r.fit.ciLow, ciHigh: r.fit.ciHigh,
        reason: r.fit.reason === 'n_below_threshold' ? 'n_below_threshold' : spanDays < 365 ? 'span_too_short' : null,
      }
    } else if (mode === 'event-driven') {
      const points: SeriesPoint[] = numericRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
      const events = eventDates.map((x) => x.getTime()).sort((a, b) => a - b)
      const ranges: Array<[number, number]> = []
      let start = 0
      for (const event of events) {
        const idx = points.findIndex((p, i) => i >= start && p.date.getTime() >= event)
        if (idx > start) { ranges.push([start, idx]); start = idx }
      }
      if (start < points.length) ranges.push([start, points.length])
      if (ranges.length === 0 && points.length > 0) ranges.push([0, points.length])
      const fits = ranges
        .map(([a, b]) => {
          const seg = points.slice(a, b)
          return { range: [a, b] as [number, number], fit: fitGlobal(seg), n: seg.length }
        })
      const fittable = fits.filter((f) => f.fit.reason === null)
      const best = fittable.sort((a, b) => Math.abs(b.fit.slope) - Math.abs(a.fit.slope))[0]
      summary = best
        ? {
            ...base,
            slope: best.fit.slope, intercept: best.fit.intercept, r2: best.fit.r2, ciLow: best.fit.ciLow, ciHigh: best.fit.ciHigh,
            reason: spanDays < 365 ? 'span_too_short' : null,
            nSegments: ranges.length,
          }
        : { ...base, ...emptyFit, reason: 'n_below_threshold', nSegments: ranges.length }
    } else {
      const points: SeriesPoint[] = numericRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
      const fit = fitGlobal(points)
      summary = {
        ...base,
        slope: fit.slope, intercept: fit.intercept, r2: fit.r2, ciLow: fit.ciLow, ciHigh: fit.ciHigh,
        reason: spanDays < 365 ? 'span_too_short' : null,
      }
    }

    const points: SeriesPoint[] = numericRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
    if (mode === 'gap-split') {
      const segs = fitSegments(points, gapDays, minNPerSegment)
      const slopes = segs.filter((s) => s.fittable).map((s) => s.slope)
      summary.nSegments = segs.length
      if (slopes.length > 0) {
        summary.slopeMin = Math.min(...slopes)
        summary.slopeMax = Math.max(...slopes)
        summary.slopeRange = summary.slopeMax - summary.slopeMin
      } else {
        summary.slopeMin = NAN; summary.slopeMax = NAN; summary.slopeRange = NAN
      }
    } else if (mode === 'rolling') {
      const rolls = rollingSlopes(points, windowDays, stepDays, minNPerWindow)
      summary.nWindows = rolls.length
      if (rolls.length > 0) {
        const s = rolls.map((r) => r.slope)
        const mean = s.reduce((a, b) => a + b, 0) / s.length
        summary.slopeMin = Math.min(...s)
        summary.slopeMax = Math.max(...s)
        summary.slopeVar = s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length
      } else {
        summary.slopeMin = NAN; summary.slopeMax = NAN; summary.slopeVar = NAN
      }
    }
    out.push(summary)
  }

  return out
    .map((s, i) => [s, i] as const)
    .sort((a, b) => b[0].nNumeric - a[0].nNumeric || a[1] - b[1])
    .map(([s]) => s)
}
