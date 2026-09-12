import { describe, it, expect } from 'vitest'
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

