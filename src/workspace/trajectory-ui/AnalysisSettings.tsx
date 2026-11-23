// Contextual editor; optional module adapters own domain-specific configuration.
import type { FitModel, TimeBalancing } from '../../core/fitPipeline/types'
import type { BoundedValuePolicy } from '../../core/measurements/censored'
import type { WorkspaceParameter } from '../workspace-data'
import { presetSettingsKeepingAnchor, type WorkspaceFitSettings } from '../workspace-analysis'
import { fitPresetById } from '../../core/analysis/registry'
import { FIT_PRESET_CATEGORY_LABELS } from '../../core/analysis/fitConfig'
import { presetsForScope } from './analysis'
import { AnalysisModuleSettings } from './analysis-modules'
import type { ClinicalEvent } from '../../core/events/events'
import { AnchorComparisonSettingsGroup } from './AnchorComparisonSettings'
import { t, tx } from '../../i18n'

function PresetOptions({ presetId, scope }: { presetId: string; scope: string }) {
  const presets = presetsForScope(scope)
  const categories = [...new Set(presets.map(preset => preset.category))]
  return <>{categories.map(category => <optgroup key={category} label={tx(FIT_PRESET_CATEGORY_LABELS[category])}>
    {presets.filter(preset => preset.category === category).map(preset => <option key={preset.id} value={preset.id}>{tx(preset.optionLabel)}</option>)}
  </optgroup>)}{presetId === 'custom' && <option value="custom">{t('Custom configuration')}</option>}</>
}

interface Props {
  parameters: WorkspaceParameter[]
  sharedSettings: WorkspaceFitSettings
  overrides: Record<string, WorkspaceFitSettings>
  scope: string
  onChange: (settings: WorkspaceFitSettings) => void
  onReset: () => void
  /** The dataset's events, for the anchor choices of the before/after comparison. */
  events?: readonly ClinicalEvent[]
}

export function QuietAnalysisSettings({ parameters, sharedSettings, overrides, scope, onChange, onReset, events = [] }: Props) {
  const fitSettings = overrides[scope] ?? sharedSettings
  const activeParameter = parameters.find(parameter => parameter.key === scope)
  const applyPreset = (id: string) => { if (presetsForScope(scope).some(preset => preset.id === id)) onChange(presetSettingsKeepingAnchor(id, fitSettings)) }
  const updateSettings = (patch: Partial<WorkspaceFitSettings>) => onChange({ ...fitSettings, ...patch, presetId: 'custom' })
  return (
    <div className="wt-preset-section pv-quiet-settings">
      <div className="wt-analysis-selectors">

        <label>{t('Preset')}
          <select
            aria-label={t('Analysis preset')}
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
            ? t('Independent settings for this parameter.')
            : t('Editing creates independent settings for this parameter.')
          : t('General defaults only. Open a parameter’s settings to assign a specialist profile; independent settings stay unchanged.')}</p>
        {scope && overrides[scope] && <button type="button" onClick={onReset}>{t('Use shared settings')}</button>}
      </div>

      <details className="pv-preset-help"><summary>{t('About this preset')}</summary><p>
          {tx(fitPresetById(fitSettings.presetId)?.summary
            ?? (fitSettings.presetId === 'custom'
              ? t('Custom calculation settings for this parameter.')
              : fitPresetById('general_exploration')!.summary))}
        </p><p><a href="#methods/fits/choosing">{t('Fit methods')}</a></p></details>
      <details className="wt-advanced-settings">
        <summary>{t('Calculation settings')}</summary>
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

            <label>{t('Time balancing')}
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
          {activeParameter && <AnalysisModuleSettings parameter={activeParameter} settings={fitSettings} onUpdate={updateSettings} />}
          {/* Not part of the preset: changing it keeps the preset name. */}
          <AnchorComparisonSettingsGroup settings={fitSettings.anchorComparison} events={events} onChange={anchorComparison => {
            const { anchorComparison: _previous, ...rest } = fitSettings
            onChange(anchorComparison ? { ...rest, anchorComparison } : rest)
          }} />
        </div>
      </details>

    </div>
  )
}
