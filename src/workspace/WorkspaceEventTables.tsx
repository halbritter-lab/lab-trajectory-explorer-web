import { comparePatientIds } from '../core/types'
import { describeEventRejection, describeEventWarning, effectForEvent } from '../core/events/events'
import { useAppStore } from './state/store'

const isoDate = (date: Date | null | undefined) => date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '–'

/** Loaded and rejected clinical events, so an import can be checked row by row
 * rather than only by its counts. */
export function WorkspaceEventTables() {
  const events = useAppStore(s => s.events)
  const rejected = useAppStore(s => s.rejectedEvents)
  if (!events.length && !rejected.length) return null
  const sorted = [...events].sort((a, b) => comparePatientIds(a.patientId, b.patientId) || a.date.getTime() - b.date.getTime())
  return <div className="data-event-tables">
    {events.length > 0 && <details>
      <summary>Loaded events ({events.length})</summary>
      <p className="muted">Whether an event changes a fit depends on the censoring options under Trajectories → Display and analysis. The effect column describes what happens when the matching option is on.</p>
      <div className="table-scroll" role="region" aria-label="Loaded events, horizontal scrolling" tabIndex={0}>
        <table aria-label="Loaded events">
          <thead><tr><th>Patient</th><th>Date</th><th>Type</th><th>Title</th><th>Intent</th><th>End</th><th>Effect when enabled</th><th>Warning</th></tr></thead>
          <tbody>{sorted.map((event, index) => <tr key={index}>
            <td>{event.patientId}</td><td>{isoDate(event.date)}</td><td>{event.type}</td><td>{event.title}</td>
            <td>{event.intent ?? '–'}</td><td>{isoDate(event.endDate)}</td><td>{effectForEvent(event).label}</td>
            <td>{event.warning ? describeEventWarning(event) : '–'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    {rejected.length > 0 && <details open>
      <summary>Rejected event rows ({rejected.length})</summary>
      <p className="muted">These rows were not imported. Correct them in the source file and import the events again.</p>
      <div className="table-scroll" role="region" aria-label="Rejected events, horizontal scrolling" tabIndex={0}>
        <table aria-label="Rejected events">
          <thead><tr><th>Patient</th><th>Date</th><th>Type</th><th>Title</th><th>Reason</th></tr></thead>
          <tbody>{rejected.map((item, index) => <tr key={index}>
            <td>{item.event.patientId ?? '–'}</td><td>{isoDate(item.event.date)}</td><td>{item.event.type || '–'}</td>
            <td>{item.event.title || '–'}</td><td>{describeEventRejection(item)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
  </div>
}
