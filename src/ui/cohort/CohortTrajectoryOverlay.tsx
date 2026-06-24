import { useEffect, useMemo, useRef, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { useAppStore, type CohortOverlayXAxis } from '../state/store'
import { cohortOverlayPointsForSeries, isEgfrLike, patientIdFromPlotDatum, type CohortOverlayPoint } from './cohortOverlayData'
import { akiExclusionBands, episodesForSeries } from '../../core/aki/akiAware'
import { effectForEvent, eventTooltip } from '../../core/events/events'
import type { ClinicalEvent } from '../../core/events/events'
import type { FitConfig } from '../../core/fitPipeline/types'
import { comparePatientIds, type LabRow, type PatientId } from '../../core/types'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

function axisLabel(axis: CohortOverlayXAxis): string {
  if (axis === 'age') return 'Age'
  if (axis === 'calendar_time') return 'Date'
  return 'Years since baseline'
}

export function CohortTrajectoryOverlay() {
  const analysisResult = useAppStore((s) => s.analysisResult())
  const rows = analysisResult.rows
  const configs = useAppStore((s) => s.seriesConfigs)
  const patientMode = useAppStore((s) => s.cohortPatientMode)
  const selectedPatientIds = useAppStore((s) => s.selectedPatientIds)
  const axis = useAppStore((s) => s.cohortOverlayXAxis)
  const events = useAppStore((s) => s.events)
  const showEvents = useAppStore((s) => s.showEvents)
  const showAki = useAppStore((s) => s.showAki)
  const connectPoints = useAppStore((s) => s.connectPoints)
  const setAxis = useAppStore((s) => s.setCohortOverlayXAxis)
  const selectPatient = useAppStore((s) => s.selectPatient)
  const setView = useAppStore((s) => s.setView)
  const setReturnToCohort = useAppStore((s) => s.setReturnToCohort)
  const wrapRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)
  const [activeSeriesIndex, setActiveSeriesIndex] = useState(0)
  const [hoveredPatientId, setHoveredPatientId] = useState<PatientId | null>(null)
  const [selectedOverlayPatientId, setSelectedOverlayPatientId] = useState<PatientId | null>(null)

  const configuredSeries = useMemo(
    () => configs
      .map((config, index) => ({ config, index }))
      .filter((entry) => entry.config.bezeichnung),
    [configs],
  )
  const activeEntry = configuredSeries[Math.min(activeSeriesIndex, Math.max(0, configuredSeries.length - 1))]
  const activeConfig = activeEntry?.config

  useEffect(() => {
    if (activeSeriesIndex >= configuredSeries.length) setActiveSeriesIndex(0)
  }, [activeSeriesIndex, configuredSeries.length])

  const scopedPatientIds = useMemo(() => {
    const all = [...new Set(rows.map((r) => r.patientId))].sort(comparePatientIds)
    return patientMode === 'selected' ? all.filter((id) => selectedPatientIds.includes(id)) : all
  }, [rows, patientMode, selectedPatientIds])

  const points = useMemo(() => {
    if (!activeConfig?.bezeichnung) return []
    return cohortOverlayPointsForSeries({
      rows,
      bezeichnung: activeConfig.bezeichnung,
      einheit: activeConfig.einheit ?? null,
      patientIds: scopedPatientIds,
      axis,
      highlightedPatientIds: patientMode === 'selected' ? selectedPatientIds : [],
    })
  }, [rows, activeConfig?.bezeichnung, activeConfig?.einheit, scopedPatientIds, axis, patientMode, selectedPatientIds])

  const patientIds = useMemo(() => [...new Set(points.map((p) => p.patientId))].sort(comparePatientIds), [points])
  const title = activeConfig?.einheit ? `${activeConfig.bezeichnung} (${activeConfig.einheit})` : activeConfig?.bezeichnung ?? ''
  const egfr = activeConfig?.bezeichnung ? isEgfrLike(activeConfig.bezeichnung, activeConfig.einheit ?? null) : false
  const activeOverlayPatientId = hoveredPatientId ?? selectedOverlayPatientId
  const overlayEvents = useMemo(
    () => {
      if (activeOverlayPatientId === null || !activeConfig?.bezeichnung) return []
      const clinicalEvents = showEvents
        ? cohortOverlayEventsForAxis(events, points, axis, [activeOverlayPatientId])
        : []
      const akiEvents = showAki
        ? cohortOverlayAkiEventsForAxis(rows, activeConfig.bezeichnung, activeConfig.einheit ?? null, points, axis, [activeOverlayPatientId])
        : []
      return [...clinicalEvents, ...akiEvents].sort((a, b) => a.date.getTime() - b.date.getTime())
    },
    [showEvents, showAki, rows, events, points, axis, activeOverlayPatientId, activeConfig?.bezeichnung, activeConfig?.einheit],
  )
  const exclusionSegments = useMemo(
    () => activeOverlayPatientId !== null && activeConfig?.bezeichnung
      ? cohortOverlayExclusionSegments(
        events,
        rows,
        activeConfig.bezeichnung,
        activeConfig.einheit ?? null,
        points,
        axis,
        [activeOverlayPatientId],
        activeConfig.fitConfig,
      )
      : [],
    [events, rows, points, axis, activeOverlayPatientId, activeConfig?.bezeichnung, activeConfig?.einheit, activeConfig?.fitConfig],
  )
  const excludedPoints = useMemo(
    () => activeOverlayPatientId !== null && activeConfig?.bezeichnung
      ? cohortOverlayExcludedPoints(
        events,
        rows,
        activeConfig.bezeichnung,
        activeConfig.einheit ?? null,
        points,
        [activeOverlayPatientId],
        activeConfig.fitConfig,
      )
      : [],
    [events, rows, points, activeOverlayPatientId, activeConfig?.bezeichnung, activeConfig?.einheit, activeConfig?.fitConfig],
  )

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0].contentRect.width)
      if (next > 0) setWidth(Math.max(360, next))
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!plotRef.current) return
    const el = plotRef.current
    if (!activeConfig?.bezeichnung) {
      el.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Pick a parameter above to show the overlay plot.' }))
      return
    }
    if (points.length === 0) {
      el.replaceChildren(Object.assign(document.createElement('p'), { textContent: `${title} - no numeric values for the selected cohort scope and x-axis.` }))
      return
    }

    const marks: Plot.Markish[] = []
    if (egfr) {
      marks.push(Plot.ruleY([60, 45, 30, 15], { stroke: '#94a3b8', strokeDasharray: '3 3', strokeOpacity: 0.75 }))
    }
    if (connectPoints) {
      marks.push(Plot.line(points, {
        x: 'x',
        y: 'value',
        z: 'patientId',
        stroke: (d: CohortOverlayPoint) => d.highlighted || d.patientId === hoveredPatientId || d.patientId === selectedOverlayPatientId ? '#2563eb' : '#475569',
        strokeOpacity: (d: CohortOverlayPoint) => d.highlighted || d.patientId === hoveredPatientId || d.patientId === selectedOverlayPatientId ? 0.95 : 0.32,
        strokeWidth: (d: CohortOverlayPoint) => d.highlighted || d.patientId === hoveredPatientId || d.patientId === selectedOverlayPatientId ? 2.4 : 1.15,
      }))
    }
    if (connectPoints && exclusionSegments.length > 0) {
      marks.push(Plot.line(exclusionSegments, {
        x: 'x',
        y: 'value',
        z: 'segmentId',
        stroke: '#dc2626',
        strokeOpacity: 0.95,
        strokeWidth: 2.4,
      }))
    }
    marks.push(Plot.dot(points, {
      x: 'x',
      y: 'value',
      fill: (d: CohortOverlayPoint) => d.highlighted || d.patientId === hoveredPatientId || d.patientId === selectedOverlayPatientId ? '#2563eb' : '#ffffff',
      stroke: (d: CohortOverlayPoint) => d.highlighted || d.patientId === hoveredPatientId || d.patientId === selectedOverlayPatientId ? '#2563eb' : '#475569',
      strokeOpacity: (d: CohortOverlayPoint) => d.highlighted || d.patientId === hoveredPatientId || d.patientId === selectedOverlayPatientId ? 0.9 : 0.55,
      fillOpacity: (d: CohortOverlayPoint) => d.highlighted || d.patientId === hoveredPatientId || d.patientId === selectedOverlayPatientId ? 0.85 : 0.45,
      r: (d: CohortOverlayPoint) => d.highlighted || d.patientId === hoveredPatientId || d.patientId === selectedOverlayPatientId ? 3.2 : 1.8,
    }))
    if (excludedPoints.length > 0) {
      marks.push(Plot.dot(excludedPoints, {
        x: 'x',
        y: 'value',
        fill: '#fff',
        stroke: '#dc2626',
        strokeWidth: 1.8,
        r: 4,
      }))
    }
    if (overlayEvents.length > 0) {
      marks.push(Plot.ruleX(overlayEvents, {
        x: 'x',
        stroke: '#64748b',
        strokeDasharray: '3 3',
        strokeWidth: 1.2,
        strokeOpacity: 0.85,
      }))
    }

    const fig = Plot.plot({
      title,
      width,
      height: 320,
      marginLeft: 58,
      x: { label: axisLabel(axis), type: axis === 'calendar_time' ? 'time' : 'linear' },
      y: { label: 'Value', grid: true },
      marks,
    })
    el.replaceChildren(fig)
    const linePaths = [...fig.querySelectorAll<SVGPathElement>('g[aria-label="line"] path')]
    const nExclusionSegments = new Set(exclusionSegments.map((segment) => segment.segmentId)).size
    const trajectoryPaths = nExclusionSegments > 0 ? linePaths.slice(0, -nExclusionSegments) : linePaths
    const exclusionPaths = nExclusionSegments > 0 ? linePaths.slice(-nExclusionSegments) : []
    trajectoryPaths.forEach((path) => {
      const patientId = patientIdFromPlotDatum((path as SVGPathElement & { __data__?: unknown }).__data__, points)
      if (patientId === null) return
      path.dataset.patientId = String(patientId)
      path.setAttribute('aria-label', `Patient ${patientId} trajectory`)
      path.setAttribute('title', `Patient ${patientId} - click to highlight; double-click to open`)
      path.setAttribute('role', 'button')
      path.setAttribute('tabindex', '0')
      path.style.cursor = 'pointer'
      path.style.pointerEvents = 'stroke'
      path.addEventListener('pointerenter', () => setHoveredPatientId(patientId))
      path.addEventListener('pointerleave', () => setHoveredPatientId(null))
      path.addEventListener('click', () => setSelectedOverlayPatientId(patientId))
      path.addEventListener('dblclick', () => openPatient(patientId))
      path.addEventListener('keydown', (event) => handlePatientKey(event, patientId))
    })
    const dotEls = [...fig.querySelectorAll<SVGCircleElement>('g[aria-label="dot"] circle')]
    const measurementDots = dotEls.slice(0, points.length)
    const excludedPointDots = dotEls.slice(points.length, points.length + excludedPoints.length)
    measurementDots.forEach((dot) => {
      const patientId = patientIdFromPlotDatum((dot as SVGCircleElement & { __data__?: unknown }).__data__, points)
      if (patientId === null) return
      dot.dataset.patientId = String(patientId)
      dot.setAttribute('aria-label', `Patient ${patientId} measurement`)
      dot.setAttribute('title', `Patient ${patientId} - click to highlight; double-click to open`)
      dot.setAttribute('role', 'button')
      dot.setAttribute('tabindex', '0')
      dot.style.cursor = 'pointer'
      dot.addEventListener('pointerenter', () => setHoveredPatientId(patientId))
      dot.addEventListener('pointerleave', () => setHoveredPatientId(null))
      dot.addEventListener('click', () => setSelectedOverlayPatientId(patientId))
      dot.addEventListener('dblclick', () => openPatient(patientId))
      dot.addEventListener('keydown', (event) => handlePatientKey(event, patientId))
    })
    excludedPointDots.forEach((dot, index) => {
      const point = excludedPoints[index]
      if (!point) return
      dot.dataset.testid = 'cohort-overlay-excluded-point'
      dot.dataset.patientId = String(point.patientId)
      dot.setAttribute('stroke', '#dc2626')
      dot.setAttribute('fill', '#fff')
      dot.setAttribute('aria-label', `Patient ${point.patientId} excluded measurement`)
      dot.setAttribute('role', 'button')
      dot.setAttribute('tabindex', '0')
      dot.style.cursor = 'pointer'
      dot.addEventListener('pointerenter', () => setHoveredPatientId(point.patientId))
      dot.addEventListener('pointerleave', () => setHoveredPatientId(null))
      dot.addEventListener('click', () => setSelectedOverlayPatientId(point.patientId))
      dot.addEventListener('dblclick', () => openPatient(point.patientId))
      dot.addEventListener('keydown', (event) => handlePatientKey(event, point.patientId))
    })
    exclusionPaths.forEach((path) => {
      const patientId = patientIdFromPlotDatum((path as SVGPathElement & { __data__?: unknown }).__data__, exclusionSegments)
      if (patientId === null) return
      path.dataset.testid = 'cohort-overlay-exclusion-segment'
      path.dataset.patientId = String(patientId)
      path.setAttribute('stroke', '#dc2626')
      path.setAttribute('aria-label', `Patient ${patientId} excluded trajectory portion`)
    })
    if (overlayEvents.length > 0) {
      const eventRules = [...fig.querySelectorAll<SVGLineElement>('g[aria-label="rule"] line')]
        .slice(-overlayEvents.length)
      eventRules.forEach((line, index) => {
        const event = overlayEvents[index]
        line.dataset.testid = 'cohort-overlay-event-line'
        line.dataset.patientId = String(event.patientId)
        line.setAttribute('aria-label', `${event.title} event line for patient ${event.patientId}`)
        line.style.pointerEvents = 'stroke'
        line.addEventListener('pointerenter', () => setHoveredPatientId(event.patientId))
        line.addEventListener('pointerleave', () => setHoveredPatientId(null))
        line.addEventListener('click', () => setSelectedOverlayPatientId(event.patientId))
      })
      renderEventLabels(fig, eventRules, overlayEvents)
    }
    return () => fig.remove()
  }, [activeConfig?.bezeichnung, title, points, patientIds, axis, width, egfr, connectPoints, hoveredPatientId, selectedOverlayPatientId, overlayEvents, exclusionSegments, excludedPoints])

  function openPatient(patientId: PatientId) {
    selectPatient(patientId)
    setReturnToCohort(true)
    setView('one')
  }

  function handlePatientKey(event: KeyboardEvent, patientId: PatientId) {
    if (event.key === 'Enter') {
      event.preventDefault()
      openPatient(patientId)
    } else if (event.key === ' ') {
      event.preventDefault()
      setSelectedOverlayPatientId(patientId)
    }
  }

  const patientLabel = `${patientIds.length} ${patientIds.length === 1 ? 'patient' : 'patients'}`
  const pointLabel = `${points.length} ${points.length === 1 ? 'point' : 'points'}`

  return (
    <section className="cohort-overlay" aria-label="Cohort trajectory overlay">
      <div className="cohort-overlay-toolbar">
        {configuredSeries.length > 1 && (
          <label className="cohort-overlay-field">
            Series
            <select aria-label="Overlay series" value={activeSeriesIndex} onChange={(e) => setActiveSeriesIndex(Number(e.target.value))}>
              {configuredSeries.map((entry, optionIndex) => {
                const label = entry.config.einheit ? `${entry.config.bezeichnung} (${entry.config.einheit})` : entry.config.bezeichnung
                return <option key={entry.index} value={optionIndex}>{label}</option>
              })}
            </select>
          </label>
        )}
        <label className="cohort-overlay-field">
          X-axis
          <select aria-label="Overlay x-axis" value={axis} onChange={(e) => setAxis(e.target.value as CohortOverlayXAxis)}>
            <option value="age">Age</option>
            <option value="calendar_time">Date</option>
            <option value="time_since_baseline">Years since baseline</option>
          </select>
        </label>
        <span className="cohort-overlay-stat">Axis: {axisLabel(axis)}</span>
        <span className="cohort-overlay-stat">{patientLabel}</span>
        <span className="cohort-overlay-stat">{pointLabel}</span>
        {selectedOverlayPatientId !== null && <span className="cohort-overlay-stat">Selected: Patient {selectedOverlayPatientId}</span>}
        {hoveredPatientId !== null && <span className="cohort-overlay-stat">Hover: Patient {hoveredPatientId}</span>}
      </div>
      <div className="cohort-overlay-body" ref={wrapRef}>
        <div
          ref={plotRef}
          role="img"
          data-testid="cohort-trajectory-overlay"
          aria-label={`${title}: trajectory overlay across ${patientIds.length} ${patientIds.length === 1 ? 'patient' : 'patients'}`}
        />
      </div>
    </section>
  )
}

interface OverlayEvent {
  patientId: PatientId
  x: number | Date
  y: number
  date: Date
  title: string
  tooltip: string
  excludes: boolean
}

interface OverlaySegmentPoint {
  patientId: PatientId
  x: number | Date
  value: number
  segmentId: string
}

type OverlayExcludedPoint = CohortOverlayPoint

const romanAki: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' }

function cohortOverlayEventsForAxis(
  events: readonly ClinicalEvent[],
  points: readonly CohortOverlayPoint[],
  axis: CohortOverlayXAxis,
  scopedPatientIds: readonly PatientId[],
): OverlayEvent[] {
  const scoped = new Set(scopedPatientIds)
  const pointsByPatient = new Map<PatientId, CohortOverlayPoint[]>()
  for (const point of points) {
    const patientPoints = pointsByPatient.get(point.patientId) ?? []
    patientPoints.push(point)
    pointsByPatient.set(point.patientId, patientPoints)
  }
  for (const patientPoints of pointsByPatient.values()) {
    patientPoints.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  return events
    .filter((event) => scoped.has(event.patientId))
    .map((event): OverlayEvent | null => {
      const patientPoints = pointsByPatient.get(event.patientId)
      if (!patientPoints?.length) return null
      const x = eventXForAxis(event.date, patientPoints, axis)
      if (x === null) return null
      const y = valueAtEventDate(event.date, patientPoints)
      if (y === null) return null
      const effect = effectForEvent(event).effect
      return {
        patientId: event.patientId,
        x,
        y,
        date: event.date,
        title: event.title,
        tooltip: eventTooltip(event),
        excludes: effect === 'censor_from_date' || effect === 'exclude_interval',
      }
    })
    .filter((event): event is OverlayEvent => event !== null)
}

function cohortOverlayAkiEventsForAxis(
  rows: readonly LabRow[],
  bezeichnung: string,
  einheit: string | null,
  points: readonly CohortOverlayPoint[],
  axis: CohortOverlayXAxis,
  scopedPatientIds: readonly PatientId[],
): OverlayEvent[] {
  const scoped = new Set(scopedPatientIds)
  const pointsByPatient = pointsByPatientId(points)
  const out: OverlayEvent[] = []
  for (const patientId of scoped) {
    const patientPoints = pointsByPatient.get(patientId)
    if (!patientPoints?.length) continue
    const episodes = episodesForSeries([...rows], patientId, bezeichnung, einheit)
    for (const episode of episodes) {
      const x = eventXForAxis(episode.date, patientPoints, axis)
      if (x === null) continue
      const y = valueAtEventDate(episode.date, patientPoints)
      if (y === null) continue
      const title = `AKI ${romanAki[episode.stage] ?? episode.stage}`
      out.push({
        patientId,
        x,
        y,
        date: episode.date,
        title,
        tooltip: title,
        excludes: false,
      })
    }
  }
  return out
}

function cohortOverlayExcludedPoints(
  events: readonly ClinicalEvent[],
  rows: readonly LabRow[],
  bezeichnung: string,
  einheit: string | null,
  points: readonly CohortOverlayPoint[],
  scopedPatientIds: readonly PatientId[],
  fitConfig: FitConfig,
): OverlayExcludedPoint[] {
  const scoped = new Set(scopedPatientIds)
  const activeEvents = events.filter((event) => scoped.has(event.patientId) && eventExclusionActive(event, fitConfig.censoring))
  const akiRanges = fitConfig.exclusions.excludeAkiWindows
    ? akiRangesByPatient(rows, bezeichnung, einheit, points, scoped, fitConfig.exclusions.akiExclusionDays)
    : new Map<PatientId, Array<{ start: Date; end: Date }>>()
  if (activeEvents.length === 0 && akiRanges.size === 0) return []
  return points.filter((point) => {
    if (!scoped.has(point.patientId)) return false
    const clinicalExcluded = activeEvents
      .filter((event) => event.patientId === point.patientId)
      .some((event) => excludedDateRangesForConfig(event, point.date, fitConfig.censoring))
    const akiExcluded = (akiRanges.get(point.patientId) ?? [])
      .some((range) => dateInRange(point.date, range))
    return clinicalExcluded || akiExcluded
  })
}

function cohortOverlayExclusionSegments(
  events: readonly ClinicalEvent[],
  rows: readonly LabRow[],
  bezeichnung: string,
  einheit: string | null,
  points: readonly CohortOverlayPoint[],
  axis: CohortOverlayXAxis,
  scopedPatientIds: readonly PatientId[],
  fitConfig: FitConfig,
): OverlaySegmentPoint[] {
  const scoped = new Set(scopedPatientIds)
  const pointsByPatient = pointsByPatientId(points)

  const out: OverlaySegmentPoint[] = []
  events
    .filter((event) => scoped.has(event.patientId))
    .filter((event) => eventExclusionActive(event, fitConfig.censoring))
    .forEach((event, eventIndex) => {
      const effect = effectForEvent(event).effect
      if (effect !== 'censor_from_date' && effect !== 'exclude_interval') return
      const patientPoints = pointsByPatient.get(event.patientId)
      if (!patientPoints?.length) return
      const ranges = excludedDateRanges(event, patientPoints[patientPoints.length - 1].date, fitConfig.censoring)
      ranges.forEach((range, rangeIndex) => {
        const clipped = clipRangeToPoints(range, patientPoints, axis)
        if (clipped.length < 2) return
        const segmentId = `${event.patientId}-${eventIndex}-${rangeIndex}`
        clipped.forEach((point) => out.push({ ...point, patientId: event.patientId, segmentId }))
      })
    })
  if (fitConfig.exclusions.excludeAkiWindows) {
    const akiRanges = akiRangesByPatient(rows, bezeichnung, einheit, points, scoped, fitConfig.exclusions.akiExclusionDays)
    for (const [patientId, ranges] of akiRanges) {
      const patientPoints = pointsByPatient.get(patientId)
      if (!patientPoints?.length) continue
      ranges.forEach((range, rangeIndex) => {
        const clipped = clipRangeToPoints(range, patientPoints, axis)
        if (clipped.length < 2) return
        const segmentId = `${patientId}-aki-${rangeIndex}`
        clipped.forEach((point) => out.push({ ...point, patientId, segmentId }))
      })
    }
  }
  return out
}

function pointsByPatientId(points: readonly CohortOverlayPoint[]): Map<PatientId, CohortOverlayPoint[]> {
  const pointsByPatient = new Map<PatientId, CohortOverlayPoint[]>()
  for (const point of points) {
    const patientPoints = pointsByPatient.get(point.patientId) ?? []
    patientPoints.push(point)
    pointsByPatient.set(point.patientId, patientPoints)
  }
  for (const patientPoints of pointsByPatient.values()) {
    patientPoints.sort((a, b) => a.date.getTime() - b.date.getTime())
  }
  return pointsByPatient
}

function akiRangesByPatient(
  rows: readonly LabRow[],
  bezeichnung: string,
  einheit: string | null,
  points: readonly CohortOverlayPoint[],
  scoped: ReadonlySet<PatientId>,
  exclusionDays: number,
): Map<PatientId, Array<{ start: Date; end: Date }>> {
  const ranges = new Map<PatientId, Array<{ start: Date; end: Date }>>()
  for (const patientId of scoped) {
    if (!points.some((point) => point.patientId === patientId)) continue
    const episodes = episodesForSeries([...rows], patientId, bezeichnung, einheit)
    const bands = akiExclusionBands(episodes, exclusionDays)
    if (bands.length > 0) ranges.set(patientId, bands)
  }
  return ranges
}

function dateInRange(date: Date, range: { start: Date; end: Date }): boolean {
  const t = date.getTime()
  return t >= range.start.getTime() && t <= range.end.getTime()
}

function eventExclusionActive(event: ClinicalEvent, censoring: FitConfig['censoring'] | undefined): boolean {
  if (event.type === 'kidney_transplant') return censoring?.censorAfterKidneyTransplant ?? false
  if (event.type !== 'dialysis') return false
  if (event.intent === 'chronic') return censoring?.censorAfterChronicDialysis ?? false
  if (event.intent === 'acute') return (censoring?.excludeAcuteDialysisPeriods ?? false) && event.endDate !== null
  if (event.intent === 'unknown') {
    if (censoring?.unknownDialysisPolicy === 'censor-from-start') return true
    return censoring?.unknownDialysisPolicy === 'exclude-dated-interval' && event.endDate !== null
  }
  return false
}

function excludedDateRanges(event: ClinicalEvent, lastDate: Date, censoring: FitConfig['censoring'] | undefined): Array<{ start: Date; end: Date }> {
  if (!eventExclusionActive(event, censoring)) return []
  if (event.type === 'kidney_transplant') return [{ start: event.date, end: lastDate }]
  if (event.type !== 'dialysis') return []
  if (event.intent === 'chronic') return [{ start: event.date, end: lastDate }]
  if (event.intent === 'acute' && event.endDate !== null) return [{ start: event.date, end: event.endDate }]
  if (event.intent === 'unknown') {
    if (censoring?.unknownDialysisPolicy === 'censor-from-start') return [{ start: event.date, end: lastDate }]
    if (censoring?.unknownDialysisPolicy === 'exclude-dated-interval' && event.endDate !== null) return [{ start: event.date, end: event.endDate }]
  }
  return []
}

function excludedDateRangesForConfig(event: ClinicalEvent, date: Date, censoring: FitConfig['censoring'] | undefined): boolean {
  const t = date.getTime()
  if (event.type === 'kidney_transplant') return (censoring?.censorAfterKidneyTransplant ?? false) && t >= event.date.getTime()
  if (event.type !== 'dialysis') return false
  if (event.intent === 'chronic') return (censoring?.censorAfterChronicDialysis ?? false) && t >= event.date.getTime()
  if (event.intent === 'acute') {
    return (censoring?.excludeAcuteDialysisPeriods ?? false) && event.endDate !== null && t >= event.date.getTime() && t <= event.endDate.getTime()
  }
  if (event.intent === 'unknown') {
    if (censoring?.unknownDialysisPolicy === 'censor-from-start') return t >= event.date.getTime()
    return censoring?.unknownDialysisPolicy === 'exclude-dated-interval' && event.endDate !== null && t >= event.date.getTime() && t <= event.endDate.getTime()
  }
  return false
}

function clipRangeToPoints(
  range: { start: Date; end: Date },
  patientPoints: readonly CohortOverlayPoint[],
  axis: CohortOverlayXAxis,
): Array<{ x: number | Date; value: number }> {
  const first = patientPoints[0].date.getTime()
  const last = patientPoints[patientPoints.length - 1].date.getTime()
  const startMs = Math.max(range.start.getTime(), first)
  const endMs = Math.min(range.end.getTime(), last)
  if (endMs <= startMs) return []
  const startDate = new Date(startMs)
  const endDate = new Date(endMs)
  const startX = eventXForAxis(startDate, patientPoints, axis)
  const endX = eventXForAxis(endDate, patientPoints, axis)
  const startY = valueAtEventDate(startDate, patientPoints)
  const endY = valueAtEventDate(endDate, patientPoints)
  if (startX === null || endX === null || startY === null || endY === null) return []
  const middle = patientPoints
    .filter((point) => point.date.getTime() > startMs && point.date.getTime() < endMs)
    .map((point) => ({ x: point.x, value: point.value }))
  return [{ x: startX, value: startY }, ...middle, { x: endX, value: endY }]
}

function eventXForAxis(
  eventDate: Date,
  patientPoints: readonly CohortOverlayPoint[],
  axis: CohortOverlayXAxis,
): number | Date | null {
  if (axis === 'calendar_time') return eventDate
  const anchor = patientPoints.find((point) => typeof point.x === 'number')
  if (!anchor || typeof anchor.x !== 'number') return null
  return anchor.x + (eventDate.getTime() - anchor.date.getTime()) / MS_PER_YEAR
}

function valueAtEventDate(eventDate: Date, patientPoints: readonly CohortOverlayPoint[]): number | null {
  if (patientPoints.length === 0) return null
  const t = eventDate.getTime()
  const first = patientPoints[0]
  const last = patientPoints[patientPoints.length - 1]
  if (t < first.date.getTime() || t > last.date.getTime()) return null
  const exact = patientPoints.find((point) => point.date.getTime() === t)
  if (exact) return exact.value
  for (let i = 1; i < patientPoints.length; i++) {
    const prev = patientPoints[i - 1]
    const next = patientPoints[i]
    const t0 = prev.date.getTime()
    const t1 = next.date.getTime()
    if (t >= t0 && t <= t1) {
      const frac = (t - t0) / (t1 - t0)
      return prev.value + (next.value - prev.value) * frac
    }
  }
  return null
}

function renderEventLabels(fig: SVGSVGElement | HTMLElement, eventRules: SVGLineElement[], events: readonly OverlayEvent[]): void {
  const svg = fig.querySelector('svg')
  if (!svg) return
  const svgWidth = svgWidthForLabels(svg)
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('aria-label', 'event labels')
  svg.appendChild(layer)
  const placed: LabelBox[] = []
  eventRules.forEach((line, index) => {
    const event = events[index]
    if (!event) return
    const x1 = Number(line.getAttribute('x1'))
    const x2 = Number(line.getAttribute('x2'))
    const y1 = Number(line.getAttribute('y1'))
    const y2 = Number(line.getAttribute('y2'))
    const x = Number.isFinite(x1) && Number.isFinite(x2) ? (x1 + x2) / 2 : x1
    const topY = Math.min(y1, y2)
    if (!Number.isFinite(x) || !Number.isFinite(topY)) return
    const text = event.title
    const labelWidth = Math.max(72, Math.min(180, text.length * 6 + 18))
    const labelHeight = 18
    const placement = labelPlacementForLine(x, labelWidth, svgWidth)
    const labelY = labelYWithoutOverlap(
      { x1: placement.x, x2: placement.x + labelWidth, y1: topY + 3, y2: topY + 3 + labelHeight },
      placed,
    )
    placed.push({ x1: placement.x, x2: placement.x + labelWidth, y1: labelY, y2: labelY + labelHeight })
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.dataset.patientId = String(event.patientId)
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.dataset.testid = 'cohort-overlay-event-label-bg'
    rect.setAttribute('x', String(placement.x))
    rect.setAttribute('y', String(labelY))
    rect.setAttribute('width', String(labelWidth))
    rect.setAttribute('height', String(labelHeight))
    rect.setAttribute('rx', '3')
    rect.setAttribute('fill', '#f8fafc')
    rect.setAttribute('stroke', '#cbd5e1')
    rect.setAttribute('stroke-width', '1')
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.dataset.testid = 'cohort-overlay-event-label'
    label.dataset.patientId = String(event.patientId)
    label.setAttribute('x', String(placement.textX))
    label.setAttribute('y', String(labelY + 12))
    label.setAttribute('fill', '#334155')
    label.setAttribute('font-size', '10')
    label.setAttribute('font-weight', '600')
    label.setAttribute('text-anchor', placement.anchor)
    label.textContent = text
    group.append(rect, label)
    layer.appendChild(group)
  })
}

interface LabelBox {
  x1: number
  x2: number
  y1: number
  y2: number
}

function labelYWithoutOverlap(candidate: LabelBox, placed: readonly LabelBox[]): number {
  const gap = 3
  let next = { ...candidate }
  for (let guard = 0; guard < 20 && placed.some((box) => boxesOverlap(next, box)); guard++) {
    const height = next.y2 - next.y1
    const y1 = next.y2 + gap
    next = {
      ...next,
      y1,
      y2: y1 + height,
    }
  }
  return next.y1
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

function svgWidthForLabels(svg: SVGSVGElement): number {
  const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number)
  if (viewBox && viewBox.length === 4 && Number.isFinite(viewBox[2])) return viewBox[2]
  const width = Number(svg.getAttribute('width'))
  return Number.isFinite(width) && width > 0 ? width : 760
}

function labelPlacementForLine(
  lineX: number,
  labelWidth: number,
  svgWidth: number,
): { x: number; textX: number; anchor: 'start' | 'end' } {
  const gap = 4
  const pad = 8
  const minX = 4
  const maxX = Math.max(minX, svgWidth - labelWidth - 4)
  if (lineX + gap + labelWidth <= svgWidth - 4) {
    const x = Math.max(minX, Math.min(lineX + gap, maxX))
    return { x, textX: x + pad, anchor: 'start' }
  }
  const x = Math.max(minX, Math.min(lineX - gap - labelWidth, maxX))
  return { x, textX: x + labelWidth - pad, anchor: 'end' }
}
