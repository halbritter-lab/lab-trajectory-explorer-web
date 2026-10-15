import { fitPresetCatalog } from '../../src/core/analysis/registry'
import { toFitConfig, type WorkspaceFitSettings } from '../../src/workspace/workspace-analysis'
import type { WorkspaceParameter } from '../../src/workspace/workspace-data'

/** Specialist presets require an explicit parameter scope, never a shared default. */
export function presetsForScope(scope: string) {
  return fitPresetCatalog.filter(preset => scope !== '' || preset.category === 'Standard')
}

/** Trend activation changes calculation inputs; line visibility never does. */
export function previewTrendConfig(settings: WorkspaceFitSettings, parameter: WorkspaceParameter, enabled: boolean) {
  const config = toFitConfig(settings, parameter)
  return enabled ? config : { ...config, fitModel: 'none' as const }
}
