import { mixedModelCoefficientTerms, mixedModelExportSheets, mixedModelTermLabel } from '../../core/mixedModel/modelExport'
import { mixedModelFactors, mixedModelFormulaForOutcome, mixedModelOutcomeLabel } from '../../core/mixedModel/config'
import { downloadBlob, fileStamp, sheetsToXlsxBytes } from '../../io/export'
import { version as APP_VERSION } from '../../../package.json'
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
  MixedModelFailure,
  MixedModelSpikeRow,
  MixedModelSuccess,
} from '../../core/mixedModel/types'
import { mixedModelWarningDetails, patientIdList, validateMixedModelRows, type MixedModelWarningDetail } from '../../core/mixedModel/validation'
import { useAppStore, type StoredMixedModelResult } from '../state/store'
import { projectionSettingsKey } from '../state/store'
import { buildProjectionSnapshot, type ProjectionResponse, type ProjectionSnapshot } from '../../core/projection/projectionSnapshot'
import { createDefaultProjectionSettings } from '../../core/analysis/projection'
import { ModelProjectionPanel } from './ModelProjectionPanel'
import { formatWorkspaceNumber } from '../WorkspacePlot'
import { formatFixedDecimals, MIN_SLOPE_DECIMALS } from '../../core/format'
import type { MixedModelDropout } from '../../core/mixedModel/dropout'
import { inEnglish, t } from '../../i18n'

const FALLBACK_COLOR = '#55686e'

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
  /** False when the parameter's settings define no event or AKI windows. */
  definesWindows?: boolean
  /** Decimals for this parameter's slopes (see slopeDisplayDecimals): the same
   * as its column under Trajectories. */
  slopeDecimals?: number
  /** Dropout of each unit's patients by reason, keyed by entityKey (export). */
  dropoutByEntity?: Map<string, MixedModelDropout>
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
  inputFlags?: CohortModelEntityRows['inputFlags']
  validationMessage: string | null
  eligible: boolean
  /** The input warnings of the passed check, with their meaning and patients. */
  warningDetails: MixedModelWarningDetail[]
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
  definesWindows = true,
  slopeDecimals = MIN_SLOPE_DECIMALS,
  runJob,
  dropoutByEntity,
}: CohortModelTableProps) {
  const cohortModelResults = useAppStore((s) => s.cohortModelResults)
  const running = useAppStore((s) => s.cohortModelRunning)
  const progress = useAppStore((s) => s.cohortModelProgress)
  const runCohortModels = useAppStore((s) => s.runCohortModels)
  const projectionSettings = useAppStore((s) => s.projectionSettings)
  const setProjectionSettings = useAppStore((s) => s.setProjectionSettings)
  const [dirtyEditors, setDirtyEditors] = useState<Set<string>>(new Set())
  const [exportError, setExportError] = useState<string | null>(null)

  const entityRows = useMemo<EntityRow[]>(
    () =>
      entities
        .map(({ entity, rows, preparation, inputFlags }) => {
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
            inputFlags,
            validationMessage: validation.ok ? null : validation.message,
            eligible: validation.ok,
            warningDetails: validation.ok ? mixedModelWarningDetails(rows, config) : [],
          }
        })
        // Always keep the pooled cohort row; drop empty groups (no model rows).
        .filter((row) => row.entity.kind === 'cohort' || row.rows.length > 0 || (row.preparation?.nMeasurementsBefore ?? 0) > 0 || (row.preparation?.excludedByPreset ?? 0) > 0),
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
        buttonText: t('Fitting {n} of {total}', { n: Math.min(progress.completed + 1, progress.total), total: progress.total }),
        message: t('{n} of {total} fits complete.', { n: progress.completed, total: progress.total }),
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
    if (!row.eligible) return row.validationMessage ?? t('Invalid model design')
    const stored = storedFor(row)
    if (!stored) return t('Not fitted')
    const result = stored.result
    if (result.status === 'success') {
      // The slope has its own column; the status says whether the fit can be used.
      const flags = [!result.converged && t('did not converge'), result.singular && t('singular fit; projection withheld')].filter(Boolean)
      return flags.length ? t('Fitted ({flags})', { flags: flags.join('; ') }) : t('Fitted')
    }
    return failureStatusText(result)
  }

  useEffect(() => {
    for (const row of entityRows) {
      const stored = storedFor(row)
      if (!stored || stored.result.status !== 'success' || !stored.result.converged || stored.result.singular) continue
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
    if (stored.result.status === 'success' && stored.result.converged && !stored.result.singular && applied && mixedModelIdentityEquals(applied.sourceIdentity,stored.identity)) {
      try { projection = buildProjectionSnapshot(stored.result,stored.identity,sourceResponse,row.rows,applied.settings) }
      catch (error) { projectionError = error instanceof Error ? error.message : t('Projection settings or source fit are invalid.') }
    }
    return [{key:row.key,entity: row.label, result: stored.result, identity: stored.identity, sourceResponse, projection, projectionError, rows: row.rows, inputFlags: row.inputFlags, dropout: dropoutByEntity?.get(row.key)}]
  })
  const hasDirtyEditor = exportable.some((model) => dirtyEditors.has(model.key))
  const initializing = exportable.some((model) => model.result.status === 'success' && model.result.converged && !model.result.singular && !model.projection)
  function exportModels() {
    if (hasDirtyEditor || initializing || running) return
    const current = useAppStore.getState().cohortModelResults
    if (exportable.some((model) => current?.[model.key]?.result !== model.result || !mixedModelIdentityEquals(current?.[model.key]?.identity ?? null, model.identity))) return
    try {
      const fileName = `cohort-models-${fileStamp()}.xlsx`
      downloadBlob(sheetsToXlsxBytes(inEnglish(() => mixedModelExportSheets(exportable, fileName, undefined, { appVersion: APP_VERSION, egfrFormula: useAppStore.getState().analysisSettings.egfr.formula }))), fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      setExportError(null)
    } catch (error) {
      setExportError(t('Model export failed: {error}', { error: error instanceof Error ? error.message : String(error) }))
    }
  }
  const adjusted = mixedModelFactors(config).length > 0

  return (
    <section className="mixed-model-panel cohort-model-panel" aria-label={t('Cohort mixed model')}>
      <h2 className="cohort-model-panel-title">{t('Model results')}</h2>
      <div className="mixed-model-panel-header">
        <p className="mixed-model-message">{t('One mixed model per selected group, fit sequentially. Failures are isolated per group.')}</p>
        <button type="button" disabled={exportable.length === 0 || running || hasDirtyEditor || initializing} onClick={exportModels}>{t('Export models (xlsx)')}</button>
        {hasDirtyEditor && <p role="status">{t('Apply or cancel projection changes before exporting models.')}</p>}
        {exportable.filter((model) => model.projectionError).map((model) => <p role="alert" key={model.key}>{model.entity}: {model.projectionError} {t('Refit the model before exporting.')}</p>)}
        {exportError && <p role="alert">{exportError}</p>}
        <button
          type="button"
          onClick={() => void fitSelected()}
          disabled={running || selectedEligible.length === 0}
        >
          {progressStatus?.buttonText ?? (running ? t('Fitting...') : t('Fit selected'))}
        </button>
        {running && <button type="button" onClick={() => useAppStore.getState().cancelCohortModels()}>{t('Cancel')}</button>}
      </div>
      {progressStatus && <p className="mixed-model-message" role="status">{progressStatus.message}</p>}
      {entityRows.length === 0 ? (
        <p className="mixed-model-message">{t('No data to fit.')}</p>
      ) : (
        <div className="cohort-model-table-wrap">
          <table className="cohort-model-table" aria-label={t('Cohort model results')}>
            <thead>
              <tr>
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label={t('Select all groups')}
                    checked={allEligibleSelected}
                    disabled={eligibleKeys.length === 0}
                    onChange={toggleAll}
                  />
                </th>
                <th scope="col">{t('Group')}</th>
                <th scope="col">{t('Patients')}</th>
                <th scope="col">{t('Measurements')}</th>
                <th scope="col">{adjusted ? t('Change per year (reference)') : t('Change per year')}</th>
                <th scope="col">{adjusted ? t('Starting level (reference)') : t('Starting level')}</th>
                <th scope="col">{t('Status')}</th>
                <th scope="col"><span className="visually-hidden">{t('Details')}</span></th>
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
                          aria-label={t('Fit {label}', { label: row.label })}
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
                      <td>{success ? <>{formatSlope(success.fixedEffects.timeSinceBaseline, seriesUnit, slopeDecimals)}<IntervalText value={success.fixedEffectConfidenceIntervals.timeSinceBaseline} decimals={slopeDecimals} /></> : '—'}</td>
                      <td>{success ? <>{formatValue(success.fixedEffects.intercept, seriesUnit, slopeDecimals)}<IntervalText value={success.fixedEffectTerms?.find(term => term.term === '(Intercept)')?.confidenceInterval ?? null} decimals={slopeDecimals} /></> : '—'}</td>
                      <td className="cohort-model-status" data-testid="cohort-model-status">{statusText(row)}
                        <div>{row.preparation?.presetExclusionPolicy !== 'skip' && !definesWindows ? t('No event or AKI windows defined: nothing excluded') : row.preparation?.presetExclusionPolicy === 'skip' ? t('Preset windows skipped: {n} eligible measurements excluded', { n: row.preparation?.excludedByPreset ?? 0 }) : t('Preset windows applied: {n} eligible measurements excluded', { n: row.preparation?.excludedByPreset ?? 0 })}</div>
                        {(row.preparation?.excludedPatients.length ?? 0) > 0 && <details><summary>{t('Excluded for factor values ({excludedPatients})', { excludedPatients: row.preparation!.excludedPatients.length })}</summary><ul>{row.preparation!.excludedPatients.map((patient) => <li key={patient.patientId}>{patient.patientId}: {patient.reasons.join('; ')}</li>)}</ul></details>}
                      </td>
                      <td>
                        {success && (
                          <button
                            type="button"
                            className="cohort-model-details-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpanded(row.key)}
                          >
                            {t('Details')}
                          </button>
                        )}
                      </td>
                    </tr>
                    {success && isExpanded && (
                      <tr className="cohort-model-details-row" data-testid="cohort-model-details" data-entity={row.key}>
                        <td className="cohort-model-details-cell" data-testid="cohort-model-details-cell" colSpan={8}>
                          <ModelDetails result={success} outcome={mixedModelOutcomeLabel(sourceResponse.outcome, sourceResponse.unit)} decimals={slopeDecimals} warningDetails={row.warningDetails} />
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
                              })} /> : <p>{success.singular ? t('Projection unavailable: the random-effects fit is singular.') : t('Projection unavailable: a current converged fit is required.')}</p>
                          })()}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        <p className="mixed-model-message cohort-model-reading" data-testid="interval-reading"><strong>{t('How to read the intervals:')}</strong> {t('an estimate with a 95% interval that excludes 0 is unlikely to be explained by chance alone under this model. The intervals are approximate and tend to be too narrow with few patients, and nothing is adjusted for comparing several groups or factors. Report the estimate with its interval; do not report it as a p-value. The intervals are Wald intervals (estimate ± 1.96 standard errors); they ignore the uncertainty of the variance components. For tests, the exported R script runs lmerTest where it is installed: an F test per factor with Satterthwaite degrees of freedom, and contrasts that are exploratory and unadjusted.')}</p>
        </div>
      )}
    </section>
  )
}

function failureStatusText(result: MixedModelFailure): string {
  const message = t('Fit failed: {message}', { message: result.message })
  if (
    (result.stage === 'runtime-load' && result.code === 'WEBR_INIT_FAILED') ||
    (result.stage === 'package-load' && result.code === 'PACKAGE_UNAVAILABLE')
  ) {
    return `${message} ${t('The first fit of a session loads the R runtime and R packages from the address this app is served from. Check that this address can still be reached, then retry the fit.')}`
  }
  return message
}

/** A stored warning as the interface shows it: an input warning of the check
 * in plain words with the patients concerned (2026-11-22), any other warning
 * (from R, for example) as recorded. The export keeps the recorded text. */
function warningText(warning: string, details: readonly MixedModelWarningDetail[]): string {
  const detail = details.find((candidate) => candidate.text === warning)
  if (!detail) return warning
  return `${detail.plain} ${detail.patientIds.length === 1 ? t('Patient') : t('Patients')}: ${patientIdList(detail.patientIds)}.`
}

function ModelDetails({ result, outcome, decimals, warningDetails }: { result: MixedModelSuccess; outcome: string; decimals: number; warningDetails: readonly MixedModelWarningDetail[] }) {
  const factors = result.metadata.modelConfig ? mixedModelFactors(result.metadata.modelConfig) : []
  return (
    <>
    {factors.length > 0 && <p>{t('Reference starting level and change per year: {value}. Associations are conditional on this model and population.', { value: factors.map((factor) => factor.kind === 'categorical' ? `${factor.key} = ${factor.reference}` : t('{factor} at its included-patient mean', { factor: factor.key })).join('; ') })}</p>}
    {result.warnings.map((warning, index) => <p role="status" key={index}>{warningText(warning, warningDetails)}</p>)}
    <table className="cohort-model-table" aria-label={t('Fixed effect coefficients')}><thead><tr><th>{t('Term')}</th><th>{t('Estimate')}</th><th>{t('95% CI')}</th></tr></thead><tbody>{mixedModelCoefficientTerms(result).map((coefficient) => <tr key={coefficient.term}><td>{mixedModelTermLabel(coefficient.term, result.metadata.modelConfig)}</td><td>{formatFixedDecimals(coefficient.estimate, decimals)}</td><td>{formatFixedInterval(coefficient.confidenceInterval, decimals)}</td></tr>)}</tbody></table>
    <dl className="cohort-model-details">
      <div className="cohort-model-detail-item">
        <dt>{t('Patient intercept SD')}</dt>
        <dd data-testid="cohort-model-detail-value">{formatOptionalNumber(result.randomEffects.interceptSd)}</dd>
      </div>
      <div className="cohort-model-detail-item">
        <dt>{t('Patient slope SD')}</dt>
        <dd data-testid="cohort-model-detail-value">{result.randomEffects.slopeSd === null ? 'n/a' : formatFixedDecimals(result.randomEffects.slopeSd, decimals)}</dd>
      </div>
      <div className="cohort-model-detail-item">
        <dt>{t('Intercept-slope correlation')}</dt>
        <dd data-testid="cohort-model-detail-value">{formatOptionalNumber(result.randomEffects.interceptSlopeCorrelation)}</dd>
      </div>
      <div className="cohort-model-detail-item">
        <dt>{t('Residual SD')}</dt>
        <dd data-testid="cohort-model-detail-value">{formatOptionalNumber(result.residualSd)}</dd>
      </div>
      <div className="cohort-model-detail-item cohort-model-detail-item-wide" data-testid="cohort-model-detail-formula">
        <dt>{t('Formula')}</dt>
        <dd data-testid="cohort-model-detail-value">{mixedModelFormulaForOutcome(result.metadata.formula, outcome)}</dd>
      </div>
    </dl>
    <details className="cohort-model-technical">
    <summary>{t('Technical record (for a methods section)')}</summary>
    <dl className="cohort-model-details">
      <div className="cohort-model-detail-item">
        <dt>{t('Engine')}</dt>
        <dd data-testid="cohort-model-detail-value">{result.metadata.engine}</dd>
      </div>
      <div className="cohort-model-detail-item cohort-model-detail-item-wide" data-testid="cohort-model-detail-dataset">
        <dt>{t('Dataset')}</dt>
        <dd data-testid="cohort-model-detail-value">{result.metadata.datasetId} ({result.metadata.datasetHash})</dd>
      </div>
      <div className="cohort-model-detail-item cohort-model-detail-item-wide" data-testid="cohort-model-detail-fit-config">
        <dt>{t('Fit config')}</dt>
        <dd data-testid="cohort-model-detail-value">{result.metadata.fitConfigHash}</dd>
      </div>
    </dl>
    </details>
    </>
  )
}

// A slope, its interval and the coefficients carry the decimals of the
// parameter's slope column (decided 2026-11-21), so the table, the preview
// legend and the Trajectories table write the same quantity alike. The starting
// level and its interval take the same number, as its row among the coefficients
// does (2026-11-22; before, the general display rounding, so "45.5 [44.12, 46.9]").
// Display only: exports keep the
// unrounded values.
/** The 95% interval beside an estimate in the results table; nothing when the fit recorded none.
 * With `decimals` both bounds are written with exactly that many. */
function IntervalText({ value, decimals }: { value: [number, number] | null; decimals?: number }) {
  return value === null ? null : <span className="cohort-model-interval" title={t('95% interval')}> <span className="visually-hidden">{t('95% interval')} </span>{decimals === undefined ? formatOptionalInterval(value) : formatFixedInterval(value, decimals)}</span>
}

function formatSlope(value: number, unit: string | null, decimals: number): string {
  const unitText = unit ? ` ${unit}` : ''
  return `${formatFixedDecimals(value, decimals, true)}${unitText}/yr`
}

function formatValue(value: number, unit: string | null, decimals: number): string {
  const unitText = unit ? ` ${unit}` : ''
  return `${formatFixedDecimals(value, decimals)}${unitText}`
}

function formatOptionalNumber(value: number | null): string {
  return value === null ? 'n/a' : formatWorkspaceNumber(value)
}

function formatOptionalInterval(value: [number, number] | null): string {
  return value === null ? 'n/a' : `[${formatWorkspaceNumber(value[0])}, ${formatWorkspaceNumber(value[1])}]`
}
/** Fixed decimals, the same for both bounds as for the estimate beside them. */
function formatFixedInterval(value: [number, number] | null, decimals: number): string {
  return value === null ? 'n/a' : `[${formatFixedDecimals(value[0], decimals)}, ${formatFixedDecimals(value[1], decimals)}]`
}
