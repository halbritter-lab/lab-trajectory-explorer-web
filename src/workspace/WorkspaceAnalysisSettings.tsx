import type { FitModel, TimeBalancing, UnknownDialysisPolicy } from '../core/fitPipeline/types'
import type { WorkspaceParameter } from './workspace-data'
import { defaultFitSettings, type WorkspaceFitSettings } from './workspace-analysis'

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
    <div className="wt-preset-section">
      <div className="wt-analysis-selectors">
        <label>Edit settings for
          <select aria-label="Edit analysis settings for" value={scope} onChange={event => onScopeChange(event.target.value)}>
            <option value="">Shared settings</option>
            {parameters.map(parameter => <option key={parameter.key} value={parameter.key}>{parameter.label}{overrides[parameter.key] ? ' · Own settings' : ' · Shared'}</option>)}
          </select>
        </label>
        <label>Analysis preset
          <select
            aria-label="Analysis preset"
            value={fitSettings.presetId}
            onChange={event => applyPreset(event.target.value)}
          >
            <optgroup label="Standard / General">
              <option value="general_exploration">General exploration (unweighted OLS)</option>
              <option value="theil_sen">Theil–Sen robust trend (outlier resistant)</option>
            </optgroup>
            <optgroup label="Nephrology (CKD / AKI)">
              <option value="ckd_progression">CKD progression (quarterly medians, censoring, AKI exclusion)</option>
              <option value="acute_review">Acute review (day-level raw points, no fit)</option>
            </optgroup>
            {fitSettings.presetId === 'custom' && (
              <optgroup label="Custom">
                <option value="custom">Custom configuration</option>
              </optgroup>
            )}
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
          {fitSettings.presetId === 'ckd_progression'
            ? 'CKD progression: quarterly medians, censored after transplant and chronic dialysis, 30-day AKI exclusion, G5 endpoints, OLS trend.'
            : fitSettings.presetId === 'theil_sen'
              ? 'Theil–Sen: non-parametric median slope, unweighted, resistant to outliers.'
              : fitSettings.presetId === 'acute_review'
                ? 'Acute review: day-level measurements without trend fit, focusing on KDIGO AKI.'
                : fitSettings.presetId === 'custom'
                  ? 'Custom: tailored fit model, event censoring, exclusions, time balancing, or endpoints.'
                  : 'General exploration: global OLS per patient and parameter, unweighted individual measurements, no AKI or event exclusions, and no time aggregation. Slopes are per year. Changing the axis affects the display, not the calculation.'}
        </span>
      <details className="wt-advanced-settings">
        <summary>Advanced pipeline settings</summary>
        <div className="wt-pipeline-grid">
          <div className="wt-pipeline-group">
            <h4>Trend model</h4>
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
          <div className="wt-pipeline-group">
            <h4>Clinical events & censoring</h4>
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
            <h4>AKI exclusions (KDIGO)</h4>
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
          <div className="wt-pipeline-group">
            <h4>eGFR endpoints & thresholds</h4>
            <p className="wt-muted">Applies only to parameters with eGFR units.</p>
            <label>
              <input
                type="checkbox"
                aria-label="Percent eGFR decline"
                checked={fitSettings.endpoints.percentDecline}
                onChange={e => updateSettings({
                  endpoints: { ...fitSettings.endpoints, percentDecline: e.target.checked }
                })}
              />
              Percent eGFR decline
            </label>
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
            <label>Rapid decline &gt; (mL/min/1.73m²/year)
              <input
                type="number"
                min={0}
                step={0.5}
                aria-label="Rapid decline threshold"
                value={fitSettings.rapidEgfrThreshold}
                onChange={e => updateSettings({
                  rapidEgfrThreshold: Math.max(0, Number(e.target.value) || 0)
                })}
              />
            </label>
          </div>
        </div>
      </details>
      <section className="wt-trend-visibility" aria-label="Trend visibility">
        <h3>Show trend and statistics for</h3>
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
