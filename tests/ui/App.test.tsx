import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '../../src/App'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('App', () => {
  beforeEach(() => useAppStore.getState().reset())

  it('renders the empty state without crashing', () => {
    render(<App />)
    expect(screen.getByText('Lab Trajectory Explorer')).toBeInTheDocument()
  })

  it('does not duplicate load actions in the empty state', () => {
    render(<App />)
    expect(screen.getAllByRole('button', { name: 'Upload xlsx/csv' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Load synthetic data' })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Download test data' })).toHaveLength(1)
  })

  // Regression guard for React error #185: a store selector that returns a
  // fresh array each render (e.g. patientIds()) sends Zustand into an infinite
  // re-render loop. Rendering the full App with data must not throw.
  it('renders with a loaded dataset and a patient picker without an infinite loop', () => {
    useAppStore.getState().setDataset([row({ patientId: 7 }), row({ patientId: 9 })])
    render(<App />)
    expect(screen.getByLabelText('Patient')).toBeInTheDocument()
  })

  it('offers the bundled test data as a downloadable workbook after data is loaded', () => {
    useAppStore.getState().setDataset([row({ patientId: 7 })])
    render(<App />)
    const link = screen.getByRole('link', { name: 'Download test data workbook' })
    expect(link).toHaveAttribute('href', '/test_labs.xlsx')
    expect(link).toHaveAttribute('download', 'test_labs.xlsx')
    expect(link).toHaveAttribute('title', 'Download test data')
  })

  it('hides mini-graph zoom controls while cohort overlay mode is active', () => {
    useAppStore.getState().setDataset([
      row({ patientId: 1, labDatum: new Date('2019-01-01'), wertNum: 1 }),
      row({ patientId: 1, labDatum: new Date('2020-01-01'), wertNum: 2 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01'), wertNum: 3 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
    useAppStore.getState().setView('cohort')
    useAppStore.getState().setCohortDisplayMode('overlay')

    render(<App />)

    expect(screen.queryByRole('button', { name: 'S' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'M' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'L' })).not.toBeInTheDocument()
  })
})
