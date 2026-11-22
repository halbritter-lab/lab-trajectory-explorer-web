import type { WorkspaceParameter } from '../workspace-data'
import type { WorkspaceFitSettings } from '../workspace-analysis'
import type { UnknownDialysisPolicy } from '../../core/domains/nephrology/fitConfig'
import { isEgfrUnit } from '../../core/domains/nephrology/analytes'
import { EndpointSettings } from './EndpointSettings'

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
          {egfrEndpoints && <EndpointSettings settings={fitSettings} onUpdate={updateSettings} />}
    <p className="wt-muted"><a href="#methods/aki/timing">Nephrology: AKI exclusion windows</a></p>
  </>
}
