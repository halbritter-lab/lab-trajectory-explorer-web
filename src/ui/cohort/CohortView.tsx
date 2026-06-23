import { useMemo } from 'react'
import { useAppStore } from '../state/store'
import { buildCohortRows, cohortExportRecords, slopeUnit, EXPORT_DISCLAIMER_ROWS, type CohortSeriesSpec } from '../../core/cohort/screening'
import { rapidEgfrDeclineFlagForCell } from '../../core/analysis/rapidEgfrDeclineModule'
import { MiniSparkline } from '../charts/MiniSparkline'
import { sheetsToXlsxBytes, downloadBlob, fileStamp } from '../../io/export'

type CohortSortKey = 'id' | 'slope' | 'absSlope' | 'n' | 'duration'

export function CohortView() {
  const analysisResult = useAppStore((s) => s.analysisResult())
  const displayRows = analysisResult.rows
  const configs = useAppStore((s) => s.seriesConfigs)
  const annotations = useAppStore((s) => s.annotations)
  const cohortPatientMode = useAppStore((s) => s.cohortPatientMode)
  const selectedPatientIds = useAppStore((s) => s.selectedPatientIds)
  const zoom = useAppStore((s) => s.cohortZoom)
  const connectPoints = useAppStore((s) => s.connectPoints)
  const showAki = useAppStore((s) => s.showAki)
  const sort = useAppStore((s) => s.cohortSort)
  const setCohortSort = useAppStore((s) => s.setCohortSort)
  const selectPatient = useAppStore((s) => s.selectPatient)
  const setView = useAppStore((s) => s.setView)
  const setReturnToCohort = useAppStore((s) => s.setReturnToCohort)
  const rapidThreshold = useAppStore((s) => s.analysisSettings.rapidEgfrDecline.threshold)

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
      fitInputs: analysisResult.fitInputs,
      eventDatesByPatient: Object.fromEntries(
        [...new Set(annotations.map((a) => a.patientId))]
          .map((pid) => [pid, annotations.filter((a) => a.patientId === pid && a.referenceDate).map((a) => a.referenceDate as Date)]),
      ),
    })),
    [configs, annotations, analysisResult.fitInputs],
  )
  const patientIds = useMemo(() => {
    const all = [...new Set(displayRows.map((r) => r.patientId))].sort((a, b) => a - b)
    return cohortPatientMode === 'selected' ? all.filter((id) => selectedPatientIds.includes(id)) : all
  }, [displayRows, cohortPatientMode, selectedPatientIds])
  const cohortRows = useMemo(() => buildCohortRows(displayRows, patientIds, specs), [displayRows, patientIds, specs])

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
            {r.cells.map((c, i) => (
              <td key={i}>
                <div className="cell-cluster">
                  <MiniSparkline points={c.points} zoom={zoom} fitLines={c.fitLines} akiBands={showAki ? c.akiBands : []} excludedIdx={c.excludedIdx} connect={connectPoints} />
                  <span
                    className="cell-slope"
                    title={Number.isNaN(c.slope) ? undefined : `Slope ${c.slope.toFixed(3)} ${slopeUnit(c.einheit)} · R²=${c.r2.toFixed(2)} · 95% CI [${c.ciLow.toFixed(3)}, ${c.ciHigh.toFixed(3)}]`}
                  >
                    {Number.isNaN(c.slope) ? '—' : `${c.slope.toFixed(2)}/yr`}
                  </span>
                  {rapidEgfrDeclineFlagForCell({
                    patientId: r.patientId,
                    bezeichnung: c.bezeichnung,
                    einheit: c.einheit,
                    slope: c.slope,
                    threshold: rapidThreshold,
                  }) && (
                    <span className="rapid-badge" title={`Rapid eGFR decline: faster than ${rapidThreshold} mL/min/1.73m²/yr (KDIGO rapid progression)`}>rapid ↓</span>
                  )}
                  {showAki && c.akiChip && <span className="aki-badge" title={c.akiSummary}>{c.akiChip}</span>}
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
        </table>
      </div>
    </>
  )
}
