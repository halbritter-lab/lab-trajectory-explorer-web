import type { WorkspaceParameter } from '../../src/workspace/workspace-data'
import type { WorkspaceFitSettings } from '../../src/workspace/workspace-analysis'
import type { UnknownDialysisPolicy } from '../../src/core/domains/nephrology/fitConfig'
import { ConfirmationDaysInput } from '../../src/workspace/ConfirmationDaysInput'
import { CKD_G4_EGFR_THRESHOLD, CKD_G5_EGFR_THRESHOLD, DEFAULT_CONFIRMATION_DAYS } from '../../src/core/domains/nephrology/constants'
import { RAPID_EGFR_DECLINE_MODULE_ID } from '../../src/core/domains/nephrology/rapidEgfrDeclineModule'
import { isEgfrUnit } from '../../src/core/domains/nephrology/analytes'
import { columnSettingModules } from '../../src/core/analysis/registry'
import { ModuleSettingInputs } from './ModuleSettingInputs'
const ENDPOINT_GROUP_MODULES = new Set<string>([RAPID_EGFR_DECLINE_MODULE_ID])

export function NephrologySettings({ parameter, settings: fitSettings, onUpdate: updateSettings }: {
  parameter: WorkspaceParameter; settings: WorkspaceFitSettings; onUpdate: (patch: Partial<WorkspaceFitSettings>) => void;
}) {
  const egfrEndpoints = isEgfrUnit(parameter.einheit)
  return <>
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
          </div>
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
    <p className="wt-muted"><a href="#methods/aki/timing">Nephrology: AKI exclusion windows</a></p>
  </>
}
