import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { TrajectoriesWorkspace } from '../../src/workspace/TrajectoriesWorkspace'
import type { WorkspaceData } from '../../src/workspace/workspace-data'
import type { LabRow } from '../../src/core/types'
import type { ClinicalEvent } from '../../src/core/events/events'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { useAppStore } from '../../src/workspace/state/store'
import { workspaceSpecs } from '../../src/workspace/workspace-data'
import { workspaceWorkbookBytes, ANCHOR_COMPARISON_SHEET_HEADER } from '../../src/workspace/workspace-export'
import { defaultTrajectoryView, restoreSavedSettings, SAVED_SETTINGS_VERSION } from '../../src/workspace/saved-settings'
import { defaultFitSettings, defaultTrajectoryFitSettings, toFitConfig } from '../../src/workspace/workspace-analysis'
import { measurementFitStatus } from '../../src/workspace/measurement-fit-status'
import type { AnchorComparisonSettings } from '../../src/core/cohort/anchorComparison'

for (const method of ['show', 'showModal', 'close'] as const) {
  if (!HTMLDialogElement.prototype[method]) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value() {} })
}
if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value() {} })
beforeEach(() => {
  useAppStore.getState().reset()
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => false }))
})
afterEach(() => vi.restoreAllMocks())

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const MARKER = { key: JSON.stringify(['Marker', 'u']), label: 'Marker [u]', bezeichnung: 'Marker', einheit: 'u', derived: false }
const lab = (patientId: string, date: string, value: number): LabRow => ({ patientId, labDatum: day(date), bezeichnung: 'Marker', einheit: 'u', wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: 50 })
const start: ClinicalEvent = { patientId: 'P1', type: 'other', date: day('2021-07-01'), title: 'ACE start', description: null, endDate: null, intent: null, warning: '' }
const P1 = [['2020-01-01', 80], ['2020-07-01', 75], ['2021-01-01', 70], ['2021-07-01', 65], ['2021-07-05', 50], ['2022-01-01', 66], ['2022-07-01', 67], ['2023-01-01', 68]] as const
const rows = [...P1.map(([date, value]) => lab('P1', date, value)), lab('P2', '2020-01-01', 60), lab('P2', '2021-01-01', 58), lab('P2', '2022-01-01', 55)]
function dataset(): WorkspaceData {
  const patients = ['P1', 'P2'].map(id => ({ id, label: id, attributes: {}, baselineAge: 50 }))
  return { rawRows: rows, rows, fileName: 'anchor.csv', parameters: [MARKER], patients, events: [start], patientAttributes: {}, analysis: { fitInputs: [], messages: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
}
const comparison: AnchorComparisonSettings = { rule: { kind: 'title', value: 'ACE start' }, exclusionDays: 14 }
/** Trend on, and the shared settings with the comparison switched on. */
function withComparison(settings: AnchorComparisonSettings | null = comparison) {
  useAppStore.setState({ trajectoryView: { ...defaultTrajectoryView(), parameterKeys: [MARKER.key], trendKeys: [MARKER.key], fitKeys: [MARKER.key] } })
  useAppStore.getState().setTrajectoryFitSettings({ shared: { ...defaultFitSettings(), ...(settings ? { anchorComparison: settings } : {}) }, columns: {} })
}
const chart = () => screen.getByRole('region', { name: `Chart ${MARKER.label}` })
const display = () => { const button = screen.getByRole('button', { name: 'Display' }); if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button) }

describe('before/after comparison in the Trajectories page (issue #64)', () => {
  it('is set in the calculation settings without making the preset custom', () => {
    render(<TrajectoriesWorkspace data={dataset()} />)
    fireEvent.click(screen.getByRole('button', { name: 'General defaults' }))
    fireEvent.click(screen.getByText('Calculation settings', { selector: 'summary' }))
    const group = screen.getByTestId('anchor-comparison-settings')
    const anchor = within(group).getByLabelText('Anchor event') as HTMLSelectElement
    expect(anchor).toBeDisabled()
    expect([...anchor.options].map(option => option.textContent)).toEqual(['First event of the patient', 'Title: ACE start', 'Type: other'])
    fireEvent.click(within(group).getByLabelText('Compare slopes before and after an anchor event'))
    expect(useAppStore.getState().trajectoryFitSettings.shared.anchorComparison).toEqual({ rule: { kind: 'first' }, exclusionDays: 0 })
    fireEvent.change(anchor, { target: { value: 'title:ACE start' } })
    fireEvent.change(within(group).getByLabelText('Anchor exclusion days'), { target: { value: '14' } })
    const shared = useAppStore.getState().trajectoryFitSettings.shared
    expect(shared.anchorComparison).toEqual(comparison)
    expect(shared.presetId).toBe('general_exploration')
    // Choosing a preset keeps the comparison.
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'theil_sen' } })
    expect(useAppStore.getState().trajectoryFitSettings.shared.anchorComparison).toEqual(comparison)
    fireEvent.click(within(screen.getByTestId('anchor-comparison-settings')).getByLabelText('Compare slopes before and after an anchor event'))
    expect(useAppStore.getState().trajectoryFitSettings.shared.anchorComparison).toBeUndefined()
  })

  it('shows both slopes and the difference in the patient view and marks the window points', () => {
    withComparison()
    render(<TrajectoriesWorkspace data={dataset()} requestedPatientId="P1" />)
    const note = screen.getByTestId('anchor-comparison')
    expect(note).toHaveTextContent('Before/after first event titled “ACE start” (')
    expect(note).toHaveTextContent('before -10.01 u/year (4 fitted points over 547 days, 95% CI [-10.10, -9.92])')
    expect(note).toHaveTextContent('after +2.00 u/year (3 fitted points over 365 days, 95% CI [1.88, 2.12])')
    expect(note).toHaveTextContent('difference after − before +12.01 u/year (95% CI [11.91, 12.11])')
    expect(note).toHaveTextContent('1 measurement in the 14-day window after the anchor left out of the after slope.')
    // The 2021-07-05 value is drawn grey and named in its tooltip; the column's slope still uses it.
    const excluded = within(chart()).getAllByTestId('excluded-point')
    expect(excluded).toHaveLength(1)
    expect(excluded[0]).toHaveAttribute('data-exclusion', 'anchor-exclusion-window')
    expect(excluded[0].querySelector('title')).toHaveTextContent('exclusion window after the anchor event, after-anchor slope only')
    expect(excluded[0].querySelector('title')!.textContent).not.toContain('excluded from the fit')
    // Legend and export context count it apart from the fit exclusions: it is not excluded from the fit.
    const legend = within(chart()).getByTestId('excluded-legend')
    expect(legend).toHaveTextContent('Grey open circles: 1 measurement in the exclusion window after the anchor event: left out of the after-anchor slope only; it still enters the slope of the whole series.')
    expect(legend).not.toHaveTextContent('excluded from the fit')
    const context = chart().querySelector('svg.wt-plot')!.getAttribute('data-export-context')!
    expect(context).toContain('; 1 measurement in the exclusion window after the anchor event (grey open circles; after-anchor slope only, still in the slope of the whole series)')
    expect(context).not.toContain('excluded from the fit')
  })

  // Review of the combined branch, 2026-11-22: as for the column's slope, below five dates the bounds are not a 95% interval.
  it('calls the bounds of a Theil-Sen side with fewer than five dates Theil-Sen bounds, in the view and the export', () => {
    useAppStore.setState({ trajectoryView: { ...defaultTrajectoryView(), parameterKeys: [MARKER.key], trendKeys: [MARKER.key], fitKeys: [MARKER.key] } })
    useAppStore.getState().setTrajectoryFitSettings({ shared: { ...defaultFitSettings('theil_sen'), anchorComparison: comparison }, columns: {} })
    render(<TrajectoriesWorkspace data={dataset()} requestedPatientId="P1" />)
    const note = screen.getByTestId('anchor-comparison')
    expect(note).toHaveTextContent(/after \+2\.00 u\/year \(3 fitted points over 365 days, Theil–Sen bounds \[[^\]]+\], not a 95% interval: 3 dates\)/)
    expect(note).toHaveTextContent(/before .* \(4 fitted points over 547 days, Theil–Sen bounds \[[^\]]+\], not a 95% interval: 4 dates\)/)
    expect(note).not.toHaveTextContent('95% CI')
    const data = dataset()
    const anchors = { [MARKER.key]: comparison }
    const cohortRows = buildCohortRows(data.rows, ['P1'], workspaceSpecs(data, [MARKER.key], { [MARKER.key]: toFitConfig(defaultFitSettings('theil_sen'), { bezeichnung: 'Marker', einheit: 'u' }) }, anchors))
    const workbook = XLSX.read(workspaceWorkbookBytes({ data, parameterKeys: [MARKER.key], patientIds: ['P1'], cohortRows, anchorComparisonByParameterKey: anchors }), { type: 'array' })
    const [p1] = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.anchor_comparison)
    expect(p1).toMatchObject({ fit_model: 'theil-sen', before_n_fitted_dates: 4, after_n_fitted_dates: 3 })
    expect(XLSX.utils.sheet_to_json<{ note: string }>(workbook.Sheets.about).at(-1)!.note).toContain('for Theil-Sen with n_fitted_dates below 5 they are Theil-Sen bounds, not a 95 % interval')
  })

  it('says when a patient has no matching anchor event', () => {
    withComparison()
    render(<TrajectoriesWorkspace data={dataset()} requestedPatientId="P2" />)
    expect(screen.getByTestId('anchor-comparison')).toHaveTextContent('Before/after first event titled “ACE start”: no matching event for this patient.')
  })

  it('names the window points in the measurement table', () => {
    const data = dataset()
    const cell = buildCohortRows(data.rows, ['P1'], workspaceSpecs(data, [MARKER.key], undefined, { [MARKER.key]: comparison }))[0].cells[0]
    const status = measurementFitStatus(rows.filter(row => row.patientId === 'P1'), cell)
    expect(status[4]).toBe('Available before time balancing; left out of the after-anchor slope (exclusion window after the anchor event)')
    expect(status[3]).toBe('Available before time balancing')
  })
})

describe('time axis "Years since event" (K16)', () => {
  it('starts at the anchor, names the rule and counts the patients without an anchor', () => {
    withComparison()
    render(<TrajectoriesWorkspace data={dataset()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    display()
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'event' } })
    expect(within(chart()).getByText('Years since anchor event (first event titled “ACE start”)')).toBeInTheDocument()
    expect(chart().querySelector('svg.wt-plot')).toHaveAttribute('data-x-min', String((day('2020-01-01').getTime() - day('2021-07-01').getTime()) / (365.25 * 86_400_000)))
    expect(within(chart()).getByText(/1 of 2 trajectories; 1 trajectory without a matching anchor event \(not drawn\)/)).toBeInTheDocument()
    expect(chart().querySelector('svg.wt-plot')!.getAttribute('data-export-context')).toContain('Years since anchor event (first event titled “ACE start”)')
    expect(useAppStore.getState().trajectoryView.axis).toBe('event')
  })

  it('explains that the axis needs the comparison when the parameter has none', () => {
    withComparison(null)
    render(<TrajectoriesWorkspace data={dataset()} requestedPatientId="P1" />)
    display()
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'event' } })
    expect(within(chart()).getByTestId('event-axis-note')).toHaveTextContent('starts at the anchor event of the before/after comparison')
    // Review of the combined branch, 2026-11-22: without the comparison no patient is counted as lacking an anchor event.
    expect(within(chart()).queryByText(/without a matching anchor event/)).not.toBeInTheDocument()
    expect(within(chart()).getByText(/No trajectories can be plotted. Check measurements, anchor events, or visible groups./)).toBeInTheDocument()
  })
})

describe('export and saved settings', () => {
  const read = (bytes: Uint8Array) => XLSX.read(bytes, { type: 'array' })
  const records = (workbook: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: '' })
  it('writes one row per patient and parameter with the comparison, and the setting in settings', () => {
    const data = dataset()
    const anchors = { [MARKER.key]: comparison }
    const cohortRows = buildCohortRows(data.rows, ['P1', 'P2'], workspaceSpecs(data, [MARKER.key], undefined, anchors))
    const workbook = read(workspaceWorkbookBytes({ data, parameterKeys: [MARKER.key], patientIds: ['P1', 'P2'], cohortRows, anchorComparisonByParameterKey: anchors }))
    expect(XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.anchor_comparison, { header: 1 })[0]).toEqual([...ANCHOR_COMPARISON_SHEET_HEADER])
    const [p1, p2] = records(workbook, 'anchor_comparison')
    expect(p1).toMatchObject({ PatientID: 'P1', Parameter: 'Marker', Unit: 'u', fit_model: 'ols', anchor_rule: 'title', anchor_value: 'ACE start', anchor_date: '2021-07-01', anchor_type: 'other', anchor_title: 'ACE start', exclusion_days: 14, n_excluded_window: 1,
      before_n: 4, before_first_date: '2020-01-01', before_last_date: '2021-07-01', before_span_days: 547, after_n: 3, after_first_date: '2022-01-01', after_span_days: 365, slope_unit: 'u/yr' })
    expect(p1.slope_difference as number).toBeCloseTo((p1.after_slope as number) - (p1.before_slope as number), 12)
    expect(p1.difference_ci_low).not.toBe('')
    expect(p2).toMatchObject({ PatientID: 'P2', anchor_rule: 'title', anchor_date: '', before_n: '', after_slope: '', slope_difference: '' })
    expect(JSON.parse(records(workbook, 'settings')[0].anchor_comparison as string)).toEqual(comparison)
  })
  it('leaves the sheet empty and the setting blank without a comparison', () => {
    const data = dataset()
    const cohortRows = buildCohortRows(data.rows, ['P1'], workspaceSpecs(data, [MARKER.key]))
    const workbook = read(workspaceWorkbookBytes({ data, parameterKeys: [MARKER.key], patientIds: ['P1'], cohortRows }))
    expect(records(workbook, 'anchor_comparison')).toEqual([])
    expect(records(workbook, 'settings')[0].anchor_comparison).toBe('')
  })
  it('restores the comparison under its preset and the event axis', () => {
    const shared = { ...defaultFitSettings('general_exploration'), anchorComparison: comparison }
    const restored = restoreSavedSettings({ version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: { shared, columns: {} }, trajectoryView: { ...defaultTrajectoryView(), axis: 'event' } }, new Set())
    expect(restored.trajectoryFitSettings.shared).toEqual(shared)
    expect(restored.keptAsCustom).toEqual([])
    expect(restored.trajectoryView.axis).toBe('event')
    expect(restored.notRestored).toEqual([])
    // A copy without the field (saved before 2026-11-22) has no comparison.
    expect(restoreSavedSettings({ version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: defaultTrajectoryView() }, new Set()).trajectoryFitSettings.shared.anchorComparison).toBeUndefined()
    const broken = restoreSavedSettings({ version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: { shared: { ...shared, anchorComparison: { rule: { kind: 'title' }, exclusionDays: 3 } }, columns: {} }, trajectoryView: defaultTrajectoryView() }, new Set())
    expect(broken.notRestored).toContain('shared analysis settings')
    // Whole days only: a fraction would act as the next lower whole number while the note named the fraction.
    const fraction = restoreSavedSettings({ version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: { shared: { ...shared, anchorComparison: { ...comparison, exclusionDays: 2.5 } }, columns: {} }, trajectoryView: defaultTrajectoryView() }, new Set())
    expect(fraction.notRestored).toContain('shared analysis settings')
    expect(fraction.trajectoryFitSettings.shared.anchorComparison).toBeUndefined()
  })
})
