import { lazy, Suspense, useMemo } from 'react'
import { useAppStore } from '../state/store'
import { buildCohortRows, cohortExportRecords, slopeUnit, EXPORT_DISCLAIMER_ROWS, type CohortSeriesSpec } from '../../core/cohort/screening'
import { isEgfrUnit, rapidEgfrDeclineFlagForCell } from '../../core/analysis/rapidEgfrDeclineModule'
import { MiniSparkline } from '../charts/MiniSparkline'
import { CohortTrajectoryOverlay } from './CohortTrajectoryOverlay'
import { sheetsToXlsxBytes, downloadBlob, fileStamp } from '../../io/export'
import type { CkdEndpoints } from '../../core/endpoints/ckdEndpoints'
import { comparePatientIds, patientIdKey } from '../../core/types'
import { patientAttributesExportRows } from '../../core/attributes/attributes'
import { groupColors, groupPatients } from '../../core/grouping/grouping'
import { mixedModelRowsFromCohortInputs } from '../../core/mixedModel/cohortDataset'
import {
  mixedModelConfigLabel,
  mixedModelFormula,
  validateMixedModelConfig,
  type MixedModelConfig,
} from '../../core/mixedModel/config'
import { mixedModelFitConfigHash } from '../../core/mixedModel/resultIdentity'
import { validateMixedModelRows } from '../../core/mixedModel/validation'

type CohortSortKey = 'id' | 'slope' | 'absSlope' | 'n' | 'duration'
type CohortBadge = { className: string; label: string; title: string }

const CohortModelPanel = lazy(() =>
  import('./CohortModelPanel').then((module) => ({ default: module.CohortModelPanel })),
)

const MIXED_MODEL_DATA_POLICY_TEXT =
  'Uses selected patients, active series, clinical event censoring, AKI exclusions, and time balancing.'

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

function slopeTitle(c: { slope: number; r2: number; ciLow: number; ciHigh: number; einheit: string | null }): string | undefined {
  if (Number.isNaN(c.slope)) return undefined
  const parts = [
    `Slope ${c.slope.toFixed(3)} ${slopeUnit(c.einheit)}`,
    Number.isFinite(c.r2) ? `R²=${c.r2.toFixed(2)}` : null,
    Number.isFinite(c.ciLow) && Number.isFinite(c.ciHigh)
      ? `95% CI [${c.ciLow.toFixed(3)}, ${c.ciHigh.toFixed(3)}]`
      : null,
  ]
  return parts.filter((part): part is string => part !== null).join(' · ')
}

export function CohortView() {
  const analysisResult = useAppStore((s) => s.analysisResult())
  const displayRows = analysisResult.rows
  const configs = useAppStore((s) => s.seriesConfigs)
  const events = useAppStore((s) => s.events)
  const patientAttributes = useAppStore((s) => s.patientAttributes)
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
  const mixedModelConfig = useAppStore((s) => s.mixedModelConfig)
  const setMixedModelConfig = useAppStore((s) => s.setMixedModelConfig)
  const mixedModelDialogOpen = useAppStore((s) => s.mixedModelDialogOpen)
  const setMixedModelDialogOpen = useAppStore((s) => s.setMixedModelDialogOpen)
  const groupByAttribute = useAppStore((s) => s.cohortGroupByAttribute)
  const setGroupByAttribute = useAppStore((s) => s.setCohortGroupByAttribute)

  const clinicalEventsByPatient = useMemo(() => {
    const grouped: Record<string, typeof events> = {}
    for (const event of events) {
      const key = patientIdKey(event.patientId)
      grouped[key] = [...(grouped[key] ?? []), event]
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
    const all = [...new Set(displayRows.map((r) => r.patientId))].sort(comparePatientIds)
    return cohortPatientMode === 'selected' ? all.filter((id) => selectedPatientIds.includes(id)) : all
  }, [displayRows, cohortPatientMode, selectedPatientIds])
  const availableGroupByAttributes = useMemo(() => {
    const cohortKeys = new Set(patientIds.map(patientIdKey))
    const names = new Set<string>()
    for (const [key, attributes] of Object.entries(patientAttributes)) {
      if (!cohortKeys.has(key)) continue
      for (const name of Object.keys(attributes)) names.add(name)
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [patientAttributes, patientIds])
  const groupingActive = groupByAttribute !== null
  // Always include the active attribute so the current grouping stays selectable
  // (and clearable to "No grouping") even if the cohort scope no longer exposes
  // it as an available attribute.
  const groupByOptions = useMemo(() => {
    const names = new Set(availableGroupByAttributes)
    if (groupByAttribute) names.add(groupByAttribute)
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [availableGroupByAttributes, groupByAttribute])
  const cohortRows = useMemo(
    () => buildCohortRows(displayRows, patientIds, specs, groupByAttribute, patientAttributes)
      .filter((row) => row.cells.some((cell) => cell.points.length >= 2)),
    [displayRows, patientIds, specs, groupByAttribute, patientAttributes],
  )
  const eventsByPatient = useMemo(() => {
    const grouped = new Map<string, { date: Date; label: string }[]>()
    for (const event of events) {
      const key = patientIdKey(event.patientId)
      const patientEvents = grouped.get(key) ?? []
      patientEvents.push({ date: event.date, label: event.title })
      grouped.set(key, patientEvents)
    }
    for (const patientEvents of grouped.values()) patientEvents.sort((a, b) => a.date.getTime() - b.date.getTime())
    return grouped
  }, [events])

  const sorted = useMemo(() => {
    const metric = (r: (typeof cohortRows)[number]): number => {
      if (sort.key === 'id') return 0
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
      if (sort.key === 'id') return sort.dir === 'desc' ? comparePatientIds(b.patientId, a.patientId) : comparePatientIds(a.patientId, b.patientId)
      const na = Number.isNaN(va), nb = Number.isNaN(vb)
      if (na && nb) return 0
      if (na) return 1
      if (nb) return -1
      return sort.dir === 'desc' ? vb - va : va - vb
    })
    return out
  }, [cohortRows, sort])
  const mixedModelSeriesIndex = useMemo(
    () => specs.findIndex((spec) => spec.bezeichnung.toLowerCase().includes('egfr') || isEgfrUnit(spec.einheit)),
    [specs],
  )
  const mixedModelRows = useMemo(
    () => mixedModelSeriesIndex >= 0
      ? mixedModelRowsFromCohortInputs(displayRows, patientIds, specs[mixedModelSeriesIndex])
      : [],
    [displayRows, patientIds, specs, mixedModelSeriesIndex],
  )
  const mixedModelSeriesKey = useMemo(() => {
    if (mixedModelSeriesIndex < 0) return ''
    const spec = specs[mixedModelSeriesIndex]
    return `${spec.bezeichnung}|${spec.einheit ?? ''}`
  }, [mixedModelSeriesIndex, specs])
  const mixedModelPolicyHash = useMemo(
    () => mixedModelSeriesIndex >= 0 ? mixedModelFitConfigHash(specs[mixedModelSeriesIndex], mixedModelConfig) : '',
    [mixedModelSeriesIndex, specs, mixedModelConfig],
  )
  const mixedModelFormulaText = useMemo(() => mixedModelFormula(mixedModelConfig), [mixedModelConfig])
  const mixedModelFormulaLabelText = useMemo(() => mixedModelConfigLabel(mixedModelConfig), [mixedModelConfig])
  const cohortGroups = useMemo(
    () => (groupByAttribute ? groupPatients(patientIds, patientAttributes, groupByAttribute) : []),
    [groupByAttribute, patientIds, patientAttributes],
  )
  const cohortGroupColorMap = useMemo(() => groupColors(cohortGroups), [cohortGroups])
  const canShowMixedModelDialog = mixedModelDialogOpen && mixedModelSeriesIndex >= 0

  function validateMixedModelDraftConfig(config: MixedModelConfig): string | null {
    const configValidation = validateMixedModelConfig(config)
    if (!configValidation.ok) return configValidation.message
    const rowValidation = validateMixedModelRows(mixedModelRows, config)
    return rowValidation.ok ? null : rowValidation.message
  }

  function exportXlsx() {
    // Scope the attributes sheet to the exported cohort so the workbook's sheets
    // cover the same patients (excludes filtered-out and unknown patients).
    const cohortKeys = new Set(sorted.map((r) => patientIdKey(r.patientId)))
    const cohortAttributes = Object.fromEntries(
      Object.entries(patientAttributes).filter(([key]) => cohortKeys.has(key)),
    )
    const workbook = sheetsToXlsxBytes([
      { name: 'cohort', rows: cohortExportRecords(sorted, rapidThreshold) },
      ...(Object.keys(cohortAttributes).length > 0
        ? [{ name: 'patient_attributes', rows: patientAttributesExportRows(cohortAttributes) }]
        : []),
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
        {(groupByOptions.length > 0 || groupByAttribute !== null) && (
          <label className="cohort-group-by">
            <span>Group by</span>
            <select
              aria-label="Group by attribute"
              value={groupByAttribute ?? ''}
              onChange={(e) => setGroupByAttribute(e.target.value || null)}
            >
              <option value="">No grouping</option>
              {groupByOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {canShowMixedModelDialog && (
        <div className="mixed-model-config-modal-backdrop">
          <div
            className="mixed-model-config-modal mixed-model-result-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="egfr-cohort-model-title"
          >
            <div className="mixed-model-config-modal-header">
              <div>
                <div className="mixed-model-title-row">
                  <h2 id="egfr-cohort-model-title">eGFR cohort model</h2>
                  <span className="experimental-badge">Experimental</span>
                </div>
                <p>Nephro-specific mixed model using the active eGFR cohort and current filter settings.</p>
                <p className="mixed-model-experimental-note">Experimental browser-based mixed model; verify clinical interpretation independently.</p>
              </div>
              <button type="button" onClick={() => setMixedModelDialogOpen(false)} aria-label="Close eGFR cohort model">
                Close
              </button>
            </div>
            <Suspense fallback={null}>
              <CohortModelPanel
                rows={displayRows}
                patientIds={patientIds}
                groups={cohortGroups}
                groupColors={cohortGroupColorMap}
                spec={specs[mixedModelSeriesIndex]}
                seriesIndex={mixedModelSeriesIndex}
                seriesKey={mixedModelSeriesKey}
                seriesUnit={specs[mixedModelSeriesIndex].einheit}
                fitConfigHash={mixedModelPolicyHash}
                config={mixedModelConfig}
                formula={mixedModelFormulaText}
                formulaLabel={mixedModelFormulaLabelText}
                dataPolicySummary={MIXED_MODEL_DATA_POLICY_TEXT}
                validateConfig={validateMixedModelDraftConfig}
                onConfigChange={setMixedModelConfig}
              />
            </Suspense>
          </div>
        </div>
      )}
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
                  {groupingActive && <th scope="col">Group</th>}
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
                    {groupingActive && <td className="cohort-group-cell">{r.groupValue}</td>}
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
                              events={showEvents ? eventsByPatient.get(patientIdKey(r.patientId)) ?? [] : []}
                              connect={connectPoints}
                            />
                            <span
                              className="cell-slope"
                              title={slopeTitle(c)}
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
