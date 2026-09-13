import { normaliseSex } from '../egfr/formulas'
import { patientIdKey, type LabRow } from '../types'
import { mixedModelFactorColumn, mixedModelFactors, type MixedModelConfig } from './config'
import type { MixedModelPreparationSummary, MixedModelSpikeRow } from './types'
import { roundTo10Decimals } from './validation'

type Attributes = Record<string, Record<string, string>>

export interface AvailableMixedModelFactor {
  key: string
  label: string
  levels: string[]
  numeric: boolean
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
  const complete = new Map<string, Record<string, number | string>>()
  for (const [patientId, patientRows] of byPatient) {
    const values: Record<string, number | string> = {}
    const reasons: string[] = []
    factors.forEach((factor, index) => {
      const raw = factor.key === 'baseline_age'
        ? patientRows[0].baseline_age
        : factor.key === 'sex'
          ? patientSex(patientId, sexes, attributes)
          : attributeValue(attributes, patientId, factor.key)
      const text = raw === undefined || raw === null ? '' : String(raw).trim()
      const value = factor.kind === 'numeric' ? finiteNumeric(text) : text || null
      if (value === null) {
        reasons.push(`${text ? 'Invalid numeric' : 'Missing'} ${factor.key}`)
      } else {
        values[mixedModelFactorColumn(factor, index)] = value
      }
    })
    if (reasons.length > 0) preparation.excludedPatients.push({ patientId, reasons })
    else complete.set(patientId, values)
  }
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
      ...(typeof factorValues.baseline_age_centered === 'number'
        ? { baseline_age_centered: factorValues.baseline_age_centered }
        : {}),
    }
  })
  return { rows: selected, preparation }
}

/** Values from patients present in this scope only. Type suggestions are not
 * automatic conversions; the model dialog explicitly selects factor kinds. */
export function availableMixedModelFactors(resolvedRows: readonly LabRow[], attributes: Attributes): AvailableMixedModelFactor[] {
  const patientIds = new Set(resolvedRows.map((row) => patientIdKey(row.patientId)))
  const keys = new Set(['baseline_age', 'sex'])
  for (const id of patientIds) for (const key of Object.keys(attributes[id] ?? {})) keys.add(key)
  const sexes = resolvedSexes(resolvedRows)
  return [...keys].sort((a, b) => a.localeCompare(b)).map((key) => {
    const values = key === 'baseline_age'
      ? resolvedRows.flatMap((row) => Number.isFinite(row.patientAgeAtLab) ? [String(row.patientAgeAtLab)] : [])
      : [...patientIds].map((id) => key === 'sex' ? patientSex(id, sexes, attributes) : attributeValue(attributes, id, key))
        .filter((value): value is string => value !== undefined && value !== null && value.trim() !== '')
    const levels = [...new Set(values.map((value) => value.trim()))].sort()
    return {
      key,
      label: key === 'baseline_age' ? 'Baseline age' : key === 'sex' ? 'Sex' : key,
      levels,
      numeric: key === 'baseline_age' || (key !== 'sex' && levels.length > 0 && levels.every((value) => finiteNumeric(value) !== null)),
    }
  })
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
