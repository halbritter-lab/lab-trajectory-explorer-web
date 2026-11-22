import { sourceRowNumber, type RawRow } from '../types'
import type { LabRow, PatientId } from '../types'

export type ClinicalEventType = 'kidney_transplant' | 'dialysis' | 'other' | 'death'
export type DialysisIntent = 'acute' | 'chronic' | 'unknown'
export type ClinicalEventWarning =
  | ''
  | 'unknown_patient'
  | 'unknown_dialysis_intent'
  | 'unresolved_dialysis_interval'
  | 'values_after_death'
  | 'repeated_death'
export const CLINICAL_EVENT_TYPES = ['kidney_transplant', 'dialysis', 'other', 'death'] as const satisfies readonly ClinicalEventType[]
export const DIALYSIS_INTENTS = ['acute', 'chronic', 'unknown'] as const satisfies readonly DialysisIntent[]
export const CLINICAL_EVENT_WARNINGS = ['', 'unknown_patient', 'unknown_dialysis_intent', 'unresolved_dialysis_interval', 'values_after_death', 'repeated_death'] as const satisfies readonly ClinicalEventWarning[]
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
  /** Row of the source file (header row = 1), when read from a file. */
  sourceRow?: number
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
  /** Source row (header row = 1) of each accepted event read from a file.
   * Kept beside the events, so stored and exported events stay as they are. */
  sourceRows: Map<ClinicalEvent, number>
}

import {
  cell,
  checkRequiredColumns,
  collectHeaders,
  normaliseHeader,
  resolveColumns,
  shadowedColumnNotes,
  EVENTS_COLUMN_ALIASES,
  REQUIRED_EVENTS_COLUMNS,
} from '../parse/headers'
import { countDateRead, describeDateProblem, noDateReads, parseImportDate, type DateReadCounts } from '../parse/dates'

const clinicalEventTypes = new Set<string>(CLINICAL_EVENT_TYPES)
/** The type `death` also accepts these words, matched like the type tokens
 * (trimmed, any case); every other type has no synonym (decided 2026-11-22,
 * issue #78: a conservative list of the English and German words). */
export const DEATH_TYPE_SYNONYMS = ['death', 'deceased', 'tod', 'verstorben'] as const
const deathTypeSynonyms = new Set<string>(DEATH_TYPE_SYNONYMS)

/** The stored type token of an imported type cell, or null when it is none. */
function normalizeEventType(type: string): ClinicalEventType | null {
  const lower = type.trim().toLowerCase()
  if (deathTypeSynonyms.has(lower)) return 'death'
  return clinicalEventTypes.has(lower) ? lower as ClinicalEventType : null
}
const dialysisIntents = new Set<string>(DIALYSIS_INTENTS)

export function normalizeClinicalEvents(rows: RawRow[]): RawClinicalEvent[] {
  return normalizeClinicalEventsWithNotes(rows).events
}

/** `normalizeClinicalEvents` plus counts of dates that need a note on import:
 * DD/MM/YYYY dates read day-first and numbers read as Excel serial dates. */
export function normalizeClinicalEventsWithNotes(rows: RawRow[]): {
  events: RawClinicalEvent[]
  dateReads: DateReadCounts
  /** Table-level notes, such as two columns holding the same field. */
  notes: string[]
} {
  const dateReads = noDateReads()
  if (rows.length === 0) return { events: [], dateReads, notes: [] }

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
    const sourceRow = sourceRowNumber(row)
    if (sourceRow !== undefined) event.sourceRow = sourceRow
    return event
  })
  return { events, dateReads, notes: shadowedColumnNotes(headers, EVENTS_COLUMN_ALIASES) }
}

export function validateClinicalEvents(
  events: RawClinicalEvent[],
  labRows: LabRow[],
): ClinicalEventValidationResult {
  const knownPatientIds = new Set(labRows.map((row) => row.patientId))
  // The latest lab date per patient, for the warning on values after a death.
  const lastLabDay = new Map<PatientId, number>()
  for (const row of labRows) {
    if (!(row.labDatum instanceof Date) || !Number.isFinite(row.labDatum.getTime())) continue
    const day = utcDay(row.labDatum)
    if (day > (lastLabDay.get(row.patientId) ?? Number.NEGATIVE_INFINITY)) lastLabDay.set(row.patientId, day)
  }
  const valid: ClinicalEvent[] = []
  const rejected: RejectedClinicalEvent[] = []
  const sourceRows = new Map<ClinicalEvent, number>()

  for (const event of events) {
    const { patientId, date, endDate } = event
    const normalizedType = normalizeEventType(event.type)
    if (
      patientId === null ||
      event.type === '' ||
      date === null ||
      event.title === ''
    ) {
      rejected.push({ event, reason: 'missing_required' })
      continue
    }
    if (normalizedType === null) {
      rejected.push({ event, reason: 'invalid_type' })
      continue
    }
    if (!isValidDate(date) || !isValidOptionalDate(endDate)) {
      rejected.push({ event, reason: 'invalid_date' })
      continue
    }

    const type = normalizedType
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
    if ((type === 'kidney_transplant' || type === 'death') && endDate !== null) {
      rejected.push({ event, reason: 'invalid_date_range' })
      continue
    }

    const accepted: ClinicalEvent = {
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
        type === 'death' && (lastLabDay.get(patientId) ?? Number.NEGATIVE_INFINITY) > utcDay(date),
      ),
    }
    valid.push(accepted)
    if (event.sourceRow !== undefined) sourceRows.set(accepted, event.sourceRow)
  }

  // A second death of one patient keeps the event and says that only the
  // earliest is used (the first warning, unknown_patient, still wins).
  const deaths = valid.filter(event => event.type === 'death').sort((a, b) => a.date.getTime() - b.date.getTime())
  const seenDeath = new Set<PatientId>()
  for (const event of deaths) {
    if (seenDeath.has(event.patientId) && event.warning === '') event.warning = 'repeated_death'
    seenDeath.add(event.patientId)
  }

  return { valid, rejected, sourceRows }
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
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

/** Intent tokens are matched without regard to case, like event types. */
function normalizeIntent(intent: string): string {
  return intent === '' ? 'unknown' : intent.toLowerCase()
}

function warningForEvent(
  patientId: PatientId,
  knownPatientIds: Set<PatientId>,
  type: ClinicalEventType,
  intent: string,
  endDate: Date | null,
  valuesAfterDeath = false,
): ClinicalEventWarning {
  if (!knownPatientIds.has(patientId)) return 'unknown_patient'
  if (valuesAfterDeath) return 'values_after_death'
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
      return `Event type "${event.type}" is not one of ${[...clinicalEventTypes].join(', ')} (death also as ${DEATH_TYPE_SYNONYMS.filter(word => word !== 'death').join(', ')}); row not imported.`
    case 'invalid_intent':
      return event.type.toLowerCase() === 'dialysis'
        ? `Dialysis intent "${event.intent}" is not one of ${[...dialysisIntents].join(', ')}; row not imported.`
        : `Intent "${event.intent}" is only allowed for dialysis events; row not imported.`
    case 'invalid_date':
      return `${event.dateIssue ?? 'Event date is not a valid date'}; row not imported.`
    case 'invalid_date_range':
      return normalizeEventType(event.type) === 'kidney_transplant'
        ? `A kidney transplant cannot have an end date (${formatDate(event.endDate!)}); row not imported.`
        : normalizeEventType(event.type) === 'death'
        ? `A death cannot have an end date (${formatDate(event.endDate!)}); row not imported.`
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
    case 'values_after_death':
      return `Patient ${event.patientId} has lab values dated after this death (${formatDate(event.date)}), which suggests a data error; they are shown, but endpoints and the time-to-event analysis leave them out.`
    case 'repeated_death':
      return `Patient ${event.patientId} has an earlier death event; only the earliest is used.`
  }
}
