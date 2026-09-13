import { readWorkbook, readWorkbookSheets } from '../../io/readWorkbook'
import { loadLabRows } from '../../core/parse/loader'
import type { LabRow, PatientId } from '../../core/types'
import {
  normalizeClinicalEvents,
  validateClinicalEvents,
  type ClinicalEvent,
} from '../../core/events/events'
import {
  normalizePatientAttributes,
  validatePatientAttributes,
} from '../../core/attributes/attributes'
import { normaliseHeader } from '../../io/headers'

export interface ImportDiagnostic {
  sheet: string
  patientId: PatientId | null
  severity: 'rejected' | 'warning'
  reason: string
}

export interface LoadedDataset {
  rows: LabRow[]
  events: ClinicalEvent[]
  patientAttributes: Record<string, Record<string, string>>
  sheetNames: string[]
  diagnostics: ImportDiagnostic[]
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
      return { rows: [], events: [], patientAttributes: {}, sheetNames: [], diagnostics: [] }
    }
    if (wb.sheetNames.length === 1) {
      return { rows: loadLabRows(wb.getSheet(0)), events: [], patientAttributes: {}, sheetNames: wb.sheetNames, diagnostics: [] }
    }
    const diagnostics: ImportDiagnostic[] = []

    const eventsSheetName = wb.sheetNames.find((s) => EVENTS_SHEET_NAMES.has(normaliseHeader(s)))
    const attributesSheetName = wb.sheetNames.find((s) => ATTRIBUTES_SHEET_NAMES.has(normaliseHeader(s)))

    // Find the labs sheet: explicit match, or first sheet not reserved for events/attributes
    let labsSheetName = wb.sheetNames.find((s) => LABS_SHEET_NAMES.has(normaliseHeader(s)))
    if (!labsSheetName) {
      labsSheetName = wb.sheetNames.find((s) => s !== eventsSheetName && s !== attributesSheetName) ?? wb.sheetNames[0]
    }

    const rawLabs = wb.getSheet(labsSheetName)
    const rows = loadLabRows(rawLabs)

    let events: ClinicalEvent[] = []
    if (eventsSheetName && eventsSheetName !== labsSheetName) {
      const rawEvents = wb.getSheet(eventsSheetName)
      if (rawEvents.length > 0) {
        const normalized = normalizeClinicalEvents(rawEvents)
        const { valid, rejected } = validateClinicalEvents(normalized, rows)
        events = valid
        for (const { event, reason } of rejected) diagnostics.push({ sheet: eventsSheetName, patientId: event.patientId, severity: 'rejected', reason })
        for (const event of valid) {
          if (event.warning) diagnostics.push({ sheet: eventsSheetName, patientId: event.patientId, severity: 'warning', reason: event.warning })
        }
      }
    }

    let patientAttributes: Record<string, Record<string, string>> = {}
    if (attributesSheetName && attributesSheetName !== labsSheetName) {
      const rawAttributes = wb.getSheet(attributesSheetName)
      if (rawAttributes.length > 0) {
        const normalized = normalizePatientAttributes(rawAttributes)
        const { byPatient, valid, rejected } = validatePatientAttributes(normalized, rows)
        patientAttributes = byPatient
        for (const { row, reason } of rejected) diagnostics.push({ sheet: attributesSheetName, patientId: row.patientId, severity: 'rejected', reason })
        for (const record of valid) {
          if (record.warning) diagnostics.push({ sheet: attributesSheetName, patientId: record.patientId, severity: 'warning', reason: record.warning })
        }
      }
    }

    return {
      rows,
      events,
      patientAttributes,
      sheetNames: wb.sheetNames,
      diagnostics,
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
