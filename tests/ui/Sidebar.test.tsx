import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from '../../src/ui/shell/Sidebar'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'
import type { MixedModelResult } from '../../src/core/mixedModel/types'
import type { MixedModelResultIdentity } from '../../src/core/mixedModel/resultIdentity'

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

const mixedModelIdentity: MixedModelResultIdentity = {
  seriesIndex: 0,
  seriesKey: 'eGFR|ml/min/1.73m2',
  patientIdsHash: 'patients',
  datasetHash: 'dataset',
  fitConfigHash: 'fit',
  nPatients: 3,
  nMeasurements: 6,
}

const mixedModelSuccess: MixedModelResult = {
  status: 'success',
  metadata: {
    engine: 'webr-lme4',
    formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
    runtimeVersion: '4.6.0',
    packageVersions: {},
    browserUserAgent: 'test',
    wasmAssetSource: 'cdn',
    optimizer: 'nloptwrap',
    reml: true,
    tolerance: 0.000001,
    datasetId: 'cohort',
    datasetHash: 'dataset',
    randomSeed: null,
    fitConfigHash: 'fit',
  },
  converged: true,
  warnings: [],
  nPatients: 3,
  nMeasurements: 6,
  fixedEffects: { intercept: 60, timeSinceBaseline: -3 },
  fixedEffectConfidenceIntervals: { timeSinceBaseline: [-3.5, -2.5] },
  randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
  residualSd: null,
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
    await userEvent.click(screen.getByLabelText('Show missing demographics'))
    await userEvent.click(screen.getByRole('button', { name: 'Enter demographics for patient 1' }))
    expect(screen.getByRole('dialog', { name: 'Manual demographics for patient 1' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Manual sex for patient 1'), 'm')
    await userEvent.type(screen.getByLabelText('Manual age for patient 1'), '50')
    expect(useAppStore.getState().manualDemographics[1]).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: 'Apply demographics' }))
    expect(useAppStore.getState().manualDemographics[1]).toEqual({ sex: 'm', age: 50 })
    expect(screen.getByText('Patient 1: m, age 50')).toBeInTheDocument()
  })

  it('hides missing demographics until toggled on', async () => {
    render(<Sidebar />)

    expect(screen.queryByText('Patient 1: missing')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Show missing demographics')).not.toBeChecked()

    await userEvent.click(screen.getByLabelText('Show missing demographics'))

    expect(screen.getByText('Patient 1: missing')).toBeInTheDocument()
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

  it('offers the demo events file next to the event upload', () => {
    render(<Sidebar />)

    const link = screen.getByRole('link', { name: 'Download demo events' })
    expect(link).toHaveAttribute('href', '/test_events.csv')
    expect(link).toHaveAttribute('download', 'test_events.csv')
    expect(link).toHaveAttribute('title', 'Download demo events')
    expect(link.closest('section')).toHaveTextContent('Events')
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

describe('Sidebar patient attributes import', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([row({ patientId: 10 })])
  })

  it('imports a valid attributes workbook, stores the byPatient map, and shows status counts', async () => {
    const file = new File([
      'patientId,genotype,inheritance\n',
      '10,UMOD,AD\n',
      '11,MUC1,AD\n',
      ',orphan,AD\n',
      '10,DUPLICATE,AD\n',
    ], 'attributes.csv', { type: 'text/csv' })
    render(<Sidebar />)

    await userEvent.upload(screen.getByLabelText('Patient attributes'), file)

    expect(await screen.findByText('Loaded 2 attribute rows; rejected 2 rows; 1 unknown patient.')).toBeInTheDocument()
    expect(useAppStore.getState().patientAttributes).toEqual({
      '10': { genotype: 'UMOD', inheritance: 'AD' },
      '11': { genotype: 'MUC1', inheritance: 'AD' },
    })
  })

  it('offers the demo attributes file next to the attributes upload', () => {
    render(<Sidebar />)

    const link = screen.getByRole('link', { name: 'Download demo attributes' })
    expect(link).toHaveAttribute('href', '/test_attributes.csv')
    expect(link).toHaveAttribute('download', 'test_attributes.csv')
    expect(link).toHaveAttribute('title', 'Download demo attributes')
    expect(link.closest('section')).toHaveTextContent('Patient attributes')
  })

  it('surfaces the header error and stores nothing when patientId is missing', async () => {
    const file = new File(['genotype,inheritance\nUMOD,AD\n'], 'attributes.csv', { type: 'text/csv' })
    render(<Sidebar />)

    await userEvent.upload(screen.getByLabelText('Patient attributes'), file)

    expect(await screen.findByText('Patient attributes file missing required column: patientId.')).toBeInTheDocument()
    expect(useAppStore.getState().patientAttributes).toEqual({})
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
    const mixedModelGroup = screen.getByRole('group', { name: 'Cohort mixed model' })
    expect(mixedModelGroup).toHaveClass('sidebar-control-frame')
    expect(within(mixedModelGroup).getByText('Experimental')).toBeInTheDocument()
    expect(within(mixedModelGroup).getByRole('button', { name: 'Open eGFR cohort model' })).toBeInTheDocument()
    expect(within(mixedModelGroup).getByLabelText('Cohort model line')).toBeDisabled()
    expect(screen.queryByLabelText('Fit x-axis')).not.toBeInTheDocument()
  })

  it('disables the eGFR cohort model dialog button until an eGFR series is active', () => {
    render(<Sidebar />)

    const mixedModelGroup = screen.getByRole('group', { name: 'Cohort mixed model' })
    expect(within(mixedModelGroup).getByRole('button', { name: 'Open eGFR cohort model' })).toBeDisabled()
    expect(within(mixedModelGroup).getByText('Select an eGFR cohort series to enable the experimental model.')).toBeInTheDocument()
  })

  it('opens the eGFR cohort model dialog from the nephro controls', async () => {
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    render(<Sidebar />)

    expect(useAppStore.getState().mixedModelDialogOpen).toBe(false)
    const button = screen.getByRole('button', { name: 'Open eGFR cohort model' })
    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(useAppStore.getState().mixedModelDialogOpen).toBe(true)
  })

  it('enables the cohort model line toggle after a model result is available', async () => {
    render(<Sidebar />)

    const toggle = screen.getByLabelText('Cohort model line')
    expect(toggle).toBeDisabled()

    act(() => {
      useAppStore.setState({ cohortModelResults: { cohort: { identity: mixedModelIdentity, result: mixedModelSuccess } } })
    })

    expect(screen.getByLabelText('Cohort model line')).toBeEnabled()
    await userEvent.click(screen.getByLabelText('Cohort model line'))
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(true)
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
