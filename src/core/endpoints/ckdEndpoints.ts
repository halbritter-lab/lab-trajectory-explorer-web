import { fitGlobal } from '../stats/series'

export interface EndpointPoint {
  date: Date
  value: number
  ageYears: number | null
}

export interface CkdEndpointSettings {
  percentDecline: boolean
  observedCkdG4?: boolean
  observedCkdG5: boolean
  projectedAgeToCkdG5: boolean
  confirmationDays?: number
}

export interface ObservedCkdEvent {
  met: boolean
  firstDate: Date | null
  confirmedDate: Date | null
  firstValue: number | null
  confirmedValue: number | null
  recoveryDate: Date | null
  recoveryValue: number | null
}

export interface CkdEndpoints {
  percentDecline: {
    value: number | null
    baselineValue: number | null
    latestValue: number | null
  }
  observedCkdG4: ObservedCkdEvent
  observedCkdG5: ObservedCkdEvent
  confirmationDays: number
  projectedAgeToCkdG5: {
    value: number | null
    reason: 'disabled' | 'observed_ckd_g5' | 'no_fit' | 'non_declining_fit' | 'insufficient_points' | 'span_too_short' | 'already_below_threshold' | 'missing_age' | null
  }
}

export interface ComputeCkdEndpointsInput {
  points: EndpointPoint[]
  slopePerYear: number
  /** Intercept at the first valid point's date; callers pass the raw-data fit. */
  intercept?: number
  enabled: CkdEndpointSettings
  threshold?: number
  confirmationDays?: number
}

const MS_PER_DAY = 86_400_000
const MS_PER_YEAR = 365.25 * MS_PER_DAY

function emptyEndpoints(): CkdEndpoints {
  return {
    percentDecline: { value: null, baselineValue: null, latestValue: null },
    observedCkdG4: emptyObservedEvent(),
    observedCkdG5: emptyObservedEvent(),
    confirmationDays: 90,
    projectedAgeToCkdG5: { value: null, reason: 'disabled' },
  }
}

function sortPoints(points: EndpointPoint[]): EndpointPoint[] {
  return points
    .filter((p) => Number.isFinite(p.value) && p.date instanceof Date && !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

function emptyObservedEvent(): ObservedCkdEvent {
  return { met: false, firstDate: null, confirmedDate: null, firstValue: null, confirmedValue: null, recoveryDate: null, recoveryValue: null }
}

export function normalizeConfirmationDays(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.floor(value) : 90
}

function observedEvent(points: EndpointPoint[], threshold: number, confirmationDays: number): ObservedCkdEvent {
  const result = emptyObservedEvent()
  let candidate: EndpointPoint | null = null
  for (let i = 0; i < points.length;) {
    // A conflicting timestamp cannot establish persistence: any non-low value
    // interrupts an unconfirmed candidate, independent of source-row order.
    let end = i + 1
    while (end < points.length && points[end].date.getTime() === points[i].date.getTime()) end++
    const group = points.slice(i, end)
    const recovery = group.find(p => p.value >= threshold)
    const point = group[0]
    if (result.met) {
      if (recovery) { result.recoveryDate = recovery.date; result.recoveryValue = recovery.value; return result }
    } else if (recovery) {
      candidate = null
    } else if (!candidate) {
      candidate = point
    } else if ((point.date.getTime() - candidate.date.getTime()) / MS_PER_DAY >= confirmationDays) {
      Object.assign(result, { met: true, firstDate: candidate.date, firstValue: candidate.value, confirmedDate: point.date, confirmedValue: point.value })
    }
    i = end
  }
  return result
}

function projectedAge(
  points: EndpointPoint[],
  slopePerYear: number,
  intercept: number,
  observed: CkdEndpoints['observedCkdG5'],
  threshold: number,
): CkdEndpoints['projectedAgeToCkdG5'] {
  if (observed.met) return { value: null, reason: 'observed_ckd_g5' }
  if (points.length < 3) return { value: null, reason: 'insufficient_points' }
  const first = points[0]
  const latest = points[points.length - 1]
  const spanYears = (latest.date.getTime() - first.date.getTime()) / MS_PER_YEAR
  if (spanYears < 1) return { value: null, reason: 'span_too_short' }
  if (!Number.isFinite(slopePerYear) || !Number.isFinite(intercept)) return { value: null, reason: 'no_fit' }
  if (slopePerYear >= 0) return { value: null, reason: 'non_declining_fit' }
  const crossingTime = (threshold - intercept) / slopePerYear
  if (crossingTime <= spanYears) return { value: null, reason: 'already_below_threshold' }
  if (latest.ageYears === null || !Number.isFinite(latest.ageYears)) return { value: null, reason: 'missing_age' }
  return { value: latest.ageYears + crossingTime - spanYears, reason: null }
}

export function computeCkdEndpoints(input: ComputeCkdEndpointsInput): CkdEndpoints {
  const out = emptyEndpoints()
  const threshold = input.threshold ?? 15
  const confirmationDays = normalizeConfirmationDays(input.confirmationDays ?? input.enabled.confirmationDays)
  out.confirmationDays = confirmationDays
  const points = sortPoints(input.points)

  if (input.enabled.percentDecline && points.length > 0) {
    const baseline = points[0]
    const latest = points[points.length - 1]
    out.percentDecline.baselineValue = baseline.value
    out.percentDecline.latestValue = latest.value
    out.percentDecline.value = baseline.value > 0 ? ((baseline.value - latest.value) / baseline.value) * 100 : null
  }

  if (input.enabled.observedCkdG4) out.observedCkdG4 = observedEvent(points, 30, confirmationDays)
  if (input.enabled.observedCkdG5) {
    out.observedCkdG5 = observedEvent(points, threshold, confirmationDays)
  }

  if (input.enabled.projectedAgeToCkdG5) {
    out.projectedAgeToCkdG5 = projectedAge(points, input.slopePerYear, input.intercept ?? fitGlobal(points).intercept, out.observedCkdG5, threshold)
  }

  return out
}
