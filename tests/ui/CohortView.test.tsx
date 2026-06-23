import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CohortView } from '../../src/ui/cohort/CohortView'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2019-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('CohortView', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
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
})
