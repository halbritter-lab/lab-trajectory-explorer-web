/**
 * Time to event on Cohort models (issue #78, decisions `km`, `death`,
 * `taxonomy` of 2026-11-22): per-patient entry, exit and status from the
 * Trajectories cells, the estimates, the export and the page area. The worked
 * example is the one of docs/method-algorithms/time-to-event.md.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { useAppStore } from '../../src/workspace/state/store'
import { useWorkspaceData, workspaceModelSpec } from '../../src/workspace/workspace-data'
import { buildCohortRows } from '../../src/core/cohort/screening'
import type { LabRow } from '../../src/core/types'
import type { ClinicalEvent } from '../../src/core/events/events'
import { timeToEventAnalysis, timeToEventRow, type TimeToEventSettings } from '../../src/core/domains/nephrology/endpoints/timeToEvent'
import { availableTimeToEventEndpoints, endpointDefinitionText, numberAtRiskAt, timeToEventExportSheets, timeToEventInputs } from '../../src/workspace/time-to-event'
import { workspaceGroupableAttributes } from '../../src/workspace/workspace-model-results'
import { sheetsToXlsxBytes } from '../../src/io/export'
import { CohortModelsWorkspace } from '../../src/workspace/CohortModelsWorkspace'
import { inputDataId, labRowsInputDataId, workspaceWorkbookSheets } from '../../src/workspace/workspace-export'
import { analysisRecord } from '../../src/workspace/analysis-record'
import { setLanguage } from '../../src/i18n'

vi.mock('../../src/workspace/models/CohortModelTable', () => ({ CohortModelTable: () => <div data-testid="cohort-model-table" /> }))

const UNIT = 'mL/min/1.73m²'
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const egfr = (patientId: string, date: string, value: number, birth = '1970-01-01'): LabRow => ({
  patientId, labDatum: day(date), bezeichnung: 'eGFR', einheit: UNIT, wert: String(value), wertNum: value, wertOperator: '=', loinc: null,
  patientSex: 'w', patientAgeAtLab: null, patientBirthDate: day(birth),
})
const event = (patientId: string, type: ClinicalEvent['type'], date: string): ClinicalEvent => ({ patientId, type, date: day(date), title: type, description: null, endDate: null, intent: null, warning: '' })

// P1: confirmed G4 from 2021-01-01 (28, confirmed by 25 on 2021-06-01).
// P2: no endpoint, dies 2021-06-01. P3: transplant 2020-06-01 (the later value is not eligible).
// P4: below 30 from the first value: endpoint at entry. P5: one value. P6: dies 2020-01-01, a value after it.
const rows: LabRow[] = [
  egfr('P1', '2019-01-01', 50), egfr('P1', '2020-01-01', 45), egfr('P1', '2021-01-01', 28), egfr('P1', '2021-06-01', 25),
  egfr('P2', '2019-01-01', 60, '1960-01-01'), egfr('P2', '2020-01-01', 55, '1960-01-01'), egfr('P2', '2021-01-01', 50, '1960-01-01'),
  egfr('P3', '2019-01-01', 40), egfr('P3', '2020-01-01', 35), egfr('P3', '2021-01-01', 33),
  egfr('P4', '2019-01-01', 25), egfr('P4', '2019-06-01', 24),
  egfr('P5', '2019-01-01', 70),
  egfr('P6', '2019-01-01', 70), egfr('P6', '2020-06-01', 68),
]
const events = [event('P2', 'death', '2021-06-01'), { ...event('P3', 'kidney_transplant', '2020-06-01') }, event('P6', 'death', '2020-01-01')]

function loadExample() {
  useAppStore.getState().replaceDataset({ rows, events })
  const state = useAppStore.getState()
  state.setTrajectoryFitSettings({ ...state.trajectoryFitSettings, shared: { ...state.trajectoryFitSettings.shared, endpoints: { ...state.trajectoryFitSettings.shared.endpoints, observedCkdG4: true } } })
  act(() => state.setPatientAttributes({ P1: { cohort: 'A' }, P2: { cohort: 'A' }, P3: { cohort: 'B' }, P4: { cohort: 'B' }, P6: { cohort: 'B' } }))
  const { result } = renderHook(useWorkspaceData)
  return result.current
}

function inputsFor(endpoint: TimeToEventSettings['endpoint'], grouping: string | null = null) {
  const data = loadExample()
  const parameter = data.parameters.find(p => p.bezeichnung === 'eGFR')!
  const spec = workspaceModelSpec(data, parameter.key, useAppStore.getState().trajectoryFitSettings)!
  const cells = buildCohortRows(data.rows, data.patients.map(p => p.id), [spec]).map(row => ({ patientId: row.patientId, cell: row.cells[0] }))
  return { data, spec, inputs: timeToEventInputs(cells, endpoint, grouping, workspaceGroupableAttributes(data.rows, data.patientAttributes), data.events, data.patients) }
}

beforeEach(() => useAppStore.getState().reset())
afterEach(cleanup)

describe('entry, exit and status per patient', () => {
  it('follows the rules on the time since the first eligible measurement', () => {
    const { inputs } = inputsFor('observedCkdG4')
    const analysis = timeToEventAnalysis(inputs, { endpoint: 'observedCkdG4', compositeWithKrt: false, timeScale: 'time_since_entry', grouping: null })
    const byId = Object.fromEntries(analysis.rows.map(row => [row.patientId, row]))
    // 2019-01-01 to 2021-01-01 is 731 days; to 2021-06-01 882 days.
    expect(byId.P1).toMatchObject({ included: true, entryDays: 0, exitDays: 731, status: 1, outcome: 'endpoint', confirmedDate: day('2021-06-01') })
    expect(byId.P2).toMatchObject({ included: true, exitDays: 882, status: 2, outcome: 'death' })
    // Transplant without the KRT endpoint: censored at the last eligible value (2020-01-01).
    expect(byId.P3).toMatchObject({ included: true, exitDays: 365, status: 0, outcome: 'censored' })
    expect(byId.P4).toMatchObject({ included: false, exclusion: 'endpoint_before_entry' })
    expect(byId.P5).toMatchObject({ included: false, exclusion: 'no_follow_up' })
    // The value after the death is not eligible; the death ends follow-up.
    expect(byId.P6).toMatchObject({ included: true, exitDays: 365, status: 2, outcome: 'death' })
    const [all] = analysis.groups
    expect(all.km.steps.map(step => [step.time, step.nRisk, step.nEvent, step.nCensor, step.survival])).toEqual([[365, 4, 0, 2, 1], [731, 2, 1, 0, 0.5], [882, 1, 0, 1, 0.5]])
    // S = 0.5 from the last event time to the last exit: the midpoint (731 + 882) / 2, as R.
    expect(all.km.median.estimate).toBe(806.5)
    // Aalen–Johansen: F2(365) = 1/4; F1(731) = 0.75 · 1/2 = 0.375; F2(882) = 0.25 + 0.375.
    expect(analysis.deathRecorded).toBe(true)
    expect(all.cumulativeIncidence!.map(step => [step.time, step.endpoint, step.death])).toEqual([[365, 0, 0.25], [731, 0.375, 0.25], [882, 0.375, 0.625]])
    expect(numberAtRiskAt(all.subjects, 0, 'time_since_entry')).toBe(4)
    expect(numberAtRiskAt(all.subjects, 1, 'time_since_entry')).toBe(2)
    expect(numberAtRiskAt(all.subjects, 2, 'time_since_entry')).toBe(2)
  })

  it('counts kidney replacement therapy in the composite and as its own endpoint', () => {
    const { inputs } = inputsFor('observedCkdG4')
    const composite = timeToEventAnalysis(inputs, { endpoint: 'observedCkdG4', compositeWithKrt: true, timeScale: 'time_since_entry', grouping: null })
    // 2019-01-01 to 2020-06-01: 517 days.
    expect(composite.rows.find(row => row.patientId === 'P3')).toMatchObject({ exitDays: 517, status: 1, outcome: 'kidney_replacement_therapy' })
    const krt = timeToEventAnalysis(inputsFor('kidneyFailure').inputs, { endpoint: 'kidneyFailure', compositeWithKrt: false, timeScale: 'time_since_entry', grouping: null })
    const byId = Object.fromEntries(krt.rows.map(row => [row.patientId, row]))
    expect(byId.P3).toMatchObject({ status: 1, exitDays: 517 })
    // G4 is no event here: P1 censored at the last eligible value, P4 is in the analysis.
    expect(byId.P1).toMatchObject({ status: 0, exitDays: 882 })
    expect(byId.P4).toMatchObject({ included: true, status: 0, exitDays: 151 })
  })

  it('uses ages with delayed entry on the age scale', () => {
    const { inputs } = inputsFor('observedCkdG4')
    const analysis = timeToEventAnalysis(inputs, { endpoint: 'observedCkdG4', compositeWithKrt: false, timeScale: 'age', grouping: null })
    const p1 = analysis.rows.find(row => row.patientId === 'P1')!
    const p2 = analysis.rows.find(row => row.patientId === 'P2')!
    // Born 1970-01-01: 2019-01-01 is day 17897, 2021-01-01 day 18628. P2 born 1960-01-01: entry day 21550.
    expect([p1.entryDays, p1.exitDays]).toEqual([17897, 18628])
    expect([p2.entryDays, p2.exitDays]).toEqual([21550, 22432])
    const [all] = analysis.groups
    // At age 18628 days only P1 (17897 < t <= 18628) is at risk: P3 and P6 left at 18262, P2 enters at 21550.
    expect(all.km.steps.find(step => step.time === 18628)).toMatchObject({ nRisk: 1, nEvent: 1, survival: 0 })
  })

  it('lists every left-out patient with a reason, and groups', () => {
    const { inputs } = inputsFor('observedCkdG4', 'cohort')
    const analysis = timeToEventAnalysis(inputs, { endpoint: 'observedCkdG4', compositeWithKrt: false, timeScale: 'time_since_entry', grouping: 'cohort' })
    expect(analysis.rows.filter(row => !row.included).map(row => [row.patientId, row.exclusion])).toEqual([['P4', 'endpoint_before_entry'], ['P5', 'no_group_value']])
    expect(analysis.groups.map(group => [group.label, group.km.subjects, group.km.events])).toEqual([['A', 2, 1], ['B', 2, 0]])
    // One event at 731 in A, both A at risk, B has left (365): E_A = 1, V = 0, so no test.
    expect(analysis.logRank!.groups.map(group => [group.observed, group.expected])).toEqual([[1, 1], [0, 0]])
    expect(analysis.logRank!.chiSquare).toBeNull()
  })

  it('excludes a patient whose KRT precedes every measurement when KRT is the endpoint', () => {
    const row = timeToEventRow({ patientId: 'X', group: null, firstEligibleDate: null, lastEligibleDate: null, endpoint: null,
      kidneyFailure: { type: 'chronic_dialysis', date: day('2018-01-01') }, deathDate: null, birthAnchor: null, ageEstimated: false },
    { endpoint: 'kidneyFailure', compositeWithKrt: false, timeScale: 'time_since_entry', grouping: null })
    expect(row).toMatchObject({ included: false, exclusion: 'endpoint_before_entry' })
  })
})

describe('recorded deaths (code review of wave 3)', () => {
  it('shows Aalen–Johansen only when an included patient exits by death', () => {
    const input = (patientId: string, deathDate: Date | null) => ({ patientId, group: null, firstEligibleDate: day('2019-01-01'), lastEligibleDate: day('2021-06-01'),
      endpoint: { firstDate: day('2021-01-01'), confirmedDate: day('2021-06-01') }, kidneyFailure: null, deathDate, birthAnchor: day('1970-01-01'), ageEstimated: false })
    const settings: TimeToEventSettings = { endpoint: 'observedCkdG4', compositeWithKrt: false, timeScale: 'time_since_entry', grouping: null }
    // A death after the endpoint: exit at the endpoint (status 1); no competing death in the analysis.
    const after = timeToEventAnalysis([input('P1', day('2022-01-01'))], settings)
    expect(after.rows[0]).toMatchObject({ status: 1 })
    expect(after.deathRecorded).toBe(false)
    expect(after.groups[0].cumulativeIncidence).toBeNull()
    // A death before the endpoint ends follow-up with status 2.
    expect(timeToEventAnalysis([input('P1', day('2020-06-01'))], settings).deathRecorded).toBe(true)
  })
})

describe('definition, export and page', () => {
  it('offers only the endpoints the parameter settings evaluate and states the definition', () => {
    expect(availableTimeToEventEndpoints({ percentDecline: false, observedCkdG5: false, projectedAgeToCkdG5: false })).toEqual(['kidneyFailure'])
    expect(availableTimeToEventEndpoints({ percentDecline: true, observedDecline50: true, observedCkdG4: true, observedCkdG5: true, projectedAgeToCkdG5: false }))
      .toEqual(['observedCkdG4', 'observedCkdG5', 'observedDecline40', 'observedDecline50', 'observedDecline57', 'kidneyFailure'])
    expect(endpointDefinitionText('observedCkdG4', true, { confirmationDays: 28, percentDecline: false, observedCkdG5: false, projectedAgeToCkdG5: false }, 'eGFR'))
      .toBe('CKD G4: eGFR below 30 mL/min/1.73 m², confirmed by a value at least 28 days and at most 12 calendar months after the first crossing; the event is dated at the first crossing; or the first kidney transplant or chronic dialysis start of the events sheet, whichever comes first')
  })

  it('writes one row per patient first and an R script last', () => {
    const { inputs } = inputsFor('observedCkdG4', 'cohort')
    const analysis = timeToEventAnalysis(inputs, { endpoint: 'observedCkdG4', compositeWithKrt: false, timeScale: 'age', grouping: 'cohort' })
    const sheets = timeToEventExportSheets(analysis, { parameterLabel: 'eGFR', parameterKey: 'eGFR|x', definition: 'def', workbookName: 'tte.xlsx', appVersion: '0.0.0', exportedAt: new Date('2026-11-22T00:00:00Z') })
    expect(sheets.map(sheet => sheet.name)).toEqual(['time_to_event', 'km', 'km_summary', 'logrank', 'cumulative_incidence', 'tte_settings', 'about', 'r_script'])
    expect(sheets[0].rows[0]).toMatchObject({ patient_id: 'P1', group: 'A', included: 'yes', entry_date: '2019-01-01', exit_date: '2021-01-01', entry_days: 17897, exit_days: 18628, status: 1, outcome: 'endpoint', endpoint_confirmed_date: '2021-06-01', time_scale: 'age', endpoint_definition: 'def' })
    const script = (sheets.at(-1)!.rows as { line: string }[]).map(row => row.line)
    expect(script).toContain('km <- survfit(Surv(entry, exit, status == 1) ~ group, data = tte, conf.type = "log-log")')
    expect(script).toContain('logrank_lt(tte$entry, tte$exit, tte$status == 1, tte$group)')
    expect(script.some(line => line.startsWith('aj <- survfit(Surv(entry, exit, state)'))).toBe(true)
    const workbook = XLSX.read(sheetsToXlsxBytes(sheets))
    expect(workbook.SheetNames[0]).toBe('time_to_event')
  })

  it('records the settings behind the workbook: area, parameter fit_config, analysis_settings and input_data_id (wave 3 review)', () => {
    const { data, spec, inputs } = inputsFor('observedCkdG4', 'cohort')
    const parameter = data.parameters.find(p => p.bezeichnung === 'eGFR')!
    const analysis = timeToEventAnalysis(inputs, { endpoint: 'observedCkdG4', compositeWithKrt: true, timeScale: 'time_since_entry', grouping: 'cohort' })
    const id = labRowsInputDataId(data.rawRows)
    const sheets = timeToEventExportSheets(analysis, {
      parameterLabel: parameter.label, parameterKey: parameter.key, parameterName: parameter.bezeichnung, parameterUnit: parameter.einheit, definition: 'def',
      fitConfig: spec.fitConfig, analysisSettings: data.analysisSettings, inputDataId: id, workbookName: 'tte.xlsx', appVersion: '0.0.0', exportedAt: new Date('2026-11-22T00:00:00Z'),
    })
    const [settings] = sheets.find(sheet => sheet.name === 'tte_settings')!.rows as Record<string, unknown>[]
    expect(settings).toMatchObject({ parameter_key: parameter.key, parameter: 'eGFR', unit: UNIT, endpoint: 'observedCkdG4', composite_with_krt: true, time_scale: 'time_since_entry', grouping: 'cohort', input_data_id: id, app_version: '0.0.0' })
    expect(JSON.parse(settings.fit_config as string).endpoints.observedCkdG4).toBe(true)
    expect(JSON.parse(settings.fit_config as string)).not.toHaveProperty('xAxis')
    expect(JSON.parse(settings.analysis_settings as string)).toEqual(JSON.parse(JSON.stringify(data.analysisSettings)))
    const about = (sheets.find(sheet => sheet.name === 'about')!.rows as { note: string }[]).map(row => row.note)
    expect(about).toContain(`input_data_id: ${id}`)
    expect(about.some(note => note.includes('grouping cohort'))).toBe(true)
    // The identifier is the one a cohort workbook of all parameters and patients of the same import carries.
    const cohortRows = buildCohortRows(data.rows, data.patients.map(p => p.id), [spec])
    const cohort = workspaceWorkbookSheets({ data, parameterKeys: data.parameters.map(p => p.key), patientIds: data.patients.map(p => p.id), cohortRows })
    expect(inputDataId(cohort.find(sheet => sheet.name === 'raw_measurements')!.rows as Record<string, unknown>[])).toBe(id)
  })

  it('keeps the area choices in the store for the session and lists them in the analysis record', () => {
    const data = loadExample()
    render(<CohortModelsWorkspace data={data} onBrowseTrajectories={() => {}} onBrowseData={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Time to event' }))
    const area = screen.getByRole('region', { name: 'Time to event' })
    fireEvent.change(within(area).getByLabelText('Time-to-event grouping'), { target: { value: 'cohort' } })
    fireEvent.change(within(area).getByLabelText('Time scale'), { target: { value: 'time_since_entry' } })
    const choices = useAppStore.getState().timeToEventSettings
    expect(choices).toMatchObject({ grouping: 'cohort', timeScale: 'time_since_entry' })
    const state = useAppStore.getState()
    const sections = analysisRecord({ analysisSettings: state.analysisSettings, manualDemographics: {}, trajectoryFitSettings: state.trajectoryFitSettings, parameters: [], periEventSettings: null,
      groupBy: '', mixedModelConfig: state.mixedModelConfig, presetExclusionPolicy: 'apply', cohortModelResults: null, timeToEventSettings: choices })
    const tte = sections.find(section => section.id === 'time-to-event')!
    expect(tte.entries.find(entry => entry.path === 'timeToEventSettings.grouping')).toMatchObject({ value: 'cohort', deviates: true, control: { page: 'Cohort models', target: 'time-to-event' } })
    expect(tte.entries.find(entry => entry.path === 'timeToEventSettings.timeScale')).toMatchObject({ value: 'Years since the first eligible measurement', deviates: true })
    expect(tte.entries.find(entry => entry.path === 'timeToEventSettings.endpoint')!.exportField).toContain('time-to-event workbook')
  })

  it('shows the area beside slope models with the list of patients not in the analysis', () => {
    const data = loadExample()
    render(<CohortModelsWorkspace data={data} onBrowseTrajectories={() => {}} onBrowseData={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Slope models' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Time to event' }))
    const area = screen.getByRole('region', { name: 'Time to event' })
    fireEvent.change(within(area).getByLabelText('Time-to-event endpoint'), { target: { value: 'observedCkdG4' } })
    const table = within(area).getByRole('table', { name: 'Time to event by group' })
    // All patients: P1, P2, P3, P6 in; one event; three censored, two of them died.
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('All patients4132')
    expect(within(area).getByRole('list', { name: 'Patients not in the analysis' }).children).toHaveLength(2)
    expect(within(area).getByLabelText('Endpoint definition')).toHaveTextContent('CKD G4: eGFR below 30')
    expect(within(area).getByRole('radiogroup', { name: 'Curve' })).toBeInTheDocument()
  })

  // Smoke run of 2026-11-23: a median reached where the curve falls to 0 has
  // no log-log interval (R NA), and groups left out of the log-rank test are named.
  it('says "not estimable" for a limit without an interval and names the groups the log-rank test leaves out', () => {
    const { inputs } = inputsFor('observedCkdG4', 'cohort')
    const analysis = timeToEventAnalysis(inputs, { endpoint: 'observedCkdG4', compositeWithKrt: false, timeScale: 'age', grouping: 'cohort' })
    // On the age scale P1 is alone at risk at its event (P2 enters at 59): S falls to 0.
    const a = analysis.groups.find(group => group.label === 'A')!
    expect(a.km.median).toMatchObject({ lower: null, upper: null, lowerNotEstimable: true, upperNotEstimable: true })
    expect(a.km.median.estimate).not.toBeNull()
    const sheets = timeToEventExportSheets(analysis, { parameterLabel: 'eGFR', parameterKey: 'eGFR|x', definition: 'def', workbookName: 'tte.xlsx', appVersion: '0.0.0', exportedAt: new Date('2026-11-22T00:00:00Z') })
    const summary = sheets.find(sheet => sheet.name === 'km_summary')!.rows as Record<string, unknown>[]
    expect(summary.find(row => row.group === 'A')).toMatchObject({ median_lower_95: 'not estimable', median_upper_95: 'not estimable' })
    expect(summary.find(row => row.group === 'B')).toMatchObject({ median_years: 'not reached', median_lower_95: 'not reached', median_upper_95: 'not reached' })
    // No patient of B is at risk at P1's event, so neither group has a variance: none is compared.
    const logrank = sheets.find(sheet => sheet.name === 'logrank')!.rows as Record<string, unknown>[]
    expect(logrank.map(row => row.compared)).toEqual([
      'no: no patients at risk at any endpoint time beside patients of other groups (variance 0)',
      'no: no patients at risk at any endpoint time beside patients of other groups (variance 0)',
      '0 of 2 groups',
    ])

    const data = loadExample()
    render(<CohortModelsWorkspace data={data} onBrowseTrajectories={() => {}} onBrowseData={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Time to event' }))
    const area = screen.getByRole('region', { name: 'Time to event' })
    fireEvent.change(within(area).getByLabelText('Time-to-event endpoint'), { target: { value: 'observedCkdG4' } })
    fireEvent.change(within(area).getByLabelText('Time-to-event grouping'), { target: { value: 'cohort' } })
    const table = within(area).getByRole('table', { name: 'Time to event by group' })
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('(lower bound not estimable to upper bound not estimable)')
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('not reached (not reached to not reached)')
    expect(within(area).getByLabelText('Log-rank test')).toHaveTextContent('Log-rank test between 2 groups, 0 compared (2 without patients at risk at any endpoint time beside patients of other groups left out: A, B): not computed')
    act(() => setLanguage('de'))
    expect(within(area).getByLabelText('Log-Rank-Test')).toHaveTextContent('Log-Rank-Test zwischen 2 Gruppen, davon 0 verglichen')
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('untere Grenze nicht schätzbar')
  })

  // Code review of the language switch (issue #71): the axes and the chart name follow the page language.
  it('names the chart and its axes in the interface language', () => {
    const data = loadExample()
    render(<CohortModelsWorkspace data={data} onBrowseTrajectories={() => {}} onBrowseData={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Time to event' }))
    expect(screen.getByRole('img', { name: 'Event-free probability by age (years)' })).toBeInTheDocument()
    act(() => setLanguage('de'))
    const chart = screen.getByRole('img', { name: 'Ereignisfreie Wahrscheinlichkeit nach Alter (Jahre)' })
    expect(within(chart).getByText('Alter (Jahre)')).toBeInTheDocument()
    expect(within(chart).getByText('Ereignisfreie Wahrscheinlichkeit')).toBeInTheDocument()
  })
})

