import * as XLSX from 'xlsx'
import type { RawRow } from '../core/types'

export type { RawRow } from '../core/types'

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

const ZIP_SIGNATURES = [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]]
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b)

/** Zip containers (xlsx, xlsb, ods) and OLE compound files (xls), by their full
 * signatures: a CSV whose first header merely starts with "PK" is text. */
function isBinarySpreadsheet(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURES.some((sig) => startsWith(bytes, sig)) || startsWith(bytes, OLE_SIGNATURE)
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

/** Candidate field delimiters. */
const DELIMITERS = [',', '\t', ';', '|'] as const

/**
 * The field delimiter of delimited text, taken from the header line alone: the
 * candidate (comma, tab, semicolon, pipe) that occurs most often outside
 * double quotes before the first line break. The header line holds only column
 * names, so decimal commas and free text in the data rows cannot outvote the
 * real delimiter, as they can in the workbook reader's own guess over the
 * first 1024 characters. Returns undefined, which leaves the choice to the
 * reader's own guess, when the text starts with a `sep=` line (the reader
 * honours it), the header line holds no candidate, or two candidates share the
 * highest count (`patientId;Diagnose, genetisch`: the header line cannot tell).
 */
export function detectDelimiter(text: string): string | undefined {
  if (text.startsWith('sep=')) return undefined
  const counts = new Map<string, number>()
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && (DELIMITERS as readonly string[]).includes(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  const highest = Math.max(0, ...counts.values())
  const best = DELIMITERS.filter((candidate) => counts.get(candidate) === highest)
  return best.length === 1 ? best[0] : undefined
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
 * The field delimiter comes from the header line (`detectDelimiter`).
 * Binary workbooks keep their typed cells (numbers, dates, text).
 *
 * Every row carries its position in the file as a non-enumerable
 * `__rowNum__` (zero-based, header row = 0), read by `sourceRowNumber`.
 */
export function readWorkbookSheets(data: ArrayBuffer | Uint8Array): WorkbookSheets {
  const arr =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data as ArrayBuffer)
  const text = isBinarySpreadsheet(arr) ? null : decodeText(arr)
  const wb = text === null
    ? XLSX.read(arr, { type: 'array', cellDates: true })
    : XLSX.read(text, { type: 'string', raw: true, FS: detectDelimiter(text) })
  const sepLineRows = text !== null && /^sep=.\r?\n|^sep=.\r/.test(text) ? 1 : 0
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
        // The reader removes a leading "sep=" line before counting rows.
        const rowNum = (row as { __rowNum__?: unknown }).__rowNum__
        if (typeof rowNum === 'number') Object.defineProperty(out, '__rowNum__', { value: rowNum + sepLineRows, enumerable: false })
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
