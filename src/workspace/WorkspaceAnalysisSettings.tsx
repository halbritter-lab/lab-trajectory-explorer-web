import type { FitModel, TimeBalancing } from '../core/fitPipeline/types'
import type { BoundedValuePolicy } from '../core/measurements/censored'
import type { UnknownDialysisPolicy } from '../core/domains/nephrology/fitConfig'
import type { WorkspaceParameter } from './workspace-data'
import { defaultFitSettings, type WorkspaceFitSettings } from './workspace-analysis'
import { EndpointSettings, ENDPOINT_GROUP_MODULES } from './trajectory-ui/EndpointSettings'
import { columnSettingModules, fitPresetById, fitPresetCatalog, type ColumnModuleSettings, type RegisteredAnalysisModule } from '../core/analysis/registry'
import { FIT_PRESET_CATEGORY_LABELS, type FitPresetDefinition } from '../core/analysis/fitConfig'

/** Catalog presets grouped by category, in catalog order. */
const PRESET_GROUPS = [...new Set(fitPresetCatalog.map(preset => preset.category))]
  .map(category => [category, fitPresetCatalog.filter(preset => preset.category === category)] as [FitPresetDefinition['category'], FitPresetDefinition[]])

/** The options of a preset select, shared by Trajectories and Cohort models;
 * "Custom configuration" appears only while edited settings are in use. */
export function PresetOptions({ presetId }: { presetId: string }) {
  return <>
    {PRESET_GROUPS.map(([category, presets]) => <optgroup key={category} label={FIT_PRESET_CATEGORY_LABELS[category]}>
      {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.optionLabel}</option>)}
    </optgroup>)}
    {presetId === 'custom' && (
      <optgroup label="Custom">
        <option value="custom">Custom configuration</option>
      </optgroup>
    )}
  </>
}

/** Column settings of the eGFR endpoint group; every other module with column
 * settings gets its own group after the built-in ones. */

/** Plain inputs for modules' column settings, described by the modules. */
function ModuleSettingInputs({ modules, settings, onChange }: {
  modules: readonly RegisteredAnalysisModule[]
  settings: ColumnModuleSettings
  onChange: (settings: ColumnModuleSettings) => void
}) {
  return <>{modules.flatMap(module => (module.columnSettingFields ?? []).map(field => {
    const current = ((settings as Record<string, Record<string, unknown> | undefined>)[module.id] ?? module.defaultSettings) as Record<string, unknown>
    const set = (value: unknown) => onChange({ ...settings, [module.id]: { ...current, [field.key]: value } })
    return field.kind === 'number'
      ? <label key={`${module.id}.${field.key}`}>{field.label}
          <input
            type="number"
            min={field.min}
            step={field.step}
            aria-label={field.ariaLabel}
            value={current[field.key] as number}
            onChange={e => set(Math.max(field.min ?? -Infinity, Number(e.target.value) || 0))}
          />
        </label>
      : <label key={`${module.id}.${field.key}`}>
          <input type="checkbox" aria-label={field.ariaLabel} checked={Boolean(current[field.key])} onChange={e => set(e.target.checked)} />
          {field.label}
        </label>
  }))}</>
}

function fitModelLabel(model: FitModel): string {
  if (model === 'none') return 'No fit line'
  const name = model === 'theil-sen' ? 'Theil–Sen' : model === 'rolling-ols' ? 'Rolling OLS' : model === 'segmented-ols' ? 'Segmented OLS' : 'OLS'
  return `${name}, slope and R²`
}

interface Props {
  parameters: WorkspaceParameter[]
  sharedSettings: WorkspaceFitSettings
  overrides: Record<string, WorkspaceFitSettings>
  scope: string
  onScopeChange: (key: string) => void
  onChange: (settings: WorkspaceFitSettings) => void
  onReset: () => void
  fitKeys: string[]
  onToggleFit: (key: string) => void
}

export function WorkspaceAnalysisSettings({ parameters, sharedSettings, overrides, scope, onScopeChange, onChange, onReset, fitKeys, onToggleFit }: Props) {
  const fitSettings = overrides[scope] ?? sharedSettings
  const applyPreset = (id: string) => onChange(defaultFitSettings(id))
  const updateSettings = (patch: Partial<WorkspaceFitSettings>) => onChange({ ...fitSettings, ...patch, presetId: 'custom' })
  return (
    <div className="wt-preset-section"><p>Background: <a href="#methods/fits/choosing">choosing a fit model</a> and <a href="#methods/aki/timing">AKI exclusion windows</a>.</p>
      <div className="wt-analysis-selectors">
        <label>Edit settings for
          <select aria-label="Edit analysis settings for" value={scope} onChange={event => onScopeChange(event.target.value)}>
            <option value="">Shared settings</option>
            {parameters.map(parameter => <option key={parameter.key} value={parameter.key}>{parameter.label}{overrides[parameter.key] ? ' (own settings)' : ' (shared)'}</option>)}
          </select>
        </label>
        <label>Analysis preset
          <select
            aria-label="Analysis preset"
            value={fitSettings.presetId}
            onChange={event => applyPreset(event.target.value)}
          >
            <PresetOptions presetId={fitSettings.presetId} />
          </select>
        </label>

      </div>
      <div className="wt-analysis-scope" role="status">
        <p>{scope
          ? overrides[scope]
            ? 'Own settings for this column. Changes to shared settings do not affect it.'
            : 'This column uses shared settings. Editing here creates an independent configuration.'
          : 'Defaults for all columns using shared settings, including newly added columns. Columns with own settings stay unchanged.'}</p>
        {scope && overrides[scope] && <button type="button" onClick={onReset}>Use shared settings</button>}
      </div>
        <span className="wt-muted">
          {fitPresetById(fitSettings.presetId)?.summary
            ?? (fitSettings.presetId === 'custom'
              ? 'Custom: tailored fit model, event censoring, exclusions, time balancing, or endpoints.'
              : fitPresetById('general_exploration')!.summary)}
        </span>
      <details className="wt-advanced-settings">
        <summary>Advanced pipeline settings</summary>
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

            <label>Bounded values (&lt;x, &gt;x)
              <select
                aria-label="Bounded values"
                value={fitSettings.boundedValues}
                onChange={e => updateSettings({ boundedValues: e.target.value as BoundedValuePolicy })}
              >
                <option value="limit">Limit: enter at x</option>
                <option value="half-limit">Half limit: &lt;x at x/2, &gt;x at x</option>
                <option value="exclude">Exclude from the fit</option>
              </select>
            </label>
            <p className="wt-muted">How values reported as &lt;x or &gt;x enter this parameter’s slope and trend line. Endpoints, AKI detection and cohort models leave them out whatever is chosen.</p>
          </div>
          <div className="wt-pipeline-group">
            <h2>Clinical events & censoring</h2>
            <label>
              <input
                type="checkbox"
                aria-label="Censor after kidney transplant"
                checked={fitSettings.censoring.censorAfterKidneyTransplant}
                onChange={e => updateSettings({
                  censoring: { ...fitSettings.censoring, censorAfterKidneyTransplant: e.target.checked }
                })}
              />
              Censor after kidney transplant
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="Censor after chronic dialysis"
                checked={fitSettings.censoring.censorAfterChronicDialysis}
                onChange={e => updateSettings({
                  censoring: { ...fitSettings.censoring, censorAfterChronicDialysis: e.target.checked }
                })}
              />
              Censor after chronic dialysis
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="Exclude acute dialysis intervals"
                checked={fitSettings.censoring.excludeAcuteDialysisPeriods}
                onChange={e => updateSettings({
                  censoring: { ...fitSettings.censoring, excludeAcuteDialysisPeriods: e.target.checked }
                })}
              />
              Exclude acute dialysis intervals
            </label>
            <label>Unknown dialysis
              <select
                aria-label="Unknown dialysis policy"
                value={fitSettings.censoring.unknownDialysisPolicy}
                onChange={e => updateSettings({
                  censoring: { ...fitSettings.censoring, unknownDialysisPolicy: e.target.value as UnknownDialysisPolicy }
                })}
              >
                <option value="flag-only">Flag only</option>
                <option value="exclude-dated-interval">Exclude dated interval</option>
                <option value="censor-from-start">Censor from start</option>
              </select>
            </label>
          </div>
          <div className="wt-pipeline-group">
            <h2>AKI exclusion windows</h2>
            <p className="wt-muted">Episodes are detected with the KDIGO creatinine criteria. The length of the window is a rule of this tool.</p>
            <label>
              <input
                type="checkbox"
                aria-label="Exclude AKI windows from fit"
                checked={fitSettings.exclusions.excludeAkiWindows}
                onChange={e => updateSettings({
                  exclusions: { ...fitSettings.exclusions, excludeAkiWindows: e.target.checked }
                })}
              />
              Exclude AKI windows from fit
            </label>
            <label>Exclusion window (days)
              <input
                type="number"
                min={0}
                aria-label="AKI exclusion days"
                disabled={!fitSettings.exclusions.excludeAkiWindows}
                value={fitSettings.exclusions.akiExclusionDays}
                onChange={e => updateSettings({
                  exclusions: { ...fitSettings.exclusions, akiExclusionDays: Math.max(0, Number(e.target.value) || 0) }
                })}
              />
            </label>
          </div>
          <EndpointSettings settings={fitSettings} onUpdate={updateSettings} />
          {columnSettingModules().filter(module => !ENDPOINT_GROUP_MODULES.has(module.id)).map(module => <div key={module.id} className="wt-pipeline-group">
            <h2>{module.label}</h2>
            <ModuleSettingInputs modules={[module]} settings={fitSettings.moduleSettings} onChange={moduleSettings => updateSettings({ moduleSettings })} />
          </div>)}
        </div>
      </details>
      <section className="wt-trend-visibility" aria-label="Trend visibility">
        <h2>Show trends and slopes for</h2>
        <p className="wt-muted">Display only; the analysis settings above apply even when a trend is hidden.</p>
        <div className="wt-fit-options">
          {parameters.map(parameter => {
            const settings = overrides[parameter.key] ?? sharedSettings
            return <label key={parameter.key}>
              <input type="checkbox" checked={fitKeys.includes(parameter.key)} onChange={() => onToggleFit(parameter.key)} />
              {fitModelLabel(settings.fitModel)}: {parameter.label}
              {overrides[parameter.key] && <span className="wt-setting-origin" aria-hidden="true">Own settings</span>}
            </label>
          })}
        </div>
      </section>
    </div>
  )
}
