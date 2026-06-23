import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { rowsToXlsxBytes, sheetsToXlsxBytes, zipBytes, svgElementToString } from '../../src/io/export'
import { readWorkbook } from '../../src/io/readWorkbook'
import { unzipSync, strFromU8 } from 'fflate'

describe('rowsToXlsxBytes', () => {
  it('round-trips rows through xlsx', () => {
    const bytes = rowsToXlsxBytes([{ a: 1, b: 'x' }, { a: 2, b: 'y' }], 'S1')
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const back = readWorkbook(ab)
    expect(back).toHaveLength(2)
    expect(back[0].a).toBe(1)
    expect(back[1].b).toBe('y')
  })
})

describe('export injection safety', () => {
  it('writes formula-like strings as inert string cells (no formula execution)', () => {
    const bytes = rowsToXlsxBytes([{ a: '=1+1', b: '@cmd', c: '-9+SUM(A1)' }], 'S1')
    const wb = XLSX.read(bytes, { type: 'array' })
    const ws = wb.Sheets['S1']
    for (const ref of ['A2', 'B2', 'C2']) {
      expect(ws[ref].t).toBe('s')
      expect(ws[ref].f).toBeUndefined()
    }
    expect(ws['A2'].v).toBe('=1+1')
  })
})

describe('sheetsToXlsxBytes', () => {
  it('disambiguates duplicate / over-long sheet names instead of throwing', () => {
    const bytes = sheetsToXlsxBytes([
      { name: 'measurements', rows: [{ a: 1 }] },
      { name: 'measurements', rows: [{ a: 2 }] },
    ])
    const wb = XLSX.read(bytes, { type: 'array' })
    expect(wb.SheetNames).toHaveLength(2)
    expect(new Set(wb.SheetNames).size).toBe(2)
  })

  it('sets enough column width for date fields so Excel does not render #######', () => {
    const bytes = sheetsToXlsxBytes([
      { name: 'measurements', rows: [{ PatientID: 1, Datum: '2024-01-15', Bezeichnung: 'Kreatinin' }] },
    ])
    const wb = XLSX.read(bytes, { type: 'array', cellStyles: true })
    const ws = wb.Sheets['measurements']
    expect(ws['!cols']?.[1]?.wch).toBeGreaterThanOrEqual(12)
  })
})

describe('zipBytes', () => {
  it('packs named files into a zip readable back', () => {
    const z = zipBytes({ 'hello.txt': new TextEncoder().encode('hi'), 'n.txt': new TextEncoder().encode('123') })
    const files = unzipSync(z)
    expect(strFromU8(files['hello.txt'])).toBe('hi')
    expect(strFromU8(files['n.txt'])).toBe('123')
  })
})

describe('patient bundle zip', () => {
  it('packs the workbook and chart SVGs together, workbook readable back from the archive', () => {
    const wbBytes = sheetsToXlsxBytes([
      { name: 'measurements', rows: [{ PatientID: 1, Bezeichnung: 'Kreatinin', WertNum: 1.5 }] },
    ])
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '20')
    const files = {
      'patient-1.xlsx': wbBytes,
      'Kreatinin.svg': new TextEncoder().encode(svgElementToString(svg)),
    }
    const z = zipBytes(files)
    const back = unzipSync(z)
    // Both members present
    expect(Object.keys(back).sort()).toEqual(['Kreatinin.svg', 'patient-1.xlsx'])
    // SVG content survives
    expect(strFromU8(back['Kreatinin.svg'])).toContain('<svg')
    // The xlsx member is still a valid workbook when read back out of the zip
    const rows = readWorkbook(back['patient-1.xlsx']) as { Bezeichnung: string; WertNum: number }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ Bezeichnung: 'Kreatinin', WertNum: 1.5 })
  })
})

describe('svgElementToString', () => {
  it('serialises an svg element with the xmlns', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '10')
    const s = svgElementToString(svg)
    expect(s).toContain('<svg')
    expect(s).toContain('xmlns="http://www.w3.org/2000/svg"')
  })
})
