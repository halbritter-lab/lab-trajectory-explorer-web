import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { findKdigoAkiEpisodes } from '../../../src/core/domains/nephrology/aki/kdigo'
import { episodesForSeries, sameDayUnorderedCreatinine } from '../../../src/core/domains/nephrology/aki/akiAware'
import { loadLabRows } from '../../../src/core/parse/loader'
import { readWorkbook } from '../../../src/io/readWorkbook'
import type { SeriesPoint } from '../../../src/core/stats/series'
import type { LabRow } from '../../../src/core/types'

// Decision of 2026-11-21 (issue #34, K26): the time of day orders the values of
// one day; values whose order within the day is unknown are compared with
// earlier values only. Windows stay in calendar days.

const HOUR = 3_600_000
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const day = (date: Date) => date.toISOString().slice(0, 10)
const p = (date: string, value: number, hour?: number): SeriesPoint => ({ date: d(date), value, ...(hour === undefined ? {} : { timeOfDay: hour * HOUR }) })
const summary = (points: SeriesPoint[]) => findKdigoAkiEpisodes(points).map((e) => ({
  onset: day(e.date), baseline: e.baselineValue, baselineDate: day(e.baselineDate), peak: e.peakValue, stage: e.stage, stageValue: e.stageValue,
}))
/** The same result for the points as given and in reverse row order. */
function bothOrders(points: SeriesPoint[]) {
  const forward = summary(points)
  expect(summary([...points].reverse())).toEqual(forward)
  return forward
}

describe('values of one day with a time of day', () => {
  it('reads a fall within the day as a fall, in either row order', () => {
    // Before: newest row first gave AKI I with baseline 1.0 and peak 1.4 on 2026-09-01.
    expect(bothOrders([p('2026-09-01', 1.4, 6), p('2026-09-01', 1.0, 20), p('2026-09-02', 0.9, 6)])).toEqual([])
  })
  it('detects a rise within the day, in either row order', () => {
    // Before: newest row first gave no episode.
    expect(bothOrders([p('2026-09-01', 1.0, 6), p('2026-09-01', 1.6, 20), p('2026-09-04', 1.2, 6)])).toEqual([
      { onset: '2026-09-01', baseline: 1.0, baselineDate: '2026-09-01', peak: 1.6, stage: 1, stageValue: 1.6 },
    ])
  })
  it('keeps the windows in calendar days: 50 hours apart on dates two days apart is inside 48 hours', () => {
    expect(bothOrders([p('2026-09-01', 1.0, 5), p('2026-09-03', 1.3, 7)])).toMatchObject([{ onset: '2026-09-03', baseline: 1.0, peak: 1.3, stage: 1 }])
    // Also 50 hours apart, but on dates three days apart: outside.
    expect(bothOrders([p('2026-09-01', 1.0, 23), p('2026-09-04', 1.3, 1)])).toEqual([])
  })
  it('does not compare two values of the same time with each other', () => {
    expect(bothOrders([p('2026-09-01', 1.0, 6), p('2026-09-01', 1.6, 6)])).toEqual([])
    // Both are compared with the earlier value of the day.
    expect(bothOrders([p('2026-09-01', 1.0, 6), p('2026-09-01', 1.2, 20), p('2026-09-01', 1.6, 20)])).toEqual([
      { onset: '2026-09-01', baseline: 1.0, baselineDate: '2026-09-01', peak: 1.6, stage: 1, stageValue: 1.6 },
    ])
  })
})

describe('values of one day without a time of day', () => {
  it('compares them with earlier days only, in either row order', () => {
    // Before: 1.0 then 1.4 in the file gave AKI I, 1.4 then 1.0 gave none.
    expect(bothOrders([p('2026-09-01', 1.4), p('2026-09-01', 1.0), p('2026-09-02', 0.9)])).toEqual([])
    expect(bothOrders([p('2026-09-01', 1.0), p('2026-09-01', 1.6), p('2026-09-04', 1.2)])).toEqual([])
  })
  it('detects a rise against the day before, with every value of the day', () => {
    expect(bothOrders([p('2026-09-01', 1.0), p('2026-09-02', 1.1), p('2026-09-02', 1.5)])).toEqual([
      { onset: '2026-09-02', baseline: 1.0, baselineDate: '2026-09-01', peak: 1.5, stage: 1, stageValue: 1.5 },
    ])
  })
  it('keeps every value of the day as a baseline for later days (no daily maximum)', () => {
    // With the daily maximum 1.4 as the only value of 2026-09-01 there would be no episode.
    expect(bothOrders([p('2026-09-01', 1.4), p('2026-09-01', 1.0), p('2026-09-02', 1.3)])).toEqual([
      { onset: '2026-09-02', baseline: 1.0, baselineDate: '2026-09-01', peak: 1.3, stage: 1, stageValue: 1.3 },
    ])
  })
  it('treats a day as without time when one of its values has none', () => {
    expect(bothOrders([p('2026-09-01', 1.0, 6), p('2026-09-01', 1.6)])).toEqual([])
    expect(bothOrders([p('2026-09-01', 1.0, 6), p('2026-09-01', 1.6, 20), p('2026-09-01', 1.1)])).toEqual([])
    // Other days of the series keep their time order.
    expect(bothOrders([p('2026-09-01', 1.0, 6), p('2026-09-01', 1.1), p('2026-09-02', 1.0, 6), p('2026-09-02', 1.6, 20)]))
      .toMatchObject([{ onset: '2026-09-02', baseline: 1.0, peak: 1.6 }])
  })
  it('names the lowest value that reaches the stage, whatever the row order', () => {
    // Both crossings are stage I against 1.0; the staging value was the first row before.
    expect(bothOrders([p('2026-09-01', 1.0), p('2026-09-02', 1.7), p('2026-09-02', 1.5)])).toEqual([
      { onset: '2026-09-02', baseline: 1.0, baselineDate: '2026-09-01', peak: 1.7, stage: 1, stageValue: 1.5 },
    ])
  })
  it('leaves series with one value per day unchanged', () => {
    const points = [p('2020-01-01', 1.0), p('2020-01-02', 1.6), p('2020-01-03', 2.1)]
    expect(bothOrders(points)).toEqual(bothOrders(points.map((point, i) => ({ ...point, timeOfDay: (i + 1) * HOUR }))))
    expect(bothOrders(points)).toEqual([{ onset: '2020-01-02', baseline: 1.0, baselineDate: '2020-01-01', peak: 2.1, stage: 2, stageValue: 2.1 }])
  })
})

// The review files (newest row first, and their ascending twins), through the real reader and loader.
const HEADER = 'patientId,labDate,testName,unit,value'
const TIMED = [
  'FALL,2026-09-02 06:00,Kreatinin,mg/dl,0.9', 'FALL,2026-09-01 20:00,Kreatinin,mg/dl,1.0', 'FALL,2026-09-01 06:00,Kreatinin,mg/dl,1.4',
  'RISE,2026-09-04 06:00,Kreatinin,mg/dl,1.2', 'RISE,2026-09-01 20:00,Kreatinin,mg/dl,1.6', 'RISE,2026-09-01 06:00,Kreatinin,mg/dl,1.0',
]
const UNTIMED = TIMED.map((line) => line.replace(/ \d\d:\d\d/, ''))
const NEXT_DAY = ['NEXT,2026-09-02,Kreatinin,mg/dl,1.3', 'NEXT,2026-09-01,Kreatinin,mg/dl,1.0', 'NEXT,2026-09-01,Kreatinin,mg/dl,1.4']
const csvRows = (lines: string[]): LabRow[] => loadLabRows(readWorkbook(new TextEncoder().encode([HEADER, ...lines].join('\n'))))
const episodes = (rows: LabRow[], patientId: string) => episodesForSeries(rows, patientId, 'Kreatinin', 'mg/dl')
  .map((e) => `${day(e.date)} stage ${e.stage}, baseline ${e.baselineValue} on ${day(e.baselineDate)}, peak ${e.peakValue}`)

describe('imported files with several creatinine values per day', () => {
  it.each([['newest row first', (lines: string[]) => lines], ['oldest row first', (lines: string[]) => [...lines].reverse()]])('gives the same episodes with %s', (_name, order) => {
    const timed = csvRows(order(TIMED))
    expect(episodes(timed, 'FALL')).toEqual([])
    expect(episodes(timed, 'RISE')).toEqual(['2026-09-01 stage 1, baseline 1 on 2026-09-01, peak 1.6'])
    const untimed = csvRows(order(UNTIMED))
    expect(episodes(untimed, 'FALL')).toEqual([])
    expect(episodes(untimed, 'RISE')).toEqual([])
    expect(episodes(csvRows(order(NEXT_DAY)), 'NEXT')).toEqual(['2026-09-02 stage 1, baseline 1 on 2026-09-01, peak 1.3'])
  })

  it('keeps the calendar day as the lab date and the time as a sort key only', () => {
    const [fall] = csvRows(TIMED)
    expect(fall.labDatum).toEqual(d('2026-09-02'))
    expect(fall.labTime).toBe(6 * HOUR)
    expect(csvRows(UNTIMED).every((row) => !('labTime' in row))).toBe(true)
  })

  it('reads workbook date cells, serial numbers and text alike', () => {
    const sheet = (dates: unknown[]) => {
      const ws = XLSX.utils.json_to_sheet([1.0, 1.6, 1.2].map((value, i) => ({ patientId: 'RISE', labDate: dates[i], testName: 'Kreatinin', unit: 'mg/dl', value })).reverse(), { cellDates: true })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'labs')
      return loadLabRows(readWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer))
    }
    const text = csvRows(TIMED).filter((row) => row.patientId === 'RISE')
    const key = (rows: LabRow[]) => rows.map((row) => [day(row.labDatum!), row.labTime, row.wertNum])
    // Local time, as SheetJS writes and reads workbook dates.
    const cells = sheet([new Date(2026, 8, 1, 6, 0), new Date(2026, 8, 1, 20, 0), new Date(2026, 8, 4, 6, 0)])
    // 2026-09-01 is serial 46266; 0.25 is 06:00, 20/24 is 20:00.
    const serials = sheet([46266.25, 46266 + 20 / 24, 46269.25])
    expect(key(cells)).toEqual(key(text))
    expect(key(serials)).toEqual(key(text))
    expect(episodes(cells, 'RISE')).toEqual(['2026-09-01 stage 1, baseline 1 on 2026-09-01, peak 1.6'])
    expect(episodes(serials, 'RISE')).toEqual(['2026-09-01 stage 1, baseline 1 on 2026-09-01, peak 1.6'])
    // Date-only cells: no time of day, so no comparison within the day.
    const dateOnly = sheet([new Date(2026, 8, 1), new Date(2026, 8, 1), new Date(2026, 8, 4)])
    expect(dateOnly.every((row) => !('labTime' in row))).toBe(true)
    expect(episodes(dateOnly, 'RISE')).toEqual([])
  })
})

describe('workbook date cells outside UTC', () => {
  const zone = process.env.TZ
  beforeAll(() => { process.env.TZ = 'Europe/Berlin' })
  afterAll(() => { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone })

  it('reads a time that does not exist in the local zone like the same text and serial', () => {
    // 29 March 2026 has no 02:30 in Europe/Berlin; read through local time it became 03:30,
    // after the 03:15 value, and the fall from 1.6 to 1.0 was reported as a stage 1 episode.
    expect(new Date(2026, 2, 29, 2, 30).getHours()).toBe(3)
    const values = [1.6, 1.0, 0.9]
    // 46110 is 2026-03-29.
    const serials = [46110 + 2.5 / 24, 46110 + 3.25 / 24, 46111.25]
    const sheet = (asDateCell: boolean) => {
      const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet([['patientId', 'labDate', 'testName', 'unit', 'value'], ...values.map((value) => ['DST', null, 'Kreatinin', 'mg/dl', value])])
      serials.forEach((serial, i) => { ws[`B${i + 2}`] = { t: 'n', v: serial, ...(asDateCell ? { z: 'dd/mm/yyyy hh:mm' } : {}) } })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'labs')
      return loadLabRows(readWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer))
    }
    const text = csvRows(['DST,2026-03-29 02:30,Kreatinin,mg/dl,1.6', 'DST,2026-03-29 03:15,Kreatinin,mg/dl,1.0', 'DST,2026-03-30 06:00,Kreatinin,mg/dl,0.9'])
    const key = (rows: LabRow[]) => rows.map((row) => [day(row.labDatum!), row.labTime, row.wertNum])
    expect(key(text)).toEqual([['2026-03-29', 2.5 * HOUR, 1.6], ['2026-03-29', 3.25 * HOUR, 1.0], ['2026-03-30', 6 * HOUR, 0.9]])
    expect(key(sheet(true))).toEqual(key(text))
    expect(key(sheet(false))).toEqual(key(text))
    expect(episodes(sheet(true), 'DST')).toEqual([])
    expect(episodes(text, 'DST')).toEqual([])
  })
})

describe('sameDayUnorderedCreatinine', () => {
  it('counts patient-days whose creatinine values cannot be ordered', () => {
    expect(sameDayUnorderedCreatinine(csvRows(TIMED))).toEqual({ patientDays: 0, patients: 0 })
    expect(sameDayUnorderedCreatinine(csvRows(UNTIMED))).toEqual({ patientDays: 2, patients: 2 })
    expect(sameDayUnorderedCreatinine(csvRows([...UNTIMED, ...NEXT_DAY]))).toEqual({ patientDays: 3, patients: 3 })
  })
  it('counts a shared time and a day with one untimed value, and ignores other analytes, bounds and non-positive values', () => {
    const rows = csvRows([
      'A,2026-09-01 06:00,Kreatinin,mg/dl,1.0', 'A,2026-09-01 06:00,Kreatinin,mg/dl,1.2',
      'A,2026-09-02 06:00,Kreatinin,mg/dl,1.0', 'A,2026-09-02,Kreatinin,mg/dl,1.2',
      'A,2026-09-03,Kreatinin,mg/dl,1.0', 'A,2026-09-03,Kreatinin,mg/dl,<0.3', 'A,2026-09-03,Kreatinin,mg/dl,0',
      'A,2026-09-04,Kreatinin,mg/dl,1.0', 'A,2026-09-04,Kreatinin im Urin,mg/dl,80',
      'A,2026-09-05,CRP,mg/l,3', 'A,2026-09-05,CRP,mg/l,4',
      'B,2026-09-01,Kreatinin,mg/dl,1.0', 'B,2026-09-02,Kreatinin,mg/dl,1.1',
    ])
    expect(sameDayUnorderedCreatinine(rows)).toEqual({ patientDays: 2, patients: 1 })
  })
})
