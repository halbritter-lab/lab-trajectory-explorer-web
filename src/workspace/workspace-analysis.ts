import type { FitConfig } from '../core/analysis/fitConfig'
import type { FitModel, TimeBalancing } from '../core/fitPipeline/types'
import { defaultColumnModuleSettings, fitPresetById, fitPresetCatalog, type ColumnModuleSettings } from '../core/analysis/registry'

/** The analysis presets offered in the workspace (core catalog). */
export const ANALYSIS_CATALOG = fitPresetCatalog

export interface WorkspaceFitSettings {
  presetId: string
  fitModel: FitModel
  timeBalancing: TimeBalancing
  censoring: FitConfig['censoring']
  exclusions: FitConfig['exclusions']
  endpoints: FitConfig['endpoints']
  /** The column's own module settings (e.g. its rapid-decline threshold). */
  moduleSettings: ColumnModuleSettings
}

const PRESET_PARAMETER = { bezeichnung: '', einheit: null }

/** A preset's settings, built by the core preset (unknown ids fall back to
 * general exploration), plus default module settings. */
export function defaultFitSettings(presetId: string = 'general_exploration'): WorkspaceFitSettings {
  const preset = fitPresetById(presetId) ?? fitPresetById('general_exploration')!
  const config = preset.buildConfig(PRESET_PARAMETER)
  return {
    presetId: preset.id,
    fitModel: config.fitModel,
    timeBalancing: config.timeBalancing,
    censoring: { ...config.censoring },
    exclusions: { ...config.exclusions },
    endpoints: { ...config.endpoints },
    moduleSettings: defaultColumnModuleSettings(),
  }
}

/** The column's fit configuration. Preset identity and x axis come from the
 * selected catalog preset; edited settings are recorded as 'custom'. */
export function toFitConfig(
  settings: WorkspaceFitSettings,
  parameter: { bezeichnung: string; einheit: string | null },
): FitConfig {
  const preset = fitPresetById(settings.presetId)?.buildConfig(parameter)
  return {
    parameter,
    preset: preset?.preset ?? 'custom',
    xAxis: preset?.xAxis ?? 'calendar_time',
    censoring: { ...settings.censoring },
    exclusions: { ...settings.exclusions },
    timeBalancing: settings.timeBalancing,
    fitModel: settings.fitModel,
    endpoints: { ...settings.endpoints },
  }
}

export { endpointBadge } from './labels/endpointLabels'
