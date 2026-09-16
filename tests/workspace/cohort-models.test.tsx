import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CohortModelsWorkspace } from '../../src/workspace/CohortModelsWorkspace'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'
import type { WorkspaceData } from '../../src/workspace/workspace-data'



vi.mock('../../src/ui/cohort/CohortModelTable', () => ({
  CohortModelTable: (props: any) => (
    <div data-testid="cohort-model-table">
      <span>Mocked CohortModelTable</span>
      <span>Series: {props.seriesKey}</span>
      <span>Entities: {props.entities?.length ?? 0}</span>
    </div>
  ),
}))

afterEach(cleanup)

describe('CohortModelsWorkspace', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
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
    expect(screen.getByText(/time_since_baseline \+ \(1 \+ time_since_baseline \| patient_id\)/)).toBeInTheDocument()

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
    expect(screen.getByText(/baseline_age_centered/)).toBeInTheDocument()
  })

  it('shows overlay checkbox when successful cohort models exist', async () => {
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

    const overlayCheck = screen.getByLabelText('Show cohort model line in overlay') as HTMLInputElement
    expect(overlayCheck).toBeInTheDocument()
    expect(overlayCheck.checked).toBe(false)

    fireEvent.click(overlayCheck)
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(true)
  })
})
