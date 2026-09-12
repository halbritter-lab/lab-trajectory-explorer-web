import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readWorkbook } from '../../src/io/readWorkbook'
import { loadLabRows } from '../../src/core/parse/loader'
import { resolveDemographics } from '../../src/core/demographics/resolve'
import { loadDatasetFromWorkbook } from '../../src/ui/data/loadDataset'

describe('shipped demo workbook', () => {
  it('carries demographics that resolve without conflict', () => {
    const file = resolve(__dirname, '../../public/test_labs.xlsx')
    const buf = readFileSync(file)
    const rows = loadLabRows(
      readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    )
    const { rows: resolved, conflicts } = resolveDemographics(rows, {}, {})
    expect(conflicts).toEqual([])
    // The guarantee, exercised on the file we actually ship.
    expect(resolved).toBe(rows)
  })

  it('loads as a complete 3-sheet workbook with labs, events, and attributes', () => {
    const file = resolve(__dirname, '../../public/test_labs.xlsx')
    const buf = readFileSync(file)
    const dataset = loadDatasetFromWorkbook(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    )
    expect(dataset.sheetNames).toEqual(['labs', 'events', 'attributes'])
    expect(dataset.rows.length).toBeGreaterThan(100)
    expect(dataset.events.length).toBe(8)
    expect(Object.keys(dataset.patientAttributes).length).toBe(8)
  })
})
