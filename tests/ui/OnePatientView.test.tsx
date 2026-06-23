import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnePatientView } from '../../src/ui/patient/OnePatientView'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('OnePatientView', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ labDatum: new Date('2019-01-01'), wertNum: 1 }),
      row({ labDatum: new Date('2020-01-01'), wertNum: 2 }),
      row({ labDatum: new Date('2021-01-01'), wertNum: 3 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
  })

  it('renders a plot card for the configured series', () => {
    render(<OnePatientView />)
    expect(screen.getAllByTestId('series-plot').length).toBeGreaterThan(0)
  })

  it('can hide loaded annotations from the plot', () => {
    useAppStore.getState().setAnnotations([{ patientId: 1, referenceDate: new Date('2020-01-01'), label: 'event', warning: '' }])
    useAppStore.getState().setShowAnnotations(false)
    const { container } = render(<OnePatientView />)
    expect(container.textContent).not.toContain('event')
  })

  it('shows a back-to-cohort button when opened from the cohort view', async () => {
    useAppStore.getState().setView('one')
    useAppStore.getState().setReturnToCohort(true)
    render(<OnePatientView />)
    const back = screen.getByRole('button', { name: /back to cohort/i })
    expect(back).toHaveTextContent('←')
    await userEvent.click(back)
    expect(useAppStore.getState().view).toBe('cohort')
    expect(useAppStore.getState().returnToCohort).toBe(false)
  })
})
