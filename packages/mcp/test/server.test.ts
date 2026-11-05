// Runs the server in-process over the SDK's in-memory transport and checks its
// aggregates against the kidney package called directly. Build the kidney
// package first (`pnpm build:kidney`).
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import * as XLSX from 'xlsx'
import * as kidney from '@halbritter-lab/kidney-trajectories'
import { createServer } from '../src/server.js'
import { cell, quantile, RESEARCH_USE, SUPPRESSED } from '../src/cohort.js'

const fixture = fileURLToPath(new URL('../../../tests/fixtures/test_labs.xlsx', import.meta.url))
const client = new Client({ name: 'test', version: '0' })

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args })
  const text = (res.content as { type: string; text: string }[])[0].text
  if (res.isError) throw new Error(text)
  const body = JSON.parse(text)
  expect(body.research_use).toBe(RESEARCH_USE)
  return body
}

/** The package pipeline the README documents, called directly. */
function direct() {
  const dataset = kidney.loadDatasetFromWorkbook(readFileSync(fixture))
  const source = kidney.defaultCreatinineSource(kidney.creatinineSourceOptions(dataset.rows))
  const settings = { ...kidney.defaultAnalysisSettings(), egfr: { formula: 'ckd-epi-2021' as const, source } }
  const analysis = kidney.computeAnalysisResult({ rows: dataset.rows, events: dataset.events, patientAttributes: dataset.patientAttributes, manualDemographics: {}, settings })
  const parameter = { bezeichnung: kidney.computedEgfrName('ckd-epi-2021'), einheit: kidney.COMPUTED_EGFR_UNIT }
  const spec = kidney.cohortSeriesSpec(parameter, kidney.ckdProgressionConfig(parameter), { clinicalEventsByPatient: kidney.clinicalEventsByPatient(dataset.events), fitInputs: analysis.fitInputs })
  const cohort = kidney.buildCohortRows(analysis.rows, [...new Set(analysis.rows.map((r) => r.patientId))], [spec])
  return { cohort, records: kidney.cohortExportRecords(cohort, kidney.defaultColumnModuleSettings()) }
}

let id: string
const egfr = { preset: 'ckd_progression', egfr_formula: 'ckd-epi-2021' }

beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair()
  await createServer().connect(a)
  await client.connect(b)
  id = (await call('load_dataset', { path: fixture })).dataset_id
})
afterAll(() => client.close())

describe('lab-trajectory MCP server', () => {
  test('load_dataset returns aggregate counts without patient identifiers', async () => {
    const body = await call('load_dataset', { path: fixture })
    const dataset = kidney.loadDatasetFromWorkbook(readFileSync(fixture))
    expect(body.dataset_id).toBe(id) // the unchanged file is not loaded twice
    expect(body.lab_rows).toBe(dataset.rows.length)
    expect(body.patients).toBe(cell(new Set(dataset.rows.map((r) => r.patientId)).size))
    for (const s of body.series) expect(s.rows === SUPPRESSED).toBe(s.patients === SUPPRESSED)
    const text = JSON.stringify(body)
    for (const pid of new Set(dataset.rows.map((r) => String(r.patientId)))) expect(text).not.toContain(`"${pid}"`)
  })

  const networkPaths = ['\\\\server\\share\\labs.xlsx', '//server/share/labs.xlsx', '/\\server\\share\\labs.xlsx', '\\/server/share/labs.xlsx',
    '\\\\?\\UNC\\server\\share\\labs.xlsx', '\\\\.\\C:\\labs.xlsx']

  test('load_dataset rejects URLs, relative paths and network shares in every spelling', async () => {
    for (const path of ['https://example.org/labs.xlsx', 'file:///C:/labs.xlsx', 'labs.xlsx', 'C:labs.xlsx', ...networkPaths]) {
      await expect(call('load_dataset', { path }), path).rejects.toThrow(/local|absolute/)
    }
  })

  test('export_cohort never writes to a network share', async () => {
    for (const output_path of networkPaths.map((p) => p.replace('labs.xlsx', 'out.csv'))) {
      await expect(call('export_cohort', { dataset_id: id, ...egfr, output_path }), output_path).rejects.toThrow('network shares')
    }
  })

  test('an unreadable workbook gives a generic error without header or cell text', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'lab-mcp-')), 'headerless.csv')
    writeFileSync(path, 'PAT-0042-MUELLER,2020-01-01,Kreatinin,mg/dl,1.1\nPAT-0042-MUELLER,2021-01-01,Kreatinin,mg/dl,1.4\n')
    const error = await call('load_dataset', { path }).catch((e: Error) => e.message)
    expect(error).toMatch(/^Could not read this workbook/)
    expect(error).not.toMatch(/PAT-0042|2020-01-01|1\.1|Columns found/)
  })

  test('unload_dataset frees the id', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'lab-mcp-')), 'copy.xlsx')
    writeFileSync(path, readFileSync(fixture))
    const copy = (await call('load_dataset', { path })).dataset_id
    expect(copy).not.toBe(id)
    expect((await call('unload_dataset', { dataset_id: copy })).unloaded).toBe(true)
    await expect(call('list_series', { dataset_id: copy })).rejects.toThrow('Unknown dataset_id')
  })

  test('aggregates of fewer than five patients are suppressed', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'lab-mcp-')), 'one.csv')
    const lines = [0, 1, 2, 3].map((y) => `P1,${2020 + y}-01-01,Kreatinin,mg/dl,${(1.1 + y * 0.3).toFixed(1)},m,1960-06-15`)
    writeFileSync(path, ['patientId,labDate,testName,unit,value,sex,birthDate', ...lines].join('\n'))
    const loaded = await call('load_dataset', { path })
    expect([loaded.patients, loaded.lab_rows, loaded.series[0].rows]).toEqual([SUPPRESSED, SUPPRESSED, SUPPRESSED])
    const { aggregate } = await call('analyse_cohort', { dataset_id: loaded.dataset_id, ...egfr })
    expect(aggregate.patients_with_slope).toBe(SUPPRESSED)
    expect(aggregate.measurements_raw).toBe(SUPPRESSED)
    expect(aggregate.slope_per_year).toMatchObject({ n: SUPPRESSED, median: null, q1: null, q3: null, suppressed: true })
    expect(aggregate.slope_per_year).not.toHaveProperty('min')
    expect(aggregate.rapid_decline_count).toBe(SUPPRESSED)
    expect(JSON.stringify(aggregate)).not.toMatch(/":\s*[1-4]\b/)
  })

  test('list_series offers the computed eGFR', async () => {
    const body = await call('list_series', { dataset_id: id })
    expect(body.computable_egfr.series.map((s: { series: string }) => s.series)).toContain(kidney.computedEgfrName('ckd-epi-2021'))
  })

  test('analyse_cohort matches the package for CKD progression on computed CKD-EPI 2021 eGFR', async () => {
    const { aggregate, method } = await call('analyse_cohort', { dataset_id: id, ...egfr })
    const { cohort, records } = direct()
    const slopes = records.flatMap((r) => (typeof r.slope === 'number' ? [r.slope] : [])).sort((a, b) => a - b)
    expect(slopes.length).toBeGreaterThanOrEqual(5)
    expect(aggregate.patients_in_dataset).toBe(cohort.length)
    expect(aggregate.patients_with_slope).toBe(slopes.length)
    expect(aggregate.slope_per_year.median).toBe(quantile(slopes, 0.5))
    expect(aggregate.slope_per_year.q1).toBe(quantile(slopes, 0.25))
    expect(aggregate.slope_per_year.q3).toBe(quantile(slopes, 0.75))
    expect(aggregate.slope_per_year).not.toHaveProperty('min')
    expect(aggregate.unstable_slope.count).toBe(cell(records.filter((r) => typeof r.slope === 'number' && r.unstable_slope === 'yes').length))
    expect(aggregate.rapid_decline_count).toBe(cell(records.filter((r) => r.rapid_progression === 'yes').length))
    expect(aggregate.endpoints.observed_ckd_g4).toBe(cell(records.filter((r) => r.endpoint_observed_ckd_g4 === 'yes').length))
    expect(aggregate.endpoints.evaluated_patients.observedCkdG5).toBe(cell(cohort.filter((row) => row.cells[0].nNumeric > 0 && row.cells[0].endpoints.evaluated.observedCkdG5).length))
    expect(aggregate.points_fitted).toBe(cohort.reduce((sum, row) => sum + row.cells[0].nFitted, 0))
    expect(method.preset.id).toBe('ckd_progression')
    expect(method.fit_config.timeBalancing).toBe(kidney.ckdProgressionConfig({ bezeichnung: method.series, einheit: method.unit }).timeBalancing)
    expect(method.egfr.formula).toBe('ckd-epi-2021')
    expect(JSON.stringify(aggregate)).not.toMatch(/"(PatientID|patientId)"/)
  })

  test('acute review reports no requested fit instead of too few points', async () => {
    const { aggregate } = await call('analyse_cohort', { dataset_id: id, ...egfr, preset: 'acute_review' })
    expect(aggregate.patients_with_slope).toBe(0)
    expect(Object.keys(aggregate.no_slope_reasons)).toEqual(['no_fit_requested'])
  })

  test('quantile interpolates linearly', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(quantile([], 0.5)).toBeNull()
  })

  test('patient_detail returns the patient the user named', async () => {
    const { records } = direct()
    const target = records.find((r) => typeof r.slope === 'number')!
    const body = await call('patient_detail', { dataset_id: id, ...egfr, patient_id: String(target.PatientID) })
    expect(body.patient_id).toBe(String(target.PatientID))
    expect(body.result.slope).toBe(target.slope)
    expect(body.result.PatientID).toBeUndefined()
    await expect(call('patient_detail', { dataset_id: id, ...egfr, patient_id: 'no-such-patient' })).rejects.toThrow('not found')
  })

  test('export_cohort writes xlsx and csv locally and returns only path and row count', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lab-mcp-'))
    const { records } = direct()
    const xlsx = await call('export_cohort', { dataset_id: id, ...egfr, output_path: join(dir, 'cohort.xlsx') })
    expect(xlsx.rows).toBe(records.length)
    expect(JSON.stringify(xlsx)).not.toContain('"PatientID"')
    const book = XLSX.read(readFileSync(xlsx.path))
    expect(book.SheetNames).toEqual(['cohort', 'settings', 'about'])
    const sheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets.cohort)
    expect(sheet.map((r) => r.slope ?? '')).toEqual(records.map((r) => r.slope))
    expect(JSON.stringify(XLSX.utils.sheet_to_json(book.Sheets.about))).toContain(RESEARCH_USE)

    const csv = await call('export_cohort', { dataset_id: id, ...egfr, output_path: join(dir, 'cohort.csv') })
    const text = readFileSync(csv.path, 'utf8')
    expect(text).toContain(`# ${RESEARCH_USE}`)
    expect(text.split('\n').filter((line) => line && !line.startsWith('#')).length).toBe(records.length + 1)

    const existing = join(dir, 'keep.csv')
    writeFileSync(existing, 'keep')
    await expect(call('export_cohort', { dataset_id: id, ...egfr, output_path: existing })).rejects.toThrow()
    expect(readFileSync(existing, 'utf8')).toBe('keep')
  })

  test('a known birth date gives exact ages in the G5 projection, as in the app', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lab-mcp-'))
    const path = join(dir, 'labs.csv')
    const lines = Array.from({ length: 13 }, (_, q) => {
      const date = new Date(Date.UTC(2020, q * 3, 1)).toISOString().slice(0, 10)
      return `P1,${date},Kreatinin,mg/dl,${(1.5 + q * 0.15).toFixed(2)},m,1960-06-15`
    })
    writeFileSync(path, ['patientId,labDate,testName,unit,value,sex,birthDate', ...lines].join('\n'))
    const dataset_id = (await call('load_dataset', { path })).dataset_id
    const body = await call('patient_detail', { dataset_id, ...egfr, patient_id: 'P1' })
    expect(typeof body.result.endpoint_projected_age_to_ckd_g5).toBe('number')
    expect(body.result.endpoint_prediction_age_basis).toBe('birth date')
  })

  test('methods_reference names the method reference', async () => {
    const body = await call('methods_reference')
    expect(body.method_reference).toMatch(/docs\/method-algorithms\.md$/)
    expect(body.presets.map((p: { id: string }) => p.id)).toContain('ckd_progression')
  })
})
