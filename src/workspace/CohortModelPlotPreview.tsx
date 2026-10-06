import { useId, useMemo, useRef } from 'react'
import type { PatientGroup } from '../core/grouping/grouping'
import type { StoredMixedModelResult } from './state/store'
import { mixedModelMeanLinePoints } from '../core/mixedModel/resultIdentity'
import type { MixedModelSpikeRow } from '../core/mixedModel/types'
import { ChartExportActions } from './WorkspaceExports'
import { formatWorkspaceNumber } from './WorkspacePlot'

interface Props {
  parameterLabel: string
  parameterUnit: string | null
  spikeRows: MixedModelSpikeRow[]
  groups: PatientGroup[]
  groupColors: Map<string, string>
  groupValuesByPatient: Map<string, string>
  cohortModelResults: Record<string, StoredMixedModelResult> | null
  modelRowsByEntity: Record<string, MixedModelSpikeRow[]>
  isFitting?: boolean
  onFit?: () => void
}

const FALLBACK_LINE_COLOR = '#0f172a'
const FALLBACK_POINT_COLOR = '#64748b'

export function CohortModelPlotPreview({
  parameterLabel,
  parameterUnit,
  spikeRows,
  groups,
  groupColors,
  groupValuesByPatient,
  cohortModelResults,
  modelRowsByEntity,
  isFitting,
  onFit,
}: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const clipId = useId().replace(/:/g, '')

  // Calculate coordinates and bounds
  const { points, fittedLines, xDomain, yDomain, slopeBadges } = useMemo(() => {
    const rawPoints = spikeRows.map(r => ({
      patientId: r.patient_id,
      time: r.time_since_baseline,
      value: r.value,
      group: groupValuesByPatient.get(r.patient_id) ?? null,
    }))

    let maxX = 1
    let minY = rawPoints.length ? Infinity : 0
    let maxY = rawPoints.length ? -Infinity : 100
    for (const point of rawPoints) {
      maxX = Math.max(maxX, point.time)
      minY = Math.min(minY, point.value)
      maxY = Math.max(maxY, point.value)
    }

    // Add fitted line endpoints to domain
    const lines: Array<{ key: string; label: string; color: string; points: Array<{ x: number; y: number }>; slope?: number }> = []
    const badges: Array<{ label: string; slope: number; color: string }> = []

    if (cohortModelResults) {
      // 1. Whole cohort
      const cohortResult = cohortModelResults['cohort']
      if (cohortResult?.result.status === 'success' && cohortResult.result.converged && !cohortResult.result.singular) {
        const linePoints = mixedModelMeanLinePoints(cohortResult.result, modelRowsByEntity.cohort ?? [])
        if (linePoints.length >= 2) {
          const p1 = { x: linePoints[0].time_since_baseline, y: linePoints[0].value }
          const p2 = { x: linePoints[linePoints.length - 1].time_since_baseline, y: linePoints[linePoints.length - 1].value }
          const slope = cohortResult.result.fixedEffects.timeSinceBaseline
          lines.push({
            key: 'cohort',
            label: 'Whole cohort',
            color: FALLBACK_LINE_COLOR,
            points: [p1, p2],
            slope,
          })
          badges.push({ label: 'Whole cohort', slope, color: FALLBACK_LINE_COLOR })
          minY = Math.min(minY, p1.y, p2.y)
          maxY = Math.max(maxY, p1.y, p2.y)
          maxX = Math.max(maxX, p2.x)
        }
      }

      // 2. Groups
      for (const group of groups) {
        const groupKey = `group:${group.value}`
        const groupResult = cohortModelResults[groupKey]
        if (groupResult?.result.status === 'success' && groupResult.result.converged && !groupResult.result.singular) {
          const groupSpikeRows = modelRowsByEntity[groupKey] ?? []
          const linePoints = mixedModelMeanLinePoints(groupResult.result, groupSpikeRows)
          if (linePoints.length >= 2) {
            const p1 = { x: linePoints[0].time_since_baseline, y: linePoints[0].value }
            const p2 = { x: linePoints[linePoints.length - 1].time_since_baseline, y: linePoints[linePoints.length - 1].value }
            const slope = groupResult.result.fixedEffects.timeSinceBaseline
            const color = groupColors.get(group.value) ?? FALLBACK_POINT_COLOR
            lines.push({
              key: groupKey,
              label: group.value,
              color,
              points: [p1, p2],
              slope,
            })
            badges.push({ label: group.value, slope, color })
            minY = Math.min(minY, p1.y, p2.y)
            maxY = Math.max(maxY, p1.y, p2.y)
            maxX = Math.max(maxX, p2.x)
          }
        }
      }
    }

    // Add 10% padding on Y
    const yPad = (maxY - minY) * 0.1 || 5
    return {
      points: rawPoints,
      fittedLines: lines,
      xDomain: { min: 0, max: Math.ceil(maxX * 10) / 10 },
      yDomain: { min: Math.floor((minY - yPad) * 10) / 10, max: Math.ceil((maxY + yPad) * 10) / 10 },
      slopeBadges: badges,
    }
  }, [spikeRows, groups, groupColors, groupValuesByPatient, cohortModelResults, modelRowsByEntity])

  const W = 680
  const H = 240
  const padLeft = 60
  const padRight = 20
  const padTop = 24
  const padBottom = 34

  const xRange = W - padLeft - padRight
  const yRange = H - padTop - padBottom

  const scaleX = (val: number) => padLeft + ((val - xDomain.min) / (xDomain.max - xDomain.min || 1)) * xRange
  const scaleY = (val: number) => padTop + yRange - ((val - yDomain.min) / (yDomain.max - yDomain.min || 1)) * yRange

  const yTicks = [yDomain.min, (yDomain.min + yDomain.max) / 2, yDomain.max]
  const xTicks = [0, xDomain.max / 2, xDomain.max]

  const unitLabel = parameterUnit ? ` [${parameterUnit}]` : ''
  const hasFits = fittedLines.length > 0

  return (
    <div className="cm-plot-card card">
      <div className="cm-plot-header">
        <div>
          <h3>Model Trajectory Preview</h3>
          <p className="muted">
            {parameterLabel}{unitLabel} over time (years since baseline).
            {hasFits ? ' Dashed lines show fitted reference profiles: numeric factors at fitted centers, categorical factors at reference levels.' : ' Run model to estimate slope.'}
          </p>
        </div>
        <div className="cm-plot-actions">
          <ChartExportActions getSvg={() => svg.current} title={`Model trajectory · ${parameterLabel}${unitLabel}`} />
          {slopeBadges.map(b => (
            <span key={b.label} className="cm-slope-badge" style={{ borderColor: b.color }}>
              <span className="cm-badge-swatch" style={{ background: b.color }} />
              <strong>{b.label}:</strong> {formatWorkspaceNumber(b.slope)} {parameterUnit ? `${parameterUnit}/yr` : '/yr'}
            </span>
          ))}
          {!hasFits && onFit && (
            <button type="button" className="primary" onClick={onFit} disabled={isFitting}>
              {isFitting ? 'Fitting model …' : '▶ Fit model'}
            </button>
          )}
        </div>
      </div>

      <div className="cm-plot-svg-wrap">
        <svg
          ref={svg}
          data-export-context="Years since baseline; reference profiles at fitted numeric centers and categorical reference levels; only current converged non-singular fits are shown"
          data-export-legend={JSON.stringify(fittedLines.map(line => ({ label: line.label, color: line.color })))}
          className="cm-plot-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Model trajectory preview for ${parameterLabel}`}
        >
          <title>{`Cohort trajectory: ${spikeRows.length} points across ${new Set(spikeRows.map(r => r.patient_id)).size} patients`}</title>
          <defs>
            <clipPath id={clipId}>
              <rect x={padLeft} y={padTop} width={xRange} height={yRange} />
            </clipPath>
          </defs>

          {/* Grid lines & Axes */}
          {yTicks.map((yVal, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={scaleY(yVal)}
                y2={scaleY(yVal)}
                stroke="#e2e8f0"
                strokeDasharray="2 3"
              />
              <text
                x={padLeft - 8}
                y={scaleY(yVal) + 4}
                textAnchor="end"
                className="cm-axis-text"
              >
                {formatWorkspaceNumber(yVal)}
              </text>
            </g>
          ))}

          {xTicks.map((xVal, i) => (
            <g key={i}>
              <line
                x1={scaleX(xVal)}
                x2={scaleX(xVal)}
                y1={padTop}
                y2={H - padBottom}
                stroke="#e2e8f0"
                strokeDasharray="2 3"
              />
              <text
                x={scaleX(xVal)}
                y={H - padBottom + 18}
                textAnchor="middle"
                className="cm-axis-text"
              >
                {formatWorkspaceNumber(xVal)}y
              </text>
            </g>
          ))}

          {/* Axis border */}
          <rect
            x={padLeft}
            y={padTop}
            width={xRange}
            height={yRange}
            fill="none"
            stroke="#cbd5e1"
          />

          {/* Raw Points (clipped) */}
          <g clipPath={`url(#${clipId})`}>
            {points.map((p, i) => {
              const color = p.group ? groupColors.get(p.group) ?? FALLBACK_POINT_COLOR : FALLBACK_POINT_COLOR
              return (
                <circle
                  key={i}
                  cx={scaleX(p.time)}
                  cy={scaleY(p.value)}
                  r={3.2}
                  fill={color}
                  fillOpacity={0.35}
                  stroke={color}
                  strokeWidth={0.8}
                >
                  <title>{`Patient ${p.patientId}: ${formatWorkspaceNumber(p.value)}${parameterUnit ? ` ${parameterUnit}` : ''} at ${formatWorkspaceNumber(p.time)}y`}</title>
                </circle>
              )
            })}

            {/* Fitted Mean Lines */}
            {fittedLines.map(line => (
              <polyline
                key={line.key}
                points={line.points.map(p => `${scaleX(p.x)},${scaleY(p.y)}`).join(' ')}
                fill="none"
                stroke={line.color}
                strokeWidth={line.key === 'cohort' ? 3.5 : 2.8}
                strokeDasharray="8 4"
              >
                <title>{`${line.label} fitted trajectory (slope: ${line.slope !== undefined ? formatWorkspaceNumber(line.slope) : '—'})`}</title>
              </polyline>
            ))}
          </g>

          {/* If no fit yet, centered hint */}
          {!hasFits && (
            <g>
              <rect
                x={padLeft + xRange / 2 - 130}
                y={padTop + yRange / 2 - 16}
                width={260}
                height={32}
                rx={6}
                fill="white"
                fillOpacity={0.92}
                stroke="#cbd5e1"
              />
              <text
                x={padLeft + xRange / 2}
                y={padTop + yRange / 2 + 5}
                textAnchor="middle"
                className="cm-watermark-text"
              >
                Click 'Fit model' to calculate trajectory
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
