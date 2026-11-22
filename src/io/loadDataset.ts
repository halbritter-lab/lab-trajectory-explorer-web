import { readWorkbook, readWorkbookSheets } from './readWorkbook'
import { loadLabRowsWithDiagnostics, type ImportDiagnosticRow, type LabImportIssue, type LabImportOptions } from '../core/parse/loader'
import type { LabRow, PatientId } from '../core/types'
import {
  describeEventRejection,
  describeEventWarning,
  normalizeClinicalEvents,
  normalizeClinicalEventsWithNotes,
  validateClinicalEvents,
  type ClinicalEvent,
  type ClinicalEventValidationResult,
  type RejectedClinicalEvent,
} from '../core/events/events'
import {
  attributeBirthDateFindings,
  describeAttributeRejection,
  describeAttributeWarning,
  hasPatientAttributeColumns,
  normalizePatientAttributes,
  validatePatientAttributes,
  type PatientAttributesResult,
} from '../core/attributes/attributes'
import { dateReadNotes, type DateReadCounts } from '../core/parse/dates'
import { normaliseHeader } from '../core/parse/headers'
import { nonSerumCreatinineSeries } from '../core/domains/nephrology/analytes'

/** The table an import finding belongs to. Each table keeps its own findings
 * until that table is imported again. */
export type ImportSource = 'labs' | 'events' | 'attributes'
export const IMPORT_SOURCES = ['labs', 'events', 'attributes'] as const satisfies readonly ImportSource[]

export interface ImportDiagnostic {
  source: ImportSource
  /** Sheet name, or the file name for a file without named sheets. */
  sheet: string
  patientId: PatientId | null
  severity: 'rejected' | 'warning'
  reason: string
  /** 'sheet' marks a summary over many rows rather than one patient's row. */
  scope?: 'sheet'
  /** Source row of a finding about a single row (header row = 1). */
  row?: number
  /** The rows a collective finding counts (see `LabImportIssue.rows`). */
  rows?: ImportDiagnosticRow[]
  /** Total number of affected rows, set only when `rows` was cut off. */
  affected?: number
}

const at = (row: number | undefined) => (row === undefined ? {} : { row })
const sheetNote = (source: ImportSource, sheet: string, reason: string): ImportDiagnostic => ({ source, sheet, patientId: null, severity: 'warning', scope: 'sheet', reason })

/** Lab-sheet findings as diagnostics of the `labs` source. */
export function labDiagnostics(sheet: string, issues: readonly LabImportIssue[]): ImportDiagnostic[] {
  return issues.map((issue) => ({ source: 'labs', sheet, ...issue }))
}

/** Diagnostics for an events table: rejected rows, warnings on accepted rows
 * and notes on how dates were read. Shared by workbook and separate uploads. */
export function eventDiagnostics(
  sheet: string,
  dateReads: DateReadCounts,
  { valid, rejected, sourceRows }: ClinicalEventValidationResult,
  notes: readonly string[] = [],
): ImportDiagnostic[] {
  const source = 'events'
  return [
    ...rejected.map((r): ImportDiagnostic => ({ source, sheet, patientId: r.event.patientId, severity: 'rejected', reason: describeEventRejection(r), ...at(r.event.sourceRow) })),
    ...valid.filter((e) => e.warning).map((e): ImportDiagnostic => ({ source, sheet, patientId: e.patientId, severity: 'warning', reason: describeEventWarning(e), ...at(sourceRows.get(e)) })),
    ...notes.map((reason) => sheetNote(source, sheet, reason)),
    ...dateReadNotes('event date', dateReads).map((reason) => sheetNote(source, sheet, reason)),
  ]
}

/** Diagnostics for an attributes table, including unreadable birth dates. */
export function attributeDiagnostics(sheet: string, { valid, rejected }: PatientAttributesResult): ImportDiagnostic[] {
  const birth = attributeBirthDateFindings(valid)
  const source = 'attributes'
  return [
    ...rejected.map((r): ImportDiagnostic => ({ source, sheet, patientId: r.row.patientId, severity: 'rejected', reason: describeAttributeRejection(r), ...at(r.row.sourceRow) })),
    ...valid.filter((r) => r.warning).map((r): ImportDiagnostic => ({ source, sheet, patientId: r.patientId, severity: 'warning', reason: describeAttributeWarning(r), ...at(r.sourceRow) })),
    ...birth.warnings.map((w): ImportDiagnostic => ({ source, sheet, patientId: w.patientId, severity: 'warning', reason: w.reason, ...at(w.sourceRow) })),
    ...dateReadNotes('birth date', birth.dateReads).map((reason) => sheetNote(source, sheet, reason)),
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

// `raw_measurements` is the sheet of imported values in the app's own workbook
// export. Its `measurements` sheet comes first there but holds analysis values
// (derived eGFR, resolved demographics), so it must not be taken as lab data.
const LABS_SHEET_NAMES = new Set(['labs', 'labor', 'labrows', 'labdata', 'rawmeasurements'])
const EVENTS_SHEET_NAMES = new Set(['events', 'ereignisse', 'clinicalevents', 'annotations'])
const ATTRIBUTES_SHEET_NAMES = new Set(['attributes', 'attribute', 'patientattributes'])

/**
 * Load a dataset from a workbook ArrayBuffer. If the workbook contains multiple
 * sheets (e.g. labs, events, attributes), all three are parsed and validated in
 * one pass.
 */
export function loadDatasetFromWorkbook(data: ArrayBuffer | Uint8Array, importOptions: LabImportOptions = {}): LoadedDataset {
  // Creatinine with a non-serum LOINC code is its own, labelled series (decided 2026-11-21).
  const options: LabImportOptions = { separateSeries: nonSerumCreatinineSeries, ...importOptions }
  try {
    const wb = readWorkbookSheets(data)
    if (wb.sheetNames.length === 0) {
      return { rows: [], events: [], patientAttributes: {}, sheetNames: [], diagnostics: [], rejectedEvents: [] }
    }
    // The app's own `raw_measurements` sheet carries the time of day in a column of its own.
    const labOptions = (sheetName: string): LabImportOptions => normaliseHeader(sheetName) === 'rawmeasurements' ? { ...options, timeOfDayColumn: true } : options
    if (wb.sheetNames.length === 1) {
      const labs = loadLabRowsWithDiagnostics(wb.getSheet(0), labOptions(wb.sheetNames[0]))
      return { rows: labs.rows, events: [], patientAttributes: {}, sheetNames: wb.sheetNames, diagnostics: labDiagnostics(wb.sheetNames[0], labs.issues), rejectedEvents: [] }
    }

    const eventsSheetName = wb.sheetNames.find((s) => EVENTS_SHEET_NAMES.has(normaliseHeader(s)))
    const attributesSheetName = wb.sheetNames.find((s) => ATTRIBUTES_SHEET_NAMES.has(normaliseHeader(s)))

    // Find the labs sheet: explicit match, or first sheet not reserved for events/attributes
    let labsSheetName = wb.sheetNames.find((s) => LABS_SHEET_NAMES.has(normaliseHeader(s)))
    if (!labsSheetName) {
      labsSheetName = wb.sheetNames.find((s) => s !== eventsSheetName && s !== attributesSheetName) ?? wb.sheetNames[0]
    }

    const labs = loadLabRowsWithDiagnostics(wb.getSheet(labsSheetName), labOptions(labsSheetName))
    const rows = labs.rows
    const diagnostics: ImportDiagnostic[] = labDiagnostics(labsSheetName, labs.issues)

    let events: ClinicalEvent[] = []
    let rejectedEvents: RejectedClinicalEvent[] = []
    if (eventsSheetName && eventsSheetName !== labsSheetName) {
      const rawEvents = wb.getSheet(eventsSheetName)
      if (rawEvents.length > 0) {
        const normalized = normalizeClinicalEventsWithNotes(rawEvents)
        const validation = validateClinicalEvents(normalized.events, rows)
        events = validation.valid
        rejectedEvents = validation.rejected
        diagnostics.push(...eventDiagnostics(eventsSheetName, normalized.dateReads, validation, normalized.notes))
      }
    }

    let patientAttributes: Record<string, Record<string, string>> = {}
    if (attributesSheetName && attributesSheetName !== labsSheetName) {
      const rawAttributes = wb.getSheet(attributesSheetName)
      // An attributes sheet with the ID column only (the app's own export of a
      // dataset without attributes) is skipped; any other sheet is read strictly.
      if (rawAttributes.length > 0 && hasPatientAttributeColumns(rawAttributes)) {
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

/** The demo files are fetched from the app's own address. A request that gets
 * no response rejects with the browser's own text ("Failed to fetch",
 * "NetworkError when attempting to fetch resource."), which names neither the
 * file nor the cause. */
async function fetchBundled(url: string): Promise<Response> {
  try {
    return await fetch(url)
  } catch {
    throw new Error('Could not load the demo dataset: the demo file could not be fetched from this app\'s address. Check the connection to the app and try again. Importing your own file does not need a connection.')
  }
}

export interface BundledFixtureData {
  rows: LabRow[]
  events: ClinicalEvent[]
  patientAttributes: Record<string, Record<string, string>>
}

/** Fetch the bundled demo labs plus demo event markers shipped in public/. */
export async function loadBundledFixtureData(baseUrl = import.meta.env.BASE_URL): Promise<BundledFixtureData> {
  const res = await fetchBundled(`${baseUrl}test_labs.xlsx`)
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
  const eventsRes = await fetchBundled(`${baseUrl}test_events.csv`)
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
  const res = await fetchBundled(`${baseUrl}test_attributes.csv`)
  if (!res.ok) return {}
  const normalized = normalizePatientAttributes(readWorkbook(await res.arrayBuffer()))
  const { byPatient, rejected } = validatePatientAttributes(normalized, rows)
  if (rejected.length > 0) {
    throw new Error(`Bundled attribute fixture contains ${rejected.length} invalid row(s).`)
  }
  return byPatient
}
