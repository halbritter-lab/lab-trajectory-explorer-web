import { useId, useMemo, useRef, useState } from 'react'
import type { CohortRow } from '../core/cohort/screening'
import type { LabRow, PatientId, WertOperator } from '../core/types'
import { slopeQualityLabel } from '../ui/qualityLabels'
import type { WorkspaceData, WorkspaceParameter } from './workspace-data'
import { ChartExportActions } from './WorkspaceExports'

export type WorkspaceAxis = 'baseline' | 'calendar' | 'age'
export interface WorkspaceDisplay { points: boolean; connect: boolean; events: boolean }
const YEAR = 365.25 * 86_400_000
const colors = ['#176c68', '#487ca9', '#a15a2c', '#8560a4', '#8c7427', '#b14c73', '#3d797f']
export const formatWorkspaceNumber = (value: number) => Number.isFinite(value) ? value.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '—'
export const formatWorkspaceDate = (date: Date) => date.toLocaleDateString('en-GB', { timeZone: 'UTC' })
export const boundedPrefix = (operator?: WertOperator) => operator === '<' || operator === '>' ? `${operator} ` : ''
export function measurementText(row: LabRow): string {
  const prefix = boundedPrefix(row.wertOperator)
  const text = row.wert ?? 'Missing'
  return prefix && !/^[<>≤≥]/.test(text.trim()) ? `${prefix}${text}` : text
}

export function WorkspacePlot({ data, parameter, parameterIndex, cohortRows, axis, groupBy, highlight, display, showFit, onOpen }: {
  data: WorkspaceData; parameter: WorkspaceParameter; parameterIndex: number; cohortRows: CohortRow[];
  axis: WorkspaceAxis; groupBy: string; highlight: PatientId | null; display: WorkspaceDisplay; showFit: boolean;
  onOpen: (id: PatientId) => void;
}) {
  const svg = useRef<SVGSVGElement>(null)
  const clip = useId().replace(/:/g, '')
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([])
  const prepared = useMemo(() => {
    const patients = new Map(data.patients.map(p => [p.id, p]))
    const firstDates = new Map<PatientId, number>()
    const sourceRows = new Map<PatientId, LabRow[]>()
    for (const row of data.rows) {
      if (!row.labDatum || !Number.isFinite(row.labDatum.getTime())) continue
      firstDates.set(row.patientId, Math.min(firstDates.get(row.patientId) ?? Infinity, row.labDatum.getTime()))
      if (row.bezeichnung === parameter.bezeichnung && row.einheit === parameter.einheit && row.wertNum !== null) {
        const bucket = sourceRows.get(row.patientId) ?? []; bucket.push(row); sourceRows.set(row.patientId, bucket)
      }
    }
    for (const rows of sourceRows.values()) rows.sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    return cohortRows.map(row => {
      const cell = row.cells[parameterIndex]
      const patient = patients.get(row.patientId)
      const baseline = cell?.points[0]?.date.getTime()
      const age = patient?.baselineAge ?? null
      const ageDate = firstDates.get(row.patientId)
      const anchor = patient?.birthAnchor
      const xValue = (date: Date): number | null => axis === 'calendar' ? date.getTime() : axis === 'baseline'
        ? baseline === undefined ? null : (date.getTime() - baseline) / YEAR
        : anchor !== undefined ? anchor === null ? null : (date.getTime() - anchor.getTime()) / YEAR
          : age === null || ageDate === undefined ? null : age + (date.getTime() - ageDate) / YEAR
      const group = groupBy ? patient?.attributes[groupBy] || 'Not recorded' : 'All patients'
      const points = (cell?.points ?? []).flatMap((point, index) => {
        const x = xValue(point.date)
        return x === null || !Number.isFinite(x) || !Number.isFinite(point.value) ? [] : [{ ...point, x, operator: sourceRows.get(row.patientId)?.[index]?.wertOperator ?? '=' as WertOperator }]
      })
      return { row, cell, group, points, xValue, ageEstimated: patient?.ageEstimated ?? anchor === undefined }
    })
  }, [data.rows, data.patients, cohortRows, parameter, parameterIndex, axis, groupBy])
  const groups = [...new Set(prepared.map(p => p.group))].sort()
  const fullGroups = [...new Set(data.patients.map(patient => groupBy ? patient.attributes[groupBy] || 'Not recorded' : 'All patients'))].sort()
  const groupColor = (group: string) => colors[fullGroups.indexOf(group) % colors.length]
  const visible = prepared.filter(p => !hiddenGroups.includes(p.group) && p.points.length > 0)
  const uncertain = visible.filter(p => slopeQualityLabel(p.cell)?.caveat && Number.isFinite(p.cell.slope)).length
  const noFit = visible.filter(p => !Number.isFinite(p.cell.slope)).length
  const withoutValues = prepared.filter(p => !p.cell?.points.length).length
  const withoutAge = prepared.filter(p => p.cell?.points.length && !p.points.length).length
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
  for (const series of visible) {
    for (const p of series.points) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.value); yMax = Math.max(yMax, p.value) }
    if (showFit) for (const line of series.cell.fitLines) for (const p of line) {
      if (Number.isFinite(p.value)) { yMin = Math.min(yMin, p.value); yMax = Math.max(yMax, p.value) }
    }
    if (display.events) for (const event of data.events.filter(e => e.patientId === series.row.patientId)) {
      const x = series.xValue(event.date)
      if (x !== null && Number.isFinite(x)) { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x) }
    }
  }
  if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1 }
  if (xMin === xMax) { const pad = axis === 'calendar' ? 86_400_000 : .5; xMin -= pad; xMax += pad }
  const yPad = (yMax - yMin || Math.abs(yMax) || 1) * .08
  yMin -= yPad; yMax += yPad
  const x = (n: number) => 65 + (n - xMin) / (xMax - xMin) * 565
  const y = (n: number) => 240 - (n - yMin) / (yMax - yMin) * 210
  const axisLabel = axis === 'calendar' ? 'Calendar date' : axis === 'age' ? 'Age (years)' : 'Years since first measurement of this parameter'
  const hasHighlight = visible.some(p => p.row.patientId === highlight)
  const exportTitle = cohortRows.length === 1 ? `Patient ${cohortRows[0].patientId} · ${parameter.label}` : parameter.label
  return <section className="wt-plot-card" aria-label={`Chart ${parameter.label}`}>
    <div className="wt-card-heading"><h3>{parameter.label}</h3><ChartExportActions getSvg={() => svg.current} title={exportTitle} /></div>
    {groupBy && <div className="wt-legend" role="group" aria-label={`Groups for ${parameter.label}`}>{groups.map(group => <button key={group} aria-pressed={!hiddenGroups.includes(group)} onClick={() => setHiddenGroups(previous => previous.includes(group) ? previous.filter(g => g !== group) : [...previous, group])}><span style={{ color: groupColor(group) }}>● </span>{group}{hiddenGroups.includes(group) ? ' (hidden)' : ''}</button>)}</div>}
    <p className="wt-muted">{visible.length} of {cohortRows.length} trajectories visible · {withoutValues} without numeric measurements · {withoutAge} additional trajectories without age data</p>
    {axis === 'age' && <p className="wt-muted">Age from the birth-date anchor · {visible.filter(p => p.ageEstimated).length} trajectories use an estimated birth-date anchor; the others use a recorded birth date.</p>}
    {!visible.length ? <p>No trajectories can be plotted. Check measurements, ages, or visible groups.</p> : <svg ref={svg} viewBox="0 0 660 310" className="wt-plot" role="group" aria-label={`${parameter.label}: ${visible.length} trajectories, ${axisLabel}`} data-export-legend={JSON.stringify(groupBy ? groups.filter(group => !hiddenGroups.includes(group)).map(group => ({ label: group, color: groupColor(group) })) : [])} data-export-context={`${axisLabel}; ${visible.length} visible trajectories${groupBy ? `; Grouping: ${groupBy}; hidden: ${hiddenGroups.join(', ') || 'none'}` : ''}${axis === 'age' ? `; ${visible.filter(p => p.ageEstimated).length} estimated birth-date anchors` : ''}${showFit ? `; ${uncertain} uncertain individual OLS fits; ${noFit} without a fit` : ''}`}>
      <title>{parameter.label} · {axisLabel}</title>
      <desc>Measurements for the selected patients. Press Enter or Space to open a trajectory. Research use only.</desc>
      <defs><clipPath id={clip}><rect x="65" y="20" width="565" height="230" /></clipPath></defs>
      {[0, .5, 1].map(f => { const v = yMin + (yMax - yMin) * f; return <g key={f}><line x1="65" x2="630" y1={y(v)} y2={y(v)} stroke="#dce5e9" /><text x="57" y={y(v) + 4} textAnchor="end">{formatWorkspaceNumber(v)}</text></g> })}
      {[0, .25, .5, .75, 1].map(f => { const v = xMin + (xMax - xMin) * f; return <text key={f} x={x(v)} y="265" textAnchor="middle">{axis === 'calendar' ? formatWorkspaceDate(new Date(v)) : formatWorkspaceNumber(v)}</text> })}
      <text x="345" y="294" textAnchor="middle">{axisLabel}</text>
      {visible.map(series => {
        const color = groupColor(series.group)
        const active = series.row.patientId === highlight
        return <g key={String(series.row.patientId)} clipPath={`url(#${clip})`} opacity={hasHighlight && !active ? .25 : 1}>
          <g role="button" tabIndex={0} aria-label={`Open patient ${series.row.patientId}, ${parameter.label}`} onClick={() => onOpen(series.row.patientId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(series.row.patientId) } }} className="wt-chart-person">
            <title>Patient {series.row.patientId} · {series.group}</title>
            {display.connect && <polyline points={series.points.map(p => `${x(p.x)},${y(p.value)}`).join(' ')} fill="none" stroke={color} strokeWidth={active ? 3 : 1.5} />}
            {series.points.filter(p => display.points || display.connect && (series.points.length === 1 || boundedPrefix(p.operator))).map((p, i) => <g key={i}><circle cx={x(p.x)} cy={y(p.value)} r={active ? 4 : 3} fill={boundedPrefix(p.operator) ? 'white' : color} stroke={color}><title>{`${formatWorkspaceDate(p.date)}: ${boundedPrefix(p.operator)}${formatWorkspaceNumber(p.value)} ${parameter.einheit ?? ''}`}</title></circle>{boundedPrefix(p.operator) && <text x={x(p.x) + 5} y={y(p.value) - 5} fill={color}>{p.operator}</text>}</g>)}
            {showFit && series.cell.fitLines.map((line, i) => <polyline key={i} points={line.flatMap(p => { const position = series.xValue(p.date); return position === null || !Number.isFinite(p.value) ? [] : [`${x(position)},${y(p.value)}`] }).join(' ')} fill="none" stroke={color} strokeDasharray="6 4" strokeWidth="2" />)}
          </g>
          {display.events && data.events.filter(event => event.patientId === series.row.patientId).map((event, i) => { const position = series.xValue(event.date); return position === null ? null : <line key={i} x1={x(position)} x2={x(position)} y1="30" y2="240" stroke="#936221" strokeDasharray="2 5"><title>Patient {event.patientId}: {event.title}, {formatWorkspaceDate(event.date)}</title></line> })}
        </g>
      })}
    </svg>}
    {showFit && <p className="wt-muted">Dashed: individual OLS lines from the prepared analyses.</p>}
    {showFit && uncertain > 0 && <p className="wt-warning">{uncertain} individual fits have uncertain slopes: fewer than three fitted measurements or less than one year of follow-up. Even R² = 1 can be based on only two points.</p>}
    {showFit && noFit > 0 && <p>{noFit} trajectories without an available fit.</p>}
    {visible.some(p => p.points.some(point => boundedPrefix(point.operator))) && <p className="wt-muted">Hollow points marked &lt; or &gt; are bounds, not exact measurements. The existing fit uses their numeric limits.</p>}
    {!display.points && !display.connect && <p>Measurement points and connecting lines are hidden.</p>}
    {groupBy && <p className="wt-muted">The legend only changes the display; selection and exports remain unchanged.</p>}
  </section>
}
