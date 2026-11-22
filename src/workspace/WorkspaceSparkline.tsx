import type { CohortCell } from '../core/cohort/screening'
import type { LabRow, PatientId } from '../core/types'
import type { ClinicalEvent } from '../core/events/events'
import { boundedPrefix, drawnFitLines, EVENT_COLOR, formatWorkspaceDate, formatWorkspaceNumber } from './WorkspacePlot'

export interface SparkDomain { min: number; max: number; days: number }
export type SparkSize = 'small' | 'medium' | 'large'
/** Chart height and smallest chart width in CSS pixels for each table chart size. */
export const SPARK_SIZES: Record<SparkSize, { height: number; minWidth: number }> = {
  small: { height: 68, minWidth: 176 },
  medium: { height: 110, minWidth: 240 },
  large: { height: 160, minWidth: 320 },
}
/** Margins around the plot area: value labels left, the time axis below. */
const PLOT = { left: 34, right: 20, top: 12, bottom: 24 }

/** Chart width for a table that is `available` pixels wide and shows `columns`
 * parameter columns: the columns share the width left beside the selection
 * and patient columns, but a chart is never narrower than its size's minimum.
 * On a narrow table the minimum shrinks to what one column can show, down to
 * the small size's minimum, so a single chart is not cut off on a phone.
 * An unmeasured table (width 0, as in tests without layout) gets the minimum. */
export function sparkWidth(available: number, columns: number, size: SparkSize): number {
  const { minWidth } = SPARK_SIZES[size]
  if (!(available > 0) || columns < 1) return minWidth
  const floor = Math.max(SPARK_SIZES.small.minWidth, Math.min(minWidth, available - 146))
  return Math.max(floor, Math.floor((available - 126) / columns) - 20)
}

const MS_PER_DAY = 86_400_000

export function WorkspaceSparkline({ cell, measurements, patientId, label, domain, fit, scaleMode, width = SPARK_SIZES.small.minWidth, height = SPARK_SIZES.small.height, logScale = false, events = [] }: {
  cell: CohortCell; measurements: LabRow[]; patientId: PatientId; label: string; domain: SparkDomain; fit: boolean;
  scaleMode: 'shared' | 'zoom'; width?: number; height?: number;
  /** Logarithmic value axis (issue #70): `domain` is then positive, values of
   * zero or less are not drawn and the fit lines are those of the log fit. */
  logScale?: boolean
  /** The patient's events to draw: a dashed line at the date, and a band to the
   * end date for an event that has one, clipped to the chart's time range. */
  events?: readonly ClinicalEvent[]
}) {
  if (!cell.points.length) return null
  const origin = cell.points[0].date.getTime()
  const sources = measurements.filter(row => row.labDatum && row.wertNum !== null)
  const right = width - PLOT.right, bottom = height - PLOT.bottom
  const end = origin + (domain.days || 1) * MS_PER_DAY
  const xAt = (time: number) => PLOT.left + (time - origin) / MS_PER_DAY / (domain.days || 1) * (right - PLOT.left)
  const x = (date: Date) => xAt(date.getTime())
  const unit = (value: number) => logScale ? Math.log10(value) : value
  const y = (value: number) => bottom - (unit(value) - unit(domain.min)) / (unit(domain.max) - unit(domain.min) || 1) * (bottom - PLOT.top)
  const drawn = cell.points.map((point, index) => ({ point, index })).filter(({ point }) => !logScale || point.value > 0)
  // Events inside the chart's time range; an interval keeps the part inside it.
  const shownEvents = events.flatMap(event => {
    const start = event.date.getTime(), stop = event.endDate ? event.endDate.getTime() : null
    const inside = start >= origin && start <= end
    if (!inside && (stop === null || stop < origin || start > end)) return []
    return [{ event, line: inside ? xAt(start) : null, band: stop === null ? null : { from: xAt(Math.max(start, origin)), to: xAt(Math.min(Math.max(stop, start), end)) } }]
  })
  const eventTitle = (event: ClinicalEvent) => `${event.title}, ${formatWorkspaceDate(event.date)}${event.endDate ? ` to ${formatWorkspaceDate(event.endDate)}` : ''}`
  // On a log axis the ends are rarely round: three significant digits, so 0.004 does not read as 0.
  const endLabel = (value: number) => logScale ? value.toLocaleString('en-GB', { maximumSignificantDigits: 3 }) : formatWorkspaceNumber(value)
  const [maxLabel, minLabel] = [endLabel(domain.max), endLabel(domain.min)]
  return <svg className="wt-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" data-y-min={domain.min} data-y-max={domain.max} data-y-scale={logScale ? 'log' : 'linear'} aria-label={`Measurement trajectory for patient ${patientId}, ${label}: ${cell.points.length} measurements; ${scaleMode === 'shared' ? 'Shared parameter scale' : 'Zoom to visible values'}${logScale ? ', logarithmic' : ''}, days since first measurement${shownEvents.length ? `; ${shownEvents.length} ${shownEvents.length === 1 ? 'event' : 'events'}` : ''}`}>
    <title>{`Patient ${patientId}, ${label}: ${cell.points.map((point, i) => `${formatWorkspaceDate(point.date)}: ${boundedPrefix(sources[i]?.wertOperator)}${formatWorkspaceNumber(point.value)}`).join('; ')}${shownEvents.length ? `. Events: ${shownEvents.map(({ event }) => eventTitle(event)).join('; ')}` : ''}`}</title>
    {shownEvents.map(({ event, band }, i) => band && <rect key={`band-${i}`} data-testid="spark-event-band" x={Math.min(band.from, band.to)} width={Math.max(1, Math.abs(band.to - band.from))} y={PLOT.top} height={bottom - PLOT.top} fill={EVENT_COLOR} fillOpacity={.12}><title>{eventTitle(event)}</title></rect>)}
    <line x1={PLOT.left} x2={right} y1={PLOT.top} y2={PLOT.top} stroke="#e0e7eb" />
    <line x1={PLOT.left} x2={right} y1={bottom} y2={bottom} stroke="#e0e7eb" />
    <text x={PLOT.left - 5} y={PLOT.top + 3} textAnchor="end">{maxLabel}</text>
    <text x={PLOT.left - 5} y={bottom + 3} textAnchor="end">{minLabel}</text>
    <text x={PLOT.left} y={bottom + 16}>0</text><text x={right} y={bottom + 16} textAnchor="end">{formatWorkspaceNumber(domain.days)} days</text>
    {shownEvents.map(({ event, line }, i) => line !== null && <line key={`event-${i}`} data-testid="spark-event-line" x1={line} x2={line} y1={PLOT.top} y2={bottom} stroke={EVENT_COLOR} strokeWidth="1.2" strokeDasharray="2 3"><title>{eventTitle(event)}</title></line>)}
    <polyline points={drawn.map(({ point }) => `${x(point.date)},${y(point.value)}`).join(' ')} fill="none" stroke="#176c68" strokeWidth="1.7" />
    {drawn.map(({ point, index: i }) => <g key={i}><circle cx={x(point.date)} cy={y(point.value)} r="2.4" fill={boundedPrefix(sources[i]?.wertOperator) ? 'white' : '#176c68'} stroke="#176c68" />{boundedPrefix(sources[i]?.wertOperator) && <text x={x(point.date) + 3} y={y(point.value) - 3}>{sources[i].wertOperator}</text>}</g>)}
    {fit && drawnFitLines(cell, logScale).map((line, i) => <polyline key={i} points={line.map(point => `${x(point.date)},${y(point.value)}`).join(' ')} fill="none" stroke="#253b48" strokeWidth="1.4" strokeDasharray="4 3" />)}
  </svg>
}
