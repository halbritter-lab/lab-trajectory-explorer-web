import { readWorkbook } from '../../io/readWorkbook'
import { loadLabRows } from '../../core/parse/loader'
import type { LabRow } from '../../core/types'

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

/** Fetch the bundled synthetic fixture shipped in public/. */
export async function loadBundledFixture(baseUrl = import.meta.env.BASE_URL): Promise<LabRow[]> {
  const res = await fetch(`${baseUrl}test_labs.xlsx`)
  if (!res.ok) throw new Error(`Could not load the synthetic dataset (HTTP ${res.status}).`)
  const buf = await res.arrayBuffer()
  return datasetFromArrayBuffer(buf)
}
