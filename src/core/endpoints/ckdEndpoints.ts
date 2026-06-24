export interface EndpointPoint {
  date: Date
  value: number
  ageYears: number | null
}

export interface CkdEndpointSettings {
  percentDecline: boolean
  observedCkdG5: boolean
  projectedAgeToCkdG5: boolean
}

export interface CkdEndpoints {
  percentDecline: {
    value: number | null
    baselineValue: number | null
    latestValue: number | null
  }
  observedCkdG5: {
    met: boolean
    firstDate: Date | null
    confirmedDate: Date | null
  }
  projectedAgeToCkdG5: {
    value: number | null
    reason: 'disabled' | 'observed_ckd_g5' | 'non_declining_fit' | 'insufficient_points' | 'span_too_short' | 'already_below_threshold' | 'missing_age' | null
  }
}

export interface ComputeCkdEndpointsInput {
  points: EndpointPoint[]
  slopePerYear: number
  enabled: CkdEndpointSettings
  threshold?: number
  confirmationDays?: number
}

const MS_PER_DAY = 86_400_000
const MS_PER_YEAR = 365.25 * MS_PER_DAY

function emptyEndpoints(): CkdEndpoints {
  return {
    percentDecline: { value: null, baselineValue: null, latestValue: null },
    observedCkdG5: { met: false, firstDate: null, confirmedDate: null },
    projectedAgeToCkdG5: { value: null, reason: 'disabled' },
  }
}

function sortPoints(points: EndpointPoint[]): EndpointPoint[] {
  return points
    .filter((p) => Number.isFinite(p.value) && p.date instanceof Date && !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

function observedCkdG5(points: EndpointPoint[], threshold: number, confirmationDays: number): CkdEndpoints['observedCkdG5'] {
  for (let i = 0; i < points.length; i++) {
    const first = points[i]
    if (first.value >= threshold) continue
    let recovered = false
    let confirmed: Date | null = null
    for (let j = i + 1; j < points.length; j++) {
      const next = points[j]
      if (next.value >= threshold) {
        recovered = true
        break
      }
      const days = (next.date.getTime() - first.date.getTime()) / MS_PER_DAY
      if (days >= confirmationDays) confirmed = next.date
    }
    if (!recovered && confirmed) return { met: true, firstDate: first.date, confirmedDate: confirmed }
  }
  return { met: false, firstDate: null, confirmedDate: null }
}

function projectedAge(
  points: EndpointPoint[],
  slopePerYear: number,
  observed: CkdEndpoints['observedCkdG5'],
  threshold: number,
): CkdEndpoints['projectedAgeToCkdG5'] {
  if (observed.met) return { value: null, reason: 'observed_ckd_g5' }
  if (points.length < 3) return { value: null, reason: 'insufficient_points' }
  const first = points[0]
  const latest = points[points.length - 1]
  const spanYears = (latest.date.getTime() - first.date.getTime()) / MS_PER_YEAR
  if (spanYears < 1) return { value: null, reason: 'span_too_short' }
  if (!Number.isFinite(slopePerYear) || slopePerYear >= 0) return { value: null, reason: 'non_declining_fit' }
  if (latest.value < threshold) return { value: null, reason: 'already_below_threshold' }
  if (latest.ageYears === null || !Number.isFinite(latest.ageYears)) return { value: null, reason: 'missing_age' }
  return { value: latest.ageYears + (latest.value - threshold) / Math.abs(slopePerYear), reason: null }
}

export function computeCkdEndpoints(input: ComputeCkdEndpointsInput): CkdEndpoints {
  const out = emptyEndpoints()
  const threshold = input.threshold ?? 15
  const confirmationDays = input.confirmationDays ?? 90
  const points = sortPoints(input.points)

  if (input.enabled.percentDecline && points.length > 0) {
    const baseline = points[0]
    const latest = points[points.length - 1]
    out.percentDecline.baselineValue = baseline.value
    out.percentDecline.latestValue = latest.value
    out.percentDecline.value = baseline.value > 0 ? ((baseline.value - latest.value) / baseline.value) * 100 : null
  }

  if (input.enabled.observedCkdG5) {
    out.observedCkdG5 = observedCkdG5(points, threshold, confirmationDays)
  }

  if (input.enabled.projectedAgeToCkdG5) {
    out.projectedAgeToCkdG5 = projectedAge(points, input.slopePerYear, out.observedCkdG5, threshold)
  }

  return out
}
