import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CohortView } from '../../src/ui/cohort/CohortView'
import { Methodology } from '../../src/ui/pages/Methodology'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2019-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('exports + methodology', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ patientId: 1, labDatum: new Date('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: new Date('2020-01-01'), wertNum: 1.5 }),
      row({ patientId: 1, labDatum: new Date('2021-01-01'), wertNum: 2.0 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
  })

  it('cohort view exposes an Export xlsx button that builds bytes without throwing', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    // jsdom has no anchor.click navigation; stub it so download path completes.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<CohortView />)
    await userEvent.click(screen.getByRole('button', { name: /export cohort/i }))
    expect(create).toHaveBeenCalled()
  })

  it('Methodology renders the slope-mode reference', () => {
    render(<Methodology />)
    expect(screen.getByText('global')).toBeInTheDocument()
    expect(screen.getByText('rolling')).toBeInTheDocument()
    expect(screen.getByText('global-robust')).toBeInTheDocument()
    expect(screen.getByText('chronic-ckd')).toBeInTheDocument()
    expect(screen.getByText('event-driven')).toBeInTheDocument()
    expect(screen.getByText(/KDIGO 2012 creatinine criteria/i)).toBeInTheDocument()
  })
})
