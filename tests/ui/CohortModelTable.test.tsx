import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CohortModelTable } from '../../src/ui/cohort/CohortModelTable'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFormula } from '../../src/core/mixedModel/config'
import { buildMixedModelResultIdentity } from '../../src/core/mixedModel/resultIdentity'
import { useAppStore } from '../../src/ui/state/store'
import type { RunMixedModelWorkerJobOptions } from '../../src/core/mixedModel/browserClient'
import type { CohortModelEntityRows } from '../../src/core/mixedModel/cohortModelEntity'
import type {
  MixedModelResult,
  MixedModelSpikeRow,
  MixedModelSuccess,
} from '../../src/core/mixedModel/types'

function success(slope: number, converged = true): MixedModelSuccess {
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
    converged,
    warnings: [],
    nPatients: 3,
    nMeasurements: 6,
    fixedEffects: { intercept: 60, timeSinceBaseline: slope },
    fixedEffectConfidenceIntervals: { timeSinceBaseline: [slope - 0.5, slope + 0.5] },
    randomEffects: { interceptSd: 4.2, slopeSd: null, interceptSlopeCorrelation: null },
    residualSd: 2.1,
  }
}

function eligibleRows(prefix: string): MixedModelSpikeRow[] {
  const rows: MixedModelSpikeRow[] = []
  for (const [index, suffix] of (['a', 'b', 'c'] as const).entries()) {
    const id = `${prefix}${suffix}`
    const baselineAge = 50 + index
    rows.push({ patient_id: id, eGFR: 60, time_since_baseline: 0, baseline_age: baselineAge, baseline_age_centered: index - 1 })
    rows.push({ patient_id: id, eGFR: 55, time_since_baseline: 1, baseline_age: baselineAge, baseline_age_centered: index - 1 })
  }
  return rows
}

const cohortRows = eligibleRows('c')
const groupARows = eligibleRows('a')
// 1-patient group: fails the pooled validity gate (>= 3 patients).
const groupBRows: MixedModelSpikeRow[] = [
  { patient_id: 'b1', eGFR: 50, time_since_baseline: 0, baseline_age: 60, baseline_age_centered: 0 },
  { patient_id: 'b1', eGFR: 45, time_since_baseline: 2, baseline_age: 60, baseline_age_centered: 0 },
]

const entities: CohortModelEntityRows[] = [
  { entity: { kind: 'cohort' }, rows: cohortRows },
  { entity: { kind: 'group', value: 'A' }, rows: groupARows },
  { entity: { kind: 'group', value: 'B' }, rows: groupBRows },
]
const entityLabels = new Map([
  ['cohort', 'Whole cohort'],
  ['group:A', 'A'],
  ['group:B', 'B'],
])
const entityColors = new Map([
  ['group:A', '#2563eb'],
  ['group:B', '#dc2626'],
])

function renderTable(opts: {
  runJob?: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
  seed?: () => void
} = {}) {
  useAppStore.getState().reset()
  opts.seed?.()
  const runJob = opts.runJob ?? vi.fn(async () => success(-2))
  render(
    <CohortModelTable
      entities={entities}
      entityLabels={entityLabels}
      entityColors={entityColors}
      seriesIndex={0}
      seriesKey="eGFR|ml/min/1.73m2"
      seriesUnit="ml/min/1.73m2"
      fitConfigHash="fit12345"
      config={DEFAULT_MIXED_MODEL_CONFIG}
      formula={mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)}
      runJob={runJob}
    />,
  )
  return runJob
}

function rowByEntity(key: string): HTMLElement {
  const row = screen
    .getAllByTestId('cohort-model-row')
    .find((element) => element.getAttribute('data-entity') === key)
  if (!row) throw new Error(`no cohort-model row for ${key}`)
  return row
}

describe('CohortModelTable', () => {
  it('lists the cohort and groups in order; the ineligible group is disabled', () => {
    renderTable()
    const rows = screen.getAllByTestId('cohort-model-row')
    expect(rows.map((row) => row.getAttribute('data-entity'))).toEqual(['cohort', 'group:A', 'group:B'])
    expect(within(rowByEntity('cohort')).getByText('Whole cohort')).toBeInTheDocument()
    expect(within(rowByEntity('cohort')).getByText('Whole cohort').closest('td')).not.toHaveClass('cohort-model-unit')
    expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveClass('cohort-model-status')
    const bCheckbox = within(rowByEntity('group:B')).getByRole('checkbox')
    expect(bCheckbox).toBeDisabled()
    expect(within(rowByEntity('group:B')).getByTestId('cohort-model-status')).toHaveTextContent('Too few data to fit')
  })

  it('fits all selected eligible units via the store and never the ineligible one', async () => {
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(async () => success(-2))
    renderTable({ runJob })
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))

    await waitFor(() => expect(useAppStore.getState().cohortModelResults).not.toBeNull())
    expect(runJob).toHaveBeenCalledTimes(2) // cohort + A, never B
    for (const call of runJob.mock.calls) expect(call[0].rows).not.toBe(groupBRows)
    expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('-2.00 ml/min/1.73m2/yr')
    expect(within(rowByEntity('group:A')).getByTestId('cohort-model-status')).toHaveTextContent('-2.00 ml/min/1.73m2/yr')
  })

  it('shows simple progress while selected units are fitting sequentially', async () => {
    const pending: Array<{ resolve: (result: MixedModelResult) => void }> = []
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(
      async () => new Promise<MixedModelResult>((resolve) => pending.push({ resolve })),
    )
    renderTable({ runJob })
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))

    expect(screen.getByRole('status')).toHaveTextContent('0 of 2 fits complete.')
    expect(screen.getByRole('button', { name: 'Fitting 1 of 2' })).toBeDisabled()

    pending[0].resolve(success(-2))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 fits complete.'))
    expect(screen.getByRole('button', { name: 'Fitting 2 of 2' })).toBeDisabled()

    pending[1].resolve(success(-2))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Fit selected' })).toBeEnabled()
  })

  it('submits only the selected units', async () => {
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(async () => success(-2))
    renderTable({ runJob })
    // Deselect group A, leaving only the cohort selected.
    await userEvent.click(within(rowByEntity('group:A')).getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))

    await waitFor(() => expect(runJob).toHaveBeenCalled())
    expect(runJob).toHaveBeenCalledTimes(1)
    expect(runJob.mock.calls[0][0].rows).toBe(cohortRows)
  })

  it('ignores a stored result whose identity no longer matches the current rows', () => {
    renderTable({
      seed: () => {
        const staleIdentity = buildMixedModelResultIdentity({
          seriesIndex: 0,
          seriesKey: 'eGFR|ml/min/1.73m2',
          patientIds: cohortRows.map((row) => row.patient_id),
          rows: cohortRows,
          fitConfigHash: 'STALE-HASH',
        })
        useAppStore.setState({ cohortModelResults: { cohort: { result: success(-9), identity: staleIdentity } } })
      },
    })
    expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('Not fitted')
  })

  it('expands technical details for a fitted unit', async () => {
    renderTable()
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))
    await waitFor(() =>
      expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('/yr'),
    )

    await userEvent.click(within(rowByEntity('cohort')).getByRole('button', { name: 'Details' }))
    expect(screen.getByText('Patient intercept SD')).toBeInTheDocument()
    expect(screen.getByText('4.20')).toBeInTheDocument()
  })
})
