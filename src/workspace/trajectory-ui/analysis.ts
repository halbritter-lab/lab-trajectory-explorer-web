import { fitPresetCatalog, type ColumnModuleSettings } from '../../core/analysis/registry'
import { toFitConfig, type TrajectoryFitSettings, type WorkspaceFitSettings } from '../workspace-analysis'
import type { WorkspaceParameter } from '../workspace-data'
import { STANDARD_PRESETS, type FitConfig } from '../../core/analysis/fitConfig'
import type { AnchorComparisonSettings } from '../../core/cohort/anchorComparison'

/** Specialist presets require an explicit parameter scope, never a shared default. */
export function presetsForScope(scope: string) {
  return scope === '' ? STANDARD_PRESETS : fitPresetCatalog
}

/** Trend activation changes calculation inputs; line visibility never does. */
export function trajectoryTrendConfig(settings: WorkspaceFitSettings, parameter: Pick<WorkspaceParameter, 'bezeichnung' | 'einheit'>, enabled: boolean) {
  const config = toFitConfig(settings, parameter)
  return enabled ? config : { ...config, fitModel: 'none' as const }
}

/** How the settings of one exported column are recorded: the settings that
 * apply to it, whether they are the shared or its own, and Trend. */
export interface ColumnSettingsRecord {
  settings: WorkspaceFitSettings
  source: 'shared' | 'own'
  trend: boolean
}

/** What the table and the workbook take from the stored settings for the
 * shown parameters. The one derivation for both, so the tests of the
 * analysis record cover the page's wiring. */
export function trajectoryColumnSettings(settings: TrajectoryFitSettings, parameters: readonly Pick<WorkspaceParameter, 'key' | 'bezeichnung' | 'einheit'>[], trendKeys: readonly string[]) {
  const fitConfigByParameterKey: Record<string, FitConfig> = {}
  const anchorComparisonByParameterKey: Record<string, AnchorComparisonSettings | undefined> = {}
  const moduleSettingsByParameterKey: Record<string, ColumnModuleSettings> = {}
  const columnSettingsByParameterKey: Record<string, ColumnSettingsRecord> = {}
  for (const parameter of parameters) {
    const own = settings.columns[parameter.key]
    const effective = own ?? settings.shared
    const trend = trendKeys.includes(parameter.key)
    fitConfigByParameterKey[parameter.key] = trajectoryTrendConfig(effective, parameter, trend)
    anchorComparisonByParameterKey[parameter.key] = effective.anchorComparison
    moduleSettingsByParameterKey[parameter.key] = effective.moduleSettings
    columnSettingsByParameterKey[parameter.key] = { settings: effective, source: own ? 'own' : 'shared', trend }
  }
  return { fitConfigByParameterKey, anchorComparisonByParameterKey, moduleSettingsByParameterKey, columnSettingsByParameterKey }
}
