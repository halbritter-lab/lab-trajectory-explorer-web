import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CohortMixedModelPanel } from '../../src/ui/cohort/CohortMixedModelPanel'
import {
  DEFAULT_MIXED_MODEL_CONFIG,
  mixedModelConfigLabel,
  mixedModelFormula,
  mixedModelFormulaKey,
} from '../../src/core/mixedModel/config'
import { buildMixedModelResultIdentity } from '../../src/core/mixedModel/resultIdentity'
import { syntheticMixedModelRows } from '../../src/core/mixedModel/syntheticData'
import { hashString } from '../../src/core/mixedModel/validation'
import type { RunMixedModelWorkerJobOptions } from '../../src/core/mixedModel/browserClient'
import type { MixedModelConfig } from '../../src/core/mixedModel/config'
import {
  MIXED_MODEL_FORMULA,
  MIXED_MODEL_TOLERANCE,
  type MixedModelResult,
  type MixedModelSpikeRow,
  type MixedModelSuccess,
} from '../../src/core/mixedModel/types'
import type { MixedModelResultIdentity } from '../../src/core/mixedModel/resultIdentity'
import type { StoredMixedModelResult } from '../../src/ui/state/store'

const rows = syntheticMixedModelRows()
const patientIds = ['p1', 'p2', 'p3', 'p4']
const fitConfigHash = hashString(
  JSON.stringify({ engine: 'webr-lme4', formula: MIXED_MODEL_FORMULA, reml: true, tolerance: MIXED_MODEL_TOLERANCE }),
)

function renderPanel(
  props: Partial<{
    rows: MixedModelSpikeRow[]
    seriesIndex: number
    seriesKey: string
    currentIdentity: MixedModelResultIdentity | null
    currentResult: MixedModelResult | null
    onResult: (value: StoredMixedModelResult) => void
    runJob: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
    fitConfigHash: string
    config: MixedModelConfig
    formula: string
    formulaLabel: string
    dataPolicySummary: string
    validateConfig: (config: MixedModelConfig) => string | null
    onConfigChange: (config: MixedModelConfig) => void
    onConfigFit: (config: MixedModelConfig) => void
  }> = {},
) {
  const config = props.config ?? DEFAULT_MIXED_MODEL_CONFIG
  return render(
    <CohortMixedModelPanel
      rows={props.rows ?? rows}
      seriesIndex={props.seriesIndex ?? 0}
      seriesLabel="eGFR"
      seriesUnit="ml/min/1.73m2"
      seriesKey={props.seriesKey ?? 'eGFR|ml/min/1.73m2'}
      patientIds={patientIds}
      currentIdentity={props.currentIdentity}
      currentResult={props.currentResult}
      onResult={props.onResult ?? vi.fn()}
      runJob={props.runJob}
      fitConfigHash={props.fitConfigHash ?? fitConfigHash}
      config={config}
      formula={props.formula ?? mixedModelFormula(config)}
      formulaLabel={props.formulaLabel ?? mixedModelConfigLabel(config)}
      dataPolicySummary={props.dataPolicySummary ?? 'Uses selected patients.'}
      validateConfig={props.validateConfig ?? (() => null)}
      onConfigChange={props.onConfigChange ?? vi.fn()}
      onConfigFit={props.onConfigFit ?? vi.fn()}
    />,
  )
}

function successResult(overrides: Partial<MixedModelSuccess> = {}): MixedModelSuccess {
  return {
    status: 'success',
    metadata: {
      engine: 'webr-lme4',
      formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
      runtimeVersion: '4.6.0',
      packageVersions: { lme4: '1.1-35' },
      browserUserAgent: 'vitest',
      wasmAssetSource: 'cdn',
      optimizer: 'nloptwrap',
      reml: true,
      tolerance: 0.000001,
      datasetId: 'cohort',
      datasetHash: 'abc12345',
      randomSeed: null,
      fitConfigHash: 'fit12345',
    },
    converged: true,
    warnings: ['boundary (singular) fit'],
    nPatients: 4,
    nMeasurements: 16,
    fixedEffects: {
      intercept: 59.9364,
      timeSinceBaseline: -3.2675,
      baselineAge: -0.4,
      ...overrides.fixedEffects,
    },
    randomEffects: {
      interceptSd: 4.2,
      slopeSd: 1.1,
      interceptSlopeCorrelation: -0.2,
    },
    residualSd: 2.4,
    ...overrides,
  }
}

function identityFor({
  identityRows = rows,
  seriesIndex = 0,
  seriesKey = 'eGFR|ml/min/1.73m2',
  hash = fitConfigHash,
}: {
  identityRows?: MixedModelSpikeRow[]
  seriesIndex?: number
  seriesKey?: string
  hash?: string
} = {}) {
  return buildMixedModelResultIdentity({ seriesIndex, seriesKey, patientIds, rows: identityRows, fitConfigHash: hash })
}

describe('CohortMixedModelPanel', () => {
  it('runs the injected job and renders formatted success metrics', async () => {
    const result = successResult()
    const onResult = vi.fn()
    const runJob = vi.fn().mockResolvedValue(result)

    renderPanel({ onResult, runJob })
    expect(screen.queryByRole('button', { name: /fit cohort model/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /fit model/i }))

    expect(runJob).toHaveBeenCalledWith(expect.objectContaining({ engine: 'webr-lme4' }))
    expect(screen.getByRole('region', { name: /cohort mixed model/i })).toHaveClass('mixed-model-panel')
    expect(screen.getByText(/Uses selected patients/i)).toBeInTheDocument()
    expect(await screen.findAllByText('-3.27 ml/min/1.73m2/yr')).toHaveLength(2)
    expect(screen.getAllByText('59.94 ml/min/1.73m2')).toHaveLength(2)
    expect(screen.getByText('4 patients, 16 measurements')).toBeInTheDocument()
    expect(screen.getByText(/random patient intercept\/slope/i)).toBeInTheDocument()
    expect(screen.getByText('boundary (singular) fit')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Estimated model parameters' })).toBeInTheDocument()
    expect(screen.getByText(/Baseline age coefficient/i)).toBeInTheDocument()
    expect(screen.getByText('-0.40')).toBeInTheDocument()
    expect(screen.getByText('Formula')).toBeInTheDocument()
    expect(screen.getByText('eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)')).toBeInTheDocument()
    expect(screen.getByText(/Time since baseline coefficient/i)).toBeInTheDocument()
    expect(screen.getByText(/Patient intercept SD/i)).toBeInTheDocument()
    expect(screen.getByText('4.20')).toBeInTheDocument()
    expect(screen.getByText(/Patient slope SD/i)).toBeInTheDocument()
    expect(screen.getByText('1.10')).toBeInTheDocument()
    expect(screen.getByText(/Intercept-slope correlation/i)).toBeInTheDocument()
    expect(screen.getByText('-0.20')).toBeInTheDocument()
    expect(screen.getByText(/Residual SD/i)).toBeInTheDocument()
    expect(screen.getByText('2.40')).toBeInTheDocument()
    expect(screen.getByText(/Optimizer/i)).toBeInTheDocument()
    expect(screen.getByText('nloptwrap')).toBeInTheDocument()
    expect(screen.getByText(/Packages/i)).toBeInTheDocument()
    expect(screen.getByText('lme4 1.1-35')).toBeInTheDocument()
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ result }))
  })

  it('applies inline mixed model settings without opening another modal', async () => {
    const onConfigChange = vi.fn()
    renderPanel({ onConfigChange })

    expect(screen.queryByRole('dialog', { name: /configure cohort mixed model/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/patient intercept$/i))
    await userEvent.click(screen.getByRole('button', { name: /apply settings/i }))

    expect(onConfigChange).toHaveBeenCalledWith({
      timeAxis: 'time_since_baseline',
      covariates: ['baseline_age'],
      randomEffects: 'intercept',
    })
  })

  it('fits from the configure modal after parent config propagation', async () => {
    const nextConfig: MixedModelConfig = {
      timeAxis: 'time_since_baseline',
      covariates: ['baseline_age'],
      randomEffects: 'intercept',
    }
    const nextFitConfigHash = 'fit-policy-intercept'
    const onConfigFit = vi.fn()
    const onResult = vi.fn()
    const runJob = vi.fn().mockResolvedValue(successResult())

    const { rerender } = renderPanel({
      fitConfigHash: 'fit-policy-intercept-slope',
      onConfigFit,
      onResult,
      runJob,
    })

    await userEvent.click(screen.getByLabelText(/patient intercept$/i))
    await userEvent.click(screen.getByRole('button', { name: /fit model/i }))

    expect(onConfigFit).toHaveBeenCalledWith(nextConfig)
    expect(runJob).not.toHaveBeenCalled()

    rerender(
      <CohortMixedModelPanel
        rows={rows}
        seriesIndex={0}
        seriesLabel="eGFR"
        seriesUnit="ml/min/1.73m2"
        seriesKey="eGFR|ml/min/1.73m2"
        patientIds={patientIds}
        onResult={onResult}
        runJob={runJob}
        fitConfigHash={nextFitConfigHash}
        config={nextConfig}
        formula={mixedModelFormula(nextConfig)}
        formulaLabel={mixedModelConfigLabel(nextConfig)}
        dataPolicySummary="Uses selected patients."
        validateConfig={() => null}
        onConfigChange={vi.fn()}
        onConfigFit={onConfigFit}
      />,
    )

    await waitFor(() => expect(runJob).toHaveBeenCalledTimes(1))
    expect(runJob).toHaveBeenCalledWith(expect.objectContaining({
      config: nextConfig,
      formula: mixedModelFormula(nextConfig),
      formulaKey: mixedModelFormulaKey(nextConfig),
      fitConfigHash: nextFitConfigHash,
    }))
  })

  it('disables the button and explains validation failures for too-few-patients data', () => {
    const tooFewPatients: MixedModelSpikeRow[] = [
      { patient_id: 'p1', eGFR: 60, time_since_baseline: 0, baseline_age: 50, baseline_age_centered: 0 },
      { patient_id: 'p1', eGFR: 58, time_since_baseline: 1, baseline_age: 50, baseline_age_centered: 0 },
    ]

    renderPanel({ rows: tooFewPatients, runJob: vi.fn() })

    expect(screen.getByRole('button', { name: /fit model/i })).toBeDisabled()
    expect(screen.getByText(/at least 3 patients/i)).toBeInTheDocument()
  })

  it('renders concise failure details when injected job rejects', async () => {
    const onResult = vi.fn()
    const runJob = vi.fn().mockRejectedValue(new Error('worker crashed'))

    renderPanel({ onResult, runJob })
    await userEvent.click(screen.getByRole('button', { name: /fit model/i }))

    expect(await screen.findByText('Fit failed')).toBeInTheDocument()
    expect(screen.getByText(/worker crashed/)).toBeInTheDocument()
    expect(screen.getByText(/MIXED_MODEL_JOB_FAILED/)).toBeInTheDocument()
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({ status: 'runtime-error', code: 'MIXED_MODEL_JOB_FAILED' }),
      }),
    )
  })

  it('aborts active job on unmount', async () => {
    let signal: AbortSignal | undefined
    const runJob = vi.fn((options: RunMixedModelWorkerJobOptions) => {
      signal = options.signal
      return new Promise<never>(() => undefined)
    })

    const { unmount } = renderPanel({ runJob })
    await userEvent.click(screen.getByRole('button', { name: /fit model/i }))

    expect(signal).toBeDefined()
    expect(signal?.aborted).toBe(false)

    unmount()

    expect(signal?.aborted).toBe(true)
  })

  it('aborts and ignores an active job when fit identity inputs change', async () => {
    let signal: AbortSignal | undefined
    let resolveJob: ((result: MixedModelResult) => void) | undefined
    const onResult = vi.fn()
    const runJob = vi.fn((options: RunMixedModelWorkerJobOptions) => {
      signal = options.signal
      return new Promise<MixedModelResult>((resolve) => {
        resolveJob = resolve
      })
    })

    const { rerender } = render(
      <CohortMixedModelPanel
        rows={rows}
        seriesIndex={0}
        seriesLabel="eGFR"
        seriesUnit="ml/min/1.73m2"
        seriesKey="eGFR|ml/min/1.73m2"
        patientIds={patientIds}
        onResult={onResult}
        runJob={runJob}
        fitConfigHash={fitConfigHash}
        config={DEFAULT_MIXED_MODEL_CONFIG}
        formula={mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)}
        formulaLabel={mixedModelConfigLabel(DEFAULT_MIXED_MODEL_CONFIG)}
        dataPolicySummary="Uses selected patients."
        validateConfig={() => null}
        onConfigChange={vi.fn()}
        onConfigFit={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /fit model/i }))

    rerender(
      <CohortMixedModelPanel
        rows={rows}
        seriesIndex={1}
        seriesLabel="eGFR"
        seriesUnit="ml/min/1.73m2"
        seriesKey="eGFR|alternate"
        patientIds={patientIds}
        onResult={onResult}
        runJob={runJob}
        fitConfigHash="fit-policy-2"
        config={DEFAULT_MIXED_MODEL_CONFIG}
        formula={mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)}
        formulaLabel={mixedModelConfigLabel(DEFAULT_MIXED_MODEL_CONFIG)}
        dataPolicySummary="Uses selected patients."
        validateConfig={() => null}
        onConfigChange={vi.fn()}
        onConfigFit={vi.fn()}
      />,
    )

    expect(signal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: /fit model/i })).toBeEnabled()

    await act(async () => {
      resolveJob?.(successResult())
      await Promise.resolve()
    })
    expect(onResult).not.toHaveBeenCalled()
  })

  it('aborts and ignores an active job when only the fit policy hash changes', async () => {
    let signal: AbortSignal | undefined
    let resolveJob: ((result: MixedModelResult) => void) | undefined
    const onResult = vi.fn()
    const runJob = vi.fn((options: RunMixedModelWorkerJobOptions) => {
      signal = options.signal
      return new Promise<MixedModelResult>((resolve) => {
        resolveJob = resolve
      })
    })

    const { rerender } = render(
      <CohortMixedModelPanel
        rows={rows}
        seriesIndex={0}
        seriesLabel="eGFR"
        seriesUnit="ml/min/1.73m2"
        seriesKey="eGFR|ml/min/1.73m2"
        patientIds={patientIds}
        onResult={onResult}
        runJob={runJob}
        fitConfigHash="fit-policy-1"
        config={DEFAULT_MIXED_MODEL_CONFIG}
        formula={mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)}
        formulaLabel={mixedModelConfigLabel(DEFAULT_MIXED_MODEL_CONFIG)}
        dataPolicySummary="Uses selected patients."
        validateConfig={() => null}
        onConfigChange={vi.fn()}
        onConfigFit={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /fit model/i }))

    rerender(
      <CohortMixedModelPanel
        rows={rows}
        seriesIndex={0}
        seriesLabel="eGFR"
        seriesUnit="ml/min/1.73m2"
        seriesKey="eGFR|ml/min/1.73m2"
        patientIds={patientIds}
        onResult={onResult}
        runJob={runJob}
        fitConfigHash="fit-policy-2"
        config={DEFAULT_MIXED_MODEL_CONFIG}
        formula={mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)}
        formulaLabel={mixedModelConfigLabel(DEFAULT_MIXED_MODEL_CONFIG)}
        dataPolicySummary="Uses selected patients."
        validateConfig={() => null}
        onConfigChange={vi.fn()}
        onConfigFit={vi.fn()}
      />,
    )

    expect(signal?.aborted).toBe(true)

    await act(async () => {
      resolveJob?.(successResult({ fixedEffects: { intercept: 59.9364, timeSinceBaseline: -7.5 } }))
      await Promise.resolve()
    })

    expect(onResult).not.toHaveBeenCalled()
    expect(screen.queryByText('-7.50 ml/min/1.73m2/yr')).not.toBeInTheDocument()
  })

  it('prefers a freshly published local result over an older matching current result', async () => {
    const currentResult = successResult({ fixedEffects: { intercept: 59.9364, timeSinceBaseline: -1.234 } })
    const localResult = successResult({ fixedEffects: { intercept: 59.9364, timeSinceBaseline: -4.5 } })
    const runJob = vi.fn().mockResolvedValue(localResult)

    renderPanel({
      currentIdentity: identityFor(),
      currentResult,
      runJob,
    })

    expect(screen.getAllByText('-1.23 ml/min/1.73m2/yr')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: /fit model/i }))

    expect(await screen.findAllByText('-4.50 ml/min/1.73m2/yr')).toHaveLength(2)
    expect(screen.queryByText('-1.23 ml/min/1.73m2/yr')).not.toBeInTheDocument()
  })

  it('clears locally cached success metrics when the parent store result is invalidated', async () => {
    const localResult = successResult({ fixedEffects: { intercept: 59.9364, timeSinceBaseline: -4.5 } })
    const runJob = vi.fn().mockResolvedValue(localResult)

    const { rerender } = renderPanel({
      currentIdentity: identityFor(),
      currentResult: successResult({ fixedEffects: { intercept: 59.9364, timeSinceBaseline: -1.234 } }),
      runJob,
    })

    await userEvent.click(screen.getByRole('button', { name: /fit model/i }))

    expect(await screen.findAllByText('-4.50 ml/min/1.73m2/yr')).toHaveLength(2)

    rerender(
      <CohortMixedModelPanel
        rows={rows}
        seriesIndex={0}
        seriesLabel="eGFR"
        seriesUnit="ml/min/1.73m2"
        seriesKey="eGFR|ml/min/1.73m2"
        patientIds={patientIds}
        currentIdentity={null}
        currentResult={null}
        onResult={vi.fn()}
        runJob={runJob}
        fitConfigHash={fitConfigHash}
        config={DEFAULT_MIXED_MODEL_CONFIG}
        formula={mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)}
        formulaLabel={mixedModelConfigLabel(DEFAULT_MIXED_MODEL_CONFIG)}
        dataPolicySummary="Uses selected patients."
        validateConfig={() => null}
        onConfigChange={vi.fn()}
        onConfigFit={vi.fn()}
      />,
    )

    expect(screen.queryByText('-4.50 ml/min/1.73m2/yr')).not.toBeInTheDocument()
    expect(screen.queryByText('-1.23 ml/min/1.73m2/yr')).not.toBeInTheDocument()
  })

  it('recovers the button under StrictMode after effect replay', async () => {
    const runJob = vi.fn().mockResolvedValue(successResult())

    render(
      <StrictMode>
        <CohortMixedModelPanel
          rows={rows}
          seriesIndex={0}
          seriesLabel="eGFR"
          seriesUnit="ml/min/1.73m2"
          seriesKey="eGFR|ml/min/1.73m2"
          patientIds={patientIds}
          onResult={vi.fn()}
          runJob={runJob}
          fitConfigHash={fitConfigHash}
          config={DEFAULT_MIXED_MODEL_CONFIG}
          formula={mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)}
          formulaLabel={mixedModelConfigLabel(DEFAULT_MIXED_MODEL_CONFIG)}
          dataPolicySummary="Uses selected patients."
          validateConfig={() => null}
          onConfigChange={vi.fn()}
          onConfigFit={vi.fn()}
        />
      </StrictMode>,
    )
    await userEvent.click(screen.getByRole('button', { name: /fit model/i }))

    expect(await screen.findAllByText('-3.27 ml/min/1.73m2/yr')).toHaveLength(2)
    await waitFor(() => expect(screen.getByRole('button', { name: /fit model/i })).toBeEnabled())
  })
})
