import type { FitModel, TimeBalancing } from '../core/fitPipeline/types'
import type { BoundedValuePolicy } from '../core/measurements/censored'
import type { UnknownDialysisPolicy } from '../core/domains/nephrology/fitConfig'
import type { WorkspaceParameter } from './workspace-data'
import { defaultFitSettings, type WorkspaceFitSettings } from './workspace-analysis'
import { EndpointSettings, ENDPOINT_GROUP_MODULES } from './trajectory-ui/EndpointSettings'
import { DEFAULT_AKI_DAYS_AFTER_END } from '../core/domains/nephrology/constants'
import { columnSettingModules, fitPresetById, fitPresetCatalog, type ColumnModuleSettings, type RegisteredAnalysisModule } from '../core/analysis/registry'
import { FIT_PRESET_CATEGORY_LABELS, type FitPresetDefinition } from '../core/analysis/fitConfig'
import { t, tx } from '../i18n'

/** Catalog presets grouped by category, in catalog order. */
const PRESET_GROUPS = [...new Set(fitPresetCatalog.map(preset => preset.category))]
  .map(category => [category, fitPresetCatalog.filter(preset => preset.category === category)] as [FitPresetDefinition['category'], FitPresetDefinition[]])

/** The options of a preset select, shared by Trajectories and Cohort models;
 * "Custom configuration" appears only while edited settings are in use. */
export function PresetOptions({ presetId }: { presetId: string }) {
  return <>
    {PRESET_GROUPS.map(([category, presets]) => <optgroup key={category} label={tx(FIT_PRESET_CATEGORY_LABELS[category])}>
      {presets.map(preset => <option key={preset.id} value={preset.id}>{tx(preset.optionLabel)}</option>)}
    </optgroup>)}
    {presetId === 'custom' && (
      <optgroup label={t('Custom')}>
        <option value="custom">{t('Custom configuration')}</option>
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
      ? <label key={`${module.id}.${field.key}`}>{tx(field.label)}
          <input
            type="number"
            min={field.min}
            step={field.step}
            aria-label={field.ariaLabel && tx(field.ariaLabel)}
            value={current[field.key] as number}
            onChange={e => set(Math.max(field.min ?? -Infinity, Number(e.target.value) || 0))}
          />
        </label>
      : <label key={`${module.id}.${field.key}`}>
          <input type="checkbox" aria-label={field.ariaLabel && tx(field.ariaLabel)} checked={Boolean(current[field.key])} onChange={e => set(e.target.checked)} />
          {tx(field.label)}
        </label>
  }))}</>
}

function fitModelLabel(model: FitModel): string {
  if (model === 'none') return t('No fit line')
  const name = model === 'theil-sen' ? 'Theil–Sen' : model === 'rolling-ols' ? 'Rolling OLS' : model === 'segmented-ols' ? 'Segmented OLS' : 'OLS'
  return t('{model}, slope and R²', { model: name })
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
    <div className="wt-preset-section"><p>{t('Background:')} <a href="#methods/fits/choosing">{t('choosing a fit model')}</a> {t('and')} <a href="#methods/aki/timing">{t('AKI exclusion windows')}</a>.</p>
      <div className="wt-analysis-selectors">
        <label>{t('Edit settings for')}
          <select aria-label={t('Edit analysis settings for')} value={scope} onChange={event => onScopeChange(event.target.value)}>
            <option value="">{t('Shared settings')}</option>
            {parameters.map(parameter => <option key={parameter.key} value={parameter.key}>{parameter.label}{overrides[parameter.key] ? ` ${t('(own settings)')}` : ` ${t('(shared)')}`}</option>)}
          </select>
        </label>
        <label>{t('Analysis preset')}
          <select
            aria-label={t('Analysis preset')}
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
            ? t('Own settings for this column. Changes to shared settings do not affect it.')
            : t('This column uses shared settings. Editing here creates an independent configuration.')
          : t('Defaults for all columns using shared settings, including newly added columns. Columns with own settings stay unchanged.')}</p>
        {scope && overrides[scope] && <button type="button" onClick={onReset}>{t('Use shared settings')}</button>}
      </div>
        <span className="wt-muted">
          {tx(fitPresetById(fitSettings.presetId)?.summary
            ?? (fitSettings.presetId === 'custom'
              ? t('Custom: tailored fit model, event censoring, exclusions, time balancing, or endpoints.')
              : fitPresetById('general_exploration')!.summary))}
        </span>
      <details className="wt-advanced-settings">
        <summary>{t('Advanced pipeline settings')}</summary>
        <div className="wt-pipeline-grid">
          <div className="wt-pipeline-group">
            <h2>{t('Trend model')}</h2>
            <label>{t('Model')}
              <select
                aria-label={t('Fit model')}
                value={fitSettings.fitModel}
                onChange={e => updateSettings({ fitModel: e.target.value as FitModel })}
              >
                <option value="ols">{t('OLS (Ordinary Least Squares)')}</option>
                <option value="theil-sen">{t('Theil–Sen (robust median slope)')}</option>
                <option value="rolling-ols">{t('Rolling OLS')}</option>
                <option value="segmented-ols">{t('Segmented OLS')}</option>
                <option value="none">{t('None (no fit line)')}</option>
              </select>
            </label>

            <label>{t('Aggregation')}
              <select
                aria-label={t('Time balancing')}
                value={fitSettings.timeBalancing}
                onChange={e => updateSettings({ timeBalancing: e.target.value as TimeBalancing })}
              >
                <option value="raw">{t('Raw (unweighted points)')}</option>
                <option value="monthly-median">{t('Monthly median')}</option>
                <option value="quarterly-median">{t('Quarterly median')}</option>
              </select>
            </label>

            <label>{t('Bounded values (<x, >x)')}
              <select
                aria-label={t('Bounded values')}
                value={fitSettings.boundedValues}
                onChange={e => updateSettings({ boundedValues: e.target.value as BoundedValuePolicy })}
              >
                <option value="limit">{t('Limit: enter at x')}</option>
                <option value="half-limit">{t('Half limit: <x at x/2, >x at x')}</option>
                <option value="exclude">{t('Exclude from the fit')}</option>
              </select>
            </label>
            <p className="wt-muted">{t('How values reported as <x or >x enter this parameter’s slope and trend line. Endpoints, AKI detection and cohort models leave them out whatever is chosen.')}</p>
          </div>
          <div className="wt-pipeline-group">
            <h2>{t('Clinical events & censoring')}</h2>
            <label>
              <input
                type="checkbox"
                aria-label={t('Censor after kidney transplant')}
                checked={fitSettings.censoring.censorAfterKidneyTransplant}
                onChange={e => updateSettings({
                  censoring: { ...fitSettings.censoring, censorAfterKidneyTransplant: e.target.checked }
                })}
              />
              {t('Censor after kidney transplant')}
            </label>
            <label>
              <input
                type="checkbox"
                aria-label={t('Censor after chronic dialysis')}
                checked={fitSettings.censoring.censorAfterChronicDialysis}
                onChange={e => updateSettings({
                  censoring: { ...fitSettings.censoring, censorAfterChronicDialysis: e.target.checked }
                })}
              />
              {t('Censor after chronic dialysis')}
            </label>
            <p className="wt-muted">{t('Unticked, the values from the first kidney transplant or chronic dialysis start on are fitted as a separate segment; the slope of the parameter stays that of the values before it.')}</p>
            <label>
              <input
                type="checkbox"
                aria-label={t('Exclude acute dialysis intervals')}
                checked={fitSettings.censoring.excludeAcuteDialysisPeriods}
                onChange={e => updateSettings({
                  censoring: { ...fitSettings.censoring, excludeAcuteDialysisPeriods: e.target.checked }
                })}
              />
              {t('Exclude acute dialysis intervals')}
            </label>
            <label>{t('Unknown dialysis')}
              <select
                aria-label={t('Unknown dialysis policy')}
                value={fitSettings.censoring.unknownDialysisPolicy}
                onChange={e => updateSettings({
                  censoring: { ...fitSettings.censoring, unknownDialysisPolicy: e.target.value as UnknownDialysisPolicy }
                })}
              >
                <option value="flag-only">{t('Flag only')}</option>
                <option value="exclude-dated-interval">{t('Exclude dated interval')}</option>
                <option value="censor-from-start">{t('Censor from start')}</option>
                <option value="dated-interval-or-from-start">{t('Dated interval, else from start')}</option>
              </select>
            </label>
          </div>
          <div className="wt-pipeline-group">
            <h2>{t('AKI exclusion windows')}</h2>
            <p className="wt-muted">{t('Episodes are detected with the KDIGO creatinine criteria. The window follows acute kidney disease, which lasts up to 90 days after an AKI (KDIGO 2024); the shorter fallback is a rule of this tool.')}</p>
            <label>
              <input
                type="checkbox"
                aria-label={t('Exclude AKI windows from fit')}
                checked={fitSettings.exclusions.excludeAkiWindows}
                onChange={e => updateSettings({
                  exclusions: { ...fitSettings.exclusions, excludeAkiWindows: e.target.checked }
                })}
              />
              {t('Exclude AKI windows from fit')}
            </label>
            <label>{t('Window after the episode end (days)')}
              <input
                type="number"
                min={0}
                aria-label={t('AKI window after episode end (days)')}
                disabled={!fitSettings.exclusions.excludeAkiWindows}
                value={fitSettings.exclusions.akiDaysAfterEnd ?? DEFAULT_AKI_DAYS_AFTER_END}
                onChange={e => updateSettings({
                  exclusions: { ...fitSettings.exclusions, akiDaysAfterEnd: Math.max(0, Number(e.target.value) || 0) }
                })}
              />
            </label>
            <label>{t('Shorter window from onset (days)')}
              <input
                type="number"
                min={0}
                aria-label={t('Shorter AKI window from onset (days)')}
                disabled={!fitSettings.exclusions.excludeAkiWindows}
                value={fitSettings.exclusions.akiExclusionDays}
                onChange={e => updateSettings({
                  exclusions: { ...fitSettings.exclusions, akiExclusionDays: Math.max(0, Number(e.target.value) || 0) }
                })}
              />
            </label>
            <p className="wt-muted">{t('Each window runs from the onset of an episode to the given days after its end (for an episode without an observed end, after the recovery window of its last value). Where the fit would then keep fewer than 3 fitted dates over 365 days, the shorter window from onset applies to every episode of the parameter, and the cell is labelled. Values before the onset stay in the fit.')}</p>
          </div>
          <EndpointSettings settings={fitSettings} onUpdate={updateSettings} />
          {columnSettingModules().filter(module => !ENDPOINT_GROUP_MODULES.has(module.id)).map(module => <div key={module.id} className="wt-pipeline-group">
            <h2>{tx(module.label)}</h2>
            <ModuleSettingInputs modules={[module]} settings={fitSettings.moduleSettings} onChange={moduleSettings => updateSettings({ moduleSettings })} />
          </div>)}
        </div>
      </details>
      <section className="wt-trend-visibility" aria-label={t('Trend visibility')}>
        <h2>{t('Show trends and slopes for')}</h2>
        <p className="wt-muted">{t('Display only; the analysis settings above apply even when a trend is hidden.')}</p>
        <div className="wt-fit-options">
          {parameters.map(parameter => {
            const settings = overrides[parameter.key] ?? sharedSettings
            return <label key={parameter.key}>
              <input type="checkbox" checked={fitKeys.includes(parameter.key)} onChange={() => onToggleFit(parameter.key)} />
              {fitModelLabel(settings.fitModel)}: {parameter.label}
              {overrides[parameter.key] && <span className="wt-setting-origin" aria-hidden="true">{t('Own settings')}</span>}
            </label>
          })}
        </div>
      </section>
    </div>
  )
}
