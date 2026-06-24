import type { RawRow } from '../../io/readWorkbook'
import type { LabRow } from '../types'

export type ClinicalEventType = 'kidney_transplant' | 'dialysis' | 'other'
export type DialysisIntent = 'acute' | 'chronic' | 'unknown'
export type ClinicalEventWarning =
  | ''
  | 'unknown_patient'
  | 'unknown_dialysis_intent'
  | 'unresolved_dialysis_interval'
export type RejectedClinicalEventReason =
  | 'missing_required'
  | 'invalid_type'
  | 'invalid_intent'
  | 'invalid_date'
  | 'invalid_date_range'
  | 'unsupported_legacy_schema'

export interface RawClinicalEvent {
  patientId: number | null
  type: string
  date: Date | null
  title: string
  description: string | null
  endDate: Date | null
  intent: string
}

export interface ClinicalEvent {
  patientId: number
  type: ClinicalEventType
  date: Date
  title: string
  description: string | null
  endDate: Date | null
  intent: DialysisIntent | null
  warning: ClinicalEventWarning
}

export interface RejectedClinicalEvent {
  event: RawClinicalEvent
  reason: RejectedClinicalEventReason
}

export type ClinicalEventEffect =
  | 'display_only'
  | 'warning_no_exclusion'
  | 'exclude_interval'
  | 'censor_from_date'

export interface ClinicalEventEffectInfo {
  effect: ClinicalEventEffect
  label: string
}

export interface ClinicalEventValidationResult {
  valid: ClinicalEvent[]
  rejected: RejectedClinicalEvent[]
}

const requiredHeaders = ['patientId', 'type', 'date', 'title']
const legacyHeaders = ['PatientID', 'ReferenceDate', 'label']
const clinicalEventTypes = new Set<string>([
  'kidney_transplant',
  'dialysis',
  'other',
])
const dialysisIntents = new Set<string>(['acute', 'chronic', 'unknown'])

export function normalizeClinicalEvents(rows: RawRow[]): RawClinicalEvent[] {
  if (rows.length === 0) return []

  const headers = new Set(Object.keys(rows[0]))
  if (legacyHeaders.some((header) => headers.has(header))) {
    throw new Error('Legacy annotation schema is no longer supported. Use patientId,type,date,title.')
  }
  if (requiredHeaders.some((header) => !headers.has(header))) {
    throw new Error('Event file missing required column(s): patientId, type, date, title.')
  }

  return rows.map((row) => ({
    patientId: parsePatientId(row.patientId),
    type: parseText(row.type) ?? '',
    date: parseDate(row.date),
    title: parseText(row.title) ?? '',
    description: parseText(row.description),
    endDate: parseDate(row.endDate),
    intent: parseText(row.intent) ?? '',
  }))
}

export function validateClinicalEvents(
  events: RawClinicalEvent[],
  labRows: LabRow[],
): ClinicalEventValidationResult {
  const knownPatientIds = new Set(labRows.map((row) => row.patientId))
  const valid: ClinicalEvent[] = []
  const rejected: RejectedClinicalEvent[] = []

  for (const event of events) {
    const { patientId, date, endDate } = event
    if (
      patientId === null ||
      event.type === '' ||
      date === null ||
      event.title === ''
    ) {
      rejected.push({ event, reason: 'missing_required' })
      continue
    }
    if (!clinicalEventTypes.has(event.type)) {
      rejected.push({ event, reason: 'invalid_type' })
      continue
    }
    if (!isValidDate(date) || !isValidOptionalDate(endDate)) {
      rejected.push({ event, reason: 'invalid_date' })
      continue
    }

    const type = event.type as ClinicalEventType
    const intent = normalizeIntent(event.intent)
    if (type === 'dialysis') {
      if (!dialysisIntents.has(intent)) {
        rejected.push({ event, reason: 'invalid_intent' })
        continue
      }
    } else if (event.intent !== '') {
      rejected.push({ event, reason: 'invalid_intent' })
      continue
    }

    if (endDate !== null && endDate < date) {
      rejected.push({ event, reason: 'invalid_date_range' })
      continue
    }
    if (type === 'kidney_transplant' && endDate !== null) {
      rejected.push({ event, reason: 'invalid_date_range' })
      continue
    }

    valid.push({
      patientId,
      type,
      date,
      title: event.title,
      description: event.description,
      endDate,
      intent: type === 'dialysis' ? (intent as DialysisIntent) : null,
      warning: warningForEvent(
        patientId,
        knownPatientIds,
        type,
        intent,
        endDate,
      ),
    })
  }

  return { valid, rejected }
}

export function effectForEvent(event: ClinicalEvent): ClinicalEventEffectInfo {
  if (event.type === 'kidney_transplant') {
    return { effect: 'censor_from_date', label: 'censor from event date' }
  }
  if (event.type === 'other') {
    return { effect: 'display_only', label: 'display only' }
  }
  if (event.intent === 'chronic') {
    return { effect: 'censor_from_date', label: 'censor from dialysis start' }
  }
  if (event.endDate !== null) {
    return {
      effect: 'exclude_interval',
      label:
        event.intent === 'unknown'
          ? 'exclude dialysis interval, unknown intent'
          : 'exclude dialysis interval',
    }
  }
  return { effect: 'warning_no_exclusion', label: 'warning, not excluded from fit' }
}

export function eventTooltip(event: ClinicalEvent): string {
  const parts = [
    event.title,
    event.type,
    formatDate(event.date),
    event.intent !== null ? `intent: ${event.intent}` : null,
    event.endDate !== null ? `end: ${formatDate(event.endDate)}` : null,
    event.description,
    `effect: ${effectForEvent(event).label}`,
  ]

  return parts.filter((part): part is string => part !== null && part !== '').join(' · ')
}

function parsePatientId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value
  if (typeof value === 'string') return parseStringDate(value)
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return parsed
  }
  return null
}

function parseStringDate(value: string): Date {
  const text = value.trim()
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (isoDate) {
    return utcDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]))
  }

  const germanDate = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text)
  if (germanDate) {
    return utcDate(
      Number(germanDate[3]),
      Number(germanDate[2]),
      Number(germanDate[1]),
    )
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return parsed
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  )
}

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return new Date(Number.NaN)
  }
  return date
}

function isValidOptionalDate(value: Date | null): boolean {
  return value === null || isValidDate(value)
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime())
}

function normalizeIntent(intent: string): string {
  return intent === '' ? 'unknown' : intent
}

function warningForEvent(
  patientId: number,
  knownPatientIds: Set<number>,
  type: ClinicalEventType,
  intent: string,
  endDate: Date | null,
): ClinicalEventWarning {
  if (!knownPatientIds.has(patientId)) return 'unknown_patient'
  if (type === 'dialysis' && intent === 'unknown') return 'unknown_dialysis_intent'
  if (type === 'dialysis' && intent === 'acute' && endDate === null) {
    return 'unresolved_dialysis_interval'
  }
  return ''
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
