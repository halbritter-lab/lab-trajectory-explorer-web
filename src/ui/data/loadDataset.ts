import { readWorkbook } from '../../io/readWorkbook'
import { loadLabRows } from '../../core/parse/loader'
import type { LabRow } from '../../core/types'
import {
  normalizeClinicalEvents,
  validateClinicalEvents,
  type ClinicalEvent,
} from '../../core/events/events'

/** Parse an uploaded/fetched workbook ArrayBuffer into typed LabRows. Wraps the
 * raw SheetJS/loader errors in a user-facing message. */
export function datasetFromArrayBuffer(data: ArrayBuffer): LabRow[] {
  try {
    return loadLabRows(readWorkbook(data))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`Could not read this file. ${detail}`)
  }
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
}

/** Fetch the bundled demo labs plus demo event markers shipped in public/. */
export async function loadBundledFixtureData(baseUrl = import.meta.env.BASE_URL): Promise<BundledFixtureData> {
  const rows = await loadBundledFixture(baseUrl)
  const res = await fetch(`${baseUrl}test_events.csv`)
  if (!res.ok) return { rows, events: [] }
  const normalized = normalizeClinicalEvents(readWorkbook(await res.arrayBuffer()))
  const { valid, rejected: rejects } = validateClinicalEvents(normalized, rows)
  if (rejects.length > 0) {
    throw new Error(`Bundled event fixture contains ${rejects.length} invalid row(s).`)
  }
  return { rows, events: valid }
}
