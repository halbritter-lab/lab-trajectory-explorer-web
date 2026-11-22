import { describe, expect, it } from 'vitest'
import { defaultTrajectoryView, losesDataOnUnload, restoreSavedSettings, SAVED_SETTINGS_VERSION, type SavedSettings } from '../../src/workspace/saved-settings'
import { defaultFitSettings, defaultTrajectoryFitSettings, toFitConfig } from '../../src/workspace/workspace-analysis'

const EGFR = JSON.stringify(['eGFR', 'ml/min/1,73m²'])
const GONE = JSON.stringify(['Gone', null])
const keys = new Set([EGFR])

function saved(): SavedSettings {
  return {
    version: SAVED_SETTINGS_VERSION,
    trajectoryFitSettings: { shared: defaultFitSettings(), columns: { [EGFR]: defaultFitSettings('ckd_progression') } },
    trajectoryView: { ...defaultTrajectoryView(), parameterKeys: [EGFR], trendKeys: [EGFR], fitKeys: [EGFR], display: { events: true }, axis: 'age', cellDetails: 'full', warningIcons: false },
  }
}

describe('restoreSavedSettings', () => {
  it('returns stored settings unchanged when they fit this version and dataset', () => {
    const value = saved()
    // Through JSON, as IndexedDB hands back a structured clone, not the same objects.
    const restored = restoreSavedSettings(JSON.parse(JSON.stringify(value)), keys)
    expect(restored.notRestored).toEqual([])
    expect(restored.trajectoryFitSettings).toEqual(value.trajectoryFitSettings)
    expect(JSON.stringify(restored.trajectoryFitSettings)).toBe(JSON.stringify(value.trajectoryFitSettings))
    expect(restored.trajectoryView).toEqual(value.trajectoryView)
  })

  it('uses the defaults without a complaint for a copy saved before settings were kept', () => {
    expect(restoreSavedSettings(undefined, keys)).toEqual({ trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: defaultTrajectoryView(), stored: 'none', notRestored: [], keptAsCustom: [] })
  })

  it('discards settings of another settings version as a whole', () => {
    const restored = restoreSavedSettings({ ...saved(), version: SAVED_SETTINGS_VERSION + 1 }, keys)
    expect(restored.trajectoryFitSettings).toEqual(defaultTrajectoryFitSettings())
    expect(restored.trajectoryView).toEqual(defaultTrajectoryView())
    // Nothing was restored, so nothing may be reported as restored.
    expect(restored.stored).toBe('discarded')
    expect(restored.notRestored).toEqual([])
  })

  it('falls back item by item and names what was not restored', () => {
    const value = JSON.parse(JSON.stringify(saved())) as Record<string, any>
    value.trajectoryFitSettings.columns[GONE] = defaultFitSettings('ckd_progression')
    value.trajectoryFitSettings.columns[EGFR].fitModel = 'spline'
    value.trajectoryView.trendKeys.push(GONE)
    value.trajectoryView.display.removedOverlay = true
    value.trajectoryView.axis = 'weeks'
    const restored = restoreSavedSettings(value, keys)
    expect(restored.notRestored).toEqual([
      'own settings of eGFR [ml/min/1,73m²]',
      'own settings of Gone [no unit] (parameter not in this dataset)',
      'Trend of Gone [no unit] (parameter not in this dataset)',
      'display option "removedOverlay"',
      'time axis',
    ])
    // What was valid is kept.
    expect(restored.trajectoryFitSettings).toEqual(defaultTrajectoryFitSettings())
    expect(restored.trajectoryView).toEqual({ ...saved().trajectoryView, axis: 'baseline' })
  })

  it('rejects a shared setting with an unknown preset or a malformed section', () => {
    for (const change of [{ presetId: 'removed_preset' }, { timeBalancing: 'weekly' }, { exclusions: { excludeAkiWindows: true, akiExclusionDays: -1 } }, { moduleSettings: 'not a record' }]) {
      const value = saved()
      const restored = restoreSavedSettings({ ...value, trajectoryFitSettings: { ...value.trajectoryFitSettings, shared: { ...value.trajectoryFitSettings.shared, ...change } } }, keys)
      expect(restored.notRestored).toEqual(['shared analysis settings'])
      expect(restored.trajectoryFitSettings.shared).toEqual(defaultFitSettings())
      expect(restored.trajectoryFitSettings.columns[EGFR]).toEqual(defaultFitSettings('ckd_progression'))
    }
  })

  it('falls back to the default columns when no saved column is in the dataset', () => {
    const value = saved()
    const restored = restoreSavedSettings({ ...value, trajectoryView: { ...value.trajectoryView, parameterKeys: [GONE], trendKeys: [], fitKeys: [] } }, keys)
    expect(restored.trajectoryView.parameterKeys).toBeNull()
    expect(restored.notRestored).toEqual(['column Gone [no unit] (parameter not in this dataset)'])
  })
})

describe('choices for a computed parameter the derivation does not produce right now', () => {
  const COMPUTED = JSON.stringify(['eGFR (CKD-EPI 2021, computed)', 'ml/min/1,73m²'])
  const stale = () => {
    const value = saved()
    value.trajectoryFitSettings.columns[COMPUTED] = { ...defaultFitSettings('ckd_progression') }
    value.trajectoryView = { ...value.trajectoryView, parameterKeys: [EGFR, COMPUTED], trendKeys: [COMPUTED], fitKeys: [COMPUTED] }
    return value
  }
  it('are kept without a notice, so a reload does not complain again and again', () => {
    const restored = restoreSavedSettings(JSON.parse(JSON.stringify(stale())), keys)
    expect(restored.notRestored).toEqual([])
    expect(restored.trajectoryView.parameterKeys).toEqual([EGFR, COMPUTED])
    expect(restored.trajectoryView.trendKeys).toEqual([COMPUTED])
    expect(restored.trajectoryView.fitKeys).toEqual([COMPUTED])
    expect(restored.trajectoryFitSettings.columns[COMPUTED]).toEqual(defaultFitSettings('ckd_progression'))
  })
  it('apply again when the derivation produces the parameter', () => {
    const restored = restoreSavedSettings(JSON.parse(JSON.stringify(stale())), new Set([EGFR, COMPUTED]))
    expect(restored.notRestored).toEqual([])
    expect(restored.trajectoryView.trendKeys).toEqual([COMPUTED])
  })
  it('still drops and names a parameter that is not computed and not in the dataset', () => {
    const value = stale()
    value.trajectoryView.trendKeys.push(GONE)
    expect(restoreSavedSettings(JSON.parse(JSON.stringify(value)), keys).notRestored).toEqual(['Trend of Gone [no unit] (parameter not in this dataset)'])
  })
})

describe('a saved preset whose definition has changed', () => {
  it('keeps the saved values but not the preset name, and says for which settings', () => {
    const value = JSON.parse(JSON.stringify(saved())) as Record<string, any>
    // As if 'ckd_progression' had been saved with a 14-day AKI window that the preset no longer has.
    value.trajectoryFitSettings.columns[EGFR].exclusions.akiExclusionDays = 14
    value.trajectoryFitSettings.shared.timeBalancing = 'monthly-median'
    const restored = restoreSavedSettings(value, keys)
    expect(restored.trajectoryFitSettings.columns[EGFR]).toEqual({ ...defaultFitSettings('ckd_progression'), presetId: 'custom', exclusions: { ...defaultFitSettings('ckd_progression').exclusions, akiExclusionDays: 14 } })
    expect(restored.trajectoryFitSettings.shared).toEqual({ ...defaultFitSettings(), presetId: 'custom', timeBalancing: 'monthly-median' })
    expect(restored.keptAsCustom).toEqual(['shared settings', 'own settings of eGFR [ml/min/1,73m²]'])
    expect(restored.notRestored).toEqual([])
  })
  it('gives settings saved before 2026-11-22 the 90 days after the episode end and keeps their preset', () => {
    // Row akiwin: settings saved before have no akiDaysAfterEnd; they get the default, as the preset now has it.
    const value = JSON.parse(JSON.stringify(saved())) as Record<string, any>
    delete value.trajectoryFitSettings.columns[EGFR].exclusions.akiDaysAfterEnd
    delete value.trajectoryFitSettings.shared.exclusions.akiDaysAfterEnd
    const restored = restoreSavedSettings(value, keys)
    expect(restored.trajectoryFitSettings.columns[EGFR]).toEqual(defaultFitSettings('ckd_progression'))
    expect(restored.trajectoryFitSettings.columns[EGFR].exclusions.akiDaysAfterEnd).toBe(90)
    expect(restored.keptAsCustom).toEqual([])
    expect(restored.notRestored).toEqual([])
    value.trajectoryFitSettings.columns[EGFR].exclusions.akiDaysAfterEnd = -1
    expect(restoreSavedSettings(value, keys).notRestored).toEqual(['own settings of eGFR [ml/min/1,73m²]'])
  })
  it('leaves settings that match their preset, and custom settings, alone', () => {
    const value = JSON.parse(JSON.stringify(saved())) as Record<string, any>
    value.trajectoryFitSettings.shared = { ...defaultFitSettings(), presetId: 'custom', timeBalancing: 'monthly-median' }
    const restored = restoreSavedSettings(value, keys)
    expect(restored.keptAsCustom).toEqual([])
    expect(restored.trajectoryFitSettings.columns[EGFR].presetId).toBe('ckd_progression')
  })
})

describe('display options', () => {
  it('accepts every built-in option of the plot, not a retyped list', async () => {
    const { DEFAULT_WORKSPACE_DISPLAY } = await import('../../src/workspace/WorkspacePlot')
    const value = saved()
    value.trajectoryView.display = Object.fromEntries(Object.keys(DEFAULT_WORKSPACE_DISPLAY).map(key => [key, true]))
    expect(restoreSavedSettings(JSON.parse(JSON.stringify(value)), keys).notRestored).toEqual([])
  })
})

describe('losesDataOnUnload', () => {
  it('is true only while a dataset is loaded and not saved on this device', () => {
    expect(losesDataOnUnload(false, { enabled: false, status: 'session' })).toBe(false)
    expect(losesDataOnUnload(false, { enabled: true, status: 'saved' })).toBe(false)
    expect(losesDataOnUnload(true, { enabled: true, status: 'saved' })).toBe(false)
    expect(losesDataOnUnload(true, { enabled: false, status: 'session' })).toBe(true)
    // Not yet, or not successfully, written.
    expect(losesDataOnUnload(true, { enabled: true, status: 'saving' })).toBe(true)
    expect(losesDataOnUnload(true, { enabled: true, status: 'error' })).toBe(true)
  })
  it('does not ask for the untouched demo data, which load again with one click', () => {
    expect(losesDataOnUnload(true, { enabled: false, status: 'session' }, true)).toBe(false)
    expect(losesDataOnUnload(true, { enabled: false, status: 'session' }, false)).toBe(true)
  })
})

describe('what a demoted preset changes', () => {
  it('changes the exported preset name and time axis and nothing a fit reads', () => {
    const value = JSON.parse(JSON.stringify(saved())) as Record<string, any>
    value.trajectoryFitSettings.columns[EGFR].exclusions.akiExclusionDays = 14
    const parameter = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }
    const asSaved = toFitConfig(value.trajectoryFitSettings.columns[EGFR], parameter)
    const restored = toFitConfig(restoreSavedSettings(value, keys).trajectoryFitSettings.columns[EGFR], parameter)
    expect([asSaved.preset, asSaved.xAxis]).toEqual(['ckd_progression', 'age'])
    expect([restored.preset, restored.xAxis]).toEqual(['custom', 'calendar_time'])
    expect({ ...restored, preset: asSaved.preset, xAxis: asSaved.xAxis }).toEqual(asSaved)
  })
})

describe('module settings of a column', () => {
  it('fills modules the stored settings lack from the defaults, without a complaint', () => {
    const value = JSON.parse(JSON.stringify(saved())) as Record<string, any>
    value.trajectoryFitSettings.shared.moduleSettings = {}
    const restored = restoreSavedSettings(value, keys)
    expect(restored.trajectoryFitSettings.shared).toEqual(defaultFitSettings())
    expect(restored.notRestored).toEqual([])
  })
  it('ignores and names a module this version does not have, keeping the other settings', () => {
    const value = JSON.parse(JSON.stringify(saved())) as Record<string, any>
    value.trajectoryFitSettings.columns[EGFR].moduleSettings['removed-module'] = { threshold: 1 }
    const restored = restoreSavedSettings(value, keys)
    expect(restored.trajectoryFitSettings.columns[EGFR]).toEqual(defaultFitSettings('ckd_progression'))
    expect(restored.notRestored).toEqual(['module settings "removed-module" (own settings of eGFR [ml/min/1,73m²])'])
  })
})

describe('corrupt lists and keys', () => {
  it('drops repeated parameter keys and names of Object.prototype among the display options', () => {
    const value = JSON.parse(JSON.stringify(saved())) as Record<string, any>
    value.trajectoryView.parameterKeys = [EGFR, EGFR]
    value.trajectoryView.trendKeys = [EGFR, EGFR]
    value.trajectoryView.fitKeys = [EGFR, EGFR]
    value.trajectoryView.display = { events: true, toString: true }
    const restored = restoreSavedSettings(value, keys)
    expect(restored.trajectoryView).toMatchObject({ parameterKeys: [EGFR], trendKeys: [EGFR], fitKeys: [EGFR] })
    expect(Object.keys(restored.trajectoryView.display)).toEqual(['events'])
    expect(restored.notRestored).toEqual(['display option "toString"'])
  })
})
