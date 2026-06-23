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

describe('SeriesStrip preset controls', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      row({ labDatum: new Date('2019-01-01'), wertNum: 1 }),
      row({ labDatum: new Date('2020-01-01'), wertNum: 2 }),
      row({ labDatum: new Date('2021-01-01'), wertNum: 3 }),
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' })
  })

  it('offers the Python-parity presets', () => {
    render(<SeriesStrip />)
    const mode = screen.getByLabelText('Series 1 mode')
    expect(mode).toHaveTextContent('Robust')
    expect(mode).toHaveTextContent('Chronic CKD')
    expect(mode).toHaveTextContent('Event-driven')
  })

  it('shows mode-specific parameter inputs', async () => {
    render(<SeriesStrip />)
    const mode = screen.getByLabelText('Series 1 mode')
    await userEvent.selectOptions(mode, 'gap-split')
    expect(screen.getByLabelText('Series 1 gap days')).toBeInTheDocument()
    await userEvent.selectOptions(mode, 'rolling')
    expect(screen.getByLabelText('Series 1 window days')).toBeInTheDocument()
    expect(screen.getByLabelText('Series 1 step days')).toBeInTheDocument()
    await userEvent.selectOptions(mode, 'chronic-ckd')
    expect(screen.getByLabelText('Series 1 cutoff days')).toBeInTheDocument()
  })
})
