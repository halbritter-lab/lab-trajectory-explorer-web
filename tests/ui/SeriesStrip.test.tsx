import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeriesStrip } from '../../src/ui/seriesStrip/SeriesStrip'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return {
    patientId: 1,
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'Kreatinin',
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

describe('SeriesStrip series controls', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ labDatum: new Date('2019-01-01'), wertNum: 1 }),
      row({ labDatum: new Date('2020-01-01'), wertNum: 2 }),
      row({ labDatum: new Date('2021-01-01'), wertNum: 3 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
  })

  it('shows parameter controls without the legacy fit mode selector', () => {
    render(<SeriesStrip />)
    expect(screen.getByLabelText('Series 1 parameter')).toBeInTheDocument()
    expect(screen.queryByLabelText('Series 1 mode')).not.toBeInTheDocument()
  })

  it('keeps add/remove series controls in the strip', () => {
    render(<SeriesStrip />)
    expect(screen.getByRole('button', { name: '+ Add series' })).toBeInTheDocument()
  })

  it('offers cohort parameters even when the selected toolbar patient lacks them', async () => {
    useAppStore.getState().setDataset([
      row({ patientId: 1, bezeichnung: 'Kreatinin', einheit: 'mg/dl' }),
      row({ patientId: 2, bezeichnung: 'HbA1c', einheit: '%' }),
    ])
    useAppStore.getState().selectPatient(1)

    render(<SeriesStrip />)

    await userEvent.click(screen.getByRole('button', { name: 'Show parameters' }))

    expect(await screen.findByRole('option', { name: 'HbA1c (%)' })).toBeInTheDocument()
  })

  it('filters parameters in a combobox and selects a matching parameter', async () => {
    useAppStore.getState().setDataset([
      row({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }),
      row({ bezeichnung: 'Albumin/Kreatinin-Quotient', einheit: 'mg/g' }),
      row({ bezeichnung: 'HbA1c', einheit: '%' }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })

    render(<SeriesStrip />)

    const combo = screen.getByRole('combobox', { name: 'Series 1 parameter' })
    await userEvent.click(combo)
    await userEvent.type(combo, 'albumin mg/g')

    expect(await screen.findByRole('option', { name: 'Albumin/Kreatinin-Quotient (mg/g)' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Kreatinin (mg/dl)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'HbA1c (%)' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('option', { name: 'Albumin/Kreatinin-Quotient (mg/g)' }))

    expect(useAppStore.getState().seriesConfigs[0].bezeichnung).toBe('Albumin/Kreatinin-Quotient')
    expect(useAppStore.getState().seriesConfigs[0].einheit).toBe('mg/g')
    expect(combo).toHaveValue('Albumin/Kreatinin-Quotient (mg/g)')
  })
})
