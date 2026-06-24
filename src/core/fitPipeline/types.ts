import type { ClinicalEvent } from '../events/events'

export type FitPreset = 'general_exploration' | 'ckd_progression' | 'acute_review' | 'custom'
export type FitXAxis = 'age' | 'calendar_time' | 'time_since_baseline'
export type TimeBalancing = 'raw' | 'monthly-median' | 'quarterly-median'
export type FitModel = 'none' | 'ols' | 'theil-sen' | 'rolling-ols' | 'segmented-ols'
export type UnknownDialysisPolicy = 'flag-only' | 'exclude-dated-interval' | 'censor-from-start'
export type ExclusionReason =
  | 'aki'
  | 'acute_dialysis'
  | 'unknown_dialysis_interval'
  | 'post_chronic_dialysis'
  | 'post_kidney_transplant'

export interface FitConfig {
  parameter: {
    bezeichnung: string
    einheit: string | null
  }
  preset: FitPreset
  xAxis: FitXAxis
  censoring: {
    censorAfterKidneyTransplant: boolean
    censorAfterChronicDialysis: boolean
    excludeAcuteDialysisPeriods: boolean
    unknownDialysisPolicy: UnknownDialysisPolicy
  }
  exclusions: {
    excludeAkiWindows: boolean
    akiExclusionDays: number
  }
  timeBalancing: TimeBalancing
  fitModel: FitModel
  endpoints: {
    percentDecline: boolean
    observedCkdG5: boolean
    projectedAgeToCkdG5: boolean
  }
}

export interface BaseFitPoint {
  date: Date
  value: number
  operator: '=' | '<' | '>'
  included: boolean
  exclusionReasons: ExclusionReason[]
  sourceRowIndex: number
  aggregate?: {
    period: 'month' | 'quarter'
    nRaw: number
    start: Date
    end: Date
  }
}

export interface NumericFitPoint extends BaseFitPoint {
  xAxis: 'age' | 'time_since_baseline'
  x: number
}

export interface CalendarTimeFitPoint extends BaseFitPoint {
  xAxis: 'calendar_time'
  x: Date
}

export type FitPoint = NumericFitPoint | CalendarTimeFitPoint

export interface FitLinePoint {
  date: Date
  value: number
}

export type FitLineSegment = [FitLinePoint, FitLinePoint]

export interface FitPipelineResult {
  config: FitConfig
  events: ClinicalEvent[]
  rawPoints: FitPoint[]
  fitPoints: FitPoint[]
  excludedPoints: FitPoint[]
  fitLines: FitLineSegment[]
  summary: {
    nRaw: number
    nIncluded: number
    nExcludedByReason: Record<ExclusionReason, number>
    nTimeBins: number
    followupYears: number
    medianGapDays: number | null
    maxGapDays: number | null
    clusteredMeasurementsFlag: boolean
  }
}

const emptyEndpoints = { percentDecline: false, observedCkdG5: false, projectedAgeToCkdG5: false }

export function generalExplorationConfig(parameter: FitConfig['parameter']): FitConfig {
  return {
    parameter,
    preset: 'general_exploration',
    xAxis: 'calendar_time',
    censoring: {
      censorAfterKidneyTransplant: false,
      censorAfterChronicDialysis: false,
      excludeAcuteDialysisPeriods: false,
      unknownDialysisPolicy: 'flag-only',
    },
    exclusions: { excludeAkiWindows: false, akiExclusionDays: 30 },
    timeBalancing: 'raw',
    fitModel: 'ols',
    endpoints: { ...emptyEndpoints },
  }
}

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
    exclusions: { excludeAkiWindows: true, akiExclusionDays: 30 },
    timeBalancing: 'quarterly-median',
    fitModel: 'ols',
    endpoints: { percentDecline: true, observedCkdG5: true, projectedAgeToCkdG5: true },
  }
}

export function acuteReviewConfig(parameter: FitConfig['parameter']): FitConfig {
  return {
    parameter,
    preset: 'acute_review',
    xAxis: 'calendar_time',
    censoring: {
      censorAfterKidneyTransplant: false,
      censorAfterChronicDialysis: false,
      excludeAcuteDialysisPeriods: false,
      unknownDialysisPolicy: 'flag-only',
    },
    exclusions: { excludeAkiWindows: false, akiExclusionDays: 30 },
    timeBalancing: 'raw',
    fitModel: 'none',
    endpoints: { ...emptyEndpoints },
  }
}

const precedence: ExclusionReason[] = [
  'post_kidney_transplant',
  'post_chronic_dialysis',
  'acute_dialysis',
  'unknown_dialysis_interval',
  'aki',
]

export function primaryExclusionReason(reasons: readonly ExclusionReason[]): ExclusionReason | null {
  return precedence.find((reason) => reasons.includes(reason)) ?? null
}
