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
    expect(screen.getAllByText(/0 trajectories use an estimated birth-date anchor/)).toHaveLength(3)
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
    fireEvent.click(screen.getByRole('button', { name: 'Scroll columns right' }))
    expect(screen.getByRole('region', { name: 'Patient table, horizontal scrolling' }).scrollLeft).toBeGreaterThan(340)
  })
})
