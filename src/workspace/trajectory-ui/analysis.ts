import { fitPresetCatalog } from '../../core/analysis/registry'
import { toFitConfig, type WorkspaceFitSettings } from '../workspace-analysis'
import type { WorkspaceParameter } from '../workspace-data'
import { STANDARD_PRESETS } from '../../core/analysis/fitConfig'

/** Specialist presets require an explicit parameter scope, never a shared default. */
export function presetsForScope(scope: string) {
  return scope === '' ? STANDARD_PRESETS : fitPresetCatalog
}

/** Trend activation changes calculation inputs; line visibility never does. */
export function trajectoryTrendConfig(settings: WorkspaceFitSettings, parameter: WorkspaceParameter, enabled: boolean) {
  const config = toFitConfig(settings, parameter)
  return enabled ? config : { ...config, fitModel: 'none' as const }
}
