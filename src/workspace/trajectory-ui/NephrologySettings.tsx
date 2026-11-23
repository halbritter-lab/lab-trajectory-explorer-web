import type { WorkspaceParameter } from '../workspace-data'
import type { WorkspaceFitSettings } from '../workspace-analysis'
import type { UnknownDialysisPolicy } from '../../core/domains/nephrology/fitConfig'
import { DEFAULT_AKI_DAYS_AFTER_END } from '../../core/domains/nephrology/constants'
import { isEgfrUnit } from '../../core/domains/nephrology/analytes'
import { isAkiCreatinineSource } from '../../core/domains/nephrology/aki/akiAware'
import { EndpointSettings } from './EndpointSettings'
import { t } from '../../i18n'

export function NephrologySettings({ parameter, settings: fitSettings, onUpdate: updateSettings }: {
  parameter: WorkspaceParameter; settings: WorkspaceFitSettings; onUpdate: (patch: Partial<WorkspaceFitSettings>) => void;
}) {
  const egfrEndpoints = isEgfrUnit(parameter.einheit)
  // Since 2026-11-22 every preset censors after kidney replacement therapy, so
  // this group is shown for every parameter; the AKI options only for kidney
  // function series, or once they are switched on.
  const akiOptions = egfrEndpoints || isAkiCreatinineSource(parameter.bezeichnung, parameter.einheit) || fitSettings.exclusions.excludeAkiWindows
  return <>
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
          {akiOptions && <div className="wt-pipeline-group">
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
          </div>}
          {egfrEndpoints && <EndpointSettings settings={fitSettings} onUpdate={updateSettings} />}
    {akiOptions && <p className="wt-muted"><a href="#methods/aki/timing">{t('Nephrology: AKI exclusion windows')}</a></p>}
  </>
}
