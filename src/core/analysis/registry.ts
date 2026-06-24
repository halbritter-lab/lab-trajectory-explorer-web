import { akiModule } from './akiModule'
import { egfrModule } from './egfrModule'
import { rapidEgfrDeclineModule } from './rapidEgfrDeclineModule'
import type {
  AnalysisContribution,
  AnalysisModule,
  AnalysisResult,
  AnalysisSettings,
  ManualDemographics,
} from './types'
import type { ClinicalEvent } from '../events/events'
import type { LabRow } from '../types'

export const defaultAnalysisSettings = (): AnalysisSettings => ({
  egfr: { ...egfrModule.defaultSettings },
  aki: { ...akiModule.defaultSettings },
  rapidEgfrDecline: { ...rapidEgfrDeclineModule.defaultSettings },
})

export interface ComputeAnalysisResultOptions {
  rows: LabRow[]
  manualDemographics: Record<number, ManualDemographics>
  events: ClinicalEvent[]
  settings: AnalysisSettings
  modules?: readonly RegisteredAnalysisModule[]
}

export type RegisteredAnalysisModule = Pick<AnalysisModule<AnalysisSettings>, 'id' | 'label' | 'apply'>

function adaptModule<K extends keyof AnalysisSettings>(
  key: K,
  module: AnalysisModule<AnalysisSettings[K]>,
): RegisteredAnalysisModule {
  return {
    id: module.id,
    label: module.label,
    apply: (ctx, settings): AnalysisContribution => module.apply(ctx, settings[key]),
  }
}

export const analysisModules: readonly RegisteredAnalysisModule[] = [
  adaptModule('egfr', egfrModule),
  adaptModule('aki', akiModule),
  adaptModule('rapidEgfrDecline', rapidEgfrDeclineModule),
]

export function computeAnalysisResult({
  rows,
  manualDemographics,
  events,
  settings,
  modules = analysisModules,
}: ComputeAnalysisResultOptions): AnalysisResult {
  let currentRows = rows
  const result: AnalysisResult = {
    rows,
    messages: [],
    cohortFlags: [],
    overlays: [],
    fitInputs: [],
  }

  for (const module of modules) {
    const contribution = module.apply({ rows: currentRows, manualDemographics, events }, settings)
    if (contribution.rows) {
      currentRows = contribution.rows
      result.rows = contribution.rows
    }
    if (contribution.messages) result.messages.push(...contribution.messages)
    if (contribution.cohortFlags) result.cohortFlags.push(...contribution.cohortFlags)
    if (contribution.overlays) result.overlays.push(...contribution.overlays)
    if (contribution.fitInputs) result.fitInputs.push(...contribution.fitInputs)
  }

  return result
}
