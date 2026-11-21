import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readWorkbook, readWorkbookSheets } from '../../src/io/readWorkbook'

function makeXlsxBuffer(rows: Record<string, unknown>[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('readWorkbook', () => {
  it('reads xlsx rows as header-keyed objects', () => {
    const buf = makeXlsxBuffer([
      { PatientID: 1, Bezeichnung: 'Kreatinin', Wert: '1.2' },
      { PatientID: 1, Bezeichnung: 'Kreatinin', Wert: '1.4' },
    ])
    const rows = readWorkbook(buf)
    expect(rows).toHaveLength(2)
    expect(rows[0].PatientID).toBe(1)
    expect(rows[0].Bezeichnung).toBe('Kreatinin')
    expect(rows[1].Wert).toBe('1.4')
  })

  it('keeps the calendar day and the clock time of a workbook date cell, written as UTC', () => {
    // SheetJS writes and reads Date cells in local time.
    const ws = XLSX.utils.json_to_sheet([
      { labDate: new Date(2026, 8, 1) }, { labDate: new Date(2026, 8, 1, 6, 0) }, { labDate: new Date(2026, 8, 1, 20, 0) }, { labDate: new Date(2026, 8, 1, 23, 59, 59) },
    ], { cellDates: true })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const rows = readWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    expect(rows.map((row) => (row.labDate as Date).toISOString())).toEqual([
      '2026-09-01T00:00:00.000Z', '2026-09-01T06:00:00.000Z', '2026-09-01T20:00:00.000Z', '2026-09-01T23:59:59.000Z',
    ])
  })

  describe('in a time zone with daylight saving time', () => {
    const zone = process.env.TZ
    beforeAll(() => { process.env.TZ = 'Europe/Berlin' })
    afterAll(() => { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone })

    it('reads the clock time of a date cell as written, also where that time does not exist locally', () => {
      // 02:30 on 29 March 2026 does not exist in Europe/Berlin: local time reads it as 03:30.
      expect(new Date(2026, 2, 29, 2, 30).getHours()).toBe(3)
      // Cells written by serial number, so that the file does not depend on the zone:
      // 46110 is 2026-03-29, 46320 is 2026-10-25 (the hour that occurs twice), 44283 is 2021-03-28.
      const cells = [
        [46110 + 2.5 / 24, '2026-03-29T02:30:00.000Z'], [46110 + 3.25 / 24, '2026-03-29T03:15:00.000Z'], [46110, '2026-03-29T00:00:00.000Z'],
        [46111.25, '2026-03-30T06:00:00.000Z'], [46320 + 2.5 / 24, '2026-10-25T02:30:00.000Z'], [44283 + 2.5 / 24, '2021-03-28T02:30:00.000Z'],
        [46266 + 86399.7 / 86400, '2026-09-01T23:59:59.000Z'],
      ] as const
      for (const bookType of ['xlsx', 'xls', 'xlsb'] as const) {
        const ws: XLSX.WorkSheet = { A1: { t: 's', v: 'labDate' }, '!ref': `A1:A${cells.length + 1}` }
        cells.forEach(([serial], i) => { ws[`A${i + 2}`] = { t: 'n', v: serial, z: 'dd/mm/yyyy hh:mm:ss' } })
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
        const rows = readWorkbook(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer)
        expect(rows.map((row) => (row.labDate as Date).toISOString()), bookType).toEqual(cells.map(([, iso]) => iso))
      }
    })
  })

  it('returns an empty array for an empty sheet', () => {
    const buf = makeXlsxBuffer([])
    expect(readWorkbook(buf)).toEqual([])
  })

  it('inspects sheet names and reads rows from specific sheets', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ patientId: 1 }]), 'labs')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ patientId: 1, type: 'dialysis' }]), 'events')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const inspected = readWorkbookSheets(buf)
    expect(inspected.sheetNames).toEqual(['labs', 'events'])
    expect(inspected.getSheet('labs')).toEqual([{ patientId: 1 }])
    expect(inspected.getSheet('events')).toEqual([{ patientId: 1, type: 'dialysis' }])
    expect(inspected.getSheet('nonexistent')).toEqual([])
  })
})

