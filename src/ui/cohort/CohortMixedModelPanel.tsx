import { useEffect, useMemo, useRef, useState } from 'react'
import {
  disposeMixedModelWorker,
  runMixedModelWorkerJob,
  type RunMixedModelWorkerJobOptions,
} from '../../core/mixedModel/browserClient'
import { mixedModelFormula, mixedModelFormulaKey, type MixedModelConfig } from '../../core/mixedModel/config'
import {
  buildMixedModelResultIdentity,
  mixedModelIdentityEquals,
  type MixedModelResultIdentity,
} from '../../core/mixedModel/resultIdentity'
import {
  type MixedModelFailure,
  type MixedModelResult,
  type MixedModelSpikeRow,
  type MixedModelSuccess,
} from '../../core/mixedModel/types'
import { validateMixedModelRows } from '../../core/mixedModel/validation'
import type { StoredMixedModelResult } from '../state/store'

export interface CohortMixedModelPanelProps {
  rows: MixedModelSpikeRow[]
  seriesIndex: number
  seriesLabel: string
  seriesUnit: string | null
  seriesKey: string
  fitConfigHash: string
  config: MixedModelConfig
  formula: string
  formulaLabel: string
  dataPolicySummary: string
  validateConfig: (config: MixedModelConfig) => string | null
  patientIds: string[]
  currentIdentity?: MixedModelResultIdentity | null
  currentResult?: MixedModelResult | null
  onResult: (value: StoredMixedModelResult) => void
  onConfigChange: (config: MixedModelConfig) => void
  onConfigFit: (config: MixedModelConfig) => void
  runJob?: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
}

function cloneConfig(config: MixedModelConfig): MixedModelConfig {
  return { ...config, covariates: [...config.covariates] }
}

export function CohortMixedModelPanel({
  rows,
  seriesIndex,
  seriesLabel,
  seriesUnit,
  seriesKey,
  fitConfigHash,
  config,
  formula,
  formulaLabel,
  dataPolicySummary,
  validateConfig,
  patientIds,
  currentIdentity = null,
  currentResult = null,
  onResult,
  onConfigChange,
  onConfigFit,
  runJob = runMixedModelWorkerJob,
}: CohortMixedModelPanelProps) {
  const [localStoredResult, setLocalStoredResult] = useState<StoredMixedModelResult | null>(null)
  const [running, setRunning] = useState(false)
  const [draftConfig, setDraftConfig] = useState<MixedModelConfig>(() => cloneConfig(config))
  const [pendingFitConfig, setPendingFitConfig] = useState<MixedModelConfig | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const latestIdentityRef = useRef<MixedModelResultIdentity | null>(null)
  const previousIdentityKeyRef = useRef<string | null>(null)
  const parentHadResultRef = useRef(Boolean(currentIdentity && currentResult))
  const mountedRef = useRef(true)

  const validation = useMemo(() => validateMixedModelRows(rows, config), [rows, config])
  const draftValidationMessage = useMemo(() => validateConfig(draftConfig), [draftConfig, validateConfig])
  const draftHasBaselineAge = draftConfig.covariates.includes('baseline_age')
  const identity = useMemo(
    () => buildMixedModelResultIdentity({ seriesIndex, seriesKey, patientIds, rows, fitConfigHash }),
    [seriesIndex, seriesKey, patientIds, rows, fitConfigHash],
  )
  const identityKey = `${identity.seriesIndex}:${identity.seriesKey}:${identity.patientIdsHash}:${identity.datasetHash}:${identity.fitConfigHash}:${identity.nPatients}:${identity.nMeasurements}`
  latestIdentityRef.current = identity

  const parentHasResult = Boolean(currentIdentity && currentResult)
  const parentStoreCleared = parentHadResultRef.current && !parentHasResult
  const displayedResult =
    !parentStoreCleared && localStoredResult && mixedModelIdentityEquals(localStoredResult.identity, identity)
      ? localStoredResult.result
      : currentResult && mixedModelIdentityEquals(currentIdentity, identity)
        ? currentResult
        : null

  useEffect(() => {
    if (parentHasResult) {
      parentHadResultRef.current = true
      return
    }
    if (parentHadResultRef.current && currentIdentity === null && currentResult === null) {
      setLocalStoredResult(null)
      parentHadResultRef.current = false
    }
  }, [parentHasResult, currentIdentity, currentResult])

  useEffect(() => {
    if (previousIdentityKeyRef.current === null) {
      previousIdentityKeyRef.current = identityKey
      return
    }
    if (previousIdentityKeyRef.current !== identityKey) {
      abortActiveJob()
      previousIdentityKeyRef.current = identityKey
    }
  }, [identityKey])

  function abortActiveJob() {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setRunning(false)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      disposeMixedModelWorker()
    }
  }, [])

  useEffect(() => {
    if (!pendingFitConfig) return
    if (JSON.stringify(config) !== JSON.stringify(pendingFitConfig)) return
    setPendingFitConfig(null)
    void run()
  }, [config, pendingFitConfig])

  useEffect(() => {
    setDraftConfig(cloneConfig(config))
  }, [config])

  async function run() {
    if (!validation.ok) return
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setRunning(true)

    try {
      const nextResult = await runJob({
        rows,
        engine: 'webr-lme4',
        config,
        formula,
        formulaKey: mixedModelFormulaKey(config),
        datasetId: 'cohort',
        fitConfigHash,
        reuseWorker: true,
        signal: controller.signal,
      })
      publishResult(nextResult, controller)
    } catch (error) {
      const failure: MixedModelFailure = {
        status: 'runtime-error',
        engine: 'webr-lme4',
        stage: 'fit',
        code: 'MIXED_MODEL_JOB_FAILED',
        message: error instanceof Error ? error.message : String(error),
        warnings: [],
        metadata: {
          engine: 'webr-lme4',
          formula,
          modelConfig: config,
          datasetId: 'cohort',
          fitConfigHash,
        },
      }
      publishResult(failure, controller)
    } finally {
      if (mountedRef.current && abortControllerRef.current === controller) {
        abortControllerRef.current = null
        setRunning(false)
      }
    }
  }

  function publishResult(result: MixedModelResult, controller: AbortController) {
    if (
      !mountedRef.current ||
      controller.signal.aborted ||
      abortControllerRef.current !== controller ||
      !mixedModelIdentityEquals(identity, latestIdentityRef.current)
    ) {
      return
    }
    const stored = { result, identity }
    setLocalStoredResult(stored)
    onResult(stored)
  }

  function setDraftBaselineAge(checked: boolean) {
    setDraftConfig((current) => ({
      ...current,
      covariates: checked ? ['baseline_age'] : [],
    }))
  }

  function setDraftRandomEffects(randomEffects: MixedModelConfig['randomEffects']) {
    setDraftConfig((current) => ({ ...current, randomEffects }))
  }

  function applyDraftConfig() {
    if (draftValidationMessage) return
    onConfigChange(cloneConfig(draftConfig))
  }

  function fitDraftConfig() {
    if (draftValidationMessage) return
    const nextConfig = cloneConfig(draftConfig)
    setPendingFitConfig(nextConfig)
    onConfigFit(nextConfig)
  }

  return (
    <section className="mixed-model-panel" aria-label="Cohort mixed model">
      <div className="cohort-exports mixed-model-panel-header">
        <span className="export-hint">
          {validation.ok ? `${rows.length} model row(s)` : `${rows.length} model row(s) - ${validation.message}`}
        </span>
      </div>

      {(!displayedResult || displayedResult.status === 'success') && (
        <>
          <p className="export-hint mixed-model-message">{dataPolicySummary}</p>
          <p className="mixed-model-message">Model: {formulaLabel}</p>
        </>
      )}

      <section className="mixed-model-inline-config" aria-label="Model settings">
        <div className="mixed-model-config-modal-section" aria-label="Fixed effects">
          <div className="mixed-model-config-row">
            <span>Time axis</span>
            <strong>time_since_baseline</strong>
          </div>
          <label className="mixed-model-config-check">
            <input
              type="checkbox"
              checked={draftHasBaselineAge}
              onChange={(event) => setDraftBaselineAge(event.currentTarget.checked)}
            />
            Baseline age
          </label>
        </div>

        <fieldset className="mixed-model-config-fieldset">
          <legend>Random effects</legend>
          <label className="mixed-model-config-check">
            <input
              type="radio"
              name="mixed-model-random-effects"
              checked={draftConfig.randomEffects === 'intercept'}
              onChange={() => setDraftRandomEffects('intercept')}
            />
            Patient intercept
          </label>
          <label className="mixed-model-config-check">
            <input
              type="radio"
              name="mixed-model-random-effects"
              checked={draftConfig.randomEffects === 'intercept_slope'}
              onChange={() => setDraftRandomEffects('intercept_slope')}
            />
            Patient intercept/slope
          </label>
        </fieldset>

        <div className="mixed-model-config-modal-section" aria-label="Formula preview">
          <span className="mixed-model-config-label">Formula preview</span>
          <code className="mixed-model-config-formula">{mixedModelFormula(draftConfig)}</code>
        </div>

        {draftValidationMessage && (
          <p className="mixed-model-config-validation" role="alert">
            {draftValidationMessage}
          </p>
        )}

        <div className="mixed-model-config-actions">
          <button type="button" onClick={applyDraftConfig} disabled={draftValidationMessage !== null}>
            Apply settings
          </button>
          <button type="button" onClick={fitDraftConfig} disabled={running || draftValidationMessage !== null || !validation.ok}>
            {running ? 'Fitting model...' : 'Fit model'}
          </button>
        </div>
      </section>

      {displayedResult?.status === 'success' && (
        <SuccessResult
          result={displayedResult}
          seriesLabel={seriesLabel}
          seriesUnit={seriesUnit}
        />
      )}
      {displayedResult && displayedResult.status !== 'success' && <FailureResult result={displayedResult} />}
    </section>
  )
}

function SuccessResult({
  result,
  seriesLabel,
  seriesUnit,
}: {
  result: MixedModelSuccess
  seriesLabel: string
  seriesUnit: string | null
}) {
  return (
    <div>
      <h3>{seriesLabel} cohort model</h3>
      <dl className="mixed-model-metrics">
        <div>
          <dt>Mean eGFR slope</dt>
          <dd>{formatSlope(result.fixedEffects.timeSinceBaseline, seriesUnit)}</dd>
        </div>
        <div>
          <dt>{result.fixedEffects.baselineAge !== undefined ? 'Baseline estimate at mean baseline age' : 'Baseline estimate'}</dt>
          <dd>{formatValue(result.fixedEffects.intercept, seriesUnit)}</dd>
        </div>
        <div>
          <dt>Model data</dt>
          <dd>{result.nPatients} patients, {result.nMeasurements} measurements</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{result.converged ? 'Converged' : 'Not converged'}</dd>
        </div>
      </dl>
      <table className="mixed-model-parameter-table" aria-label="Estimated model parameters">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Estimate</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Intercept</th>
            <td>{formatValue(result.fixedEffects.intercept, seriesUnit)}</td>
            <td>Estimated cohort baseline value.</td>
          </tr>
          <tr>
            <th scope="row">Time since baseline coefficient</th>
            <td>{formatSlope(result.fixedEffects.timeSinceBaseline, seriesUnit)}</td>
            <td>Estimated cohort-level annual change.</td>
          </tr>
          {result.fixedEffects.baselineAge !== undefined && (
            <tr>
              <th scope="row">Centered baseline age coefficient</th>
              <td>{formatNumber(result.fixedEffects.baselineAge)}</td>
              <td>Adjustment per baseline-age year relative to the modeled cohort mean baseline age.</td>
            </tr>
          )}
          <tr>
            <th scope="row">Patient intercept SD</th>
            <td>{formatOptionalNumber(result.randomEffects.interceptSd)}</td>
            <td>Between-patient variation around baseline value.</td>
          </tr>
          <tr>
            <th scope="row">Patient slope SD</th>
            <td>{formatOptionalNumber(result.randomEffects.slopeSd)}</td>
            <td>Between-patient variation around individual slopes.</td>
          </tr>
          <tr>
            <th scope="row">Intercept-slope correlation</th>
            <td>{formatOptionalNumber(result.randomEffects.interceptSlopeCorrelation)}</td>
            <td>Association between patient baseline level and patient slope.</td>
          </tr>
          <tr>
            <th scope="row">Residual SD</th>
            <td>{formatOptionalNumber(result.residualSd)}</td>
            <td>Remaining within-patient variation after model terms.</td>
          </tr>
        </tbody>
      </table>
      {result.warnings.length > 0 && (
        <div className="mixed-model-warnings">
          <h4>Warnings</h4>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="mixed-model-details">
        <summary>Technical fit details</summary>
        <dl>
          <div>
            <dt>Formula</dt>
            <dd>{result.metadata.formula}</dd>
          </div>
          <div>
            <dt>Engine</dt>
            <dd>{result.metadata.engine}</dd>
          </div>
          <div>
            <dt>Optimizer</dt>
            <dd>{result.metadata.optimizer}</dd>
          </div>
          <div>
            <dt>REML</dt>
            <dd>{result.metadata.reml ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Tolerance</dt>
            <dd>{result.metadata.tolerance}</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>R {result.metadata.runtimeVersion}</dd>
          </div>
          <div>
            <dt>Packages</dt>
            <dd>{formatPackageVersions(result.metadata.packageVersions)}</dd>
          </div>
          <div>
            <dt>Dataset</dt>
            <dd>
              {result.metadata.datasetId} ({result.metadata.datasetHash})
            </dd>
          </div>
          <div>
            <dt>Fit config</dt>
            <dd>{result.metadata.fitConfigHash}</dd>
          </div>
        </dl>
      </details>
    </div>
  )
}

function FailureResult({ result }: { result: MixedModelFailure }) {
  return (
    <div className="mixed-model-failure" role="alert">
      <h3>Fit failed</h3>
      <p>{result.message}</p>
      <p className="export-hint">
        {result.code} at {result.stage}
      </p>
    </div>
  )
}

function formatSlope(value: number, unit: string | null): string {
  const unitText = unit ? ` ${unit}` : ''
  return `${formatNumber(value)}${unitText}/yr`
}

function formatValue(value: number, unit: string | null): string {
  const unitText = unit ? ` ${unit}` : ''
  return `${formatNumber(value)}${unitText}`
}

function formatNumber(value: number): string {
  return value.toFixed(2)
}

function formatOptionalNumber(value: number | null): string {
  return value === null ? 'n/a' : formatNumber(value)
}

function formatPackageVersions(packageVersions: Record<string, string>): string {
  const entries = Object.entries(packageVersions)
  if (entries.length === 0) return 'n/a'
  return entries.map(([name, version]) => `${name} ${version}`).join(', ')
}
