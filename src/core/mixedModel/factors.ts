import { normaliseSex } from '../demographics/sex'
import { isNotTestedValue, NOT_TESTED_LEVEL } from '../attributes/notTested'
import { isExactMeasurement } from '../measurements/censored'
import { patientIdKey, type LabRow } from '../types'
import {
  LOG_BASELINE_UACR_KEY, MIN_LEVEL_MEASUREMENTS, MIN_LEVEL_PATIENTS, mixedModelFactorColumn, mixedModelFactorLabel, mixedModelFactors, POOLED_LEVEL,
  type MixedModelConfig, type MixedModelFactor,
} from './config'
import type { MixedModelLevelPooling, MixedModelPreparationSummary, MixedModelSpikeRow } from './types'
import { roundTo10Decimals } from './validation'

/** A UACR value counts as baseline when it lies at most this many calendar
 * days before or after the model baseline; a rule of this tool (2026-11-22). */
export const UACR_BASELINE_WINDOW_DAYS = 90
const MS_PER_DAY = 86_400_000

type Attributes = Record<string, Record<string, string>>

export interface AvailableMixedModelFactor {
  key: string
  label: string
  levels: string[]
  /** The automatic type: numeric when every level is a number. */
  numeric: boolean
  /** Whether the user may switch the type (OD-22): attributes other than
   * baseline age and sex. Numeric is offered only when a level is a number. */
  typeSwitchable: boolean
  anyNumericLevel: boolean
  /** The UACR series of the covariate `log_baseline_uacr`. */
  series?: { name: string; unit: string | null }
}

/** Prepare only patient covariates. Measurement selection/time origin is owned
 * by cohortDataset; missing covariates never remove patients from other views. */
export function prepareMixedModelFactors(
  rows: readonly MixedModelSpikeRow[],
  config: MixedModelConfig,
  attributes: Attributes,
  resolvedRows: readonly LabRow[],
): { rows: MixedModelSpikeRow[]; preparation: MixedModelPreparationSummary } {
  const byPatient = new Map<string, MixedModelSpikeRow[]>()
  for (const row of rows) {
    const bucket = byPatient.get(row.patient_id) ?? []
    bucket.push(row)
    byPatient.set(row.patient_id, bucket)
  }
  const preparation: MixedModelPreparationSummary = {
    nPatientsBefore: byPatient.size,
    nMeasurementsBefore: rows.length,
    excludedPatients: [],
    centers: {},
  }
  // Legacy configurations retain their existing all-patients validation path.
  if (config.factors === undefined || config.factors.length === 0) {
    if (config.factors === undefined && config.covariates.includes('baseline_age')) {
      const ages = [...byPatient.values()].map((patientRows) => patientRows[0].baseline_age)
        .filter((age): age is number => Number.isFinite(age))
      if (ages.length > 0) preparation.centers.baseline_age_centered = ages.reduce((sum, age) => sum + age, 0) / ages.length
    }
    return { rows: [...rows], preparation }
  }
  const factors = mixedModelFactors(config)
  const sexes = resolvedSexes(resolvedRows)
  const uacrRows = uacrRowsByPatient(factors, resolvedRows)
  const complete = new Map<string, Record<string, number | string>>()
  const imported = new Map<string, Record<string, number | string>>()
  for (const [patientId, patientRows] of byPatient) {
    const values: Record<string, number | string> = {}
    const importedValues: Record<string, number | string> = {}
    const reasons: string[] = []
    factors.forEach((factor, index) => {
      const column = mixedModelFactorColumn(factor, index)
      if (factor.key === LOG_BASELINE_UACR_KEY) {
        const baseline = logBaselineUacr(uacrRows.get(patientId) ?? [], patientRows[0].date)
        if (baseline === null) reasons.push(`Missing ${factor.key}`)
        else { values[column] = baseline; importedValues[column] = baseline }
        return
      }
      const raw = factor.key === 'baseline_age'
        ? patientRows[0].baseline_age
        : factor.key === 'sex'
          ? patientSex(patientId, sexes, attributes)
          : attributeValue(attributes, patientId, factor.key)
      const text = raw === undefined || raw === null ? '' : String(raw).trim()
      // An attribute value meaning "not tested" is its own level, never "no
      // variant" and never missing (decision `genomiss`, 2026-11-22).
      const notTested = factor.key !== 'baseline_age' && factor.key !== 'sex' && isNotTestedValue(text)
      const value = factor.kind === 'numeric' ? (notTested ? null : finiteNumeric(text)) : notTested ? NOT_TESTED_LEVEL : text || null
      if (value === null) {
        reasons.push(`${notTested ? 'Not tested' : text ? 'Invalid numeric' : 'Missing'} ${factor.key}`)
      } else {
        values[column] = value
        importedValues[column] = factor.kind === 'numeric' ? value : text
      }
    })
    if (reasons.length > 0) preparation.excludedPatients.push({ patientId, reasons })
    else { complete.set(patientId, values); imported.set(patientId, importedValues) }
  }
  const pooling = applyLevelMinimum(factors, config, complete, byPatient, preparation)
  if (pooling.length > 0) preparation.levelPooling = pooling
  const raw = new Map([...complete].map(([patientId]) => [patientId, { ...imported.get(patientId)! }]))
  for (const [index, factor] of factors.entries()) {
    if (factor.kind !== 'numeric' || complete.size === 0) continue
    const column = mixedModelFactorColumn(factor, index)
    const center = [...complete.values()].reduce((sum, values) => sum + (values[column] as number), 0) / complete.size
    preparation.centers[column] = center
    for (const values of complete.values()) values[column] = roundTo10Decimals((values[column] as number) - center)
  }
  const selected = rows.filter((row) => complete.has(row.patient_id)).map((row) => {
    const factorValues = complete.get(row.patient_id)!
    return {
      ...row,
      factorValues: { ...factorValues },
      factorRawValues: raw.get(row.patient_id)!,
      ...(typeof factorValues.baseline_age_centered === 'number'
        ? { baseline_age_centered: factorValues.baseline_age_centered }
        : {}),
    }
  })
  return { rows: selected, preparation }
}

/** The minimum per categorical level (decision `genomin`, 2026-11-22): a
 * level needs `MIN_LEVEL_PATIENTS` patients with at least
 * `MIN_LEVEL_MEASUREMENTS` model rows each. First, a "not tested" level below
 * it is removed with its patients (never pooled, so never merged with another
 * level); then, on the remaining patients, every other level below it is
 * pooled into `POOLED_LEVEL`. With `smallLevelPolicy: 'keep'` nothing is
 * pooled or removed and small levels are recorded as `kept_below_minimum`.
 * Mutates `complete` and `preparation.excludedPatients`. */
function applyLevelMinimum(
  factors: readonly MixedModelFactor[],
  config: MixedModelConfig,
  complete: Map<string, Record<string, number | string>>,
  byPatient: ReadonlyMap<string, readonly MixedModelSpikeRow[]>,
  preparation: MixedModelPreparationSummary,
): MixedModelLevelPooling[] {
  const categorical = factors.flatMap((factor, index) => factor.kind === 'categorical' ? [{ factor, column: mixedModelFactorColumn(factor, index) }] : [])
  if (categorical.length === 0) return []
  const pool = (config.smallLevelPolicy ?? 'pool') === 'pool'
  const counts = (column: string) => {
    const levels = new Map<string, { patients: number; repeated: number }>()
    for (const [patientId, values] of complete) {
      const level = String(values[column])
      const entry = levels.get(level) ?? { patients: 0, repeated: 0 }
      entry.patients += 1
      if ((byPatient.get(patientId)?.length ?? 0) >= MIN_LEVEL_MEASUREMENTS) entry.repeated += 1
      levels.set(level, entry)
    }
    return [...levels].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  }
  const records: MixedModelLevelPooling[] = []
  if (pool) {
    // Pass 1: a small "not tested" level leaves the model with its patients.
    for (const { factor, column } of categorical) {
      const small = counts(column).find(([level, entry]) => level === NOT_TESTED_LEVEL && entry.repeated < MIN_LEVEL_PATIENTS)
      if (!small) continue
      records.push({ factor: factor.key, column, level: NOT_TESTED_LEVEL, modelLevel: '', patients: small[1].patients, patientsWithRepeated: small[1].repeated, action: 'excluded_not_tested' })
      for (const [patientId, values] of [...complete]) {
        if (values[column] !== NOT_TESTED_LEVEL) continue
        complete.delete(patientId)
        preparation.excludedPatients.push({ patientId, reasons: [`Not tested ${factor.key}: fewer than ${MIN_LEVEL_PATIENTS} patients with ${MIN_LEVEL_MEASUREMENTS} or more measurements`] })
      }
    }
  }
  // Pass 2: on the remaining patients, pool (or record) every other small level.
  for (const { factor, column } of categorical) {
    const pooled = new Set<string>()
    for (const [level, entry] of counts(column)) {
      const small = entry.repeated < MIN_LEVEL_PATIENTS
      const action: MixedModelLevelPooling['action'] = !small ? 'kept' : pool && level !== NOT_TESTED_LEVEL ? 'pooled' : 'kept_below_minimum'
      if (action === 'pooled') pooled.add(level)
      records.push({ factor: factor.key, column, level, modelLevel: action === 'pooled' ? POOLED_LEVEL : level, patients: entry.patients, patientsWithRepeated: entry.repeated, action })
    }
    if (pooled.size > 0) for (const values of complete.values()) if (pooled.has(String(values[column]))) values[column] = POOLED_LEVEL
  }
  return records
}

/** Exact, dated, positive values of the factor's UACR series per patient. */
function uacrRowsByPatient(factors: readonly MixedModelFactor[], rows: readonly LabRow[]): Map<string, LabRow[]> {
  const series = factors.find(factor => factor.key === LOG_BASELINE_UACR_KEY)?.series
  const out = new Map<string, LabRow[]>()
  if (!series) return out
  for (const row of rows) {
    if (row.bezeichnung !== series.name || (row.einheit ?? null) !== (series.unit ?? null)) continue
    if (row.labDatum === null || row.wertNum === null || !Number.isFinite(row.wertNum) || !(row.wertNum > 0) || !isExactMeasurement(row)) continue
    const id = patientIdKey(row.patientId)
    const bucket = out.get(id)
    if (bucket) bucket.push(row)
    else out.set(id, [row])
  }
  return out
}

/** ln of the baseline UACR (decision `uacr`, 2026-11-22): among the exact
 * positive values dated at most `UACR_BASELINE_WINDOW_DAYS` calendar days
 * (UTC) before or after the model baseline date (the date of the patient's
 * first model row), those of the nearest date; at equal distance the date
 * before the baseline; several values on that date give their median. Null
 * without such a value. */
export function logBaselineUacr(rows: readonly LabRow[], baselineDate: string | undefined): number | null {
  if (!baselineDate) return null
  const baseline = Date.parse(`${baselineDate}T00:00:00Z`)
  if (!Number.isFinite(baseline)) return null
  let best: { distance: number; day: number; values: number[] } | null = null
  for (const row of rows) {
    const date = row.labDatum!
    const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    const distance = Math.abs(day - baseline) / MS_PER_DAY
    if (distance > UACR_BASELINE_WINDOW_DAYS) continue
    if (!best || distance < best.distance || (distance === best.distance && day < best.day)) best = { distance, day, values: [row.wertNum!] }
    else if (distance === best.distance && day === best.day) best.values.push(row.wertNum!)
  }
  if (!best) return null
  const sorted = [...best.values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return Math.log(median)
}

/** The series the covariate "log baseline UACR" reads: the one series with a
 * numeric value whose name, lower-cased and without spaces, hyphens,
 * underscores, dots and slashes, contains `uacr`, equals `acr`, or contains
 * `albumin` together with `kreatinin` or `creatinin`. Null when no series or
 * more than one (name, unit) pair matches. */
export function uacrSeries(rows: readonly LabRow[]): { name: string; unit: string | null } | null {
  const found = new Map<string, { name: string; unit: string | null }>()
  for (const row of rows) {
    if (row.wertNum === null || row.bezeichnung === null) continue
    const key = row.bezeichnung.toLowerCase().replace(/[\s\-_./]+/g, '')
    if (!(key.includes('uacr') || key === 'acr' || (key.includes('albumin') && (key.includes('kreatinin') || key.includes('creatinin'))))) continue
    found.set(JSON.stringify([row.bezeichnung, row.einheit ?? null]), { name: row.bezeichnung, unit: row.einheit ?? null })
  }
  return found.size === 1 ? [...found.values()][0] : null
}

/** Values from patients present in this scope only. `numeric` is the
 * automatic type, applied when the factor is added; the user can switch an
 * attribute's type afterwards (OD-22, 2026-11-22). */
export function availableMixedModelFactors(resolvedRows: readonly LabRow[], attributes: Attributes): AvailableMixedModelFactor[] {
  const patientIds = new Set(resolvedRows.map((row) => patientIdKey(row.patientId)))
  const keys = new Set(['baseline_age', 'sex'])
  for (const id of patientIds) for (const key of Object.keys(attributes[id] ?? {})) keys.add(key)
  const sexes = resolvedSexes(resolvedRows)
  const factors: AvailableMixedModelFactor[] = [...keys].sort((a, b) => a.localeCompare(b)).map((key) => {
    const values = key === 'baseline_age'
      ? resolvedRows.flatMap((row) => Number.isFinite(row.patientAgeAtLab) ? [String(row.patientAgeAtLab)] : [])
      : [...patientIds].map((id) => key === 'sex' ? patientSex(id, sexes, attributes) : attributeValue(attributes, id, key))
        .filter((value): value is string => value !== undefined && value !== null && value.trim() !== '')
    const builtIn = key === 'baseline_age' || key === 'sex'
    // "Not tested" values are offered as the level they enter the model with.
    const levels = [...new Set(values.map((value) => !builtIn && isNotTestedValue(value) ? NOT_TESTED_LEVEL : value.trim()))].sort()
    return {
      key,
      label: key === 'baseline_age' ? 'Baseline age' : key === 'sex' ? 'Sex' : key,
      levels,
      numeric: key === 'baseline_age' || (key !== 'sex' && levels.length > 0 && levels.every((value) => finiteNumeric(value) !== null)),
      typeSwitchable: !builtIn && levels.length > 0,
      anyNumericLevel: key === 'baseline_age' || (key !== 'sex' && levels.some((value) => finiteNumeric(value) !== null)),
    }
  })
  // Optional covariate, off until added (decision `uacr`, 2026-11-22).
  const uacr = uacrSeries(resolvedRows)
  if (uacr && !keys.has(LOG_BASELINE_UACR_KEY)) {
    factors.push({ key: LOG_BASELINE_UACR_KEY, label: mixedModelFactorLabel(LOG_BASELINE_UACR_KEY), levels: [], numeric: true, typeSwitchable: false, anyNumericLevel: true, series: uacr })
  }
  return factors
}

function finiteNumeric(value: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function resolvedSexes(rows: readonly LabRow[]): Map<string, Set<string>> {
  const sexes = new Map<string, Set<string>>()
  for (const row of rows) {
    const sex = normaliseSex(row.patientSex)
    if (!sex) continue
    const id = patientIdKey(row.patientId)
    const values = sexes.get(id) ?? new Set<string>()
    values.add(sex)
    sexes.set(id, values)
  }
  return sexes
}

function patientSex(id: string, sexes: Map<string, Set<string>>, attributes: Attributes): string | null {
  const values = sexes.get(id)
  if (values && values.size > 0) return values.size === 1 ? [...values][0] : null
  return normaliseSex(attributeValue(attributes, id, 'sex'))
}

function attributeValue(attributes: Attributes, id: string, key: string): string | undefined {
  const patient = Object.prototype.hasOwnProperty.call(attributes, id) ? attributes[id] : undefined
  return patient && Object.prototype.hasOwnProperty.call(patient, key) ? patient[key] : undefined
}
