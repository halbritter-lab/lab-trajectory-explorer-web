import { readWorkbook, readWorkbookSheets } from '../../io/readWorkbook'
import { loadLabRowsWithDiagnostics } from '../../core/parse/loader'
import type { LabRow, PatientId } from '../../core/types'
import {
  describeEventRejection,
  describeEventWarning,
  normalizeClinicalEvents,
  normalizeClinicalEventsWithNotes,
  validateClinicalEvents,
  type ClinicalEvent,
  type ClinicalEventValidationResult,
  type RejectedClinicalEvent,
} from '../../core/events/events'
import {
  attributeBirthDateFindings,
  describeAttributeRejection,
  describeAttributeWarning,
  normalizePatientAttributes,
  validatePatientAttributes,
  type PatientAttributesResult,
} from '../../core/attributes/attributes'
import { dateReadNotes, type DateReadCounts } from '../../core/parse/dates'
import { normaliseHeader } from '../../io/headers'

export interface ImportDiagnostic {
  sheet: string
  patientId: PatientId | null
  severity: 'rejected' | 'warning'
  reason: string
  /** 'sheet' marks a summary over many rows rather than one patient's row. */
  scope?: 'sheet'
}

const sheetNote = (sheet: string, reason: string): ImportDiagnostic => ({ sheet, patientId: null, severity: 'warning', scope: 'sheet', reason })

/** Diagnostics for an events table: rejected rows, warnings on accepted rows
 * and notes on how dates were read. Shared by workbook and separate uploads. */
export function eventDiagnostics(
  sheet: string,
  dateReads: DateReadCounts,
  { valid, rejected }: ClinicalEventValidationResult,
): ImportDiagnostic[] {
  return [
    ...rejected.map((r): ImportDiagnostic => ({ sheet, patientId: r.event.patientId, severity: 'rejected', reason: describeEventRejection(r) })),
    ...valid.filter((e) => e.warning).map((e): ImportDiagnostic => ({ sheet, patientId: e.patientId, severity: 'warning', reason: describeEventWarning(e) })),
    ...dateReadNotes('event date', dateReads).map((reason) => sheetNote(sheet, reason)),
  ]
}

/** Diagnostics for an attributes table, including unreadable birth dates. */
export function attributeDiagnostics(sheet: string, { valid, rejected }: PatientAttributesResult): ImportDiagnostic[] {
  const birth = attributeBirthDateFindings(valid)
  return [
    ...rejected.map((r): ImportDiagnostic => ({ sheet, patientId: r.row.patientId, severity: 'rejected', reason: describeAttributeRejection(r) })),
    ...valid.filter((r) => r.warning).map((r): ImportDiagnostic => ({ sheet, patientId: r.patientId, severity: 'warning', reason: describeAttributeWarning(r) })),
    ...birth.warnings.map((w): ImportDiagnostic => ({ sheet, patientId: w.patientId, severity: 'warning', reason: w.reason })),
    ...dateReadNotes('birth date', birth.dateReads).map((reason) => sheetNote(sheet, reason)),
  ]
}

export interface LoadedDataset {
  rows: LabRow[]
  events: ClinicalEvent[]
  patientAttributes: Record<string, Record<string, string>>
  sheetNames: string[]
  diagnostics: ImportDiagnostic[]
  /** Event rows that failed validation, kept so they can be listed beside the
   * accepted events instead of only counted. */
  rejectedEvents: RejectedClinicalEvent[]
}

const LABS_SHEET_NAMES = new Set(['labs', 'labor', 'labrows', 'labdata'])
const EVENTS_SHEET_NAMES = new Set(['events', 'ereignisse', 'clinicalevents', 'annotations'])
const ATTRIBUTES_SHEET_NAMES = new Set(['attributes', 'attribute', 'patientattributes'])

/**
 * Load a dataset from a workbook ArrayBuffer. If the workbook contains multiple
 * sheets (e.g. labs, events, attributes), all three are parsed and validated in
 * one pass.
 */
export function loadDatasetFromWorkbook(data: ArrayBuffer): LoadedDataset {
  try {
    const wb = readWorkbookSheets(data)
    if (wb.sheetNames.length === 0) {
      return { rows: [], events: [], patientAttributes: {}, sheetNames: [], diagnostics: [], rejectedEvents: [] }
    }
    if (wb.sheetNames.length === 1) {
      const labs = loadLabRowsWithDiagnostics(wb.getSheet(0))
      const sheet = wb.sheetNames[0]
      return { rows: labs.rows, events: [], patientAttributes: {}, sheetNames: wb.sheetNames, diagnostics: labs.issues.map((issue) => ({ sheet, ...issue })), rejectedEvents: [] }
    }

    const eventsSheetName = wb.sheetNames.find((s) => EVENTS_SHEET_NAMES.has(normaliseHeader(s)))
    const attributesSheetName = wb.sheetNames.find((s) => ATTRIBUTES_SHEET_NAMES.has(normaliseHeader(s)))

    // Find the labs sheet: explicit match, or first sheet not reserved for events/attributes
    let labsSheetName = wb.sheetNames.find((s) => LABS_SHEET_NAMES.has(normaliseHeader(s)))
    if (!labsSheetName) {
      labsSheetName = wb.sheetNames.find((s) => s !== eventsSheetName && s !== attributesSheetName) ?? wb.sheetNames[0]
    }

    const labs = loadLabRowsWithDiagnostics(wb.getSheet(labsSheetName))
    const rows = labs.rows
    const diagnostics: ImportDiagnostic[] = labs.issues.map((issue) => ({ sheet: labsSheetName, ...issue }))

    let events: ClinicalEvent[] = []
    let rejectedEvents: RejectedClinicalEvent[] = []
    if (eventsSheetName && eventsSheetName !== labsSheetName) {
      const rawEvents = wb.getSheet(eventsSheetName)
      if (rawEvents.length > 0) {
        const normalized = normalizeClinicalEventsWithNotes(rawEvents)
        const validation = validateClinicalEvents(normalized.events, rows)
        events = validation.valid
        rejectedEvents = validation.rejected
        diagnostics.push(...eventDiagnostics(eventsSheetName, normalized.dateReads, validation))
      }
    }

    let patientAttributes: Record<string, Record<string, string>> = {}
    if (attributesSheetName && attributesSheetName !== labsSheetName) {
      const rawAttributes = wb.getSheet(attributesSheetName)
      if (rawAttributes.length > 0) {
        const validation = validatePatientAttributes(normalizePatientAttributes(rawAttributes), rows)
        patientAttributes = validation.byPatient
        diagnostics.push(...attributeDiagnostics(attributesSheetName, validation))
      }
    }

    return {
      rows,
      events,
      patientAttributes,
      sheetNames: wb.sheetNames,
      diagnostics,
      rejectedEvents,
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`Could not read this file. ${detail}`)
  }
}

/** Parse an uploaded/fetched workbook ArrayBuffer into typed LabRows. Wraps the
 * raw SheetJS/loader errors in a user-facing message. */
export function datasetFromArrayBuffer(data: ArrayBuffer): LabRow[] {
  return loadDatasetFromWorkbook(data).rows
}

/** Fetch the bundled demo fixture shipped in public/. */
export async function loadBundledFixture(baseUrl = import.meta.env.BASE_URL): Promise<LabRow[]> {
  const res = await fetch(`${baseUrl}test_labs.xlsx`)
  if (!res.ok) throw new Error(`Could not load the demo dataset (HTTP ${res.status}).`)
  const buf = await res.arrayBuffer()
  return datasetFromArrayBuffer(buf)
}

export interface BundledFixtureData {
  rows: LabRow[]
  events: ClinicalEvent[]
  patientAttributes: Record<string, Record<string, string>>
}

/** Fetch the bundled demo labs plus demo event markers shipped in public/. */
export async function loadBundledFixtureData(baseUrl = import.meta.env.BASE_URL): Promise<BundledFixtureData> {
  const res = await fetch(`${baseUrl}test_labs.xlsx`)
  if (!res.ok) throw new Error(`Could not load the demo dataset (HTTP ${res.status}).`)
  const buf = await res.arrayBuffer()
  const dataset = loadDatasetFromWorkbook(buf)

  if (dataset.events.length > 0 || Object.keys(dataset.patientAttributes).length > 0) {
    return {
      rows: dataset.rows,
      events: dataset.events,
      patientAttributes: dataset.patientAttributes,
    }
  }

  // Fallback for when test_labs.xlsx is a single-sheet workbook:
  const eventsRes = await fetch(`${baseUrl}test_events.csv`)
  const patientAttributes = await loadBundledPatientAttributes(dataset.rows, baseUrl)
  if (!eventsRes.ok) return { rows: dataset.rows, events: [], patientAttributes }
  const normalized = normalizeClinicalEvents(readWorkbook(await eventsRes.arrayBuffer()))
  const { valid, rejected: rejects } = validateClinicalEvents(normalized, dataset.rows)
  if (rejects.length > 0) {
    throw new Error(`Bundled event fixture contains ${rejects.length} invalid row(s).`)
  }
  return { rows: dataset.rows, events: valid, patientAttributes }
}

async function loadBundledPatientAttributes(
  rows: LabRow[],
  baseUrl = import.meta.env.BASE_URL,
): Promise<Record<string, Record<string, string>>> {
  const res = await fetch(`${baseUrl}test_attributes.csv`)
  if (!res.ok) return {}
  const normalized = normalizePatientAttributes(readWorkbook(await res.arrayBuffer()))
  const { byPatient, rejected } = validatePatientAttributes(normalized, rows)
  if (rejected.length > 0) {
    throw new Error(`Bundled attribute fixture contains ${rejected.length} invalid row(s).`)
  }
  return byPatient
}
