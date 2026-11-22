import * as XLSX from 'xlsx'
import type { RawRow } from '../core/types'
import {
  ATTRIBUTES_DEMOGRAPHICS_ALIASES,
  EVENTS_COLUMN_ALIASES,
  LAB_COLUMN_ALIASES,
  normaliseHeader,
} from '../core/parse/headers'

export type { RawRow } from '../core/types'

/** Round the Date of a workbook date cell to whole seconds without leaving its
 * day. The cell is read with `UTC: true`, so its UTC fields are the calendar
 * day and the clock time as written in the workbook, whatever the time zone
 * of the browser: a date-only cell is midnight UTC, which matches pandas'
 * naive-timestamp arithmetic and keeps span calculations free of DST shifts.
 * Reading the time through the local zone instead moved a time that does not
 * exist there (02:30 on a spring-forward day) by one hour. `parseImportDate`
 * splits the result into the calendar day and the time of day. */
function normaliseXlsxDate(d: Date): Date {
  const t = d.getTime()
  if (Number.isNaN(t)) return d
  const ms = ((t % DAY_MS) + DAY_MS) % DAY_MS
  return new Date(t - ms + Math.min(Math.round(ms / 1000), 86_399) * 1000)
}

const DAY_MS = 86_400_000

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

/** Candidate field delimiters, in the workbook reader's order of preference on a tie. */
const DELIMITERS = [',', '\t', ';', '|'] as const

/** Every accepted column name of the three tables, as `normaliseHeader` spells it. */
const KNOWN_COLUMNS = new Set(
  [LAB_COLUMN_ALIASES, EVENTS_COLUMN_ALIASES, ATTRIBUTES_DEMOGRAPHICS_ALIASES]
    .flatMap((aliases) => Object.values<readonly string[]>(aliases).flat())
    .map(normaliseHeader),
)

/** Count each candidate outside double quotes, up to the first line break outside quotes when `firstLineOnly`. */
function countDelimiters(text: string, firstLineOnly: boolean): Map<string, number> {
  const counts = new Map<string, number>()
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (quoted) continue
    else if (firstLineOnly && (ch === '\n' || ch === '\r')) break
    else if ((DELIMITERS as readonly string[]).includes(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  return counts
}

/** The header line (text before the first line break outside double quotes), split at `delimiter` outside quotes. */
function headerCells(text: string, delimiter: string): string[] {
  const cells = ['']
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && ch === delimiter) cells.push('')
    else cells[cells.length - 1] += ch
  }
  return cells
}

const knownColumnCount = (text: string, delimiter: string) =>
  headerCells(text, delimiter).filter((name) => KNOWN_COLUMNS.has(normaliseHeader(name))).length

/**
 * The delimiter the workbook reader picks when none is passed (SheetJS 0.20.3,
 * `guess_sep`): the candidate that occurs most often outside double quotes in
 * the first 1024 characters, on a tie comma before tab before semicolon before
 * pipe, and the comma when none occurs.
 */
export function readerDelimiterGuess(text: string): string {
  const counts = countDelimiters(text.slice(0, 1024), false)
  let best: string = DELIMITERS[0]
  for (const candidate of DELIMITERS) if ((counts.get(candidate) ?? 0) > (counts.get(best) ?? 0)) best = candidate
  return best
}

/**
 * The field delimiter of delimited text, or undefined to leave the choice to
 * the workbook reader's own guess over the first 1024 characters.
 *
 * The header line holds only column names, so decimal commas and free text in
 * the data rows cannot outvote the real delimiter there, as they can in the
 * reader's guess. The candidate (comma, tab, semicolon, pipe) that occurs most
 * often outside double quotes before the first line break is therefore
 * preferred when it differs from the reader's guess, with one guard: a column
 * name may itself hold commas (`patientId;Diagnose, genetisch, bestätigt`), and
 * a file that the reader's guess reads correctly must stay readable. So the
 * header candidate replaces the reader's guess only when the header line split
 * at it holds more accepted column names (`KNOWN_COLUMNS`) than split at the
 * reader's guess, or when neither split holds any (such a file is rejected
 * under either delimiter; the header candidate gives the clearer error).
 *
 * Left to the reader in any case: a text that starts with a `sep=` line (the
 * reader honours it), a header line without any candidate, and a header line
 * in which two candidates share the highest count.
 */
export function detectDelimiter(text: string): string | undefined {
  if (text.startsWith('sep=')) return undefined
  const counts = countDelimiters(text, true)
  const highest = Math.max(0, ...counts.values())
  const best = DELIMITERS.filter((candidate) => counts.get(candidate) === highest)
  if (best.length !== 1) return undefined
  const fromHeader = best[0]
  const fromReader = readerDelimiterGuess(text)
  if (fromHeader === fromReader) return fromHeader
  const knownAtReader = knownColumnCount(text, fromReader)
  return knownAtReader > 0 && knownAtReader >= knownColumnCount(text, fromHeader) ? undefined : fromHeader
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
 * The field delimiter is chosen by `detectDelimiter`.
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
      const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: null, UTC: true })
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
 * Date cells are read as UTC, independent of the local time zone: the
 * calendar day at midnight UTC plus the cell's clock time. Every date reader takes the calendar day only, so that downstream
 * span-day and OLS calculations match Python's naive-timestamp arithmetic.
 */
export function readWorkbook(data: ArrayBuffer | Uint8Array, sheet: string | number = 0): RawRow[] {
  return readWorkbookSheets(data).getSheet(sheet)
}
