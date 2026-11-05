import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFactors, mixedModelFactorColumn, validateMixedModelConfig, type MixedModelConfig, type MixedModelFactor } from './config'
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
  | 'INVALID_FACTOR_VALUES'
  | 'RANK_DEFICIENT_FACTOR'

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
export const MIN_QUALIFYING_PATIENTS = 10

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

    if (!Number.isFinite(row.value) || !Number.isFinite(row.time_since_baseline)) {
      return failure('NON_FINITE_VALUE', 'Mixed model rows require finite outcome values and time_since_baseline values.')
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

  if (config.factors === undefined && config.covariates.includes('baseline_age')) {
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

  let rankProblem: string | null = null
  if (config.factors !== undefined) {
    for (const [index, factor] of mixedModelFactors(config).entries()) {
      const column = mixedModelFactorColumn(factor, index)
      const values = rows.map(row => row.factorValues?.[column])
      if (values.some(value => factor.kind === 'numeric' ? typeof value !== 'number' || !Number.isFinite(value) : typeof value !== 'string' || !value.trim())) {
        return failure('INVALID_FACTOR_VALUES', `Factor ${factor.key} requires a valid value for every modeled row.`)
      }
      if ([...patientRows.values()].some(patient => new Set(patient.map(row => row.factorValues?.[column])).size !== 1)) {
        return failure('INVALID_FACTOR_VALUES', `Factor ${factor.key} must be constant within each patient.`)
      }
      if (new Set(values).size < 2 || (factor.kind === 'categorical' && !values.includes(factor.reference!))) {
        return failure('INVALID_FACTOR_VALUES', `Factor ${factor.key} requires variation and an observed reference level.`)
      }
      rankProblem ??= factor.effect === 'level_slope' ? slopeTermRankProblem(factor, column, rows) : null
    }
  }

  if (patientRows.size < MIN_QUALIFYING_PATIENTS) {
    return failure('INSUFFICIENT_PATIENTS', `Mixed model fitting requires at least ${MIN_QUALIFYING_PATIENTS} patients.`)
  }

  // A random patient slope needs enough distinct times to identify a slope
  // within each qualifying patient. These floors are input guards, not a
  // statistical power or model-adequacy guarantee.
  const minimumDistinctTimes = minimumDistinctTimesFor(config)
  let qualifyingPatientCount = 0
  let singleMeasurementPatientCount = 0
  let noTimeVariationPatientCount = 0
  const modelablePatientIds = new Set<string>()
  for (const [patientId, rowsForPatient] of patientRows) {
    if (rowsForPatient.length < 2) {
      singleMeasurementPatientCount += 1
      continue
    }
    const distinctTimes = new Set(rowsForPatient.map((row) => row.time_since_baseline))
    if (distinctTimes.size < minimumDistinctTimes) {
      noTimeVariationPatientCount += 1
      continue
    }
    qualifyingPatientCount += 1
    modelablePatientIds.add(patientId)
  }

  if (qualifyingPatientCount < MIN_QUALIFYING_PATIENTS) {
    return failure(
      'INSUFFICIENT_REPEATED_MEASURES',
      `Mixed model fitting requires at least ${MIN_QUALIFYING_PATIENTS} patients with at least ${minimumDistinctTimes} distinct measurement times each.`,
    )
  }
  // Reported after the size gates so a unit that is simply too small says so.
  if (rankProblem) return failure('RANK_DEFICIENT_FACTOR', rankProblem)

  const patientTimeKeys = new Set<string>()
  let duplicatePatientTimeRowCount = 0
  for (const row of rows) {
    if (!modelablePatientIds.has(row.patient_id)) continue
    const patientTimeKey = `${row.patient_id}\u0000${row.time_since_baseline}`
    if (patientTimeKeys.has(patientTimeKey)) {
      duplicatePatientTimeRowCount += 1
      continue
    }
    patientTimeKeys.add(patientTimeKey)
  }

  const warnings: string[] = []
  if (singleMeasurementPatientCount > 0) {
    warnings.push(
      `${singleMeasurementPatientCount} patient${singleMeasurementPatientCount === 1 ? ' has' : 's have'} fewer than 2 repeated measurements and contribute${singleMeasurementPatientCount === 1 ? 's' : ''} limited within-patient information.`,
    )
  }
  if (noTimeVariationPatientCount > 0) {
    warnings.push(
      `${noTimeVariationPatientCount} patient${noTimeVariationPatientCount === 1 ? ' has' : 's have'} fewer than ${minimumDistinctTimes} distinct time_since_baseline values and contribute${noTimeVariationPatientCount === 1 ? 's' : ''} limited within-patient time information.`,
    )
  }
  if (duplicatePatientTimeRowCount > 0) {
    warnings.push(
      `${duplicatePatientTimeRowCount} duplicate patient/time row${duplicatePatientTimeRowCount === 1 ? ' was' : 's were'} retained for mixed model fitting.`,
    )
  }

  return { ok: true, warnings }
}

/** Why the factor's time interaction makes the fixed-effect design
 * rank-deficient, or null. Categorical: per level the design has its own
 * intercept and slope column, so every level needs two distinct model times
 * among its rows. Numeric: `time:x` is collinear with `time` when every row
 * with a non-zero time has the same value. Collinearity across several
 * factors is left to the R rank check. */
function slopeTermRankProblem(factor: MixedModelFactor, column: string, rows: readonly MixedModelSpikeRow[]): string | null {
  if (factor.kind === 'numeric') {
    const valuesWithTime = new Set(rows.filter(row => row.time_since_baseline !== 0).map(row => row.factorValues?.[column]))
    return valuesWithTime.size >= 2 ? null
      : `Factor ${factor.key} with level and slope needs measurements over time at two or more different values; otherwise its slope term duplicates the time slope (rank-deficient design). Use level only or change the selection.`
  }
  const levels = new Map<string, { times: Set<number>; patients: Set<string> }>()
  for (const row of rows) {
    const level = String(row.factorValues?.[column])
    const entry = levels.get(level) ?? { times: new Set<number>(), patients: new Set<string>() }
    entry.times.add(row.time_since_baseline)
    entry.patients.add(row.patient_id)
    levels.set(level, entry)
  }
  const flat = [...levels].filter(([, entry]) => entry.times.size < 2)
  if (flat.length === 0) return null
  const named = flat.map(([level, entry]) => `"${level}" (${entry.patients.size} patient${entry.patients.size === 1 ? '' : 's'})`).join(', ')
  return `Factor ${factor.key} with level and slope: level${flat.length === 1 ? '' : 's'} ${named} ${flat.length === 1 ? 'has' : 'have'} measurements at only one model time, so ${flat.length === 1 ? 'its' : 'their'} slope cannot be estimated (rank-deficient design). Use level only, choose other levels or change the selection.`
}

export interface MixedModelLevelCount {
  level: string
  patients: number
  /** Patients counted by qualifyingMixedModelPatients. */
  qualifying: number
}

/** Patients and qualifying patients per level of every categorical factor,
 * keyed by factor key; levels in ascending string order. */
export function mixedModelFactorLevelCounts(rows: readonly MixedModelSpikeRow[], config: MixedModelConfig = DEFAULT_MIXED_MODEL_CONFIG): Map<string, MixedModelLevelCount[]> {
  const out = new Map<string, MixedModelLevelCount[]>()
  for (const [index, factor] of mixedModelFactors(config).entries()) {
    if (factor.kind !== 'categorical') continue
    const column = mixedModelFactorColumn(factor, index)
    const byLevel = new Map<string, MixedModelSpikeRow[]>()
    for (const row of rows) {
      const level = String(row.factorValues?.[column] ?? '')
      const bucket = byLevel.get(level)
      if (bucket) bucket.push(row)
      else byLevel.set(level, [row])
    }
    out.set(factor.key, [...byLevel].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([level, levelRows]) => ({
      level,
      patients: new Set(levelRows.map(row => row.patient_id)).size,
      qualifying: qualifyingMixedModelPatients(levelRows, config),
    })))
  }
  return out
}

/** Distinct measurement times a qualifying patient needs under this config. */
function minimumDistinctTimesFor(config: MixedModelConfig): number {
  return config.randomEffects === 'intercept_slope' ? 3 : 2
}

/** Patients that count towards the minimum in validateMixedModelRows: at least two
 * rows and enough distinct times for the configured random effects. */
export function qualifyingMixedModelPatients(rows: readonly MixedModelSpikeRow[], config: MixedModelConfig = DEFAULT_MIXED_MODEL_CONFIG): number {
  const times = new Map<string, { rows: number; distinct: Set<number> }>()
  for (const row of rows) {
    const entry = times.get(row.patient_id) ?? { rows: 0, distinct: new Set<number>() }
    entry.rows += 1
    entry.distinct.add(row.time_since_baseline)
    times.set(row.patient_id, entry)
  }
  const minimum = minimumDistinctTimesFor(config)
  let count = 0
  for (const entry of times.values()) if (entry.rows >= 2 && entry.distinct.size >= minimum) count += 1
  return count
}

export function hashMixedModelInput(rows: readonly MixedModelSpikeRow[]): string {
  const canonicalRows = rows
    .map((row) => ({
      patient_id: row.patient_id,
      value: roundTo10Decimals(row.value),
      time_since_baseline: roundTo10Decimals(row.time_since_baseline),
      baseline_age: canonicalBaselineAge(row.baseline_age),
      baseline_age_centered: canonicalBaselineAge(row.baseline_age_centered),
      ...(row.factorValues === undefined ? {} : {factorValues: Object.fromEntries(Object.entries(row.factorValues).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, typeof value === 'number' ? roundTo10Decimals(value) : value]))}),
    }))
    .sort((a, b) => {
      const patientComparison = a.patient_id.localeCompare(b.patient_id)
      if (patientComparison !== 0) return patientComparison
      if (a.time_since_baseline !== b.time_since_baseline) return a.time_since_baseline - b.time_since_baseline
      return a.value - b.value
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
