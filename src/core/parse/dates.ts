/**
 * Date cells as they arrive from `readWorkbook`: a `Date` for real xlsx date
 * cells (already normalised to midnight UTC), a number for unformatted numeric
 * xlsx cells, or the verbatim text of a CSV/text cell. Every accepted value is
 * returned as a calendar day at midnight UTC; any time of day is dropped, the
 * same as for xlsx date cells.
 */
export type ImportDateResult =
  | { kind: 'empty' }
  | { kind: 'date'; date: Date; via: ImportDateSource }
  | { kind: 'invalid'; problem: ImportDateProblem }

export type ImportDateSource = 'date-cell' | 'iso' | 'dotted' | 'slash-day-first' | 'excel-serial'
export type ImportDateProblem = 'impossible_date' | 'implausible_serial' | 'unrecognised'

/** Excel serials accepted as dates: 1 (1900-01-01) to 80000 (2119-01-11). */
export const EXCEL_SERIAL_MIN = 1
export const EXCEL_SERIAL_MAX = 80000

const DAY_MS = 86_400_000
// Optional time of day, with optional seconds, fraction and zone. The time is
// ignored; only the written calendar day counts.
const TIME = String.raw`(?:(?:T|\s+)\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?)?`
const ISO_RE = new RegExp(String.raw`^(\d{4})[-/](\d{1,2})[-/](\d{1,2})${TIME}$`, 'i')
const DOTTED_RE = new RegExp(String.raw`^(\d{1,2})\.(\d{1,2})\.(\d{4})${TIME}$`, 'i')
const SLASH_RE = new RegExp(String.raw`^(\d{1,2})/(\d{1,2})/(\d{4})${TIME}$`, 'i')
// In text, only five-digit numbers are read as serials (1927-05-18 onwards):
// a four-digit number is far more likely a bare year than a 1900s serial.
const SERIAL_TEXT_RE = /^\d{5}(?:[.,]\d+)?$/

/** Midnight UTC for a written calendar day, or null when the day does not
 * exist (2021-02-30, month 13). */
export function calendarDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

/** Excel 1900-system serial to midnight UTC. Excel counts the non-existent
 * 1900-02-29 as serial 60, so serials after it are shifted by one day. */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < EXCEL_SERIAL_MIN || serial >= EXCEL_SERIAL_MAX + 1) return null
  const day = Math.floor(serial)
  if (day === 60) return null
  const epoch = day < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)
  return new Date(epoch + day * DAY_MS)
}

function fromParts(y: string, m: string, d: string, via: ImportDateSource): ImportDateResult {
  const date = calendarDate(Number(y), Number(m), Number(d))
  return date ? { kind: 'date', date, via } : { kind: 'invalid', problem: 'impossible_date' }
}

export function parseImportDate(value: unknown): ImportDateResult {
  if (value === null || value === undefined) return { kind: 'empty' }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { kind: 'invalid', problem: 'unrecognised' } : { kind: 'date', date: value, via: 'date-cell' }
  }
  if (typeof value === 'number') {
    const date = excelSerialToDate(value)
    return date ? { kind: 'date', date, via: 'excel-serial' } : { kind: 'invalid', problem: 'implausible_serial' }
  }
  if (typeof value !== 'string') return { kind: 'invalid', problem: 'unrecognised' }
  const text = value.replace(/[  ]/g, ' ').trim()
  if (text === '') return { kind: 'empty' }
  let m: RegExpExecArray | null
  if ((m = ISO_RE.exec(text))) return fromParts(m[1], m[2], m[3], 'iso')
  if ((m = DOTTED_RE.exec(text))) return fromParts(m[3], m[2], m[1], 'dotted')
  // German exports write dd/mm/yyyy; US month-first dates are not supported
  // and fail here when the second number exceeds 12.
  if ((m = SLASH_RE.exec(text))) return fromParts(m[3], m[2], m[1], 'slash-day-first')
  if (SERIAL_TEXT_RE.test(text)) {
    const date = excelSerialToDate(Number(text.replace(',', '.')))
    return date ? { kind: 'date', date, via: 'excel-serial' } : { kind: 'invalid', problem: 'implausible_serial' }
  }
  return { kind: 'invalid', problem: 'unrecognised' }
}

/** Plain-English explanation for a rejected date cell. */
export function describeDateProblem(label: string, value: unknown, problem: ImportDateProblem): string {
  const shown = typeof value === 'string' ? `"${value}"` : String(value)
  switch (problem) {
    case 'impossible_date':
      return `${label} ${shown} is not a valid calendar date`
    case 'implausible_serial':
      return `${label} ${shown} is a number outside the Excel date range (${EXCEL_SERIAL_MIN}–${EXCEL_SERIAL_MAX}, years 1900–2119)`
    case 'unrecognised':
      return `${label} ${shown} is not a recognised date (use YYYY-MM-DD, DD.MM.YYYY or DD/MM/YYYY)`
  }
}
