import type { WorkspaceFitSettings } from '../workspace-analysis'
import { ConfirmationDaysInput } from '../ConfirmationDaysInput'
import { CKD_G4_EGFR_THRESHOLD, CKD_G5_EGFR_THRESHOLD, DEFAULT_CONFIRMATION_DAYS, ISN_TRIAL_CONFIRMATION_DAYS, KDIGO_PROJECTION_MIN_DATES, KDIGO_PROJECTION_MIN_MONTHS } from '../../core/domains/nephrology/constants'
import { RAPID_EGFR_DECLINE_MODULE_ID } from '../../core/domains/nephrology/rapidEgfrDeclineModule'
import { columnSettingModules } from '../../core/analysis/registry'
import { ModuleSettingInputs } from './ModuleSettingInputs'
import { msg, t } from '../../i18n'

export const ENDPOINT_GROUP_MODULES = new Set<string>([RAPID_EGFR_DECLINE_MODULE_ID])

/** The confirmation presets beside the free interval (decided 2026-11-22,
 * issue #85): the 90-day default and the 28-day ISN trial definition. */
const CONFIRMATION_PRESETS = [
  { days: DEFAULT_CONFIRMATION_DAYS, label: msg('{n} days (default)') },
  { days: ISN_TRIAL_CONFIRMATION_DAYS, label: msg('{n} days (ISN trial definition)') },
] as const

/** The "eGFR endpoints & thresholds" group of a parameter's settings. */
export function EndpointSettings({ settings: fitSettings, onUpdate: updateSettings }: {
  settings: WorkspaceFitSettings; onUpdate: (patch: Partial<WorkspaceFitSettings>) => void
}) {
  const endpoints = fitSettings.endpoints
  const set = (patch: Partial<WorkspaceFitSettings['endpoints']>) => updateSettings({ endpoints: { ...endpoints, ...patch } })
  const confirmationDays = endpoints.confirmationDays ?? DEFAULT_CONFIRMATION_DAYS
  const preset = CONFIRMATION_PRESETS.find(item => item.days === confirmationDays)
  return <div className="wt-pipeline-group">
    <h2>{t('eGFR endpoints & thresholds')}</h2>
    <p className="wt-muted">{t('Applies only to parameters with eGFR units.')}</p>
    <p className="wt-muted">{t('Endpoints and projection use exact dated eGFR measurements before the first transplant or chronic dialysis start and not after a recorded death, excluding complete dated acute dialysis intervals. Later values after acute dialysis remain eligible. Values marked < or > are excluded. Time balancing does not apply. When AKI windows are excluded from the fit, they are also left out of the decline baseline and the G5 projection. Kidney failure reached is reported separately from observed G5.')}</p>
    <label><input type="checkbox" aria-label={t('Observed CKD G4')} checked={endpoints.observedCkdG4 ?? false} onChange={e => set({ observedCkdG4: e.target.checked })} />{t('Observed CKD G4')}</label>
    <label>{t('Confirmation preset')}
      <select aria-label={t('Confirmation preset')} value={preset ? String(preset.days) : 'other'} onChange={e => { if (e.target.value !== 'other') set({ confirmationDays: Number(e.target.value) }) }}>
        {CONFIRMATION_PRESETS.map(item => <option key={item.days} value={item.days}>{t(item.label, { n: item.days })}</option>)}
        {!preset && <option value="other">{t('{confirmationDays} days (own value)', { confirmationDays })}</option>}
      </select>
    </label>
    <label>{t('Minimum confirmation interval (days)')}
      <ConfirmationDaysInput value={confirmationDays} onChange={days => set({ confirmationDays: days })} />
    </label>
    <p className="wt-muted">{t('G4: below {CKD_G4_EGFR_THRESHOLD}; G5: below {CKD_G5_EGFR_THRESHOLD} mL/min/1.73m². Confirm within 12 calendar months of the first crossing; the 12-month maximum is a rule of this tool. 90 days follows the KDIGO chronicity criterion (more than 3 months); 28 days is the ISN trial definition of a sustained decline, not yet checked against the full text of its source. Recovery before confirmation restarts the candidate. Recovery afterwards is shown separately and preserves the confirmed event. A confirmed eGFR below {CKD_G4_EGFR_THRESHOLD2} (CKD G4) is what some groups call advanced CKD (aCKD). A single value below {CKD_G5_EGFR_THRESHOLD2} without confirmation is never an observed G5; it is marked as unconfirmed (possible AKI).', { CKD_G4_EGFR_THRESHOLD, CKD_G5_EGFR_THRESHOLD, CKD_G4_EGFR_THRESHOLD2: CKD_G4_EGFR_THRESHOLD, CKD_G5_EGFR_THRESHOLD2: CKD_G5_EGFR_THRESHOLD })}</p>
    <label>
      <input
        type="checkbox"
        aria-label={t('Percent eGFR decline')}
        checked={endpoints.percentDecline}
        onChange={e => set({ percentDecline: e.target.checked })}
      />
      {t('Percent eGFR decline (total change and confirmed 40% / 57% events)')}
    </label>
    <label>
      <input
        type="checkbox"
        aria-label={t('Confirmed 50% eGFR decline')}
        disabled={!endpoints.percentDecline}
        checked={endpoints.observedDecline50 ?? false}
        onChange={e => set({ observedDecline50: e.target.checked })}
      />
      {t('Also confirmed 50% decline')}
    </label>
    <p className="wt-muted">{t('Confirmed decline uses the mean of eligible eGFR values in the first 90 elapsed UTC days, inclusive. Candidate events start after that window. A 57% decline is a serum-creatinine doubling surrogate. The 50% decline uses the same baseline and confirmation rule; it needs Percent eGFR decline.')}</p>
    <label>
      <input
        type="checkbox"
        aria-label={t('Observed CKD G5')}
        checked={endpoints.observedCkdG5}
        onChange={e => set({ observedCkdG5: e.target.checked })}
      />
      {t('Observed CKD G5')}
    </label>
    <label>
      <input
        type="checkbox"
        aria-label={t('Extrapolation to CKD G5')}
        checked={endpoints.projectedAgeToCkdG5}
        onChange={e => set({ projectedAgeToCkdG5: e.target.checked })}
      />
      {t('Extrapolation to CKD G5 (off by default)')}
    </label>
    <p className="wt-muted">{t('The age at which the fitted line reaches {CKD_G5_EGFR_THRESHOLD}: a conditional extrapolation of the fitted trend, not a prognosis. It needs measurements on at least {KDIGO_PROJECTION_MIN_DATES} dates over at least {value} years (KDIGO 2012).', { CKD_G5_EGFR_THRESHOLD, KDIGO_PROJECTION_MIN_DATES, value: KDIGO_PROJECTION_MIN_MONTHS / 12 })}</p>
    <ModuleSettingInputs
      modules={columnSettingModules().filter(module => ENDPOINT_GROUP_MODULES.has(module.id))}
      settings={fitSettings.moduleSettings}
      onChange={moduleSettings => updateSettings({ moduleSettings })}
    />
  </div>
}
