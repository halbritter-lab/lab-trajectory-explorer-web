import { useId, useMemo, useRef, useState } from 'react'
import { formatDisplayDate, formatDisplayNumber } from '../core/format'
import type { CohortRow } from '../core/cohort/screening'
import type { LabRow, PatientId, WertOperator } from '../core/types'
import { slopeQualityLabel } from './labels/qualityLabels'
import type { WorkspaceData, WorkspaceParameter } from './workspace-data'
import { ChartExportActions } from './WorkspaceExports'
import type { SparkDomain } from './WorkspaceSparkline'
import { exclusionReasonLabel, sexLabel } from './workspace-labels'
import { useAppStore } from './state/store'
import { mixedModelFitConfigHash, mixedModelMeanLinePoints } from '../core/mixedModel/resultIdentity'
import type { MixedModelSpikeRow } from '../core/mixedModel/types'
import { groupPatients, UNGROUPED } from '../core/grouping/grouping'
import { workspaceSpecs } from './workspace-data'
import { currentWorkspaceModels, workspaceGroupableAttributes, workspaceModelEntities } from './workspace-model-results'
import { overlayModules } from '../core/analysis/registry'

export type WorkspaceAxis = 'baseline' | 'calendar' | 'age'
/** Modules whose overlays the charts can draw, with their presentation. */
export const OVERLAY_MODULES = overlayModules().map(module => ({ id: module.id, presentation: module.overlayPresentation! }))
/** Display toggles: measurement marks, events, and one per overlay module,
 * keyed by module id (e.g. `aki`). */
export interface WorkspaceDisplay { points: boolean; connect: boolean; events: boolean; [overlayModuleId: string]: boolean }
export const DEFAULT_WORKSPACE_DISPLAY: WorkspaceDisplay = { points: true, connect: true, events: false, ...Object.fromEntries(OVERLAY_MODULES.map(module => [module.id, false])) }
const EXCLUDED_COLOR = '#64748b'
const MS_PER_DAY = 86_400_000

function meanBaselineAge(rows: readonly MixedModelSpikeRow[]): number | null {
  const ages = [...new Map(rows.map(row => [row.patient_id, row.baseline_age])).values()]
    .filter((age): age is number => age !== undefined && Number.isFinite(age))
  return ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null
}
const YEAR = 365.25 * 86_400_000
const colors = ['#176c68', '#487ca9', '#a15a2c', '#8560a4', '#8c7427', '#b14c73', '#3d797f']
export const formatWorkspaceNumber = formatDisplayNumber
export const formatWorkspaceDate = formatDisplayDate
export const boundedPrefix = (operator?: WertOperator) => operator === '<' || operator === '>' ? `${operator} ` : ''
export function measurementText(row: LabRow): string {
  const prefix = boundedPrefix(row.wertOperator)
  const text = row.wert ?? 'Missing'
  return prefix && !/^[<>≤≥]/.test(text.trim()) ? `${prefix}${text}` : text
}

export function WorkspacePlot({ data, parameter, parameterIndex, cohortRows, axis, groupBy, highlight, display, showFit, onOpen, sharedDomain, scaleMode }: {
  data: WorkspaceData; parameter: WorkspaceParameter; parameterIndex: number; cohortRows: CohortRow[];
  axis: WorkspaceAxis; groupBy: string; highlight: PatientId | null; display: WorkspaceDisplay; showFit: boolean;
  onOpen: (id: PatientId) => void;
  sharedDomain: SparkDomain; scaleMode: 'shared' | 'zoom';
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
        // Exclusions only mean something for a fit; with no fit model nothing is marked.
        const exclusions: string[] = cell && cell.fitModel !== 'none' ? cell.pointExclusionReasons?.[index] ?? [] : []
        return x === null || !Number.isFinite(x) || !Number.isFinite(point.value) ? [] : [{ ...point, x, exclusions, operator: sourceRows.get(row.patientId)?.[index]?.wertOperator ?? '=' as WertOperator }]
      })
      // Module markers (e.g. AKI episodes, which reach every column of the
      // patient) sit on this series' nearest measurement only if one lies within
      // the marker's snapping distance; otherwise a value-free tick marks the
      // date on the time axis, so a marker never borrows an unrelated value.
      const markers = (cell?.overlays ?? []).flatMap(marker => {
        if (marker.kind !== 'marker') return []
        const target = marker.date.getTime()
        const nearest = points.length ? points.reduce((best, p) => Math.abs(p.date.getTime() - target) < Math.abs(best.date.getTime() - target) ? p : best, points[0]) : null
        const onPoint = nearest !== null && Math.abs(nearest.date.getTime() - target) <= marker.snapWithinDays * MS_PER_DAY
        const x = onPoint ? nearest.x : xValue(marker.date)
        if (x === null || !Number.isFinite(x)) return []
        return [{ moduleId: marker.moduleId, x, value: onPoint ? nearest.value : null, label: marker.label, title: `${marker.title}${onPoint ? '' : marker.offMeasurementNote}` }]
      })
      const bands = (cell?.overlays ?? []).flatMap(band => {
        if (band.kind !== 'band') return []
        const start = xValue(band.start), end = xValue(band.end)
        return start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end) ? [] : [{ moduleId: band.moduleId, start, end, title: band.title }]
      })
      return { row, cell, group, points, markers, bands, xValue, ageEstimated: patient?.ageEstimated ?? anchor === undefined }
    })
  }, [data.rows, data.patients, cohortRows, parameter, parameterIndex, axis, groupBy])
  const groups = [...new Set(prepared.map(p => p.group))].sort()
  const fullGroups = [...new Set(data.patients.map(patient => groupBy ? patient.attributes[groupBy] || 'Not recorded' : 'All patients'))].sort()
  const groupColor = (group: string) => colors[fullGroups.indexOf(group) % colors.length]
  const groupLabel = (group: string) => groupBy === 'sex' ? sexLabel(group) : group
  const visible = prepared.filter(p => !hiddenGroups.includes(p.group) && p.points.length > 0)
  const uncertain = visible.filter(p => slopeQualityLabel(p.cell)?.caveat && Number.isFinite(p.cell.slope)).length
  const noFit = visible.filter(p => !Number.isFinite(p.cell.slope)).length
  const fitModel = prepared[0]?.cell?.fitModel ?? 'none'
  const modelLabel = { ols: 'OLS', 'theil-sen': 'Theil–Sen', 'rolling-ols': 'Rolling OLS', 'segmented-ols': 'Segmented OLS', none: 'No fit' }[fitModel]
  const withoutValues = prepared.filter(p => !p.cell?.points.length).length
  const withoutAge = prepared.filter(p => p.cell?.points.length && !p.points.length).length
  const cohortModelResults = useAppStore(s => s.cohortModelResults)
  const showCohortMixedModelLine = useAppStore(s => s.showCohortMixedModelLine)
  const mixedModelConfig = useAppStore(s => s.mixedModelConfig)

  // Cohort mixed-model reference lines: the pooled fit and, when the overlay is
  // grouped by the attribute the groups were fitted under, one line per group.
  // A line is drawn only for a result whose source identity matches the full
  // dataset preparation; display filters never change the model population.
  const modelLines = useMemo(() => {
    if (!showCohortMixedModelLine || !cohortModelResults || (axis !== 'baseline' && axis !== 'age')) return []
    const spec = workspaceSpecs(data, [parameter.key])[0]
    if (!spec) return []
    const patientIds = data.patients.map(p => p.id)
    const groups = groupBy ? groupPatients(patientIds, workspaceGroupableAttributes(data.rows, data.patientAttributes), groupBy) : []
    const entities = workspaceModelEntities(data.rows, patientIds, spec, mixedModelConfig, data.patientAttributes, groups)
    const current = currentWorkspaceModels(cohortModelResults, entities,
      data.parameters.findIndex(p => p.key === parameter.key), parameter.key,
      mixedModelFitConfigHash(spec, mixedModelConfig))
    return entities.flatMap(item => {
      const key = item.entity.kind === 'cohort' ? 'cohort' : `group:${item.entity.value}`
      const stored = current[key]
      if (!stored || stored.result.status !== 'success') return []
      const baselineAge = meanBaselineAge(item.rows)
      if (axis === 'age' && baselineAge === null) return []
      const points = mixedModelMeanLinePoints(stored.result, item.rows, {
        baselineAgeCentered: 0,
        ageAxisBaselineAge: axis === 'age' ? baselineAge : null,
      }).filter(pt => Number.isFinite(pt.time_since_baseline) && Number.isFinite(pt.eGFR) && (axis !== 'age' || pt.age !== undefined))
      if (points.length < 2) return []
      // Overlay groups label missing values 'Not recorded'; the model uses UNGROUPED.
      const group = item.entity.kind === 'group' ? (item.entity.value === UNGROUPED ? 'Not recorded' : item.entity.value) : null
      return [{ key, group, points }]
    })
  }, [showCohortMixedModelLine, cohortModelResults, data, parameter.key, axis, mixedModelConfig, groupBy])
  // Group lines follow the overlay: only groups currently plotted (after the
  // group filter) and not hidden in the legend.
  const visibleModelLines = modelLines.filter(line => line.group === null || groups.includes(line.group) && fullGroups.includes(line.group) && !hiddenGroups.includes(line.group))
  const pooledModelLine = visibleModelLines.find(line => line.group === null)
  const groupModelLines = visibleModelLines.filter(line => line.group !== null)

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
  for (const point of visibleModelLines.flatMap(line => line.points)) {
    const position = axis === 'age' ? point.age : point.time_since_baseline
    if (position !== undefined) { xMin = Math.min(xMin, position); xMax = Math.max(xMax, position) }
    if (scaleMode === 'zoom') { yMin = Math.min(yMin, point.eGFR); yMax = Math.max(yMax, point.eGFR) }
  }
  if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1 }
  if (xMin === xMax) { const pad = axis === 'calendar' ? 86_400_000 : .5; xMin -= pad; xMax += pad }
  if (scaleMode === 'shared') { yMin = sharedDomain.min; yMax = sharedDomain.max }
  else {
    const yPad = (yMax - yMin || Math.abs(yMax) || 1) * .08
    yMin -= yPad; yMax += yPad
  }
  const scaleLabel = scaleMode === 'shared' ? 'Shared parameter scale' : 'Zoom to visible values'
  const visibleIds = new Set(visible.map(series => series.row.patientId))
  const visibleEvents = data.events.filter(event => visibleIds.has(event.patientId))
  const x = (n: number) => 65 + (n - xMin) / (xMax - xMin) * 565
  const y = (n: number) => 240 - (n - yMin) / (yMax - yMin) * 210
  const axisLabel = axis === 'calendar' ? 'Calendar date' : axis === 'age' ? 'Age (years)' : 'Years since first measurement of this parameter'
  const hasHighlight = visible.some(p => p.row.patientId === highlight)
  const exportTitle = cohortRows.length === 1 ? `Patient ${cohortRows[0].patientId} · ${parameter.label}` : parameter.label
  const markVisible = display.points || display.connect
  const excludedCount = markVisible ? visible.reduce((sum, series) => sum + series.points.filter(p => p.exclusions.length > 0).length, 0) : 0
  const excludedReasons = [...new Set(visible.flatMap(series => series.points.flatMap(p => p.exclusions)))]
  const shownOverlays = OVERLAY_MODULES.filter(module => display[module.id])
  const overlayShown = (moduleId: string) => display[moduleId] ?? false
  const markerCount = (moduleId: string) => visible.reduce((sum, series) => sum + series.markers.filter(marker => marker.moduleId === moduleId).length, 0)
  const overlayColor = (moduleId: string) => OVERLAY_MODULES.find(module => module.id === moduleId)?.presentation.color
  // Windows and labels for one trajectory at a time keep the overlay readable.
  const overlayDetail = (patientId: PatientId) => cohortRows.length === 1 || patientId === highlight


  return <section className="wt-plot-card" aria-label={`Chart ${parameter.label}`}>
    <div className="wt-card-heading"><h3>{parameter.label}</h3><ChartExportActions getSvg={() => svg.current} title={exportTitle} /></div>
    {groupBy && <div className="wt-legend" role="group" aria-label={`Groups for ${parameter.label}`}>{groups.map(group => <button key={group} aria-pressed={!hiddenGroups.includes(group)} onClick={() => setHiddenGroups(previous => previous.includes(group) ? previous.filter(g => g !== group) : [...previous, group])}><span style={{ color: groupColor(group) }}>● </span>{groupLabel(group)}{hiddenGroups.includes(group) ? ' (hidden)' : ''}</button>)}</div>}
    <p className="wt-muted">{scaleLabel}{cohortRows.length > 1 ? ` · ${visible.length} of ${cohortRows.length} trajectories` : ''}{withoutValues > 0 ? ` · ${withoutValues} without numeric measurements` : ''}{withoutAge > 0 ? ` · ${withoutAge} additional trajectories without age data` : ''}</p>
    {axis === 'age' && <p className="wt-muted">{cohortRows.length === 1 ? visible[0]?.ageEstimated ? 'Age: estimated birth-date anchor.' : visible.length ? 'Age: recorded birth date.' : 'Age unavailable.' : `${visible.filter(p => p.ageEstimated).length} estimated birth-date anchors; other ages use recorded birth dates.`}</p>}
    {!visible.length ? <p>No trajectories can be plotted. Check measurements, ages, or visible groups.</p> : <svg ref={svg} viewBox="0 0 660 310" className="wt-plot" data-y-min={yMin} data-y-max={yMax} role="group" aria-label={`${parameter.label}: ${visible.length} trajectories, ${axisLabel}`} data-export-legend={JSON.stringify(groupBy ? groups.filter(group => !hiddenGroups.includes(group)).map(group => ({ label: groupLabel(group), color: groupColor(group) })) : [])} data-export-context={`${scaleLabel}; ${axisLabel}; ${visible.length} visible trajectories${groupBy ? `; Grouping: ${groupBy}; hidden: ${hiddenGroups.map(groupLabel).join(', ') || 'none'}` : ''}${axis === 'age' ? `; ${visible.filter(p => p.ageEstimated).length} estimated birth-date anchors` : ''}${showFit ? fitModel === 'none' ? '; Fit model disabled' : `; ${uncertain} uncertain individual ${modelLabel} fits; ${noFit} without a fit` : ''}${excludedCount ? `; ${excludedCount} measurements excluded from the fit (grey open circles)` : ''}${shownOverlays.map(module => `; ${module.presentation.exportContext(markerCount(module.id))}`).join('')}${pooledModelLine ? '; Cohort mixed model mean line' : ''}${groupModelLines.length ? `; Group mixed model mean lines: ${groupModelLines.map(line => groupLabel(line.group!)).join(', ')}` : ''}`}>
      <title>{parameter.label} · {axisLabel}</title>
      <desc>Measurements for the selected patients. Press Enter or Space to open a trajectory. Research use only.</desc>
      <defs><clipPath id={clip}><rect x="65" y="20" width="565" height="230" /></clipPath></defs>
      {[0, .5, 1].map(f => { const v = yMin + (yMax - yMin) * f; return <g key={f}><line x1="65" x2="630" y1={y(v)} y2={y(v)} stroke="#dce5e9" /><text x="57" y={y(v) + 4} textAnchor="end">{formatWorkspaceNumber(v)}</text></g> })}
      {[0, .25, .5, .75, 1].map(f => { const v = xMin + (xMax - xMin) * f; return <text key={f} x={x(v)} y="265" textAnchor="middle">{axis === 'calendar' ? formatWorkspaceDate(new Date(v)) : formatWorkspaceNumber(v)}</text> })}
      <text x="345" y="294" textAnchor="middle">{axisLabel}</text>
      {shownOverlays.map(module => <g key={module.id} clipPath={`url(#${clip})`} className={`wt-${module.id}-bands`}>{visible.filter(series => overlayDetail(series.row.patientId)).flatMap(series => series.bands.filter(band => band.moduleId === module.id).map((band, i) => <rect key={`${String(series.row.patientId)}-${i}`} data-testid={`${module.id}-band`} x={x(band.start)} width={Math.max(1, x(band.end) - x(band.start))} y="20" height="230" fill={module.presentation.color} fillOpacity={.1}><title>{band.title}</title></rect>))}</g>)}
      {visible.map(series => {
        const color = groupColor(series.group)
        const active = series.row.patientId === highlight
        const uncertainFit = Boolean(showFit && slopeQualityLabel(series.cell)?.caveat && Number.isFinite(series.cell.slope))
        return <g key={String(series.row.patientId)} clipPath={`url(#${clip})`} opacity={hasHighlight && !active ? .25 : 1}>
          <g role="button" tabIndex={0} aria-label={`Open patient ${series.row.patientId}, ${parameter.label}`} aria-description={uncertainFit ? "Uncertain slope: limited fitted measurements or follow-up. Dotted fit line." : undefined} onClick={() => onOpen(series.row.patientId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(series.row.patientId) } }} className="wt-chart-person">
            <title>Patient {series.row.patientId} · {groupLabel(series.group)}</title>
            {display.connect && <polyline points={series.points.map(p => `${x(p.x)},${y(p.value)}`).join(' ')} fill="none" stroke={color} strokeWidth={active ? 3 : 1.5} />}
            {series.points.filter(p => display.points || display.connect && (series.points.length === 1 || boundedPrefix(p.operator) || p.exclusions.length > 0)).map((p, i) => {
              const excluded = p.exclusions.length > 0
              const pointTitle = `${formatWorkspaceDate(p.date)}: ${boundedPrefix(p.operator)}${formatWorkspaceNumber(p.value)} ${parameter.einheit ?? ''}${excluded ? ` · excluded from the fit: ${p.exclusions.map(exclusionReasonLabel).join('; ')}` : ''}`
              return <g key={i}>{excluded
                ? <circle data-testid="excluded-point" data-exclusion={p.exclusions.join(' ')} cx={x(p.x)} cy={y(p.value)} r={active ? 4.5 : 3.5} fill="white" stroke={EXCLUDED_COLOR} strokeWidth={1.6} strokeDasharray="2 1.5"><title>{pointTitle}</title></circle>
                : <circle cx={x(p.x)} cy={y(p.value)} r={active ? 4 : 3} fill={boundedPrefix(p.operator) ? 'white' : color} stroke={color}><title>{pointTitle}</title></circle>}
                {boundedPrefix(p.operator) && <text x={x(p.x) + 5} y={y(p.value) - 5} fill={excluded ? EXCLUDED_COLOR : color}>{p.operator}</text>}</g>
            })}
            {showFit && series.cell.fitLines.map((line, i) => <polyline key={i} points={line.flatMap(p => { const position = series.xValue(p.date); return position === null || !Number.isFinite(p.value) ? [] : [`${x(position)},${y(p.value)}`] }).join(' ')} fill="none" stroke={color} data-fit-quality={uncertainFit ? "uncertain" : "supported"} strokeDasharray={uncertainFit ? "2 4" : "6 4"} strokeWidth="2" />)}
            {series.markers.filter(marker => overlayShown(marker.moduleId)).map((marker, i) => {
              // Off-series markers sit on the time axis, not on a value.
              const markerY = marker.value === null ? 244 : y(marker.value)
              const markerColor = overlayColor(marker.moduleId)
              return <g key={`${marker.moduleId}-${i}`} data-testid={`${marker.moduleId}-marker`} data-on-measurement={marker.value !== null}><path d={`M ${x(marker.x)} ${markerY - 6} l 5 6 l -5 6 l -5 -6 Z`} fill={marker.value === null ? 'white' : markerColor} stroke={markerColor} strokeWidth={1.2}><title>{marker.title}</title></path>{overlayDetail(series.row.patientId) && <text x={x(marker.x)} y={markerY - 10} textAnchor="middle" fill={markerColor} fontSize="10">{marker.label}</text>}</g>
            })}
          </g>
          {display.events && data.events.filter(event => event.patientId === series.row.patientId).map((event, i) => { const position = series.xValue(event.date); return position === null ? null : <line key={i} x1={x(position)} x2={x(position)} y1="30" y2="240" stroke="#936221" strokeDasharray="2 5"><title>Patient {event.patientId}: {event.title}, {formatWorkspaceDate(event.date)}</title></line> })}
        </g>
      })}
      {groupModelLines.map(line => <g key={line.key} clipPath={`url(#${clip})`} className="wt-group-model-line" data-group={line.group!}>
        <polyline points={line.points.map(p => `${x(axis === 'age' && p.age !== undefined ? p.age : p.time_since_baseline)},${y(p.eGFR)}`).join(' ')}
          fill="none" stroke={groupColor(line.group!)} strokeWidth={3.5} strokeDasharray="10 3 2 3" strokeLinecap="round">
          <title>Mixed-model mean trajectory · {groupLabel(line.group!)}</title>
        </polyline>
      </g>)}
      {pooledModelLine && (
        <g clipPath={`url(#${clip})`} className="wt-cohort-model-line">
          <polyline
            points={pooledModelLine.points.map(p => `${x(axis === 'age' && p.age !== undefined ? p.age : p.time_since_baseline)},${y(p.eGFR)}`).join(' ')}
            fill="none"
            stroke="#0f172a"
            strokeWidth={3}
            strokeDasharray="8 4"
          >
            <title>Cohort mixed model mean trajectory</title>
          </polyline>
        </g>
      )}
    </svg>}
    {display.events && <details className="wt-event-inspector"><summary>Inspect events ({visibleEvents.length})</summary>{visibleEvents.length ? <ul>{visibleEvents.map((event, index) => <li key={index}>Patient {event.patientId} · {formatWorkspaceDate(event.date)} · {event.title}{event.endDate ? ` to ${formatWorkspaceDate(event.endDate)}` : ''}{event.description ? ` · ${event.description}` : ''}</li>)}</ul> : <p>No events for the plotted patients.</p>}</details>}
    {showFit && <p className="wt-muted">{fitModel === 'none' ? 'Fit model disabled.' : `Dashed: individual ${modelLabel} lines from the prepared analyses.`}</p>}
    {pooledModelLine && <p className="wt-muted">Dark dashed line: full-cohort mixed-model reference trajectory; numeric factors at their fitted centers and categorical factors at reference levels.{axis === 'age' ? ' Age axis: mean baseline age of fitted patients plus elapsed model time.' : ''}</p>}
    {groupModelLines.length > 0 && <p className="wt-muted" data-testid="group-model-legend">Thick dash-dot lines in group colours: mixed-model reference trajectories fitted separately per group ({groupModelLines.map(line => groupLabel(line.group!)).join(', ')}).{axis === 'age' ? ' Age axis: mean baseline age of each group plus elapsed model time.' : ''}</p>}
    {excludedCount > 0 && <p className="wt-muted wt-plot-key"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4" fill="white" stroke={EXCLUDED_COLOR} strokeWidth="1.6" strokeDasharray="2 1.5" /></svg> Grey open circles: {excludedCount} measurements excluded from the fit ({excludedReasons.map(exclusionReasonLabel).join('; ')}). They stay visible but do not enter the slope.</p>}
    {shownOverlays.map(module => <p key={module.id} className="wt-muted wt-plot-key">{markerCount(module.id) > 0
      ? <><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M 6 0 l 5 6 l -5 6 l -5 -6 Z" fill={module.presentation.color} /></svg>{module.presentation.markerLegend}{' '}<span className="wt-overlay-swatch" aria-hidden="true" style={{ background: `${module.presentation.color}26`, borderColor: `${module.presentation.color}40` }} />{module.presentation.bandLegend}{cohortRows.length > 1 ? ', shown for the highlighted patient' : ''}.</>
      : module.presentation.emptyLegend}</p>)}
    {showFit && uncertain > 0 && <p className="wt-warning">{uncertain} individual fits have uncertain slopes: fewer than three fitted measurements or less than one year of follow-up. Dotted fit lines identify these patients. Even R² = 1 can be based on only two points.</p>}
    {showFit && noFit > 0 && <p>{noFit} trajectories without an available fit.</p>}
    {visible.some(p => p.points.some(point => boundedPrefix(point.operator))) && <p className="wt-muted">Hollow points marked &lt; or &gt; are bounds, not exact measurements. The existing fit uses their numeric limits.</p>}
    {!display.points && !display.connect && <p>Measurement points and connecting lines are hidden.</p>}
    {groupBy && <p className="wt-muted">The legend only changes the display; selection and exports remain unchanged.</p>}
  </section>
}
