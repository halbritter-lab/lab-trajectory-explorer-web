/** Issue #73: settings of an export written before the bounded-value setting existed. */
import { describe, expect, it } from 'vitest'
import { applyExportedSettings, type ExportedSettings } from '../../src/workspace/exported-settings'
import { defaultAnalysisSettings } from '../../src/core/analysis/registry'
import { defaultFitSettings } from '../../src/workspace/workspace-analysis'

const KEY = JSON.stringify(['UACR', 'mg/g'])
const exported = (settings: unknown): ExportedSettings => ({
  columns: [{ parameterKey: KEY, label: 'UACR [mg/g]', settings, source: 'own', trend: true }],
  analysisSettings: defaultAnalysisSettings(), groupBy: '', appVersion: null, exportId: null, inputDataId: null, rebuilt: false,
  manualDemographicPatients: 0, periEventCreatinine: undefined, logParameterKeys: [],
})
const target = {
  parameterKeys: new Set([KEY]), importedParameters: [], analysisSettings: defaultAnalysisSettings(),
  trajectoryFitSettings: { shared: defaultFitSettings(), columns: {} }, trendKeys: [], logKeys: [], events: [], periEventSettings: null,
}

describe('applying settings without boundedValues', () => {
  it('applies the default and names the parameter', () => {
    const { boundedValues: _absent, ...old } = defaultFitSettings()
    const applied = applyExportedSettings(exported(old), target)
    expect(applied.trajectoryFitSettings.columns[KEY].boundedValues).toBe('limit')
    expect(applied.notApplied).toEqual(['bounded values of UACR [mg/g]: the export has no such setting (it left bounds out of every fit); the default "Limit" applies, choose "Exclude" to reproduce its slopes'])
  })

  it('applies a recorded setting without a note', () => {
    const applied = applyExportedSettings(exported({ ...defaultFitSettings(), presetId: 'custom', boundedValues: 'exclude' }), target)
    expect(applied.trajectoryFitSettings.columns[KEY].boundedValues).toBe('exclude')
    expect(applied.notApplied).toEqual([])
  })
})
