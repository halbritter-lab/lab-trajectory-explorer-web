// Contextual editor; optional module adapters own domain-specific configuration.
import type { FitModel, TimeBalancing } from '../../core/fitPipeline/types'
import type { WorkspaceParameter } from '../workspace-data'
import { defaultFitSettings, type WorkspaceFitSettings } from '../workspace-analysis'
import { fitPresetById } from '../../core/analysis/registry'
import { FIT_PRESET_CATEGORY_LABELS } from '../../core/analysis/fitConfig'
import { presetsForScope } from './analysis'
import { AnalysisModuleSettings } from './analysis-modules'

function PresetOptions({ presetId, scope }: { presetId: string; scope: string }) {
  const presets = presetsForScope(scope)
  const categories = [...new Set(presets.map(preset => preset.category))]
  return <>{categories.map(category => <optgroup key={category} label={FIT_PRESET_CATEGORY_LABELS[category]}>
    {presets.filter(preset => preset.category === category).map(preset => <option key={preset.id} value={preset.id}>{preset.optionLabel}</option>)}
  </optgroup>)}{presetId === 'custom' && <option value="custom">Custom configuration</option>}</>
}

interface Props {
  parameters: WorkspaceParameter[]
  sharedSettings: WorkspaceFitSettings
  overrides: Record<string, WorkspaceFitSettings>
  scope: string
  onChange: (settings: WorkspaceFitSettings) => void
  onReset: () => void
}

export function QuietAnalysisSettings({ parameters, sharedSettings, overrides, scope, onChange, onReset }: Props) {
  const fitSettings = overrides[scope] ?? sharedSettings
  const activeParameter = parameters.find(parameter => parameter.key === scope)
  const applyPreset = (id: string) => { if (presetsForScope(scope).some(preset => preset.id === id)) onChange(defaultFitSettings(id)) }
  const updateSettings = (patch: Partial<WorkspaceFitSettings>) => onChange({ ...fitSettings, ...patch, presetId: 'custom' })
  return (
    <div className="wt-preset-section pv-quiet-settings">
      <div className="wt-analysis-selectors">

        <label>Preset
          <select
            aria-label="Analysis preset"
            value={fitSettings.presetId}
            onChange={event => applyPreset(event.target.value)}
          >
            <PresetOptions presetId={fitSettings.presetId} scope={scope} />
          </select>
        </label>

      </div>
      <div className="wt-analysis-scope" role="status">
        <p>{scope
          ? overrides[scope]
            ? 'Independent settings for this parameter.'
            : 'Editing creates independent settings for this parameter.'
          : 'General defaults only. Open a parameter’s settings to assign a specialist profile; independent settings stay unchanged.'}</p>
        {scope && overrides[scope] && <button type="button" onClick={onReset}>Use shared settings</button>}
      </div>

      <details className="pv-preset-help"><summary>About this preset</summary><p>
          {fitPresetById(fitSettings.presetId)?.summary
            ?? (fitSettings.presetId === 'custom'
              ? 'Custom calculation settings for this parameter.'
              : fitPresetById('general_exploration')!.summary)}
        </p><p><a href="#methods/fits/choosing">Fit methods</a></p></details>
      <details className="wt-advanced-settings">
        <summary>Calculation settings</summary>
        <div className="wt-pipeline-grid">
          <div className="wt-pipeline-group">
            <h2>Trend model</h2>
            <label>Model
              <select
                aria-label="Fit model"
                value={fitSettings.fitModel}
                onChange={e => updateSettings({ fitModel: e.target.value as FitModel })}
              >
                <option value="ols">OLS (Ordinary Least Squares)</option>
                <option value="theil-sen">Theil–Sen (robust median slope)</option>
                <option value="rolling-ols">Rolling OLS</option>
                <option value="segmented-ols">Segmented OLS</option>
                <option value="none">None (no fit line)</option>
              </select>
            </label>

            <label>Aggregation
              <select
                aria-label="Time balancing"
                value={fitSettings.timeBalancing}
                onChange={e => updateSettings({ timeBalancing: e.target.value as TimeBalancing })}
              >
                <option value="raw">Raw (unweighted points)</option>
                <option value="monthly-median">Monthly median</option>
                <option value="quarterly-median">Quarterly median</option>
              </select>
            </label>
          </div>
          {activeParameter && <AnalysisModuleSettings parameter={activeParameter} settings={fitSettings} onUpdate={updateSettings} />}
        </div>
      </details>

    </div>
  )
}
