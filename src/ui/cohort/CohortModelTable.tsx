import { mixedModelCoefficientTerms, mixedModelExportSheets, mixedModelTermLabel } from '../../core/mixedModel/modelExport'
import { mixedModelFactors } from '../../core/mixedModel/config'
import { downloadBlob, fileStamp, sheetsToXlsxBytes } from '../../io/export'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { RunMixedModelWorkerJobOptions } from '../../core/mixedModel/browserClient'
import type { MixedModelConfig } from '../../core/mixedModel/config'
import {
  entityGroupValue,
  entityKey,
  type CohortModelEntity,
  type CohortModelEntityRows,
} from '../../core/mixedModel/cohortModelEntity'
import {
  buildMixedModelResultIdentity,
  mixedModelIdentityEquals,
} from '../../core/mixedModel/resultIdentity'
import type {
  MixedModelResult,
  MixedModelSpikeRow,
  MixedModelSuccess,
} from '../../core/mixedModel/types'
import { validateMixedModelRows } from '../../core/mixedModel/validation'
import { useAppStore, type StoredMixedModelResult } from '../state/store'
import { projectionSettingsKey } from '../state/store'
import { buildProjectionSnapshot, createDefaultProjectionSettings, type ProjectionResponse, type ProjectionSnapshot } from '../../core/projection/projectionSnapshot'
import { ModelProjectionPanel } from './ModelProjectionPanel'

const FALLBACK_COLOR = '#475569'

export interface CohortModelTableProps {
  /** Entities to list/fit; `entities[0]` is the pooled cohort, the rest are
   * groups in display order. */
  entities: CohortModelEntityRows[]
  /** entityKey -> display label (e.g. 'Whole cohort', or the group value). */
  entityLabels: Map<string, string>
  /** entityKey -> swatch color (groups only; cohort uses a neutral color). */
  entityColors: Map<string, string>
  seriesIndex: number
  seriesKey: string
  seriesUnit: string | null
  sourceResponse: ProjectionResponse
  fitConfigHash: string
  config: MixedModelConfig
  formula: string
  /** Injectable worker seam (tests); forwarded to the store run action. */
  runJob?: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
}

interface EntityRow {
  entity: CohortModelEntity
  key: string
  rows: MixedModelSpikeRow[]
  label: string
  color: string
  nPatients: number
  nMeasurements: number
  /** Passes the same pooled validity gate as the single fit. */
  preparation?: CohortModelEntityRows['preparation']
  validationMessage: string | null
  eligible: boolean
}

/** One results table over the whole cohort + each group. Each row can be
 * selected and fit ("Fit selected"); fits run through the central store action
 * and results are read back from the store, identity-guarded against stale data. */
export function CohortModelTable({
  entities,
  entityLabels,
  entityColors,
  seriesIndex,
  seriesKey,
  seriesUnit,
  sourceResponse,
  fitConfigHash,
  config,
  formula,
  runJob,
}: CohortModelTableProps) {
  const cohortModelResults = useAppStore((s) => s.cohortModelResults)
  const running = useAppStore((s) => s.cohortModelRunning)
  const progress = useAppStore((s) => s.cohortModelProgress)
  const runCohortModels = useAppStore((s) => s.runCohortModels)
  const projectionSettings = useAppStore((s) => s.projectionSettings)
  const setProjectionSettings = useAppStore((s) => s.setProjectionSettings)
  const [dirtyEditors, setDirtyEditors] = useState<Set<string>>(new Set())

  const entityRows = useMemo<EntityRow[]>(
    () =>
      entities
        .map(({ entity, rows, preparation }) => {
          const validation = validateMixedModelRows(rows, config)
          const key = entityKey(entity)
          return {
            entity,
            key,
            rows,
            label: entityLabels.get(key) ?? key,
            color: entityColors.get(key) ?? FALLBACK_COLOR,
            nPatients: new Set(rows.map((row) => row.patient_id)).size,
            nMeasurements: rows.length,
            preparation,
            validationMessage: validation.ok ? null : validation.message,
            eligible: validation.ok,
          }
        })
        // Always keep the pooled cohort row; drop empty groups (no model rows).
        .filter((row) => row.entity.kind === 'cohort' || row.rows.length > 0 || (row.preparation?.nMeasurementsBefore ?? 0) > 0),
    [entities, entityLabels, entityColors, config],
  )

  const eligibleKeys = useMemo(
    () => entityRows.filter((row) => row.eligible).map((row) => row.key),
    [entityRows],
  )
  const eligibleSignature = eligibleKeys.join('|')

  // Default selection = all eligible entities; reset when the eligible set
  // changes (e.g. settings or grouping change), preserving nothing stale.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligibleKeys))
  const previousSignatureRef = useRef(eligibleSignature)
  useEffect(() => {
    if (previousSignatureRef.current !== eligibleSignature) {
      previousSignatureRef.current = eligibleSignature
      setSelected(new Set(eligibleKeys))
    }
  }, [eligibleSignature, eligibleKeys])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const selectedEligible = entityRows.filter((row) => row.eligible && selected.has(row.key))
  const allEligibleSelected = eligibleKeys.length > 0 && eligibleKeys.every((key) => selected.has(key))
  const progressStatus = running && progress
    ? {
        buttonText: `Fitting ${Math.min(progress.completed + 1, progress.total)} of ${progress.total}`,
        message: `${progress.completed} of ${progress.total} fits complete.`,
      }
    : null

  function toggleSelected(key: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setSelected(allEligibleSelected ? new Set() : new Set(eligibleKeys))
  }

  function toggleExpanded(key: string) {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function storedFor(row: EntityRow): StoredMixedModelResult | null {
    const stored = cohortModelResults?.[row.key]
    if (!stored) return null
    const identity = buildMixedModelResultIdentity({
      seriesIndex,
      seriesKey,
      patientIds: row.rows.map((modelRow) => modelRow.patient_id),
      rows: row.rows,
      preparation: row.preparation,
      fitConfigHash,
      groupValue: entityGroupValue(row.entity),
    })
    return mixedModelIdentityEquals(identity, stored.identity) ? stored : null
  }

  async function fitSelected() {
    if (selectedEligible.length === 0) return
    await runCohortModels({
      entities: selectedEligible.map((row) => ({ entity: row.entity, rows: row.rows, preparation: row.preparation })),
      seriesIndex,
      seriesKey,
      fitConfigHash,
      config,
      formula,
      runJob,
    })
  }

  function statusText(row: EntityRow): string {
    if (!row.eligible) return row.validationMessage ?? 'Invalid model design'
    const stored = storedFor(row)
    if (!stored) return 'Not fitted'
    const result = stored.result
    if (result.status === 'success') {
      const slope = formatSlope(result.fixedEffects.timeSinceBaseline, seriesUnit)
      return result.converged ? slope : `${slope} (did not converge)`
    }
    return `Fit failed: ${result.message}`
  }

  useEffect(() => {
    for (const row of entityRows) {
      const stored = storedFor(row)
      if (!stored || stored.result.status !== 'success' || !stored.result.converged) continue
      const applied = projectionSettings[projectionSettingsKey(seriesIndex,seriesKey,row.key)]
      if (!applied || !mixedModelIdentityEquals(applied.sourceIdentity,stored.identity)) {
        setProjectionSettings(seriesIndex,seriesKey,row.key,{sourceIdentity:stored.identity,settings:createDefaultProjectionSettings(stored.result,sourceResponse)})
      }
    }
  }, [entityRows,cohortModelResults,projectionSettings,seriesIndex,seriesKey,sourceResponse,setProjectionSettings])

  const exportable = entityRows.flatMap((row) => {
    const stored = storedFor(row)
    if (!stored) return []
    const applied = projectionSettings[projectionSettingsKey(seriesIndex,seriesKey,row.key)]
    let projection: ProjectionSnapshot | undefined
    let projectionError: string | undefined
    if (stored.result.status === 'success' && stored.result.converged && applied && mixedModelIdentityEquals(applied.sourceIdentity,stored.identity)) {
      try { projection = buildProjectionSnapshot(stored.result,stored.identity,sourceResponse,row.rows,applied.settings) }
      catch (error) { projectionError = error instanceof Error ? error.message : 'Projection settings or source fit are invalid.' }
    }
    return [{key:row.key,entity: row.label, result: stored.result, identity: stored.identity, sourceResponse, projection, projectionError}]
  })
  const hasDirtyEditor = exportable.some((model) => dirtyEditors.has(model.key))
  const initializing = exportable.some((model) => model.result.status === 'success' && model.result.converged && !model.projection)
  function exportModels() {
    if (hasDirtyEditor || initializing || running) return
    const current = useAppStore.getState().cohortModelResults
    if (exportable.some((model) => current?.[model.key]?.result !== model.result || !mixedModelIdentityEquals(current?.[model.key]?.identity ?? null, model.identity))) return
    downloadBlob(sheetsToXlsxBytes(mixedModelExportSheets(exportable)), `cohort-models-${fileStamp()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }
  const adjusted = mixedModelFactors(config).length > 0

  return (
    <section className="mixed-model-panel cohort-model-panel" aria-label="Cohort mixed model">
      <div className="mixed-model-panel-header">
        <p className="mixed-model-message">One mixed model per selected unit, fit sequentially. Failures are isolated per unit.</p>
        <button type="button" disabled={exportable.length === 0 || running || hasDirtyEditor || initializing} onClick={exportModels}>Export models (xlsx)</button>
        {hasDirtyEditor && <p role="status">Apply or cancel projection changes before exporting models.</p>}
        {exportable.filter((model) => model.projectionError).map((model) => <p role="alert" key={model.key}>{model.entity}: {model.projectionError} Refit the model before exporting.</p>)}
        <button
          type="button"
          onClick={() => void fitSelected()}
          disabled={running || selectedEligible.length === 0}
        >
          {progressStatus?.buttonText ?? (running ? 'Fitting...' : 'Fit selected')}
        </button>
      </div>
      {progressStatus && <p className="mixed-model-message" role="status">{progressStatus.message}</p>}
      {entityRows.length === 0 ? (
        <p className="mixed-model-message">No data to fit.</p>
      ) : (
        <div className="cohort-model-table-wrap">
          <table className="cohort-model-table" aria-label="Cohort model results">
            <thead>
              <tr>
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select all units"
                    checked={allEligibleSelected}
                    disabled={eligibleKeys.length === 0}
                    onChange={toggleAll}
                  />
                </th>
                <th scope="col">Unit</th>
                <th scope="col">Patients</th>
                <th scope="col">Measurements</th>
                <th scope="col">{adjusted ? 'Reference slope' : 'Slope'}</th>
                <th scope="col">{adjusted ? 'Reference intercept' : 'Intercept'}</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {entityRows.map((row) => {
                const stored = storedFor(row)
                const success = stored?.result.status === 'success' ? stored.result : null
                const isExpanded = expanded.has(row.key)
                return (
                  <Fragment key={row.key}>
                    <tr data-testid="cohort-model-row" data-entity={row.key}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Fit ${row.label}`}
                          disabled={!row.eligible}
                          checked={selected.has(row.key)}
                          onChange={() => toggleSelected(row.key)}
                        />
                      </td>
                      <td>
                        <span className="cohort-model-unit">
                          {row.entity.kind === 'group' && (
                            <span className="group-swatch" style={{ backgroundColor: row.color }} aria-hidden="true" />
                          )}
                          {row.label}
                        </span>
                      </td>
                      <td>{row.nPatients}</td>
                      <td>{row.nMeasurements}</td>
                      <td>{success ? formatSlope(success.fixedEffects.timeSinceBaseline, seriesUnit) : '—'}</td>
                      <td>{success ? formatValue(success.fixedEffects.intercept, seriesUnit) : '—'}</td>
                      <td className="cohort-model-status" data-testid="cohort-model-status">{statusText(row)}
                        {(row.preparation?.excludedPatients.length ?? 0) > 0 && <details><summary>Excluded patients ({row.preparation!.excludedPatients.length})</summary><ul>{row.preparation!.excludedPatients.map((patient) => <li key={patient.patientId}>{patient.patientId}: {patient.reasons.join('; ')}</li>)}</ul></details>}
                      </td>
                      <td>
                        {success && (
                          <button
                            type="button"
                            className="cohort-model-details-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpanded(row.key)}
                          >
                            Details
                          </button>
                        )}
                      </td>
                    </tr>
                    {success && isExpanded && (
                      <tr className="cohort-model-details-row" data-testid="cohort-model-details" data-entity={row.key}>
                        <td className="cohort-model-details-cell" data-testid="cohort-model-details-cell" colSpan={8}>
                          <ModelDetails result={success} />
                          {(() => {
                            const snapshot = exportable.find((model) => model.key === row.key)?.projection
                            return snapshot ? <ModelProjectionPanel snapshot={snapshot} showWarnings={false}
                              onApply={(settings) => setProjectionSettings(seriesIndex,seriesKey,row.key,{sourceIdentity:snapshot.sourceIdentity,settings})}
                              onDirtyChange={(dirty) => setDirtyEditors((previous) => {
                                if (previous.has(row.key) === dirty) return previous
                                const next = new Set(previous)
                                if (dirty) next.add(row.key)
                                else next.delete(row.key)
                                return next
                              })} /> : <p>Projection unavailable: a current converged fit is required.</p>
                          })()}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ModelDetails({ result }: { result: MixedModelSuccess }) {
  const factors = result.metadata.modelConfig ? mixedModelFactors(result.metadata.modelConfig) : []
  return (
    <>
    {factors.length > 0 && <p>Reference intercept and slope: {factors.map((factor) => factor.kind === 'categorical' ? `${factor.key} = ${factor.reference}` : `${factor.key} at its included-patient mean`).join('; ')}. Associations are conditional on this model and population.</p>}
    {result.warnings.map((warning, index) => <p role="status" key={index}>{warning}</p>)}
    <table className="cohort-model-table" aria-label="Fixed effect coefficients"><thead><tr><th>Term</th><th>Estimate</th><th>95% CI</th></tr></thead><tbody>{mixedModelCoefficientTerms(result).map((coefficient) => <tr key={coefficient.term}><td>{mixedModelTermLabel(coefficient.term, result.metadata.modelConfig)}</td><td>{coefficient.estimate.toFixed(3)}</td><td>{formatOptionalInterval(coefficient.confidenceInterval)}</td></tr>)}</tbody></table>
    <dl className="cohort-model-details">
      <div className="cohort-model-detail-item">
        <dt>Slope 95% CI</dt>
        <dd data-testid="cohort-model-detail-value">{formatOptionalInterval(result.fixedEffectConfidenceIntervals.timeSinceBaseline)}</dd>
      </div>
      <div className="cohort-model-detail-item">
        <dt>Patient intercept SD</dt>
        <dd data-testid="cohort-model-detail-value">{formatOptionalNumber(result.randomEffects.interceptSd)}</dd>
      </div>
      <div className="cohort-model-detail-item">
        <dt>Patient slope SD</dt>
        <dd data-testid="cohort-model-detail-value">{formatOptionalNumber(result.randomEffects.slopeSd)}</dd>
      </div>
      <div className="cohort-model-detail-item">
        <dt>Intercept-slope correlation</dt>
        <dd data-testid="cohort-model-detail-value">{formatOptionalNumber(result.randomEffects.interceptSlopeCorrelation)}</dd>
      </div>
      <div className="cohort-model-detail-item">
        <dt>Residual SD</dt>
        <dd data-testid="cohort-model-detail-value">{formatOptionalNumber(result.residualSd)}</dd>
      </div>
      <div className="cohort-model-detail-item cohort-model-detail-item-wide" data-testid="cohort-model-detail-formula">
        <dt>Formula</dt>
        <dd data-testid="cohort-model-detail-value">{result.metadata.formula}</dd>
      </div>
      <div className="cohort-model-detail-item">
        <dt>Engine</dt>
        <dd data-testid="cohort-model-detail-value">{result.metadata.engine}</dd>
      </div>
      <div className="cohort-model-detail-item cohort-model-detail-item-wide" data-testid="cohort-model-detail-dataset">
        <dt>Dataset</dt>
        <dd data-testid="cohort-model-detail-value">{result.metadata.datasetId} ({result.metadata.datasetHash})</dd>
      </div>
      <div className="cohort-model-detail-item cohort-model-detail-item-wide" data-testid="cohort-model-detail-fit-config">
        <dt>Fit config</dt>
        <dd data-testid="cohort-model-detail-value">{result.metadata.fitConfigHash}</dd>
      </div>
    </dl>
    </>
  )
}

function formatSlope(value: number, unit: string | null): string {
  const unitText = unit ? ` ${unit}` : ''
  return `${value.toFixed(2)}${unitText}/yr`
}

function formatValue(value: number, unit: string | null): string {
  const unitText = unit ? ` ${unit}` : ''
  return `${value.toFixed(2)}${unitText}`
}

function formatOptionalNumber(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(2)
}

function formatOptionalInterval(value: [number, number] | null): string {
  return value === null ? 'n/a' : `[${value[0].toFixed(2)}, ${value[1].toFixed(2)}]`
}
