import { memo } from 'react'
import type { SeriesPoint } from '../../core/stats/series'
import type { LinePoint } from '../../core/stats/slopeLines'
import type { DateBand } from '../../core/aki/akiAware'
import type { ZoomLevel } from '../state/store'

interface Layout {
  width: number; height: number
  padL: number; padR: number; padT: number; padB: number
  markers: boolean; labels: boolean; axes: boolean; r: number
}

const LAYOUTS: Record<ZoomLevel, Layout> = {
  s: { width: 90, height: 24, padL: 2, padR: 2, padT: 2, padB: 2, markers: false, labels: false, axes: false, r: 0 },
  m: { width: 180, height: 56, padL: 4, padR: 34, padT: 4, padB: 14, markers: true, labels: true, axes: false, r: 1.8 },
  l: { width: 280, height: 140, padL: 36, padR: 36, padT: 6, padB: 20, markers: true, labels: true, axes: true, r: 2.5 },
}

export interface MiniSparklineProps {
  points: SeriesPoint[]
  zoom: ZoomLevel
  fitLines?: LinePoint[][]
  akiBands?: DateBand[]
  excludedIdx?: number[]
  events?: { date: Date; label: string }[]
  connect?: boolean
}

const fmtMonth = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

function fmtVal(v: number): string {
  const a = Math.abs(v)
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2)
}

/** Cohort-cell mini graph. Pure presentation: fit lines, AKI bands, and
 * excluded indices are precomputed in buildCohortRows. The red band marks only
 * the AKI exclusion window — the trajectory line itself stays blue. */
function MiniSparklineImpl({ points, zoom, fitLines = [], akiBands = [], excludedIdx = [], events = [], connect = true }: MiniSparklineProps) {
  const L = LAYOUTS[zoom]
  if (points.length < 2) {
    return <svg width={L.width} height={L.height} data-testid="mini-sparkline" data-zoom={zoom} role="img" aria-label="Trajectory sparkline: too few points to plot" />
  }

  const ariaLabel = `Trajectory sparkline: ${points.length} values from ${fmtMonth(points[0].date)} to ${fmtMonth(points[points.length - 1].date)}, last value ${fmtVal(points[points.length - 1].value)}${akiBands.length ? `, ${akiBands.length} AKI exclusion window(s)` : ''}`

  const xs = points.map((p) => p.date.getTime())
  const ys = points.map((p) => p.value)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const plotW = L.width - L.padL - L.padR
  const plotH = L.height - L.padT - L.padB
  const sx = (x: number) => (maxX === minX ? L.padL : ((x - minX) / (maxX - minX)) * plotW + L.padL)
  const sy = (y: number) => (maxY === minY ? L.padT + plotH / 2 : L.padT + plotH - ((y - minY) / (maxY - minY)) * plotH)

  const excluded = new Set(excludedIdx)
  const dpath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.date.getTime()).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ')
  const bands = akiBands
    .map((b) => ({ x1: Math.max(b.start.getTime(), minX), x2: Math.min(b.end.getTime(), maxX) }))
    .filter((b) => b.x2 > b.x1)
  const visibleEvents = events
    .map((event) => ({ ...event, time: event.date.getTime() }))
    .filter((event) => event.time >= minX && event.time <= maxX)
    .sort((a, b) => a.time - b.time)
  const last = points[points.length - 1]
  const showEventLabels = L.width >= 260

  return (
    <svg width={L.width} height={L.height} data-testid="mini-sparkline" data-zoom={zoom} className="mini-sparkline" role="img" aria-label={ariaLabel}><title>{ariaLabel}</title>
      {bands.map((b, i) => (
        <rect key={`b${i}`} data-testid="aki-band" x={sx(b.x1)} y={L.padT} width={sx(b.x2) - sx(b.x1)} height={plotH} fill="#ef4444" opacity={0.13} />
      ))}
      {fitLines.map((ln, i) => (
        <line key={`f${i}`} data-testid="fit-line" x1={sx(ln[0].date.getTime())} y1={sy(ln[0].value)} x2={sx(ln[1].date.getTime())} y2={sy(ln[1].value)} stroke="#dc2626" strokeWidth={1} strokeDasharray="3 2" />
      ))}
      {connect && <path d={dpath} fill="none" stroke="#2563eb" strokeWidth={1.2} />}
      {(L.markers || !connect) && points.map((p, i) => {
        const r = L.r || (connect ? 0 : 1.2) // ensure dots stay visible at zoom 's' when the line is hidden
        return excluded.has(i)
          ? <circle key={`p${i}`} data-testid="pt-excluded" cx={sx(p.date.getTime())} cy={sy(p.value)} r={r} fill="#fff" stroke="#dc2626" strokeWidth={1} />
          : <circle key={`p${i}`} data-testid="pt" cx={sx(p.date.getTime())} cy={sy(p.value)} r={r} fill="#2563eb" />
      })}
      {visibleEvents.map((event, i) => {
        const x = sx(event.time)
        const labelX = Math.min(x + 4, L.padL + plotW - 2)
        const labelAnchor = labelX === x + 4 ? 'start' : 'end'
        return (
          <g key={`e${i}`} data-testid="event-marker" className="sparkline-event-marker">
            <title>{`${event.label || 'Event'} · ${fmtDate(event.date)}`}</title>
            <line x1={x} y1={L.padT} x2={x} y2={L.padT + plotH} stroke="#7c3aed" strokeWidth={1.2} strokeDasharray="2 2" />
            {showEventLabels && event.label && (
              <text
                data-testid="event-label"
                x={labelX}
                y={L.padT + 10 + (i % 2) * 12}
                fontSize={9}
                fontWeight={600}
                fill="#5b21b6"
                textAnchor={labelAnchor}
              >
                {event.label}
              </text>
            )}
          </g>
        )
      })}
      {L.labels && (
        <>
          <text x={L.padL + plotW + 3} y={sy(last.value) + 3} fontSize={10} fontWeight={600} fill="#1e293b">{fmtVal(last.value)}</text>
          <text x={L.padL} y={L.height - 2} fontSize={8.5} fill="#94a3b8">{fmtMonth(points[0].date)}</text>
          <text x={L.padL + plotW} y={L.height - 2} fontSize={8.5} fill="#94a3b8" textAnchor="end">{fmtMonth(last.date)}</text>
        </>
      )}
      {L.axes && (
        <>
          <line data-testid="axis" x1={L.padL} y1={L.padT} x2={L.padL} y2={L.padT + plotH} stroke="#cbd5e1" />
          <line data-testid="axis" x1={L.padL} y1={L.padT + plotH} x2={L.padL + plotW} y2={L.padT + plotH} stroke="#cbd5e1" />
          <text x={L.padL - 4} y={sy(maxY) + 3} fontSize={9} fill="#64748b" textAnchor="end">{fmtVal(maxY)}</text>
          <text x={L.padL - 4} y={sy(minY) + 3} fontSize={9} fill="#64748b" textAnchor="end">{fmtVal(minY)}</text>
        </>
      )}
    </svg>
  )
}

/** Memoised: cohort cells keep stable point/line references across sort toggles
 * (the cell objects come from a memoised buildCohortRows), so re-sorting the
 * table no longer re-renders every sparkline. */
export const MiniSparkline = memo(MiniSparklineImpl)
