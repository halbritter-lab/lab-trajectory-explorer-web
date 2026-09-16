import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CohortModelsWorkspace } from '../../src/workspace/CohortModelsWorkspace'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'
import type { WorkspaceData } from '../../src/workspace/workspace-data'



vi.mock('../../src/ui/cohort/CohortModelPanel', () => ({
  CohortModelPanel: (props: any) => (
    <div data-testid="cohort-model-panel">
      <span>Mocked CohortModelPanel</span>
      <span>Series: {props.seriesKey}</span>
      <span>Patients: {props.patientIds.length}</span>
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

  it('renders model parameter and grouping controls when data is loaded', async () => {
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

    // Grouping dropdown includes attributes from patientAttributes and rows
    const groupSelect = screen.getByLabelText('Model grouping') as HTMLSelectElement
    expect(groupSelect).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'No grouping (Whole cohort)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'genotype' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'sex' })).toBeInTheDocument()

    // Navigation button
    fireEvent.click(screen.getByRole('button', { name: /View trajectories/i }))
    expect(onBrowseTrajectories).toHaveBeenCalledTimes(1)

    // Lazy CohortModelPanel is rendered
    await waitFor(() => {
      expect(screen.getByTestId('cohort-model-panel')).toBeInTheDocument()
    })
    expect(screen.getByText(/Series: eGFR\|\|mL\/min\/1\.73m²/)).toBeInTheDocument()
    expect(screen.getByText(/Patients: 2/)).toBeInTheDocument()
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
