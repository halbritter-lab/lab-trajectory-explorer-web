import { describe, it, expect, beforeEach, vi } from 'vitest'
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

describe('Sidebar event table', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([row({ patientId: 9 }), row({ patientId: 10 })])
    useAppStore.getState().setEvents([
      {
        patientId: 9,
        type: 'dialysis',
        date: new Date('2024-04-15T00:00:00Z'),
        title: 'Dialysis start',
        description: '',
        endDate: null,
        intent: 'unknown',
        warning: 'unknown_dialysis_intent',
      },
      {
        patientId: 10,
        type: 'kidney_transplant',
        date: new Date('2025-02-01T00:00:00Z'),
        title: 'Kidney transplant',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
      {
        patientId: 9,
        type: 'other',
        date: new Date('2024-08-01T00:00:00Z'),
        title: 'Study medication',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])
  })

  it('shows loaded events as a compact table', () => {
    render(<Sidebar />)

    expect(screen.queryByLabelText('Apply event exclusions to trend fits')).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Loaded events' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Patient' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Effect' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'kidney_transplant' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'display only for selected series' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'display only' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Kidney transplant' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '-' }).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Events').closest('label')).toHaveTextContent(/^Events$/)
  })

  it('shows event effects according to the selected series fit configuration', async () => {
    render(<Sidebar />)

    expect(screen.getByRole('cell', { name: 'display only for selected series' })).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Fit preset'), 'ckd_progression')

    expect(screen.getByRole('cell', { name: 'censor from event date' })).toBeInTheDocument()
  })

  it('rejects legacy event files with a clear message', async () => {
    const file = new File(['PatientID,ReferenceDate,label\n1,2020-01-01,event\n'], 'events.csv', { type: 'text/csv' })
    render(<Sidebar />)
    await userEvent.upload(screen.getByLabelText('Events'), file)
    expect(await screen.findByText(/Legacy annotation schema is no longer supported/)).toBeInTheDocument()
  })

  it('reports warning counts for unresolved event rows', async () => {
    const file = new File([
      'patientId,type,date,title,description,endDate,intent\n',
      '1,dialysis,2024-04-15,Dialysis start,,,\n',
      '999,dialysis,2024-05-01,Unknown patient dialysis,,,chronic\n',
    ], 'events.csv', { type: 'text/csv' })
    useAppStore.getState().setDataset([row({ patientId: 1 })])
    render(<Sidebar />)
    await userEvent.upload(screen.getByLabelText('Events'), file)
    expect(await screen.findByText('Loaded 2 events; 2 warnings.')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'unknown_dialysis_intent' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'unknown_patient' })).toBeInTheDocument()
  })

  it('uses singular status grammar for one event, one rejected row, and one warning', async () => {
    const file = new File([
      'patientId,type,date,title,description,endDate,intent\n',
      '1,dialysis,2024-04-15,Dialysis start,,,\n',
      '1,unsupported,2024-05-01,Invalid event,,,\n',
    ], 'events.csv', { type: 'text/csv' })
    useAppStore.getState().setDataset([row({ patientId: 1 })])
    render(<Sidebar />)
    await userEvent.upload(screen.getByLabelText('Events'), file)
    expect(await screen.findByText('Loaded 1 event; rejected 1 row; 1 warning.')).toBeInTheDocument()
  })

  it('shows rejected event rows with their validation reason', async () => {
    const file = new File([
      'patientId,type,date,title,description,endDate,intent\n',
      '1,other,2024-04-15,Valid note,,,\n',
      '1,unsupported,2024-05-01,Invalid event,,,\n',
    ], 'events.csv', { type: 'text/csv' })
    useAppStore.getState().setDataset([row({ patientId: 1 })])
    render(<Sidebar />)

    await userEvent.upload(screen.getByLabelText('Events'), file)

    expect(await screen.findByText('Loaded 1 event; rejected 1 row.')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Rejected events' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'invalid_type' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Invalid event' })).toBeInTheDocument()
  })

  it('catches file read failures, clears stale events, and resets the input', async () => {
    const file = new File(['patientId,type,date,title\n1,other,2024-01-01,Note\n'], 'events.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockRejectedValue(new Error('read failed')),
    })
    render(<Sidebar />)

    const input = screen.getByLabelText('Events') as HTMLInputElement
    await userEvent.upload(input, file)

    expect(await screen.findByText('read failed')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Loaded events' })).not.toBeInTheDocument()
    expect(useAppStore.getState().events).toEqual([])
    expect(input.value).toBe('')
  })
})

describe('Sidebar nephro fit configuration', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([row({ patientId: 1 })])
  })

  it('shows spec-level CKD progression controls outside the event import block', () => {
    render(<Sidebar />)

    expect(screen.getByRole('heading', { name: 'Nephro / CKD progression' })).toBeInTheDocument()
    expect(screen.getByLabelText('Fit preset')).toBeInTheDocument()
    expect(screen.getByLabelText('Censor after kidney transplant')).toBeInTheDocument()
    expect(screen.getByLabelText('Censor after chronic dialysis')).toBeInTheDocument()
    expect(screen.getByLabelText('Exclude acute dialysis intervals')).toBeInTheDocument()
    expect(screen.getByLabelText('Unknown dialysis policy')).toBeInTheDocument()
    expect(screen.getByLabelText('Exclude AKI windows from trend fits')).toBeInTheDocument()
    expect(screen.getByLabelText('Time balancing')).toBeInTheDocument()
    expect(screen.getByLabelText('Fit model')).toBeInTheDocument()
    expect(screen.queryByLabelText('Fit x-axis')).not.toBeInTheDocument()
  })

  it('switches presets to CKD progression defaults and marks manual edits as custom', async () => {
    render(<Sidebar />)

    await userEvent.selectOptions(screen.getByLabelText('Fit preset'), 'ckd_progression')
    let cfg = useAppStore.getState().seriesConfigs[0].fitConfig
    expect(cfg.preset).toBe('ckd_progression')
    expect(cfg.xAxis).toBe('age')
    expect(cfg.censoring.censorAfterKidneyTransplant).toBe(true)
    expect(cfg.exclusions.excludeAkiWindows).toBe(true)
    expect(cfg.timeBalancing).toBe('quarterly-median')

    await userEvent.click(screen.getByLabelText('Censor after kidney transplant'))
    cfg = useAppStore.getState().seriesConfigs[0].fitConfig
    expect(cfg.preset).toBe('custom')
    expect(cfg.censoring.censorAfterKidneyTransplant).toBe(false)
  })

  it('can configure a series other than the first one', async () => {
    useAppStore.getState().addSeries()
    useAppStore.getState().setSeriesConfig(1, { bezeichnung: 'Kreatinin HP', einheit: 'mg/dl' })
    render(<Sidebar />)

    await userEvent.selectOptions(screen.getByLabelText('Fit settings series'), '1')
    await userEvent.selectOptions(screen.getByLabelText('Fit preset'), 'ckd_progression')

    expect(useAppStore.getState().seriesConfigs[0].fitConfig.preset).toBe('general_exploration')
    expect(useAppStore.getState().seriesConfigs[1].fitConfig.preset).toBe('ckd_progression')
  })
})
