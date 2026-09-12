import { readWorkbook, readWorkbookSheets } from '../../io/readWorkbook'
import { loadLabRows } from '../../core/parse/loader'
import type { LabRow } from '../../core/types'
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

export interface LoadedDataset {
  rows: LabRow[]
  events: ClinicalEvent[]
  patientAttributes: Record<string, Record<string, string>>
  sheetNames: string[]
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
      return { rows: [], events: [], patientAttributes: {}, sheetNames: [] }
    }

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
    if (eventsSheetName) {
      const rawEvents = wb.getSheet(eventsSheetName)
      if (rawEvents.length > 0) {
        const normalized = normalizeClinicalEvents(rawEvents)
        const { valid } = validateClinicalEvents(normalized, rows)
        events = valid
      }
    }

    let patientAttributes: Record<string, Record<string, string>> = {}
    if (attributesSheetName) {
      const rawAttributes = wb.getSheet(attributesSheetName)
      if (rawAttributes.length > 0) {
        const normalized = normalizePatientAttributes(rawAttributes)
        const { byPatient } = validatePatientAttributes(normalized, rows)
        patientAttributes = byPatient
      }
    }

    return {
      rows,
      events,
      patientAttributes,
      sheetNames: wb.sheetNames,
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
