import { describe, it, expect } from 'vitest'
import { excelSerialToDate, parseImportDate } from '../../../src/core/parse/dates'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const dateOf = (value: unknown) => {
  const parsed = parseImportDate(value)
  return parsed.kind === 'date' ? parsed.date : parsed
}

describe('parseImportDate', () => {
  it('reads the supported text forms as midnight UTC', () => {
    expect(dateOf('2024-01-15')).toEqual(utc(2024, 1, 15))
    expect(dateOf('2024/1/5')).toEqual(utc(2024, 1, 5))
    expect(dateOf('2024-01-15T23:59:59.000Z')).toEqual(utc(2024, 1, 15))
    expect(dateOf('2024-01-15 08:30:00+02:00')).toEqual(utc(2024, 1, 15))
    expect(dateOf('5.3.2024')).toEqual(utc(2024, 3, 5))
    expect(dateOf('15.03.2024 10:30')).toEqual(utc(2024, 3, 15))
    expect(parseImportDate('03/01/2024')).toEqual({ kind: 'date', date: utc(2024, 1, 3), via: 'slash-day-first' })
  })

  it('separates empty, impossible and unrecognised values', () => {
    expect(parseImportDate(null)).toEqual({ kind: 'empty' })
    expect(parseImportDate('  ')).toEqual({ kind: 'empty' })
    expect(parseImportDate('2021-02-30')).toEqual({ kind: 'invalid', problem: 'impossible_date' })
    expect(parseImportDate('2024-13-01')).toEqual({ kind: 'invalid', problem: 'impossible_date' })
    expect(parseImportDate('29.02.2023')).toEqual({ kind: 'invalid', problem: 'impossible_date' })
    for (const text of ['15.03.24', '10-20', 'Jan 5 2024', '2024', 'unknown']) {
      expect(parseImportDate(text)).toEqual({ kind: 'invalid', problem: 'unrecognised' })
    }
    expect(parseImportDate(new Date(Number.NaN))).toEqual({ kind: 'invalid', problem: 'unrecognised' })
  })

  it('reads numbers as Excel 1900-system serials within 1900–2119', () => {
    expect(excelSerialToDate(1)).toEqual(utc(1900, 1, 1))
    expect(excelSerialToDate(59)).toEqual(utc(1900, 2, 28))
    expect(excelSerialToDate(61)).toEqual(utc(1900, 3, 1))
    expect(dateOf(45000)).toEqual(utc(2023, 3, 15))
    expect(dateOf(80000)).toEqual(utc(2119, 1, 11))
    expect(excelSerialToDate(60)).toBeNull()
    for (const n of [80001, 45000 * 1000, Number.NaN]) {
      expect(parseImportDate(n)).toEqual({ kind: 'invalid', problem: 'implausible_serial' })
    }
  })

  it('applies a plausibility floor to measurement dates and rejects bare years', () => {
    // Lab and event dates: serials before 10000 (1927-05-18) are not plausible.
    expect(dateOf(10000)).toEqual(utc(1927, 5, 18))
    for (const n of [0, -5, 1, 61, 5000, 9999]) {
      expect(parseImportDate(n)).toEqual({ kind: 'invalid', problem: 'implausible_serial' })
    }
    expect(parseImportDate(2024)).toEqual({ kind: 'invalid', problem: 'bare_year' })
  })

  it('accepts old birth dates but still rejects numbers that look like a year', () => {
    expect(parseImportDate(61, 'birth')).toEqual({ kind: 'date', date: utc(1900, 3, 1), via: 'excel-serial' })
    expect(parseImportDate(60, 'birth')).toEqual({ kind: 'invalid', problem: 'excel_leap_day' })
    expect(parseImportDate(1980, 'birth')).toEqual({ kind: 'invalid', problem: 'bare_year' })
    expect(parseImportDate(0, 'birth')).toEqual({ kind: 'invalid', problem: 'implausible_serial' })
  })

  it('names month-first slash dates', () => {
    expect(parseImportDate('01/13/2024')).toEqual({ kind: 'invalid', problem: 'month_first' })
    expect(parseImportDate('31/02/2024')).toEqual({ kind: 'invalid', problem: 'impossible_date' })
  })
})
