import { isRecord } from './guards'
import type { MixedModelMetadata, MixedModelSuccess } from './types'
import type { MixedModelWorkerRequest } from './workerProtocol'

export interface FitExtractionResult {
  converged: unknown
  warnings: unknown
  fixedEffects: unknown
  fixedEffectConfidenceIntervals: unknown
  randomEffects: unknown
  residualSd: unknown
  optimizer: unknown
  packageVersions: unknown
}

export class ResultExtractionError extends Error {}

export function normalizeExtractedFitResult(
  request: MixedModelWorkerRequest,
  metadata: MixedModelMetadata,
  extracted: FitExtractionResult,
): MixedModelSuccess {
  if (typeof extracted.converged !== 'boolean') {
    throw new ResultExtractionError('webR fit result field converged must be boolean.')
  }
  const warnings = normalizeWarnings(extracted.warnings)
  if (!isStringRecord(extracted.packageVersions)) {
    throw new ResultExtractionError('webR fit result field packageVersions must be Record<string, string>.')
  }
  if (
    extracted.optimizer !== null &&
    typeof extracted.optimizer !== 'undefined' &&
    typeof extracted.optimizer !== 'string'
  ) {
    throw new ResultExtractionError('webR fit result field optimizer must be string, null, or undefined.')
  }

  const fixedEffects = normalizeFixedEffects(request, extracted.fixedEffects)
  const fixedEffectConfidenceIntervals = normalizeFixedEffectConfidenceIntervals(
    extracted.fixedEffectConfidenceIntervals,
  )
  const randomEffects = normalizeRandomEffects(extracted.randomEffects)
  const residualSd = requireNullableFiniteNumber(extracted.residualSd, 'residualSd')
  const optimizer = typeof extracted.optimizer === 'string' ? extracted.optimizer : metadata.optimizer

  if (!fixedEffects || !randomEffects) {
    throw new ResultExtractionError('webR fit result is missing fixed or random effect estimates.')
  }

  return {
    status: 'success',
    metadata: {
      ...metadata,
      optimizer,
      packageVersions: extracted.packageVersions,
    },
    converged: extracted.converged,
    warnings,
    nPatients: new Set(request.rows.map((row) => row.patient_id)).size,
    nMeasurements: request.rows.length,
    fixedEffects,
    fixedEffectConfidenceIntervals,
    randomEffects,
    residualSd,
  }
}

function normalizeFixedEffects(
  request: MixedModelWorkerRequest,
  value: unknown,
): MixedModelSuccess['fixedEffects'] | null {
  if (!isRecord(value)) return null
  const intercept = requireFiniteNumber(value.intercept, 'fixedEffects.intercept')
  const timeSinceBaseline = requireFiniteNumber(value.timeSinceBaseline, 'fixedEffects.timeSinceBaseline')
  if (!request.config.covariates.includes('baseline_age')) {
    return { intercept, timeSinceBaseline }
  }
  const baselineAge = requireFiniteNumber(value.baselineAge, 'fixedEffects.baselineAge')
  return { intercept, timeSinceBaseline, baselineAge }
}

function normalizeFixedEffectConfidenceIntervals(value: unknown): MixedModelSuccess['fixedEffectConfidenceIntervals'] {
  if (!isRecord(value)) {
    throw new ResultExtractionError('webR fit result field fixedEffectConfidenceIntervals must be an object.')
  }
  return {
    timeSinceBaseline: requireNullableFiniteNumberPair(
      value.timeSinceBaseline,
      'fixedEffectConfidenceIntervals.timeSinceBaseline',
    ),
  }
}

function normalizeRandomEffects(value: unknown): MixedModelSuccess['randomEffects'] | null {
  if (!isRecord(value)) return null
  return {
    interceptSd: requireNullableFiniteNumber(value.interceptSd, 'randomEffects.interceptSd'),
    slopeSd: requireNullableFiniteNumber(value.slopeSd, 'randomEffects.slopeSd'),
    interceptSlopeCorrelation: requireNullableFiniteNumber(
      value.interceptSlopeCorrelation,
      'randomEffects.interceptSlopeCorrelation',
    ),
  }
}

function requireNullableFiniteNumberPair(value: unknown, fieldName: string): [number, number] | null {
  if (value === null) return null
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    throw new ResultExtractionError(`webR fit result field ${fieldName} must be a finite [low, high] pair or null.`)
  }
  return [value[0], value[1]]
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ResultExtractionError(`webR fit result field ${fieldName} must be a finite number.`)
  }
  return value
}

function requireNullableFiniteNumber(value: unknown, fieldName: string): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ResultExtractionError(`webR fit result field ${fieldName} must be a finite number or null.`)
  }
  return value
}

function normalizeWarnings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  // jsonlite serializes the R warnings vector with na = "null", so an NA
  // warning arrives as JSON null inside the array. Drop those rather than
  // failing an otherwise-successful fit; keep every real string warning.
  if (Array.isArray(value) && value.every((item) => typeof item === 'string' || item === null)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (isRecord(value) && Object.keys(value).length === 0) return []
  throw new ResultExtractionError(`webR fit result field warnings must be string[]; received ${describeValue(value)}.`)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function describeValue(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}
