import { describe, expect, it } from 'vitest'
import { defaultTrajectoryView, losesDataOnUnload, restoreSavedSettings, SAVED_SETTINGS_VERSION, type SavedSettings } from '../../src/workspace/saved-settings'
import { defaultFitSettings, defaultTrajectoryFitSettings } from '../../src/workspace/workspace-analysis'

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
    expect(restoreSavedSettings(undefined, keys)).toEqual({ trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: defaultTrajectoryView(), notRestored: [] })
  })

  it('discards settings of another settings version as a whole', () => {
    const restored = restoreSavedSettings({ ...saved(), version: SAVED_SETTINGS_VERSION + 1 }, keys)
    expect(restored.trajectoryFitSettings).toEqual(defaultTrajectoryFitSettings())
    expect(restored.trajectoryView).toEqual(defaultTrajectoryView())
    expect(restored.notRestored).toEqual(['all analysis settings (saved by another version)'])
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
    for (const change of [{ presetId: 'removed_preset' }, { timeBalancing: 'weekly' }, { exclusions: { excludeAkiWindows: true, akiExclusionDays: -1 } }, { moduleSettings: { unknownModule: {} } }]) {
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
})
