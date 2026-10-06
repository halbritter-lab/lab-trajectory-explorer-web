import * as XLSX from 'xlsx'

export type RawRow = Record<string, unknown>

/** Normalise an Excel Date (which SheetJS creates as local-midnight) to a
 * midnight-UTC Date by reinterpreting the local Y/M/D components as UTC.
 * This matches pandas' naive-timestamp arithmetic for date-only cells and
 * eliminates DST-induced off-by-one day errors in span calculations. */
function normaliseXlsxDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export interface WorkbookSheets {
  sheetNames: string[]
  getSheet(sheet: string | number): RawRow[]
}

/** Zip containers (xlsx, xlsb, ods) and OLE compound files (xls). */
function isBinarySpreadsheet(bytes: Uint8Array): boolean {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
  return zip || ole
}

/**
 * Decode CSV/text bytes. UTF-16 is recognised by its byte-order mark; otherwise
 * UTF-8 is tried strictly (a UTF-8 BOM is dropped) and Windows-1252, the usual
 * encoding of German Excel CSV exports, is the fallback. Returns null for
 * anything that does not look like text, so it is left to SheetJS.
 */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  if (bytes.subarray(0, 4096).includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/**
 * Inspect an xlsx or csv file (as an ArrayBuffer or Uint8Array) and return its
 * sheet names along with a getter for raw rows of any sheet.
 *
 * CSV and other text input is decoded here and parsed with `raw: true`, so every
 * cell reaches the loaders as its verbatim text. Left to itself SheetJS infers
 * types from CSV text: it reads the decimal comma in "1,5" as a thousands
 * separator (15), drops leading zeros from IDs, turns ranges such as "10-20"
 * into dates, reads 03/01/2024 month-first and decodes UTF-8 as Latin-1.
 * Binary workbooks keep their typed cells (numbers, dates, text).
 */
export function readWorkbookSheets(data: ArrayBuffer | Uint8Array): WorkbookSheets {
  const arr =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data as ArrayBuffer)
  const text = isBinarySpreadsheet(arr) ? null : decodeText(arr)
  const wb = text === null
    ? XLSX.read(arr, { type: 'array', cellDates: true })
    : XLSX.read(text, { type: 'string', raw: true })
  return {
    sheetNames: wb.SheetNames,
    getSheet(sheet: string | number): RawRow[] {
      const sheetName =
        typeof sheet === 'number' ? wb.SheetNames[sheet] : sheet
      const ws = wb.Sheets[sheetName]
      if (!ws) return []
      const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: null })
      return rows.map((row) => {
        const out: RawRow = {}
        for (const [k, v] of Object.entries(row)) {
          out[k] = v instanceof Date ? normaliseXlsxDate(v) : v
        }
        return out
      })
    },
  }
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
  return readWorkbookSheets(data).getSheet(sheet)
}
