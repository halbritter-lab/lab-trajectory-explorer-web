import * as XLSX from 'xlsx'

export type RawRow = Record<string, unknown>

/** Normalise an Excel Date (which SheetJS creates as local-midnight) to a
 * midnight-UTC Date by reinterpreting the local Y/M/D components as UTC.
 * This matches pandas' naive-timestamp arithmetic for date-only cells and
 * eliminates DST-induced off-by-one day errors in span calculations. */
function normaliseXlsxDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/**
 * Parse an xlsx or csv file (as an ArrayBuffer) into header-keyed row objects
 * from the first sheet. Blank cells are filled with null (keys are always
 * present in each row object, which the downstream loader relies on).
 * Date cells are normalised to midnight UTC (stripping the local-timezone
 * component that SheetJS adds) so that downstream span-day and OLS calculations
 * match Python's naive-timestamp arithmetic.
 */
export function readWorkbook(data: ArrayBuffer | Uint8Array, sheet: string | number = 0): RawRow[] {
  // cellDates: true makes SheetJS emit Date objects for date cells instead of
  // Excel serial numbers, so loader.ts toDate() can parse them correctly.
  // SheetJS type:'array' requires a Uint8Array; wrap a bare ArrayBuffer so
  // callers can pass either type without surprises.  We check ArrayBuffer by
  // duck-typing (byteLength + no BYTES_PER_ELEMENT) rather than instanceof
  // because jsdom provides a different ArrayBuffer class from the Node.js
  // native one, so instanceof ArrayBuffer can be false even for real buffers.
  const arr =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data as ArrayBuffer)
  const wb = XLSX.read(arr, { type: 'array', cellDates: true })
  const sheetName =
    typeof sheet === 'number' ? wb.SheetNames[sheet] : sheet
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: null })
  // Normalise all Date values from local-midnight to UTC-midnight so that
  // relative differences (e.g. spanDays = Math.trunc(ms/86400000)) are
  // identical to Python's (t2 - t1).days using naive timestamps.
  return rows.map((row) => {
    const out: RawRow = {}
    for (const [k, v] of Object.entries(row)) {
      out[k] = v instanceof Date ? normaliseXlsxDate(v) : v
    }
    return out
  })
}
