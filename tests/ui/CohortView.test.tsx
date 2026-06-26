import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CohortView } from '../../src/ui/cohort/CohortView'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'
import { ckdProgressionConfig } from '../../src/core/fitPipeline/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2019-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: 60,
    ...p }
}

function event(patientId: number, type: 'dialysis' | 'kidney_transplant', date: string, title: string) {
  return {
    patientId,
    type,
    date: new Date(date),
    title,
    description: null,
    endDate: null,
    intent: type === 'dialysis' ? ('unknown' as const) : null,
    warning: type === 'dialysis' ? ('unknown_dialysis_intent' as const) : ('' as const),
  }
}

function seedValidEgfrCohort() {
  useAppStore.getState().setDataset([
    row({ patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '60', wertNum: 60, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2020-01-01'), patientAgeAtLab: 50 }),
    row({ patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '58', wertNum: 58, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2021-01-01'), patientAgeAtLab: 51 }),
    row({ patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '62', wertNum: 62, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2020-01-01'), patientAgeAtLab: 52 }),
    row({ patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '59', wertNum: 59, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2021-01-01'), patientAgeAtLab: 53 }),
    row({ patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '55', wertNum: 55, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2020-01-01'), patientAgeAtLab: 54 }),
    row({ patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '51', wertNum: 51, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2021-01-01'), patientAgeAtLab: 55 }),
  ])
  useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
}

describe('CohortView', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    vi.unstubAllEnvs()
    useAppStore.getState().setDataset([
      row({ patientId: 1, labDatum: new Date('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: new Date('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01'), wertNum: 2.0 }),
      row({ patientId: 2, labDatum: new Date('2019-01-01'), wertNum: 0.9 }),
      row({ patientId: 2, labDatum: new Date('2020-01-01'), wertNum: 0.9 }),
      row({ patientId: 2, labDatum: new Date('2021-01-01'), wertNum: 0.9 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders one row per patient', () => {
    render(<CohortView />)
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
  })

  it('clicking a patient id switches to the one-patient view for that patient', async () => {
    render(<CohortView />)
    await userEvent.click(screen.getByRole('button', { name: '2' }))
    expect(useAppStore.getState().view).toBe('one')
    expect(useAppStore.getState().selectedPatientId).toBe(2)
    expect(useAppStore.getState().returnToCohort).toBe(true)
  })

  it('mini sparklines follow the store zoom level', () => {
    useAppStore.setState({ cohortZoom: 'l' })
    render(<CohortView />)
    const svgs = screen.getAllByTestId('mini-sparkline')
    expect(svgs[0].getAttribute('data-zoom')).toBe('l')
  })

  it('can limit the cohort table to selected patients', () => {
    useAppStore.getState().setCohortPatientMode('selected')
    useAppStore.getState().setSelectedPatientIds([2])
    render(<CohortView />)
    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
  })

  it('hides patients with no points in any selected cohort series', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 'P-A', bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 'P-A', bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-01-01'), wertNum: 1.1 }),
      row({ patientId: 'P-B', bezeichnung: 'HbA1c', einheit: '%', labDatum: new Date('2019-01-01'), wertNum: 6.0 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })

    render(<CohortView />)

    expect(screen.getByRole('button', { name: 'P-A' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'P-B' })).not.toBeInTheDocument()
  })

  it('hides patients with only one point in the selected cohort series', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 'P-A', bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 'P-A', bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-01-01'), wertNum: 1.1 }),
      row({ patientId: 'P-B', bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2019-01-01'), wertNum: 1.2 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })

    render(<CohortView />)

    expect(screen.getByRole('button', { name: 'P-A' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'P-B' })).not.toBeInTheDocument()
  })

  it('keeps sort controls in column headers and sorts by the selected series', async () => {
    useAppStore.getState().setDataset([
      row({ patientId: 1, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-01-01'), wertNum: 1.8 }),
      row({ patientId: 1, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2021-01-01'), wertNum: 2.4 }),
      row({ patientId: 2, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 2, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2020-01-01'), wertNum: 1.1 }),
      row({ patientId: 2, bezeichnung: 'Kreatinin', einheit: 'mg/dl', labDatum: new Date('2021-01-01'), wertNum: 1.2 }),
      row({ patientId: 1, bezeichnung: 'HbA1c', einheit: '%', labDatum: new Date('2019-01-01'), wertNum: 6.0 }),
      row({ patientId: 1, bezeichnung: 'HbA1c', einheit: '%', labDatum: new Date('2020-01-01'), wertNum: 6.1 }),
      row({ patientId: 1, bezeichnung: 'HbA1c', einheit: '%', labDatum: new Date('2021-01-01'), wertNum: 6.2 }),
      row({ patientId: 2, bezeichnung: 'HbA1c', einheit: '%', labDatum: new Date('2019-01-01'), wertNum: 6.0 }),
      row({ patientId: 2, bezeichnung: 'HbA1c', einheit: '%', labDatum: new Date('2020-01-01'), wertNum: 8.0 }),
      row({ patientId: 2, bezeichnung: 'HbA1c', einheit: '%', labDatum: new Date('2021-01-01'), wertNum: 10.0 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
    useAppStore.getState().addSeries()
    useAppStore.getState().setSeriesConfig(1, { bezeichnung: 'HbA1c', einheit: '%' })
    const { container } = render(<CohortView />)

    expect(screen.getByLabelText('Sort Kreatinin (mg/dl) by')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Sort HbA1c (%) by'), 'slope')
    await userEvent.click(screen.getByRole('button', { name: 'Sort HbA1c (%) descending' }))

    expect(screen.getAllByRole('button', { name: /^[12]$/ }).map((b) => b.textContent)).toEqual(['2', '1'])
    expect(container.querySelector('.sort-row')).toBeNull()
  })

  it('uses Show AKI episodes as a cohort overlay toggle in global mode', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 1, labDatum: new Date('2020-01-01T00:00:00Z'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: new Date('2020-01-02T00:00:00Z'), wertNum: 1.6 }),
      row({ patientId: 1, labDatum: new Date('2020-02-01T00:00:00Z'), wertNum: 1.0 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' })
    useAppStore.getState().setShowAki(false)
    const { container, rerender } = render(<CohortView />)

    expect(screen.queryByText('AKI I')).not.toBeInTheDocument()
    expect(container.querySelector('[data-testid="aki-band"]')).toBeNull()

    act(() => useAppStore.getState().setShowAki(true))
    rerender(<CohortView />)

    expect(screen.getByText('AKI I')).toBeInTheDocument()
    expect(screen.getByText('AKI I')).toHaveAttribute('title', '1 AKI episode: 1× stage I')
    expect(container.querySelector('[data-testid="aki-band"]')).toBeTruthy()
  })

  it('passes patient events into the cohort mini graphs', () => {
    useAppStore.setState({ cohortZoom: 'l' })
    useAppStore.getState().setEvents([
      event(1, 'dialysis', '2020-06-01', 'Dialysis start'),
      event(2, 'kidney_transplant', '2020-07-01', 'Kidney transplant'),
    ])

    const { container } = render(<CohortView />)

    expect(container.querySelectorAll('[data-testid="event-marker"]')).toHaveLength(2)
    expect(screen.getByText('Dialysis start')).toBeInTheDocument()
    expect(screen.getByText('Kidney transplant')).toBeInTheDocument()
  })

  it('shows CKD endpoint badges for eGFR cohort cells', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 1, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2020-01-01'), wertNum: 60, patientAgeAtLab: 60 }),
      row({ patientId: 1, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2021-01-01'), wertNum: 45, patientAgeAtLab: 61 }),
      row({ patientId: 1, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2022-01-01'), wertNum: 30, patientAgeAtLab: 62 }),
    ])
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1,73m²',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }),
    })

    render(<CohortView />)

    expect(screen.getByText('-50% · G5 @ 63.0y')).toBeInTheDocument()
    expect(screen.getByText('-50% · G5 @ 63.0y')).toHaveAttribute('title', 'total eGFR change -50.0% from baseline (not per year) · projected age to CKD G5 63.0 years')
  })

  it('renders the cohort mixed model panel only inside the model dialog', async () => {
    useAppStore.getState().setDataset([
      row({ patientId: 1, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2020-01-01'), wertNum: 60, patientAgeAtLab: 60 }),
      row({ patientId: 1, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2021-01-01'), wertNum: 56, patientAgeAtLab: 61 }),
      row({ patientId: 2, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2020-01-01'), wertNum: 70, patientAgeAtLab: 62 }),
      row({ patientId: 2, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2021-01-01'), wertNum: 67, patientAgeAtLab: 63 }),
      row({ patientId: 3, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2020-01-01'), wertNum: 50, patientAgeAtLab: 64 }),
      row({ patientId: 3, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2021-01-01'), wertNum: 47, patientAgeAtLab: 65 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' })

    render(<CohortView />)

    expect(screen.queryByRole('region', { name: 'Cohort mixed model' })).not.toBeInTheDocument()

    act(() => useAppStore.getState().setMixedModelDialogOpen(true))

    expect(await screen.findByRole('dialog', { name: 'eGFR cohort model' })).toBeInTheDocument()
    expect(screen.getByText('Experimental')).toBeInTheDocument()
    expect(screen.getByText(/experimental browser-based mixed model/i)).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Cohort mixed model' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fit model' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close eGFR cohort model' }))

    expect(screen.queryByRole('dialog', { name: 'eGFR cohort model' })).not.toBeInTheDocument()
    expect(useAppStore.getState().mixedModelDialogOpen).toBe(false)
  })

  it('opens the cohort mixed model dialog without requiring an environment flag', async () => {
    seedValidEgfrCohort()
    useAppStore.getState().setMixedModelDialogOpen(true)

    render(<CohortView />)

    expect(await screen.findByRole('dialog', { name: 'eGFR cohort model' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Cohort mixed model' })).toBeInTheDocument()
  })

  it('shows mixed model configuration directly inside the cohort model dialog', async () => {
    seedValidEgfrCohort()
    useAppStore.getState().setMixedModelDialogOpen(true)
    render(<CohortView />)

    expect(await screen.findByRole('dialog', { name: /egfr cohort model/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/baseline age/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/patient intercept\/slope/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /configure cohort mixed model/i })).not.toBeInTheDocument()
  })

  it('stacks cohort pills in a badge column for medium and large mini graph sizes', () => {
    useAppStore.setState({ cohortZoom: 'l' })
    useAppStore.getState().setDataset([
      row({ patientId: 1, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2020-01-01'), wertNum: 60, patientAgeAtLab: 60 }),
      row({ patientId: 1, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2021-01-01'), wertNum: 45, patientAgeAtLab: 61 }),
      row({ patientId: 1, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2022-01-01'), wertNum: 30, patientAgeAtLab: 62 }),
    ])
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1,73m²',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }),
    })

    const { container } = render(<CohortView />)

    expect(container.querySelector('.cell-cluster-l .cell-badges')).toBeTruthy()
    expect(container.querySelector('.cell-badges')?.children).toHaveLength(2)
  })

  it('does not show percent decline badges for a single-point patient hidden from the cohort table', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 3, bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²', labDatum: new Date('2020-01-01'), wertNum: 70, patientAgeAtLab: 60 }),
    ])
    useAppStore.getState().setSeriesConfig(0, {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1,73m²',
      fitConfig: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }),
    })

    render(<CohortView />)

    expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument()
    expect(screen.queryByText('-39%')).not.toBeInTheDocument()
  })

  it('hides cohort mini graph event markers when event display is disabled', () => {
    useAppStore.setState({ cohortZoom: 'l' })
    useAppStore.getState().setEvents([
      event(1, 'dialysis', '2020-06-01', 'Dialysis start'),
      event(2, 'kidney_transplant', '2020-07-01', 'Kidney transplant'),
    ])
    useAppStore.getState().setShowEvents(false)

    const { container } = render(<CohortView />)

    expect(container.querySelector('[data-testid="event-marker"]')).toBeNull()
    expect(screen.queryByText('Dialysis start')).not.toBeInTheDocument()
    expect(screen.queryByText('Kidney transplant')).not.toBeInTheDocument()
  })

  it('switches between the cohort table and overlay plot', async () => {
    render(<CohortView />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Overlay Plot' }))

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Kreatinin .* across 2 patient/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Table' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
