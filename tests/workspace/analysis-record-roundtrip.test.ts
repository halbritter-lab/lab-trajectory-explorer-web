/**
 * Issue #83, parts 2 and 3: the settings of an export, applied to the same
 * data, give the same results; applied to another dataset, what does not fit
 * is named. Runs the page's own derivations on the demo workbook: the import,
 * the analysis, the table settings (trajectoryColumnSettings) and the export.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { loadDatasetFromWorkbook } from '../../src/io/loadDataset'
import { computeAnalysisResult, defaultAnalysisSettings, type AnalysisSettings } from '../../src/core/analysis/registry'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { buildWorkspaceData, workspaceSpecs, type WorkspaceData } from '../../src/workspace/workspace-data'
import { defaultFitSettings, type TrajectoryFitSettings } from '../../src/workspace/workspace-analysis'
import { trajectoryColumnSettings } from '../../src/workspace/trajectory-ui/analysis'
import { workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { applyExportedSettings, readExportedSettings } from '../../src/workspace/exported-settings'
import { COMPUTED_EGFR_UNIT, computedEgfrName } from '../../src/core/domains/nephrology/analytes'

const demo = () => readFileSync(resolve(__dirname, '../../public/test_labs.xlsx'))

function dataOf(bytes: Uint8Array | Buffer, analysisSettings: AnalysisSettings, fileName: string): WorkspaceData {
  const dataset = loadDatasetFromWorkbook(bytes)
  const input = { rows: dataset.rows, fileName, events: dataset.events, patientAttributes: dataset.patientAttributes, analysisSettings, manualDemographics: {}, importDiagnostics: dataset.diagnostics }
  return buildWorkspaceData(input, computeAnalysisResult({ rows: input.rows, settings: analysisSettings, manualDemographics: {}, patientAttributes: input.patientAttributes, events: input.events }))
}

/** The cohort workbook as the Trajectories page writes it. */
function exportOf(data: WorkspaceData, settings: TrajectoryFitSettings, parameterKeys: string[], trendKeys: string[]) {
  const parameters = parameterKeys.map(key => data.parameters.find(p => p.key === key)!)
  const columns = trajectoryColumnSettings(settings, parameters, trendKeys)
  const specs = workspaceSpecs(data, parameterKeys, columns.fitConfigByParameterKey, columns.anchorComparisonByParameterKey)
  const ids = data.patients.map(p => p.id)
  const cohortRows = buildCohortRows(data.rows, ids, specs)
  return workspaceWorkbookBytes({ data, parameterKeys, patientIds: ids, cohortRows, ...columns, exportedAt: new Date('2026-11-22T00:00:00Z'), exportId: 'round-trip' })
}

const sheets = (bytes: Uint8Array) => {
  const workbook = XLSX.read(bytes, { type: 'array' })
  return Object.fromEntries(workbook.SheetNames.map(name => [name, XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: '' })]))
}
const note = (bytes: Uint8Array, key: string) => sheets(bytes).about.map(row => String(row.note)).find(text => text.startsWith(`${key}: `))

describe('settings round trip on the demo workbook', () => {
  // Non-default settings in every place: Data, shared settings, a parameter's own settings, Trend.
  const analysisSettings: AnalysisSettings = { ...defaultAnalysisSettings(), egfr: { formula: 'ckd-epi-2021', source: null }, aki: { ...defaultAnalysisSettings().aki, recoveryHours: 72 } }
  const first = dataOf(demo(), analysisSettings, 'demo.xlsx')
  const egfrKey = JSON.stringify([computedEgfrName('ckd-epi-2021'), COMPUTED_EGFR_UNIT])
  const creatinine = first.parameters.find(p => /kreatinin|creatinine/i.test(p.bezeichnung) && !p.derived)!
  const other = first.parameters.find(p => !p.derived && p.key !== creatinine.key)!
  const settings: TrajectoryFitSettings = {
    shared: defaultFitSettings('theil_sen'),
    columns: {
      [egfrKey]: { ...defaultFitSettings('ckd_progression'), anchorComparison: { rule: { kind: 'first' }, exclusionDays: 30 } },
      [creatinine.key]: { ...defaultFitSettings(), presetId: 'custom', fitModel: 'segmented-ols', exclusions: { excludeAkiWindows: true, akiExclusionDays: 14 } },
    },
  }
  // Every parameter is exported: raw_measurements holds the imported rows of
  // the exported parameters only, and the re-import can only reproduce what
  // it reads (a patient without rows of the exported parameters is not in the
  // file, and the birth date estimated from stated ages uses all rows of a patient).
  const parameterKeys = [egfrKey, creatinine.key, other.key, ...first.parameters.map(p => p.key).filter(key => ![egfrKey, creatinine.key, other.key].includes(key))]
  const trendKeys = [egfrKey, creatinine.key]
  const exported = exportOf(first, settings, parameterKeys, trendKeys)

  it('applies every setting of the export to the re-imported workbook without a complaint', () => {
    expect(first.parameters.some(p => p.key === egfrKey)).toBe(true)
    // The export loaded as a new dataset: the defaults, before anything is applied.
    const reloaded = dataOf(exported, defaultAnalysisSettings(), 'demo.xlsx')
    const applied = applyExportedSettings(readExportedSettings(exported), {
      parameterKeys: new Set(reloaded.parameters.map(p => p.key)), importedParameters: reloaded.parameters.filter(p => !p.derived).map(p => [p.bezeichnung, p.einheit] as const),
      analysisSettings: defaultAnalysisSettings(), trajectoryFitSettings: { shared: defaultFitSettings(), columns: {} }, trendKeys: [],
    })
    expect(applied.notApplied).toEqual([])
    expect(applied.analysisSettings).toEqual(analysisSettings)
    expect(applied.trajectoryFitSettings).toEqual(settings)
    expect(applied.parameterKeys).toEqual(parameterKeys)
    expect(applied.trendKeys).toEqual(trendKeys)
  })

  it('gives the same input_data_id, results and settings as the original export', () => {
    const reloaded = dataOf(exported, defaultAnalysisSettings(), 'demo.xlsx')
    const applied = applyExportedSettings(readExportedSettings(exported), {
      parameterKeys: new Set(reloaded.parameters.map(p => p.key)), importedParameters: reloaded.parameters.filter(p => !p.derived).map(p => [p.bezeichnung, p.einheit] as const),
      analysisSettings: defaultAnalysisSettings(), trajectoryFitSettings: { shared: defaultFitSettings(), columns: {} }, trendKeys: [],
    })
    const again = exportOf(dataOf(exported, applied.analysisSettings, 'demo.xlsx'), applied.trajectoryFitSettings, applied.parameterKeys!, applied.trendKeys)
    expect(note(again, 'input_data_id')).toBe(note(exported, 'input_data_id'))
    const [before, after] = [sheets(exported), sheets(again)]
    // Every sheet is the same, results included; import_diagnostics lists what
    // the import of each file reported, which differs between the demo and the export.
    for (const name of Object.keys(before)) if (name !== 'import_diagnostics') expect(after[name], name).toEqual(before[name])
    expect(before.cohort.some(row => typeof row.slope === 'number')).toBe(true)
    expect(before.anchor_comparison.length).toBeGreaterThan(0)
  })

  it('names what it cannot apply to another dataset and keeps the rest', () => {
    // Another dataset: the demo without its creatinine-free parameter and with another file name.
    const reduced = dataOf(demo(), defaultAnalysisSettings(), 'other.xlsx')
    const keys = new Set(reduced.parameters.map(p => p.key).filter(key => key !== other.key))
    const result = applyExportedSettings(readExportedSettings(exported), {
      parameterKeys: keys, importedParameters: [], analysisSettings: defaultAnalysisSettings(),
      trajectoryFitSettings: { shared: defaultFitSettings(), columns: {} }, trendKeys: [],
    })
    expect(result.notApplied).toEqual([`settings of ${other.label} (parameter not in this dataset)`])
    expect(result.parameterKeys).toEqual(parameterKeys.filter(key => key !== other.key))
    expect(result.trajectoryFitSettings).toEqual(settings)
    // Own settings of a parameter the file does not list stay; one the file lists as shared loses its own.
    const elsewhere = JSON.stringify(['Not exported', 'u'])
    const kept = applyExportedSettings(readExportedSettings(exported), {
      parameterKeys: keys, importedParameters: [], analysisSettings: defaultAnalysisSettings(), trendKeys: [],
      trajectoryFitSettings: { shared: defaultFitSettings(), columns: { [elsewhere]: defaultFitSettings('theil_sen'), [other.key]: defaultFitSettings('theil_sen') } },
    })
    expect(kept.trajectoryFitSettings.columns).toEqual({ ...settings.columns, [elsewhere]: defaultFitSettings('theil_sen') })
    // A file without a settings sheet is refused with a reason.
    expect(() => readExportedSettings(demo())).toThrow(/no settings sheet/)
  })
})
