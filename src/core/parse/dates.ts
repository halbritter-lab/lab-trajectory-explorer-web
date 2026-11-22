/**
 * Date cells as they arrive from `readWorkbook`: a `Date` for real xlsx date
 * cells (the cell's calendar day and clock time, written as UTC), a number for unformatted numeric
 * xlsx cells, or the verbatim text of a CSV/text cell. Every accepted value is
 * returned as a calendar day at midnight UTC. A time of day is returned
 * beside it as `timeOfDay`; it never moves the day.
 */
export type ImportDateResult =
  | { kind: 'empty' }
  | { kind: 'date'; date: Date; via: ImportDateSource; timeOfDay?: number }
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

/** First day of the accepted measurement serial range, 1927-05-18. The lab
 * import warns about lab dates before it, whatever their form (decided
 * 2026-11-21); only serial numbers below it are rejected. */
export const EARLIEST_PLAUSIBLE_MEASUREMENT_DATE = new Date(Date.UTC(1899, 11, 30) + SERIAL_RANGE.measurement.min * DAY_MS)

/** The local calendar day of `now` as midnight UTC: the import day of the
 * date plausibility warnings. */
export const importDayOf = (now: Date): Date => new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

/** Why a lab or event date is implausible (decided 2026-11-21 for lab dates,
 * extended to event dates and end dates on 2026-11-22), or null: "after the
 * import day YYYY-MM-DD" or "before 1927-05-18". A warning only. */
export function implausibleMeasurementDate(date: Date, now: Date): string | null {
  const importDay = importDayOf(now)
  if (date.getTime() > importDay.getTime()) return `after the import day ${importDay.toISOString().slice(0, 10)}`
  if (date.getTime() < EARLIEST_PLAUSIBLE_MEASUREMENT_DATE.getTime()) return `before ${EARLIEST_PLAUSIBLE_MEASUREMENT_DATE.toISOString().slice(0, 10)}`
  return null
}

/** Warning text for a birth date after the import day (2026-11-22), or null. */
export function futureBirthDateWarning(date: Date, now: Date): string | null {
  const importDay = importDayOf(now)
  return date.getTime() > importDay.getTime() ? `Birth date ${date.toISOString().slice(0, 10)} is after the import day ${importDay.toISOString().slice(0, 10)}; it is used unchanged.` : null
}
// Optional time of day, with optional seconds, fraction and zone. Only the
// written calendar day counts as the date; the written clock time (hours,
// minutes, seconds, fraction) is kept beside it and the zone is ignored.
const TIME = String.raw`(?:(?:T|\s+)(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?\s*(?:Z|[+-]\d{2}:?\d{2})?)?`
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

/**
 * Time of day in milliseconds after midnight, or `{}` when the source gives
 * none. Midnight (00:00:00) counts as no time of day: a date-only workbook
 * cell cannot be told apart from one at midnight, and exports write midnight
 * for "no time". A time that does not exist (25:00, 12:60) counts as none too.
 */
function timeOfDay(ms: number): { timeOfDay?: number } {
  return Number.isFinite(ms) && ms > 0 && ms < DAY_MS ? { timeOfDay: ms } : {}
}

/** Whole seconds, so that a workbook date cell, a serial number and text give
 * the same time for the same clock reading; 23:59:59.5 and later stay on
 * 23:59:59 instead of reaching the next day. */
const wholeSeconds = (ms: number): number => Math.min(Math.round(ms / 1000) * 1000, DAY_MS - 1000)

function writtenTime(h: string | undefined, m: string | undefined, s: string | undefined, fraction: string | undefined): { timeOfDay?: number } {
  if (h === undefined || m === undefined) return {}
  const [hours, minutes, seconds] = [Number(h), Number(m), Number(s ?? 0)]
  if (hours > 23 || minutes > 59 || seconds > 59) return {}
  const ms = fraction === undefined ? 0 : Number(`0.${fraction}`) * 1000
  return timeOfDay(wholeSeconds(((hours * 60 + minutes) * 60 + seconds) * 1000 + ms))
}

function fromSerial(serial: number, purpose: DatePurpose): ImportDateResult {
  if (Number.isInteger(serial) && serial >= 1900 && serial <= 2100) return { kind: 'invalid', problem: 'bare_year' }
  const { min, max } = SERIAL_RANGE[purpose]
  if (!Number.isFinite(serial) || serial < min || serial >= max + 1) return { kind: 'invalid', problem: 'implausible_serial' }
  const date = excelSerialToDate(serial)
  if (!date) return { kind: 'invalid', problem: 'excel_leap_day' }
  // The fraction of a serial is the time of day (0.25 = 06:00).
  return { kind: 'date', date, via: 'excel-serial', ...timeOfDay(wholeSeconds((serial - Math.floor(serial)) * DAY_MS)) }
}

function fromParts(y: string, m: string, d: string, via: ImportDateSource, time: { timeOfDay?: number }): ImportDateResult {
  const date = calendarDate(Number(y), Number(m), Number(d))
  if (date) return { kind: 'date', date, via, ...time }
  const monthFirst = via === 'slash-day-first' && Number(m) > 12 && Number(d) <= 12
  return { kind: 'invalid', problem: monthFirst ? 'month_first' : 'impossible_date' }
}

export function parseImportDate(value: unknown, purpose: DatePurpose = 'measurement'): ImportDateResult {
  if (value === null || value === undefined) return { kind: 'empty' }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { kind: 'invalid', problem: 'unrecognised' }
    // `readWorkbook` passes the clock time of a workbook cell as the UTC time
    // of its calendar day; split the two again.
    const ms = ((value.getTime() % DAY_MS) + DAY_MS) % DAY_MS
    return { kind: 'date', date: ms === 0 ? value : new Date(value.getTime() - ms), via: 'date-cell', ...timeOfDay(wholeSeconds(ms)) }
  }
  if (typeof value === 'number') return fromSerial(value, purpose)
  if (typeof value !== 'string') return { kind: 'invalid', problem: 'unrecognised' }
  const text = value.replace(/[  ]/g, ' ').trim()
  if (text === '') return { kind: 'empty' }
  let m: RegExpExecArray | null
  if ((m = ISO_RE.exec(text))) return fromParts(m[1], m[2], m[3], 'iso', writtenTime(m[4], m[5], m[6], m[7]))
  if ((m = DOTTED_RE.exec(text))) return fromParts(m[3], m[2], m[1], 'dotted', writtenTime(m[4], m[5], m[6], m[7]))
  // German exports write dd/mm/yyyy; US month-first dates are not supported.
  if ((m = SLASH_RE.exec(text))) return fromParts(m[3], m[2], m[1], 'slash-day-first', writtenTime(m[4], m[5], m[6], m[7]))
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
