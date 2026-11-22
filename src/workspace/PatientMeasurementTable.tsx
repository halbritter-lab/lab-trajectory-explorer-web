import type { ReactNode } from 'react'
import type { ClinicalEvent } from '../core/events/events'
import type { LabRow } from '../core/types'
import { formatDisplayDate, formatDisplayNumber, formatDisplayTime } from '../core/format'
import { NOT_USED_FOR_AKI_DETECTION, skippedByAkiDetection } from './aki-detection'
import type { WorkspaceParameter } from './workspace-data'
import { boundedPrefix, measurementText } from './WorkspacePlot'

/** Clinical events in date order; events of one date keep their file order. */
export function eventsByDate<T extends { date: Date }>(events: readonly T[]): T[] {
  return events.map((event, index) => ({ event, index })).sort((a, b) => a.event.date.getTime() - b.event.date.getTime() || a.index - b.index).map(item => item.event)
}

export const eventText = (event: ClinicalEvent) => `${event.title}${event.endDate ? ` to ${formatDisplayDate(event.endDate)}` : ''}${event.description ? ` (${event.description})` : ''}`

/** Display order of measurements that are already in date order: the rows of
 * one date are ordered by their time of day when every row of that date has
 * one, and keep their order otherwise (the rule of AKI detection, decided
 * 2026-11-21). Returns indices into `rows`, so that values aligned with
 * `rows` (the fit status, which follows the fitted points) move with them. */
export function measurementDisplayOrder(rows: readonly LabRow[]): number[] {
  const order: number[] = []
  for (let start = 0; start < rows.length;) {
    const day = rows[start].labDatum?.getTime()
    let end = start + 1
    while (end < rows.length && day !== undefined && rows[end].labDatum?.getTime() === day) end++
    const indices = Array.from({ length: end - start }, (_, k) => start + k)
    if (indices.every(i => rows[i].labTime !== undefined)) indices.sort((a, b) => rows[a].labTime! - rows[b].labTime! || a - b)
    order.push(...indices)
    start = end
  }
  return order
}

/** The measurements of one patient and parameter, oldest first, with the
 * patient's clinical events as set-off rows at their dates: an event stands
 * before the measurements of its own day. Measurements without a date stay
 * last. A serum creatinine table gains the column "AKI detection" when a value
 * was measured under dialysis and is therefore left out of detection.
 * The date shows the time of day where the file gave one, and the rows of one
 * date follow `measurementDisplayOrder`.
 * Display only. `measurements` are in date order, `fitStatus` aligned with them. */
export function PatientMeasurementTable({ parameter, measurements, fitStatus, events }: {
  parameter: WorkspaceParameter; measurements: readonly LabRow[]; fitStatus: readonly string[]; events: readonly ClinicalEvent[]
}) {
  const skipped = measurements.map(row => skippedByAkiDetection(parameter, row.labDatum, events))
  const showDetection = skipped.some(Boolean)
  const columns = showDetection ? 6 : 5
  const pending = eventsByDate(events)
  const eventRow = (event: ClinicalEvent, key: string) => <tr key={key} className="wt-event-row" data-testid="event-row"><td>{formatDisplayDate(event.date)}</td><td colSpan={columns - 1}><strong>Event:</strong> {eventText(event)}</td></tr>
  const rows: ReactNode[] = []
  measurementDisplayOrder(measurements).forEach(i => {
    const row = measurements[i]
    while (pending.length && row.labDatum && pending[0].date.getTime() <= row.labDatum.getTime()) rows.push(eventRow(pending.shift()!, `event-${rows.length}`))
    // Undated measurements are last; the remaining events come before them.
    if (!row.labDatum) while (pending.length) rows.push(eventRow(pending.shift()!, `event-${rows.length}`))
    rows.push(<tr key={i}><td>{row.labDatum ? `${formatDisplayDate(row.labDatum)}${row.labTime === undefined ? '' : ` ${formatDisplayTime(row.labTime)}`}` : 'Missing date'}</td><td>{measurementText(row)}</td><td>{row.wertNum === null ? 'Non-numeric / missing' : `${boundedPrefix(row.wertOperator)}${formatDisplayNumber(row.wertNum)}`}</td><td>{row.patientAgeAtLab === null ? 'Missing' : formatDisplayNumber(row.patientAgeAtLab)}</td><td>{fitStatus[i]}</td>{showDetection && <td className="wt-aki-detection-cell">{skipped[i] ? NOT_USED_FOR_AKI_DETECTION.charAt(0).toUpperCase() + NOT_USED_FOR_AKI_DETECTION.slice(1) : '–'}</td>}</tr>)
  })
  while (pending.length) rows.push(eventRow(pending.shift()!, `event-${rows.length}`))
  return <div className="wt-table-scroll"><table className="wt-measurements" aria-label={`Measurements ${parameter.label}`}><thead><tr><th>Date</th><th>{parameter.derived ? 'Derived value' : 'Original value'}</th><th>Numeric value</th><th>Age</th><th>Fit preparation</th>{showDetection && <th>AKI detection</th>}</tr></thead><tbody>{rows}</tbody></table></div>
}
