import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CohortModelTable } from '../../../src/workspace/models/CohortModelTable'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFormula } from '../../../src/core/mixedModel/config'
import { buildMixedModelResultIdentity } from '../../../src/core/mixedModel/resultIdentity'
import { hashMixedModelInput, validateMixedModelRows } from '../../../src/core/mixedModel/validation'
import { useAppStore } from '../../../src/workspace/state/store'
import { formatWorkspaceNumber } from '../../../src/workspace/WorkspacePlot'
import type { RunMixedModelWorkerJobOptions } from '../../../src/core/mixedModel/browserClient'
import type { CohortModelEntityRows } from '../../../src/core/mixedModel/cohortModelEntity'
import type {
  MixedModelResult,
  MixedModelSpikeRow,
  MixedModelSuccess,
} from '../../../src/core/mixedModel/types'

function success(slope: number, converged = true): MixedModelSuccess {
  return {
    status: 'success',
    metadata: {
      engine: 'webr-lme4',
      formula: 'value ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
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
    singular: false,
    warnings: [],
    nPatients: 10,
    nMeasurements: 30,
    fixedEffects: { intercept: 60, timeSinceBaseline: slope },
    fixedEffectConfidenceIntervals: { timeSinceBaseline: [slope - 0.5, slope + 0.5] },
    fixedEffectTerms: [{ term: '(Intercept)', estimate: 60, confidenceInterval: [55, 65] }, { term: 'time_since_baseline', estimate: slope, confidenceInterval: [slope - 0.5, slope + 0.5] }],
    randomEffects: { interceptSd: 4.2, slopeSd: null, interceptSlopeCorrelation: null },
    residualSd: 2.1,
  }
}

function eligibleRows(prefix: string): MixedModelSpikeRow[] {
  const rows: MixedModelSpikeRow[] = []
  for (const index of Array.from({length:10},(_,index)=>index)) {
    const id = `${prefix}${index}`
    const baselineAge = 50 + index
    rows.push({ patient_id: id, value: 60, time_since_baseline: 0, baseline_age: baselineAge, baseline_age_centered: index - 1 })
    rows.push({ patient_id: id, value: 55, time_since_baseline: 1, baseline_age: baselineAge, baseline_age_centered: index - 1 })
    rows.push({ patient_id: id, value: 50, time_since_baseline: 2, baseline_age: baselineAge, baseline_age_centered: index - 1 })
  }
  return rows
}

const cohortRows = eligibleRows('c')
const groupARows = eligibleRows('a')
// 1-patient group: fails the pooled validity gate (>= 10 patients).
const groupBRows: MixedModelSpikeRow[] = [
  { patient_id: 'b1', value: 50, time_since_baseline: 0, baseline_age: 60, baseline_age_centered: 0 },
  { patient_id: 'b1', value: 45, time_since_baseline: 2, baseline_age: 60, baseline_age_centered: 0 },
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
  slopeDecimals?: number
  entities?: CohortModelEntityRows[]
} = {}) {
  useAppStore.getState().reset()
  opts.seed?.()
  const runJob = opts.runJob ?? vi.fn(async () => success(-2))
  render(
    <CohortModelTable
      entities={opts.entities ?? entities}
      entityLabels={entityLabels}
      entityColors={entityColors}
      seriesIndex={0}
      seriesKey="eGFR|ml/min/1.73m2"
      seriesUnit="ml/min/1.73m2"
      sourceResponse={{outcome:'eGFR',unit:'ml/min/1.73m2'}}
      fitConfigHash="fit12345"
      config={DEFAULT_MIXED_MODEL_CONFIG}
      formula={mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)}
      slopeDecimals={opts.slopeDecimals}
      runJob={async (options) => {
        const result = await runJob(options)
        if (result.status !== 'success') return result
        return {...result,metadata:{...result.metadata,datasetHash:hashMixedModelInput(options.rows),fitConfigHash:'fit12345'}}
      }}
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
  it('explains an inconsistent source fit and blocks its projection export', async () => {
    renderTable({seed:() => {
      const identity = buildMixedModelResultIdentity({seriesIndex:0,seriesKey:'eGFR|ml/min/1.73m2',patientIds:cohortRows.map((row) => row.patient_id),rows:cohortRows,fitConfigHash:'fit12345'})
      useAppStore.setState({cohortModelResults:{cohort:{identity,result:success(-2)}}})
    }})
    expect(await screen.findByRole('alert')).toHaveTextContent('Projection source fit or prepared rows are stale.')
    expect(screen.getByRole('button',{name:'Export models (xlsx)'})).toBeDisabled()
  })
  it('blocks model export during projection drafts and preserves applied values across collapse', async () => {
    renderTable()
    await userEvent.click(screen.getByRole('button',{name:'Fit selected'}))
    await userEvent.click(within(rowByEntity('cohort')).getByRole('button',{name:'Details'}))
    const reference = await screen.findByLabelText('Reference time (years)')
    await userEvent.clear(reference)
    await userEvent.type(reference,'2')
    expect(screen.getByRole('button',{name:'Export models (xlsx)'})).toBeDisabled()
    await userEvent.click(screen.getByRole('button',{name:'Apply projection settings'}))
    expect(screen.getByRole('button',{name:'Export models (xlsx)'})).toBeEnabled()
    await userEvent.click(within(rowByEntity('cohort')).getByRole('button',{name:'Details'}))
    await userEvent.click(within(rowByEntity('cohort')).getByRole('button',{name:'Details'}))
    expect(screen.getByLabelText('Reference time (years)')).toHaveValue(2)
  })
  it('lists the cohort and groups in order; the ineligible group is disabled', () => {
    renderTable()
    const rows = screen.getAllByTestId('cohort-model-row')
    expect(rows.map((row) => row.getAttribute('data-entity'))).toEqual(['cohort', 'group:A', 'group:B'])
    expect(within(rowByEntity('cohort')).getByText('Whole cohort')).toBeInTheDocument()
    expect(within(rowByEntity('cohort')).getByText('Whole cohort').closest('td')).not.toHaveClass('cohort-model-unit')
    expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveClass('cohort-model-status')
    const bCheckbox = within(rowByEntity('group:B')).getByRole('checkbox')
    expect(bCheckbox).toBeDisabled()
    expect(within(rowByEntity('group:B')).getByTestId('cohort-model-status')).toHaveTextContent('Mixed model fitting requires at least 10 patients.')
  })

  it('fits all selected eligible units via the store and never the ineligible one', async () => {
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(async () => success(-2))
    renderTable({ runJob })
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))

    await waitFor(() => expect(useAppStore.getState().cohortModelResults).not.toBeNull())
    expect(runJob).toHaveBeenCalledTimes(2) // cohort + A, never B
    for (const call of runJob.mock.calls) expect(call[0].rows).not.toBe(groupBRows)
    expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent(/^Fitted/)
    expect(within(rowByEntity('group:A')).getByTestId('cohort-model-status')).toHaveTextContent(/^Fitted/)
  })

  it('rounds slope and intercept like the preview legend', async () => {
    // -9.985 is stored slightly below -9.985 in binary: toFixed(2) gave -9.98
    // while the legend's formatter gives -9.99. Both now use the same formatter.
    renderTable({ runJob: vi.fn(async () => ({ ...success(-9.985), fixedEffects: { intercept: 1234.5, timeSinceBaseline: -9.985 } })) })
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))
    await waitFor(() => expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('Fitted'))
    const cells = within(rowByEntity('cohort')).getAllByRole('cell')
    expect(cells[4]).toHaveTextContent(`${formatWorkspaceNumber(-9.985)} ml/min/1.73m2/yr`)
    expect(cells[4]).toHaveTextContent('-9.99 ml/min/1.73m2/yr')
    expect(cells[5]).toHaveTextContent('1,234.50 ml/min/1.73m2')
    // The 95% interval stands beside the estimate; the reading note and the technical record follow.
    expect(cells[4]).toHaveTextContent('[-10.49, -9.49]')
    // K35 (2026-11-22): estimate and bounds of the starting level with the same decimals.
    expect(cells[5]).toHaveTextContent('95% interval [55.00, 65.00]')
    expect(screen.getByRole('columnheader', { name: 'Change per year' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Group' })).toBeInTheDocument()
    expect(screen.getByTestId('interval-reading')).toHaveTextContent(/do not report it as a p-value/)
  })

  it('writes slope, interval, coefficients and slope SD with the decimals of the parameter', async () => {
    const fitted = { ...success(0.0904), randomEffects: { interceptSd: 4.2, slopeSd: 0.01234, interceptSlopeCorrelation: null } }
    fitted.fixedEffectConfidenceIntervals = { timeSinceBaseline: [0.0496, 0.1312] }
    fitted.fixedEffectTerms = [{ term: '(Intercept)', estimate: 1.2, confidenceInterval: [1.05, 1.35] }, { term: 'time_since_baseline', estimate: 0.0904, confidenceInterval: [0.0496, 0.1312] }]
    renderTable({ slopeDecimals: 3, runJob: vi.fn(async () => fitted) })
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))
    await waitFor(() => expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('Fitted'))
    const cells = within(rowByEntity('cohort')).getAllByRole('cell')
    // Before: "0.09 ... [0.05, 0.13]" here and "0.090 [0.05, 0.13]" among the coefficients.
    expect(cells[4]).toHaveTextContent('+0.090 ml/min/1.73m2/yr 95% interval [0.050, 0.131]')
    // The starting level and its bounds take the decimals of its coefficient row (2026-11-22;
    // before, the general display rounding: "60 ml/min/1.73m2 95% interval [1.05, 1.35]").
    expect(cells[5]).toHaveTextContent('60.000 ml/min/1.73m2 95% interval [1.050, 1.350]')
    await userEvent.click(within(rowByEntity('cohort')).getByRole('button', { name: 'Details' }))
    const coefficients = within(screen.getByRole('table', { name: 'Fixed effect coefficients' })).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell').slice(1).map(cell => cell.textContent))
    expect(coefficients).toEqual([['1.200', '[1.050, 1.350]'], ['0.090', '[0.050, 0.131]']])
    expect(screen.getByText('Patient slope SD').nextElementSibling).toHaveTextContent(/^0\.012$/)
  })

  // K34 (2026-11-22): the input warning in plain words with the patients concerned; the stored
  // (exported) text stays as it was, and a warning from R is shown as recorded.
  it('explains an input warning of the model check and names up to five patients', async () => {
    const singles: MixedModelSpikeRow[] = Array.from({ length: 7 }, (_, index) => ({ patient_id: `s${index}`, value: 50, time_since_baseline: 0, baseline_age: 60, baseline_age_centered: 0 }))
    const rows = [...cohortRows, ...singles]
    const recorded = validateMixedModelRows(rows, DEFAULT_MIXED_MODEL_CONFIG)
    expect(recorded).toEqual({ ok: true, warnings: ['7 patients have fewer than 2 repeated measurements and contribute limited within-patient information.'] })
    const runJob = vi.fn(async () => ({ ...success(-2), warnings: [...(recorded.ok ? recorded.warnings : []), 'Model failed to converge with max|grad| = 0.002'] }))
    renderTable({ runJob, entities: [{ entity: { kind: 'cohort' }, rows }] })
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))
    await waitFor(() => expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('Fitted'))
    await userEvent.click(within(rowByEntity('cohort')).getByRole('button', { name: 'Details' }))
    expect(screen.getByText('7 patients have a single measurement in this model. They count towards the starting level but say nothing about the change over time within the patient. Patients: s0, s1, s2, s3, s4 and 2 more.')).toBeInTheDocument()
    expect(screen.getByText('Model failed to converge with max|grad| = 0.002')).toBeInTheDocument()
    expect(screen.queryByText(/fewer than 2 repeated measurements/)).not.toBeInTheDocument()
    expect(useAppStore.getState().cohortModelResults?.cohort.result.warnings[0]).toBe(recorded.ok ? recorded.warnings[0] : '')
  })

  it('writes coefficients and their intervals with two decimals by default', async () => {
    renderTable()
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))
    await waitFor(() => expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('Fitted'))
    expect(within(rowByEntity('cohort')).getAllByRole('cell')[4]).toHaveTextContent('-2.00 ml/min/1.73m2/yr 95% interval [-2.50, -1.50]')
    await userEvent.click(within(rowByEntity('cohort')).getByRole('button', { name: 'Details' }))
    expect(screen.getByRole('table', { name: 'Fixed effect coefficients' })).toHaveTextContent('-2.00[-2.50, -1.50]')
  })

  it('keeps the subset fit action secondary under a section heading', () => {
    renderTable()
    expect(screen.getByRole('button', { name: 'Fit selected' })).not.toHaveClass('primary')
    expect(screen.getByRole('heading', { level: 2, name: 'Model results' })).toBeInTheDocument()
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
      expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('Fitted'),
    )

    await userEvent.click(within(rowByEntity('cohort')).getByRole('button', { name: 'Details' }))
    expect(screen.getByText('Patient intercept SD')).toBeInTheDocument()
    expect(screen.getByText('4.2')).toBeInTheDocument()
  })

  it('renders long technical details in dedicated wrapping cells', async () => {
    renderTable({
      runJob: vi.fn(async () => ({
        ...success(-2),
        metadata: {
          ...success(-2).metadata,
          formula: 'value ~ time_since_baseline + baseline_age_centered + (1 + time_since_baseline | patient_id)',
          datasetHash: 'very-long-dataset-hash-without-natural-breakpoints-1234567890abcdef',
          fitConfigHash: 'very-long-fit-config-hash-without-natural-breakpoints-abcdef1234567890',
        },
      })),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Fit selected' }))
    await waitFor(() =>
      expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('Fitted'),
    )

    await userEvent.click(within(rowByEntity('cohort')).getByRole('button', { name: 'Details' }))

    const detailsRow = screen.getByTestId('cohort-model-details')
    expect(detailsRow).toHaveClass('cohort-model-details-row')
    expect(within(detailsRow).getByTestId('cohort-model-details-cell')).toHaveClass('cohort-model-details-cell')
    expect(screen.getByTestId('cohort-model-detail-formula')).toHaveClass('cohort-model-detail-item-wide')
    expect(screen.getByTestId('cohort-model-detail-fit-config')).toHaveClass('cohort-model-detail-item-wide')
    expect(screen.getByTestId('cohort-model-detail-dataset')).toHaveClass('cohort-model-detail-item-wide')
    expect(screen.getAllByTestId('cohort-model-detail-value').length).toBeGreaterThan(0)
  })
})

it('shows all stored coefficients and enables export only after a fit', async () => {
  const fitted = success(-2)
  fitted.metadata.modelConfig = {...DEFAULT_MIXED_MODEL_CONFIG, factors:[{key:'genotype',kind:'categorical',effect:'level_slope',reference:'A'}]}
  fitted.fixedEffectTerms = [{term:'time_since_baseline:factor_0_B',estimate:-3,confidenceInterval:[-4,-2]}]
  fitted.warnings = ['Boundary singular fit']
  renderTable({runJob:async () => fitted})
  expect(screen.getByRole('button',{name:'Export models (xlsx)'})).toBeDisabled()
  await userEvent.click(screen.getByRole('button',{name:'Fit selected'}))
  await waitFor(() => expect(screen.getByRole('button',{name:'Export models (xlsx)'})).toBeEnabled())
  await userEvent.click(screen.getAllByRole('button',{name:'Details'})[0])
  expect(screen.getByRole('table',{name:'Fixed effect coefficients'})).toHaveTextContent('Slope \u00d7 genotype: B (reference A)')
  expect(screen.getByText('Boundary singular fit')).toBeInTheDocument()
})

it('labels a singular fit and withholds its projection while keeping model export available', async () => {
  renderTable({runJob:async () => ({...success(-2),singular:true})})
  await userEvent.click(screen.getByRole('button',{name:'Fit selected'}))
  await waitFor(() => expect(screen.getAllByTestId('cohort-model-status')[0]).toHaveTextContent(/singular/i))
  expect(screen.getByRole('button',{name:'Export models (xlsx)'})).toBeEnabled()
  await userEvent.click(screen.getAllByRole('button',{name:'Details'})[0])
  expect(screen.getByText(/Projection unavailable:.*singular/i)).toBeInTheDocument()
})

it('shows a failed model export instead of failing silently', async () => {
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('Out of memory') })
  try {
    renderTable({runJob:async () => ({...success(-2),singular:true})})
    await userEvent.click(screen.getByRole('button',{name:'Fit selected'}))
    await waitFor(() => expect(screen.getByRole('button',{name:'Export models (xlsx)'})).toBeEnabled())
    await userEvent.click(screen.getByRole('button',{name:'Export models (xlsx)'}))
    expect(screen.getByRole('alert')).toHaveTextContent('Model export failed: Out of memory')
  } finally { createObjectURL.mockRestore() }
})

it.each([
  ['runtime-load', 'WEBR_INIT_FAILED', 'runtime-error'],
  ['package-load', 'PACKAGE_UNAVAILABLE', 'unsupported'],
] as const)('says where R is loaded from and how to retry after a %s failure', async (stage, code, status) => {
  renderTable({runJob:async () => ({
    status, engine: 'webr-lme4', stage, code,
    message: 'Failed to fetch', warnings: [], metadata: {},
  })})
  await userEvent.click(screen.getByRole('button',{name:'Fit selected'}))
  await waitFor(() => expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent(/retry the fit/i))
  expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('The first fit of a session loads the R runtime and R packages from the address this app is served from. Check that this address can still be reached, then retry the fit.')
  expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent(/retry/i)
})

it('does not suggest a connection problem for an ordinary model fit failure', async () => {
  renderTable({runJob:async () => ({
    status: 'fit-error', engine: 'webr-lme4', stage: 'fit', code: 'MODEL_FIT_FAILED',
    message: 'Model matrix is rank deficient', warnings: [], metadata: {},
  })})
  await userEvent.click(screen.getByRole('button',{name:'Fit selected'}))
  await waitFor(() => expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).toHaveTextContent('Model matrix is rank deficient'))
  expect(within(rowByEntity('cohort')).getByTestId('cohort-model-status')).not.toHaveTextContent(/internet|CDN|connection/i)
})
