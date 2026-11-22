import { useMemo } from 'react'
import type { PatientId } from '../core/types'
import { formatDisplayDate, formatDisplayNumber } from '../core/format'
import { akiPeriEventSettings } from '../core/domains/nephrology/aki/akiModule'
import { DEFAULT_PERI_EVENT_WINDOW_HOURS, PERI_EVENT_WINDOW_HOURS, periEventCreatinineRows, type PeriEventWindowHours } from '../core/domains/nephrology/aki/periEvent'
import { periEventNotes, periEventRuleFromValue, periEventRuleValue, periEventStatusLabel, periEventValueLabel } from './peri-event'
import type { WorkspaceData } from './workspace-data'
import { useAppStore } from './state/store'
import { countLabel } from './workspace-labels'

/** Serum creatinine around selected events (issue #69): one row per event
 * with baseline, highest value in the window, rise and the KDIGO criterion.
 * Dataset-level, beside the detected AKI episodes. */
export function WorkspacePeriEventCreatinine({ data, onBrowse }: { data: WorkspaceData; onBrowse: (patientId?: PatientId) => void }) {
  const settings = akiPeriEventSettings(data.analysisSettings)
  const results = useMemo(() => settings ? periEventCreatinineRows(data.rows, data.events, settings) : [],
    // The settings object is rebuilt from analysisSettings, which is the stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.rows, data.events, data.analysisSettings])
  const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))
  const titles = sorted([...data.events.map(event => event.title), ...(settings?.rule.kind === 'title' ? [settings.rule.value] : [])])
  const types = sorted([...data.events.map(event => event.type), ...(settings?.rule.kind === 'type' ? [settings.rule.value] : [])])
  const windowHours = settings?.windowHours ?? DEFAULT_PERI_EVENT_WINDOW_HOURS
  const set = useAppStore.getState().setPeriEventSettings
  const met = results.filter(result => result.status === 'met').length
  const notEvaluable = results.filter(result => result.status === 'not_evaluable').length
  return <details>
    <summary>Creatinine after selected events ({settings ? results.length : 'none selected'})</summary>
    <p className="muted">For every event of the chosen title or type, for example a contrast administration or a cardiac catheterisation: the last serum creatinine value on or before the event day (baseline), the highest value in the window after it, the rise, and whether the KDIGO creatinine criterion is met (rise ≥ 0.3 mg/dl or to ≥ 1.5 times baseline). Automated screening for research use, not a diagnosis. Values in mg/dl. <a href="#methods/aki">How AKI is detected</a></p>
    <div className="data-import-grid">
      <label className="field">Events analysed
        <select aria-label="Events for the creatinine analysis" value={settings ? periEventRuleValue(settings.rule) : ''}
          onChange={event => { const rule = periEventRuleFromValue(event.target.value); set(rule ? { rule, windowHours } : null) }}>
          <option value="">None</option>
          {titles.length > 0 && <optgroup label="Events with the title">{titles.map(title => <option key={title} value={`title:${title}`}>Title: {title}</option>)}</optgroup>}
          {types.length > 0 && <optgroup label="Events of the type">{types.map(type => <option key={type} value={`type:${type}`}>Type: {type}</option>)}</optgroup>}
        </select>
      </label>
      <label className="field">Window after the event
        <select aria-label="Window after the event" disabled={!settings} value={windowHours}
          onChange={event => settings && set({ ...settings, windowHours: Number(event.target.value) as PeriEventWindowHours })}>
          {PERI_EVENT_WINDOW_HOURS.map(hours => <option key={hours} value={hours}>{hours} hours ({hours / 24} calendar days)</option>)}
        </select>
      </label>
    </div>
    <p className="muted" id="peri-event-resolution">Event dates have no time of day, so the window is counted in calendar days: 48 hours are the two days after the event day, 72 hours the three days after it. A value on the event day counts as the baseline, even where lab values carry a time, so a rise measured later on the event day is not seen. Values under dialysis are not used. Each event is evaluated on its own, also when another selected event lies in its window.</p>
    {!settings ? <p>No events selected.</p> : results.length === 0 ? <p>No event matches the selection.</p> : <>
      <p role="status">{countLabel(results.length, 'event')}: criterion met for {met}, not met for {results.length - met - notEvaluable}, not evaluable for {notEvaluable}.</p>
      <div className="table-scroll" role="region" aria-label="Creatinine after selected events, horizontal scrolling" tabIndex={0}>
        <table aria-label="Creatinine after selected events" className="aki-episodes-table peri-event-table"><thead><tr><th>Patient</th><th>Event</th><th>Baseline</th><th>Highest in window</th><th>Rise (mg/dl)</th><th>Relative to baseline</th><th>KDIGO criterion</th><th>Creatinine parameter</th><th>Notes</th></tr></thead>
          <tbody>{results.map((result, index) => <tr key={index}>
            <th><button onClick={() => onBrowse(result.patientId)}>{result.patientId}</button></th>
            <td><span className="aki-date">{formatDisplayDate(result.event.date)}</span> {result.event.title} ({result.event.type})</td>
            <td>{periEventValueLabel(result.baselineValue, result.baselineDate)}{result.baselineDaysBefore !== null && result.baselineDaysBefore > 0 ? `, ${countLabel(result.baselineDaysBefore, 'day')} before` : ''}</td>
            <td>{periEventValueLabel(result.peakValue, result.peakDate)}</td>
            <td>{result.absoluteRise === null ? '–' : formatDisplayNumber(result.absoluteRise)}</td>
            <td>{result.ratioToBaseline === null ? '–' : `${formatDisplayNumber(result.ratioToBaseline)} ×`}</td>
            <td>{periEventStatusLabel(result)}</td>
            <td>{result.parameter === null ? '–' : `${result.parameter} [${result.unit ?? 'no unit'}]`}</td>
            <td>{periEventNotes(result)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </details>
}
