import { fitGlobal } from '../../../stats/series'
import {
  emptyObservedCrossing,
  normalizeConfirmationDays as normalizeDays,
  observeThresholdCrossing,
  percentDeclineFromBaseline,
  projectAgeAtCrossing,
  validEndpointPoints,
  type EndpointPoint,
  type ObservedCrossing,
  type ProjectedCrossingReason,
  type ThresholdCrossingDefinition,
} from '../../../endpoints/thresholdEndpoints'
import { CKD_G4_EGFR_THRESHOLD, CKD_G5_EGFR_THRESHOLD, DEFAULT_CONFIRMATION_DAYS } from '../constants'
import type { KidneyFailureReached } from './endpointEventPolicy'

export type { EndpointPoint } from '../../../endpoints/thresholdEndpoints'

export interface CkdEndpointSettings {
  percentDecline: boolean
  observedCkdG4?: boolean
  observedCkdG5: boolean
  projectedAgeToCkdG5: boolean
  confirmationDays?: number
}

export type ObservedCkdEvent = ObservedCrossing

export type CkdProjectionReason =
  | 'disabled'
  | 'observed_ckd_g5'
  | 'no_fit'
  | 'non_declining_fit'
  | 'insufficient_points'
  | 'span_too_short'
  | 'already_below_threshold'
  | 'missing_age'
  | 'kidney_failure_reached'

export interface CkdEndpoints {
  kidneyFailureReached: KidneyFailureReached | null
  endpointPointCount: number
  percentDecline: {
    value: number | null
    baselineValue: number | null
    latestValue: number | null
  }
  observedCkdG4: ObservedCkdEvent
  observedCkdG5: ObservedCkdEvent
  /** Mean of all eligible values in elapsed UTC days 0–90. */
  declineBaselineValue: number | null
  observedDecline40: ObservedCkdEvent
  observedDecline57: ObservedCkdEvent
  confirmationDays: number
  /** Which endpoints were evaluated. A disabled endpoint reports `met: false` /
   * `null`, so exports use this to tell "not met" from "never evaluated". */
  evaluated: { percentDecline: boolean; observedCkdG4: boolean; observedCkdG5: boolean; projectedAgeToCkdG5: boolean }
  projectedAgeToCkdG5: {
    value: number | null
    reason: CkdProjectionReason | null
  }
}

export interface ComputeCkdEndpointsInput {
  kidneyFailureReached?: KidneyFailureReached | null
  points: EndpointPoint[]
  slopePerYear: number
  /** Intercept at the first valid point's date; callers pass the raw-data fit. */
  intercept?: number
  enabled: CkdEndpointSettings
  threshold?: number
  confirmationDays?: number
}

/** The observed CKD G-stage endpoints as generic threshold crossings: G4 and
 * G5 are reached strictly below their eGFR boundary and confirmed after the
 * configured interval. */
export function ckdCrossingDefinitions(confirmationDays: number, g5Threshold = CKD_G5_EGFR_THRESHOLD): Record<'observedCkdG4' | 'observedCkdG5', ThresholdCrossingDefinition> {
  return {
    observedCkdG4: { id: 'observedCkdG4', label: 'CKD G4', threshold: CKD_G4_EGFR_THRESHOLD, direction: 'below', confirmationDays, maximumConfirmationMonths: 12 },
    observedCkdG5: { id: 'observedCkdG5', label: 'CKD G5', threshold: g5Threshold, direction: 'below', confirmationDays, maximumConfirmationMonths: 12 },
  }
}

const PROJECTION_REASONS: Record<ProjectedCrossingReason, CkdProjectionReason> = {
  observed: 'observed_ckd_g5',
  insufficient_points: 'insufficient_points',
  span_too_short: 'span_too_short',
  no_fit: 'no_fit',
  not_approaching: 'non_declining_fit',
  already_crossed: 'already_below_threshold',
  missing_age: 'missing_age',
}

function emptyEndpoints(): CkdEndpoints {
  return {
    kidneyFailureReached: null,
    endpointPointCount: 0,
    percentDecline: { value: null, baselineValue: null, latestValue: null },
    observedCkdG4: emptyObservedCrossing(),
    observedCkdG5: emptyObservedCrossing(),
    declineBaselineValue: null,
    observedDecline40: emptyObservedCrossing(),
    observedDecline57: emptyObservedCrossing(),
    confirmationDays: DEFAULT_CONFIRMATION_DAYS,
    evaluated: { percentDecline: false, observedCkdG4: false, observedCkdG5: false, projectedAgeToCkdG5: false },
    projectedAgeToCkdG5: { value: null, reason: 'disabled' },
  }
}

export function normalizeConfirmationDays(value: number | undefined): number {
  return normalizeDays(value, DEFAULT_CONFIRMATION_DAYS)
}

/** CKD endpoints of one eGFR series: percent decline, observed G4/G5 and the
 * projected age at G5, evaluated with the generic endpoint evaluators. */
export function computeCkdEndpoints(input: ComputeCkdEndpointsInput): CkdEndpoints {
  const out = emptyEndpoints()
  out.kidneyFailureReached = input.kidneyFailureReached ?? null
  const threshold = input.threshold ?? CKD_G5_EGFR_THRESHOLD
  const confirmationDays = normalizeConfirmationDays(input.confirmationDays ?? input.enabled.confirmationDays)
  const definitions = ckdCrossingDefinitions(confirmationDays, threshold)
  out.confirmationDays = confirmationDays
  out.evaluated = {
    percentDecline: input.enabled.percentDecline,
    observedCkdG4: input.enabled.observedCkdG4 ?? false,
    observedCkdG5: input.enabled.observedCkdG5,
    projectedAgeToCkdG5: input.enabled.projectedAgeToCkdG5,
  }
  const points = validEndpointPoints(input.points)
  out.endpointPointCount = points.length

  if (input.enabled.percentDecline && points.length > 0) {
    out.percentDecline = percentDeclineFromBaseline(points)
    const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    const baselineEnd = utcDay(points[0].date) + 90 * 86_400_000
    const baselinePoints = points.filter(p => utcDay(p.date) <= baselineEnd)
    const baseline = baselinePoints.reduce((sum, p) => sum + p.value, 0) / baselinePoints.length
    out.declineBaselineValue = baseline
    if (Number.isFinite(baseline) && baseline > 0) {
      const declines = points.filter(p => utcDay(p.date) > baselineEnd).map(p => ({ ...p, originalValue: p.value, value: ((baseline - p.value) / baseline) * 100 }))
      const observeDecline = (threshold: number) => {
        const result = observeThresholdCrossing(declines, { threshold, direction: 'above_or_equal', confirmationDays, maximumConfirmationMonths: 12 })
        // The generic observer evaluates decline percentages; provenance shows actual eGFR.
        const actual = (date: Date | null, percentage: number | null) => date === null || percentage === null ? null
          : declines.find(p => p.date.getTime() === date.getTime() && p.value === percentage)?.originalValue ?? null
        result.firstValue = actual(result.firstDate, result.firstValue)
        result.confirmedValue = actual(result.confirmedDate, result.confirmedValue)
        result.recoveryValue = actual(result.recoveryDate, result.recoveryValue)
        return result
      }
      out.observedDecline40 = observeDecline(40)
      out.observedDecline57 = observeDecline(57)
    }
  }
  if (input.enabled.observedCkdG4) out.observedCkdG4 = observeThresholdCrossing(points, definitions.observedCkdG4)
  if (input.enabled.observedCkdG5) out.observedCkdG5 = observeThresholdCrossing(points, definitions.observedCkdG5)

  if (input.enabled.projectedAgeToCkdG5) {
    if (out.kidneyFailureReached && !out.observedCkdG5.met) {
      out.projectedAgeToCkdG5 = { value: null, reason: 'kidney_failure_reached' }
      return out
    }
    const projected = projectAgeAtCrossing({
      points,
      slopePerYear: input.slopePerYear,
      intercept: input.intercept ?? fitGlobal(points).intercept,
      threshold,
      direction: 'below',
      observed: out.observedCkdG5.met,
    })
    out.projectedAgeToCkdG5 = { value: projected.value, reason: projected.reason === null ? null : PROJECTION_REASONS[projected.reason] }
  }

  return out
}
