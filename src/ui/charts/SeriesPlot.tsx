import { useEffect, useRef, useState } from 'react'
import * as Plot from '@observablehq/plot'
import type { LabRow } from '../../core/types'
import type { SeriesPoint } from '../../core/stats/series'
import { buildSlopeLines, type PlotModeConfig } from '../../core/stats/slopeLines'
import { findKdigoAkiEpisodes } from '../../core/aki/kdigo'
import type { AkiEpisode } from '../../core/aki/kdigo'
import { akiExclusionBands, fitAkiAware } from '../../core/aki/akiAware'
import { formatAkiChip, formatAkiEpisodeSummary } from '../../core/aki/summary'

export interface SeriesPlotProps {
  title: string
  rows: LabRow[] // rows for this (patient, bezeichnung, einheit), any operator
  cfg: PlotModeConfig
  computed?: boolean
  annotations?: { date: Date; label: string }[]
  showAki?: boolean
  creatinine?: boolean
  episodes?: AkiEpisode[] // precomputed (cross-series) episodes for aki-aware mode
  connect?: boolean // draw a line joining consecutive measurements
}

export function SeriesPlot({ title, rows, cfg, computed = false, annotations, showAki = false, creatinine = false, episodes, connect = true }: SeriesPlotProps) {
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

  const anns = annotations ?? []
  const annKey = JSON.stringify(anns.map((a) => [a.date.getTime(), a.label]))
  const legendEpisodes = showAki && points.length > 0
    ? (episodes ?? (creatinine ? findKdigoAkiEpisodes(points) : []))
    : []
  const akiStages = legendEpisodes.map((e) => e.stage)
  const akiSummary = formatAkiEpisodeSummary(akiStages)
  const akiLegendText = akiStages.length > 0 ? formatAkiChip(akiStages).replace(/^AKI /, 'AKI episodes: ') : ''

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
    const akiEps = cfg.mode === 'aki-aware' ? (episodes ?? (creatinine ? findKdigoAkiEpisodes(points) : [])) : undefined
    const lines = buildSlopeLines(points, cfg, akiEps)

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
    lines.forEach((ln) => marks.push(Plot.line(ln, { x: 'date', y: 'value', stroke: 'tomato', strokeDasharray: '4 3' })))

    // AKI episode overlay. Computed/non-creatinine series can pass
    // creatinine-derived episodes explicitly for cross-series display.
    if (showAki && (creatinine || episodes !== undefined) && points.length > 0) {
      const overlayEpisodes = episodes ?? (cfg.mode === 'aki-aware' ? (akiEps ?? []) : findKdigoAkiEpisodes(points))
      if (overlayEpisodes.length > 0) {
        const exDays = cfg.exclusionDays ?? 30
        akiExclusionBands(overlayEpisodes, exDays).forEach((b) =>
          marks.unshift(Plot.rect([b], { x1: 'start', x2: 'end', fill: '#ef4444', fillOpacity: 0.12 })),
        )
        const sortedPts = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
        const keptSet = new Set(fitAkiAware(sortedPts, exDays, overlayEpisodes).keptIdx)
        const excludedPts = sortedPts.filter((_, i) => !keptSet.has(i))
        if (excludedPts.length > 0) {
          marks.push(Plot.dot(excludedPts, { x: 'date', y: 'value', stroke: '#dc2626', fill: 'white', r: 3 }))
        }
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

    // Annotation rules
    anns.forEach((a) => marks.push(Plot.ruleX([a.date], { stroke: '#666', strokeDasharray: '2 2' })))
    if (anns.length > 0 && anns.length <= 12) {
      const labeled = anns.filter((a) => a.label)
      if (labeled.length > 0) {
        marks.push(
          Plot.text(labeled, {
            x: 'date',
            y: () => 0,
            text: 'label',
            frameAnchor: 'top',
            rotate: -90,
            dx: -4,
            fontSize: 8,
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
      x: { label: 'Date' },
      y: { label: 'Value', grid: true },
      marks,
    })
    el.replaceChildren(fig)

    if (computed) {
      const cap = document.createElement('p')
      cap.textContent = 'Computed from creatinine × demographics — not for clinical decision-making.'
      cap.style.cssText = 'font-size:11px;color:#7b8794;margin:.25rem 0 0'
      el.append(cap)
    }

    return () => fig.remove()
  }, [title, width, cfg.mode, cfg.gapDays, cfg.windowDays, cfg.stepDays, cfg.exclusionDays, computed, connect, JSON.stringify(points.map((p) => [p.date.getTime(), p.value])), annKey, showAki, creatinine, JSON.stringify((episodes ?? []).map((e) => e.date.getTime()))])

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
          <li><span className="lg-swatch lg-fit" /> Trend (OLS fit)</li>
          {showAkiLegend && <li><span className="lg-swatch lg-aki" /> AKI window / marker</li>}
        </ul>
      )}
      {akiLegendText && <p className="plot-aki-summary" title={akiSummary}>{akiLegendText}</p>}
    </div>
  )
}
