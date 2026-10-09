import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CohortModelsWorkspace } from '../../src/workspace/CohortModelsWorkspace'
import { useAppStore } from '../../src/workspace/state/store'
import type { LabRow } from '../../src/core/types'
import { buildMixedModelResultIdentity, mixedModelFitConfigHash } from '../../src/core/mixedModel/resultIdentity'
import { workspaceModelEntities } from '../../src/workspace/workspace-model-results'
import { workspaceModelSpec } from '../../src/workspace/workspace-data'
import { defaultFitSettings } from '../../src/workspace/workspace-analysis'
import type { WorkspaceData } from '../../src/workspace/workspace-data'



vi.mock('../../src/workspace/models/CohortModelTable', () => ({
  CohortModelTable: (props: any) => (
    <div data-testid="cohort-model-table">
      <span>Mocked CohortModelTable</span>
      <span>Series: {props.seriesKey}</span>
      <span>Entities: {props.entities?.length ?? 0}</span>
    </div>
  ),
}))

const originalRunCohortModels = useAppStore.getState().runCohortModels
afterEach(cleanup)

describe('CohortModelsWorkspace', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.setState({ runCohortModels: originalRunCohortModels })
  })

  const emptyData: WorkspaceData = {
    rawRows: [],
    rows: [],
    patients: [],
    parameters: [],
    events: [],
    patientAttributes: {},
    fileName: 'empty.csv',
    analysis: useAppStore.getState().analysisResult(),
    analysisSettings: useAppStore.getState().analysisSettings,
    manualDemographics: {},
  }

  const sampleRow1: LabRow = {
    patientId: 'P-01',
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'eGFR',
    einheit: 'mL/min/1.73m²',
    wert: '60',
    wertNum: 60,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 55,
  }

  const sampleRow2: LabRow = {
    patientId: 'P-02',
    labDatum: new Date('2020-06-01'),
    bezeichnung: 'eGFR',
    einheit: 'mL/min/1.73m²',
    wert: '75',
    wertNum: 75,
    wertOperator: '=',
    loinc: null,
    patientSex: 'w',
    patientAgeAtLab: 62,
  }

  const sampleRow3: LabRow = {
    patientId: 'P-01',
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1.2',
    wertNum: 1.2,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 55,
  }

  const dataset: WorkspaceData = {
    rawRows: [sampleRow1, sampleRow2, sampleRow3],
    rows: [sampleRow1, sampleRow2, sampleRow3],
    patients: [
      { id: 'P-01', label: 'P-01', attributes: {}, baselineAge: 55 },
      { id: 'P-02', label: 'P-02', attributes: {}, baselineAge: 62 },
    ],
    parameters: [
      { key: 'eGFR||mL/min/1.73m²', bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', label: 'eGFR', derived: false },
      { key: 'Kreatinin||mg/dl', bezeichnung: 'Kreatinin', einheit: 'mg/dl', label: 'Kreatinin', derived: false },
    ],
    events: [],
    patientAttributes: {
      'P-01': { sex: 'm', genotype: 'APOL1-G1' },
      'P-02': { sex: 'w', genotype: 'APOL1-G0' },
    },
    fileName: 'cohort.csv',
    analysis: useAppStore.getState().analysisResult(),
    analysisSettings: useAppStore.getState().analysisSettings,
    manualDemographics: {},
  }

  function qualifyingData(count = 10, times = 3): WorkspaceData {
    const rows = Array.from({ length: count }, (_, i) => Array.from({ length: times }, (_, year) => ({
      ...sampleRow1, patientId: `P-${i}`, labDatum: new Date(Date.UTC(2020 + year, 0, 1)),
      patientSex: i % 2 ? 'm' as const : 'w' as const, wertNum: 60 - year - i,
    }))).flat()
    return { ...dataset, rawRows: rows, rows, parameters: [dataset.parameters[0]],
      patients: Array.from({ length: count }, (_, i) => ({ id: `P-${i}`, label: `P-${i}`, attributes: {}, baselineAge: 55 })),
      patientAttributes: Object.fromEntries(Array.from({ length: count }, (_, i) => [`P-${i}`, { arm: i < 10 ? 'A' : 'B' }])),
    }
  }
  function studio(data: WorkspaceData) {
    return render(<CohortModelsWorkspace data={data} onBrowseTrajectories={vi.fn()} onBrowseData={vi.fn()} />)
  }
  function fitButtons() { return screen.getAllByRole('button', { name: /Fit model/i }) }

  it('explains the five-patient limit beside both disabled actions without submitting', async () => {
    const run = vi.spyOn(useAppStore.getState(), 'runCohortModels')
    studio(qualifyingData(5))
    await screen.findByTestId('cohort-model-table')
    expect(fitButtons()).toHaveLength(2)
    for (const button of fitButtons()) {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(/No model can be fitted.*at least 10 patients/)
      fireEvent.click(button)
    }
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('at least 10 patients')
    expect(screen.queryByText(/Run model to estimate slope/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Click 'Fit model'/)).not.toBeInTheDocument()
    expect(run).not.toHaveBeenCalled()
    run.mockRestore()
  })

  it('explains zero prepared rows', () => {
    studio({ ...qualifyingData(), rows: [] })
    expect(fitButtons()[0]).toBeDisabled()
    expect(fitButtons()[0]).toHaveAccessibleDescription(/at least one measurement row/)
  })

  it('updates availability immediately when random slopes become identifiable', () => {
    studio(qualifyingData(10, 2))
    expect(fitButtons()[0]).toHaveAccessibleDescription(/3 distinct measurement times/)
    expect(fitButtons()[1]).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Custom model/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Intercept only' }))
    fitButtons().forEach(button => expect(button).toBeEnabled())
  })

  it('updates availability when a selected reference is absent and restored', () => {
    studio(qualifyingData())
    fitButtons().forEach(button => expect(button).toBeEnabled())
    act(() => useAppStore.getState().setMixedModelConfig({ ...useAppStore.getState().mixedModelConfig, factors: [{ key: 'sex', kind: 'categorical', effect: 'level', reference: 'absent' }] }))
    fitButtons().forEach(button => {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(/observed reference level/)
    })
    fireEvent.change(screen.getByLabelText('Sex reference'), { target: { value: 'm' } })
    fitButtons().forEach(button => expect(button).toBeEnabled())
  })

  it('keeps both actions visible and explains Trajectories No fit', () => {
    studio(qualifyingData())
    act(() => useAppStore.getState().setTrajectoryFitSettings({ shared: { ...defaultFitSettings(), fitModel: 'none' }, columns: {} }))
    expect(fitButtons()).toHaveLength(2)
    fitButtons().forEach(button => {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(/disabled.*Trajectories/)
    })
  })

  it('submits the eligible pooled cohort and group A and explains the skipped group B', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ runCohortModels: run })
    studio(qualifyingData(15))
    fireEvent.click(screen.getByRole('button', { name: /Subgroup comparison/ }))
    const button = screen.getByRole('button', { name: /Fit models \(2 units\)/ })
    expect(button).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent(/1 unit skipped.*B:.*at least 10 patients/)
    fireEvent.click(button)
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(run.mock.calls[0][0].entities.map((e: any) => e.entity.kind === 'cohort' ? 'cohort' : e.entity.value)).toEqual(['cohort', 'A'])
  })

  it('identifies every affected unit when all grouped units are invalid', () => {
    const run = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ runCohortModels: run })
    const data = qualifyingData(8)
    data.patientAttributes = Object.fromEntries(data.patients.map((p, i) => [String(p.id), { arm: i < 4 ? 'A' : 'B' }]))
    studio(data)
    fireEvent.click(screen.getByRole('button', { name: /Subgroup comparison/ }))
    fitButtons().forEach(button => { expect(button).toBeDisabled(); fireEvent.click(button) })
    expect(run).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/Whole cohort:.*A:.*B:/)
  })

  it('hides the preview action for a current fit and reveals disabled actions after changing outcome', () => {
    const data = qualifyingData()
    data.rows = [...data.rows, ...qualifyingData(5).rows.map(row => ({ ...row, bezeichnung: 'Kreatinin', einheit: 'mg/dl' }))]
    data.parameters = dataset.parameters
    const spec = workspaceModelSpec(data, data.parameters[0].key, useAppStore.getState().trajectoryFitSettings)!
    const config = useAppStore.getState().mixedModelConfig
    const entity = workspaceModelEntities(data.rows, data.patients.map(p => p.id), spec, config, data.patientAttributes, [])[0]
    const identity = buildMixedModelResultIdentity({ seriesIndex: 0, seriesKey: data.parameters[0].key,
      rows: entity.rows, patientIds: entity.rows.map(row => row.patient_id), preparation: entity.preparation,
      fitConfigHash: mixedModelFitConfigHash(spec, config, 'apply') })
    useAppStore.setState({ cohortModelResults: { cohort: { identity, result: {
      status: 'success', converged: true, singular: false, fixedEffects: { intercept: 60, timeSinceBaseline: -2 },
    } as any } } })
    studio(data)
    expect(fitButtons()).toHaveLength(1)
    expect(screen.getByText(/Whole cohort fitted trajectory/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Model parameter'), { target: { value: 'Kreatinin||mg/dl' } })
    expect(fitButtons()).toHaveLength(2)
    fitButtons().forEach(button => {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(/at least 10 patients/)
    })
  })

  it('shows progress guidance while both actions are disabled during fitting', () => {
    useAppStore.setState({ cohortModelRunning: true, cohortModelProgress: { completed: 0, total: 2, key: 'cohort' } })
    studio(qualifyingData())
    expect(screen.getByRole('button', { name: /Fitting 1 of 2/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fitting model …' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Fitting 1 of 2')
    expect(screen.queryByText(/Click 'Fit model'/)).not.toBeInTheDocument()
  })

  it('renders load prompt when no data is loaded', () => {
    const onBrowseData = vi.fn()
    render(<CohortModelsWorkspace data={emptyData} onBrowseTrajectories={vi.fn()} onBrowseData={onBrowseData} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Cohort models' })).toBeVisible()
    expect(screen.getByText('Load a dataset first to fit population-level mixed models.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Load data' }))
    expect(onBrowseData).toHaveBeenCalledTimes(1)
  })

  it('renders model parameter, presets, and plot preview when data is loaded', async () => {
    const onBrowseTrajectories = vi.fn()
    render(
      <CohortModelsWorkspace
        data={dataset}
        onBrowseTrajectories={onBrowseTrajectories}
        onBrowseData={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Cohort models' })).toBeVisible()

    // Parameter dropdown
    const paramSelect = screen.getByLabelText('Model parameter') as HTMLSelectElement
    expect(paramSelect).toBeInTheDocument()
    expect(paramSelect.value).toBe('eGFR||mL/min/1.73m²')

    // Preset buttons
    expect(screen.getByRole('button', { name: /Standard \(Overall\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Subgroup comparison/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Demographic adjustment/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Group interaction/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Custom model/i })).toBeInTheDocument()

    // Navigation button
    fireEvent.click(screen.getByRole('button', { name: /View trajectories/i }))
    expect(onBrowseTrajectories).toHaveBeenCalledTimes(1)

    // Formula strip is visible
    expect(screen.getByLabelText('Readable formula')).toHaveTextContent(/Time \(years\) \+ \(1 \+ Time \(years\) \| Patient\)/)

    // Trajectory plot preview is rendered
    expect(screen.getByRole('heading', { name: 'Model Trajectory Preview' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Model trajectory preview for eGFR/i)).toBeInTheDocument()

    // Lazy CohortModelTable is rendered
    await waitFor(() => {
      expect(screen.getByTestId('cohort-model-table')).toBeInTheDocument()
    })
    expect(screen.getByText(/Series: eGFR\|\|mL\/min\/1\.73m²/)).toBeInTheDocument()
    expect(screen.getByText(/Entities: 1/)).toBeInTheDocument()
  })

  it('switches to subgroup comparison preset and updates grouping', () => {
    render(
      <CohortModelsWorkspace
        data={dataset}
        onBrowseTrajectories={vi.fn()}
        onBrowseData={vi.fn()}
      />
    )

    const subgroupBtn = screen.getByRole('button', { name: /Subgroup comparison/i })
    fireEvent.click(subgroupBtn)

    // Grouping dropdown appears when in subgroup comparison preset
    const groupSelect = screen.getByLabelText('Model grouping') as HTMLSelectElement
    expect(groupSelect).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'No grouping (Whole cohort)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'genotype' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'sex' })).toBeInTheDocument()

    // genotype is the first available attribute alphabetically
    expect(groupSelect.value).toBe('genotype')
    fireEvent.change(groupSelect, { target: { value: '' } })
    expect(groupSelect.value).toBe('')
  })

  it('switches to demographic adjustment preset and adds demographic covariates', () => {
    render(
      <CohortModelsWorkspace
        data={dataset}
        onBrowseTrajectories={vi.fn()}
        onBrowseData={vi.fn()}
      />
    )

    const demoBtn = screen.getByRole('button', { name: /Demographic adjustment/i })
    fireEvent.click(demoBtn)

    // Formula reflects demographic adjustment
    expect(screen.getByLabelText('Readable formula')).toHaveTextContent('"Baseline age (centered)"')
    expect(screen.getByLabelText('Readable formula')).toHaveTextContent('"Sex"')
  })

  it('shows which reference category each categorical factor uses', () => {
    render(<CohortModelsWorkspace data={dataset} onBrowseTrajectories={vi.fn()} onBrowseData={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Demographic adjustment/i }))
    const references = screen.getByLabelText('Reference categories')
    const select = screen.getByLabelText('Sex reference') as HTMLSelectElement
    const [first, second] = [...select.options].map(option => option.value)
    expect(references).toHaveTextContent(`Sex = ${first} (first level by default; change it next to the factor)`)
    if (second !== undefined) {
      fireEvent.change(select, { target: { value: second } })
      expect(screen.getByLabelText('Reference categories')).toHaveTextContent(`Sex = ${second}`)
      expect(screen.getByLabelText('Reference categories')).not.toHaveTextContent('first level')
    }
  })

  it('does not offer an overlay for an unrelated stored result', async () => {
    useAppStore.setState({
      cohortModelResults: {
        'eGFR||mL/min/1.73m²': {
          result: {
            status: 'success',
            coefficients: [],
            residuals: [],
            fitted: [],
            vcov: [],
            diagnostics: { nobs: 2, ngrps: 2, logLik: -5, aic: 10, bic: 12 },
          } as any,
          identity: {} as any,
        },
      },
    })

    render(
      <CohortModelsWorkspace
        data={dataset}
        onBrowseTrajectories={vi.fn()}
        onBrowseData={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('Show cohort model line in overlay')).not.toBeInTheDocument()
  })
})
