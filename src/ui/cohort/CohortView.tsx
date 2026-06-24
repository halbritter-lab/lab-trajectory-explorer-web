import { useMemo } from 'react'
import { useAppStore } from '../state/store'
import { buildCohortRows, cohortExportRecords, slopeUnit, EXPORT_DISCLAIMER_ROWS, type CohortSeriesSpec } from '../../core/cohort/screening'
import { rapidEgfrDeclineFlagForCell } from '../../core/analysis/rapidEgfrDeclineModule'
import { MiniSparkline } from '../charts/MiniSparkline'
import { CohortTrajectoryOverlay } from './CohortTrajectoryOverlay'
import { sheetsToXlsxBytes, downloadBlob, fileStamp } from '../../io/export'
import type { CkdEndpoints } from '../../core/endpoints/ckdEndpoints'

type CohortSortKey = 'id' | 'slope' | 'absSlope' | 'n' | 'duration'
type CohortBadge = { className: string; label: string; title: string }

function endpointBadge(endpoints: CkdEndpoints, hasFit: boolean): { label: string; title: string } | null {
  const labelParts: string[] = []
  const titleParts: string[] = []
  const decline = endpoints.percentDecline.value
  if (hasFit && decline !== null) {
    const change = -decline
    labelParts.push(`${change > 0 ? '+' : ''}${change.toFixed(0)}%`)
    titleParts.push(`total eGFR change ${change.toFixed(1)}% from baseline (not per year)`)
  }
  if (endpoints.observedCkdG5.met) {
    labelParts.push('CKD G5')
    const confirmed = endpoints.observedCkdG5.confirmedDate?.toISOString().slice(0, 10)
    titleParts.push(confirmed ? `observed CKD G5 confirmed ${confirmed}` : 'observed CKD G5')
  } else if (hasFit && endpoints.projectedAgeToCkdG5.value !== null) {
    const age = endpoints.projectedAgeToCkdG5.value
    labelParts.push(`G5 @ ${age.toFixed(1)}y`)
    titleParts.push(`projected age to CKD G5 ${age.toFixed(1)} years`)
  }
  return labelParts.length > 0 ? { label: labelParts.join(' · '), title: titleParts.join(' · ') } : null
}

function visibleBadges(badges: CohortBadge[]): CohortBadge[] {
  if (badges.length <= 3) return badges
  const shown = badges.slice(0, 3)
  const hidden = badges.slice(3)
  return [
    ...shown,
    {
      className: 'more-badge',
      label: `+${hidden.length}`,
      title: hidden.map((badge) => `${badge.label}: ${badge.title}`).join(' · '),
    },
  ]
}

export function CohortView() {
  const analysisResult = useAppStore((s) => s.analysisResult())
  const displayRows = analysisResult.rows
  const configs = useAppStore((s) => s.seriesConfigs)
  const events = useAppStore((s) => s.events)
  const showEvents = useAppStore((s) => s.showEvents)
  const cohortPatientMode = useAppStore((s) => s.cohortPatientMode)
  const selectedPatientIds = useAppStore((s) => s.selectedPatientIds)
  const zoom = useAppStore((s) => s.cohortZoom)
  const connectPoints = useAppStore((s) => s.connectPoints)
  const showAki = useAppStore((s) => s.showAki)
  const sort = useAppStore((s) => s.cohortSort)
  const setCohortSort = useAppStore((s) => s.setCohortSort)
  const displayMode = useAppStore((s) => s.cohortDisplayMode)
  const setDisplayMode = useAppStore((s) => s.setCohortDisplayMode)
  const selectPatient = useAppStore((s) => s.selectPatient)
  const setView = useAppStore((s) => s.setView)
  const setReturnToCohort = useAppStore((s) => s.setReturnToCohort)
  const rapidThreshold = useAppStore((s) => s.analysisSettings.rapidEgfrDecline.threshold)

  const clinicalEventsByPatient = useMemo(() => {
    const grouped: Record<number, typeof events> = {}
    for (const event of events) {
      grouped[event.patientId] = [...(grouped[event.patientId] ?? []), event]
    }
    return grouped
  }, [events])

  const specs: CohortSeriesSpec[] = useMemo(
    () => configs.filter((c) => c.bezeichnung).map((c) => ({
      bezeichnung: c.bezeichnung as string,
      einheit: c.einheit,
      mode: c.mode,
      gapDays: c.gapDays,
      windowDays: c.windowDays,
      stepDays: c.stepDays,
      cutoffDays: c.cutoffDays,
      exclusionDays: c.exclusionDays,
      fitConfig: c.fitConfig,
      fitInputs: analysisResult.fitInputs,
      clinicalEventsByPatient,
    })),
    [configs, clinicalEventsByPatient, analysisResult.fitInputs],
  )
  const patientIds = useMemo(() => {
    const all = [...new Set(displayRows.map((r) => r.patientId))].sort((a, b) => a - b)
    return cohortPatientMode === 'selected' ? all.filter((id) => selectedPatientIds.includes(id)) : all
  }, [displayRows, cohortPatientMode, selectedPatientIds])
  const cohortRows = useMemo(() => buildCohortRows(displayRows, patientIds, specs), [displayRows, patientIds, specs])
  const eventsByPatient = useMemo(() => {
    const grouped = new Map<number, { date: Date; label: string }[]>()
    for (const event of events) {
      const patientEvents = grouped.get(event.patientId) ?? []
      patientEvents.push({ date: event.date, label: event.title })
      grouped.set(event.patientId, patientEvents)
    }
    for (const patientEvents of grouped.values()) patientEvents.sort((a, b) => a.date.getTime() - b.date.getTime())
    return grouped
  }, [events])

  const sorted = useMemo(() => {
    const metric = (r: (typeof cohortRows)[number]): number => {
      if (sort.key === 'id') return r.patientId
      const c = r.cells[sort.seriesIndex ?? 0]
      if (!c) return Number.NEGATIVE_INFINITY
      switch (sort.key) {
        case 'slope': return c.slope
        case 'absSlope': return Math.abs(c.slope)
        case 'n': return c.nNumeric
        case 'duration': return c.spanDays
      }
    }
    const out = [...cohortRows]
    out.sort((a, b) => {
      const va = metric(a), vb = metric(b)
      const na = Number.isNaN(va), nb = Number.isNaN(vb)
      if (na && nb) return 0
      if (na) return 1
      if (nb) return -1
      return sort.dir === 'desc' ? vb - va : va - vb
    })
    return out
  }, [cohortRows, sort])

  function exportXlsx() {
    const workbook = sheetsToXlsxBytes([
      { name: 'cohort', rows: cohortExportRecords(sorted, rapidThreshold) },
      { name: 'about', rows: EXPORT_DISCLAIMER_ROWS },
    ])
    downloadBlob(workbook, `cohort-summary-${fileStamp()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  if (specs.length === 0) return <p className="empty-state">Pick at least one series above to populate the cohort table.</p>

  function seriesLabel(s: CohortSeriesSpec): string {
    return s.einheit ? `${s.bezeichnung} (${s.einheit})` : s.bezeichnung
  }

  function ariaSort(active: boolean): 'ascending' | 'descending' | 'none' {
    if (!active) return 'none'
    return sort.dir === 'desc' ? 'descending' : 'ascending'
  }

  function setSeriesSort(seriesIndex: number, key: CohortSortKey) {
    if (key === 'id') return
    setCohortSort({ key, dir: sort.dir, seriesIndex })
  }

  function toggleSeriesSortDirection(seriesIndex: number) {
    const active = sort.key !== 'id' && sort.seriesIndex === seriesIndex
    setCohortSort({
      key: active ? sort.key : 'absSlope',
      dir: active && sort.dir === 'desc' ? 'asc' : 'desc',
      seriesIndex,
    })
  }

  return (
    <>
      <div className="cohort-view-controls">
        <div className="segmented" aria-label="Cohort display mode">
          <button aria-pressed={displayMode === 'table'} onClick={() => setDisplayMode('table')}>Table</button>
          <button aria-pressed={displayMode === 'overlay'} onClick={() => setDisplayMode('overlay')}>Overlay Plot</button>
        </div>
      </div>
      {displayMode === 'overlay' ? (
        <CohortTrajectoryOverlay />
      ) : (
        <>
          <div className="cohort-exports">
            <button title="Workbook: one row per patient × series (slope with unit, R², CI, AKI) + disclaimer" onClick={exportXlsx}>Export cohort (xlsx)</button>
          </div>
          <div className="cohort-card">
            <table className="cohort-table">
              <thead>
                <tr>
                  <th aria-sort={ariaSort(sort.key === 'id')}>
                    <span className="cohort-header-main">
                      <span>Patient</span>
                      <button
                        className="cohort-sort-button"
                        aria-label={`Sort by patient ID ${sort.key === 'id' && sort.dir === 'asc' ? 'descending' : 'ascending'}`}
                        title="Sort by patient ID"
                        onClick={() => setCohortSort({ key: 'id', dir: sort.key === 'id' && sort.dir === 'asc' ? 'desc' : 'asc' })}
                      >
                        {sort.key === 'id' ? (sort.dir === 'desc' ? '↓' : '↑') : '↕'}
                      </button>
                    </span>
                  </th>
                  {specs.map((s, i) => {
                    const label = seriesLabel(s)
                    const active = sort.key !== 'id' && sort.seriesIndex === i
                    return (
                      <th key={i} aria-sort={ariaSort(active)}>
                        <span className="cohort-header-main">
                          <span>{label}</span>
                          <span className="cohort-sort-inline">
                            <select
                              aria-label={`Sort ${label} by`}
                              value={active ? sort.key : 'absSlope'}
                              onChange={(e) => setSeriesSort(i, e.target.value as CohortSortKey)}
                            >
                              <option value="absSlope">Steepest</option>
                              <option value="slope">Slope</option>
                              <option value="n">#</option>
                              <option value="duration">Span</option>
                            </select>
                            <button
                              className="cohort-sort-button"
                              aria-label={`Sort ${label} ${active && sort.dir === 'desc' ? 'ascending' : 'descending'}`}
                              title={`Sort ${label} ${active && sort.dir === 'desc' ? 'ascending' : 'descending'}`}
                              onClick={() => toggleSeriesSortDirection(i)}
                            >
                              {active ? (sort.dir === 'desc' ? '↓' : '↑') : '↕'}
                            </button>
                          </span>
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.patientId}>
                    <td><button className="patient-link" onClick={() => { selectPatient(r.patientId); setReturnToCohort(true); setView('one') }}>{r.patientId}</button></td>
                    {r.cells.map((c, i) => {
                      const badges: CohortBadge[] = []
                      if (rapidEgfrDeclineFlagForCell({
                        patientId: r.patientId,
                        bezeichnung: c.bezeichnung,
                        einheit: c.einheit,
                        slope: c.slope,
                        threshold: rapidThreshold,
                      })) {
                        badges.push({
                          className: 'rapid-badge',
                          label: 'rapid ↓',
                          title: `Rapid eGFR decline: faster than ${rapidThreshold} mL/min/1.73m²/yr (KDIGO rapid progression)`,
                        })
                      }
                      const endpoint = endpointBadge(c.endpoints, Number.isFinite(c.slope))
                      if (endpoint) badges.push({ className: 'endpoint-badge', ...endpoint })
                      if (showAki && c.akiChip) badges.push({ className: 'aki-badge', label: c.akiChip, title: c.akiSummary })
                      return (
                        <td key={i}>
                          <div className={`cell-cluster cell-cluster-${zoom}`} data-zoom={zoom}>
                            <MiniSparkline
                              points={c.points}
                              zoom={zoom}
                              fitLines={c.fitLines}
                              akiBands={showAki ? c.akiBands : []}
                              excludedIdx={c.excludedIdx}
                              events={showEvents ? eventsByPatient.get(r.patientId) ?? [] : []}
                              connect={connectPoints}
                            />
                            <span
                              className="cell-slope"
                              title={Number.isNaN(c.slope) ? undefined : `Slope ${c.slope.toFixed(3)} ${slopeUnit(c.einheit)} · R²=${c.r2.toFixed(2)} · 95% CI [${c.ciLow.toFixed(3)}, ${c.ciHigh.toFixed(3)}]`}
                            >
                              {Number.isNaN(c.slope) ? '—' : `${c.slope.toFixed(2)}/yr`}
                            </span>
                            {badges.length > 0 && (
                              <span className="cell-badges" aria-label="Cohort cell flags">
                                {visibleBadges(badges).map((badge, idx) => (
                                  <span key={`${badge.className}-${idx}`} className={badge.className} title={badge.title}>{badge.label}</span>
                                ))}
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
