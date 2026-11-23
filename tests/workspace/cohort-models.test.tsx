import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CohortModelsWorkspace } from '../../src/workspace/CohortModelsWorkspace'
import { setLanguage } from '../../src/i18n'
import { useAppStore } from '../../src/workspace/state/store'
import type { LabRow } from '../../src/core/types'
import { buildMixedModelResultIdentity, mixedModelFitConfigHash } from '../../src/core/mixedModel/resultIdentity'
import { workspaceModelEntities } from '../../src/workspace/workspace-model-results'
import { workspaceModelSpec } from '../../src/workspace/workspace-data'
import { defaultFitSettings } from '../../src/workspace/workspace-analysis'
import type { WorkspaceData } from '../../src/workspace/workspace-data'



vi.mock('../../src/workspace/models/CohortModelTable', () => ({
  CohortModelTable: (props: any) => (
    <div data-testid="cohort-model-table">
      <span>Mocked CohortModelTable</span>
      <span>Series: {props.seriesKey}</span>
      <span>Entities: {props.entities?.length ?? 0}</span>
    </div>
  ),
}))

const originalRunCohortModels = useAppStore.getState().runCohortModels
afterEach(cleanup)

describe('CohortModelsWorkspace', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.setState({ runCohortModels: originalRunCohortModels })
  })

  const emptyData: WorkspaceData = {
    rawRows: [],
    rows: [],
    patients: [],
    parameters: [],
    events: [],
    patientAttributes: {},
    fileName: 'empty.csv',
    analysis: useAppStore.getState().analysisResult(),
    analysisSettings: useAppStore.getState().analysisSettings,
    manualDemographics: {},
  }

  const sampleRow1: LabRow = {
    patientId: 'P-01',
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'eGFR',
    einheit: 'mL/min/1.73m²',
    wert: '60',
    wertNum: 60,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 55,
  }

  const sampleRow2: LabRow = {
    patientId: 'P-02',
    labDatum: new Date('2020-06-01'),
    bezeichnung: 'eGFR',
    einheit: 'mL/min/1.73m²',
    wert: '75',
    wertNum: 75,
    wertOperator: '=',
    loinc: null,
    patientSex: 'w',
    patientAgeAtLab: 62,
  }

  const sampleRow3: LabRow = {
    patientId: 'P-01',
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1.2',
    wertNum: 1.2,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 55,
  }

  const dataset: WorkspaceData = {
    rawRows: [sampleRow1, sampleRow2, sampleRow3],
    rows: [sampleRow1, sampleRow2, sampleRow3],
    patients: [
      { id: 'P-01', label: 'P-01', attributes: {}, baselineAge: 55 },
      { id: 'P-02', label: 'P-02', attributes: {}, baselineAge: 62 },
    ],
    parameters: [
      { key: 'eGFR||mL/min/1.73m²', bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', label: 'eGFR', derived: false },
      { key: 'Kreatinin||mg/dl', bezeichnung: 'Kreatinin', einheit: 'mg/dl', label: 'Kreatinin', derived: false },
    ],
    events: [],
    patientAttributes: {
      'P-01': { sex: 'm', genotype: 'APOL1-G1' },
      'P-02': { sex: 'w', genotype: 'APOL1-G0' },
    },
    fileName: 'cohort.csv',
    analysis: useAppStore.getState().analysisResult(),
    analysisSettings: useAppStore.getState().analysisSettings,
    manualDemographics: {},
  }

  function qualifyingData(count = 10, times = 3): WorkspaceData {
    const rows = Array.from({ length: count }, (_, i) => Array.from({ length: times }, (_, year) => ({
      ...sampleRow1, patientId: `P-${i}`, labDatum: new Date(Date.UTC(2020 + year, 0, 1)),
      patientSex: i % 2 ? 'm' as const : 'w' as const, wertNum: 60 - year - i,
    }))).flat()
    return { ...dataset, rawRows: rows, rows, parameters: [dataset.parameters[0]],
      patients: Array.from({ length: count }, (_, i) => ({ id: `P-${i}`, label: `P-${i}`, attributes: {}, baselineAge: 55 })),
      patientAttributes: Object.fromEntries(Array.from({ length: count }, (_, i) => [`P-${i}`, { arm: i < 10 ? 'A' : 'B' }])),
    }
  }
  function studio(data: WorkspaceData) {
    return render(<CohortModelsWorkspace data={data} onBrowseTrajectories={vi.fn()} onBrowseData={vi.fn()} />)
  }
  function fitButtons() { return screen.getAllByRole('button', { name: /Fit model/i }) }
  function preview() { return document.querySelector<HTMLElement>('.cm-plot-card')! }

  it('explains the five-patient limit once, beside the single disabled action, without submitting', async () => {
    const run = vi.spyOn(useAppStore.getState(), 'runCohortModels')
    studio(qualifyingData(5))
    await screen.findByTestId('cohort-model-table')
    expect(fitButtons()).toHaveLength(1)
    const [button] = fitButtons()
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/No model can be fitted.*at least 10 patients/)
    fireEvent.click(button)
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('at least 10 patients')
    // The reason is printed once; the preview only points to it.
    expect(screen.getAllByText(/at least 10 patients/)).toHaveLength(1)
    expect(within(preview()).queryByRole('button', { name: /Fit/ })).not.toBeInTheDocument()
    expect(within(preview()).getByText('Model fitting is unavailable; see the reason above.')).toBeInTheDocument()
    expect(screen.queryByText(/Fit the model above/)).not.toBeInTheDocument()
    expect(run).not.toHaveBeenCalled()
    run.mockRestore()
  })

  it('offers one primary fit action and points the preview to it', () => {
    studio(qualifyingData())
    const [button] = fitButtons()
    expect(fitButtons()).toHaveLength(1)
    expect(button).toHaveAccessibleName('Fit model')
    expect(button).toHaveClass('primary')
    expect(within(preview()).queryByRole('button', { name: /Fit/ })).not.toBeInTheDocument()
    expect(within(preview()).getByText('Fit the model above to draw the population line.')).toBeInTheDocument()
  })

  it('does not repeat "computed" for a computed parameter whose label already says so', () => {
    const data = qualifyingData()
    data.parameters = [{ ...data.parameters[0], label: 'eGFR (CKD-EPI 2021, computed)', derived: true }]
    studio(data)
    expect(screen.getByRole('option', { name: /eGFR/ }).textContent).toBe('eGFR (CKD-EPI 2021, computed)')
    cleanup()
    data.parameters = [{ ...data.parameters[0], label: 'eGFR derived' }]
    studio(data)
    expect(screen.getByRole('option', { name: /eGFR/ }).textContent).toBe('eGFR derived (computed)')
  })

  it('explains zero prepared rows', () => {
    studio({ ...qualifyingData(), rows: [] })
    expect(fitButtons()[0]).toBeDisabled()
    expect(fitButtons()[0]).toHaveAccessibleDescription(/at least one measurement row/)
  })

  it('updates availability immediately when random slopes become identifiable', () => {
    studio(qualifyingData(10, 2))
    expect(fitButtons()[0]).toHaveAccessibleDescription(/3 distinct measurement times/)
    expect(fitButtons()[0]).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Custom model/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Intercept only' }))
    fitButtons().forEach(button => expect(button).toBeEnabled())
  })

  it('updates availability when a selected reference is absent and restored', () => {
    studio(qualifyingData())
    fitButtons().forEach(button => expect(button).toBeEnabled())
    act(() => useAppStore.getState().setMixedModelConfig({ ...useAppStore.getState().mixedModelConfig, factors: [{ key: 'sex', kind: 'categorical', effect: 'level', reference: 'absent' }] }))
    fitButtons().forEach(button => {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(/observed reference level/)
    })
    fireEvent.change(screen.getByLabelText('Sex reference'), { target: { value: 'm' } })
    fitButtons().forEach(button => expect(button).toBeEnabled())
  })

  it('keeps the action visible and explains Trajectories No fit', () => {
    studio(qualifyingData())
    act(() => useAppStore.getState().setTrajectoryFitSettings({ shared: { ...defaultFitSettings(), fitModel: 'none' }, columns: {} }))
    expect(fitButtons()).toHaveLength(1)
    fitButtons().forEach(button => {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(/disabled.*Trajectories/)
    })
  })

  it('allows switching data preparation directly in Cohort models and unblocks Trajectories No fit', () => {
    studio(qualifyingData())
    act(() => useAppStore.getState().setTrajectoryFitSettings({ shared: defaultFitSettings('acute_review'), columns: {} }))
    expect(fitButtons()[0]).toBeDisabled()
    const prepSelect = screen.getByLabelText('Data preparation') as HTMLSelectElement
    expect(prepSelect.value).toBe('acute_review')
    expect(prepSelect).toHaveAccessibleDescription(/Shared preparation.*1 parameter.*Existing model fits for affected parameters are discarded/)
    const announcement = screen.getByRole('status', { name: 'Preparation change' })
    expect(announcement).toBeEmptyDOMElement()
    fireEvent.change(prepSelect, { target: { value: 'ckd_progression' } })
    expect(announcement).toHaveTextContent(/Parameter preparation updated for 1 parameter: CKD progression/)
    expect(useAppStore.getState().trajectoryFitSettings.shared.presetId).toBe('acute_review')
    expect(useAppStore.getState().trajectoryFitSettings.columns[dataset.parameters[0].key].presetId).toBe('ckd_progression')
    expect(screen.getByTestId('model-preparation')).toHaveTextContent('CKD progression (own settings of this parameter): quarterly medians')
    expect(fitButtons()[0]).toBeEnabled()
    fireEvent.change(prepSelect, { target: { value: 'theil_sen' } })
    expect(screen.getByRole('status', { name: 'Preparation change' })).toBe(announcement)
    expect(announcement).toHaveTextContent('Theil–Sen robust trend')
  })

  it('submits the eligible pooled cohort and group A and explains the skipped group B', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ runCohortModels: run })
    studio(qualifyingData(15))
    fireEvent.click(screen.getByRole('button', { name: /Separate model per group/ }))
    const button = screen.getByRole('button', { name: /Fit models \(2\)/ })
    expect(button).toBeEnabled()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/1 group skipped.*B:.*at least 10 patients/)
    fireEvent.click(button)
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(run.mock.calls[0][0].entities.map((e: any) => e.entity.kind === 'cohort' ? 'cohort' : e.entity.value)).toEqual(['cohort', 'A'])
  })

  it('describes the actual preparation scope and preserves independent parameter settings', () => {
    const [sharedParameter, ownParameter] = dataset.parameters
    const ownSettings = defaultFitSettings('theil_sen')
    useAppStore.getState().setTrajectoryFitSettings({ shared: defaultFitSettings(), columns: { [ownParameter.key]: ownSettings } })
    studio(dataset)
    fireEvent.change(screen.getByLabelText('Model parameter'), { target: { value: sharedParameter.key } })
    const preparation = screen.getByLabelText('Data preparation')
    expect(preparation).toHaveAccessibleDescription(/Shared preparation affects 1 parameter.*eGFR/)
    fireEvent.change(preparation, { target: { value: 'ckd_progression' } })
    expect(useAppStore.getState().trajectoryFitSettings.columns[ownParameter.key]).toEqual(ownSettings)
    expect(useAppStore.getState().trajectoryFitSettings.columns[sharedParameter.key].presetId).toBe('ckd_progression')
    expect(useAppStore.getState().trajectoryFitSettings.shared.presetId).toBe('general_exploration')
    fireEvent.change(screen.getByLabelText('Model parameter'), { target: { value: ownParameter.key } })
    expect(preparation).toHaveAccessibleDescription(/Parameter preparation affects 1 parameter.*Kreatinin/)
    expect(screen.getByRole('status', { name: 'Preparation change' })).toBeEmptyDOMElement()
    // Smoke run of 2026-11-23: the count and the download size follow the interface language.
    cleanup()
    setLanguage('de')
    studio(dataset)
    fireEvent.change(screen.getByLabelText('Modellparameter'), { target: { value: ownParameter.key } })
    expect(screen.getByLabelText('Datenaufbereitung')).toHaveAccessibleDescription(/Die Parameteraufbereitung betrifft 1 Parameter in Kohortenmodellen und Verläufen: Kreatinin/)
    expect(screen.getByTestId('runtime-download-note')).toHaveTextContent('(etwa 39 MB)')
  })

  it('says before fitting that no group can be fitted and only the whole cohort will be', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ runCohortModels: run })
    const data = qualifyingData(12)
    data.patientAttributes = Object.fromEntries(data.patients.map((p, i) => [String(p.id), { arm: i < 7 ? 'A' : 'B' }]))
    studio(data)
    fireEvent.click(screen.getByRole('button', { name: /Separate model per group/ }))
    expect(screen.getByText('Patients with enough measurement times per group: A: 7, B: 5. Each group needs at least 10.')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('No arm group can be fitted on its own: each needs at least 10 patients with enough measurement times, and the largest, A, has 7. Only the whole cohort will be fitted.')
    const button = screen.getByRole('button', { name: 'Fit whole cohort only' })
    fireEvent.click(button)
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(run.mock.calls[0][0].entities.map((e: any) => e.entity.kind)).toEqual(['cohort'])
  })

  it('counts only patients with enough measurement times, as the validation does', () => {
    // Twelve patients in A, but two of them have only two distinct times.
    const data = qualifyingData(14)
    data.rows = data.rows.filter(row => !(['P-0', 'P-1'].includes(String(row.patientId)) && row.labDatum!.getUTCFullYear() === 2022))
    data.rawRows = data.rows
    data.patientAttributes = Object.fromEntries(data.patients.map((p, i) => [String(p.id), { arm: i < 12 ? 'A' : 'B' }]))
    studio(data)
    fireEvent.click(screen.getByRole('button', { name: /Separate model per group/ }))
    expect(screen.getByText('Patients with enough measurement times per group: A: 10, B: 2. Each group needs at least 10.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fit models (2)' })).toBeEnabled()
  })

  it('lets the user switch an attribute between numeric and categorical (OD-22)', () => {
    // Five patients per stage, so no level falls below the minimum per level (2026-11-22).
    const data = qualifyingData(15)
    data.patientAttributes = Object.fromEntries(data.patients.map((p, i) => [String(p.id), { stage: String(i % 3) }]))
    studio(data)
    fireEvent.click(screen.getByRole('button', { name: /Custom model/ }))
    fireEvent.change(screen.getByLabelText('Add covariate'), { target: { value: 'stage' } })
    const type = screen.getByLabelText('stage type') as HTMLSelectElement
    // The automatic choice stays the default: codes 0, 1, 2 are numeric.
    expect(type.value).toBe('numeric')
    expect([...type.options].map(option => option.textContent)).toEqual(['Numeric (automatic)', 'Categorical'])
    expect(useAppStore.getState().mixedModelConfig.factors).toEqual([{ key: 'stage', kind: 'numeric', effect: 'level' }])
    expect(screen.queryByLabelText('stage reference')).toBeNull()
    fireEvent.change(type, { target: { value: 'categorical' } })
    expect(useAppStore.getState().mixedModelConfig.factors).toEqual([{ key: 'stage', kind: 'categorical', effect: 'level', kindSource: 'user' }])
    expect(screen.getByLabelText('Reference categories')).toHaveTextContent('stage = 0 (default: the first level among the patients in the model')
    expect(screen.getByLabelText('Patients per level')).toHaveTextContent('stage: 0 5 (5), 1 5 (5), 2 5 (5)')
    fireEvent.change(screen.getByLabelText('stage reference'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('stage type'), { target: { value: 'numeric' } })
    // Back to the automatic type: no override recorded and no reference kept.
    expect(useAppStore.getState().mixedModelConfig.factors).toEqual([{ key: 'stage', kind: 'numeric', effect: 'level' }])
    // Baseline age and sex have a fixed type.
    fireEvent.change(screen.getByLabelText('Add covariate'), { target: { value: 'sex' } })
    expect(screen.queryByLabelText('Sex type')).toBeNull()
  })

  it('does not offer numeric for an attribute without a number', () => {
    const data = qualifyingData(12)
    data.patientAttributes = Object.fromEntries(data.patients.map((p, i) => [String(p.id), { arm: i % 2 ? 'A' : 'B' }]))
    studio(data)
    fireEvent.click(screen.getByRole('button', { name: /Custom model/ }))
    fireEvent.change(screen.getByLabelText('Add covariate'), { target: { value: 'arm' } })
    const type = screen.getByLabelText('arm type') as HTMLSelectElement
    expect(type.value).toBe('categorical')
    expect(type.options[0]).toBeDisabled()
    expect(type.options[1].textContent).toBe('Categorical (automatic)')
  })

  it('takes the default reference from the patients in the model, not from the whole dataset (OD-29)', () => {
    const data = qualifyingData(12)
    // Patient X has only a creatinine row, so it is not in the eGFR model; its
    // level "0" sorts first and was the default before 2026-11-22.
    const other = { ...sampleRow1, patientId: 'X', bezeichnung: 'Kreatinin', einheit: 'mg/dl', wertNum: 1.2 }
    data.rows = [...data.rows, other]
    data.rawRows = data.rows
    data.patients = [...data.patients, { id: 'X', label: 'X', attributes: {}, baselineAge: 50 }]
    data.patientAttributes = { ...Object.fromEntries(data.patients.map((p, i) => [String(p.id), { arm: i % 2 ? 'A' : 'B' }])), X: { arm: '0' } }
    studio(data)
    fireEvent.click(screen.getByRole('button', { name: /Custom model/ }))
    fireEvent.change(screen.getByLabelText('Add covariate'), { target: { value: 'arm' } })
    expect([...(screen.getByLabelText('arm reference') as HTMLSelectElement).options].map(option => option.value)).toEqual(['', '0', 'A', 'B'])
    expect(screen.getByLabelText('Reference categories')).toHaveTextContent('arm = A (default')
    expect(fitButtons()[0]).toBeEnabled()
    // A chosen reference is kept even where the model lacks it.
    fireEvent.change(screen.getByLabelText('arm reference'), { target: { value: '0' } })
    expect(screen.getByLabelText('Reference categories')).toHaveTextContent('arm = 0 (chosen)')
    expect(fitButtons()[0]).toBeDisabled()
  })

  it('keeps the validation reasons when groups fail for something other than size', () => {
    const data = qualifyingData(24)
    data.patientAttributes = Object.fromEntries(data.patients.map((p, i) => [String(p.id), { sex: i % 2 ? 'm' : 'w' }]))
    studio(data)
    fireEvent.click(screen.getByRole('button', { name: /Custom model/ }))
    fireEvent.change(screen.getByLabelText('Add covariate'), { target: { value: 'sex' } })
    fireEvent.change(screen.getByLabelText('Model grouping'), { target: { value: 'sex' } })
    const status = screen.getByRole('status', { name: '' })
    expect(status).not.toHaveTextContent(/can be fitted on its own/)
    expect(status).toHaveTextContent(/requires variation/)
  })

  it('identifies every affected unit when all grouped units are invalid', () => {
    const run = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ runCohortModels: run })
    const data = qualifyingData(8)
    data.patientAttributes = Object.fromEntries(data.patients.map((p, i) => [String(p.id), { arm: i < 4 ? 'A' : 'B' }]))
    studio(data)
    fireEvent.click(screen.getByRole('button', { name: /Separate model per group/ }))
    fitButtons().forEach(button => { expect(button).toBeDisabled(); fireEvent.click(button) })
    expect(run).not.toHaveBeenCalled()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/Whole cohort:.*A:.*B:/)
  })

  it('turns the action into a secondary refit for a current fit and back after changing outcome', () => {
    const data = qualifyingData()
    data.rows = [...data.rows, ...qualifyingData(5).rows.map(row => ({ ...row, bezeichnung: 'Kreatinin', einheit: 'mg/dl' }))]
    data.parameters = dataset.parameters
    const spec = workspaceModelSpec(data, data.parameters[0].key, useAppStore.getState().trajectoryFitSettings)!
    const config = useAppStore.getState().mixedModelConfig
    const entity = workspaceModelEntities(data.rows, data.patients.map(p => p.id), spec, config, data.patientAttributes, [])[0]
    const identity = buildMixedModelResultIdentity({ seriesIndex: 0, seriesKey: data.parameters[0].key,
      rows: entity.rows, patientIds: entity.rows.map(row => row.patient_id), preparation: entity.preparation,
      fitConfigHash: mixedModelFitConfigHash(spec, config, 'apply') })
    useAppStore.setState({ cohortModelResults: { cohort: { identity, result: {
      status: 'success', converged: true, singular: false, fixedEffects: { intercept: 60, timeSinceBaseline: -2 },
    } as any } } })
    studio(data)
    expect(fitButtons()).toHaveLength(1)
    expect(fitButtons()[0]).toHaveAccessibleName('Refit model')
    expect(fitButtons()[0]).not.toHaveClass('primary')
    expect(fitButtons()[0]).toBeEnabled()
    expect(screen.getByText(/Whole cohort fitted trajectory/)).toBeInTheDocument()
    expect(within(preview()).queryByText(/Fit the model above/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Model parameter'), { target: { value: 'Kreatinin||mg/dl' } })
    expect(fitButtons()).toHaveLength(1)
    expect(fitButtons()[0]).toHaveAccessibleName('Fit model')
    expect(fitButtons()[0]).toHaveClass('primary')
    expect(fitButtons()[0]).toBeDisabled()
    expect(fitButtons()[0]).toHaveAccessibleDescription(/at least 10 patients/)
  })

  it('shows progress guidance while the action is disabled during fitting', () => {
    useAppStore.setState({ cohortModelRunning: true, cohortModelProgress: { completed: 0, total: 2, key: 'cohort' } })
    studio(qualifyingData())
    expect(screen.getByRole('button', { name: /Fitting 1 of 2/ })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /Fitting/ })).toHaveLength(1)
    expect(within(preview()).getAllByText('Fitting model …').length).toBeGreaterThan(0)
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Fitting 1 of 2')
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('The first fit of a session loads R into the browser; this can take a few minutes. Later fits take seconds.')
    expect(screen.queryByText(/Click 'Fit model'/)).not.toBeInTheDocument()
  })

  it('says next to the fit button, until R has been loaded in the session, that R is loaded from the app\'s own address', () => {
    const view = studio(qualifyingData())
    const note = screen.getByTestId('runtime-download-note')
    expect(note).toHaveTextContent('The first fit of a session loads the R runtime and R packages, which are served with this app from its own address (about 39 MB). These are downloads only; no measurements are sent.')
    expect(within(note).getByRole('link', { name: 'Network access and local storage' })).toHaveAttribute('href', '#methods/data/network')
    // Visible before the first click, not only inside the collapsed details.
    expect(note.closest('details')).toBeNull()
    expect(note.closest('section')).toBe(screen.getByRole('button', { name: /^Fit model/ }).closest('section'))
    view.unmount()
    useAppStore.setState({ cohortModelRuntimeLoaded: true })
    studio(qualifyingData())
    expect(screen.queryByTestId('runtime-download-note')).not.toBeInTheDocument()
  })

  it('offers Cancel while fitting and names the loading of R only before the first finished fit', async () => {
    useAppStore.setState({ cohortModelRunning: true, cohortModelRuntimeLoaded: true, cohortModelProgress: { completed: 0, total: 2, key: 'cohort' } })
    const view = studio(qualifyingData())
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Fitting 1 of 2')
    expect(screen.getByRole('status', { name: '' })).not.toHaveTextContent(/loads R into the browser/)
    view.unmount()
    // A real run in flight: Cancel ends it, says so and returns the focus to the fit button.
    act(() => useAppStore.setState({ cohortModelRunning: false, cohortModelProgress: null }))
    studio(qualifyingData())
    let pending!: Promise<void>
    act(() => { pending = useAppStore.getState().runCohortModels({ entities: [{ entity: { kind: 'cohort' }, rows: [] }], seriesIndex: 0, seriesKey: 'k', fitConfigHash: 'h', config: useAppStore.getState().mixedModelConfig, formula: 'f', runJob: () => new Promise(() => {}) }) })
    void pending
    expect(screen.getByRole('button', { name: /Fitting 1 of 1/ })).toBeDisabled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
    expect(useAppStore.getState().cohortModelRunning).toBe(false)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Fit cancelled. Nothing of this run was stored; models fitted before are kept.')
    await waitFor(() => expect(fitButtons()[0]).toHaveFocus())
  })

  it('asks before a data preparation change discards fitted models', () => {
    studio(qualifyingData())
    const prepSelect = screen.getByLabelText('Data preparation') as HTMLSelectElement
    const confirm = vi.spyOn(window, 'confirm')
    // Nothing fitted: no question.
    fireEvent.change(prepSelect, { target: { value: 'theil_sen' } })
    expect(confirm).not.toHaveBeenCalled()
    expect(useAppStore.getState().trajectoryFitSettings.shared.presetId).toBe('theil_sen')
    // A fit in flight (the same question covers stored models): declining keeps everything.
    act(() => useAppStore.setState({ cohortModelRunning: true, cohortModelProgress: { completed: 0, total: 1, key: 'cohort' } }))
    confirm.mockReturnValueOnce(false)
    fireEvent.change(prepSelect, { target: { value: 'general_exploration' } })
    expect(confirm).toHaveBeenCalledWith('Changing the data preparation stops the running fit. Continue?')
    expect(useAppStore.getState().trajectoryFitSettings.shared.presetId).toBe('theil_sen')
    expect(useAppStore.getState().cohortModelRunning).toBe(true)
    expect(prepSelect.value).toBe('theil_sen')
    // Accepting applies the change.
    confirm.mockReturnValueOnce(true)
    fireEvent.change(prepSelect, { target: { value: 'general_exploration' } })
    expect(useAppStore.getState().trajectoryFitSettings.shared.presetId).toBe('general_exploration')
    confirm.mockRestore()
  })

  it('renders load prompt when no data is loaded', () => {
    const onBrowseData = vi.fn()
    render(<CohortModelsWorkspace data={emptyData} onBrowseTrajectories={vi.fn()} onBrowseData={onBrowseData} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Cohort models' })).toBeVisible()
    expect(screen.getByText('Load a dataset first to fit population-level mixed models.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Load data' }))
    expect(onBrowseData).toHaveBeenCalledTimes(1)
  })

  it('renders model parameter, presets, and plot preview when data is loaded', async () => {
    const onBrowseTrajectories = vi.fn()
    render(
      <CohortModelsWorkspace
        data={dataset}
        onBrowseTrajectories={onBrowseTrajectories}
        onBrowseData={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Cohort models' })).toBeVisible()

    // Parameter dropdown
    const paramSelect = screen.getByLabelText('Model parameter') as HTMLSelectElement
    expect(paramSelect).toBeInTheDocument()
    expect(paramSelect.value).toBe('eGFR||mL/min/1.73m²')

    // Preset buttons
    expect(screen.getByRole('button', { name: 'Whole cohort' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Separate model per group/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Adjusted for age and sex/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Difference between groups/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Custom model/i })).toBeInTheDocument()

    // Navigation button
    fireEvent.click(screen.getByRole('button', { name: /View trajectories/i }))
    expect(onBrowseTrajectories).toHaveBeenCalledTimes(1)

    // Formula strip is visible
    expect(screen.getByLabelText('Readable formula')).toHaveTextContent(/Time \(years\) \+ \(1 \+ Time \(years\) \| Patient\)/)

    // Trajectory plot preview is rendered
    expect(screen.getByRole('heading', { level: 2, name: 'Model trajectory preview' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Model trajectory preview for eGFR/i)).toBeInTheDocument()

    // The results table is part of the main bundle: it is there with the first
    // render, without a separately fetched chunk that can fail to load.
    expect(screen.getByTestId('cohort-model-table')).toBeInTheDocument()
    expect(screen.getByText(/Series: eGFR\|\|mL\/min\/1\.73m²/)).toBeInTheDocument()
    expect(screen.getByText(/Entities: 1/)).toBeInTheDocument()
  })

  it('switches to subgroup comparison preset and updates grouping', () => {
    render(
      <CohortModelsWorkspace
        data={dataset}
        onBrowseTrajectories={vi.fn()}
        onBrowseData={vi.fn()}
      />
    )

    const subgroupBtn = screen.getByRole('button', { name: /Separate model per group/i })
    fireEvent.click(subgroupBtn)

    // Grouping dropdown appears when in subgroup comparison preset
    const groupSelect = screen.getByLabelText('Model grouping') as HTMLSelectElement
    expect(groupSelect).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'No grouping (Whole cohort)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'genotype' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'sex' })).toBeInTheDocument()

    // genotype is the first available attribute alphabetically
    expect(groupSelect.value).toBe('genotype')
    fireEvent.change(groupSelect, { target: { value: '' } })
    expect(groupSelect.value).toBe('')
  })

  it('switches to demographic adjustment preset and adds demographic covariates', () => {
    render(
      <CohortModelsWorkspace
        data={dataset}
        onBrowseTrajectories={vi.fn()}
        onBrowseData={vi.fn()}
      />
    )

    const demoBtn = screen.getByRole('button', { name: /Adjusted for age and sex/i })
    fireEvent.click(demoBtn)

    // Formula reflects demographic adjustment
    expect(screen.getByLabelText('Readable formula')).toHaveTextContent('"Baseline age (centered)"')
    expect(screen.getByLabelText('Readable formula')).toHaveTextContent('"Sex"')
    // The fit summary says the same in words; the formula sits in the collapsed details.
    expect(document.querySelector('.cm-sample-meta')).toHaveTextContent(/^Average change of .* per year across .*with baseline age \(shifts the level\) and sex \(shifts the level\)\. Each patient has an own starting level and rate\./)
    // A factor on level and slope: the value is the reference group's slope, not an average.
    fireEvent.change(screen.getByLabelText('Sex effect'), { target: { value: 'level_slope' } })
    expect(document.querySelector('.cm-sample-meta')).toHaveTextContent(/^Change of .* per year for the reference group across /)
    fireEvent.change(screen.getByLabelText('Sex effect'), { target: { value: 'level' } })
    expect(screen.getByLabelText('Readable formula').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText(/^A cohort model estimates the average change per year.*and, by default, an own rate/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Intercept only' }))
    expect(document.querySelector('.cm-sample-meta')).toHaveTextContent(/Each patient has an own starting level; the rate is common to all\.$/)
  })

  it('accounts for every patient behind the complete-case count', () => {
    const data = qualifyingData()
    studio({ ...data, patients: [...data.patients, { id: 'P-none', label: 'P-none', attributes: {}, baselineAge: 55 }] })
    expect(document.querySelector('.cm-sample-meta')).toHaveTextContent('across 10 of 11 patients')
    expect(screen.getByText('Patients not in the model (1)')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Patients not in the model' })).toHaveTextContent('P-none: No usable measurement of this parameter after data preparation')
  })

  it('names the patients with enough measurement times for the whole cohort when no factor lists them', () => {
    const data = qualifyingData()
    // One more patient with two measurement times: in the model, but not counted towards the minimum.
    const short = [0, 1].map(year => ({ ...data.rows[0], patientId: 'P-short', labDatum: new Date(Date.UTC(2020 + year, 0, 1)) }))
    studio({ ...data, rawRows: [...data.rows, ...short], rows: [...data.rows, ...short], patients: [...data.patients, { id: 'P-short', label: 'P-short', attributes: {}, baselineAge: 55 }] })
    expect(document.querySelector('.cm-sample-meta')).toHaveTextContent('across 11 of 11 patients')
    expect(screen.getByLabelText('Patients with enough measurement times')).toHaveTextContent('Whole cohort, patients with enough measurement times: 10 of 11.')
    // With a categorical factor the per-level counts take its place.
    fireEvent.click(screen.getByRole('button', { name: /Adjusted for age and sex/i }))
    expect(screen.queryByLabelText('Patients with enough measurement times')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Patients per level')).toBeInTheDocument()
  })

  it('shows which reference category each categorical factor uses', () => {
    render(<CohortModelsWorkspace data={dataset} onBrowseTrajectories={vi.fn()} onBrowseData={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Adjusted for age and sex/i }))
    // The small test cohort has fewer than five patients per sex; keep the levels as they are.
    fireEvent.click(screen.getByLabelText(/Pool small levels/))
    const references = screen.getByLabelText('Reference categories')
    const select = screen.getByLabelText('Sex reference') as HTMLSelectElement
    // Since 2026-11-22 the default is the first level among the patients in the model (OD-29).
    const [defaultOption, first, second] = [...select.options].map(option => option.value)
    expect(defaultOption).toBe('')
    expect(select.value).toBe('')
    expect(references).toHaveTextContent(/Sex = \S+ \(default: the first level among the patients in the model; choose another next to the factor\)/)
    const chosen = second ?? first
    fireEvent.change(select, { target: { value: chosen } })
    expect(screen.getByLabelText('Reference categories')).toHaveTextContent(`Sex = ${chosen} (chosen)`)
    expect(screen.getByLabelText('Reference categories')).not.toHaveTextContent('first level')
    expect(useAppStore.getState().mixedModelConfig.factors?.find(factor => factor.key === 'sex')?.reference).toBe(chosen)
    fireEvent.change(select, { target: { value: '' } })
    expect(useAppStore.getState().mixedModelConfig.factors?.find(factor => factor.key === 'sex')).not.toHaveProperty('reference')
  })

  it('does not offer an overlay for an unrelated stored result', async () => {
    useAppStore.setState({
      cohortModelResults: {
        'eGFR||mL/min/1.73m²': {
          result: {
            status: 'success',
            coefficients: [],
            residuals: [],
            fitted: [],
            vcov: [],
            diagnostics: { nobs: 2, ngrps: 2, logLik: -5, aic: 10, bic: 12 },
          } as any,
          identity: {} as any,
        },
      },
    })

    render(
      <CohortModelsWorkspace
        data={dataset}
        onBrowseTrajectories={vi.fn()}
        onBrowseData={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('Show cohort model line in overlay')).not.toBeInTheDocument()
  })

  // Decisions of 2026-11-22 (issue #4): od29, genomin, genomiss, uacr, dropout.
  describe('decisions of 2026-11-22', () => {
    function genotypeData(): WorkspaceData {
      // 24 patients: G1 holds A ×2, B ×6, C ×4; G2 holds B ×6, C ×6. The whole cohort's
      // default is A, G2's is B.
      const data = qualifyingData(24)
      data.patientAttributes = Object.fromEntries(data.patients.map((p, i) => [String(p.id), {
        centre: i < 12 ? 'G1' : 'G2', genotype: i < 2 ? 'A' : i < 8 ? 'B' : i < 12 ? 'C' : i < 18 ? 'B' : 'C',
      }]))
      return data
    }

    it('warns when the whole cohort and a group use different default references', () => {
      studio(genotypeData())
      fireEvent.click(screen.getByRole('button', { name: /Custom model/ }))
      fireEvent.change(screen.getByLabelText('Add covariate'), { target: { value: 'genotype' } })
      // Keep A so that it stays the whole cohort's default.
      fireEvent.click(screen.getByLabelText(/Pool small levels/))
      fireEvent.change(screen.getByLabelText('Model grouping'), { target: { value: 'centre' } })
      expect(screen.getByRole('note', { name: 'Different reference levels' })).toHaveTextContent(
        'The models use different default reference levels for genotype (A in the whole cohort, A in G1, B in G2). Their reference starting levels, slopes and contrasts refer to different groups and cannot be compared directly.')
      // A chosen reference applies to every model: no warning.
      fireEvent.change(screen.getByLabelText('genotype reference'), { target: { value: 'B' } })
      expect(screen.queryByRole('note', { name: 'Different reference levels' })).not.toBeInTheDocument()
    })

    it('pools small levels by default, shows the counts before the fit and can keep them', () => {
      studio(genotypeData())
      fireEvent.click(screen.getByRole('button', { name: /Custom model/ }))
      fireEvent.change(screen.getByLabelText('Add covariate'), { target: { value: 'genotype' } })
      const pool = screen.getByLabelText(/Pool small levels/) as HTMLInputElement
      expect(pool.checked).toBe(true)
      expect(screen.getByLabelText('Minimum per level')).toHaveTextContent('A level needs at least 5 patients with 2 or more measurements in the model (a rule of this tool).')
      expect(screen.getByLabelText('Minimum per level')).toHaveTextContent('Whole cohort: genotype A (2 of 2) pooled into “other (pooled)”, which still has fewer than 5.')
      expect(screen.getByLabelText('Patients per level')).toHaveTextContent('genotype: B 12 (12), C 10 (10), other (pooled) 2 (2)')
      fireEvent.click(pool)
      expect(useAppStore.getState().mixedModelConfig.smallLevelPolicy).toBe('keep')
      expect(screen.getByLabelText('Minimum per level')).toHaveTextContent('Whole cohort: genotype A (2 of 2) below the minimum, kept.')
      // A preset keeps the choice.
      fireEvent.click(screen.getByRole('button', { name: /Adjusted for age and sex/ }))
      expect(useAppStore.getState().mixedModelConfig.smallLevelPolicy).toBe('keep')
      fireEvent.click(screen.getByLabelText(/Pool small levels/))
      expect(useAppStore.getState().mixedModelConfig).not.toHaveProperty('smallLevelPolicy')
    })

    it('reports dropout by reason and warns above 10 % KRT', () => {
      const data = qualifyingData(12)
      data.events = [
        { patientId: 'P-0', type: 'kidney_transplant', date: new Date(Date.UTC(2022, 5, 1)), title: 'Tx', description: null, endDate: null, intent: null, warning: '' },
        { patientId: 'P-1', type: 'dialysis', date: new Date(Date.UTC(2022, 5, 1)), title: 'HD', description: null, endDate: null, intent: 'chronic', warning: '' },
      ]
      studio(data)
      expect(screen.getByRole('note', { name: 'Dropout warning' })).toHaveTextContent('More than 10 % of the patients in the whole cohort reached kidney replacement therapy or died within follow-up (a rule of this tool).')
      const table = screen.getByRole('table', { name: 'Dropout by reason' })
      expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Whole cohortAll122001016.7 %')
    })

    it('offers log baseline UACR, labelled a possible mediator, only as an added covariate', () => {
      const data = qualifyingData(10)
      const uacrRows = data.patients.map(patient => ({ ...sampleRow1, patientId: String(patient.id), bezeichnung: 'UACR', einheit: 'mg/g', labDatum: new Date(Date.UTC(2020, 0, 10)), wert: '30', wertNum: 30 }))
      data.rows = [...data.rows, ...uacrRows]
      data.rawRows = data.rows
      studio(data)
      expect(useAppStore.getState().mixedModelConfig.factors ?? []).toEqual([])
      fireEvent.click(screen.getByRole('button', { name: /Custom model/ }))
      const option = within(screen.getByLabelText('Add covariate')).getByRole('option', { name: 'Log baseline UACR (possible mediator)' })
      fireEvent.change(screen.getByLabelText('Add covariate'), { target: { value: (option as HTMLOptionElement).value } })
      expect(useAppStore.getState().mixedModelConfig.factors).toEqual([{ key: 'log_baseline_uacr', kind: 'numeric', effect: 'level', series: { name: 'UACR', unit: 'mg/g' } }])
      expect(screen.getByText('Log baseline UACR (possible mediator)', { selector: '.cm-chip-name' })).toBeInTheDocument()
    })
  })
})
