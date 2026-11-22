/**
 * Issue #83, part 1: every setting that can change a number reaches the
 * export. The list of settings is not written here: it is walked from the
 * store and the settings objects, so a new setting without an export field
 * (or a commented "no numeric effect" entry in SETTINGS) fails this test.
 */
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { useAppStore } from '../../src/workspace/state/store'
import { allSettingLeaves, fitSettingsSample, FIT_PREFIX, mixedModelConfigSample, SETTINGS, settingLeaves, STORE_FIELDS, trajectoryViewSample, analysisRecord } from '../../src/workspace/analysis-record'
import { defaultAnalysisSettings, type AnalysisSettings } from '../../src/core/analysis/registry'
import { defaultFitSettings, type WorkspaceFitSettings } from '../../src/workspace/workspace-analysis'
import { trajectoryColumnSettings } from '../../src/workspace/trajectory-ui/analysis'
import { workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { applyExportedSettings, readExportedSettings } from '../../src/workspace/exported-settings'
import { mixedModelExportSheets } from '../../src/core/mixedModel/modelExport'
import type { MixedModelSuccess } from '../../src/core/mixedModel/types'
import { exportFixture } from './export-fixture'

/** The store's data fields, with every settings field at a sample that has all its keys. */
function fullState(): Record<string, unknown> {
  const state = Object.fromEntries(Object.entries(useAppStore.getState()).filter(([, value]) => typeof value !== 'function'))
  const fit = fitSettingsSample()
  return {
    ...state,
    trajectoryFitSettings: { shared: fit, columns: { column: fit } },
    trajectoryView: trajectoryViewSample(),
    mixedModelConfig: mixedModelConfigSample(),
  }
}

describe('completeness: every setting has an export field or a reason it changes no number', () => {
  it('classifies every field of the store', () => {
    const fields = Object.keys(fullState())
    expect(fields.filter(field => !(field in STORE_FIELDS)), 'store fields without an entry in STORE_FIELDS').toEqual([])
    expect(Object.keys(STORE_FIELDS).filter(field => !fields.includes(field)), 'stale entries of STORE_FIELDS').toEqual([])
  })

  it('has a catalog entry for every leaf of every settings field, and no stale entry', () => {
    const leaves = [...new Set(allSettingLeaves(fullState()).map(([path]) => path))]
    expect(leaves.length).toBeGreaterThan(30)
    expect(leaves.filter(path => !SETTINGS[path]), 'settings without an entry in SETTINGS (analysis-record.ts)').toEqual([])
    expect(Object.keys(SETTINGS).filter(path => !leaves.includes(path)), 'entries of SETTINGS that are no setting').toEqual([])
  })

  it('gives every entry exactly one of an export field and a no-numeric-effect reason', () => {
    for (const [path, definition] of Object.entries(SETTINGS)) {
      expect(Boolean(definition.exportField) !== Boolean(definition.noNumericEffect), path).toBe(true)
      expect(definition.label.trim(), path).not.toBe('')
    }
  })
})

/** A different value of the same kind, valid for the setting. Strings have
 * no generic alternative: a new string setting needs one here, else the test
 * fails and says so. */
const STRING_ALTERNATIVES: Record<string, unknown> = {
  'analysisSettings.egfr.formula': 'ckd-epi-2009',
  [`${FIT_PREFIX}.fitModel`]: 'segmented-ols',
  [`${FIT_PREFIX}.timeBalancing`]: 'monthly-median',
  [`${FIT_PREFIX}.censoring.unknownDialysisPolicy`]: 'censor-from-start',
  [`${FIT_PREFIX}.anchorComparison.rule.kind`]: 'type',
  [`${FIT_PREFIX}.anchorComparison.rule.value`]: 'Dialysis',
}
function alternative(path: string, value: unknown): unknown {
  if (path in STRING_ALTERNATIVES) return STRING_ALTERNATIVES[path]
  if (typeof value === 'boolean') return !value
  if (typeof value === 'number') return value + 7
  if (path === 'analysisSettings.egfr.source') return ['Creatinine', 'mg/dl']
  throw new Error(`No alternative value for ${path}: add one to STRING_ALTERNATIVES.`)
}
function withLeaf<T>(object: T, path: string, value: unknown): T {
  const copy = structuredClone(object) as Record<string, unknown>
  const keys = path.split('.').slice(1)
  let at = copy
  for (const key of keys.slice(0, -1)) at = at[key] as Record<string, unknown>
  at[keys.at(-1)!] = value
  return copy as T
}

const settingsRows = (bytes: Uint8Array) => XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(bytes, { type: 'array' }).Sheets.settings, { defval: '' })
/** The settings sheet without the machine-readable copy: what a reader of the workbook sees. */
const documentedColumns = (bytes: Uint8Array) => JSON.stringify(settingsRows(bytes).map(({ column_settings: _copy, ...rest }) => rest))

function exportWith(analysisSettings: AnalysisSettings, shared: WorkspaceFitSettings, trendKeys = ['marker', 'derived']) {
  const input = exportFixture()
  input.data.analysisSettings = analysisSettings
  const parameters = input.parameterKeys.map(key => input.data.parameters.find(p => p.key === key)!)
  const columns = trajectoryColumnSettings({ shared, columns: {} }, parameters, trendKeys)
  return workspaceWorkbookBytes({ ...input, ...columns, exportedAt: new Date(0), exportId: 'fixed' })
}
const target = (analysisSettings: AnalysisSettings) => ({
  parameterKeys: new Set(['marker', 'derived', 'other-unit']), importedParameters: [['Marker|one', 'mg/L'], ['Creatinine', 'mg/dl']] as const,
  analysisSettings, trajectoryFitSettings: { shared: defaultFitSettings(), columns: {} }, trendKeys: [],
})

describe('every exported setting is in the documented columns and comes back from the workbook', () => {
  const base = { ...defaultFitSettings(), presetId: 'custom' }
  const baseAnalysis = { ...defaultAnalysisSettings(), egfr: { formula: 'ckd-epi-2021' as const, source: null } }
  const baseline = exportWith(baseAnalysis, base)

  // Dataset settings.
  for (const [path, value] of settingLeaves(baseAnalysis, 'analysisSettings')) {
    it(path, () => {
      const changed = withLeaf(baseAnalysis, path, alternative(path, value))
      const bytes = exportWith(changed, base)
      expect(documentedColumns(bytes)).not.toBe(documentedColumns(baseline))
      expect(applyExportedSettings(readExportedSettings(bytes), target(defaultAnalysisSettings())).analysisSettings).toEqual(changed)
    })
  }

  // Fit settings, shared and own: one shape. The sample has every optional key.
  const sample = { ...fitSettingsSample(), presetId: 'custom' }
  const sampleBaseline = exportWith(baseAnalysis, sample)
  for (const [path, value] of settingLeaves(sample, FIT_PREFIX)) {
    if (path === `${FIT_PREFIX}.presetId` || SETTINGS[path]?.noNumericEffect) continue
    it(path, () => {
      const changed = withLeaf(sample, path, alternative(path, value))
      const bytes = exportWith(baseAnalysis, changed)
      expect(documentedColumns(bytes)).not.toBe(documentedColumns(sampleBaseline))
      expect(applyExportedSettings(readExportedSettings(bytes), target(baseAnalysis)).trajectoryFitSettings.shared).toEqual(changed)
    })
  }
  it(`${FIT_PREFIX}.presetId`, () => {
    // A preset id names its values; with values of another preset it would be custom.
    const preset = defaultFitSettings('theil_sen')
    const bytes = exportWith(baseAnalysis, preset)
    expect(documentedColumns(bytes)).not.toBe(documentedColumns(exportWith(baseAnalysis, { ...preset, presetId: 'custom' })))
    expect(applyExportedSettings(readExportedSettings(bytes), target(baseAnalysis)).trajectoryFitSettings.shared).toEqual(preset)
  })
  it('trajectoryView.trendKeys and trajectoryView.parameterKeys', () => {
    const bytes = exportWith(baseAnalysis, base, ['derived'])
    expect(documentedColumns(bytes)).not.toBe(documentedColumns(baseline))
    const applied = applyExportedSettings(readExportedSettings(bytes), target(baseAnalysis))
    expect(applied.parameterKeys).toEqual(['marker', 'derived'])
    expect(applied.trendKeys).toEqual(['derived'])
  })
})

describe('cohort model settings reach the model workbook', () => {
  it('writes every key of the model configuration, the preset policy and the projection settings', () => {
    const config = mixedModelConfigSample()
    const metadata = { engine: 'webr-lme4', runtimeVersion: 'R 4.5.1', packageVersions: { lme4: '1.1' }, modelConfig: config, preparation: { presetExclusionPolicy: 'skip', excludedByPreset: 0 } }
    const result = { status: 'success', converged: true, singular: false, metadata, warnings: [], fixedEffects: { intercept: 1, timeSinceBaseline: 0 }, fixedEffectConfidenceIntervals: { timeSinceBaseline: null } } as unknown as MixedModelSuccess
    const models = mixedModelExportSheets([{ entity: 'Whole cohort', result, identity: { seriesKey: 'eGFR|ml' } }]).find(sheet => sheet.name === 'models')!.rows[0] as Record<string, unknown>
    expect(JSON.parse(String(models.modelConfig))).toEqual(config)
    expect(Object.keys(config).every(key => key in JSON.parse(String(models.modelConfig)))).toBe(true)
    expect(models.preset_exclusion_policy).toBe('skip')
    expect(JSON.parse(String(models.packageVersions))).toEqual({ lme4: '1.1' })
  })
})

describe('analysis record', () => {
  it('lists the effective settings, marks deviations and links each to its control', () => {
    const shared = defaultFitSettings('ckd_progression')
    const own = { ...shared, fitModel: 'theil-sen' as const, presetId: 'custom' }
    const sections = analysisRecord({
      analysisSettings: { ...defaultAnalysisSettings(), egfr: { formula: 'ckd-epi-2021', source: null } },
      manualDemographics: { 1: { age: 50 } },
      trajectoryFitSettings: { shared, columns: { b: own } },
      parameters: [{ key: 'a', label: 'A', trend: true }, { key: 'b', label: 'B', trend: false }],
      groupBy: 'sex', mixedModelConfig: mixedModelConfigSample(), presetExclusionPolicy: 'apply', cohortModelResults: null,
    })
    const find = (id: string, path: string) => sections.find(section => section.id === id)!.entries.find(entry => entry.path === path)!
    expect(find('data', 'analysisSettings.egfr.formula')).toMatchObject({ value: 'CKD-EPI 2021', defaultValue: 'Off', deviates: true, control: { page: 'Data', target: 'egfr' } })
    expect(find('data', 'manualDemographics')).toMatchObject({ value: '1 patient', deviates: true })
    expect(find('shared', `${FIT_PREFIX}.timeBalancing`)).toMatchObject({ value: 'Quarterly median', defaultValue: 'Raw (unweighted points)', deviates: true })
    expect(find('shared', `${FIT_PREFIX}.fitModel`)).toMatchObject({ deviates: false })
    // A parameter's own settings list only what differs from the shared ones.
    expect(sections.find(section => section.id === 'parameter:b')!.entries.map(entry => entry.path)).toEqual(['trajectoryView.trendKeys', `${FIT_PREFIX}.presetId`, `${FIT_PREFIX}.fitModel`])
    expect(find('parameter:b', 'trajectoryView.trendKeys')).toMatchObject({ value: 'Off', deviates: false })
    expect(find('parameter:a', 'trajectoryView.trendKeys')).toMatchObject({ value: 'On', defaultValue: 'Off', deviates: true })
    expect(find('grouping', 'groupBy')).toMatchObject({ value: 'sex', deviates: true })
    expect(find('models', 'mixedModelConfig.factors')).toMatchObject({ value: 'genotype (reference A)', deviates: true })
    // Only settings with a numeric effect are listed.
    for (const section of sections) for (const entry of section.entries) expect(SETTINGS[entry.path]?.noNumericEffect, entry.path).toBeUndefined()
  })
})
