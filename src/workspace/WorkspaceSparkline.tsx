import type { CohortCell } from '../core/cohort/screening'
import type { LabRow, PatientId } from '../core/types'
import { boundedPrefix, formatWorkspaceDate, formatWorkspaceNumber } from './WorkspacePlot'

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
 * An unmeasured table (width 0, as in tests without layout) gets the minimum. */
export function sparkWidth(available: number, columns: number, size: SparkSize): number {
  const { minWidth } = SPARK_SIZES[size]
  if (!(available > 0) || columns < 1) return minWidth
  return Math.max(minWidth, Math.floor((available - 126) / columns) - 20)
}

export function WorkspaceSparkline({ cell, measurements, patientId, label, domain, fit, scaleMode, width = SPARK_SIZES.small.minWidth, height = SPARK_SIZES.small.height }: {
  cell: CohortCell; measurements: LabRow[]; patientId: PatientId; label: string; domain: SparkDomain; fit: boolean;
  scaleMode: 'shared' | 'zoom'; width?: number; height?: number;
}) {
  if (!cell.points.length) return null
  const origin = cell.points[0].date.getTime()
  const sources = measurements.filter(row => row.labDatum && row.wertNum !== null)
  const right = width - PLOT.right, bottom = height - PLOT.bottom
  const x = (date: Date) => PLOT.left + (date.getTime() - origin) / 86_400_000 / (domain.days || 1) * (right - PLOT.left)
  const y = (value: number) => bottom - (value - domain.min) / (domain.max - domain.min || 1) * (bottom - PLOT.top)
  return <svg className="wt-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" data-y-min={domain.min} data-y-max={domain.max} aria-label={`Measurement trajectory for patient ${patientId}, ${label}: ${cell.points.length} measurements; ${scaleMode === 'shared' ? 'Shared parameter scale' : 'Zoom to visible values'}, days since first measurement`}>
    <title>{`Patient ${patientId}, ${label}: ${cell.points.map((point, i) => `${formatWorkspaceDate(point.date)}: ${boundedPrefix(sources[i]?.wertOperator)}${formatWorkspaceNumber(point.value)}`).join('; ')}`}</title>
    <line x1={PLOT.left} x2={right} y1={PLOT.top} y2={PLOT.top} stroke="#e0e7eb" />
    <line x1={PLOT.left} x2={right} y1={bottom} y2={bottom} stroke="#e0e7eb" />
    <text x={PLOT.left - 5} y={PLOT.top + 3} textAnchor="end">{formatWorkspaceNumber(domain.max)}</text>
    <text x={PLOT.left - 5} y={bottom + 3} textAnchor="end">{formatWorkspaceNumber(domain.min)}</text>
    <text x={PLOT.left} y={bottom + 16}>0</text><text x={right} y={bottom + 16} textAnchor="end">{formatWorkspaceNumber(domain.days)} days</text>
    <polyline points={cell.points.map(point => `${x(point.date)},${y(point.value)}`).join(' ')} fill="none" stroke="#176c68" strokeWidth="1.7" />
    {cell.points.map((point, i) => <g key={i}><circle cx={x(point.date)} cy={y(point.value)} r="2.4" fill={boundedPrefix(sources[i]?.wertOperator) ? 'white' : '#176c68'} stroke="#176c68" />{boundedPrefix(sources[i]?.wertOperator) && <text x={x(point.date) + 3} y={y(point.value) - 3}>{sources[i].wertOperator}</text>}</g>)}
    {fit && cell.fitLines.map((line, i) => <polyline key={i} points={line.map(point => `${x(point.date)},${y(point.value)}`).join(' ')} fill="none" stroke="#253b48" strokeWidth="1.4" strokeDasharray="4 3" />)}
  </svg>
}
