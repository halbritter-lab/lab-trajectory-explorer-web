/**
 * Before/after comparison at an anchor event (issue #64, decided 2026-11-21).
 * One anchor event per patient; the column's fit points are split at its
 * calendar day and each side is fitted with the column's scalar estimator.
 * The comparison is a result beside the column's slope: it changes no slope,
 * flag, endpoint or exclusion of the column.
 */
import type { ClinicalEvent } from '../events/events'
import type { FitModel, TimeBalancing } from '../fitPipeline/types'
import { fitGlobal, fitTheilSen, type SeriesPoint } from '../stats/series'
import { balanceSeriesPoints } from '../stats/timeBalancing'
import { tCritical95 } from '../stats/ols'
import { distinctDateCount } from '../stats/time'

const MS_PER_DAY = 86_400_000

/** Which event of a patient is the anchor: the first one, or the first whose
 * title or type equals `value` exactly (case and spaces as stored). */
export type AnchorRule = { kind: 'first' } | { kind: 'title'; value: string } | { kind: 'type'; value: string }

/** A column's before/after setting. `exclusionDays` leaves the points of the
 * calendar days anchor + 1 to anchor + exclusionDays (both included) out of
 * the after side; 0 leaves nothing out. */
export interface AnchorComparisonSettings {
  rule: AnchorRule
  exclusionDays: number
}

/** Code of the per-point reason for a point inside the exclusion window. It
 * marks the point in charts and tables; the column's own fit still uses it. */
export const ANCHOR_WINDOW_REASON = 'anchor-exclusion-window'

export interface AnchorSide {
  /** Points the side's fit consumed, after the column's exclusions and its time balancing. */
  nFitted: number
  nFittedDates: number
  /** Whole days between the first and last fitted point of the side. */
  fittedSpanDays: number
  firstDate: Date | null
  lastDate: Date | null
  /** Per year, as every slope of the app; NaN when the side has no fit. */
  slope: number
  ciLow: number
  ciHigh: number
  /** OLS standard error; NaN for Theil-Sen and the exact two-point line. */
  slopeSe: number
}

export interface AnchorComparison {
  settings: AnchorComparisonSettings
  /** The patient's anchor event; null when no event matches the rule. */
  anchor: ClinicalEvent | null
  /** Null when there is no anchor or the column has no fit (trend off or fit model "none"). */
  before: AnchorSide | null
  after: AnchorSide | null
  /** after − before; NaN when either slope is missing. */
  difference: number
  /** Welch interval of the difference; NaN without both standard errors. */
  differenceCiLow: number
  differenceCiHigh: number
  /** Indices (into the cell's points) of available points inside the exclusion window; empty without a fit. */
  windowIdx: number[]
}

/** How a rule is named in labels and the chart axis. */
export function anchorRuleLabel(rule: AnchorRule): string {
  if (rule.kind === 'title') return `first event titled “${rule.value}”`
  if (rule.kind === 'type') return `first event of type ${rule.value}`
  return 'first event'
}

/** The anchor event of one patient: the earliest event the rule accepts;
 * among events of the same date the first in file order. */
export function anchorEvent(events: readonly ClinicalEvent[], rule: AnchorRule): ClinicalEvent | null {
  let best: ClinicalEvent | null = null
  for (const event of events) {
    if (!Number.isFinite(event.date.getTime())) continue
    if (rule.kind === 'title' && event.title !== rule.value) continue
    if (rule.kind === 'type' && event.type !== rule.value) continue
    if (best === null || event.date.getTime() < best.date.getTime()) best = event
  }
  return best
}

const dayIndex = (date: Date) => Math.floor(date.getTime() / MS_PER_DAY)

function sideOf(points: SeriesPoint[], fitModel: FitModel, timeBalancing: TimeBalancing): AnchorSide {
  const fitted = balanceSeriesPoints(points, timeBalancing)
  const fit = fitModel === 'theil-sen' ? fitTheilSen(fitted) : fitGlobal(fitted)
  const first = fitted[0]?.date ?? null
  const last = fitted.at(-1)?.date ?? null
  return {
    nFitted: fitted.length,
    nFittedDates: distinctDateCount(fitted),
    fittedSpanDays: first && last && fitted.length > 1 ? Math.trunc((last.getTime() - first.getTime()) / MS_PER_DAY) : 0,
    firstDate: first,
    lastDate: last,
    slope: fit.slope,
    ciLow: fit.ciLow,
    ciHigh: fit.ciHigh,
    slopeSe: fit.slopeSe ?? Number.NaN,
  }
}

/**
 * 95 % interval of after − before from the two OLS standard errors, assuming
 * the two slope estimates are independent (disjoint points, each side with
 * its own residual variance): half-width t(0.975, ν) · √(SE_b² + SE_a²) with
 * the Welch–Satterthwaite ν = (SE_b² + SE_a²)² / (SE_b⁴/(n_b − 2) + SE_a⁴/(n_a − 2)),
 * truncated to a whole number as the OLS interval does. NaN when a standard
 * error is missing (Theil-Sen, two-point line, no fit).
 */
export function differenceInterval(before: AnchorSide, after: AnchorSide): [number, number] {
  const difference = after.slope - before.slope
  const vb = before.slopeSe ** 2, va = after.slopeSe ** 2
  if (!Number.isFinite(difference) || !Number.isFinite(vb) || !Number.isFinite(va)) return [Number.NaN, Number.NaN]
  const variance = vb + va
  if (variance === 0) return [difference, difference]
  const df = variance ** 2 / (vb ** 2 / (before.nFitted - 2) + va ** 2 / (after.nFitted - 2))
  const half = tCritical95(df) * Math.sqrt(variance)
  return [difference - half, difference + half]
}

/**
 * The comparison for one cell. `available[i]` says whether point i enters the
 * column's fit (exact and outside every censoring and exclusion window).
 * Points on the anchor's calendar day count as before; points of the next
 * `exclusionDays` days are left out of the after side.
 */
export function compareAtAnchor(input: {
  points: readonly SeriesPoint[]
  available: readonly boolean[]
  events: readonly ClinicalEvent[]
  settings: AnchorComparisonSettings
  fitModel: FitModel
  timeBalancing: TimeBalancing
}): AnchorComparison {
  const { points, available, events, settings, fitModel, timeBalancing } = input
  const anchor = anchorEvent(events, settings.rule)
  const empty = { settings, anchor, before: null, after: null, difference: Number.NaN, differenceCiLow: Number.NaN, differenceCiHigh: Number.NaN, windowIdx: [] }
  if (anchor === null || fitModel === 'none') return empty
  const anchorDay = dayIndex(anchor.date)
  const before: SeriesPoint[] = [], after: SeriesPoint[] = [], windowIdx: number[] = []
  points.forEach((point, index) => {
    if (!available[index]) return
    const day = dayIndex(point.date)
    if (day <= anchorDay) before.push(point)
    else if (day <= anchorDay + settings.exclusionDays) windowIdx.push(index)
    else after.push(point)
  })
  const beforeSide = sideOf(before, fitModel, timeBalancing)
  const afterSide = sideOf(after, fitModel, timeBalancing)
  const [differenceCiLow, differenceCiHigh] = differenceInterval(beforeSide, afterSide)
  return { settings, anchor, before: beforeSide, after: afterSide, difference: afterSide.slope - beforeSide.slope, differenceCiLow, differenceCiHigh, windowIdx }
}
