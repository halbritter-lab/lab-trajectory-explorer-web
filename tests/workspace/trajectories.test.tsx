import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { TrajectoriesWorkspace } from '../../src/workspace/TrajectoriesWorkspace'
import { sparkWidth } from '../../src/workspace/WorkspaceSparkline'
import type { WorkspaceData } from '../../src/workspace/workspace-data'
import type { LabRow } from '../../src/core/types'
import { useAppStore } from '../../src/workspace/state/store'

for (const method of ['show', 'showModal', 'close'] as const) {
  if (!HTMLDialogElement.prototype[method]) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value() {} })
}
if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value() {} })

beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'show').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open') })
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => false }))
})

afterEach(() => vi.restoreAllMocks())

function openDisplay() {
  const button = screen.getByRole('button', { name: 'Display' })
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button)
}
function closeDisplay() {
  const button = screen.getByRole('button', { name: 'Display' })
  if (button.getAttribute('aria-expanded') === 'true') fireEvent.click(button)
}
// Metadata regressions explicitly choose full details; default-mode tests render directly.
function renderWorkspace(ui: ReactElement) {
  const view = render(ui)
  if (screen.queryAllByRole('table').length === 1 && screen.queryByRole('button', { name: 'Display' })) {
    openDisplay()
    fireEvent.change(screen.getByLabelText('Cell details'), { target: { value: 'full' } })
    closeDisplay()
  }
  return view
}
function openSettings(label?: string) {
  fireEvent.click(label ? screen.getByRole('button', { name: `Analysis settings: ${label}` }) : screen.getByRole('button', { name: 'General defaults' }))
  return screen.getByRole('dialog', { name: label ?? 'General defaults' })
}
function closeSettings() {
  if (screen.queryByRole('button', { name: 'Close analysis settings' })) fireEvent.click(screen.getByRole('button', { name: 'Close analysis settings' }))
}
function calculationSettings() {
  const summary = screen.getByText('Calculation settings', { selector: 'summary' })
  if (!summary.closest('details')!.open) fireEvent.click(summary)
}
function preset(id: string, label?: string) {
  openSettings(label)
  fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: id } })
  calculationSettings()
}
function enableTrend(label = 'Marker · unit-0', line = false) {
  const checkbox = screen.getByRole('checkbox', { name: `Analyse trend: ${label}` })
  if (!(checkbox as HTMLInputElement).checked) fireEvent.click(checkbox)
  if (line) {
    const button = screen.getByRole('button', { name: `Show trend line: ${label}` })
    if (button.getAttribute('aria-pressed') !== 'true') fireEvent.click(button)
  }
}
function transplantAnalysis(label = 'Marker · unit-0') {
  preset('ckd_progression', label)
  fireEvent.change(screen.getByLabelText('Time balancing'), { target: { value: 'raw' } })
  closeSettings()
  enableTrend(label)
}
function sortColumn(label: string, metric: string, ascending = true) {
  fireEvent.click(screen.getByRole('button', { name: `Column actions: ${label}` }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: `${metric}: ${ascending ? 'ascending' : 'descending'}` }))
}
function groupByAttribute(attribute = 'Zentrum') {
  fireEvent.click(screen.getByRole('button', { name: /^Attributes/ }))
  const checkbox = screen.getByRole('checkbox', { name: `Show attribute: ${attribute}` })
  if (!(checkbox as HTMLInputElement).checked) fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('button', { name: /^Attributes/ }))
  fireEvent.click(screen.getByRole('button', { name: `Column actions: ${attribute}` }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: `Group by ${attribute}` }))
}

function fixture(): WorkspaceData {
  const parameters = Array.from({ length: 12 }, (_, i) => ({ key: JSON.stringify(['Marker', `unit-${i}`]), label: `Marker · unit-${i}`, bezeichnung: 'Marker', einheit: `unit-${i}`, derived: false }))
  const patients = ['ID-A', 'ID-B'].map(id => ({ id, label: id, attributes: { Zentrum: id === 'ID-A' ? 'Nord' : 'Süd' }, baselineAge: id === 'ID-A' ? 40 : null }))
  const rows: LabRow[] = patients.flatMap(patient => parameters.flatMap((parameter, i) => [0, 1, 2].map(year => ({ patientId: patient.id, labDatum: new Date(Date.UTC(2020 + year, 0, 1)), bezeichnung: parameter.bezeichnung, einheit: parameter.einheit, wert: String(10 + i + year), wertNum: 10 + i + year, wertOperator: '=' as const, loinc: null, patientSex: null, patientAgeAtLab: patient.baselineAge === null ? null : patient.baselineAge + year }))))
  return { rawRows: rows, rows, fileName: 'real.csv', parameters, patients, events: [], patientAttributes: Object.fromEntries(patients.map(p => [p.id, p.attributes])), analysis: { fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
}

describe('real-data trajectories workspace', () => {
  it('starts with minimal cells and requires analysis before showing a fitted line', () => {
    const data = fixture()
    data.parameters = data.parameters.slice(0, 1)
    render(<TrajectoriesWorkspace data={data} />)
    expect(screen.getByRole('heading', { name: 'Explore trajectories' })).toBeInTheDocument()
    const trend = screen.getByRole('checkbox', { name: 'Analyse trend: Marker · unit-0' })
    const line = screen.getByRole('button', { name: 'Show trend line: Marker · unit-0' })
    const mini = () => screen.getAllByRole('img', { name: /Measurement trajectory/ })[0]
    expect(trend).not.toBeChecked()
    expect(line).toBeDisabled()
    expect(mini().querySelector('[stroke-dasharray]')).toBeNull()
    openDisplay()
    expect(screen.getByLabelText('Cell details')).toHaveValue('minimal')
    closeDisplay()
    enableTrend()
    expect(line).toBeEnabled()
    const row = screen.getByRole('button', { name: 'Open patient ID-A' }).closest('tr')!
    expect(within(row).getByLabelText('OLS: 1 unit-0/year, R² 1')).toBeInTheDocument()
    expect(mini().querySelector('[stroke-dasharray]')).toBeNull()
    fireEvent.click(line)
    expect(mini().querySelector('[stroke-dasharray]')).toBeInTheDocument()
    fireEvent.click(line)
    expect(trend).toBeChecked()
    expect(within(row).getByLabelText('OLS: 1 unit-0/year, R² 1')).toBeInTheDocument()
    expect(mini().querySelector('[stroke-dasharray]')).toBeNull()
    fireEvent.click(trend)
    expect(line).toBeDisabled()
    expect(within(row).queryByLabelText(/OLS:/)).not.toBeInTheDocument()
  })

  it('limits general defaults to generic presets and assigns specialist profiles to one parameter', () => {
    render(<TrajectoriesWorkspace data={fixture()} />)
    const shared = openSettings()
    expect(within(shared).getByRole('option', { name: /General exploration/ })).toBeInTheDocument()
    expect(within(shared).queryByRole('option', { name: /CKD progression/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Scope')).not.toBeInTheDocument()
    closeSettings()
    preset('ckd_progression', 'Marker · unit-0')
    expect(screen.getByRole('dialog', { name: 'Marker · unit-0' })).toBeInTheDocument()
    expect(useAppStore.getState().trajectoryFitSettings.shared.presetId).toBe('general_exploration')
    closeSettings()
    openSettings('Marker · unit-1')
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('general_exploration')
  })

  it('shows attributes without reordering patients and groups independently from sorting', () => {
    render(<TrajectoriesWorkspace data={fixture()} />)
    const order = () => screen.getAllByRole('button', { name: /^Open patient ID-/ }).map(button => button.textContent)
    sortColumn('Patient', 'Patient ID', false)
    expect(order()).toEqual(['ID-B', 'ID-A'])
    fireEvent.click(screen.getByRole('button', { name: /^Attributes/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show attribute: Zentrum' }))
    fireEvent.click(screen.getByRole('button', { name: /^Attributes/ }))
    expect(order()).toEqual(['ID-B', 'ID-A'])
    groupByAttribute()
    expect(screen.getByRole('columnheader', { name: 'Attribute: Zentrum' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse group Nord' })).toBeInTheDocument()
    expect(within(screen.getByRole('rowgroup', { name: 'Zentrum: Nord' })).getByRole('button', { name: 'Open patient ID-A' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove grouping: Zentrum' }))
    expect(order()).toEqual(['ID-B', 'ID-A'])
    expect(screen.getByRole('columnheader', { name: 'Attribute: Zentrum' })).toBeInTheDocument()
    sortColumn('Zentrum', 'Value')
    expect(order()).toEqual(['ID-A', 'ID-B'])
    expect(screen.queryByRole('button', { name: 'Remove grouping: Zentrum' })).not.toBeInTheDocument()
  })

  it('discards parameter-picker edits on Escape and restores the trigger focus', () => {
    render(<TrajectoriesWorkspace data={fixture()} />)
    const trigger = screen.getByRole('button', { name: /^Parameters/ })
    fireEvent.click(trigger)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Select parameters' })).getByRole('checkbox', { name: 'Marker · unit-0' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(screen.getByRole('columnheader', { name: 'Marker · unit-0' })).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(within(screen.getByRole('dialog', { name: 'Select parameters' })).getByRole('checkbox', { name: 'Marker · unit-0' })).toBeChecked()
  })

  it('shows one line for a cell without measurements, also with trends on', () => {
    const data = fixture()
    data.parameters = data.parameters.slice(0, 1)
    data.rows = data.rows.filter(row => !(row.patientId === 'ID-B' && row.einheit === 'unit-0'))
    data.rawRows = data.rows
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    enableTrend()
    const row = screen.getByRole('button', { name: 'Open patient ID-B' }).closest('tr')!
    expect(row).toHaveTextContent('No numeric measurements with a date')
    expect(row).not.toHaveTextContent(/No fit available|fitted measurements|Why is there no slope/)
    expect(screen.getByRole('button', { name: 'Open patient ID-A' }).closest('tr')).toHaveTextContent('3 fitted measurements')
  })

  it('supports compact cell details mode that condenses multi-line fit metadata into a single disclosure', () => {
    const data = fixture()
    data.parameters = data.parameters.slice(0, 1)
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    enableTrend()
    const row = screen.getByRole('button', { name: 'Open patient ID-A' }).closest('tr')!
    expect(row).toHaveTextContent('95% slope CI')
    openDisplay()
    fireEvent.change(screen.getByLabelText('Cell details'), { target: { value: 'compact' } })
    expect(within(row).getByText(/3 measurements \(3 fitted over 731 days\), latest 01\/01\/2022/)).toBeInTheDocument()
    const compactDetails = row.querySelector('details.wt-compact-details') as HTMLDetailsElement
    expect(compactDetails).toBeInTheDocument()
    expect(compactDetails).not.toHaveAttribute('open')
    expect(within(compactDetails).getByText(/95% slope CI/)).toBeInTheDocument()
  })

  it('pages a 2000-patient table while retaining global sort, detail navigation and return focus', () => {
    const data = fixture()
    data.parameters = data.parameters.slice(0, 1)
    data.patients = Array.from({ length: 2000 }, (_, i) => ({ id: `P-${String(i + 1).padStart(4, '0')}`, label: `P-${String(i + 1).padStart(4, '0')}`, attributes: {}, baselineAge: 40 }))
    data.rows = data.patients.map((patient, i) => ({ patientId: patient.id, labDatum: new Date('2020-01-01T00:00:00Z'), bezeichnung: 'Marker', einheit: 'unit-0', wert: String(i), wertNum: i, wertOperator: '=' as const, loinc: null, patientSex: null, patientAgeAtLab: 40 }))
    data.rawRows = data.rows
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(51)
    expect(screen.getByText('Showing 1–50 of 2000 patients')).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Open patient P-0001' }).closest('tr')).toHaveTextContent('1 measurement')
    expect(within(table).getByRole('button', { name: 'Open patient P-0001' }).closest('tr')).not.toHaveTextContent('1 measurements')
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select visible patients on this page' }))
    expect(screen.getByText('50 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next table page' }))
    expect(within(table).getByRole('checkbox', { name: 'Select visible patients on this page' })).not.toBeChecked()
    expect(within(table).getByRole('button', { name: 'Open patient P-0051' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open patient P-0051' }))
    expect(screen.getByRole('heading', { name: 'Patient P-0051' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Next patient' }))
    expect(screen.getByRole('heading', { name: 'Patient P-0052' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to table' }))
    expect(screen.getByRole('button', { name: 'Open patient P-0051' })).toHaveFocus()
    sortColumn('Patient', 'Patient ID', false)
    expect(within(screen.getByRole('table')).getByRole('button', { name: 'Open patient P-2000' })).toBeInTheDocument()
    expect(screen.getByText('Showing 1–50 of 2000 patients')).toBeInTheDocument()
  }, 20_000)

  it('exposes a clinical flag explanation through a focusable disclosure', () => {
    const data = creatinineFixture(['P1'])
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    const row = screen.getByRole('button', { name: 'Open patient P1' }).closest('tr')!
    const badge = within(row).getByRole('button', { name: 'AKI II' })
    expect(badge).toHaveTextContent('AKI')
    fireEvent.focus(badge)
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 AKI episode: 1× stage II')
    fireEvent.keyDown(badge, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(badge)
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 AKI episode: 1× stage II')
  })
  it('labels bounded values as excluded in chart and measurement table', () => {
    const data = fixture()
    const bounded = data.rows.find(row => row.patientId === 'ID-A' && row.einheit === 'unit-0' && row.labDatum?.getUTCFullYear() === 2021)!
    bounded.wert = '<11'; bounded.wertNum = 11; bounded.wertOperator = '<'
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    expect(within(chart).getByText(/Bounds marked/)).toBeInTheDocument()
    expect(chart.querySelector('[data-exclusion="censored-value"]')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const table = screen.getByRole('table', { name: 'Measurements Marker · unit-0', hidden: true })
    expect(within(table).getByText('Excluded: censored value (limit, not exact)')).toBeInTheDocument()
  })
  it('shows Theil-Sen slope confidence bounds with the displayed trend', () => {
    renderWorkspace(<TrajectoriesWorkspace data={fixture()} />)
    preset('theil_sen')
    closeSettings()
    enableTrend()
    expect(screen.getAllByText(/95% slope CI/)).toHaveLength(2)
  })
  it('identifies event-excluded measurements in patient detail without refitting', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'kidney_transplant', date: new Date('2021-01-01'), endDate: null, title: 'Transplant', description: null, intent: null, warning: '' }]
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    transplantAnalysis()
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const table = screen.getByRole('table', { name: 'Measurements Marker · unit-0', hidden: true })
    expect(within(table).getAllByText('Excluded: after kidney transplant')).toHaveLength(2)
    expect(within(table).getByText('Available before time aggregation')).toBeInTheDocument()
  })
  it('sorts parameter names containing colons without splitting their identity', () => {
    const data = fixture()
    data.parameters = data.parameters.map(p => ({ ...p, bezeichnung: 'Study: marker', key: JSON.stringify(['Study: marker', p.einheit]) }))
    data.rows = data.rows.map(row => ({ ...row, bezeichnung: 'Study: marker', wertNum: row.patientId === 'ID-A' ? 10 : 100 }))
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('button', { name: data.parameters[0].label }))
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByRole('button', { name: 'Open patient ID-B' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: data.parameters[0].label })).toHaveTextContent('↓ Latest value')
  })
  it('keeps column settings independent and restores inheritance on reset', () => {
    renderWorkspace(<TrajectoriesWorkspace data={fixture()} />)
    enableTrend('Marker · unit-0', true)
    enableTrend('Marker · unit-1')
    preset('theil_sen', 'Marker · unit-0')
    closeSettings()
    expect(screen.getAllByText(/Theil–Sen: 1 unit-0\/year/)).toHaveLength(2)
    expect(screen.getAllByText(/OLS: 1 unit-1\/year/)).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    expect(within(chart).getByText('Dashed: individual Theil–Sen lines from the prepared analyses.')).toBeInTheDocument()
    expect(chart.querySelector('svg')!.getAttribute('data-export-context')).toContain('individual Theil–Sen fits')
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))

    openSettings()
    calculationSettings()
    expect(screen.getByLabelText('Fit model')).toHaveValue('ols')
    fireEvent.change(screen.getByLabelText('Fit model'), { target: { value: 'none' } })
    closeSettings()
    expect(screen.getAllByText(/Theil–Sen: 1 unit-0\/year/)).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: 'Analyse trend: Marker · unit-1' })).toBeDisabled()

    openSettings('Marker · unit-0')
    expect(screen.getByLabelText('Fit model')).toHaveValue('theil-sen')
    fireEvent.click(screen.getByRole('button', { name: 'Use shared settings' }))
    expect(screen.getByLabelText('Fit model')).toHaveValue('none')
    closeSettings()
    preset('general_exploration')
    closeSettings()
    enableTrend()
    expect(screen.getAllByText(/OLS: 1 unit-0\/year/)).toHaveLength(2)
  })

  it('applies a column preset only to that column and retains it across views and selection changes', () => {
    const data = fixture()
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    preset('ckd_progression', data.parameters[0].label)
    expect(screen.getByLabelText('Time balancing')).toHaveValue('quarterly-median')
    closeSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    openSettings(data.parameters[1].label)
    expect(screen.getByLabelText('Time balancing')).toHaveValue('raw')
    closeSettings()
    fireEvent.click(screen.getByRole('button', { name: /^Parameters/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Marker · unit-0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: /^Parameters/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Marker · unit-0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    openSettings(data.parameters[0].label)
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('ckd_progression')
    expect(screen.getByLabelText('Time balancing')).toHaveValue('quarterly-median')
  })

  it('offers three table chart sizes and draws the charts at the chosen height', () => {
    renderWorkspace(<TrajectoriesWorkspace data={fixture()} />)
    const mini = () => screen.getAllByRole('img', { name: /Measurement trajectory/ })[0]
    expect(screen.getByRole('button', { name: 'Small charts' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Medium charts' }))
    // jsdom has no layout, so the chart takes the smallest width of its size.
    expect(mini()).toHaveAttribute('viewBox', '0 0 240 110')
    fireEvent.click(screen.getByRole('button', { name: 'Small charts' }))
    expect(mini()).toHaveAttribute('viewBox', '0 0 176 68')
    fireEvent.click(screen.getByRole('button', { name: 'Large charts' }))
    expect(mini()).toHaveAttribute('viewBox', '0 0 320 160')
    expect(mini()).toHaveAttribute('width', '320')
  })
  it('shares the table width between the parameter columns down to a minimum chart width', () => {
    // 1534 px table: 126 px for the selection and patient columns, 20 px padding per column.
    expect(sparkWidth(1534, 3, 'medium')).toBe(449)
    expect(sparkWidth(1534, 1, 'small')).toBe(1388)
    expect(sparkWidth(1534, 5, 'large')).toBe(320)
    expect(sparkWidth(1534, 10, 'small')).toBe(176)
    expect(sparkWidth(0, 3, 'medium')).toBe(240)
    expect(sparkWidth(356, 0, 'small')).toBe(176)
    // A phone-wide table shows 356 - 146 = 210 px of one column: larger sizes shrink to fit.
    expect(sparkWidth(356, 1, 'medium')).toBe(210)
    expect(sparkWidth(356, 1, 'large')).toBe(210)
    expect(sparkWidth(300, 1, 'large')).toBe(176)
  })
  it('preserves negative measurements in the shared domain', () => {
    const data = fixture()
    data.rows = data.rows.map(row => row.einheit === 'unit-0' ? { ...row, wertNum: row.patientId === 'ID-A' ? -3 : 2 } : row)
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    const mini = screen.getAllByRole('img', { name: /Measurement trajectory/ })[0]
    expect(mini).toHaveAttribute('data-y-min', '-3')
    expect(mini).toHaveAttribute('data-y-max', '2')
  })
  it('keeps a zero-based full-dataset scale across views and only zooms by explicit choice', () => {
    const data = fixture()
    data.rows = data.rows.map(row => row.einheit === 'unit-0' ? { ...row, wertNum: row.patientId === 'ID-A' ? 6 + (row.labDatum!.getUTCFullYear() - 2020) * .01 : 8 } : row)
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    openDisplay()
    expect(screen.getByLabelText('Value scale')).toHaveValue('shared')
    closeDisplay()
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'ID-A' } })
    const mini = screen.getAllByRole('img', { name: /Measurement trajectory/ })[0]
    expect(within(mini).getByText('0', { selector: 'text[text-anchor="end"]' })).toBeInTheDocument()
    expect(within(mini).getByText('8')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    expect(within(chart).getByText('8', { selector: 'text' })).toBeInTheDocument()
    const verticalSpan = () => {
      const points = within(chart).getByRole('button', { name: /Open patient ID-A/ }).querySelector('polyline')!.getAttribute('points')!.split(' ').map(pair => Number(pair.split(',')[1]))
      return Math.max(...points) - Math.min(...points)
    }
    expect(verticalSpan()).toBeLessThan(2)
    openDisplay()
    fireEvent.change(screen.getByLabelText('Value scale'), { target: { value: 'zoom' } })
    expect(verticalSpan()).toBeGreaterThan(100)
    expect(chart.querySelector('svg')!.getAttribute('data-export-context')).toContain('Zoom to visible values')
  })

  it('adds newly computed parameters once without restoring a deliberately unchecked series', () => {
    const data = fixture()
    const result = renderWorkspace(<TrajectoriesWorkspace data={data} />)
    const derived = { ...data.parameters[0], key: 'derived-new', bezeichnung: 'eGFR CKD', label: 'eGFR CKD', derived: true }
    const updated = { ...data, parameters: [...data.parameters, derived] }
    result.rerender(<TrajectoriesWorkspace data={updated} />)
    expect(screen.getByRole('columnheader', { name: 'eGFR CKD (derived)' })).toBeInTheDocument()
    expect(screen.getByText(/Added derived parameter: eGFR CKD/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Parameters/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'eGFR CKD' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    result.rerender(<TrajectoriesWorkspace data={{ ...updated, parameters: [...updated.parameters] }} />)
    expect(screen.queryByRole('columnheader', { name: 'eGFR CKD (derived)' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
  })

  it('provides inspectable event labels and counts in overlay without placing every label on the chart', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'other', date: new Date('2021-06-15T00:00:00Z'), title: 'Recorded visit', description: 'Follow-up', endDate: null, intent: null, warning: '' }]
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    openDisplay()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Events' }))
    expect(screen.getAllByText('Inspect events (1)')).toHaveLength(3)
    expect(screen.getAllByText(/Patient ID-A, 15\/06\/2021: Recorded visit/)).toHaveLength(3)
  })
  it('offers all parameters with distinct units, and cancel preserves applied columns', () => {
    renderWorkspace(<TrajectoriesWorkspace data={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Parameters/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(12)
    fireEvent.click(within(dialog).getByRole('button', { name: 'All parameters' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(screen.getAllByRole('columnheader')).toHaveLength(14)
    fireEvent.click(screen.getByRole('button', { name: /^Parameters/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Marker · unit-0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getAllByRole('columnheader')).toHaveLength(14)
  })

  it('retains selection across table and overlay and opens actual detail measurements by keyboard', () => {
    renderWorkspace(<TrajectoriesWorkspace data={fixture()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select patient ID-A' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selected only' }))
    expect(screen.queryByRole('button', { name: 'Open patient ID-B' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    fireEvent.keyDown(screen.getAllByRole('button', { name: /Open patient ID-A, Marker/ })[0], { key: 'Enter' })
    expect(screen.getByRole('heading', { name: 'Patient ID-A' })).toBeInTheDocument()
    expect(screen.getAllByRole('table', { name: /Measurements/ }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('checkbox', { name: 'Select patient ID-A' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Open patient ID-B' })).not.toBeInTheDocument()
  })

  it('filters groups and reports missing age without inventing measurements', () => {
    renderWorkspace(<TrajectoriesWorkspace data={fixture()} />)
    groupByAttribute()
    fireEvent.change(screen.getByLabelText('Filter group'), { target: { value: JSON.stringify('Süd') } })
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    openDisplay()
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'age' } })
    expect(screen.getAllByText(/1 additional trajectories without age data/).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('button', { name: /Open patient ID-A, Marker/ })).toHaveLength(0)
  })

  it('shows real OLS values and dates, and real events on the calendar axis', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'other', date: new Date('2021-06-15T00:00:00Z'), title: 'Aufnahme Station', description: null, endDate: null, intent: null, warning: '' }]
    renderWorkspace(<TrajectoriesWorkspace data={data} requestedPatientId="ID-A" />)
    enableTrend('Marker · unit-0')
    expect(screen.getByText('OLS: 1 unit-0/year, R² 1')).toBeInTheDocument()
    expect(screen.getByText('3 fitted measurements over 731 days')).toBeInTheDocument()
    expect(screen.getByText('15/06/2021: Aufnahme Station')).toBeInTheDocument()
    openDisplay()
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'calendar' } })
    openDisplay()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Events' }))
    expect(screen.getAllByText('Patient ID-A: Aufnahme Station, 15/06/2021')).toHaveLength(3)
    expect(screen.getAllByText('01/01/2020').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Next patient' }))
    expect(screen.getByRole('heading', { name: 'Patient ID-B' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next patient' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous patient' }))
    expect(screen.getByRole('heading', { name: 'Patient ID-A' })).toBeInTheDocument()
  })

  it('keeps missing and non-numeric measurements readable when no graph can be drawn', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => row.patientId !== 'ID-A').concat([
      { ...data.rows[0], wertNum: null, wert: 'nicht messbar' },
      { ...data.rows[0], labDatum: null, wertNum: 7, wert: '7' },
    ])
    renderWorkspace(<TrajectoriesWorkspace data={data} requestedPatientId="ID-A" />)
    expect(screen.getByText('nicht messbar')).toBeInTheDocument()
    expect(screen.getByText('Missing date')).toBeInTheDocument()
    expect(screen.getAllByText('No trajectories can be plotted. Check measurements, ages, or visible groups.')).toHaveLength(3)
    expect(screen.getByRole('table', { name: 'Measurements Marker · unit-0' })).toBeVisible()
  })

  it('keeps a two-point perfect fit visibly uncertain', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => row.labDatum?.getUTCFullYear() !== 2021)
    renderWorkspace(<TrajectoriesWorkspace data={data} requestedPatientId="ID-A" />)
    enableTrend('Marker · unit-0')
    expect(screen.getByText(/R² 1/)).toBeInTheDocument()
    expect(screen.getByText('n < 3, uncertain slope')).toBeInTheDocument()
  })

  it('omits standalone latest values while retaining bounded plot tooltips and derived measurement text', () => {
    const data = fixture()
    data.parameters[0].derived = true
    data.rows = data.rows.map(row => row.einheit === 'unit-0' ? { ...row, wertOperator: '>' as const, wert: String(row.wertNum) } : row)
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    expect(screen.queryByText('> 12')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    expect(screen.getByText(/01\/01\/2020: > 10 unit-0, excluded from the fit \(censored value/)).toBeInTheDocument()
    expect(screen.getAllByText('> 10').length).toBeGreaterThan(0)
    expect(screen.getByRole('columnheader', { name: 'Derived value' })).toBeInTheDocument()
  })

  it('shows an overlay quality caveat and keeps group colors stable after filtering', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => row.labDatum?.getUTCFullYear() !== 2021)
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    groupByAttribute()
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    enableTrend('Marker · unit-0', true)
    expect(screen.getByText(/2 individual fits have uncertain slopes/)).toBeInTheDocument()
    const stroke = screen.getAllByRole('button', { name: /Open patient ID-B, Marker/ })[0].querySelector('polyline')!.getAttribute('stroke')
    fireEvent.change(screen.getByLabelText('Filter group'), { target: { value: JSON.stringify('Süd') } })
    expect(screen.getAllByRole('button', { name: /Open patient ID-B, Marker/ })[0].querySelector('polyline')!.getAttribute('stroke')).toBe(stroke)
  })

  it('maps a selected derived parameter to a changed formula and explains disabled derivations', () => {
    const data = fixture()
    data.parameters[0].derived = true
    const result = renderWorkspace(<TrajectoriesWorkspace data={data} />)
    enableTrend('Marker · unit-0', true)
    fireEvent.change(screen.getByLabelText('Trend method: Marker · unit-0'), { target: { value: 'theil-sen' } })
    const replacement = { ...data.parameters[0], key: 'new-egfr-key', label: 'eGFR EKFC', bezeichnung: 'eGFR EKFC' }
    const updated = { ...data, parameters: [replacement, ...data.parameters.slice(1)], rows: data.rows.map(row => row.einheit === 'unit-0' ? { ...row, bezeichnung: replacement.bezeichnung } : row) }
    result.rerender(<TrajectoriesWorkspace data={updated} />)
    expect(screen.getByRole('columnheader', { name: 'eGFR EKFC (derived)' })).toBeInTheDocument()
    expect(screen.getByText(/selected eGFR derivation was updated to eGFR EKFC/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Analyse trend: eGFR EKFC' })).toBeChecked()
    expect(screen.getByLabelText('Trend method: eGFR EKFC')).toHaveValue('theil-sen')
    expect(screen.getByRole('button', { name: 'Show trend line: eGFR EKFC' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText(/Theil–Sen: 1 unit-0\/year/)).toHaveLength(2)
    result.rerender(<TrajectoriesWorkspace data={{ ...updated, parameters: updated.parameters.slice(1) }} />)
    expect(screen.getByText(/Unavailable selected parameters: eGFR EKFC/)).toBeInTheDocument()
  })

  it('plots continuous age from an exact birth anchor and identifies inferred ages', () => {
    const data = fixture()
    data.patients[0].birthAnchor = new Date('1979-06-15T00:00:00Z')
    data.patients[0].ageEstimated = false
    renderWorkspace(<TrajectoriesWorkspace data={data} requestedPatientId="ID-A" />)
    openDisplay()
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'age' } })
    const exactAge = ((Date.UTC(2020, 0, 1) - data.patients[0].birthAnchor.getTime()) / (365.25 * 86400000)).toLocaleString('en-GB', { maximumFractionDigits: 2 })
    expect(screen.getAllByText(exactAge).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Age: recorded birth date/)).toHaveLength(3)
  })

  it('renders a graph in every populated table cell and restores horizontal position after detail', () => {
    renderWorkspace(<TrajectoriesWorkspace data={fixture()} />)
    expect(screen.getAllByRole('img', { name: /Measurement trajectory/ })).toHaveLength(6)
    const tableRegion = screen.getByRole('region', { name: 'Patient table, horizontal scrolling' })
    tableRegion.scrollLeft = 340
    document.documentElement.scrollTop = 720
    fireEvent.scroll(tableRegion)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    expect(screen.getByRole('heading', { name: 'Patient ID-A' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('region', { name: 'Patient table, horizontal scrolling' }).scrollLeft).toBe(340)
    expect(document.documentElement.scrollTop).toBe(720)
    expect(screen.getByRole('button', { name: 'Open patient ID-A' })).toHaveFocus()
    openDisplay()
    expect(screen.getByLabelText('Jump to parameter')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Jump to parameter'), { target: { value: JSON.stringify(['Marker', 'unit-2']) } })
    expect(screen.getByRole('region', { name: 'Patient table, horizontal scrolling' }).scrollLeft).toBeGreaterThan(340)
  })

  it('provides an explicit in-app back button and responds to browser popstate', () => {
    renderWorkspace(<TrajectoriesWorkspace data={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    expect(screen.getByRole('heading', { name: 'Patient ID-A' })).toBeVisible()

    // Explicit in-app back button
    const backBtn = screen.getByRole('button', { name: 'Back to table' })
    expect(backBtn).toBeVisible()
    expect(backBtn).toHaveTextContent('← Back to table')
    fireEvent.click(backBtn)
    expect(screen.getByRole('table')).toBeVisible()

    // Open from overlay
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    const personInChart = screen.getAllByRole('button', { name: /Open patient ID-A, Marker/ })[0]
    fireEvent.click(personInChart)
    expect(screen.getByRole('heading', { name: 'Patient ID-A' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Back to overlay' })).toBeVisible()

    // Browser back via popstate
    fireEvent(window, new PopStateEvent('popstate', { state: { page: 'Trajectories', mode: 'table' } }))
    expect(screen.getByRole('table')).toBeVisible()
  })

  it('supports selecting the Theil-Sen robust preset and displays Theil-Sen slope', () => {
    const data = fixture()
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    openSettings()
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('general_exploration')
    preset('theil_sen')
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('theil_sen')
    expect(screen.getByText(/Theil–Sen: non-parametric median slope/)).toBeInTheDocument()
    closeSettings()
    const fitCheckbox = screen.getByRole('checkbox', { name: 'Analyse trend: Marker · unit-0' })
    expect(fitCheckbox).toBeInTheDocument()
    fireEvent.click(fitCheckbox)
    expect(screen.getAllByText(/Theil–Sen: 1 unit-0\/year/).length).toBeGreaterThan(0)
  })

  it('supports selecting CKD progression preset and custom pipeline settings', () => {
    const data = fixture()
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    preset('ckd_progression', data.parameters[0].label)
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('ckd_progression')
    expect(screen.getByText(/CKD progression: quarterly medians/)).toBeInTheDocument()
    expect(screen.getByLabelText('Time balancing')).toHaveValue('quarterly-median')
    expect(screen.getByLabelText('Censor after kidney transplant')).toBeChecked()

    // Modifying a custom setting switches preset to custom
    fireEvent.change(screen.getByLabelText('Time balancing'), { target: { value: 'monthly-median' } })
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('custom')
  })

  it('displays rapid eGFR decline badge when slope declines faster than threshold', () => {
    const data = fixture()
    data.parameters[0] = { ...data.parameters[0], bezeichnung: 'eGFR', einheit: 'ml/min/1.73m²', label: 'eGFR [ml/min/1.73m²]' }
    data.rows = data.rows.map(row => {
      if (row.patientId === 'ID-A' && row.einheit === 'unit-0') {
        const year = row.labDatum!.getUTCFullYear() - 2020
        return { ...row, bezeichnung: 'eGFR', einheit: 'ml/min/1.73m²', wertNum: 80 - year * 20 }
      }
      return row
    })
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    enableTrend('eGFR [ml/min/1.73m²]')
    const warning = screen.getByRole('button', { name: 'rapid ↓' })
    fireEvent.focus(warning)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/rapid/i)
  })

  it('sorts cohort table by patient ID, latest value, slope, and duration', () => {
    const data = fixture()
    // Give ID-A and ID-B distinct values so sort order is verifiable
    data.rows = data.rows.map(row => {
      if (row.patientId === 'ID-A' && row.einheit === 'unit-0') {
        const year = row.labDatum!.getUTCFullYear() - 2020
        return { ...row, wertNum: 50 - year * 10 } // slope -10, latest 30
      }
      if (row.patientId === 'ID-B' && row.einheit === 'unit-0') {
        const year = row.labDatum!.getUTCFullYear() - 2020
        return { ...row, wertNum: 20 + year * 5 } // slope +5, latest 30
      }
      return row
    })
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    // Default sort: ID A -> Z
    const getPatientRows = () => screen.getAllByRole('row').slice(1).map(r => within(r).getByRole('button', { name: /Open patient/ }).textContent)
    expect(getPatientRows()).toEqual(['ID-A', 'ID-B'])

    // Sort by ID descending
    sortColumn('Patient', 'Patient ID', false)
    expect(getPatientRows()).toEqual(['ID-B', 'ID-A'])

    // Sort by Slope (steep decline first): ID-A (-10) should come before ID-B (+5)
    enableTrend()
    sortColumn(data.parameters[0].label, 'Slope')
    expect(getPatientRows()).toEqual(['ID-A', 'ID-B'])

    sortColumn(data.parameters[0].label, 'Absolute slope', false)
    expect(getPatientRows()).toEqual(['ID-A', 'ID-B'])
    sortColumn(data.parameters[0].label, 'Follow-up', false)
    expect(getPatientRows()).toEqual(['ID-A', 'ID-B'])
  })

  it('explains an uncertain slope accessibly in the table and visibly in the patient view', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => !(row.patientId === 'ID-A' && row.labDatum?.getUTCFullYear() === 2021))
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    enableTrend('Marker · unit-0')
    const row = screen.getByRole('button', { name: 'Open patient ID-A' }).closest('tr')!
    const note = within(row).getByRole('button', { name: 'n < 3, uncertain slope' })
    fireEvent.focus(note)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Two points.*interpret with caution/)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    const card = chart.parentElement!
    expect(within(card).getByRole('note')).toHaveTextContent(/n < 3, uncertain slope.*interpret with caution/)
  })

  it('shows no slope-quality caveat once the fit model is off', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => !(row.patientId === 'ID-A' && row.labDatum?.getUTCFullYear() !== 2020))
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    enableTrend('Marker · unit-0')
    expect(screen.getByRole('button', { name: /n < 3/ })).toBeInTheDocument()
    openSettings('Marker · unit-0')
    calculationSettings()
    fireEvent.change(screen.getByLabelText('Fit model'), { target: { value: 'none' } })
    closeSettings()
    for (const summary of document.querySelectorAll('.wt-cell-summary')) expect(summary.textContent).not.toMatch(/n < 3|< 1 year/)
  })

  it('states fitted and total counts when exclusions remove measurements from the fit', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'kidney_transplant', date: new Date('2022-01-01'), endDate: null, title: 'Transplant', description: null, intent: null, warning: '' }]
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    transplantAnalysis()
    enableTrend('Marker · unit-0')
    const row = screen.getByRole('button', { name: 'Open patient ID-A' }).closest('tr')!
    expect(within(row).getByText(/^2 fitted of 3 measurements over \d+ days$/)).toBeInTheDocument()
    const other = screen.getByRole('button', { name: 'Open patient ID-B' }).closest('tr')!
    expect(within(other).getAllByText(/^3 fitted measurements over \d+ days$/).length).toBeGreaterThan(0)
  })

  it('does not mark excluded measurements when no fit model is set', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'kidney_transplant', date: new Date('2021-01-01'), endDate: null, title: 'Transplant', description: null, intent: null, warning: '' }]
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    transplantAnalysis()
    openSettings('Marker · unit-0')
    calculationSettings()
    fireEvent.change(screen.getByLabelText('Fit model'), { target: { value: 'none' } })
    closeSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    expect(within(chart).queryAllByTestId('excluded-point')).toHaveLength(0)
    expect(within(chart).queryByText(/Grey open circles/)).not.toBeInTheDocument()
    expect(chart.querySelector('svg')!.getAttribute('data-export-context')).not.toContain('excluded')
  })

  it('opens a patient from an overlay trajectory with the Space key', () => {
    renderWorkspace(<TrajectoriesWorkspace data={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    fireEvent.keyDown(screen.getAllByRole('button', { name: /Open patient ID-B, Marker/ })[0], { key: ' ' })
    expect(screen.getByRole('heading', { name: 'Patient ID-B' })).toBeInTheDocument()
  })

  it('explains the empty state when no patients are loaded', () => {
    const data = { ...fixture(), patients: [], rows: [], rawRows: [] }
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    expect(screen.getByRole('heading', { name: 'Patients and trajectories' })).toBeInTheDocument()
    expect(screen.getByText(/No data loaded yet/)).toBeInTheDocument()
  })

  it('pins the endpoint badge text and title for a projected G5 age', () => {
    const parameter = { key: JSON.stringify(['eGFR', 'mL/min/1.73m²']), label: 'eGFR [mL/min/1.73m²]', bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', derived: false }
    const rows: LabRow[] = [60, 45, 30].map((value, i) => ({ patientId: 'P1', labDatum: new Date(Date.UTC(2020 + i, 0, 1)), bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', wert: String(value), wertNum: value, wertOperator: '=' as const, loinc: null, patientSex: 'w', patientAgeAtLab: 60 + i }))
    const data = { rawRows: rows, rows, fileName: 'g5.csv', parameters: [parameter], patients: [{ id: 'P1', label: 'P1', attributes: {}, baselineAge: 60 }], events: [], patientAttributes: {}, analysis: { fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    preset('ckd_progression', data.parameters[0].label)
    // Deliberately exact: wording changes to this badge must update this test.
    // No birth date: the age is known in completed years, so no decimal is shown.
    closeSettings()
    enableTrend(data.parameters[0].label)
    openDisplay()
    fireEvent.change(screen.getByLabelText('Warning display'), { target: { value: 'text' } })
    closeDisplay()
    const badge = document.querySelector('.wt-badge-endpoint')!
    expect(badge).toHaveTextContent(/^-50%, G5 @ ~63y$/)
    expect(badge.getAttribute('title')).toBe('Total eGFR change -50.0% from first to latest eligible measurement (not per year). Projected age to CKD G5 about 63 years (no birth date: counted from the age in completed years, so the true value can be up to one year higher); fitted curve using endpoint-eligible dated exact numeric measurements (bounds and kidney replacement therapy/acute dialysis periods excluded).')
  })

  it('publishes general and parameter settings for cohort models and withdraws them on unmount', () => {
    const data = fixture()
    const view = renderWorkspace(<TrajectoriesWorkspace data={data} />)
    expect(useAppStore.getState().trajectoryFitSettings.shared.presetId).toBe('general_exploration')
    preset('theil_sen')
    expect(useAppStore.getState().trajectoryFitSettings.shared.presetId).toBe('theil_sen')
    closeSettings()
    preset('ckd_progression', data.parameters[0].label)
    expect(useAppStore.getState().trajectoryFitSettings.columns[data.parameters[0].key]).toMatchObject({ presetId: 'ckd_progression', timeBalancing: 'quarterly-median' })
    expect(useAppStore.getState().trajectoryFitSettings.shared.presetId).toBe('theil_sen')
    view.unmount()
    expect(useAppStore.getState().trajectoryFitSettings).toMatchObject({ shared: { presetId: 'general_exploration' }, columns: {} })
  })

  it('shows the projected G5 age with one decimal when the birth date is known', () => {
    const parameter = { key: JSON.stringify(['eGFR', 'mL/min/1.73m²']), label: 'eGFR [mL/min/1.73m²]', bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', derived: false }
    const rows: LabRow[] = [60, 45, 30].map((value, i) => ({ patientId: 'P1', labDatum: new Date(Date.UTC(2020 + i, 0, 1)), bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', wert: String(value), wertNum: value, wertOperator: '=' as const, loinc: null, patientSex: 'w', patientAgeAtLab: 60 + i }))
    const patient = { id: 'P1', label: 'P1', attributes: {}, baselineAge: 60, birthAnchor: new Date(Date.UTC(1959, 6, 1)), ageEstimated: false }
    const data = { rawRows: rows, rows, fileName: 'g5.csv', parameters: [parameter], patients: [patient], events: [], patientAttributes: {}, analysis: { fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    preset('ckd_progression', data.parameters[0].label)
    // Born 1959-07-01: 62.5 at the latest measurement, one year before the crossing.
    closeSettings()
    enableTrend(data.parameters[0].label)
    openDisplay()
    fireEvent.change(screen.getByLabelText('Warning display'), { target: { value: 'text' } })
    closeDisplay()
    const badge = document.querySelector('.wt-badge-endpoint')!
    expect(badge).toHaveTextContent(/^-50%, G5 @ 63\.5y$/)
    expect(badge.getAttribute('title')).toContain('Projected age to CKD G5 63.5 years; fitted curve')
  })

  it('reverses a metric sort and keeps patients without a value last', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => !(row.patientId === 'ID-C' && row.einheit === 'unit-0')).map(row => row.einheit === 'unit-0' ? { ...row, wertNum: row.patientId === 'ID-A' ? 10 : 100 } : row)
    data.patients.push({ id: 'ID-C', label: 'ID-C', attributes: {}, baselineAge: 40 })
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    const order = () => screen.getAllByRole('row').slice(1).map(r => within(r).getByRole('button', { name: /Open patient/ }).textContent)
    const title = screen.getByRole('button', { name: data.parameters[0].label })
    fireEvent.click(title)
    expect(order()).toEqual(['ID-B', 'ID-A', 'ID-C'])
    expect(title.closest('th')).toHaveAttribute('aria-sort', 'descending')
    fireEvent.click(title)
    expect(order()).toEqual(['ID-A', 'ID-B', 'ID-C'])
    expect(title.closest('th')).toHaveAttribute('aria-sort', 'ascending')
    expect(title).toHaveTextContent('↑ Latest value')
    sortColumn(data.parameters[0].label, 'Measurements', false)
    expect(title.closest('th')).toHaveAttribute('aria-sort', 'descending')
    expect(order()).toEqual(['ID-A', 'ID-B', 'ID-C'])
  })

  it('draws excluded measurements as grey open circles with a reason and a key', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'kidney_transplant', date: new Date('2021-01-01'), endDate: null, title: 'Transplant', description: null, intent: null, warning: '' }]
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    transplantAnalysis()
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    const excluded = within(chart).getAllByTestId('excluded-point')
    expect(excluded).toHaveLength(2)
    expect(excluded.every(point => point.getAttribute('data-exclusion') === 'post_kidney_transplant')).toBe(true)
    expect(excluded[0].querySelector('title')!.textContent).toContain('excluded from the fit (after kidney transplant')
    expect(within(chart).getByText(/Grey open circles: 2 measurements excluded from the fit \(after kidney transplant\)/)).toBeInTheDocument()
    expect(chart.querySelector('svg')!.getAttribute('data-export-context')).toContain('2 measurements excluded from the fit')
  })
})

function creatinineFixture(patientIds: string[]): WorkspaceData {
  const spike = [['2019-01-01', 1.0], ['2019-06-01', 1.1], ['2020-01-01', 1.05], ['2020-07-30', 1.15], ['2020-08-01', 2.4], ['2020-08-10', 1.8], ['2020-10-01', 1.2], ['2021-06-01', 1.3]] as const
  const parameter = { key: JSON.stringify(['Kreatinin', 'mg/dl']), label: 'Kreatinin [mg/dl]', bezeichnung: 'Kreatinin', einheit: 'mg/dl', derived: false }
  const patients = patientIds.map(id => ({ id, label: id, attributes: {}, baselineAge: 50 }))
  const rows: LabRow[] = patientIds.flatMap(id => spike.map(([date, value]) => ({ patientId: id, labDatum: new Date(`${date}T00:00:00Z`), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: String(value), wertNum: value, wertOperator: '=' as const, loinc: null, patientSex: null, patientAgeAtLab: 50 })))
  return { rawRows: rows, rows, fileName: 'aki.csv', parameters: [parameter], patients, events: [], patientAttributes: {}, analysis: { fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
}

describe('AKI display in workspace charts', () => {
  it('shows AKI windows and labelled episode markers in the individual chart only on request', () => {
    renderWorkspace(<TrajectoriesWorkspace data={creatinineFixture(['P1'])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient P1' }))
    const chart = screen.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })
    expect(within(chart).queryAllByTestId('aki-marker')).toHaveLength(0)
    openDisplay()
    fireEvent.click(screen.getByLabelText('AKI windows and episodes'))
    expect(within(chart).getAllByTestId('aki-marker')).toHaveLength(1)
    expect(within(chart).getByText('AKI II')).toBeInTheDocument()
    expect(within(chart).getAllByTestId('aki-band')).toHaveLength(1)
    expect(within(chart).getByText(/AKI episode at the creatinine peak/)).toBeInTheDocument()
    // AKI display is context only; nothing is excluded until the analysis excludes AKI windows.
    expect(within(chart).queryAllByTestId('excluded-point')).toHaveLength(0)
    closeDisplay()
    preset('ckd_progression', 'Kreatinin [mg/dl]')
    closeSettings()
    enableTrend('Kreatinin [mg/dl]')
    expect(within(chart).getAllByTestId('excluded-point').map(point => point.getAttribute('data-exclusion'))).toEqual(['aki', 'aki'])
  })

  it('puts an episode without a same-date measurement on the time axis, not on an unrelated value', () => {
    const data = creatinineFixture(['P1'])
    // A second parameter measured only years away from the AKI peak.
    const marker = { key: JSON.stringify(['CRP', 'mg/l']), label: 'CRP [mg/l]', bezeichnung: 'CRP', einheit: 'mg/l', derived: false }
    const crp: LabRow[] = ['2018-01-01', '2019-01-01', '2022-06-01'].map((date, i) => ({ patientId: 'P1', labDatum: new Date(`${date}T00:00:00Z`), bezeichnung: 'CRP', einheit: 'mg/l', wert: String(5 + i), wertNum: 5 + i, wertOperator: '=' as const, loinc: null, patientSex: null, patientAgeAtLab: 50 }))
    data.parameters = [...data.parameters, marker]
    data.rows = [...data.rows, ...crp]
    data.rawRows = data.rows
    renderWorkspace(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient P1' }))
    openDisplay()
    fireEvent.click(screen.getByLabelText('AKI windows and episodes'))
    const creatinine = screen.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })
    expect(within(creatinine).getByTestId('aki-marker')).toHaveAttribute('data-on-measurement', 'true')
    const other = screen.getByRole('region', { name: 'Chart CRP [mg/l]' })
    const offSeries = within(other).getByTestId('aki-marker')
    expect(offSeries).toHaveAttribute('data-on-measurement', 'false')
    expect(offSeries.querySelector('title')!.textContent).toContain('no measurement of this parameter on that date')
  })

  it('marks AKI-excluded measurements even while AKI display is off, with reasons in the measurement table', () => {
    renderWorkspace(<TrajectoriesWorkspace data={creatinineFixture(['P1'])} />)
    closeDisplay()
    preset('ckd_progression', 'Kreatinin [mg/dl]')
    closeSettings()
    enableTrend('Kreatinin [mg/dl]')
    fireEvent.click(screen.getByRole('button', { name: 'Open patient P1' }))
    openDisplay()
    expect(screen.getByLabelText('AKI windows and episodes')).not.toBeChecked()
    closeDisplay()
    const chart = screen.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })
    expect(within(chart).getAllByTestId('excluded-point')).toHaveLength(2)
    expect(within(chart).queryAllByTestId('aki-marker')).toHaveLength(0)
    const table = screen.getByRole('table', { name: 'Measurements Kreatinin [mg/dl]', hidden: true })
    expect(within(table).getAllByText('Excluded: AKI window')).toHaveLength(2)
  })

  it('marks episodes for every overlay trajectory but windows and labels only for the highlighted one', () => {
    renderWorkspace(<TrajectoriesWorkspace data={creatinineFixture(['P1', 'P2'])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    openDisplay()
    fireEvent.click(screen.getByLabelText('AKI windows and episodes'))
    const chart = screen.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })
    expect(within(chart).getAllByTestId('aki-marker')).toHaveLength(2)
    expect(within(chart).queryAllByTestId('aki-band')).toHaveLength(0)
    expect(within(chart).queryByText('AKI II')).not.toBeInTheDocument()
    openDisplay()
    fireEvent.change(screen.getByLabelText('Highlight patient'), { target: { value: '1' } })
    expect(within(chart).getAllByTestId('aki-band')).toHaveLength(1)
    expect(within(chart).getAllByText('AKI II')).toHaveLength(1)
  })
})
