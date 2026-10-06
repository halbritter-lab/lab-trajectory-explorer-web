import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrajectoriesWorkspace } from '../../src/workspace/TrajectoriesWorkspace'
import type { WorkspaceData } from '../../src/workspace/workspace-data'
import type { LabRow } from '../../src/core/types'

function fixture(): WorkspaceData {
  const parameters = Array.from({ length: 12 }, (_, i) => ({ key: JSON.stringify(['Marker', `unit-${i}`]), label: `Marker · unit-${i}`, bezeichnung: 'Marker', einheit: `unit-${i}`, derived: false }))
  const patients = ['ID-A', 'ID-B'].map(id => ({ id, label: id, attributes: { Zentrum: id === 'ID-A' ? 'Nord' : 'Süd' }, baselineAge: id === 'ID-A' ? 40 : null }))
  const rows: LabRow[] = patients.flatMap(patient => parameters.flatMap((parameter, i) => [0, 1, 2].map(year => ({ patientId: patient.id, labDatum: new Date(Date.UTC(2020 + year, 0, 1)), bezeichnung: parameter.bezeichnung, einheit: parameter.einheit, wert: String(10 + i + year), wertNum: 10 + i + year, wertOperator: '=' as const, loinc: null, patientSex: null, patientAgeAtLab: patient.baselineAge === null ? null : patient.baselineAge + year }))))
  return { rawRows: rows, rows, fileName: 'real.csv', parameters, patients, events: [], patientAttributes: Object.fromEntries(patients.map(p => [p.id, p.attributes])), analysis: { fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
}

describe('real-data trajectories workspace', () => {
  it('shows Theil-Sen slope confidence bounds with the displayed trend', () => {
    render(<TrajectoriesWorkspace data={fixture()} />)
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'theil_sen' } })
    fireEvent.click(screen.getByLabelText('Theil–Sen, slope and R²: Marker · unit-0'))
    expect(screen.getAllByText(/95% slope CI/)).toHaveLength(2)
  })
  it('identifies event-excluded measurements in patient detail without refitting', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'kidney_transplant', date: new Date('2021-01-01'), endDate: null, title: 'Transplant', description: null, intent: null, warning: '' }]
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByLabelText('Censor after kidney transplant'))
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const table = screen.getByRole('table', { name: 'Measurements Marker · unit-0', hidden: true })
    expect(within(table).getAllByText('Excluded: after kidney transplant')).toHaveLength(2)
    expect(within(table).getByText('Available before time aggregation')).toBeInTheDocument()
  })
  it('sorts parameter names containing colons without splitting their identity', () => {
    const data = fixture()
    data.parameters = data.parameters.map(p => ({ ...p, bezeichnung: 'Study: marker', key: JSON.stringify(['Study: marker', p.einheit]) }))
    data.rows = data.rows.map(row => ({ ...row, bezeichnung: 'Study: marker', wertNum: row.patientId === 'ID-A' ? 10 : 100 }))
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: `${data.parameters[0].key}:latest` } })
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByRole('button', { name: 'Open patient ID-B' })).toBeInTheDocument()
    expect(screen.getByTitle(`Sort by ${data.parameters[0].label}`)).toHaveTextContent('↓ val')
  })
  it('keeps column settings independent and restores inheritance on reset', () => {
    const data = fixture()
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'OLS, slope and R²: Marker · unit-0' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'OLS, slope and R²: Marker · unit-1' }))
    fireEvent.change(screen.getByLabelText('Edit analysis settings for'), { target: { value: data.parameters[0].key } })
    fireEvent.change(screen.getByLabelText('Fit model'), { target: { value: 'theil-sen' } })
    fireEvent.click(screen.getByLabelText('Censor after kidney transplant'))
    expect(screen.getAllByText(/Theil–Sen: 1 unit-0\/year/)).toHaveLength(2)
    expect(screen.getAllByText(/OLS: 1 unit-1\/year/)).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    expect(within(chart).getByText('Dashed: individual Theil–Sen lines from the prepared analyses.')).toBeInTheDocument()
    expect(chart.querySelector('svg')!.getAttribute('data-export-context')).toContain('individual Theil–Sen fits')
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))

    fireEvent.change(screen.getByLabelText('Edit analysis settings for'), { target: { value: '' } })
    expect(screen.getByLabelText('Censor after kidney transplant')).not.toBeChecked()
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'acute_review' } })
    expect(screen.getAllByText(/Theil–Sen: 1 unit-0\/year/)).toHaveLength(2)
    expect(screen.getAllByText('Fit model disabled')).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('Edit analysis settings for'), { target: { value: data.parameters[0].key } })
    expect(screen.getByLabelText('Fit model')).toHaveValue('theil-sen')
    expect(screen.getByLabelText('Censor after kidney transplant')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Use shared settings' }))
    expect(screen.getByLabelText('Fit model')).toHaveValue('none')
    expect(screen.getAllByText('Fit model disabled')).toHaveLength(4)
    fireEvent.change(screen.getByLabelText('Edit analysis settings for'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'general_exploration' } })
    expect(screen.getAllByText(/OLS: 1 unit-0\/year/)).toHaveLength(2)
  })

  it('applies a column preset only to that column and retains it across views and selection changes', () => {
    const data = fixture()
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.change(screen.getByLabelText('Edit analysis settings for'), { target: { value: data.parameters[0].key } })
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'ckd_progression' } })
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    expect(screen.getByLabelText('Aggregation')).toHaveValue('quarterly-median')
    fireEvent.change(screen.getByLabelText('Edit analysis settings for'), { target: { value: data.parameters[1].key } })
    expect(screen.getByLabelText('Aggregation')).toHaveValue('raw')
    fireEvent.click(screen.getByRole('button', { name: 'Choose parameters' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Marker · unit-0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose parameters' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Marker · unit-0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.change(screen.getByLabelText('Edit analysis settings for'), { target: { value: data.parameters[0].key } })
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('ckd_progression')
    expect(screen.getByLabelText('Aggregation')).toHaveValue('quarterly-median')
  })

  it('preserves negative measurements in the shared domain', () => {
    const data = fixture()
    data.rows = data.rows.map(row => row.einheit === 'unit-0' ? { ...row, wertNum: row.patientId === 'ID-A' ? -3 : 2 } : row)
    render(<TrajectoriesWorkspace data={data} />)
    const mini = screen.getAllByRole('img', { name: /Measurement trajectory/ })[0]
    expect(mini).toHaveAttribute('data-y-min', '-3')
    expect(mini).toHaveAttribute('data-y-max', '2')
  })
  it('keeps a zero-based full-dataset scale across views and only zooms by explicit choice', () => {
    const data = fixture()
    data.rows = data.rows.map(row => row.einheit === 'unit-0' ? { ...row, wertNum: row.patientId === 'ID-A' ? 6 + (row.labDatum!.getUTCFullYear() - 2020) * .01 : 8 } : row)
    render(<TrajectoriesWorkspace data={data} />)
    expect(screen.getByLabelText('Value scale')).toHaveValue('shared')
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
    fireEvent.change(screen.getByLabelText('Value scale'), { target: { value: 'zoom' } })
    expect(verticalSpan()).toBeGreaterThan(100)
    expect(chart.querySelector('svg')!.getAttribute('data-export-context')).toContain('Zoom to visible values')
  })

  it('adds newly computed parameters once without restoring a deliberately unchecked series', () => {
    const data = fixture()
    const result = render(<TrajectoriesWorkspace data={data} />)
    const derived = { ...data.parameters[0], key: 'derived-new', bezeichnung: 'eGFR CKD', label: 'eGFR CKD', derived: true }
    const updated = { ...data, parameters: [...data.parameters, derived] }
    result.rerender(<TrajectoriesWorkspace data={updated} />)
    expect(screen.getByRole('columnheader', { name: 'eGFR CKD · derived' })).toBeInTheDocument()
    expect(screen.getByText(/Added derived parameter: eGFR CKD/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose parameters' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'eGFR CKD' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    result.rerender(<TrajectoriesWorkspace data={{ ...updated, parameters: [...updated.parameters] }} />)
    expect(screen.queryByRole('columnheader', { name: 'eGFR CKD · derived' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
  })

  it('provides inspectable event labels and counts in overlay without placing every label on the chart', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'other', date: new Date('2021-06-15T00:00:00Z'), title: 'Recorded visit', description: 'Follow-up', endDate: null, intent: null, warning: '' }]
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Events' }))
    expect(screen.getAllByText('Inspect events (1)')).toHaveLength(3)
    expect(screen.getAllByText(/Patient ID-A · 15\/06\/2021 · Recorded visit/)).toHaveLength(3)
  })
  it('offers all parameters with distinct units, and cancel preserves applied columns', () => {
    render(<TrajectoriesWorkspace data={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose parameters' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(12)
    fireEvent.click(within(dialog).getByRole('button', { name: 'All parameters' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(screen.getAllByRole('columnheader')).toHaveLength(14)
    fireEvent.click(screen.getByRole('button', { name: 'Choose parameters' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Marker · unit-0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getAllByRole('columnheader')).toHaveLength(14)
  })

  it('retains selection across table and overlay and opens actual detail measurements by keyboard', () => {
    render(<TrajectoriesWorkspace data={fixture()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select patient ID-A' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selected patients only' }))
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
    render(<TrajectoriesWorkspace data={fixture()} />)
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'Zentrum' } })
    fireEvent.change(screen.getByLabelText('Filter group'), { target: { value: 'Süd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'age' } })
    expect(screen.getAllByText(/1 additional trajectories without age data/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Open patient ID-A, Marker/ })).not.toBeInTheDocument()
  })

  it('shows real OLS values and dates, and real events on the calendar axis', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'other', date: new Date('2021-06-15T00:00:00Z'), title: 'Aufnahme Station', description: null, endDate: null, intent: null, warning: '' }]
    render(<TrajectoriesWorkspace data={data} requestedPatientId="ID-A" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'OLS, slope and R²: Marker · unit-0' }))
    expect(screen.getByText('OLS: 1 unit-0/year · R² 1')).toBeInTheDocument()
    expect(screen.getByText('3 fitted measurements · 731 days')).toBeInTheDocument()
    expect(screen.getByText('15/06/2021: Aufnahme Station')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'calendar' } })
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
    render(<TrajectoriesWorkspace data={data} requestedPatientId="ID-A" />)
    expect(screen.getByText('nicht messbar')).toBeInTheDocument()
    expect(screen.getByText('Missing date')).toBeInTheDocument()
    expect(screen.getAllByText('No trajectories can be plotted. Check measurements, ages, or visible groups.')).toHaveLength(3)
    expect(screen.getByRole('table', { name: 'Measurements Marker · unit-0' })).toBeVisible()
  })

  it('keeps a two-point perfect fit visibly uncertain', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => row.labDatum?.getUTCFullYear() !== 2021)
    render(<TrajectoriesWorkspace data={data} requestedPatientId="ID-A" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'OLS, slope and R²: Marker · unit-0' }))
    expect(screen.getByText(/R² 1/)).toBeInTheDocument()
    expect(screen.getByText('n < 3 · uncertain slope')).toBeInTheDocument()
  })

  it('retains bounded values in table summaries, plot tooltips and derived measurement text', () => {
    const data = fixture()
    data.parameters[0].derived = true
    data.rows = data.rows.map(row => row.einheit === 'unit-0' ? { ...row, wertOperator: '>' as const, wert: String(row.wertNum) } : row)
    render(<TrajectoriesWorkspace data={data} />)
    expect(screen.getAllByText('> 12')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    expect(screen.getByText('01/01/2020: > 10 unit-0')).toBeInTheDocument()
    expect(screen.getAllByText('> 10').length).toBeGreaterThan(0)
    expect(screen.getByRole('columnheader', { name: 'Derived value' })).toBeInTheDocument()
  })

  it('shows an overlay quality caveat and keeps group colors stable after filtering', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => row.labDatum?.getUTCFullYear() !== 2021)
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'Zentrum' } })
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'OLS, slope and R²: Marker · unit-0' }))
    expect(screen.getByText(/2 individual fits have uncertain slopes/)).toBeInTheDocument()
    const stroke = screen.getAllByRole('button', { name: /Open patient ID-B, Marker/ })[0].querySelector('polyline')!.getAttribute('stroke')
    fireEvent.change(screen.getByLabelText('Filter group'), { target: { value: 'Süd' } })
    expect(screen.getAllByRole('button', { name: /Open patient ID-B, Marker/ })[0].querySelector('polyline')!.getAttribute('stroke')).toBe(stroke)
  })

  it('maps a selected derived parameter to a changed formula and explains disabled derivations', () => {
    const data = fixture()
    data.parameters[0].derived = true
    const result = render(<TrajectoriesWorkspace data={data} />)
    const replacement = { ...data.parameters[0], key: 'new-egfr-key', label: 'eGFR EKFC', bezeichnung: 'eGFR EKFC' }
    const updated = { ...data, parameters: [replacement, ...data.parameters.slice(1)], rows: data.rows.map(row => row.einheit === 'unit-0' ? { ...row, bezeichnung: replacement.bezeichnung } : row) }
    result.rerender(<TrajectoriesWorkspace data={updated} />)
    expect(screen.getByRole('columnheader', { name: 'eGFR EKFC · derived' })).toBeInTheDocument()
    expect(screen.getByText(/selected eGFR derivation was updated to eGFR EKFC/)).toBeInTheDocument()
    result.rerender(<TrajectoriesWorkspace data={{ ...updated, parameters: updated.parameters.slice(1) }} />)
    expect(screen.getByText(/Unavailable selected parameters: eGFR EKFC/)).toBeInTheDocument()
  })

  it('plots continuous age from an exact birth anchor and identifies inferred ages', () => {
    const data = fixture()
    data.patients[0].birthAnchor = new Date('1979-06-15T00:00:00Z')
    data.patients[0].ageEstimated = false
    render(<TrajectoriesWorkspace data={data} requestedPatientId="ID-A" />)
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'age' } })
    const exactAge = ((Date.UTC(2020, 0, 1) - data.patients[0].birthAnchor.getTime()) / (365.25 * 86400000)).toLocaleString('en-GB', { maximumFractionDigits: 2 })
    expect(screen.getAllByText(exactAge).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Age: recorded birth date/)).toHaveLength(3)
  })

  it('renders a graph in every populated table cell and restores horizontal position after detail', () => {
    render(<TrajectoriesWorkspace data={fixture()} />)
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
    expect(screen.getByLabelText('Jump to parameter')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Jump to parameter'), { target: { value: JSON.stringify(['Marker', 'unit-2']) } })
    expect(screen.getByRole('region', { name: 'Patient table, horizontal scrolling' }).scrollLeft).toBeGreaterThan(340)
  })

  it('provides an explicit in-app back button and responds to browser popstate', () => {
    render(<TrajectoriesWorkspace data={fixture()} />)
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
    render(<TrajectoriesWorkspace data={data} />)
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('general_exploration')
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'theil_sen' } })
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('theil_sen')
    expect(screen.getByText(/Theil–Sen: non-parametric median slope/)).toBeInTheDocument()
    const fitCheckbox = screen.getByRole('checkbox', { name: 'Theil–Sen, slope and R²: Marker · unit-0' })
    expect(fitCheckbox).toBeInTheDocument()
    fireEvent.click(fitCheckbox)
    expect(screen.getAllByText(/Theil–Sen: 1 unit-0\/year/).length).toBeGreaterThan(0)
  })

  it('supports selecting CKD progression preset and custom pipeline settings', () => {
    const data = fixture()
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'ckd_progression' } })
    expect(screen.getByLabelText('Analysis preset')).toHaveValue('ckd_progression')
    expect(screen.getByText(/CKD progression: quarterly medians/)).toBeInTheDocument()
    expect(screen.getByLabelText('Aggregation')).toHaveValue('quarterly-median')
    expect(screen.getByLabelText('Censor after kidney transplant')).toBeChecked()

    // Modifying a custom setting switches preset to custom
    fireEvent.change(screen.getByLabelText('Aggregation'), { target: { value: 'monthly-median' } })
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
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'OLS, slope and R²: eGFR [ml/min/1.73m²]' }))
    expect(screen.getByText('rapid ↓')).toBeInTheDocument()
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
    render(<TrajectoriesWorkspace data={data} />)
    // Default sort: ID A -> Z
    const getPatientRows = () => screen.getAllByRole('row').slice(1).map(r => within(r).getByRole('button', { name: /Open patient/ }).textContent)
    expect(getPatientRows()).toEqual(['ID-A', 'ID-B'])

    // Sort by ID descending
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'id:desc' } })
    expect(getPatientRows()).toEqual(['ID-B', 'ID-A'])

    // Sort by Slope (steep decline first): ID-A (-10) should come before ID-B (+5)
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: `${data.parameters[0].key}:slope` } })
    expect(getPatientRows()).toEqual(['ID-A', 'ID-B'])

    // Clicking header sort toggles between metrics
    const headerSortBtn = screen.getByTitle(`Sort by ${data.parameters[0].label}`)
    fireEvent.click(headerSortBtn)
    expect(screen.getByLabelText('Sort by')).toHaveValue(`${data.parameters[0].key}:absSlope`)
  })

  it('explains an uncertain slope accessibly in the table and visibly in the patient view', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => !(row.patientId === 'ID-A' && row.labDatum?.getUTCFullYear() === 2021))
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'OLS, slope and R²: Marker · unit-0' }))
    const row = screen.getByRole('button', { name: 'Open patient ID-A' }).closest('tr')!
    const note = within(row).getByText('n < 3 · uncertain slope')
    expect(note.getAttribute('title')).toMatch(/Two points/)
    // Keyboard and touch users reach the explanation through a disclosure, not a tooltip.
    const why = within(row).getByText('Why is the slope uncertain?')
    expect(why.closest('details')).toHaveTextContent(/interpret with caution/)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    const card = chart.parentElement!
    expect(within(card).getByRole('note')).toHaveTextContent(/n < 3 · uncertain slope.*interpret with caution/)
  })

  it('shows no slope-quality caveat once the fit model is off', () => {
    const data = fixture()
    data.rows = data.rows.filter(row => !(row.patientId === 'ID-A' && row.labDatum?.getUTCFullYear() !== 2020))
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'OLS, slope and R²: Marker · unit-0' }))
    expect(screen.getAllByText(/n < 3/).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'acute_review' } })
    for (const summary of document.querySelectorAll('.wt-cell-summary')) expect(summary.textContent).not.toMatch(/n < 3|< 1 year/)
  })

  it('states fitted and total counts when exclusions remove measurements from the fit', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'kidney_transplant', date: new Date('2022-01-01'), endDate: null, title: 'Transplant', description: null, intent: null, warning: '' }]
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByLabelText('Censor after kidney transplant'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'OLS, slope and R²: Marker · unit-0' }))
    const row = screen.getByRole('button', { name: 'Open patient ID-A' }).closest('tr')!
    expect(within(row).getByText(/^2 fitted of 3 measurements · \d+ days$/)).toBeInTheDocument()
    const other = screen.getByRole('button', { name: 'Open patient ID-B' }).closest('tr')!
    expect(within(other).getAllByText(/^3 fitted measurements · \d+ days$/).length).toBeGreaterThan(0)
  })

  it('does not mark excluded measurements when no fit model is set', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'kidney_transplant', date: new Date('2021-01-01'), endDate: null, title: 'Transplant', description: null, intent: null, warning: '' }]
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByLabelText('Censor after kidney transplant'))
    fireEvent.change(screen.getByLabelText('Fit model'), { target: { value: 'none' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    expect(within(chart).queryAllByTestId('excluded-point')).toHaveLength(0)
    expect(within(chart).queryByText(/Grey open circles/)).not.toBeInTheDocument()
    expect(chart.querySelector('svg')!.getAttribute('data-export-context')).not.toContain('excluded')
  })

  it('opens a patient from an overlay trajectory with the Space key', () => {
    render(<TrajectoriesWorkspace data={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    fireEvent.keyDown(screen.getAllByRole('button', { name: /Open patient ID-B, Marker/ })[0], { key: ' ' })
    expect(screen.getByRole('heading', { name: 'Patient ID-B' })).toBeInTheDocument()
  })

  it('explains the empty state when no patients are loaded', () => {
    const data = { ...fixture(), patients: [], rows: [], rawRows: [] }
    render(<TrajectoriesWorkspace data={data} />)
    expect(screen.getByRole('heading', { name: 'Patients and trajectories' })).toBeInTheDocument()
    expect(screen.getByText(/No data loaded yet/)).toBeInTheDocument()
  })

  it('pins the endpoint badge text and title for a projected G5 age', () => {
    const parameter = { key: JSON.stringify(['eGFR', 'mL/min/1.73m²']), label: 'eGFR [mL/min/1.73m²]', bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', derived: false }
    const rows: LabRow[] = [60, 45, 30].map((value, i) => ({ patientId: 'P1', labDatum: new Date(Date.UTC(2020 + i, 0, 1)), bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', wert: String(value), wertNum: value, wertOperator: '=' as const, loinc: null, patientSex: 'w', patientAgeAtLab: 60 + i }))
    const data = { rawRows: rows, rows, fileName: 'g5.csv', parameters: [parameter], patients: [{ id: 'P1', label: 'P1', attributes: {}, baselineAge: 60 }], events: [], patientAttributes: {}, analysis: { fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'ckd_progression' } })
    // Deliberately exact: wording changes to this badge must update this test.
    const badge = document.querySelector('.wt-badge-endpoint')!
    expect(badge).toHaveTextContent(/^-50% · G5 @ 63\.0y$/)
    expect(badge.getAttribute('title')).toBe('total eGFR change -50.0% from baseline (not per year) · projected age to CKD G5 63.0 years; fitted curve using all dated numeric measurements')
  })

  it('reverses a metric sort and keeps patients without a value last', () => {
    const data = fixture()
    data.rows = data.rows.map(row => row.einheit === 'unit-0' ? { ...row, wertNum: row.patientId === 'ID-A' ? 10 : 100 } : row)
    render(<TrajectoriesWorkspace data={data} />)
    const order = () => screen.getAllByRole('row').slice(1).map(r => within(r).getByRole('button', { name: /Open patient/ }).textContent)
    expect(screen.queryByRole('button', { name: 'Reverse order' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: `${data.parameters[0].key}:latest` } })
    expect(order()).toEqual(['ID-B', 'ID-A'])
    expect(screen.getByRole('group', { name: 'Sort direction' })).toHaveTextContent('Highest first')
    fireEvent.click(screen.getByRole('button', { name: 'Reverse order' }))
    expect(screen.getByRole('button', { name: 'Reverse order' })).toHaveAttribute('aria-pressed', 'true')
    expect(order()).toEqual(['ID-A', 'ID-B'])
    expect(screen.getByRole('group', { name: 'Sort direction' })).toHaveTextContent('Lowest first')
    expect(screen.getByTitle(`Sort by ${data.parameters[0].label}`)).toHaveTextContent('↑ val')
    // Choosing another metric starts from that metric's default direction.
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: `${data.parameters[0].key}:n` } })
    expect(screen.getByRole('button', { name: 'Reverse order' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('draws excluded measurements as grey open circles with a reason and a key', () => {
    const data = fixture()
    data.events = [{ patientId: 'ID-A', type: 'kidney_transplant', date: new Date('2021-01-01'), endDate: null, title: 'Transplant', description: null, intent: null, warning: '' }]
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByLabelText('Censor after kidney transplant'))
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    const chart = screen.getByRole('region', { name: 'Chart Marker · unit-0' })
    const excluded = within(chart).getAllByTestId('excluded-point')
    expect(excluded).toHaveLength(2)
    expect(excluded.every(point => point.getAttribute('data-exclusion') === 'post_kidney_transplant')).toBe(true)
    expect(excluded[0].querySelector('title')!.textContent).toContain('excluded from the fit: after kidney transplant')
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
    render(<TrajectoriesWorkspace data={creatinineFixture(['P1'])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient P1' }))
    const chart = screen.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })
    expect(within(chart).queryAllByTestId('aki-marker')).toHaveLength(0)
    fireEvent.click(screen.getByLabelText('AKI windows and episodes'))
    expect(within(chart).getAllByTestId('aki-marker')).toHaveLength(1)
    expect(within(chart).getByText('AKI II')).toBeInTheDocument()
    expect(within(chart).getAllByTestId('aki-band')).toHaveLength(1)
    expect(within(chart).getByText(/AKI episode at the creatinine peak/)).toBeInTheDocument()
    // AKI display is context only; nothing is excluded until the analysis excludes AKI windows.
    expect(within(chart).queryAllByTestId('excluded-point')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'ckd_progression' } })
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
    render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient P1' }))
    fireEvent.click(screen.getByLabelText('AKI windows and episodes'))
    const creatinine = screen.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })
    expect(within(creatinine).getByTestId('aki-marker')).toHaveAttribute('data-on-measurement', 'true')
    const other = screen.getByRole('region', { name: 'Chart CRP [mg/l]' })
    const offSeries = within(other).getByTestId('aki-marker')
    expect(offSeries).toHaveAttribute('data-on-measurement', 'false')
    expect(offSeries.querySelector('title')!.textContent).toContain('no measurement of this parameter on that date')
  })

  it('marks AKI-excluded measurements even while AKI display is off, with reasons in the measurement table', () => {
    render(<TrajectoriesWorkspace data={creatinineFixture(['P1'])} />)
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: 'ckd_progression' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open patient P1' }))
    expect(screen.getByLabelText('AKI windows and episodes')).not.toBeChecked()
    const chart = screen.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })
    expect(within(chart).getAllByTestId('excluded-point')).toHaveLength(2)
    expect(within(chart).queryAllByTestId('aki-marker')).toHaveLength(0)
    const table = screen.getByRole('table', { name: 'Measurements Kreatinin [mg/dl]', hidden: true })
    expect(within(table).getAllByText('Excluded: AKI window')).toHaveLength(2)
  })

  it('marks episodes for every overlay trajectory but windows and labels only for the highlighted one', () => {
    render(<TrajectoriesWorkspace data={creatinineFixture(['P1', 'P2'])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    fireEvent.click(screen.getByLabelText('AKI windows and episodes'))
    const chart = screen.getByRole('region', { name: 'Chart Kreatinin [mg/dl]' })
    expect(within(chart).getAllByTestId('aki-marker')).toHaveLength(2)
    expect(within(chart).queryAllByTestId('aki-band')).toHaveLength(0)
    expect(within(chart).queryByText('AKI II')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Highlight patient'), { target: { value: '1' } })
    expect(within(chart).getAllByTestId('aki-band')).toHaveLength(1)
    expect(within(chart).getAllByText('AKI II')).toHaveLength(1)
  })
})
