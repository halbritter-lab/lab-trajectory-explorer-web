import { isRecord } from './guards'
import type { MixedModelConfig } from './config'
import type { MixedModelEngine, MixedModelResult, MixedModelSpikeRow } from './types'

export interface MixedModelWorkerRequest {
  type: 'run-mixed-model'
  requestId: string
  engine: MixedModelEngine
  config: MixedModelConfig
  formula: string
  formulaKey: string
  rows: MixedModelSpikeRow[]
  datasetId: string
  fitConfigHash: string
  wasmAssetSource: 'cdn' | 'self-hosted' | 'local-dev'
}

export interface MixedModelWorkerResponse {
  type: 'mixed-model-result'
  requestId: string
  result: MixedModelResult
}

export function isMixedModelWorkerResponse(value: unknown): value is MixedModelWorkerResponse {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.type !== 'mixed-model-result' || typeof record.requestId !== 'string') return false
  if (typeof record.result !== 'object' || record.result === null) return false
  return isMixedModelResult(record.result)
}

function isMixedModelResult(value: unknown): value is MixedModelResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Record<string, unknown>
  if (result.status === 'success') return isMixedModelSuccess(result)
  return isMixedModelFailure(result)
}

function isMixedModelSuccess(result: Record<string, unknown>): boolean {
  if (typeof result.converged !== 'boolean') return false
  if (!Array.isArray(result.warnings) || !result.warnings.every((warning) => typeof warning === 'string')) return false
  if (!isFiniteNumber(result.nPatients) || !isFiniteNumber(result.nMeasurements)) return false
  if (
    !isRecord(result.metadata) ||
    !isRecord(result.fixedEffects) ||
    !isRecord(result.fixedEffectConfidenceIntervals) ||
    !isRecord(result.randomEffects)
  ) return false

  const fixedEffects = result.fixedEffects
  if (!isFiniteNumber(fixedEffects.intercept) || !isFiniteNumber(fixedEffects.timeSinceBaseline)) return false
  if (
    typeof fixedEffects.baselineAge !== 'undefined' &&
    !isFiniteNumber(fixedEffects.baselineAge)
  ) {
    return false
  }

  const fixedEffectConfidenceIntervals = result.fixedEffectConfidenceIntervals
  if (!isNullableNumberPair(fixedEffectConfidenceIntervals.timeSinceBaseline)) return false

  const randomEffects = result.randomEffects
  return (
    isNullableNumber(randomEffects.interceptSd) &&
    isNullableNumber(randomEffects.slopeSd) &&
    isNullableNumber(randomEffects.interceptSlopeCorrelation) &&
    isNullableNumber(result.residualSd)
  )
}

function isMixedModelFailure(result: Record<string, unknown>): boolean {
  return (
    isFailureStatus(result.status) &&
    isEngine(result.engine) &&
    isFailureStage(result.stage) &&
    typeof result.code === 'string' &&
    typeof result.message === 'string' &&
    Array.isArray(result.warnings) &&
    result.warnings.every((warning) => typeof warning === 'string') &&
    isRecord(result.metadata)
  )
}

function isFailureStatus(value: unknown): boolean {
  return (
    value === 'unsupported' ||
    value === 'runtime-error' ||
    value === 'fit-error' ||
    value === 'timeout' ||
    value === 'cancelled'
  )
}

function isFailureStage(value: unknown): boolean {
  return (
    value === 'worker-load' ||
    value === 'runtime-load' ||
    value === 'package-load' ||
    value === 'data-validation' ||
    value === 'fit' ||
    value === 'result-extraction'
  )
}

function isEngine(value: unknown): value is MixedModelEngine {
  return value === 'webr-lme4' || value === 'webr-nlme' || value === 'pyodide-statsmodels'
}

function isNullableNumber(value: unknown): boolean {
  return isFiniteNumber(value) || value === null
}

function isNullableNumberPair(value: unknown): boolean {
  return (
    value === null ||
    (Array.isArray(value) &&
      value.length === 2 &&
      isFiniteNumber(value[0]) &&
      isFiniteNumber(value[1]))
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
