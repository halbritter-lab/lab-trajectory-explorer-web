/**
 * Generic endpoint evaluators. A domain module states which endpoints a
 * series has (thresholds, directions, confirmation interval); these functions
 * evaluate them on all dated exact numeric measurements of the series.
 */
import { projectedCrossingTime } from '../projection/linearProjection'

const MS_PER_DAY = 86_400_000
const MS_PER_YEAR = 365.25 * MS_PER_DAY

export interface EndpointPoint {
  date: Date
  value: number
  ageYears: number | null
}

/** Whether a value has crossed the threshold: strictly below it, or strictly
 * above it. */
export type CrossingDirection = 'below' | 'above'

/** An observed threshold-crossing endpoint, confirmed by a second crossing
 * value at least `confirmationDays` after the first. */
export interface ThresholdCrossingDefinition {
  id: string
  label: string
  threshold: number
  direction: CrossingDirection
  confirmationDays: number
}

export interface ObservedCrossing {
  met: boolean
  firstDate: Date | null
  confirmedDate: Date | null
  firstValue: number | null
  confirmedValue: number | null
  recoveryDate: Date | null
  recoveryValue: number | null
}

export function emptyObservedCrossing(): ObservedCrossing {
  return { met: false, firstDate: null, confirmedDate: null, firstValue: null, confirmedValue: null, recoveryDate: null, recoveryValue: null }
}

/** Points with a finite value and a valid date, oldest first. */
export function validEndpointPoints(points: readonly EndpointPoint[]): EndpointPoint[] {
  return points
    .filter((p) => Number.isFinite(p.value) && p.date instanceof Date && !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** A confirmation interval of at least one whole day, else `fallback`. */
export function normalizeConfirmationDays(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback
}

const crosses = (value: number, def: Pick<ThresholdCrossingDefinition, 'threshold' | 'direction'>) =>
  def.direction === 'below' ? value < def.threshold : value > def.threshold

/**
 * Process valid, date-sorted points chronologically. The first crossing value
 * starts a candidate; a later crossing value at least `confirmationDays` after
 * the candidate confirms it. A non-crossing value before confirmation
 * interrupts the candidate. After confirmation, the first non-crossing value
 * is recorded as recovery and does not revoke the event. Points sharing a
 * timestamp are one observation: any non-crossing value among them counts.
 */
export function observeThresholdCrossing(points: readonly EndpointPoint[], def: Omit<ThresholdCrossingDefinition, 'id' | 'label'>): ObservedCrossing {
  const result = emptyObservedCrossing()
  let candidate: EndpointPoint | null = null
  for (let i = 0; i < points.length;) {
    // A conflicting timestamp cannot establish persistence: any non-crossing
    // value interrupts an unconfirmed candidate, independent of source-row order.
    let end = i + 1
    while (end < points.length && points[end].date.getTime() === points[i].date.getTime()) end++
    const group = points.slice(i, end)
    const recovery = group.find((p) => !crosses(p.value, def))
    const point = group[0]
    if (result.met) {
      if (recovery) { result.recoveryDate = recovery.date; result.recoveryValue = recovery.value; return result }
    } else if (recovery) {
      candidate = null
    } else if (!candidate) {
      candidate = point
    } else if ((point.date.getTime() - candidate.date.getTime()) / MS_PER_DAY >= def.confirmationDays) {
      Object.assign(result, { met: true, firstDate: candidate.date, firstValue: candidate.value, confirmedDate: point.date, confirmedValue: point.value })
    }
    i = end
  }
  return result
}

export interface PercentDecline {
  /** Decline from the first to the latest value, in percent of the first;
   * negative for a rise. Null when the first value is not positive. */
  value: number | null
  baselineValue: number | null
  latestValue: number | null
}

/** Total percent decline from the first to the latest valid point. */
export function percentDeclineFromBaseline(points: readonly EndpointPoint[]): PercentDecline {
  if (points.length === 0) return { value: null, baselineValue: null, latestValue: null }
  const baseline = points[0]
  const latest = points[points.length - 1]
  return {
    value: baseline.value > 0 ? ((baseline.value - latest.value) / baseline.value) * 100 : null,
    baselineValue: baseline.value,
    latestValue: latest.value,
  }
}

export type ProjectedCrossingReason =
  | 'observed'
  | 'insufficient_points'
  | 'span_too_short'
  | 'no_fit'
  | 'not_approaching'
  | 'already_crossed'
  | 'missing_age'

export interface ProjectedAgeAtCrossing {
  value: number | null
  reason: ProjectedCrossingReason | null
}

/**
 * Age at which the fitted line (intercept at the first point's date, slope
 * per year) crosses the threshold, projected from the latest measurement.
 * Withheld when the crossing was already observed, with fewer than three
 * points or under a year of follow-up, without a finite fit, when the line
 * does not move towards the threshold, when it crosses at or before the
 * latest measurement, or without an age at the latest measurement.
 */
export function projectAgeAtCrossing(input: {
  points: readonly EndpointPoint[]
  slopePerYear: number
  intercept: number
  threshold: number
  direction: CrossingDirection
  observed: boolean
}): ProjectedAgeAtCrossing {
  const { points, slopePerYear, intercept, threshold, direction, observed } = input
  if (observed) return { value: null, reason: 'observed' }
  if (points.length < 3) return { value: null, reason: 'insufficient_points' }
  const first = points[0]
  const latest = points[points.length - 1]
  const spanYears = (latest.date.getTime() - first.date.getTime()) / MS_PER_YEAR
  if (spanYears < 1) return { value: null, reason: 'span_too_short' }
  if (!Number.isFinite(slopePerYear) || !Number.isFinite(intercept)) return { value: null, reason: 'no_fit' }
  if (direction === 'below' ? slopePerYear >= 0 : slopePerYear <= 0) return { value: null, reason: 'not_approaching' }
  const crossingTime = projectedCrossingTime(intercept, slopePerYear, threshold)
  if (crossingTime <= spanYears) return { value: null, reason: 'already_crossed' }
  if (latest.ageYears === null || !Number.isFinite(latest.ageYears)) return { value: null, reason: 'missing_age' }
  return { value: latest.ageYears + crossingTime - spanYears, reason: null }
}
