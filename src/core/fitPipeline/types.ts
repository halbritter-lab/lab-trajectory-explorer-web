/**
 * Generic fit-pipeline types: the estimator, the time aggregation and the
 * domain-neutral part of a column's fit configuration. Domain modules add
 * their own sections; core/analysis/fitConfig.ts composes the column
 * configuration the app uses.
 */

export type FitXAxis = 'age' | 'calendar_time' | 'time_since_baseline'
export type TimeBalancing = 'raw' | 'monthly-median' | 'quarterly-median'
export type FitModel = 'none' | 'ols' | 'theil-sen' | 'rolling-ols' | 'segmented-ols'

/** The domain-neutral part of a column's fit configuration. */
export interface BaseFitConfig {
  parameter: {
    bezeichnung: string
    einheit: string | null
  }
  /** Identifier of the preset the configuration came from, or 'custom'. */
  preset: string
  xAxis: FitXAxis
  timeBalancing: TimeBalancing
  fitModel: FitModel
}

export interface BaseFitPoint {
  date: Date
  value: number
  operator: '=' | '<' | '>'
  included: boolean
  /** Module reason codes (see the modules' exclusionReasonLabels). */
  exclusionReasons: string[]
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

export interface FitPipelineResult<C extends BaseFitConfig = BaseFitConfig, E = unknown> {
  config: C
  events: E[]
  rawPoints: FitPoint[]
  fitPoints: FitPoint[]
  excludedPoints: FitPoint[]
  fitLines: FitLineSegment[]
  summary: {
    nRaw: number
    nIncluded: number
    nExcludedByReason: Record<string, number>
    nTimeBins: number
    followupYears: number
    medianGapDays: number | null
    maxGapDays: number | null
    clusteredMeasurementsFlag: boolean
  }
}
