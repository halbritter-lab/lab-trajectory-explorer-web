import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readWorkbook } from '../../src/io/readWorkbook'
import { loadDatasetFromWorkbook } from '../../src/io/loadDataset'
import { normalizeClinicalEventsWithNotes } from '../../src/core/events/events'

/**
 * Regression tests for the import path as a user hits it: bytes of a CSV or
 * XLSX file go through the real `readWorkbook` / `loadDatasetFromWorkbook`.
 * Earlier tests handed already-typed rows to the loader and so never saw
 * SheetJS turning "1,5" into 15 or "0012" into 12.
 */

function bytes(text: string, { bom = false } = {}): ArrayBuffer {
  const body = new TextEncoder().encode(text)
  const out = new Uint8Array(body.length + (bom ? 3 : 0))
  if (bom) out.set([0xef, 0xbb, 0xbf])
  out.set(body, bom ? 3 : 0)
  return out.buffer
}

function latin1(text: string): ArrayBuffer {
  return Uint8Array.from([...text].map((ch) => ch.charCodeAt(0))).buffer
}

function xlsx(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const HEADER = 'patientId;labDate;testName;unit;value'

describe('CSV import keeps text for our own parsers', () => {
  it('reads decimal commas in a semicolon CSV as decimals, keeping the raw value', () => {
    const { rows } = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;15.01.2024;Kreatinin;mg/dl;1,5\n1;15.02.2024;Kreatinin;mg/dl;1,10\n`))
    expect(rows.map((r) => r.wertNum)).toEqual([1.5, 1.1])
    expect(rows.map((r) => r.wert)).toEqual(['1,5', '1,10'])
  })

  it('treats a CSV whose first header starts with "PK" as text, not as a zip file', () => {
    const { rows } = loadDatasetFromWorkbook(bytes('PKcol;patientId;labDate;testName;unit;value\nx;0012;15.01.2024;Krea;mg/dl;1,5\n'))
    expect(rows.map((r) => [r.patientId, r.wertNum])).toEqual([['0012', 1.5]])
  })

  it('reads a quoted decimal comma in a comma CSV as a decimal', () => {
    const { rows } = loadDatasetFromWorkbook(bytes('patientId,labDate,testName,unit,value\n1,2024-01-15,Kreatinin,mg/dl,"1,5"\n'))
    expect(rows[0].wertNum).toBe(1.5)
    expect(rows[0].wert).toBe('1,5')
  })

  it('keeps leading-zero patient IDs distinct from their numeric twin', () => {
    const { rows } = loadDatasetFromWorkbook(bytes(`${HEADER}\n0012;2024-01-15;Kreatinin;mg/dl;1,2\n12;2024-01-15;Kreatinin;mg/dl;1,3\n`))
    expect(rows.map((r) => r.patientId)).toEqual(['0012', 12])
  })

  it('leaves ranges and fractions as unparsed values instead of dates', () => {
    const { rows } = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;2024-01-15;Leukozyten;/µl;10-20\n1;2024-01-15;Ratio;;3/4\n`))
    expect(rows.map((r) => [r.wert, r.wertNum, r.wertOperator])).toEqual([
      ['10-20', null, 'range'],
      ['3/4', null, 'unparseable'],
    ])
  })

  it.each([false, true])('reads UTF-8 text correctly (BOM: %s)', (bom) => {
    const { rows } = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;2024-01-15;Kreatinin;µmol/l;88\n`, { bom }))
    expect(rows).toHaveLength(1)
    expect(rows[0].patientId).toBe(1)
    expect(rows[0].einheit).toBe('µmol/l')
  })

  it('falls back to Windows-1252 for CSV files that are not valid UTF-8', () => {
    const { rows } = loadDatasetFromWorkbook(latin1(`${HEADER}\n1;2024-01-15;Kreatinin;µmol/l;88\n`))
    expect(rows[0].einheit).toBe('µmol/l')
  })

  it('keeps xlsx text cells and real date cells working', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['patientId', 'labDate', 'testName', 'unit', 'value'],
      ['0012', new Date(2024, 0, 15), 'Kreatinin', 'mg/dl', '1,2'],
    ], { cellDates: true })
    XLSX.utils.book_append_sheet(wb, ws, 'labs')
    const { rows } = loadDatasetFromWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
    expect(rows[0].patientId).toBe('0012')
    expect(rows[0].labDatum).toEqual(utc(2024, 1, 15))
    expect(rows[0].wertNum).toBe(1.2)
  })

  it('takes typed numeric xlsx value cells as they are', () => {
    // Since 2026-10-07 (OD-8) the text "1.234" is read as a decimal too, with
    // a sheet-level warning; the typed cell needs no warning.
    const { rows, diagnostics } = loadDatasetFromWorkbook(xlsx({
      labs: [['patientId', 'labDate', 'testName', 'unit', 'value'], [1, '2024-01-15', 'Kreatinin', 'mg/dl', 1.234], [1, '2024-01-16', 'Kreatinin', 'mg/dl', '1.234']],
    }))
    expect(rows.map((r) => [r.wert, r.wertNum, r.wertOperator])).toEqual([['1.234', 1.234, '='], ['1.234', 1.234, '=']])
    expect(diagnostics.filter((d) => d.reason.includes('after a point')).map((d) => d.reason)).toEqual([
      '1 value with three digits after a point, "1.234", was read as a decimal; check that the point is not a thousands separator.',
    ])
  })
})

describe('dates', () => {
  it('reads dd/mm/yyyy day-first and says so in the diagnostics', () => {
    const data = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;03/01/2024;Kreatinin;mg/dl;1,2\n1;13/01/2024;Kreatinin;mg/dl;1,3\n`))
    expect(data.rows.map((r) => r.labDatum)).toEqual([utc(2024, 1, 3), utc(2024, 1, 13)])
    expect(data.diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', reason: expect.stringMatching(/2 lab dates.*day-first/) }),
    ])
  })

  it('reads ISO dates with a time component as that calendar day', () => {
    const { rows } = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;2024-01-15 23:30;Kreatinin;mg/dl;1,2\n`))
    expect(rows[0].labDatum).toEqual(utc(2024, 1, 15))
  })

  it('rejects impossible calendar dates with a diagnostic', () => {
    const data = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;2021-02-30;Kreatinin;mg/dl;1,2\n2;15.13.2024;Kreatinin;mg/dl;1,2\n3;01/13/2024;Kreatinin;mg/dl;1,2\n4;2024-01-15;Kreatinin;mg/dl;1,2\n`))
    expect(data.rows.map((r) => r.patientId)).toEqual([4])
    const rejected = data.diagnostics.filter((d) => d.severity === 'rejected')
    expect(rejected.map((d) => d.patientId)).toEqual([1, 2, 3])
    expect(rejected[0].reason).toContain('2021-02-30')
    expect(rejected[2].reason).toBe('Lab date "01/13/2024" is not a valid date: dates with slashes are read day-first (DD/MM/YYYY); US month-first dates are not supported; row not imported.')
  })

  it('keeps rows with an empty date, as before', () => {
    const data = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;;Kreatinin;mg/dl;1,2\n`))
    expect(data.rows).toHaveLength(1)
    expect(data.rows[0].labDatum).toBeNull()
    expect(data.diagnostics).toEqual([])
  })

  it('reads numeric xlsx date cells as Excel serial dates and rejects implausible ones', () => {
    const data = loadDatasetFromWorkbook(xlsx({
      labs: [
        ['patientId', 'labDate', 'testName', 'unit', 'value'],
        [1, 45000, 'Kreatinin', 'mg/dl', 1.2],
        [2, 45000.75, 'Kreatinin', 'mg/dl', 1.2],
        [3, 999999, 'Kreatinin', 'mg/dl', 1.2],
        [4, 2024, 'Kreatinin', 'mg/dl', 1.2],
        [5, 5000, 'Kreatinin', 'mg/dl', 1.2],
      ],
      events: [
        ['patientId', 'type', 'date', 'title'],
        [1, 'other', 45001, 'Visit'],
        [1, 'other', 2024, 'Year only'],
      ],
    }))
    expect(data.rows.map((r) => [r.patientId, r.labDatum])).toEqual([[1, utc(2023, 3, 15)], [2, utc(2023, 3, 15)]])
    expect(data.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ sheet: 'labs', patientId: 3, severity: 'rejected', reason: expect.stringContaining('999999') }),
      expect.objectContaining({ sheet: 'labs', patientId: 4, severity: 'rejected', reason: 'Lab date 2024 is a number that looks like a year, not an Excel date; row not imported.' }),
      expect.objectContaining({ sheet: 'labs', patientId: 5, severity: 'rejected', reason: expect.stringContaining('outside the accepted Excel date range (10000–80000, years 1927–2119)') }),
      expect.objectContaining({ sheet: 'labs', severity: 'warning', reason: '2 lab dates stored as numbers were read as Excel serial dates (1900 date system).' }),
      expect.objectContaining({ sheet: 'events', severity: 'warning', reason: '1 event date stored as a number was read as an Excel serial date (1900 date system).' }),
      expect.objectContaining({ sheet: 'events', patientId: 1, severity: 'rejected', reason: 'Event date 2024 is a number that looks like a year, not an Excel date; row not imported.' }),
    ]))
    expect(data.events.map((e) => e.date)).toEqual([utc(2023, 3, 16)])
  })

  it('reads five-digit serial numbers in CSV text but rejects bare years', () => {
    const data = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;45000;Kreatinin;mg/dl;1,2\n2;2024;Kreatinin;mg/dl;1,2\n`))
    expect(data.rows.map((r) => [r.patientId, r.labDatum])).toEqual([[1, utc(2023, 3, 15)]])
    expect(data.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ patientId: 2, severity: 'rejected', reason: expect.stringContaining('"2024"') }),
    ]))
  })

  it('rejects impossible event dates and notes day-first event dates', () => {
    const data = loadDatasetFromWorkbook(xlsx({
      labs: [['patientId', 'labDate', 'testName', 'unit', 'value'], [1, '2024-01-15', 'Kreatinin', 'mg/dl', '1,2']],
      events: [
        ['patientId', 'type', 'date', 'title'],
        [1, 'other', '2021-02-30', 'Impossible'],
        [1, 'other', '03/01/2024', 'Visit'],
      ],
    }))
    expect(data.events.map((e) => e.date)).toEqual([utc(2024, 1, 3)])
    expect(data.diagnostics).toEqual(expect.arrayContaining([
      { sheet: 'events', patientId: 1, severity: 'rejected', reason: 'Event date "2021-02-30" is not a valid calendar date; row not imported.' },
      expect.objectContaining({ sheet: 'events', severity: 'warning', reason: expect.stringMatching(/1 event date.*day-first/) }),
    ]))
  })

  it('reads a CSV event file with text dates through the real reader', () => {
    const raw = readWorkbook(bytes('patientId;type;date;title;endDate;intent\n0012;dialysis;03/01/2024;Start;17.01.2024;acute\n'))
    const { events, dateReads } = normalizeClinicalEventsWithNotes(raw)
    expect(events[0]).toMatchObject({ patientId: '0012', date: utc(2024, 1, 3), endDate: utc(2024, 1, 17) })
    expect(dateReads.dayFirst).toBe(1)
  })
})

describe('import diagnostics', () => {
  it('reports exact duplicate rows but keeps counting them', () => {
    const data = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;2024-01-15;Kreatinin;mg/dl;1,2\n1;2024-01-15;Kreatinin;mg/dl;1,2\n1;2024-01-15;Kreatinin;mg/dl;1,2\n2;2024-01-15;Kreatinin;mg/dl;1,2\n2;2024-01-15;Kreatinin;mg/dl;1,2\n3;2024-01-15;Kreatinin;mg/dl;1,2\n`))
    expect(data.rows).toHaveLength(6)
    expect(data.diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', patientId: null, reason: expect.stringMatching(/3 duplicate lab rows.*2 patients/) }),
    ])
  })

  it('counts censored values per parameter without changing them', () => {
    const data = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;2024-01-15;Kreatinin;mg/dl;<0,3\n1;2024-02-15;Kreatinin;mg/dl;1,2\n2;2024-01-15;eGFR;ml/min;>90\n2;2024-02-15;eGFR;ml/min;> 90\n`))
    expect(data.rows[0]).toMatchObject({ wertNum: 0.3, wertOperator: '<', wert: '<0,3' })
    const reasons = data.diagnostics.map((d) => d.reason)
    expect(reasons).toEqual(expect.arrayContaining([
      'Kreatinin [mg/dl]: 1 censored value (1 "<"); retained for display and raw counts, excluded from fits, endpoints and AKI detection.',
      expect.stringMatching(/eGFR \[ml\/min\].*2 censored values/),
    ]))
  })

  it('merges unit spellings that differ only in case, micro sign or spacing', () => {
    const data = loadDatasetFromWorkbook(bytes(`${HEADER}
1;2024-01-15;Kreatinin;mg/dl;1,2
1;2024-02-15;Kreatinin;mg/dl;1,3
1;2024-03-15;Kreatinin;mg/dL;1,4
1;2024-01-15;Kreatinin;µmol/l;100
1;2024-02-15;Kreatinin;umol/L;110
1;2024-03-15;Kreatinin;μmol / l;120
1;2024-03-15;Kreatinin;µmol/l;130
1;2024-03-15;Harnstoff;mg/dL;30
`))
    const units = (name: string) => [...new Set(data.rows.filter((r) => r.bezeichnung === name).map((r) => r.einheit))]
    expect(units('Kreatinin')).toEqual(['mg/dl', 'µmol/l'])
    // A sole spelling is left exactly as imported.
    expect(units('Harnstoff')).toEqual(['mg/dL'])
    const reasons = data.diagnostics.map((d) => d.reason)
    expect(reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/Kreatinin.*"mg\/dL" \(1\).*merged as "mg\/dl"/),
      expect.stringMatching(/Kreatinin.*"umol\/L" \(1\).*merged as "µmol\/l"/),
    ]))
  })

  it('prefers the micro-sign spelling when unit spellings are equally frequent', () => {
    const data = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;2024-01-15;Kreatinin;umol/l;100\n1;2024-02-15;Kreatinin;µmol/l;110\n`))
    expect(data.rows.map((r) => r.einheit)).toEqual(['µmol/l', 'µmol/l'])
  })

  it('keeps units apart whose case changes an SI prefix', () => {
    const data = loadDatasetFromWorkbook(bytes(`${HEADER}\n1;2024-01-15;Insulin;mU/l;10\n1;2024-01-15;Insulin;MU/l;10\n1;2024-01-15;Leukozyten;G/l;6\n1;2024-01-15;Leukozyten;g/l;6\n`))
    expect(data.rows.map((r) => r.einheit)).toEqual(['mU/l', 'MU/l', 'G/l', 'g/l'])
    expect(data.diagnostics).toEqual([])
  })

  it('warns about decimal commas that could be thousands separators', () => {
    const data = loadDatasetFromWorkbook(bytes('patientId,labDate,testName,unit,value\n1,2024-01-15,Thrombozyten,/nl,"1,234"\n1,2024-02-15,Thrombozyten,/nl,"<1,500"\n1,2024-03-15,Thrombozyten,/nl,"1,5"\n'))
    expect(data.rows.map((r) => r.wertNum)).toEqual([1.234, 1.5, 1.5])
    expect(data.diagnostics.map((d) => d.reason)).toContain(
      '2 values with three digits after a comma, such as "1,234", were read as decimals (1.234); check that the comma is not a thousands separator.',
    )
  })

  it('reports unreadable and day-first birth dates in the attributes sheet', () => {
    const data = loadDatasetFromWorkbook(xlsx({
      labs: [['patientId', 'labDate', 'testName', 'unit', 'value'], [1, '2024-01-15', 'Kreatinin', 'mg/dl', '1,2'], [2, '2024-01-15', 'Kreatinin', 'mg/dl', '1,2']],
      attributes: [['patientId', 'birthDate'], [1, '31.02.1980'], [2, '03/02/1980']],
    }))
    expect(data.patientAttributes['1']).toEqual({ birthDate: '31.02.1980' })
    expect(data.diagnostics).toEqual([
      { sheet: 'attributes', patientId: 1, severity: 'warning', reason: 'Birth date "31.02.1980" is not a valid calendar date; it is ignored.' },
      { sheet: 'attributes', patientId: null, severity: 'warning', scope: 'sheet', reason: '1 birth date written as DD/MM/YYYY was read day-first (03/01/2024 = 3 January 2024).' },
    ])
  })

  it('names missing and found columns when required columns are absent', () => {
    expect(() => loadDatasetFromWorkbook(bytes('patientId;labDate;Analyt\n1;2024-01-15;Kreatinin\n'))).toThrow(
      /missing required column\(s\): testName, unit, value\..*Columns found: patientId, labDate, Analyt\./,
    )
  })
})
