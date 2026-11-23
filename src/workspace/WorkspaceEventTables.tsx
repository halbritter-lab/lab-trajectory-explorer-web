import { comparePatientIds } from '../core/types'
import { utcDateOrBlank } from '../core/format'
import { describeEventRejection, describeEventWarning } from '../core/events/events'
import { effectForEvent } from '../core/domains/nephrology/censoring'
import { useAppStore } from './state/store'
import { t, tx } from '../i18n'
import { importMessage } from './labels/importMessages'

const isoDate = (date: Date | null | undefined) => utcDateOrBlank(date) || '–'

/** Loaded and rejected clinical events, so an import can be checked row by row
 * rather than only by its counts. */
export function WorkspaceEventTables() {
  const events = useAppStore(s => s.events)
  const rejected = useAppStore(s => s.rejectedEvents)
  if (!events.length && !rejected.length) return null
  const sorted = [...events].sort((a, b) => comparePatientIds(a.patientId, b.patientId) || a.date.getTime() - b.date.getTime())
  return <div className="data-event-tables">
    {events.length > 0 && <details>
      <summary>{t('Loaded events ({events})', { events: events.length })}</summary>
      <p className="muted">{t('Whether an event changes a fit depends on the censoring options in the analysis settings of the parameter under Trajectories. The effect column describes what happens when the matching option is on.')}</p>
      <div className="table-scroll" role="region" aria-label={t('Loaded events, horizontal scrolling')} tabIndex={0}>
        <table aria-label={t('Loaded events')}>
          <thead><tr><th>{t('Patient')}</th><th>{t('Date')}</th><th>{t('Type')}</th><th>{t('Title')}</th><th>{t('Description')}</th><th>{t('Intent')}</th><th>{t('End')}</th><th>{t('Effect when enabled')}</th><th>{t('Warning')}</th></tr></thead>
          <tbody>{sorted.map((event, index) => <tr key={index}>
            <td>{event.patientId}</td><td>{isoDate(event.date)}</td><td>{event.type}</td><td>{event.title}</td><td>{event.description || '–'}</td>
            <td>{event.intent ?? '–'}</td><td>{isoDate(event.endDate)}</td><td>{tx(effectForEvent(event).label)}</td>
            <td>{event.warning ? importMessage(describeEventWarning(event)) : '–'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    {rejected.length > 0 && <details open>
      <summary>{t('Rejected event rows ({rejected})', { rejected: rejected.length })}</summary>
      <p className="muted">{t('These rows were not imported. Correct them in the source file and import the events again.')}</p>
      <div className="table-scroll" role="region" aria-label={t('Rejected events, horizontal scrolling')} tabIndex={0}>
        <table aria-label={t('Rejected events')}>
          <thead><tr><th>{t('Patient')}</th><th>{t('Date')}</th><th>{t('Type')}</th><th>{t('Title')}</th><th>{t('Description')}</th><th>{t('Reason')}</th></tr></thead>
          <tbody>{rejected.map((item, index) => <tr key={index}>
            <td>{item.event.patientId ?? '–'}</td><td>{isoDate(item.event.date)}</td><td>{item.event.type || '–'}</td>
            <td>{item.event.title || '–'}</td><td>{item.event.description || '–'}</td><td>{importMessage(describeEventRejection(item))}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
  </div>
}
