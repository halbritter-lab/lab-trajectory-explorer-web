import { useEffect, useRef, useState } from 'react'
import * as Plot from '@observablehq/plot'
import type { LabRow } from '../../core/types'
import type { SeriesPoint } from '../../core/stats/series'
import { buildSlopeLines, type PlotModeConfig } from '../../core/stats/slopeLines'
import { findKdigoAkiEpisodes } from '../../core/aki/kdigo'
import type { AkiEpisode } from '../../core/aki/kdigo'
import { akiExclusionBands, fitAkiAware } from '../../core/aki/akiAware'
import { formatAkiChip, formatAkiEpisodeSummary } from '../../core/aki/summary'
import { filterFitPointsByClinicalEvents } from '../../core/events/fitExclusions'

export interface SeriesPlotProps {
  title: string
  rows: LabRow[] // rows for this (patient, bezeichnung, einheit), any operator
  cfg: PlotModeConfig
  computed?: boolean
  events?: { date: Date; label: string; tooltip?: string }[]
  showAki?: boolean
  creatinine?: boolean
  episodes?: AkiEpisode[] // precomputed (cross-series) episodes for aki-aware mode
  connect?: boolean // draw a line joining consecutive measurements
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

function trendLegendLabel(cfg: PlotModeConfig): string | null {
  if (cfg.fitModel === 'none') return null
  if (cfg.fitModel === 'theil-sen' || cfg.mode === 'global-robust') return 'Trend (Theil-Sen fit)'
  if (cfg.fitModel === 'rolling-ols' || cfg.mode === 'rolling') return 'Trend (rolling OLS)'
  if (cfg.fitModel === 'segmented-ols' || cfg.mode === 'gap-split' || cfg.mode === 'event-driven') return 'Trend (segmented OLS)'
  return 'Trend (OLS fit)'
}

export function SeriesPlot({ title, rows, cfg, computed = false, events, showAki = false, creatinine = false, episodes, connect = true }: SeriesPlotProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)

  // Make the plot follow its container width (responsive) instead of a fixed
  // 760px. Guarded for environments without ResizeObserver (e.g. jsdom tests).
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width)
      if (w > 0) setWidth(Math.max(320, w))
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const numericRows = rows.filter((r) => r.wertNum !== null && r.labDatum !== null)
  const points: SeriesPoint[] = numericRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))

  const plotEvents = events ?? []
  const eventKey = JSON.stringify(plotEvents.map((event) => [event.date.getTime(), event.label, event.tooltip ?? '']))
  const legendEpisodes = showAki && points.length > 0
    ? (episodes ?? (creatinine ? findKdigoAkiEpisodes(points) : []))
    : []
  const akiStages = legendEpisodes.map((e) => e.stage)
  const akiSummary = formatAkiEpisodeSummary(akiStages)
  const akiLegendText = akiStages.length > 0 ? formatAkiChip(akiStages).replace(/^AKI /, 'AKI episodes: ') : ''
  const trendLabel = trendLegendLabel(cfg)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    if (points.length === 0) {
      el.replaceChildren(Object.assign(document.createElement('p'), { textContent: `${title} — (no numeric values)` }))
      return
    }
    const measured = numericRows
      .filter((r) => r.wertOperator === '=')
      .map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
    const censored = numericRows
      .filter((r) => r.wertOperator === '<' || r.wertOperator === '>')
      .map((r) => ({ date: r.labDatum!, value: r.wertNum!, op: r.wertOperator }))
    const akiEps = cfg.mode === 'aki-aware' || cfg.excludeAkiWindows
      ? (episodes ?? (creatinine ? findKdigoAkiEpisodes(points) : []))
      : undefined
    const lines = buildSlopeLines(points, cfg, akiEps)
    const sortedPoints = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
    const clinicalExcludedPoints = filterFitPointsByClinicalEvents(
      sortedPoints,
      cfg.clinicalEvents,
      cfg.clinicalEventCensoring,
    ).excludedIdx.map((index) => sortedPoints[index])
    const showAkiExcludedPoints = cfg.excludeAkiWindows === true || cfg.mode === 'aki-aware'
    let akiExcludedPointCount = 0
    const overlayEpisodes = (showAki || showAkiExcludedPoints) && (creatinine || episodes !== undefined)
      ? (episodes ?? (cfg.mode === 'aki-aware' ? (akiEps ?? []) : findKdigoAkiEpisodes(points)))
      : []

    const marks: Plot.Markish[] = [
      Plot.dot(measured, { x: 'date', y: 'value', fill: computed ? 'white' : 'currentColor', stroke: 'currentColor', r: 3, tip: true }),
    ]
    // Optional connecting line joining consecutive measurements (chronological).
    // Drawn behind the dots and distinct from the tomato regression line.
    if (connect && measured.length > 1) {
      const ordered = [...measured].sort((a, b) => a.date.getTime() - b.date.getTime())
      marks.unshift(Plot.line(ordered, { x: 'date', y: 'value', stroke: 'currentColor', strokeOpacity: 0.35, strokeWidth: 1 }))
    }
    if (censored.length > 0) {
      marks.push(Plot.dot(censored, { x: 'date', y: 'value', symbol: (d: { op: string }) => (d.op === '>' ? 'triangle' : 'triangle2'), stroke: 'currentColor', r: 4, tip: true }))
    }
    if (clinicalExcludedPoints.length > 0) {
      marks.push(Plot.dot(clinicalExcludedPoints, { x: 'date', y: 'value', stroke: '#dc2626', fill: 'white', r: 3.6, strokeWidth: 1.6 }))
    }
    lines.forEach((ln) => marks.push(Plot.line(ln, { x: 'date', y: 'value', stroke: 'tomato', strokeDasharray: '4 3' })))

    // AKI episode overlay. Computed/non-creatinine series can pass
    // creatinine-derived episodes explicitly for cross-series display.
    if (overlayEpisodes.length > 0 && points.length > 0) {
      const exDays = cfg.exclusionDays ?? 30
      if (showAki) {
        akiExclusionBands(overlayEpisodes, exDays).forEach((b) =>
          marks.unshift(Plot.rect([b], { x1: 'start', x2: 'end', fill: '#ef4444', fillOpacity: 0.12 })),
        )
      }
      const sortedPts = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
      const keptSet = new Set(fitAkiAware(sortedPts, exDays, overlayEpisodes).keptIdx)
      const excludedPts = sortedPts.filter((_, i) => !keptSet.has(i))
      if (showAkiExcludedPoints && excludedPts.length > 0) {
        akiExcludedPointCount = excludedPts.length
        marks.push(Plot.dot(excludedPts, { x: 'date', y: 'value', stroke: '#dc2626', fill: 'white', r: 3 }))
      }
      if (showAki) {
        const roman = ['', 'I', 'II', 'III']
        const peaks = overlayEpisodes.map((e) => {
          const sameDate = sortedPts.find((p) => p.date.getTime() === e.peakDate.getTime())
          const nearest = sameDate ?? sortedPts.reduce((best, p) =>
            Math.abs(p.date.getTime() - e.peakDate.getTime()) < Math.abs(best.date.getTime() - e.peakDate.getTime()) ? p : best,
          sortedPts[0])
          return { date: nearest.date, value: nearest.value, label: `AKI ${roman[e.stage] ?? e.stage}` }
        })
        marks.push(Plot.dot(peaks, { x: 'date', y: 'value', symbol: 'diamond', fill: '#dc2626', r: 5 }))
        marks.push(Plot.text(peaks, { x: 'date', y: 'value', text: 'label', dy: -8, fill: '#dc2626', fontSize: 9 }))
      }
    }

    // Event rules
    plotEvents.forEach((event) => marks.push(Plot.ruleX([event.date], { stroke: '#666', strokeDasharray: '2 2', strokeWidth: 1.25 })))
    if (plotEvents.length > 0 && plotEvents.length <= 12) {
      const labeled = plotEvents.filter((event) => event.label)
      if (labeled.length > 0) {
        marks.push(
          Plot.text(labeled, {
            x: 'date',
            text: 'label',
            frameAnchor: 'top',
            dy: -18,
            lineAnchor: 'bottom',
            fontSize: 9,
            fill: '#222',
          } as unknown as Plot.TextOptions),
        )
      }
    }

    const fig = Plot.plot({
      title,
      width,
      height: 240,
      marginLeft: 56,
      marginTop: plotEvents.length > 0 ? 42 : undefined,
      marginBottom: 44,
      x: { label: 'Date' },
      y: { label: 'Value', grid: true },
      marks,
    })
    el.replaceChildren(fig)
    if (clinicalExcludedPoints.length > 0) {
      const dotCircles = [...fig.querySelectorAll<SVGCircleElement>('g[aria-label="dot"] circle')]
      const clinicalDots = dotCircles.slice(measured.length + censored.length, measured.length + censored.length + clinicalExcludedPoints.length)
      clinicalDots.forEach((dot) => {
        dot.dataset.testid = 'detail-excluded-point'
        dot.setAttribute('stroke', '#dc2626')
        dot.setAttribute('fill', 'white')
        dot.setAttribute('aria-label', 'Excluded measurement')
      })
    }
    if (akiExcludedPointCount > 0) {
      const dotCircles = [...fig.querySelectorAll<SVGCircleElement>('g[aria-label="dot"] circle')]
      const start = measured.length + censored.length + clinicalExcludedPoints.length
      const akiDots = dotCircles.slice(start, start + akiExcludedPointCount)
      akiDots.forEach((dot) => {
        dot.dataset.testid = 'detail-aki-excluded-point'
        dot.setAttribute('stroke', '#dc2626')
        dot.setAttribute('fill', 'white')
        dot.setAttribute('aria-label', 'AKI-window excluded measurement')
      })
    }
    const xAxisLabel = [...fig.querySelectorAll<SVGTextElement>('text')].find((node) => node.textContent?.includes('Date'))
    if (xAxisLabel) {
      xAxisLabel.textContent = 'Date'
      xAxisLabel.setAttribute('text-anchor', 'middle')
      xAxisLabel.setAttribute('transform', `translate(${width / 2},230)`)
    }
    const eventRules = [...fig.querySelectorAll<SVGLineElement>('g[aria-label="rule"] line')]
    eventRules.slice(-plotEvents.length).forEach((line, i) => {
      const event = plotEvents[i]
      const label = event.label || 'Event'
      line.dataset.testid = 'event-line'
      line.style.cursor = 'pointer'
      line.style.pointerEvents = 'stroke'
      line.setAttribute('stroke', '#666')
      line.setAttribute('stroke-width', '1.25')
      line.appendChild(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'title'), {
        textContent: event.tooltip ?? `${label} · ${fmtDate(event.date)}`,
      }))
      line.addEventListener('pointerenter', () => {
        line.setAttribute('stroke', '#7c3aed')
        line.setAttribute('stroke-width', '3')
      })
      line.addEventListener('pointerleave', () => {
        line.setAttribute('stroke', '#666')
        line.setAttribute('stroke-width', '1.25')
      })
    })

    if (computed) {
      const cap = document.createElement('p')
      cap.textContent = 'Computed from creatinine × demographics — not for clinical decision-making.'
      cap.style.cssText = 'font-size:11px;color:#7b8794;margin:.25rem 0 0'
      el.append(cap)
    }

    return () => fig.remove()
  }, [title, width, cfg.mode, cfg.gapDays, cfg.windowDays, cfg.stepDays, cfg.exclusionDays, cfg.excludeAkiWindows, cfg.fitModel, computed, connect, JSON.stringify(points.map((p) => [p.date.getTime(), p.value])), JSON.stringify((cfg.clinicalEvents ?? []).map((event) => [event.patientId, event.type, event.date.getTime(), event.endDate?.getTime() ?? null, event.intent])), JSON.stringify(cfg.clinicalEventCensoring ?? null), eventKey, showAki, creatinine, JSON.stringify((episodes ?? []).map((e) => e.date.getTime()))])

  const showAkiLegend = showAki && (creatinine || episodes !== undefined)
  return (
    <div className="series-plot-wrap" ref={wrapRef}>
      <div
        ref={ref}
        data-testid="series-plot"
        role="img"
        aria-label={`${title}: trajectory of ${points.length} measurement(s) over time${showAkiLegend ? ', with AKI markers' : ''}`}
      />
      {points.length > 0 && (
        <ul className="plot-legend">
          <li><span className="lg-swatch lg-measure" /> Measurement</li>
          {connect && <li><span className="lg-swatch lg-connect" /> Connecting line</li>}
          {trendLabel && <li><span className="lg-swatch lg-fit" /> {trendLabel}</li>}
          {showAkiLegend && <li><span className="lg-swatch lg-aki" /> AKI window / marker</li>}
        </ul>
      )}
      {akiLegendText && <p className="plot-aki-summary" title={akiSummary}>{akiLegendText}</p>}
    </div>
  )
}
