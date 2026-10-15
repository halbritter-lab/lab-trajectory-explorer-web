// Preview configuration: explicit parameter assignment and independent trend activation.
import type { FitModel, TimeBalancing } from '../../src/core/fitPipeline/types'
import type { UnknownDialysisPolicy } from '../../src/core/domains/nephrology/fitConfig'
import type { WorkspaceParameter } from '../../src/workspace/workspace-data'
import { defaultFitSettings, type WorkspaceFitSettings } from '../../src/workspace/workspace-analysis'
import { ConfirmationDaysInput } from '../../src/workspace/ConfirmationDaysInput'
import { CKD_G4_EGFR_THRESHOLD, CKD_G5_EGFR_THRESHOLD, DEFAULT_CONFIRMATION_DAYS } from '../../src/core/domains/nephrology/constants'
import { RAPID_EGFR_DECLINE_MODULE_ID } from '../../src/core/domains/nephrology/rapidEgfrDeclineModule'
import { columnSettingModules, fitPresetById, fitPresetCatalog, type ColumnModuleSettings, type RegisteredAnalysisModule } from '../../src/core/analysis/registry'
import { FIT_PRESET_CATEGORY_LABELS, type FitPresetDefinition } from '../../src/core/analysis/fitConfig'
import { presetsForScope } from './preview-analysis'
import { isEgfrUnit } from '../../src/core/domains/nephrology/analytes'

/** Catalog presets grouped by category, in catalog order. */
const PRESET_GROUPS = [...new Set(fitPresetCatalog.map(preset => preset.category))]
  .map(category => [category, fitPresetCatalog.filter(preset => preset.category === category)] as [FitPresetDefinition['category'], FitPresetDefinition[]])

/** The options of a preset select, shared by Trajectories and Cohort models;
 * "Custom configuration" appears only while edited settings are in use. */
export function PresetOptions({ presetId, scope }: { presetId: string; scope: string }) {
  return <>
    {PRESET_GROUPS.filter(([category]) => scope !== '' || category === 'Standard').map(([category, presets]) => <optgroup key={category} label={category === 'Nephrology' ? 'Nephrology · assign to this parameter' : FIT_PRESET_CATEGORY_LABELS[category]}>
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
const ENDPOINT_GROUP_MODULES = new Set<string>([RAPID_EGFR_DECLINE_MODULE_ID])

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
  trendKeys: string[]
  onToggleTrend: (key: string) => void
}

export function QuietAnalysisSettings({ parameters, sharedSettings, overrides, scope, onScopeChange, onChange, onReset, trendKeys, onToggleTrend }: Props) {
  const fitSettings = overrides[scope] ?? sharedSettings
  const activeParameter = parameters.find(parameter => parameter.key === scope)
  const specialist = Boolean(scope && (fitPresetById(fitSettings.presetId)?.category === 'Nephrology' || fitSettings.exclusions.excludeAkiWindows || Object.values(fitSettings.censoring).some(value => value === true) || Object.values(fitSettings.endpoints).some(value => value === true)))
  const egfrEndpoints = specialist && isEgfrUnit(activeParameter?.einheit ?? null)
  const applyPreset = (id: string) => { if (presetsForScope(scope).some(preset => preset.id === id)) onChange(defaultFitSettings(id)) }
  const updateSettings = (patch: Partial<WorkspaceFitSettings>) => onChange({ ...fitSettings, ...patch, presetId: 'custom' })
  return (
    <div className="wt-preset-section pv-quiet-settings">
      <div className="wt-analysis-selectors">
        <label>Scope
          <select aria-label="Edit analysis settings for" value={scope} onChange={event => onScopeChange(event.target.value)}>
            <option value="">Shared general defaults</option>
            {parameters.map(parameter => <option key={parameter.key} value={parameter.key}>{parameter.label}{overrides[parameter.key] ? ' (own settings)' : ' (shared)'}</option>)}
          </select>
        </label>
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
          : 'General defaults only. Select a parameter to assign a specialist profile; independent settings stay unchanged.'}</p>
        {scope && overrides[scope] && <button type="button" onClick={onReset}>Use shared settings</button>}
      </div>
      <details className="wt-trend-visibility" aria-label="Trend analysis"><summary>Trend analysis <span>{trendKeys.filter(key => parameters.some(parameter => parameter.key === key)).length} / {parameters.length}</span></summary>
        <p className="wt-muted">Calculate the fit and slope for enabled parameters. Trend lines can be shown separately under View.</p>
        <div className="wt-fit-options">
          {parameters.map(parameter => {
            const settings = overrides[parameter.key] ?? sharedSettings
            return <label key={parameter.key}>
              <input type="checkbox" aria-label={`Analyse trend: ${parameter.label}`} disabled={settings.fitModel === 'none'} checked={trendKeys.includes(parameter.key)} onChange={() => onToggleTrend(parameter.key)} />
              <span>{parameter.label}<small>{fitModelLabel(settings.fitModel)}{settings.fitModel === 'none' ? ' — choose a fit method to enable' : ''}</small></span>
              {overrides[parameter.key] && <span className="wt-setting-origin" aria-hidden="true">Own settings</span>}
            </label>
          })}
        </div>
      </details>
      <details className="pv-preset-help"><summary>About this preset</summary><p>
          {fitPresetById(fitSettings.presetId)?.summary
            ?? (fitSettings.presetId === 'custom'
              ? 'Custom: tailored fit model, event censoring, exclusions, time balancing, or endpoints.'
              : fitPresetById('general_exploration')!.summary)}
        </p><p><a href="#methods/fits/choosing">Fit methods</a> · <a href="#methods/aki/timing">AKI exclusion windows</a></p></details>
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
          {specialist && <div className="wt-pipeline-group">
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
          </div>}
          {specialist && <div className="wt-pipeline-group">
            <h2>AKI exclusions (KDIGO)</h2>
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
          </div>}
          {egfrEndpoints && <div className="wt-pipeline-group">
            <h2>eGFR endpoints & thresholds</h2>
            <p className="wt-muted">Applies only to parameters with eGFR units.</p>
            <p className="wt-muted">Endpoints and prediction use exact dated eGFR measurements before the first transplant or chronic dialysis start, excluding complete dated acute dialysis intervals. Later values after acute dialysis remain eligible. Values marked &lt; or &gt; are excluded. Display-fit AKI exclusions and aggregation do not apply. Kidney failure reached is reported separately from observed G5.</p>
            <label><input type="checkbox" aria-label="Observed CKD G4" checked={fitSettings.endpoints.observedCkdG4 ?? false} onChange={e => updateSettings({ endpoints: { ...fitSettings.endpoints, observedCkdG4: e.target.checked } })} />Observed CKD G4</label>
            <label>Minimum confirmation interval (days)
              <ConfirmationDaysInput value={fitSettings.endpoints.confirmationDays ?? DEFAULT_CONFIRMATION_DAYS} onChange={days => updateSettings({ endpoints: { ...fitSettings.endpoints, confirmationDays: days } })} />
            </label>
            <p className="wt-muted">G4: below {CKD_G4_EGFR_THRESHOLD}; G5: below {CKD_G5_EGFR_THRESHOLD} mL/min/1.73m². Confirm within 12 calendar months of the first crossing. Recovery before confirmation restarts the candidate. Recovery afterwards is shown separately and preserves the confirmed event.</p>
            <label>
              <input
                type="checkbox"
                aria-label="Percent eGFR decline"
                checked={fitSettings.endpoints.percentDecline}
                onChange={e => updateSettings({
                  endpoints: { ...fitSettings.endpoints, percentDecline: e.target.checked }
                })}
              />
              Percent eGFR decline (total change and confirmed 40% / 57% events)
            </label>
            <p className="wt-muted">Confirmed decline uses the mean of eligible eGFR values in the first 90 elapsed UTC days, inclusive. Candidate events start after that window. A 57% decline is a serum-creatinine doubling surrogate.</p>
            <label>
              <input
                type="checkbox"
                aria-label="Observed CKD G5"
                checked={fitSettings.endpoints.observedCkdG5}
                onChange={e => updateSettings({
                  endpoints: { ...fitSettings.endpoints, observedCkdG5: e.target.checked }
                })}
              />
              Observed CKD G5
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="Projected age to CKD G5"
                checked={fitSettings.endpoints.projectedAgeToCkdG5}
                onChange={e => updateSettings({
                  endpoints: { ...fitSettings.endpoints, projectedAgeToCkdG5: e.target.checked }
                })}
              />
              Projected age to CKD G5
            </label>
            <ModuleSettingInputs
              modules={columnSettingModules().filter(module => ENDPOINT_GROUP_MODULES.has(module.id))}
              settings={fitSettings.moduleSettings}
              onChange={moduleSettings => updateSettings({ moduleSettings })}
            />
          </div>}
          {columnSettingModules().filter(module => specialist && !ENDPOINT_GROUP_MODULES.has(module.id)).map(module => <div key={module.id} className="wt-pipeline-group">
            <h2>{module.label}</h2>
            <ModuleSettingInputs modules={[module]} settings={fitSettings.moduleSettings} onChange={moduleSettings => updateSettings({ moduleSettings })} />
          </div>)}
        </div>
      </details>

    </div>
  )
}
