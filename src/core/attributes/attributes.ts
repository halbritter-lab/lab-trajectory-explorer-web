import type { RawRow } from '../../io/readWorkbook'
import { patientIdKey, type LabRow, type PatientId } from '../types'

export interface RawPatientAttributes {
  patientId: PatientId | null
  attributes: Record<string, string>
}

export type PatientAttributeWarning = '' | 'unknown_patient'
export type RejectedPatientAttributeReason = 'missing_patient_id' | 'duplicate_patient'

export interface PatientAttributeRecord {
  patientId: PatientId
  attributes: Record<string, string>
  warning: PatientAttributeWarning
}

export interface RejectedPatientAttributeRow {
  row: RawPatientAttributes
  reason: RejectedPatientAttributeReason
}

export interface PatientAttributesResult {
  /** Accepted rows, in input order, each flagged with any warning. */
  valid: PatientAttributeRecord[]
  /** Attribute maps keyed by patientIdKey, for lookup by loaded patients. */
  byPatient: Record<string, Record<string, string>>
  /** Rows dropped row-by-row, with the reason. */
  rejected: RejectedPatientAttributeRow[]
  /** Sorted union of attribute column names that carried a value. */
  attributeNames: string[]
}

import {
  collectHeaders,
  normaliseHeader,
  resolveColumns,
  ATTRIBUTES_DEMOGRAPHICS_ALIASES,
} from '../../io/headers'

/** Parse raw workbook rows into per-row patient id + attribute map. Attribute
 * columns are every column other than `patientId`; empty cells are omitted. */
export function normalizePatientAttributes(rows: RawRow[]): RawPatientAttributes[] {
  if (rows.length === 0) return []

  const headers = collectHeaders(rows)
  const resolved = resolveColumns(headers, { patientId: ['patientId', 'PatientID'] })
  if (resolved.patientId === undefined) {
    throw new Error('Patient attributes file missing required column: patientId.')
  }
  const patientIdHeader = resolved.patientId

  const sexAliases = new Set(['sex', 'patientsex', 'geschlecht'])
  const birthAliases = new Set(['birthdate', 'patientgeburtsdatum', 'geburtsdatum'])

  let seenSexHeader: string | null = null
  let seenBirthHeader: string | null = null

  for (const h of headers) {
    if (h === patientIdHeader) continue
    const norm = normaliseHeader(h)
    if (sexAliases.has(norm)) {
      if (seenSexHeader !== null && seenSexHeader !== h) {
        throw new Error(
          `Ambiguous columns: "${seenSexHeader}" and "${h}" are read as the same column. Rename one of them.`,
        )
      }
      seenSexHeader = h
    } else if (birthAliases.has(norm)) {
      if (seenBirthHeader !== null && seenBirthHeader !== h) {
        throw new Error(
          `Ambiguous columns: "${seenBirthHeader}" and "${h}" are read as the same column. Rename one of them.`,
        )
      }
      seenBirthHeader = h
    }
  }

  const attributeHeaders = new Map<string, string>()
  for (const h of headers) {
    if (h === patientIdHeader) continue
    if (h === seenSexHeader) {
      attributeHeaders.set(h, 'sex')
    } else if (h === seenBirthHeader) {
      attributeHeaders.set(h, 'birthDate')
    } else {
      attributeHeaders.set(h, h.trim())
    }
  }

  if (attributeHeaders.size === 0) {
    throw new Error('Patient attributes file has no attribute columns.')
  }

  return rows.map((row) => {
    const attributes: Record<string, string> = {}
    for (const [rawHeader, canonicalKey] of attributeHeaders) {
      const text = parseText(row[rawHeader])
      if (text !== null) attributes[canonicalKey] = text
    }
    return { patientId: parsePatientId(row[patientIdHeader]), attributes }
  })
}

/** Validate parsed rows against the loaded patients: drop rows with no patient
 * id or a duplicate id (first row wins), flag ids absent from the lab rows, and
 * build a lookup map keyed by patientIdKey. */
export function validatePatientAttributes(
  records: RawPatientAttributes[],
  labRows: LabRow[],
): PatientAttributesResult {
  const knownPatientIds = new Set(labRows.map((row) => row.patientId))
  const valid: PatientAttributeRecord[] = []
  const rejected: RejectedPatientAttributeRow[] = []
  const byPatient: Record<string, Record<string, string>> = {}
  const seen = new Set<string>()
  const attributeNames = new Set<string>()

  for (const record of records) {
    if (record.patientId === null) {
      rejected.push({ row: record, reason: 'missing_patient_id' })
      continue
    }
    const key = patientIdKey(record.patientId)
    if (seen.has(key)) {
      rejected.push({ row: record, reason: 'duplicate_patient' })
      continue
    }
    seen.add(key)

    const warning: PatientAttributeWarning = knownPatientIds.has(record.patientId)
      ? ''
      : 'unknown_patient'
    valid.push({ patientId: record.patientId, attributes: record.attributes, warning })
    byPatient[key] = record.attributes
    for (const name of Object.keys(record.attributes)) attributeNames.add(name)
  }

  return { valid, byPatient, rejected, attributeNames: [...attributeNames].sort() }
}

/** Flatten the byPatient map into export rows: one row per patient, `patientId`
 * first, then every attribute column (sorted union) with empty cells filled, so
 * all rows share the same columns. Patients are ordered by numeric-aware id. */
export function patientAttributesExportRows(
  byPatient: Record<string, Record<string, string>>,
): Array<Record<string, string>> {
  const names = new Set<string>()
  for (const attributes of Object.values(byPatient)) {
    for (const name of Object.keys(attributes)) names.add(name)
  }
  const sortedNames = [...names].sort()
  const keys = Object.keys(byPatient).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  )
  return keys.map((key) => {
    const row: Record<string, string> = { patientId: key }
    for (const name of sortedNames) row[name] = byPatient[key][name] ?? ''
    return row
  })
}

function parsePatientId(value: unknown): PatientId | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const text = value.trim()
    const numeric = Number(text)
    return Number.isFinite(numeric) && String(numeric) === text ? numeric : text
  }
  return null
}

function parseText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}
