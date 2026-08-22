import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readWorkbook } from '../../src/io/readWorkbook'
import { loadLabRows, REQUIRED_COLUMNS } from '../../src/core/parse/loader'
import { normalizePatientAttributes } from '../../src/core/attributes/attributes'
import { normalizeClinicalEvents } from '../../src/core/events/events'

/**
 * The shipped templates are the first thing a new user fills in, so a template
 * whose headers have drifted from the parsers is worse than shipping none. Each
 * test fills the template with one row and pushes it through the real parser.
 */
function templateHeaders(name: string): string[] {
  const text = readFileSync(resolve(__dirname, `../../public/${name}`), 'utf8')
  return text.split(/\r?\n/)[0].split(',').map((h) => h.trim())
}

function rowFrom(headers: string[], values: Record<string, unknown>) {
  return Object.fromEntries(headers.map((h) => [h, values[h] ?? null]))
}

describe('shipped upload templates', () => {
  it('labs template carries every required column', () => {
    const headers = templateHeaders('template_labs.csv')
    for (const required of REQUIRED_COLUMNS) expect(headers).toContain(required)
  })

  it('a filled-in labs template parses', () => {
    const headers = templateHeaders('template_labs.csv')
    const rows = loadLabRows([rowFrom(headers, {
      patientId: 1,
      labDate: '2024-01-15',
      testName: 'Creatinine',
      unit: 'mg/dl',
      value: '1,2',
      loinc: '2160-0',
      sex: 'female',
      ageAtLab: 46,
    })])
    expect(rows).toHaveLength(1)
    expect(rows[0].wertNum).toBe(1.2)
    expect(rows[0].patientSex).toBe('w')
    expect(rows[0].labDatum?.getUTCDate()).toBe(15)
  })

  it('an empty labs template yields no rows rather than throwing', () => {
    // Downloading the template and uploading it unchanged must reach the
    // "no usable rows" message, not a parser error.
    expect(loadLabRows([])).toEqual([])
  })

  it('a filled-in events template parses', () => {
    const headers = templateHeaders('template_events.csv')
    const normalized = normalizeClinicalEvents([rowFrom(headers, {
      patientId: 1,
      type: 'dialysis',
      date: '2024-04-15',
      title: 'Dialysis start',
      intent: 'chronic',
    })])
    expect(normalized).toHaveLength(1)
    expect(normalized[0].type).toBe('dialysis')
  })

  it('a filled-in attributes template parses and exposes its attribute columns', () => {
    const headers = templateHeaders('template_attributes.csv')
    // Attribute column names are free-form, so the only contract is that the
    // template has patientId plus at least one further column.
    expect(headers[0]).toBe('patientId')
    expect(headers.length).toBeGreaterThan(1)
    const normalized = normalizePatientAttributes([rowFrom(headers, {
      patientId: 1,
      ...Object.fromEntries(headers.slice(1).map((h) => [h, 'x'])),
    })])
    expect(normalized).toHaveLength(1)
    expect(Object.keys(normalized[0].attributes)).toEqual(headers.slice(1))
  })

  it('templates round-trip through the real workbook reader', () => {
    const buf = readFileSync(resolve(__dirname, '../../public/template_labs.csv'))
    const raw = readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    // Header-only CSV: no data rows, and therefore no missing-column error.
    expect(raw).toEqual([])
    expect(loadLabRows(raw)).toEqual([])
  })
})
