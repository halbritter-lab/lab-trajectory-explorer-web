/**
 * The nephrology sections of a column's fit configuration and the
 * nephrology presets. Section key order is part of the exported `fit_config`
 * JSON; keep it.
 */
import type { FitConfig, FitPresetDefinition } from '../../analysis/fitConfig'
import { DEFAULT_AKI_EXCLUSION_DAYS, DEFAULT_CONFIRMATION_DAYS } from './constants'

export type UnknownDialysisPolicy = 'flag-only' | 'exclude-dated-interval' | 'censor-from-start'

/** Which clinical events censor or exclude measurements (see censoring.ts). */
export interface ClinicalEventCensoringConfig {
  censorAfterKidneyTransplant: boolean
  censorAfterChronicDialysis: boolean
  excludeAcuteDialysisPeriods: boolean
  unknownDialysisPolicy: UnknownDialysisPolicy
}

/** Whether the window after each AKI onset is left out of the trend fit. */
export interface AkiExclusionConfig {
  excludeAkiWindows: boolean
  akiExclusionDays: number
}

/** Which CKD endpoints an eGFR column evaluates. */
export interface CkdEndpointConfig {
  percentDecline: boolean
  observedCkdG4?: boolean
  observedCkdG5: boolean
  projectedAgeToCkdG5: boolean
  confirmationDays?: number
}

export interface NephrologyFitSections {
  censoring: ClinicalEventCensoringConfig
  exclusions: AkiExclusionConfig
  endpoints: CkdEndpointConfig
}

/** Reasons nephrology modules record for an excluded measurement. */
export type ExclusionReason =
  | 'aki'
  | 'acute_dialysis'
  | 'unknown_dialysis_interval'
  | 'post_chronic_dialysis'
  | 'post_kidney_transplant'

const precedence: ExclusionReason[] = [
  'post_kidney_transplant',
  'post_chronic_dialysis',
  'acute_dialysis',
  'unknown_dialysis_interval',
  'aki',
]

/** The clinically most relevant of several exclusion reasons. */
export function primaryExclusionReason(reasons: readonly ExclusionReason[]): ExclusionReason | null {
  return precedence.find((reason) => reasons.includes(reason)) ?? null
}

/** No clinical-event censoring. */
export function noCensoring(): ClinicalEventCensoringConfig {
  return { censorAfterKidneyTransplant: false, censorAfterChronicDialysis: false, excludeAcuteDialysisPeriods: false, unknownDialysisPolicy: 'flag-only' }
}

/** No AKI-window exclusion (default window length kept for when it is enabled). */
export function noAkiExclusion(): AkiExclusionConfig {
  return { excludeAkiWindows: false, akiExclusionDays: DEFAULT_AKI_EXCLUSION_DAYS }
}

/** No endpoint evaluated (default confirmation interval kept). */
export function noEndpoints(): CkdEndpointConfig {
  return { percentDecline: false, observedCkdG4: false, observedCkdG5: false, confirmationDays: DEFAULT_CONFIRMATION_DAYS, projectedAgeToCkdG5: false }
}

/** CKD progression: quarterly medians, censored after transplant and chronic
 * dialysis, acute and dated unknown dialysis intervals and 30-day AKI windows
 * excluded, all CKD endpoints, age axis. */
export function ckdProgressionConfig(parameter: FitConfig['parameter']): FitConfig {
  return {
    parameter,
    preset: 'ckd_progression',
    xAxis: 'age',
    censoring: {
      censorAfterKidneyTransplant: true,
      censorAfterChronicDialysis: true,
      excludeAcuteDialysisPeriods: true,
      unknownDialysisPolicy: 'exclude-dated-interval',
    },
    exclusions: { excludeAkiWindows: true, akiExclusionDays: DEFAULT_AKI_EXCLUSION_DAYS },
    timeBalancing: 'quarterly-median',
    fitModel: 'ols',
    endpoints: { percentDecline: true, observedCkdG4: true, observedCkdG5: true, confirmationDays: DEFAULT_CONFIRMATION_DAYS, projectedAgeToCkdG5: true },
  }
}

/** Acute review: day-level raw measurements without a trend fit. */
export function acuteReviewConfig(parameter: FitConfig['parameter']): FitConfig {
  return {
    parameter,
    preset: 'acute_review',
    xAxis: 'calendar_time',
    censoring: noCensoring(),
    exclusions: noAkiExclusion(),
    timeBalancing: 'raw',
    fitModel: 'none',
    endpoints: noEndpoints(),
  }
}

/** The nephrology entries of the preset catalog. */
export const NEPHROLOGY_PRESETS: readonly FitPresetDefinition[] = [
  {
    id: 'ckd_progression',
    name: 'CKD progression',
    category: 'Nephrology',
    description: 'Quarterly medians, censored after transplant and chronic dialysis, 30-day AKI exclusion, G4/G5 endpoints on raw data, OLS trend.',
    optionLabel: 'CKD progression (quarterly medians, censoring, AKI exclusion)',
    summary: 'CKD progression: quarterly medians, censored after transplant and chronic dialysis, 30-day AKI exclusion, OLS display trend. G4/G5 endpoints and prediction use raw measurements.',
    buildConfig: ckdProgressionConfig,
  },
  {
    id: 'acute_review',
    name: 'Acute review',
    category: 'Nephrology',
    description: 'Day-level raw measurements without trend fit, focusing on KDIGO AKI episodes.',
    optionLabel: 'Acute review (day-level raw points, no fit)',
    summary: 'Acute review: day-level measurements without trend fit, focusing on KDIGO AKI.',
    buildConfig: acuteReviewConfig,
  },
]
