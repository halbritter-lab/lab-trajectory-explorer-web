import type { RawRow } from '../../io/readWorkbook'
import type { LabRow } from '../types'

export interface Annotation {
  patientId: number | null
  referenceDate: Date | null
  label: string
}
export interface ValidAnnotation extends Annotation {
  warning: '' | 'unknown_patient'
}
export interface RejectedAnnotation extends Annotation {
  reason: 'missing_required' | 'invalid_date'
}

const ID_KEYWORDS = ['id', 'patient', 'pat', 'pid', 'tb_id']
const DATE_KEYWORDS = ['date', 'datum', 'sample', 'reference', 'ref', 'dob', 'zeit']

function score(name: string, keywords: string[]): number {
  const lower = name.toLowerCase()
  return keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0)
}

function inferColumns(headers: string[], rows: RawRow[]): [string, string] | null {
  if (headers.includes('PatientID') && headers.includes('ReferenceDate')) return ['PatientID', 'ReferenceDate']
  let idCands = headers.filter((h) => score(h, ID_KEYWORDS) > 0).map((h) => [h, score(h, ID_KEYWORDS)] as [string, number])
  let dateCands = headers.filter((h) => score(h, DATE_KEYWORDS) > 0).map((h) => [h, score(h, DATE_KEYWORDS)] as [string, number])
  const sample = rows.slice(0, 10)
  for (const [h] of [...idCands]) {
    const vals = sample.map((r) => r[h]).filter((v) => v != null)
    if (vals.length > 0 && vals.every((v) => typeof v === 'number')) { idCands = [[h, 10]]; break }
  }
  for (const [h] of [...dateCands]) {
    const vals = sample.map((r) => r[h]).filter((v) => v != null)
    if (vals.length > 0 && vals.every((v) => v instanceof Date)) { dateCands = [[h, 10]]; break }
  }
  if (idCands.length === 0 || dateCands.length === 0) return null
  const idCol = idCands.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  const dateCol = dateCands.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  if (idCol === dateCol) return null
  return [idCol, dateCol]
}

function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return v
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Normalise raw annotation rows to the canonical schema with alias inference.
 * Throws when required columns cannot be resolved. Mirrors
 * analyses/annotations.py:_normalize_annotation_frame. */
export function normalizeAnnotations(rawRows: RawRow[]): Annotation[] {
  if (rawRows.length === 0) return []
  const headers = Object.keys(rawRows[0])
  const inferred = inferColumns(headers, rawRows)
  if (inferred === null) {
    throw new Error('Annotation file missing required column(s): PatientID, ReferenceDate (or recognisable aliases).')
  }
  const [idCol, dateCol] = inferred
  return rawRows.map((r) => {
    const idRaw = r[idCol]
    const patientId = idRaw == null || idRaw === '' ? null : Number(idRaw)
    return {
      patientId: patientId !== null && Number.isNaN(patientId) ? null : patientId,
      referenceDate: toDate(r[dateCol]),
      label: r.label == null ? '' : String(r.label),
    }
  })
}

/** Partition into valid (with possible unknown_patient warning) and rejects.
 * Mirrors analyses/annotations.py:validate_annotations. */
export function validateAnnotations(
  anns: Annotation[],
  labRows: LabRow[],
): { valid: ValidAnnotation[]; rejects: RejectedAnnotation[] } {
  const known = new Set(labRows.map((r) => r.patientId))
  const valid: ValidAnnotation[] = []
  const rejects: RejectedAnnotation[] = []
  for (const a of anns) {
    if (a.patientId === null) { rejects.push({ ...a, reason: 'missing_required' }); continue }
    if (a.referenceDate === null) { rejects.push({ ...a, reason: 'invalid_date' }); continue }
    valid.push({ ...a, warning: known.has(a.patientId) ? '' : 'unknown_patient' })
  }
  return { valid, rejects }
}
