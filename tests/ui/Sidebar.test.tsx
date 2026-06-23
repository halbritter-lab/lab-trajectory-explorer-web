import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from '../../src/ui/shell/Sidebar'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return {
    patientId: 1,
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'Kreatinin HP',
    einheit: 'mg/dl',
    wert: '1',
    wertNum: 1,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    patientAgeAtLab: null,
    ...p,
  }
}

describe('Sidebar eGFR controls', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ patientId: 1, labDatum: new Date('2019-01-01'), wertNum: 1.0 }),
      row({ patientId: 1, labDatum: new Date('2020-01-01'), wertNum: 1.2 }),
      row({ patientId: 2, labDatum: new Date('2019-01-01'), wertNum: 1.1, patientSex: 'm', patientAgeAtLab: 60 }),
    ])
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')
  })

  it('opens a demographics dialog and applies values explicitly', async () => {
    render(<Sidebar />)
    expect(screen.getByLabelText('Creatinine source')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enter demographics for patient 1' }))
    expect(screen.getByRole('dialog', { name: 'Manual demographics for patient 1' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Manual sex for patient 1'), 'm')
    await userEvent.type(screen.getByLabelText('Manual age for patient 1'), '50')
    expect(useAppStore.getState().manualDemographics[1]).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: 'Apply demographics' }))
    expect(useAppStore.getState().manualDemographics[1]).toEqual({ sex: 'm', age: 50 })
    expect(screen.getByText('Patient 1: m, age 50')).toBeInTheDocument()
  })

  it('offers EKFC 2021 as an eGFR formula option', () => {
    render(<Sidebar />)
    expect(screen.getByRole('option', { name: 'EKFC 2021' })).toBeInTheDocument()
  })

  it('can show all series in the creatinine source picker', async () => {
    useAppStore.getState().setDataset([
      row({ bezeichnung: 'Kreatinin HP', einheit: 'mg/dl' }),
      row({ bezeichnung: 'Albumin/Kreatinin-Quotient', einheit: 'mg/g' }),
    ])
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')

    render(<Sidebar />)

    expect(screen.queryByRole('option', { name: 'Albumin/Kreatinin-Quotient (mg/g)' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Show all series in source picker'))
    expect(screen.getByRole('option', { name: 'Albumin/Kreatinin-Quotient (mg/g)' })).toBeInTheDocument()
  })
})

describe('Sidebar patient controls', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ patientId: 1 }),
      row({ patientId: 2 }),
    ])
  })

  it('lets users switch cohort mode to selected patients', async () => {
    render(<Sidebar />)
    await userEvent.click(screen.getByLabelText('Selected patients'))
    expect(useAppStore.getState().cohortPatientMode).toBe('selected')
    expect(screen.getByLabelText('Include patient 2')).toBeInTheDocument()
  })
})
