import { comparePatientIds } from '../types'
import { hashMixedModelInput, hashString, roundTo10Decimals } from './validation'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelConfigHashInput, type MixedModelConfig } from './config'
import { MIXED_MODEL_FORMULA, MIXED_MODEL_TOLERANCE, type MixedModelSpikeRow, type MixedModelSuccess } from './types'
import type { CohortSeriesSpec } from '../cohort/screening'

export interface MixedModelResultIdentity {
  seriesIndex: number
  seriesKey: string
  patientIdsHash: string
  datasetHash: string
  fitConfigHash: string
  nPatients: number
  nMeasurements: number
}

export interface MixedModelResultIdentityInput {
  seriesIndex: number
  seriesKey: string
  patientIds: readonly string[]
  rows: readonly MixedModelSpikeRow[]
  fitConfigHash: string
}

export interface MixedModelMeanLinePoint {
  time_since_baseline: number
  age?: number
  eGFR: number
}

export function mixedModelFitConfigHash(
  spec: CohortSeriesSpec,
  config: MixedModelConfig = DEFAULT_MIXED_MODEL_CONFIG,
): string {
  return hashString(JSON.stringify({
    engine: 'webr-lme4',
    formula: MIXED_MODEL_FORMULA,
    reml: true,
    tolerance: MIXED_MODEL_TOLERANCE,
    model: mixedModelConfigHashInput(config),
    series: {
      bezeichnung: spec.bezeichnung,
      einheit: spec.einheit ?? null,
    },
    legacyPolicy: {
      mode: spec.mode,
      gapDays: spec.gapDays ?? null,
      windowDays: spec.windowDays ?? null,
      stepDays: spec.stepDays ?? null,
      cutoffDays: spec.cutoffDays ?? null,
      exclusionDays: spec.exclusionDays ?? null,
    },
    fitConfig: spec.fitConfig
      ? {
          xAxis: spec.fitConfig.xAxis,
          censoring: spec.fitConfig.censoring,
          exclusions: spec.fitConfig.exclusions,
          timeBalancing: spec.fitConfig.timeBalancing,
          fitModel: spec.fitConfig.fitModel,
        }
      : null,
  }))
}

export function buildMixedModelResultIdentity({
  seriesIndex,
  seriesKey,
  patientIds,
  rows,
  fitConfigHash,
}: MixedModelResultIdentityInput): MixedModelResultIdentity {
  const sortedPatientIds = [...new Set(patientIds)].sort(compareCanonicalPatientIds)
  const modelPatientIds = new Set(rows.map((row) => row.patient_id))
  return {
    seriesIndex,
    seriesKey,
    patientIdsHash: hashString(JSON.stringify(sortedPatientIds)),
    datasetHash: hashMixedModelInput(rows),
    fitConfigHash,
    nPatients: modelPatientIds.size,
    nMeasurements: rows.length,
  }
}

export function mixedModelIdentityEquals(
  a: MixedModelResultIdentity | null,
  b: MixedModelResultIdentity | null,
): boolean {
  return Boolean(
    a &&
      b &&
      a.seriesIndex === b.seriesIndex &&
      a.seriesKey === b.seriesKey &&
      a.patientIdsHash === b.patientIdsHash &&
      a.datasetHash === b.datasetHash &&
      a.fitConfigHash === b.fitConfigHash &&
      a.nPatients === b.nPatients &&
      a.nMeasurements === b.nMeasurements,
  )
}

function compareCanonicalPatientIds(a: string, b: string): number {
  const patientComparison = comparePatientIds(a, b)
  if (patientComparison !== 0) return patientComparison
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function mixedModelMeanLinePoints(
  result: MixedModelSuccess,
  rows: readonly MixedModelSpikeRow[],
  context: { baselineAgeCentered?: number | null; ageAxisBaselineAge?: number | null } = {},
): MixedModelMeanLinePoint[] {
  if (rows.length === 0) return []
  let minTime = Number.POSITIVE_INFINITY
  let maxTime = Number.NEGATIVE_INFINITY
  for (const row of rows) {
    const time = row.time_since_baseline
    if (time < minTime) minTime = time
    if (time > maxTime) maxTime = time
  }
  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || minTime === maxTime) return []
  const { intercept, timeSinceBaseline } = result.fixedEffects
  const baselineAgeAdjustment =
    result.fixedEffects.baselineAge !== undefined && context.baselineAgeCentered !== null && context.baselineAgeCentered !== undefined
      ? result.fixedEffects.baselineAge * context.baselineAgeCentered
      : 0
  return [minTime, maxTime].map((time) => ({
    time_since_baseline: roundTo10Decimals(time),
    ...(context.ageAxisBaselineAge !== null && context.ageAxisBaselineAge !== undefined
      ? { age: roundTo10Decimals(context.ageAxisBaselineAge + time) }
      : {}),
    eGFR: roundTo10Decimals(intercept + baselineAgeAdjustment + timeSinceBaseline * time),
  }))
}
