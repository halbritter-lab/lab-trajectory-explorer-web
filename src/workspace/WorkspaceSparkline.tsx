import type { CohortCell } from '../core/cohort/screening'
import type { LabRow, PatientId } from '../core/types'
import { boundedPrefix, formatWorkspaceDate, formatWorkspaceNumber } from './WorkspacePlot'

export interface SparkDomain { min: number; max: number; days: number }
export function WorkspaceSparkline({ cell, measurements, patientId, label, domain, fit, scaleMode }: {
  cell: CohortCell; measurements: LabRow[]; patientId: PatientId; label: string; domain: SparkDomain; fit: boolean;
  scaleMode: 'shared' | 'zoom';
}) {
  if (!cell.points.length) return null
  const origin = cell.points[0].date.getTime()
  const sources = measurements.filter(row => row.labDatum && row.wertNum !== null)
  const x = (date: Date) => 34 + (date.getTime() - origin) / 86_400_000 / (domain.days || 1) * 164
  const y = (value: number) => 59 - (value - domain.min) / (domain.max - domain.min || 1) * 45
  return <svg className="wt-sparkline" viewBox="0 0 218 85" role="img" data-y-min={domain.min} data-y-max={domain.max} aria-label={`Measurement trajectory for patient ${patientId}, ${label}: ${cell.points.length} measurements; ${scaleMode === 'shared' ? 'Shared parameter scale' : 'Zoom to visible values'}, days since first measurement`}>
    <title>{`Patient ${patientId}, ${label}: ${cell.points.map((point, i) => `${formatWorkspaceDate(point.date)}: ${boundedPrefix(sources[i]?.wertOperator)}${formatWorkspaceNumber(point.value)}`).join('; ')}`}</title>
    <line x1="34" x2="198" y1="14" y2="14" stroke="#e0e7eb" />
    <line x1="34" x2="198" y1="59" y2="59" stroke="#e0e7eb" />
    <text x="29" y="17" textAnchor="end">{formatWorkspaceNumber(domain.max)}</text>
    <text x="29" y="62" textAnchor="end">{formatWorkspaceNumber(domain.min)}</text>
    <text x="34" y="78">0</text><text x="198" y="78" textAnchor="end">{formatWorkspaceNumber(domain.days)} days</text>
    <polyline points={cell.points.map(point => `${x(point.date)},${y(point.value)}`).join(' ')} fill="none" stroke="#176c68" strokeWidth="1.7" />
    {cell.points.map((point, i) => <g key={i}><circle cx={x(point.date)} cy={y(point.value)} r="2.4" fill={boundedPrefix(sources[i]?.wertOperator) ? 'white' : '#176c68'} stroke="#176c68" />{boundedPrefix(sources[i]?.wertOperator) && <text x={x(point.date) + 3} y={y(point.value) - 3}>{sources[i].wertOperator}</text>}</g>)}
    {fit && cell.fitLines.map((line, i) => <polyline key={i} points={line.map(point => `${x(point.date)},${y(point.value)}`).join(' ')} fill="none" stroke="#253b48" strokeWidth="1.4" strokeDasharray="4 3" />)}
  </svg>
}
