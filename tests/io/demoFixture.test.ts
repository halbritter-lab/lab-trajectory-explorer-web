import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readWorkbook } from '../../src/io/readWorkbook'
import { loadLabRows } from '../../src/core/parse/loader'
import { resolveDemographics } from '../../src/core/demographics/resolve'
import { loadDatasetFromWorkbook } from '../../src/io/loadDataset'
import { MIN_QUALIFYING_PATIENTS } from '../../src/core/mixedModel/validation'
import { defaultModelParameterKey, modelablePatientCount } from '../../src/workspace/cohort-model-parameter'

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

  it('preselects an imported eGFR that the cohort model can fit with the default settings', () => {
    const file = resolve(__dirname, '../../public/test_labs.xlsx')
    const buf = readFileSync(file)
    const { rows } = loadDatasetFromWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const parameters = [...new Map(rows.filter(r => r.bezeichnung !== null).map(r => {
      const key = JSON.stringify([r.bezeichnung, r.einheit])
      return [key, { key, bezeichnung: r.bezeichnung!, einheit: r.einheit }]
    })).values()]
    const patients = new Set(rows.map(r => String(r.patientId)))
    const chosen = parameters.find(p => p.key === defaultModelParameterKey(parameters, rows, patients))!
    expect(chosen.bezeichnung).toBe('eGFR')
    expect(modelablePatientCount(rows, chosen, patients)).toBeGreaterThanOrEqual(MIN_QUALIFYING_PATIENTS)
  })
})
