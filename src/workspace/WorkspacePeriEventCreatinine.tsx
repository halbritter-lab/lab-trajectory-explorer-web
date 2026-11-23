import { useMemo } from 'react'
import type { PatientId } from '../core/types'
import { formatDisplayDate, formatDisplayNumber } from '../core/format'
import { DEFAULT_PERI_EVENT_WINDOW_HOURS, PERI_EVENT_WINDOW_HOURS, periEventCreatinineRows, type PeriEventWindowHours } from '../core/domains/nephrology/aki/periEvent'
import { periEventNotes, periEventRuleFromValue, periEventRuleValue, periEventStatusLabel } from './peri-event'
import type { WorkspaceData } from './workspace-data'
import { useAppStore } from './state/store'
import { countLabel } from './workspace-labels'
import { t, tp, tr } from '../i18n'

/** "1.2 on 03/03/2026" with the date kept on one line, or "–". */
const ValueOnDate = ({ value, date }: { value: number | null; date: Date | null }) =>
  value === null || date === null ? <>–</> : <>{tr('{value} on {date}', { value: formatDisplayNumber(value), date: <span className="aki-date">{formatDisplayDate(date)}</span> })}</>

/** Serum creatinine around selected events (issue #69): one row per event
 * with baseline, highest value in the window, rise and the KDIGO criterion.
 * Dataset-level, beside the detected AKI episodes. */
export function WorkspacePeriEventCreatinine({ data, onBrowse }: { data: WorkspaceData; onBrowse: (patientId?: PatientId) => void }) {
  const settings = useAppStore(s => s.periEventSettings)
  const results = useMemo(() => settings ? periEventCreatinineRows(data.rows, data.events, settings) : [], [data.rows, data.events, settings])
  const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))
  const titles = sorted([...data.events.map(event => event.title), ...(settings?.rule.kind === 'title' ? [settings.rule.value] : [])])
  const types = sorted([...data.events.map(event => event.type), ...(settings?.rule.kind === 'type' ? [settings.rule.value] : [])])
  const windowHours = settings?.windowHours ?? DEFAULT_PERI_EVENT_WINDOW_HOURS
  const set = useAppStore.getState().setPeriEventSettings
  const met = results.filter(result => result.status === 'met').length
  const notEvaluable = results.filter(result => result.status === 'not_evaluable').length
  return <details id="data-peri-event">
    <summary>{settings ? t('Creatinine after selected events ({n})', { n: results.length }) : t('Creatinine after selected events (none selected)')}</summary>
    <p className="muted">{t('For every event of the chosen title or type, for example a contrast administration or a cardiac catheterisation: the last serum creatinine value on or before the event day (baseline), the highest value in the window after it, the rise, and whether the KDIGO creatinine criterion is met (rise ≥ 0.3 mg/dl or to ≥ 1.5 times baseline). Automated screening for research use, not a diagnosis. Values in mg/dl.')} <a href="#methods/aki">{t('How AKI is detected')}</a></p>
    <div className="data-import-grid">
      <label className="field">{t('Events analysed')}
        <select aria-label={t('Events for the creatinine analysis')} value={settings ? periEventRuleValue(settings.rule) : ''}
          onChange={event => { const rule = periEventRuleFromValue(event.target.value); set(rule ? { rule, windowHours } : null) }}>
          <option value="">{t('None')}</option>
          {titles.length > 0 && <optgroup label={t('Events with the title')}>{titles.map(title => <option key={title} value={`title:${title}`}>{t('Title: {title}', { title })}</option>)}</optgroup>}
          {types.length > 0 && <optgroup label={t('Events of the type')}>{types.map(type => <option key={type} value={`type:${type}`}>{t('Type: {type}', { type })}</option>)}</optgroup>}
        </select>
      </label>
      <label className="field">{t('Window after the event')}
        <select aria-label={t('Window after the event')} disabled={!settings} value={windowHours}
          onChange={event => settings && set({ ...settings, windowHours: Number(event.target.value) as PeriEventWindowHours })}>
          {PERI_EVENT_WINDOW_HOURS.map(hours => <option key={hours} value={hours}>{t('{hours} hours ({days} calendar days)', { hours, days: hours / 24 })}</option>)}
        </select>
      </label>
    </div>
    <p className="muted" id="peri-event-resolution">{t('Event dates have no time of day, so the window is counted in calendar days: 48 hours are the two days after the event day, 72 hours the three days after it. A value on the event day counts as the baseline, even where lab values carry a time, so a rise measured later on the event day is not seen. Values under dialysis are not used. Each event is evaluated on its own, also when another selected event lies in its window.')}</p>
    {!settings ? <p>{t('No events selected.')}</p> : results.length === 0 ? <p>{t('No event matches the selection.')}</p> : <>
      <p role="status">{t('{events}: criterion met for {met}, not met for {notMet}, not evaluable for {notEvaluable}.', { events: countLabel(results.length, 'event'), met, notMet: results.length - met - notEvaluable, notEvaluable })}</p>
      <div className="table-scroll" role="region" aria-label={t('Creatinine after selected events, horizontal scrolling')} tabIndex={0}>
        <table aria-label={t('Creatinine after selected events')} className="aki-episodes-table peri-event-table"><thead><tr><th>{t('Patient')}</th><th>{t('Event')}</th><th>{t('Baseline')}</th><th>{t('Highest in window')}</th><th>{t('Rise (mg/dl)')}</th><th>{t('Relative to baseline')}</th><th>{t('KDIGO criterion')}</th><th>{t('Creatinine parameter')}</th><th>{t('Notes')}</th></tr></thead>
          <tbody>{results.map((result, index) => <tr key={index}>
            <th><button onClick={() => onBrowse(result.patientId)}>{result.patientId}</button></th>
            <td><span className="aki-date">{formatDisplayDate(result.event.date)}</span> {result.event.title} ({result.event.type})</td>
            <td><ValueOnDate value={result.baselineValue} date={result.baselineDate} />{result.baselineDaysBefore !== null && result.baselineDaysBefore > 0 ? `, ${tp('{n} day before', '{n} days before', result.baselineDaysBefore)}` : ''}</td>
            <td><ValueOnDate value={result.peakValue} date={result.peakDate} /></td>
            <td>{result.absoluteRise === null ? '–' : formatDisplayNumber(result.absoluteRise)}</td>
            <td>{result.ratioToBaseline === null ? '–' : `${formatDisplayNumber(result.ratioToBaseline)} ×`}</td>
            <td>{periEventStatusLabel(result)}</td>
            <td>{result.parameter === null ? '–' : `${result.parameter} [${result.unit ?? t('no unit')}]`}</td>
            <td>{periEventNotes(result)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </details>
}
