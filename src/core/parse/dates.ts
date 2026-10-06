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
export type ImportDateProblem =
  | 'impossible_date'
  | 'month_first'
  | 'implausible_serial'
  | 'excel_leap_day'
  | 'bare_year'
  | 'unrecognised'

/**
 * What the date describes, which sets the plausible range for Excel serials:
 * - `measurement` (lab and event dates): 10000–80000, i.e. 1927-05-18 to
 *   2119-01-11. A typed number below that is far more likely a year or a
 *   mistyped value than a measurement from the early 1900s.
 * - `birth`: 1–80000 (1900-01-01 onwards), since birth dates can be old.
 * For both, a whole number from 1900 to 2100 is rejected as a bare year.
 */
export type DatePurpose = 'measurement' | 'birth'

const SERIAL_RANGE: Record<DatePurpose, { min: number; max: number; years: string }> = {
  measurement: { min: 10000, max: 80000, years: '1927–2119' },
  birth: { min: 1, max: 80000, years: '1900–2119' },
}

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

/** Excel 1900-system serial (1 to 80000) to midnight UTC. Excel counts the
 * non-existent 1900-02-29 as serial 60, so serials after it are shifted by one
 * day and 60 itself has no date. */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial >= 80001) return null
  const day = Math.floor(serial)
  if (day === 60) return null
  const epoch = day < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)
  return new Date(epoch + day * DAY_MS)
}

function fromSerial(serial: number, purpose: DatePurpose): ImportDateResult {
  if (Number.isInteger(serial) && serial >= 1900 && serial <= 2100) return { kind: 'invalid', problem: 'bare_year' }
  const { min, max } = SERIAL_RANGE[purpose]
  if (!Number.isFinite(serial) || serial < min || serial >= max + 1) return { kind: 'invalid', problem: 'implausible_serial' }
  const date = excelSerialToDate(serial)
  return date ? { kind: 'date', date, via: 'excel-serial' } : { kind: 'invalid', problem: 'excel_leap_day' }
}

function fromParts(y: string, m: string, d: string, via: ImportDateSource): ImportDateResult {
  const date = calendarDate(Number(y), Number(m), Number(d))
  if (date) return { kind: 'date', date, via }
  const monthFirst = via === 'slash-day-first' && Number(m) > 12 && Number(d) <= 12
  return { kind: 'invalid', problem: monthFirst ? 'month_first' : 'impossible_date' }
}

export function parseImportDate(value: unknown, purpose: DatePurpose = 'measurement'): ImportDateResult {
  if (value === null || value === undefined) return { kind: 'empty' }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { kind: 'invalid', problem: 'unrecognised' } : { kind: 'date', date: value, via: 'date-cell' }
  }
  if (typeof value === 'number') return fromSerial(value, purpose)
  if (typeof value !== 'string') return { kind: 'invalid', problem: 'unrecognised' }
  const text = value.replace(/[  ]/g, ' ').trim()
  if (text === '') return { kind: 'empty' }
  let m: RegExpExecArray | null
  if ((m = ISO_RE.exec(text))) return fromParts(m[1], m[2], m[3], 'iso')
  if ((m = DOTTED_RE.exec(text))) return fromParts(m[3], m[2], m[1], 'dotted')
  // German exports write dd/mm/yyyy; US month-first dates are not supported.
  if ((m = SLASH_RE.exec(text))) return fromParts(m[3], m[2], m[1], 'slash-day-first')
  if (SERIAL_TEXT_RE.test(text)) return fromSerial(Number(text.replace(',', '.')), purpose)
  return { kind: 'invalid', problem: 'unrecognised' }
}

/** Plain-English explanation for a rejected date cell. */
export function describeDateProblem(
  label: string,
  value: unknown,
  problem: ImportDateProblem,
  purpose: DatePurpose = 'measurement',
): string {
  const shown = typeof value === 'string' ? `"${value}"` : String(value)
  const { min, max, years } = SERIAL_RANGE[purpose]
  switch (problem) {
    case 'impossible_date':
      return `${label} ${shown} is not a valid calendar date`
    case 'month_first':
      return `${label} ${shown} is not a valid date: dates with slashes are read day-first (DD/MM/YYYY); US month-first dates are not supported`
    case 'implausible_serial':
      return `${label} ${shown} is a number outside the accepted Excel date range (${min}–${max}, years ${years})`
    case 'excel_leap_day':
      return `${label} ${shown} is Excel's serial number for 29 February 1900, a day that does not exist`
    case 'bare_year':
      return `${label} ${shown} is a number that looks like a year, not an Excel date`
    case 'unrecognised':
      return `${label} ${shown} is not a recognised date (use YYYY-MM-DD, DD.MM.YYYY or DD/MM/YYYY)`
  }
}

/** How many accepted dates were read in a way the user should know about. */
export interface DateReadCounts {
  dayFirst: number
  serial: number
}

export const noDateReads = (): DateReadCounts => ({ dayFirst: 0, serial: 0 })

export function countDateRead(counts: DateReadCounts, result: ImportDateResult): void {
  if (result.kind !== 'date') return
  if (result.via === 'slash-day-first') counts.dayFirst++
  if (result.via === 'excel-serial') counts.serial++
}

/** Sheet-level notes for day-first and Excel-serial dates; `subject` is the
 * singular noun, e.g. "lab date". */
export function dateReadNotes(subject: string, { dayFirst, serial }: DateReadCounts): string[] {
  const notes: string[] = []
  if (dayFirst > 0) {
    notes.push(`${dayFirst} ${subject}${dayFirst === 1 ? '' : 's'} written as DD/MM/YYYY ${dayFirst === 1 ? 'was' : 'were'} read day-first (03/01/2024 = 3 January 2024).`)
  }
  if (serial === 1) notes.push(`1 ${subject} stored as a number was read as an Excel serial date (1900 date system).`)
  if (serial > 1) notes.push(`${serial} ${subject}s stored as numbers were read as Excel serial dates (1900 date system).`)
  return notes
}
