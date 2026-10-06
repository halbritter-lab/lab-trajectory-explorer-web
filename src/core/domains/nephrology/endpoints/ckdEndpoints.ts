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
    observedCkdG4: { id: 'observedCkdG4', label: 'CKD G4', threshold: CKD_G4_EGFR_THRESHOLD, direction: 'below', confirmationDays },
    observedCkdG5: { id: 'observedCkdG5', label: 'CKD G5', threshold: g5Threshold, direction: 'below', confirmationDays },
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

  if (input.enabled.percentDecline && points.length > 0) out.percentDecline = percentDeclineFromBaseline(points)
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
