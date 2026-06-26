import { DEFAULT_MIXED_MODEL_CONFIG, validateMixedModelConfig, type MixedModelConfig } from './config'
import type { MixedModelFailureStage, MixedModelSpikeRow } from './types'

export type MixedModelValidationCode =
  | 'EMPTY_DATASET'
  | 'EMPTY_PATIENT_ID'
  | 'NON_FINITE_VALUE'
  | 'DUPLICATE_PATIENT_TIME'
  | 'INSUFFICIENT_PATIENTS'
  | 'INSUFFICIENT_REPEATED_MEASURES'
  | 'NO_WITHIN_PATIENT_TIME_VARIATION'
  | 'UNSUPPORTED_CONFIG'
  | 'MISSING_BASELINE_AGE'

export type MixedModelValidationResult =
  | {
      ok: true
      warnings: string[]
    }
  | {
      ok: false
      stage: Extract<MixedModelFailureStage, 'data-validation'>
      code: MixedModelValidationCode
      message: string
      warnings: string[]
    }

const DATA_VALIDATION_STAGE = 'data-validation' as const

export function validateMixedModelRows(
  rows: readonly MixedModelSpikeRow[],
  config: MixedModelConfig = DEFAULT_MIXED_MODEL_CONFIG,
): MixedModelValidationResult {
  if (rows.length === 0) {
    return failure('EMPTY_DATASET', 'Mixed model fitting requires at least one measurement row.')
  }

  const patientRows = new Map<string, MixedModelSpikeRow[]>()

  for (const row of rows) {
    if (row.patient_id.trim() === '') {
      return failure('EMPTY_PATIENT_ID', 'Mixed model rows require a non-empty patient_id.')
    }

    if (!Number.isFinite(row.eGFR) || !Number.isFinite(row.time_since_baseline)) {
      return failure('NON_FINITE_VALUE', 'Mixed model rows require finite eGFR and time_since_baseline values.')
    }

    const existingRows = patientRows.get(row.patient_id)
    if (existingRows) {
      existingRows.push(row)
    } else {
      patientRows.set(row.patient_id, [row])
    }
  }

  const configValidation = validateMixedModelConfig(config)
  if (!configValidation.ok) {
    return failure('UNSUPPORTED_CONFIG', configValidation.message)
  }

  if (config.covariates.includes('baseline_age')) {
    const missingPatients = [...patientRows.entries()]
      .filter(([, rowsForPatient]) => rowsForPatient.some((row) => !Number.isFinite(row.baseline_age) || !Number.isFinite(row.baseline_age_centered)))
      .map(([patientId]) => patientId)
    if (missingPatients.length > 0) {
      return failure(
        'MISSING_BASELINE_AGE',
        `Baseline age is required for this model but is unavailable for ${missingPatients.length} modeled patient${missingPatients.length === 1 ? '' : 's'}.`,
      )
    }
  }

  if (patientRows.size < 3) {
    return failure('INSUFFICIENT_PATIENTS', 'Mixed model fitting requires at least 3 patients.')
  }

  for (const [patientId, rowsForPatient] of patientRows) {
    if (rowsForPatient.length < 2) {
      return failure(
        'INSUFFICIENT_REPEATED_MEASURES',
        `Patient ${patientId} requires at least 2 repeated measurements for mixed model fitting.`,
      )
    }

    const distinctTimes = new Set(rowsForPatient.map((row) => row.time_since_baseline))
    if (distinctTimes.size < 2) {
      return failure(
        'NO_WITHIN_PATIENT_TIME_VARIATION',
        `Patient ${patientId} requires at least 2 distinct time_since_baseline values.`,
      )
    }
  }

  const patientTimeKeys = new Set<string>()
  for (const row of rows) {
    const patientTimeKey = `${row.patient_id}\u0000${row.time_since_baseline}`
    if (patientTimeKeys.has(patientTimeKey)) {
      return failure('DUPLICATE_PATIENT_TIME', 'Mixed model rows must not duplicate patient_id and time_since_baseline pairs.')
    }
    patientTimeKeys.add(patientTimeKey)
  }

  return { ok: true, warnings: [] }
}

export function hashMixedModelInput(rows: readonly MixedModelSpikeRow[]): string {
  const canonicalRows = rows
    .map((row) => ({
      patient_id: row.patient_id,
      eGFR: roundTo10Decimals(row.eGFR),
      time_since_baseline: roundTo10Decimals(row.time_since_baseline),
      baseline_age: canonicalBaselineAge(row.baseline_age),
      baseline_age_centered: canonicalBaselineAge(row.baseline_age_centered),
    }))
    .sort((a, b) => {
      const patientComparison = a.patient_id.localeCompare(b.patient_id)
      if (patientComparison !== 0) return patientComparison
      if (a.time_since_baseline !== b.time_since_baseline) return a.time_since_baseline - b.time_since_baseline
      return a.eGFR - b.eGFR
    })

  return hashString(JSON.stringify(canonicalRows))
}

export function hashString(input: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function failure(code: MixedModelValidationCode, message: string): MixedModelValidationResult {
  return {
    ok: false,
    stage: DATA_VALIDATION_STAGE,
    code,
    message,
    warnings: [],
  }
}

export function roundTo10Decimals(value: number): number {
  return Math.round(value * 10_000_000_000) / 10_000_000_000
}

function canonicalBaselineAge(value: unknown): number | null {
  return Number.isFinite(value) ? roundTo10Decimals(value as number) : null
}
