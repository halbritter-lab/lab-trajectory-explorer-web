import type { RawRow } from '../../io/readWorkbook'
import type { LabRow, PatientId } from '../types'

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
  patientId: PatientId | null
  type: string
  date: Date | null
  title: string
  description: string | null
  endDate: Date | null
  intent: string
  /** Readable explanation when the date or end date cell could not be read,
   * naming the offending value. */
  dateIssue?: string
}

export interface ClinicalEvent {
  patientId: PatientId
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

import {
  cell,
  checkRequiredColumns,
  collectHeaders,
  normaliseHeader,
  resolveColumns,
  EVENTS_COLUMN_ALIASES,
  REQUIRED_EVENTS_COLUMNS,
} from '../../io/headers'
import { countDateRead, describeDateProblem, noDateReads, parseImportDate, type DateReadCounts } from '../parse/dates'

const clinicalEventTypes = new Set<string>([
  'kidney_transplant',
  'dialysis',
  'other',
])
const dialysisIntents = new Set<string>(['acute', 'chronic', 'unknown'])

export function normalizeClinicalEvents(rows: RawRow[]): RawClinicalEvent[] {
  return normalizeClinicalEventsWithNotes(rows).events
}

/** `normalizeClinicalEvents` plus counts of dates that need a note on import:
 * DD/MM/YYYY dates read day-first and numbers read as Excel serial dates. */
export function normalizeClinicalEventsWithNotes(rows: RawRow[]): {
  events: RawClinicalEvent[]
  dateReads: DateReadCounts
} {
  const dateReads = noDateReads()
  if (rows.length === 0) return { events: [], dateReads }

  const headers = collectHeaders(rows)
  const columns = resolveColumns(headers, EVENTS_COLUMN_ALIASES)
  const normalizedHeaders = new Set([...headers].map(normaliseHeader))
  const hasStructuredTitle = EVENTS_COLUMN_ALIASES.title.some(
    (alias) => normaliseHeader(alias) !== 'label' && normalizedHeaders.has(normaliseHeader(alias)),
  )
  if (
    normalizedHeaders.has('referencedate') ||
    (normalizedHeaders.has('label') && columns.type === undefined && !hasStructuredTitle)
  ) {
    throw new Error('Legacy annotation schema is no longer supported. Use patientId,type,date,title.')
  }
  checkRequiredColumns(columns, REQUIRED_EVENTS_COLUMNS, 'Event file', headers)

  const events = rows.map((row) => {
    let dateIssue: string | undefined
    const parseDate = (label: string, value: unknown): Date | null => {
      const parsed = parseImportDate(value)
      if (parsed.kind === 'empty') return null
      // An invalid date stays an Invalid Date, so validation rejects the row
      // as invalid_date rather than as missing_required.
      if (parsed.kind === 'invalid') {
        dateIssue ??= describeDateProblem(label, value, parsed.problem)
        return new Date(Number.NaN)
      }
      countDateRead(dateReads, parsed)
      return parsed.date
    }
    const event: RawClinicalEvent = {
      patientId: parsePatientId(cell(row, columns, 'patientId')),
      type: parseText(cell(row, columns, 'type')) ?? '',
      date: parseDate('Event date', cell(row, columns, 'date')),
      title: parseText(cell(row, columns, 'title')) ?? '',
      description: parseText(cell(row, columns, 'description')),
      endDate: parseDate('End date', cell(row, columns, 'endDate')),
      intent: parseText(cell(row, columns, 'intent')) ?? '',
    }
    if (dateIssue !== undefined) event.dateIssue = dateIssue
    return event
  })
  return { events, dateReads }
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
  patientId: PatientId,
  knownPatientIds: Set<PatientId>,
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

/** Readable reason for a rejected event row, naming the offending value. */
export function describeEventRejection({ event, reason }: RejectedClinicalEvent): string {
  switch (reason) {
    case 'missing_required': {
      const missing = [
        event.patientId === null ? 'patientId' : null,
        event.type === '' ? 'type' : null,
        event.date === null ? 'date' : null,
        event.title === '' ? 'title' : null,
      ].filter(Boolean)
      return `Required ${missing.length === 1 ? 'value' : 'values'} missing (${missing.join(', ')}); row not imported.`
    }
    case 'invalid_type':
      return `Event type "${event.type}" is not one of ${[...clinicalEventTypes].join(', ')}; row not imported.`
    case 'invalid_intent':
      return event.type === 'dialysis'
        ? `Dialysis intent "${event.intent}" is not one of ${[...dialysisIntents].join(', ')}; row not imported.`
        : `Intent "${event.intent}" is only allowed for dialysis events; row not imported.`
    case 'invalid_date':
      return `${event.dateIssue ?? 'Event date is not a valid date'}; row not imported.`
    case 'invalid_date_range':
      return event.type === 'kidney_transplant'
        ? `A kidney transplant cannot have an end date (${formatDate(event.endDate!)}); row not imported.`
        : `End date ${formatDate(event.endDate!)} is before the event date ${formatDate(event.date!)}; row not imported.`
    case 'unsupported_legacy_schema':
      return 'Legacy annotation schema is no longer supported; use patientId, type, date, title.'
  }
}

/** Readable text for an accepted event's warning; empty when there is none. */
export function describeEventWarning(event: ClinicalEvent): string {
  switch (event.warning) {
    case '':
      return ''
    case 'unknown_patient':
      return `Patient ${event.patientId} has no lab values in this dataset; the event is kept.`
    case 'unknown_dialysis_intent':
      return 'Dialysis intent is missing or "unknown"; the event is kept with unknown intent.'
    case 'unresolved_dialysis_interval':
      return 'Acute dialysis without an end date; no interval is excluded from fits.'
  }
}
