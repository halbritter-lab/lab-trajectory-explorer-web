import type { MixedModelConfig } from './config'

export type MixedModelEngine = 'webr-lme4' | 'webr-nlme' | 'pyodide-statsmodels'

export interface MixedModelSpikeRow {
  patient_id: string
  value: number
  time_since_baseline: number
  /** Raw age at the first included model point for that patient. */
  baseline_age?: number
  /** Patient baseline age centered at the modeled cohort's patient-weighted mean baseline age. */
  baseline_age_centered?: number
  factorValues?: Record<string, number | string>
  /** Factor values before centring, by the same column names. Export only; R never reads them. */
  factorRawValues?: Record<string, number | string>
  /** UTC date (YYYY-MM-DD) of the model point. Export only; R never reads it. */
  date?: string
}

/** What happened to one measurement of the modelled series on its way into a
 * model unit. `model_date` names the model row it fed, empty when excluded. */
export interface MixedModelInputFlag {
  patient_id: string
  date: string
  value: number | null
  status: 'entered' | 'aggregated_into_median' | 'excluded'
  reason: string
  model_date: string
}

export interface MixedModelPreparationSummary {
  presetExclusionPolicy?: 'apply' | 'skip'
  excludedByPreset?: number
  nPatientsBefore: number
  nMeasurementsBefore: number
  excludedPatients: Array<{ patientId: string; reasons: string[] }>
  centers: Record<string, number>
}

export interface MixedModelProductionRow extends MixedModelSpikeRow {
  age?: number
  source_row_index: number
  included: true
}

export interface MixedModelMetadata {
  engine: MixedModelEngine
  formula: string
  runtimeVersion: string | null
  packageVersions: Record<string, string>
  browserUserAgent: string
  wasmAssetSource: 'cdn' | 'self-hosted' | 'local-dev'
  modelConfig?: MixedModelConfig
  preparation?: MixedModelPreparationSummary
  optimizer: string | null
  reml: boolean
  tolerance: number | null
  datasetId: string
  datasetHash: string
  randomSeed: number | null
  fitConfigHash: string
}

export interface MixedModelSuccess {
  status: 'success'
  metadata: MixedModelMetadata
  converged: boolean
  /** Random-effects covariance is at the boundary/rank deficient; independent of optimizer convergence. */
  singular: boolean
  warnings: string[]
  nPatients: number
  nMeasurements: number
  fixedEffects: {
    intercept: number
    timeSinceBaseline: number
    baselineAge?: number
  }
  fixedEffectTerms?: Array<{ term: string; estimate: number; confidenceInterval: [number, number] | null; standardError?: number | null }>
  /** `vcov(fit)` with rows and columns in `terms` order; absent for results fitted before it was recorded. */
  fixedEffectCovariance?: { terms: string[]; matrix: Array<Array<number | null>> }
  fixedEffectConfidenceIntervals: {
    timeSinceBaseline: [number, number] | null
  }
  randomEffects: {
    interceptSd: number | null
    slopeSd: number | null
    interceptSlopeCorrelation: number | null
  }
  residualSd: number | null
}

export type MixedModelFailureStatus = 'unsupported' | 'runtime-error' | 'fit-error' | 'timeout' | 'cancelled'
export type MixedModelFailureStage =
  | 'worker-load'
  | 'runtime-load'
  | 'package-load'
  | 'data-validation'
  | 'fit'
  | 'result-extraction'

export interface MixedModelFailure {
  status: MixedModelFailureStatus
  engine: MixedModelEngine
  stage: MixedModelFailureStage
  code: string
  message: string
  warnings: string[]
  metadata: Partial<MixedModelMetadata>
}

export type MixedModelResult = MixedModelSuccess | MixedModelFailure

export interface CohortSlopeApproximationResult {
  status: 'success' | 'insufficient-data'
  method: 'patient-slope-weighted-summary'
  label: 'Cohort slope summary (not a mixed model)'
  nPatients: number
  nMeasurements: number
  meanSlope: number | null
  confidenceInterval: [number, number] | null
  warnings: string[]
}

export const MIXED_MODEL_FORMULA = 'value ~ time_since_baseline + (1 + time_since_baseline | patient_id)'
export const MIXED_MODEL_TOLERANCE = 1e-6
// A cold run downloads the webR runtime plus the lme4 package and installs them
// before fitting, which can take well over 30s on a slow connection. The first
// job pays this; reused workers (see runMixedModelWorkerJob) skip it.
export const MIXED_MODEL_TIMEOUT_MS = 120_000
