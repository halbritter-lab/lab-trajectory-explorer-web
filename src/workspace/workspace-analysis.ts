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

/** The analysis settings chosen under Trajectories: the shared settings and
 * each parameter's own settings, by parameter key. Cohort models prepare
 * their measurements with the same settings (decided 2026-10-07). */
export interface TrajectoryFitSettings {
  shared: WorkspaceFitSettings
  columns: Record<string, WorkspaceFitSettings>
}

export function defaultTrajectoryFitSettings(): TrajectoryFitSettings {
  return { shared: defaultFitSettings(), columns: {} }
}

/** The fit configuration Trajectories applies to one parameter: its own
 * settings when it has some, otherwise the shared ones. */
export function trajectoryFitConfig(
  settings: TrajectoryFitSettings,
  parameter: { key: string; bezeichnung: string; einheit: string | null },
): FitConfig {
  return toFitConfig(settings.columns[parameter.key] ?? settings.shared, { bezeichnung: parameter.bezeichnung, einheit: parameter.einheit })
}

/** The part of the settings that decides which measurements a cohort model
 * receives. Endpoint and badge settings do not belong to it. */
export function modelPreparationKey(settings: TrajectoryFitSettings): string {
  const part = (s: WorkspaceFitSettings) => ({ fitModel: s.fitModel, timeBalancing: s.timeBalancing, censoring: s.censoring, exclusions: s.exclusions })
  return JSON.stringify({ shared: part(settings.shared), columns: Object.keys(settings.columns).sort().map(key => [key, part(settings.columns[key])]) })
}

const TIME_BALANCING_TEXT: Record<TimeBalancing, string> = {
  raw: 'individual measurements',
  'monthly-median': 'monthly medians',
  'quarterly-median': 'quarterly medians',
}

/** One sentence on how a fit configuration prepares the measurements of a
 * cohort model, for the Cohort models page. */
export function describeModelPreparation(config: FitConfig): string {
  const name = config.preset === 'custom' ? 'Own settings' : fitPresetById(config.preset)?.name ?? config.preset
  if (config.fitModel === 'none') return `${name}: no fit, so no cohort model is prepared for this parameter.`
  const c = config.censoring
  const events = [
    c.censorAfterKidneyTransplant ? 'after kidney transplant' : null,
    c.censorAfterChronicDialysis ? 'after chronic dialysis start' : null,
    c.excludeAcuteDialysisPeriods ? 'acute dialysis intervals' : null,
    c.unknownDialysisPolicy === 'exclude-dated-interval' ? 'dated dialysis of unknown intent' : c.unknownDialysisPolicy === 'censor-from-start' ? 'from dialysis of unknown intent' : null,
  ].filter(Boolean)
  return `${name}: ${TIME_BALANCING_TEXT[config.timeBalancing]}; `
    + `event windows ${events.length ? events.join(', ') : 'none'}; `
    + `AKI windows ${config.exclusions.excludeAkiWindows ? `${config.exclusions.akiExclusionDays} days` : 'none'}.`
}

export { endpointBadge } from './labels/endpointLabels'
