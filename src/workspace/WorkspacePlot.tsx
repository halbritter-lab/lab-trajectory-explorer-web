import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { calendarTicks, logTickLabels, logTicks, niceTicks, tickLabels } from './plot-ticks'
import { layoutMarkerLabels } from './marker-labels'
import { NOT_USED_FOR_AKI_DETECTION, skippedByAkiDetection } from './aki-detection'
import type { ClinicalEvent } from '../core/events/events'
import { formatDisplayDate, formatDisplayNumber, formatFixedDecimals, MIN_SLOPE_DECIMALS } from '../core/format'
import type { CohortRow } from '../core/cohort/screening'
import { patientIdKey, type LabRow, type PatientId, type WertOperator } from '../core/types'
import { slopeQualityLabel } from './labels/qualityLabels'
import { cellSlopeTier } from '../core/cohort/screening'
import type { WorkspaceData, WorkspaceParameter } from './workspace-data'
import { ChartExportActions } from './WorkspaceExports'
import type { SparkDomain } from './WorkspaceSparkline'
import { countLabel, exclusionReasonLabel, fittedPointNoun, sexLabel } from './workspace-labels'
import { useAppStore } from './state/store'
import { mixedModelFitConfigHash, mixedModelMeanLinePoints } from '../core/mixedModel/resultIdentity'
import type { MixedModelSpikeRow } from '../core/mixedModel/types'
import { groupPatients, UNGROUPED } from '../core/grouping/grouping'
import { workspaceModelSpec } from './workspace-data'
import { modelPreparationKey } from './workspace-analysis'
import { currentWorkspaceModels, workspaceGroupableAttributes, workspaceModelEntities } from './workspace-model-results'
import { overlayModules } from '../core/analysis/registry'
import { ANCHOR_WINDOW_REASON, anchorRuleLabel } from '../core/cohort/anchorComparison'
import { egfrFormulaSwitches, type EgfrFormulaSwitch } from '../core/domains/nephrology/egfr/series'
import { computedEgfrKey } from './egfr-gaps'
import { FORMULA_SWITCH_REASON, formulaSwitchText } from './egfr-switch'
import { seriesMerges } from '../core/domains/nephrology/seriesMergeModule'

/** Colour of the line that marks a change of the eGFR equation (issue #66). */
const FORMULA_SWITCH_COLOR = '#6941c6'

/** `baseline` and `baselineDays` are the same elapsed-time axis in years or in
 * days. `event` counts years from the anchor event of the column's
 * before/after comparison (K16). */
export type WorkspaceAxis = 'baseline' | 'baselineDays' | 'calendar' | 'age' | 'event'
/** Modules whose overlays the charts can draw, with their presentation. */
export const OVERLAY_MODULES = overlayModules().map(module => ({ id: module.id, presentation: module.overlayPresentation! }))
/** Display toggles: measurement marks, events, and one per overlay module,
 * keyed by module id (e.g. `aki`). */
export interface WorkspaceDisplay { points: boolean; connect: boolean; events: boolean; [overlayModuleId: string]: boolean }
/** With more trajectories than this, unemphasised ones are drawn lighter. */
const DENSE_OVERLAY = 8
/** From this many trajectories the overlay hides measurement points unless the
 * "Measurement points" switch was used, and draws the lines paler. */
export const DENSE_OVERLAY_POINTS_OFF = 51
/** From this many trajectories the lines are paler still and thinner. */
export const DENSE_OVERLAY_THIN = 201
const DAYS_PER_YEAR = 365.25
export const EVENT_COLOR = '#936221'
const NO_EVENTS: readonly ClinicalEvent[] = []
/** Plot area in viewBox units. */
const PLOT = { left: 65, right: 630, top: 30, bottom: 240 }
/** Marks may reach this far past the left and right border, so a point, a
 * diamond or an active point on the first or last date is drawn whole. */
const MARK_OVERHANG = 7
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

/** `yMin` and `yMax` are log10 of the values on a logarithmic axis (`log`). */
interface PlotScale { xMin: number; xMax: number; yMin: number; yMax: number; log: boolean }
const scaleX = (scale: PlotScale, n: number) => PLOT.left + (n - scale.xMin) / (scale.xMax - scale.xMin) * (PLOT.right - PLOT.left)
const scaleY = (scale: PlotScale, n: number) => PLOT.bottom - ((scale.log ? Math.log10(n) : n) - scale.yMin) / (scale.yMax - scale.yMin) * (PLOT.bottom - PLOT.top)
/** How the bounds of a chart enter its fit (issue #73), by the column's setting. */
function boundedFitText(policy: CohortRow['cells'][number]['boundedValues'] | undefined): string {
  if (policy === 'exclude') return 'They are excluded from fits and endpoints.'
  return `They enter the trend ${policy === 'half-limit' ? 'with <x at half its limit and >x at its limit' : 'at their limit'} and are excluded from endpoints.`
}

/** The fit lines a chart draws for a cell: on a logarithmic axis those of the
 * fit on log values (issue #70), straight on that axis. */
export const drawnFitLines = (cell: CohortRow['cells'][number] | undefined, log: boolean) => (log ? cell?.logTrend?.fitLines : cell?.fitLines) ?? []
/** Markers without a measurement of the series sit here, on the time axis. */
const MARKER_AXIS_Y = 244
const OVERLAY_COLORS: Record<string, string | undefined> = Object.fromEntries(OVERLAY_MODULES.map(module => [module.id, module.presentation.color]))

/** `source` and `sourceIndex`: on a merged series (issue #68), the imported
 * series the value comes from and its position among the merge's sources
 * (its marker shape); null and 0 otherwise. `labMethod`: the laboratory or
 * method column of the value. */
interface PlotSeriesPoint { date: Date; value: number; x: number; exclusions: string[]; operator: WertOperator; akiSkipped: boolean; source: string | null; sourceIndex: number; labMethod: string | null }

/** Marker shapes by position: circle, square, triangle, diamond, then again.
 * Merged series mark each source with its own shape (issue #68); the series
 * comparison of the patient view marks each series with one. */
export const MARK_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const
export type MarkShape = (typeof MARK_SHAPES)[number]
export const markShape = (index: number): MarkShape => MARK_SHAPES[index % MARK_SHAPES.length]
/** The SVG path of a marker of radius `r` at (cx, cy); a circle is drawn with `<circle>` instead. */
export function markPath(shape: Exclude<MarkShape, 'circle'>, cx: number, cy: number, r: number): string {
  if (shape === 'square') return `M ${cx - r} ${cy - r} h ${2 * r} v ${2 * r} h ${-2 * r} Z`
  if (shape === 'triangle') return `M ${cx} ${cy - r * 1.2} L ${cx + r * 1.1} ${cy + r * 0.8} L ${cx - r * 1.1} ${cy + r * 0.8} Z`
  return `M ${cx} ${cy - r * 1.3} L ${cx + r * 1.3} ${cy} L ${cx} ${cy + r * 1.3} L ${cx - r * 1.3} ${cy} Z`
}
/** Legend symbol of a shape, as text. */
export const MARK_SYMBOLS: Record<MarkShape, string> = { circle: '●', square: '■', triangle: '▲', diamond: '◆' }
interface PlotSeriesData {
  row: CohortRow; cell: CohortRow['cells'][number]; group: string; points: PlotSeriesPoint[]
  markers: { moduleId: string; x: number; value: number | null; label: string; title: string }[]
  events: readonly ClinicalEvent[]; xValue: (date: Date) => number | null
}

/** One trajectory: line, points, fit lines, markers and the patient's events.
 * Memoised, so that emphasising another trajectory does not rebuild this one;
 * every prop is a primitive or keeps its identity between such renders. */
const PlotSeries = memo(function PlotSeries({ series, domId, clipId, scale, color, groupText, active, detail, opacity, lineWidth, parameter, display, showFit, slopeDecimals, onOpen, onHover, onFocus }: {
  series: PlotSeriesData; domId: string; clipId: string; scale: PlotScale; color: string; groupText: string
  /** Emphasised by highlight, focus or pointer. */
  active: boolean
  /** Event intervals are drawn for this trajectory (single patient, or the highlighted one). */
  detail: boolean
  opacity: number; lineWidth: number; parameter: WorkspaceParameter; display: WorkspaceDisplay; showFit: boolean
  /** Decimals of the column's slopes (`slopeDisplayDecimals`), for the window tooltips. */
  slopeDecimals: number
  onOpen: (id: PatientId) => void; onHover: (id: PatientId | null) => void; onFocus: (id: PatientId | null) => void
}) {
  const x = (n: number) => scaleX(scale, n)
  const y = (n: number) => scaleY(scale, n)
  const patientId = series.row.patientId
  const logTrend = scale.log ? series.cell.logTrend : undefined
  // On a log axis the line is the fit on log values, with that fit's own counts.
  const uncertainFit = Boolean(showFit && (logTrend
    ? slopeQualityLabel({ ...logTrend, fitModel: series.cell.fitModel })?.caveat && Number.isFinite(logTrend.slope)
    : slopeQualityLabel(series.cell)?.caveat && Number.isFinite(series.cell.slope)))
  const unit = series.cell.einheit ?? ''
  const windowTitle = (lineIndex: number) => {
    const window = series.cell.rolling?.windows.find(candidate => candidate.lineIndex === lineIndex)
    return window ? `Rolling OLS window ${formatWorkspaceDate(window.start)} to ${formatWorkspaceDate(window.end)}: ${countLabel(window.n, fittedPointNoun(series.cell.rolling!.timeBalancing))} (${formatWorkspaceDate(window.firstDate)} to ${formatWorkspaceDate(window.lastDate)}), slope ${formatFixedDecimals(window.slope, slopeDecimals)} ${unit}/year` : null
  }
  const eventPositions = display.events ? series.events.flatMap(event => { const position = series.xValue(event.date); return position === null ? [] : [{ event, position, end: event.endDate ? series.xValue(event.endDate) : null }] }) : []
  return <g id={domId} clipPath={`url(#${clipId})`} opacity={active || opacity === 1 ? undefined : opacity} data-active={active || undefined}>
    {detail && eventPositions.map(({ event, position, end }, i) => end === null ? null : <rect key={i} data-testid="event-band" x={Math.min(x(position), x(end))} width={Math.max(1, Math.abs(x(end) - x(position)))} y={PLOT.top} height={PLOT.bottom - PLOT.top} fill={EVENT_COLOR} fillOpacity={.12}><title>Patient {event.patientId}: {event.title}, {formatWorkspaceDate(event.date)} to {formatWorkspaceDate(event.endDate!)}</title></rect>)}
    <g role="button" tabIndex={0} aria-label={`Open patient ${patientId}, ${parameter.label}`} aria-description={uncertainFit ? "Uncertain slope: limited fitted measurements or follow-up. Dotted fit line." : undefined} onClick={() => onOpen(patientId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(patientId) } }} className="wt-chart-person"
      onMouseEnter={() => onHover(patientId)} onMouseLeave={() => onHover(null)} onFocus={() => onFocus(patientId)} onBlur={() => onFocus(null)}>
      <title>Patient {patientId}, {groupText}</title>
      {display.connect && <polyline points={series.points.map(p => `${x(p.x)},${y(p.value)}`).join(' ')} fill="none" stroke={color} strokeWidth={active ? 3 : lineWidth} />}
      {series.points.filter(p => display.points || display.connect && (series.points.length === 1 || boundedPrefix(p.operator) || p.exclusions.length > 0)).map((p, i) => {
        const excluded = p.exclusions.length > 0
        // A point in the anchor's exclusion window still enters the column's slope, so it is not called excluded from the fit.
        const fitReasons = p.exclusions.filter(reason => reason !== ANCHOR_WINDOW_REASON)
        const pointTitle = `${formatWorkspaceDate(p.date)}: ${boundedPrefix(p.operator)}${formatWorkspaceNumber(p.value)} ${parameter.einheit ?? ''}${p.source ? `, from ${p.source}` : ''}${p.labMethod ? `, laboratory or method: ${p.labMethod}` : ''}${fitReasons.length ? `, excluded from the fit (${fitReasons.map(exclusionReasonLabel).join('; ')})` : ''}${p.exclusions.includes(ANCHOR_WINDOW_REASON) ? `, ${exclusionReasonLabel(ANCHOR_WINDOW_REASON)}` : ''}${p.akiSkipped ? `, ${NOT_USED_FOR_AKI_DETECTION}` : ''}`
        return <g key={i}>{excluded
          ? <circle data-testid="excluded-point" data-exclusion={p.exclusions.join(' ')} cx={x(p.x)} cy={y(p.value)} r={active ? 4.5 : 3.5} fill="white" stroke={EXCLUDED_COLOR} strokeWidth={1.6} strokeDasharray="2 1.5"><title>{pointTitle}</title></circle>
          : p.sourceIndex > 0
            ? <path data-aki-skipped={p.akiSkipped || undefined} data-source-shape={markShape(p.sourceIndex)} d={markPath(markShape(p.sourceIndex) as Exclude<MarkShape, 'circle'>, x(p.x), y(p.value), active ? 4 : 3)} fill={boundedPrefix(p.operator) ? 'white' : color} stroke={color}><title>{pointTitle}</title></path>
            : <circle data-aki-skipped={p.akiSkipped || undefined} cx={x(p.x)} cy={y(p.value)} r={active ? 4 : 3} fill={boundedPrefix(p.operator) ? 'white' : color} stroke={color}><title>{pointTitle}</title></circle>}
          {boundedPrefix(p.operator) && <text x={x(p.x) + 5} y={y(p.value) - 5} fill={excluded ? EXCLUDED_COLOR : color}>{p.operator}</text>}</g>
      })}
      {showFit && drawnFitLines(series.cell, scale.log).map((line, i) => { const title = scale.log ? null : windowTitle(i); return <polyline key={i} points={line.flatMap(p => { const position = series.xValue(p.date); return position === null || !Number.isFinite(p.value) ? [] : [`${x(position)},${y(p.value)}`] }).join(' ')} fill="none" stroke={color} data-fit-quality={uncertainFit ? "uncertain" : "supported"} strokeDasharray={uncertainFit ? "2 4" : "6 4"} strokeWidth="2">{title && <title>{title}</title>}</polyline> })}
      {/* The separate segment after kidney replacement therapy (2026-11-22): its own line, dash-dot, linear axis only, for one patient or the highlighted one. */}
      {showFit && detail && !scale.log && series.cell.krtSegment?.line && <polyline data-testid="krt-segment-line" points={series.cell.krtSegment.line.flatMap(p => { const position = series.xValue(p.date); return position === null || !Number.isFinite(p.value) ? [] : [`${x(position)},${y(p.value)}`] }).join(' ')} fill="none" stroke={color} strokeDasharray="8 3 2 3" strokeWidth="1.5"><title>Separate segment after {series.cell.krtSegment.event.type === 'kidney_transplant' ? 'kidney transplant' : 'chronic dialysis start'}: {formatFixedDecimals(series.cell.krtSegment.fit.slope, slopeDecimals)} {unit}/year; not part of the slope</title></polyline>}
      {series.markers.filter(marker => display[marker.moduleId] ?? false).map((marker, i) => {
        // Off-series markers sit on the time axis, not on a value.
        const markerY = marker.value === null ? MARKER_AXIS_Y : y(marker.value)
        const markerColor = OVERLAY_COLORS[marker.moduleId]
        return <g key={`${marker.moduleId}-${i}`} data-testid={`${marker.moduleId}-marker`} data-on-measurement={marker.value !== null}><path d={`M ${x(marker.x)} ${markerY - 6} l 5 6 l -5 6 l -5 -6 Z`} fill={marker.value === null ? 'white' : markerColor} stroke={markerColor} strokeWidth={1.2}><title>{marker.title}</title></path></g>
      })}
    </g>
    {eventPositions.map(({ event, position }, i) => <line key={i} x1={x(position)} x2={x(position)} y1={PLOT.top} y2={PLOT.bottom} stroke={EVENT_COLOR} strokeDasharray="2 5"><title>Patient {event.patientId}: {event.title}, {formatWorkspaceDate(event.date)}{event.endDate ? ` to ${formatWorkspaceDate(event.endDate)}` : ''}</title></line>)}
  </g>
})

export function WorkspacePlot({ data, parameter, parameterIndex, cohortRows, axis, groupBy, highlight, display: displayChoice, showFit, onOpen, sharedDomain, scaleMode, pointsAuto = false, onPointsAutoHidden, slopeDecimals = MIN_SLOPE_DECIMALS, logScale = false }: {
  data: WorkspaceData; parameter: WorkspaceParameter; parameterIndex: number; cohortRows: CohortRow[];
  axis: WorkspaceAxis; groupBy: string; highlight: PatientId | null; display: WorkspaceDisplay; showFit: boolean;
  onOpen: (id: PatientId) => void;
  sharedDomain: SparkDomain; scaleMode: 'shared' | 'zoom';
  /** The overlay may hide the measurement points of a dense chart: the user has
   * not switched "Measurement points" and the connecting lines are drawn. */
  pointsAuto?: boolean
  /** Told whether this chart hides its points by the density rule. */
  onPointsAutoHidden?: (parameterKey: string, hidden: boolean) => void
  /** Decimals the Trajectories table writes this column's slopes with; the
   * Rolling OLS window tooltips use the same. */
  slopeDecimals?: number
  /** Logarithmic value axis (issue #70): values of zero or less are not drawn,
   * and the fit lines are those of the fit on log values. `sharedDomain` is
   * then the positive range of the column. */
  logScale?: boolean
}) {
  const svg = useRef<SVGSVGElement>(null)
  const clip = useId().replace(/:/g, '')
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([])
  const [hovered, setHovered] = useState<PatientId | null>(null)
  const [focused, setFocused] = useState<PatientId | null>(null)
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
    // A merged series marks each source series with its own shape (issue #68).
    const mergeSources = seriesMerges(data.analysisSettings).find(merge => merge.name === parameter.bezeichnung && merge.unit === parameter.einheit)?.sources ?? []
    const sourceIndex = (row: LabRow | undefined) => row?.mergedFrom ? Math.max(0, mergeSources.findIndex(source => source.bezeichnung === row.mergedFrom!.bezeichnung && (source.einheit ?? null) === (row.mergedFrom!.einheit ?? null))) : 0
    // Changes of the eGFR equation, drawn on the computed eGFR only (issue #66).
    const switches: Map<string, EgfrFormulaSwitch[]> = parameter.key === computedEgfrKey(data) ? egfrFormulaSwitches(data.rows) : new Map()
    const eventsByPatient = new Map<string, ClinicalEvent[]>()
    for (const event of data.events) {
      const bucket = eventsByPatient.get(patientIdKey(event.patientId))
      if (bucket) bucket.push(event); else eventsByPatient.set(patientIdKey(event.patientId), [event])
    }
    return cohortRows.map(row => {
      const events = eventsByPatient.get(patientIdKey(row.patientId)) ?? NO_EVENTS
      const cell = row.cells[parameterIndex]
      const patient = patients.get(row.patientId)
      const baseline = cell?.points[0]?.date.getTime()
      const age = patient?.baselineAge ?? null
      const ageDate = firstDates.get(row.patientId)
      const anchor = patient?.birthAnchor
      // Years since event: zero at the anchor of the column's before/after comparison.
      const eventAnchor = cell?.anchorComparison?.anchor?.date.getTime()
      const xValue = (date: Date): number | null => axis === 'calendar' ? date.getTime() : axis === 'event'
        ? eventAnchor === undefined ? null : (date.getTime() - eventAnchor) / YEAR
        : axis === 'baseline' || axis === 'baselineDays'
        ? baseline === undefined ? null : (date.getTime() - baseline) / (axis === 'baseline' ? YEAR : MS_PER_DAY)
        : anchor !== undefined ? anchor === null ? null : (date.getTime() - anchor.getTime()) / YEAR
          : age === null || ageDate === undefined ? null : age + (date.getTime() - ageDate) / YEAR
      const group = groupBy ? patient?.attributes[groupBy] || 'Not recorded' : 'All patients'
      const pointSource = (source: LabRow | undefined) => ({
        source: source?.mergedFrom ? `${source.mergedFrom.bezeichnung} [${source.mergedFrom.einheit ?? 'no unit'}]` : null,
        sourceIndex: sourceIndex(source), labMethod: source?.labMethod ?? null,
      })
      const points = (cell?.points ?? []).flatMap((point, index) => {
        const x = xValue(point.date)
        const exclusions: string[] = [...(cell?.pointExclusionReasons?.[index] ?? []).filter(reason => cell?.fitModel !== 'none' || reason === 'censored-value'),
          ...(cell?.anchorComparison?.windowIdx.includes(index) ? [ANCHOR_WINDOW_REASON] : [])]
        return x === null || !Number.isFinite(x) || !Number.isFinite(point.value) || (logScale && point.value <= 0) ? [] : [{ ...point, x, exclusions, operator: sourceRows.get(row.patientId)?.[index]?.wertOperator ?? '=' as WertOperator, akiSkipped: skippedByAkiDetection(parameter, point.date, events),
          ...pointSource(sourceRows.get(row.patientId)?.[index]) }]
      })
      // Module markers (e.g. AKI episodes, which reach every column of the
      // patient) sit on this series' nearest measurement only if one lies within
      // the marker's snapping distance; otherwise a value-free tick marks the
      // date on the time axis, so a marker never borrows an unrelated value.
      const markers = (cell?.overlays ?? []).flatMap(marker => {
        if (marker.kind !== 'marker') return []
        const target = marker.date.getTime()
        const nearestByDate = points.length ? points.reduce((best, p) => Math.abs(p.date.getTime() - target) < Math.abs(best.date.getTime() - target) ? p : best, points[0]) : null
        // Several measurements on that date: the one the marker stands for, when it names a value.
        const markerValue = marker.value
        const nearest = nearestByDate === null || markerValue === undefined ? nearestByDate
          : points.filter(p => p.date.getTime() === nearestByDate.date.getTime()).reduce((best, p) => Math.abs(p.value - markerValue) < Math.abs(best.value - markerValue) ? p : best, nearestByDate)
        const onPoint = nearest !== null && Math.abs(nearest.date.getTime() - target) <= marker.snapWithinDays * MS_PER_DAY
        const x = onPoint ? nearest.x : xValue(marker.date)
        if (x === null || !Number.isFinite(x)) return []
        return [{ moduleId: marker.moduleId, x, value: onPoint ? nearest.value : null, label: marker.label, title: `${marker.title}${onPoint ? '' : marker.offMeasurementNote}` }]
      })
      const bands = (cell?.overlays ?? []).flatMap(band => {
        if (band.kind !== 'band') return []
        const start = xValue(band.start), end = xValue(band.end)
        return start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end) ? [] : [{ moduleId: band.moduleId, start, end, title: band.title, legend: band.legend, note: band.note }]
      })
      const formulaSwitches = (switches.get(patientIdKey(row.patientId)) ?? []).flatMap(change => {
        const position = xValue(change.date)
        return position === null || !Number.isFinite(position) ? [] : [{ x: position, title: `Patient ${row.patientId}: eGFR equation ${formulaSwitchText(change)}` }]
      })
      return { row, cell, group, points, markers, bands, events, xValue, formulaSwitches, ageEstimated: patient?.ageEstimated ?? anchor === undefined, mergeSources }
    })
  }, [data.rows, data.patients, data.events, data.analysisSettings, cohortRows, parameter, parameterIndex, axis, groupBy, logScale])
  const groups = [...new Set(prepared.map(p => p.group))].sort()
  const fullGroups = [...new Set(data.patients.map(patient => groupBy ? patient.attributes[groupBy] || 'Not recorded' : 'All patients'))].sort()
  const groupColor = (group: string) => colors[fullGroups.indexOf(group) % colors.length]
  const groupLabel = (group: string) => groupBy === 'sex' ? sexLabel(group) : group
  const visible = prepared.filter(p => !hiddenGroups.includes(p.group) && p.points.length > 0)
  // Points are hidden by the density rule per chart, from the trajectories
  // plotted in it: the same count that decides the line density below.
  const pointsAutoHidden = pointsAuto && displayChoice.points && displayChoice.connect && visible.length >= DENSE_OVERLAY_POINTS_OFF
  const display = useMemo(() => pointsAutoHidden ? { ...displayChoice, points: false } : displayChoice, [displayChoice, pointsAutoHidden])
  useEffect(() => {
    if (!onPointsAutoHidden || !pointsAutoHidden) return
    onPointsAutoHidden(parameter.key, true)
    return () => onPointsAutoHidden(parameter.key, false)
  }, [onPointsAutoHidden, parameter.key, pointsAutoHidden])
  // Rolling OLS draws window lines only; a series without a window has a
  // global slope but nothing drawn, so it counts as without a fit line here.
  const hasFitLine = (cell: (typeof visible)[number]['cell']) => logScale
    ? Number.isFinite(cell.logTrend?.slope) && drawnFitLines(cell, true).length > 0
    : Number.isFinite(cell.slope) && (cell.mode !== 'rolling' || cell.fitLines.length > 0)
  const uncertain = visible.filter(p => (logScale && p.cell.logTrend ? slopeQualityLabel({ ...p.cell.logTrend, fitModel: p.cell.fitModel }) : slopeQualityLabel(p.cell))?.caveat && hasFitLine(p.cell)).length
  const noFit = visible.filter(p => !hasFitLine(p.cell)).length
  // Slope tiers of the plotted fits (2026-11-22); the uncertain count above keeps the dotted lines.
  const tierCounts = { reliable: 0, estimable: 0 }
  for (const p of visible) { const tier = cellSlopeTier(p.cell); if (tier === 'reliable' || tier === 'estimable') tierCounts[tier] += 1 }
  const fitModel = prepared[0]?.cell?.fitModel ?? 'none'
  const modelLabel = { ols: 'OLS', 'theil-sen': 'Theil–Sen', 'rolling-ols': 'Rolling OLS', 'segmented-ols': 'Segmented OLS', none: 'No fit' }[fitModel]
  const withoutValues = prepared.filter(p => !p.cell?.points.length).length
  const withoutAge = prepared.filter(p => p.cell?.points.length && !p.points.length).length
  const cohortModelResults = useAppStore(s => s.cohortModelResults)
  const showCohortMixedModelLine = useAppStore(s => s.showCohortMixedModelLine)
  const mixedModelConfig = useAppStore(s => s.mixedModelConfig)
  const presetExclusionPolicy = useAppStore(s => s.presetExclusionPolicy)
  const preparationKey = useAppStore(s => modelPreparationKey(s.trajectoryFitSettings, parameter.key))

  // Cohort mixed-model reference lines: the pooled fit and, when the overlay is
  // grouped by the attribute the groups were fitted under, one line per group.
  // A line is drawn only for a result whose source identity matches the full
  // dataset preparation; display filters never change the model population.
  const modelLines = useMemo(() => {
    // Not on the event axis either: the model counts time from the first measurement.
    // Nor on a log axis: the model is linear in the values.
    if (!showCohortMixedModelLine || !cohortModelResults || axis === 'calendar' || axis === 'event' || logScale) return []
    const spec = workspaceModelSpec(data, parameter.key, useAppStore.getState().trajectoryFitSettings)
    if (!spec) return []
    const patientIds = data.patients.map(p => p.id)
    const groups = groupBy ? groupPatients(patientIds, workspaceGroupableAttributes(data.rows, data.patientAttributes), groupBy) : []
    const entities = workspaceModelEntities(data.rows, patientIds, spec, mixedModelConfig, data.patientAttributes, groups, presetExclusionPolicy)
    const current = currentWorkspaceModels(cohortModelResults, entities,
      data.parameters.findIndex(p => p.key === parameter.key), parameter.key,
      mixedModelFitConfigHash(spec, mixedModelConfig, presetExclusionPolicy))
    return entities.flatMap(item => {
      const key = item.entity.kind === 'cohort' ? 'cohort' : `group:${item.entity.value}`
      const stored = current[key]
      if (!stored || stored.result.status !== 'success') return []
      const baselineAge = meanBaselineAge(item.rows)
      if (axis === 'age' && baselineAge === null) return []
      const points = mixedModelMeanLinePoints(stored.result, item.rows, {
        baselineAgeCentered: 0,
        ageAxisBaselineAge: axis === 'age' ? baselineAge : null,
      }).filter(pt => Number.isFinite(pt.time_since_baseline) && Number.isFinite(pt.value) && (axis !== 'age' || pt.age !== undefined))
      if (points.length < 2) return []
      // Overlay groups label missing values 'Not recorded'; the model uses UNGROUPED.
      const group = item.entity.kind === 'group' ? (item.entity.value === UNGROUPED ? 'Not recorded' : item.entity.value) : null
      return [{ key, group, points }]
    })
  }, [showCohortMixedModelLine, cohortModelResults, data, parameter.key, axis, mixedModelConfig, presetExclusionPolicy, preparationKey, groupBy, logScale])
  // Group lines follow the overlay: only groups currently plotted (after the
  // group filter) and not hidden in the legend.
  const visibleModelLines = modelLines.filter(line => line.group === null || groups.includes(line.group) && fullGroups.includes(line.group) && !hiddenGroups.includes(line.group))
  const pooledModelLine = visibleModelLines.find(line => line.group === null)
  const groupModelLines = visibleModelLines.filter(line => line.group !== null)

  // Model time is in years; the days axis shows the same line in days.
  const modelX = (point: { time_since_baseline: number; age?: number }) => axis === 'age' && point.age !== undefined ? point.age : axis === 'baselineDays' ? point.time_since_baseline * DAYS_PER_YEAR : point.time_since_baseline
  // Windows, event intervals and labels for one trajectory at a time keep the overlay readable.
  const overlayDetail = (patientId: PatientId) => cohortRows.length === 1 || patientId === highlight

  // The value range is in log10 units on a logarithmic axis.
  const yUnit = (value: number) => logScale ? Math.log10(value) : value
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
  for (const series of visible) {
    for (const p of series.points) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, yUnit(p.value)); yMax = Math.max(yMax, yUnit(p.value)) }
    if (showFit) for (const line of drawnFitLines(series.cell, logScale)) for (const p of line) {
      if (Number.isFinite(yUnit(p.value))) { yMin = Math.min(yMin, yUnit(p.value)); yMax = Math.max(yMax, yUnit(p.value)) }
    }
    if (display.events) for (const event of series.events) {
      // The end of a dated interval is part of the range where the interval is drawn.
      for (const date of event.endDate && overlayDetail(series.row.patientId) ? [event.date, event.endDate] : [event.date]) {
        const x = series.xValue(date)
        if (x !== null && Number.isFinite(x)) { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x) }
      }
    }
  }
  for (const point of visibleModelLines.flatMap(line => line.points)) {
    const position = axis === 'age' ? point.age : modelX(point)
    if (position !== undefined) { xMin = Math.min(xMin, position); xMax = Math.max(xMax, position) }
    if (scaleMode === 'zoom') { yMin = Math.min(yMin, point.value); yMax = Math.max(yMax, point.value) }
  }
  if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1 }
  if (xMin === xMax) { const pad = axis === 'calendar' ? MS_PER_DAY : axis === 'baselineDays' ? 1 : .5; xMin -= pad; xMax += pad }
  if (scaleMode === 'shared') { yMin = yUnit(sharedDomain.min); yMax = yUnit(sharedDomain.max) }
  else {
    const yPad = (yMax - yMin || Math.abs(yMax) || 1) * .08
    yMin -= yPad; yMax += yPad
  }
  const scaleLabel = `${scaleMode === 'shared' ? 'Shared parameter scale' : 'Zoom to visible values'}${logScale ? ', logarithmic' : ''}`
  const visibleIds = new Set(visible.map(series => series.row.patientId))
  const visibleEvents = data.events.filter(event => visibleIds.has(event.patientId))
  // Compared with the events of the patients this plot is given (one patient in the
  // detail view, the filtered rows in the overlay), not with every loaded event.
  const rowIds = new Set(cohortRows.map(row => row.patientId))
  const rowEventCount = data.events.filter(event => rowIds.has(event.patientId)).length
  // One object per axis range: the memoised trajectories compare it by identity.
  const scale = useMemo<PlotScale>(() => ({ xMin, xMax, yMin, yMax, log: logScale }), [xMin, xMax, yMin, yMax, logScale])
  const x = (n: number) => scaleX(scale, n)
  const y = (n: number) => scaleY(scale, n)
  // Tick values are values of the parameter on both axes; y() places them.
  const yTicks = logScale ? logTicks(10 ** yMin, 10 ** yMax) : niceTicks(yMin, yMax, 4)
  const yTickLabels = logScale ? logTickLabels(yTicks) : tickLabels(yTicks)
  // Measurements a log axis cannot show, and the fit on log values leaves out.
  const nonPositive = logScale ? prepared.filter(p => !hiddenGroups.includes(p.group)).reduce((sum, p) => sum + (p.cell?.points.filter(point => point.value <= 0).length ?? 0), 0) : 0
  // Calendar: evenly spaced dates, or one tick per day on a range of a few days,
  // so no date is repeated. Days: whole days only.
  const xTicks = axis === 'calendar' ? calendarTicks(xMin, xMax) : niceTicks(xMin, xMax, 5, axis === 'baselineDays' ? 1 : 0)
  const xTickLabels = tickLabels(xTicks)
  // The event axis names its anchor rule, so an exported chart explains itself.
  const anchorRule = cohortRows.map(row => row.cells[parameterIndex]?.anchorComparison?.settings.rule).find(rule => rule !== undefined)
  const axisLabel = axis === 'calendar' ? 'Calendar date' : axis === 'age' ? 'Age (years)'
    : axis === 'event' ? `Years since anchor event (${anchorRule ? anchorRuleLabel(anchorRule) : 'no anchor set for this parameter'})`
    : `${axis === 'baselineDays' ? 'Days' : 'Years'} since first measurement of this parameter`
  // In the overlay the trajectory under the pointer or the keyboard focus is
  // emphasised and named, so a line can be identified without the selector.
  // The explicit highlight wins when it is plotted here, then focus, then the pointer.
  const emphasised = visible.some(p => p.row.patientId === highlight) ? highlight : cohortRows.length > 1 ? focused ?? hovered : null
  const emphasisedIndex = visible.findIndex(p => p.row.patientId === emphasised)
  const hasHighlight = emphasisedIndex >= 0
  // Density of the overlay (owner decision 2026-11-21): paler lines from 51
  // plotted trajectories, paler and thinner from 201. Display only.
  const density = visible.length >= DENSE_OVERLAY_THIN ? 3 : visible.length >= DENSE_OVERLAY_POINTS_OFF ? 2 : visible.length > DENSE_OVERLAY ? 1 : 0
  const restOpacity = [1, .6, .4, .25][density]
  const lineWidth = density === 3 ? .8 : 1.5
  const exportTitle = cohortRows.length === 1 ? `Patient ${cohortRows[0].patientId}: ${parameter.label}` : parameter.label
  const markVisible = display.points || display.connect
  // Grey open circles of two kinds: measurements excluded from the fit, and
  // measurements only in the exclusion window after the anchor, which still
  // enter the column's slope and leave the after-anchor slope only.
  const fitExcluded = (p: { exclusions: string[] }) => p.exclusions.some(reason => reason !== ANCHOR_WINDOW_REASON)
  const excludedCount = markVisible ? visible.reduce((sum, series) => sum + series.points.filter(fitExcluded).length, 0) : 0
  const windowCount = markVisible ? visible.reduce((sum, series) => sum + series.points.filter(p => !fitExcluded(p) && p.exclusions.includes(ANCHOR_WINDOW_REASON)).length, 0) : 0
  const excludedReasons = [...new Set(visible.flatMap(series => series.points.flatMap(p => p.exclusions.filter(reason => reason !== ANCHOR_WINDOW_REASON))))]
  const windowText = `${countLabel(windowCount, 'measurement')} in the exclusion window after the anchor event`
  const akiSkippedCount = visible.reduce((sum, series) => sum + series.points.filter(p => p.akiSkipped).length, 0)
  const shownOverlays = OVERLAY_MODULES.filter(module => display[module.id])
  const markerCount = (moduleId: string) => visible.reduce((sum, series) => sum + series.markers.filter(marker => marker.moduleId === moduleId).length, 0)
  const detailSeries = visible.filter(series => overlayDetail(series.row.patientId))
  // The separate segment after KRT is drawn where event bands are: one patient, or the highlighted one.
  const segmentLines = detailSeries.filter(series => series.cell.krtSegment?.line).length
  // What the drawn bands of a module mean in their columns; the module's general text when none is drawn.
  const bandLegends = (module: (typeof OVERLAY_MODULES)[number]) => {
    const legends = [...new Set(detailSeries.flatMap(series => series.bands.filter(band => band.moduleId === module.id).map(band => band.legend ?? module.presentation.bandLegend)))]
    return legends.length ? legends.join(';') : module.presentation.bandLegend
  }
  const bandNotes = (module: (typeof OVERLAY_MODULES)[number]) => [...new Set(detailSeries.flatMap(series => series.bands.filter(band => band.moduleId === module.id && band.note).map(band => band.note!)))]
  // Stage labels are placed together, outside the clipped trajectories: equal
  // neighbours share a label, others move apart, and none is cut at the border.
  const markerLabels = layoutMarkerLabels(detailSeries.flatMap(series => series.markers.filter(marker => display[marker.moduleId]).map(marker => ({
    x: x(marker.x), y: (marker.value === null ? MARKER_AXIS_Y : y(marker.value)) - 10, label: marker.label, color: OVERLAY_COLORS[marker.moduleId],
  }))), { left: PLOT.left, right: PLOT.right, top: 10 }, display.points ? detailSeries.flatMap(series => series.points.map(point => ({ x: x(point.x), y: y(point.value) }))) : [])
  const formulaSwitchCount = detailSeries.reduce((sum, series) => sum + series.formulaSwitches.length, 0)
  const intervalEvents = display.events ? detailSeries.flatMap(series => series.events.filter(event => event.endDate !== null)).length : 0
  const rollingLines = visible.some(series => series.cell.mode === 'rolling')
  const mergedSources = prepared[0]?.mergeSources ?? []

  return <section className="wt-plot-card" aria-label={`Chart ${parameter.label}`}>
    <div className="wt-card-heading"><h3>{parameter.label}</h3><ChartExportActions getSvg={() => svg.current} title={exportTitle} /></div>
    {groupBy && <div className="wt-legend" role="group" aria-label={`Groups for ${parameter.label}`}>{groups.map(group => <button key={group} aria-pressed={!hiddenGroups.includes(group)} onClick={() => setHiddenGroups(previous => previous.includes(group) ? previous.filter(g => g !== group) : [...previous, group])}><span style={{ color: groupColor(group) }}>● </span>{groupLabel(group)}{hiddenGroups.includes(group) ? ' (hidden)' : ''}</button>)}</div>}
    <p className="wt-muted">{scaleLabel}{cohortRows.length > 1 ? `; ${visible.length} of ${cohortRows.length} trajectories` : ''}{withoutValues > 0 ? `; ${withoutValues} without numeric measurements` : ''}{withoutAge > 0 && axis !== 'event' ? `; ${withoutAge} additional trajectories without age data` : ''}{withoutAge > 0 && axis === 'event' && anchorRule ? `; ${countLabel(withoutAge, 'trajectory', 'trajectories')} without a matching anchor event (not drawn)` : ''}</p>
    {density >= 2 && <p className="wt-muted" data-testid="density-note">{`${visible.length} trajectories in this chart: lines are drawn ${density === 3 ? 'paler and thinner' : 'paler'}${pointsAutoHidden ? ' and measurement points are hidden' : ''}.`} Search, a group filter or a selection narrows the overlay{pointsAutoHidden ? '; Display → “Measurement points” shows the points' : ''}. Numbers and table exports are unchanged.</p>}
    {axis === 'age' && <p className="wt-muted">{cohortRows.length === 1 ? visible[0]?.ageEstimated ? 'Age: estimated birth-date anchor.' : visible.length ? 'Age: recorded birth date.' : 'Age unavailable.' : `${visible.filter(p => p.ageEstimated).length} estimated birth-date anchors; other ages use recorded birth dates.`}</p>}
    {axis === 'event' && !anchorRule && <p className="wt-muted" data-testid="event-axis-note">“Years since event” starts at the anchor event of the before/after comparison. Switch the comparison on in this parameter’s analysis settings (Calculation settings → Before/after comparison).</p>}
    {!visible.length ? <p>No trajectories can be plotted. Check measurements, {axis === 'event' ? 'anchor events' : 'ages'}, or visible groups.</p> : <svg ref={svg} viewBox="0 0 660 310" className="wt-plot" data-x-min={xMin} data-y-min={yMin} data-y-max={yMax} data-y-scale={logScale ? 'log' : 'linear'} data-density={density} role="group" aria-label={`${parameter.label}: ${visible.length} trajectories, ${axisLabel}`} data-export-legend={JSON.stringify(groupBy ? groups.filter(group => !hiddenGroups.includes(group)).map(group => ({ label: groupLabel(group), color: groupColor(group) })) : [])} data-export-context={`${scaleLabel}; ${axisLabel}; ${visible.length} visible trajectories${pointsAutoHidden ? '; measurement points hidden in this dense overlay' : ''}${groupBy ? `; Grouping: ${groupBy}; hidden: ${hiddenGroups.map(groupLabel).join(', ') || 'none'}` : ''}${axis === 'age' ? `; ${visible.filter(p => p.ageEstimated).length} estimated birth-date anchors` : ''}${showFit ? fitModel === 'none' ? '; Fit model disabled' : `; ${uncertain} uncertain individual ${modelLabel} fits; ${noFit} without a fit` : ''}${excludedCount ? `; ${countLabel(excludedCount, 'measurement')} excluded from the fit (grey open circles)` : ''}${windowCount ? `; ${windowText} (grey open circles; after-anchor slope only, still in the slope of the whole series)` : ''}${shownOverlays.map(module => `; ${module.presentation.exportContext(markerCount(module.id))}`).join('')}${pooledModelLine ? '; Cohort mixed model mean line' : ''}${groupModelLines.length ? `; Group mixed model mean lines: ${groupModelLines.map(line => groupLabel(line.group!)).join(', ')}` : ''}`}>
      <title>{parameter.label} by {axisLabel.charAt(0).toLowerCase()}{axisLabel.slice(1)}</title>
      <desc>Measurements for the selected patients. Press Enter or Space to open a trajectory. Research use only.</desc>
      <defs>
        <clipPath id={clip}><rect x={PLOT.left} y="20" width={PLOT.right - PLOT.left} height="230" /></clipPath>
        <clipPath id={`${clip}-marks`}><rect x={PLOT.left - MARK_OVERHANG} y="20" width={PLOT.right - PLOT.left + 2 * MARK_OVERHANG} height="230" /></clipPath>
      </defs>
      {/* Round tick values; the axis range is unchanged. */}
      {yTicks.map((v, i) => <g key={v}><line x1={PLOT.left} x2={PLOT.right} y1={y(v)} y2={y(v)} stroke="#dce5e9" /><text x="57" y={y(v) + 4} textAnchor="end">{yTickLabels[i]}</text></g>)}
      {/* Dates near the border are anchored inwards, so a long label stays inside the chart. */}
      {xTicks.map((v, i) => <text key={v} data-testid="x-tick" x={x(v)} y="265" textAnchor={axis !== 'calendar' ? 'middle' : x(v) < PLOT.left + 36 ? 'start' : x(v) > PLOT.right - 36 ? 'end' : 'middle'}>{axis === 'calendar' ? formatWorkspaceDate(new Date(v)) : xTickLabels[i]}</text>)}
      <text x="345" y="294" textAnchor="middle">{axisLabel}</text>
      {shownOverlays.map(module => <g key={module.id} clipPath={`url(#${clip})`} className={`wt-${module.id}-bands`}>{detailSeries.flatMap(series => series.bands.filter(band => band.moduleId === module.id).map((band, i) => <rect key={`${String(series.row.patientId)}-${i}`} data-testid={`${module.id}-band`} x={x(band.start)} width={Math.max(1, x(band.end) - x(band.start))} y="20" height="230" fill={module.presentation.color} fillOpacity={.1}><title>{band.title}</title></rect>))}</g>)}
      <g clipPath={`url(#${clip})`}>{detailSeries.flatMap(series => series.formulaSwitches.map((change, i) => <line key={`${String(series.row.patientId)}-switch-${i}`} data-testid="egfr-formula-switch" x1={x(change.x)} x2={x(change.x)} y1={PLOT.top} y2={PLOT.bottom} stroke={FORMULA_SWITCH_COLOR} strokeDasharray="1 3" strokeWidth={2}><title>{change.title}</title></line>))}</g>
      {/* Pointer and focus changes re-render only the two trajectories whose
          emphasis changes: the others are memoised and dimmed as one layer. */}
      <g className="wt-series-layer" opacity={hasHighlight ? density === 0 ? .25 : .4 : undefined}>
        {visible.map((series, index) => <PlotSeries key={String(series.row.patientId)} series={series} domId={`${clip}-t${index}`} clipId={`${clip}-marks`} scale={scale} color={groupColor(series.group)}
          groupText={groupLabel(series.group)} active={index === emphasisedIndex} detail={overlayDetail(series.row.patientId)} opacity={restOpacity} lineWidth={lineWidth}
          parameter={parameter} display={display} showFit={showFit} slopeDecimals={slopeDecimals} onOpen={onOpen} onHover={setHovered} onFocus={setFocused} />)}
      </g>
      {/* The emphasised trajectory again, on top of the others and undimmed. It
          takes no pointer events, so the pointer stays on the trajectory below. */}
      {hasHighlight && <use href={`#${clip}-t${emphasisedIndex}`} className="wt-emphasis-layer" pointerEvents="none" aria-hidden="true" />}
      <g className="wt-marker-labels" pointerEvents="none">{markerLabels.map((label, i) => <text key={i} data-testid="marker-label" x={label.anchor === 'middle' ? label.x : label.x + (label.anchor === 'start' ? -5 : 5)} y={label.y} textAnchor={label.anchor} fill={label.color} fontSize="10">{label.text}</text>)}</g>
      {cohortRows.length > 1 && hasHighlight && <text x="630" y="15" textAnchor="end" data-testid="emphasised-patient">Patient {emphasised}</text>}
      {groupModelLines.map(line => <g key={line.key} clipPath={`url(#${clip})`} className="wt-group-model-line" data-group={line.group!}>
        <polyline points={line.points.map(p => `${x(modelX(p))},${y(p.value)}`).join(' ')}
          fill="none" stroke={groupColor(line.group!)} strokeWidth={3.5} strokeDasharray="10 3 2 3" strokeLinecap="round">
          <title>Mixed-model mean trajectory, {groupLabel(line.group!)}</title>
        </polyline>
      </g>)}
      {pooledModelLine && (
        <g clipPath={`url(#${clip})`} className="wt-cohort-model-line">
          <polyline
            points={pooledModelLine.points.map(p => `${x(modelX(p))},${y(p.value)}`).join(' ')}
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
    {display.events && <details className="wt-event-inspector"><summary>Inspect events ({visibleEvents.length}{visibleEvents.length < rowEventCount ? ` of ${rowEventCount}` : ''})</summary>{visibleEvents.length < rowEventCount && <p className="wt-muted">{rowEventCount - visibleEvents.length} {rowEventCount - visibleEvents.length === 1 ? 'event belongs to a patient' : 'events belong to patients'} not plotted here (no plotted value of this parameter, or group hidden).</p>}{visibleEvents.length ? <ul>{visibleEvents.map((event, index) => <li key={index}>Patient {event.patientId}, {formatWorkspaceDate(event.date)}: {event.title}{event.endDate ? ` to ${formatWorkspaceDate(event.endDate)}` : ''}{event.description ? ` (${event.description})` : ''}</li>)}</ul> : <p>No events for the plotted patients.</p>}</details>}
    {display.events && visibleEvents.length > 0 && <p className="wt-muted wt-plot-key"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><line x1="6" x2="6" y1="0" y2="12" stroke={EVENT_COLOR} strokeDasharray="2 3" strokeWidth="1.5" /></svg> Dashed vertical lines: clinical events of {cohortRows.length === 1 ? 'this patient' : 'the plotted patients'}; “Inspect events” lists them.{intervalEvents > 0 && <>{' '}<span className="wt-overlay-swatch" aria-hidden="true" style={{ background: `${EVENT_COLOR}1f`, borderColor: `${EVENT_COLOR}40` }} /> Shaded: an event with an end date, from its start to its end{cohortRows.length > 1 ? ', shown for the highlighted patient' : ''}.</>}</p>}
    {formulaSwitchCount > 0 && <p className="wt-muted wt-plot-key" data-testid="egfr-switch-legend"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><line x1="6" x2="6" y1="0" y2="12" stroke={FORMULA_SWITCH_COLOR} strokeDasharray="1 3" strokeWidth="2" /></svg> Dotted vertical {formulaSwitchCount === 1 ? 'line' : 'lines'}: the eGFR equation changes ({detailSeries.flatMap(series => series.formulaSwitches.map(change => change.title.replace(/^Patient [^:]*: eGFR equation /, cohortRows.length > 1 ? `patient ${series.row.patientId}, ` : ''))).join('; ')}). {FORMULA_SWITCH_REASON.replace('this slope', 'a slope fitted across it')}</p>}
    {akiSkippedCount > 0 && <p className="wt-muted" data-testid="aki-skipped-note">{countLabel(akiSkippedCount, 'creatinine value')} measured under dialysis {akiSkippedCount === 1 ? 'is' : 'are'} {NOT_USED_FOR_AKI_DETECTION.replace(' (dialysis)', '')}; the point tooltips{cohortRows.length === 1 ? ' and the measurement table' : ''} name {akiSkippedCount === 1 ? 'it' : 'them'}. This is separate from any exclusion from the fit.</p>}
    {logScale && <p className="wt-muted" data-testid="log-axis-note">Logarithmic value axis: equal distances are equal ratios.{showFit && fitModel !== 'none' ? ' The dashed lines are fitted to the natural logarithm of the values and drawn back in the unit of the parameter.' : ''}{nonPositive > 0 ? ` ${countLabel(nonPositive, 'value')} of zero or less ${nonPositive === 1 ? 'is' : 'are'} not drawn and left out of the doubling time.` : ''}{showCohortMixedModelLine ? ' The cohort mixed-model line is not drawn on a logarithmic axis.' : ''}</p>}
    {showFit && <p className="wt-muted">{fitModel === 'none' ? 'Fit model disabled.' : logScale ? rollingLines ? 'Dashed: Rolling OLS window lines of the log values; the doubling time comes from the global OLS slope of the log values.' : `Dashed: individual ${modelLabel} lines of the log values.` : rollingLines ? 'Dashed: Rolling OLS window lines from the prepared analyses; each line names its window.' : `Dashed: individual ${modelLabel} lines from the prepared analyses.`}</p>}
    {showFit && fitModel !== 'none' && !logScale && <p className="wt-muted" data-testid="slope-tier-legend">Slope tiers: {tierCounts.reliable} reliable (at least 4 fitted dates over at least 2 years), {tierCounts.estimable} estimable (at least 3 dates over at least 1 year), {uncertain} uncertain (dotted).</p>}
    {showFit && !logScale && segmentLines > 0 && <p className="wt-muted" data-testid="krt-segment-legend">Dash-dot {segmentLines === 1 ? 'line' : 'lines'}: the values after kidney transplant or chronic dialysis start, fitted as a separate segment; not part of the slope of native kidney function.</p>}
    {pooledModelLine && <p className="wt-muted">Dark dashed line: full-cohort mixed-model reference trajectory; numeric factors at their fitted centers and categorical factors at reference levels.{axis === 'age' ? ' Age axis: mean baseline age of fitted patients plus elapsed model time.' : ''}</p>}
    {groupModelLines.length > 0 && <p className="wt-muted" data-testid="group-model-legend">Thick dash-dot lines in group colours: mixed-model reference trajectories fitted separately per group ({groupModelLines.map(line => groupLabel(line.group!)).join(', ')}).{axis === 'age' ? ' Age axis: mean baseline age of each group plus elapsed model time.' : ''}</p>}
    {(excludedCount > 0 || windowCount > 0) && <p className="wt-muted wt-plot-key" data-testid="excluded-legend"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4" fill="white" stroke={EXCLUDED_COLOR} strokeWidth="1.6" strokeDasharray="2 1.5" /></svg> Grey open circles:{excludedCount > 0 && <> {countLabel(excludedCount, 'measurement')} excluded from the fit ({excludedReasons.map(exclusionReasonLabel).join('; ')}). They stay visible but do not enter the slope.</>}{windowCount > 0 && <> {windowText}: left out of the after-anchor slope only; {windowCount === 1 ? 'it still enters' : 'they still enter'} the slope of the whole series.</>}</p>}
    {shownOverlays.map(module => <p key={module.id} className="wt-muted wt-plot-key">{markerCount(module.id) > 0
      ? <><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M 6 0 l 5 6 l -5 6 l -5 -6 Z" fill={module.presentation.color} /></svg>{module.presentation.markerLegend}{' '}<span className="wt-overlay-swatch" aria-hidden="true" style={{ background: `${module.presentation.color}26`, borderColor: `${module.presentation.color}40` }} /><span data-testid={`${module.id}-band-legend`}>{bandLegends(module)}</span>{cohortRows.length > 1 ? visible.some(p => p.row.patientId === highlight) ? ', shown for the highlighted patient' : highlight !== null ? '; the highlighted patient is not plotted in this chart' : '; windows and stage labels appear once a patient is chosen under Display → “Highlight patient”' : ''}.</>
      : module.presentation.emptyLegend}</p>)}
    {shownOverlays.flatMap(module => bandNotes(module).map(note => <p key={`${module.id}:${note}`} className="wt-muted" data-testid={`${module.id}-band-note`}>{note}</p>))}
    {showFit && uncertain > 0 && <p className="wt-warning">{uncertain} individual fits have uncertain slopes: fewer than three fitted measurement dates or less than one year of follow-up. Dotted fit lines identify these patients. Even R² = 1 can be based on only two points.</p>}
    {showFit && noFit > 0 && <p>{noFit} trajectories without an available fit.</p>}
    {visible.some(p => p.points.some(point => boundedPrefix(point.operator))) && <p className="wt-muted">Bounds marked &lt; or &gt; remain visible at their numeric limits. {boundedFitText(visible[0]?.cell.boundedValues)}</p>}
    {mergedSources.length > 0 && <p className="wt-muted" data-testid="merged-sources-legend">Merged series; marker shape by source series: {mergedSources.map((source, i) => `${MARK_SYMBOLS[markShape(i)]} ${source.bezeichnung} [${source.einheit ?? 'no unit'}]`).join('; ')}. The point tooltips name the source. Values from different laboratories or methods may not be comparable.</p>}
    {!display.points && !display.connect && <p>Measurement points and connecting lines are hidden.</p>}
    {groupBy && <p className="wt-muted">The legend only changes the display; selection and exports remain unchanged.</p>}
  </section>
}
