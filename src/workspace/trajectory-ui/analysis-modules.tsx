import type { ReactNode } from 'react'
import { columnSettingModules, type RegisteredAnalysisModule } from '../../core/analysis/registry'
import type { WorkspaceParameter } from '../workspace-data'
import type { WorkspaceFitSettings } from '../workspace-analysis'
import { NEPHROLOGY_PRESETS } from '../../core/domains/nephrology/fitConfig'
import { RAPID_EGFR_DECLINE_MODULE_ID } from '../../core/domains/nephrology/rapidEgfrDeclineModule'
import { NephrologySettings } from './NephrologySettings'
import { isEgfrUnit } from '../../core/domains/nephrology/analytes'
import { isAkiCreatinineSource } from '../../core/domains/nephrology/aki/akiAware'
import { ModuleSettingInputs } from './ModuleSettingInputs'

export interface AnalysisAdapterProps {
  parameter: WorkspaceParameter
  settings: WorkspaceFitSettings
  onUpdate: (patch: Partial<WorkspaceFitSettings>) => void
}

/** UI composition seam: shared editors know the contract, not individual domains. */
export interface AnalysisSettingsAdapter {
  id: string
  ownsColumnFields?: readonly string[]
  isConfigured: (settings: WorkspaceFitSettings) => boolean
  /** Parameters whose settings always show this module's options, so an
   * exclusion can be chosen without first choosing the module's preset. */
  appliesTo?: (parameter: WorkspaceParameter) => boolean
  render: (props: AnalysisAdapterProps) => ReactNode
}

export const analysisSettingsAdapters: readonly AnalysisSettingsAdapter[] = [{
  id: 'nephrology',
  ownsColumnFields: [RAPID_EGFR_DECLINE_MODULE_ID],
  isConfigured: settings => NEPHROLOGY_PRESETS.some(preset => preset.id === settings.presetId)
    || settings.exclusions.excludeAkiWindows
    || Object.values(settings.censoring).some(value => value === true)
    || settings.censoring.unknownDialysisPolicy !== 'flag-only'
    || Object.values(settings.endpoints).some(value => value === true),
  appliesTo: parameter => isEgfrUnit(parameter.einheit) || isAkiCreatinineSource(parameter.bezeichnung, parameter.einheit),
  render: props => <NephrologySettings {...props} />,
}]

export function applicableColumnModules(parameter: WorkspaceParameter, modules: readonly RegisteredAnalysisModule[], adapters: readonly AnalysisSettingsAdapter[]) {
  const owned = new Set(adapters.flatMap(adapter => adapter.ownsColumnFields ?? []))
  return modules.filter(module => !owned.has(module.id) && (!module.appliesTo || module.appliesTo(parameter)))
}

export function AnalysisModuleSettings(props: AnalysisAdapterProps & { adapters?: readonly AnalysisSettingsAdapter[] }) {
  const adapters = props.adapters ?? analysisSettingsAdapters
  return <>
    {adapters.filter(adapter => adapter.isConfigured(props.settings) || adapter.appliesTo?.(props.parameter)).map(adapter => <div key={adapter.id} className="pv-module-settings" data-module={adapter.id}>{adapter.render(props)}</div>)}
    {applicableColumnModules(props.parameter, columnSettingModules(), adapters).map(module => <section className="wt-pipeline-group" key={module.id} data-module={module.id}>
      <h2>{module.label}</h2><ModuleSettingInputs modules={[module]} settings={props.settings.moduleSettings} onChange={moduleSettings => props.onUpdate({ moduleSettings })} />
    </section>)}
  </>
}
