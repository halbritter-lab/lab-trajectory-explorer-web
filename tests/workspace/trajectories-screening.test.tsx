import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrajectoriesWorkspace } from '../../src/workspace/TrajectoriesWorkspace'
import type { WorkspaceData } from '../../src/workspace/workspace-data'
import type { LabRow } from '../../src/core/types'
import { useAppStore } from '../../src/workspace/state/store'

for (const method of ['show', 'showModal', 'close'] as const) {
  if (!HTMLDialogElement.prototype[method]) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value() {} })
}
if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value() {} })

beforeEach(() => {
  useAppStore.getState().reset()
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => false }))
})
afterEach(() => vi.restoreAllMocks())

let LABEL = 'Marker · u'
interface Series { id: string; values: number[]; stepDays?: number; attributes?: Record<string, string> }
/** One parameter "Marker [unit]"; each patient's values lie `stepDays` apart (a year by default) from 2020-01-01. */
function dataset(series: Series[], unit = 'u'): WorkspaceData {
  LABEL = `Marker · ${unit}`
  const parameters = [{ key: JSON.stringify(['Marker', unit]), label: LABEL, bezeichnung: 'Marker', einheit: unit, derived: false }]
  const patients = series.map(s => ({ id: s.id, label: s.id, attributes: s.attributes ?? {}, baselineAge: 40 }))
  const rows: LabRow[] = series.flatMap(s => s.values.map((value, i) => ({ patientId: s.id, labDatum: new Date(Date.UTC(2020, 0, 1) + i * (s.stepDays ?? 366) * 86_400_000), bezeichnung: 'Marker', einheit: unit, wert: String(value), wertNum: value, wertOperator: '=' as const, loinc: null, patientSex: null, patientAgeAtLab: 40 })))
  return { rawRows: rows, rows, fileName: 'real.csv', parameters, patients, events: [], patientAttributes: Object.fromEntries(patients.map(p => [p.id, p.attributes])), analysis: { fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
}
const enableTrend = () => fireEvent.click(screen.getByRole('checkbox', { name: `Analyse trend: ${LABEL}` }))
const rowOf = (id: string) => screen.getByRole('button', { name: `Open patient ${id}` }).closest('tr')!
const order = () => within(screen.getByRole('table')).getAllByRole('button', { name: /^Open patient/ }).map(button => button.textContent)
function sortColumn(metric: string, ascending = true) {
  fireEvent.click(screen.getByRole('button', { name: `Sort: ${LABEL}` }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: `${metric}: ${ascending ? 'ascending' : 'descending'}` }))
}

describe('slope decimals per parameter column (K35) and the interval label (K07)', () => {
  // Slopes near 0.01, 0.30 and 0.02 per year: the median 0.02 needs three decimals.
  const small = () => dataset([
    { id: 'ID-A', values: [1.0, 1.012, 1.018, 1.031] },
    { id: 'ID-B', values: [1.0, 1.31, 1.59, 1.9] },
    { id: 'ID-C', values: [1.0, 1.022, 1.038, 1.061] },
  ])

  it('writes slope and bounds of a small-valued parameter with three decimals, the same in every row', () => {
    render(<TrajectoriesWorkspace data={small()} />)
    enableTrend()
    for (const id of ['ID-A', 'ID-B', 'ID-C']) {
      expect(rowOf(id).querySelector('.pv-cell-slope')).toHaveTextContent(/^\+\d\.\d{3} u\/yr$/)
      expect(rowOf(id).querySelector('.pv-cell-ci')).toHaveTextContent(/^95% CI \[-?\d\.\d{3}, -?\d\.\d{3}\]$/)
    }
    expect(rowOf('ID-A').querySelector('.pv-cell-slope')).toHaveTextContent('+0.010 u/yr')
    // Two decimals would print the same number three times: the bounds differ now.
    const [low, high] = rowOf('ID-A').querySelector('.pv-cell-ci')!.textContent!.match(/\d\.\d{3}/g)!
    expect(low).not.toBe(high)
  })

  it('keeps the decimals of the whole dataset while a search narrows the table', () => {
    render(<TrajectoriesWorkspace data={small()} />)
    enableTrend()
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'ID-B' } })
    expect(order()).toEqual(['ID-B'])
    // ID-B alone (0.30 per year) would take two decimals.
    expect(rowOf('ID-B').querySelector('.pv-cell-slope')).toHaveTextContent(/^\+0\.\d{3} u\/yr$/)
  })

  it('uses the same digits in the patient view, signed and padded', () => {
    render(<TrajectoriesWorkspace data={small()} />)
    enableTrend()
    fireEvent.click(screen.getByRole('button', { name: 'Open patient ID-A' }))
    expect(screen.getByText(/^OLS: \+0\.010 u\/year, R² /)).toBeInTheDocument()
    expect(screen.getByText(/^95% slope CI \[\d\.\d{3}, \d\.\d{3}\] u\/year$/)).toBeInTheDocument()
  })

  it('stays at two decimals for slopes of ordinary size', () => {
    render(<TrajectoriesWorkspace data={dataset([{ id: 'ID-A', values: [60, 54, 51, 44] }, { id: 'ID-B', values: [80, 79, 77, 76.5] }])} />)
    enableTrend()
    expect(rowOf('ID-A').querySelector('.pv-cell-slope')).toHaveTextContent(/^-\d\.\d{2} u\/yr$/)
    expect(rowOf('ID-A').querySelector('.pv-cell-ci')).toHaveTextContent(/^95% CI \[-\d+\.\d{2}, -?\d+\.\d{2}\]$/)
  })

  it('labels Theil–Sen bounds on fewer than five dates as a range, not as a 95% interval', () => {
    render(<TrajectoriesWorkspace data={small()} />)
    enableTrend()
    fireEvent.change(screen.getByLabelText(`Trend method: ${LABEL}`), { target: { value: 'theil-sen' } })
    expect(rowOf('ID-A').querySelector('.pv-cell-ci')).toHaveTextContent(/^range \[\d\.\d{3}, \d\.\d{3}\]$/)
    expect(rowOf('ID-A').querySelector('.pv-cell-ci')).toHaveAccessibleName(/^Slope range \[/)
  })
})

// Reliable: R1 (about -10 per year) and R2 (-2). Uncertain: U, four values within 150 days
// (about -7.3 per year). N has one value and no slope.
const ranking = (unit?: string) => dataset([
  { id: 'N', values: [50] },
  { id: 'R1', values: [60, 50, 40, 30] },
  { id: 'R2', values: [60, 58, 56, 54] },
  { id: 'U', values: [60, 59, 58, 57], stepDays: 50 },
], unit)

describe('sorting by slope places uncertain slopes after the reliable ones (K02)', () => {
  it('orders reliable slopes, then uncertain ones, then patients without a slope, in both directions', () => {
    render(<TrajectoriesWorkspace data={ranking()} />)
    enableTrend()
    sortColumn('Slope')
    // By value alone U (-7.3) would stand between R1 (-10) and R2 (-2).
    expect(order()).toEqual(['R1', 'R2', 'U', 'N'])
    sortColumn('Slope', false)
    expect(order()).toEqual(['R2', 'R1', 'U', 'N'])
    sortColumn('Absolute slope', false)
    expect(order()).toEqual(['R1', 'R2', 'U', 'N'])
  })

  it('names the rows moved back in the status line and restores the order by value on request', () => {
    render(<TrajectoriesWorkspace data={ranking()} />)
    enableTrend()
    expect(screen.queryByRole('checkbox', { name: 'Uncertain slopes last' })).not.toBeInTheDocument()
    sortColumn('Slope')
    expect(screen.getByText(/1 uncertain slope placed after the other slopes/)).toBeInTheDocument()
    const toggle = screen.getByRole('checkbox', { name: 'Uncertain slopes last' })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    expect(order()).toEqual(['R1', 'U', 'R2', 'N'])
    expect(screen.getByText(/1 uncertain slope ranked among the other slopes/)).toBeInTheDocument()
    // Another metric has no such rule and shows neither the note nor the switch.
    sortColumn('Latest value', false)
    expect(screen.queryByText(/uncertain slope (placed|ranked)/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Uncertain slopes last' })).not.toBeInTheDocument()
  })
})

describe('filters with counts for marks and event types (K01), and select all matching (K25)', () => {
  const marked = () => {
    const data = ranking('ml/min/1.73m²')
    data.events = [
      { patientId: 'R2', type: 'kidney_transplant', date: new Date('2023-06-01T00:00:00Z'), title: 'Transplant', description: null, endDate: null, intent: null, warning: null },
      { patientId: 'U', type: 'other', date: new Date('2020-02-01T00:00:00Z'), title: 'Therapy start', description: null, endDate: null, intent: null, warning: null },
    ] as unknown as WorkspaceData['events']
    return data
  }
  const filterButton = (name: RegExp) => within(screen.getByRole('group', { name: 'Show only patients with' })).getByRole('button', { name })

  it('offers the marks and event types that occur, each with its number of patients', () => {
    render(<TrajectoriesWorkspace data={marked()} />)
    const filters = screen.getByRole('group', { name: 'Show only patients with' })
    // Without a trend only the marks that need no fit: the reached endpoint and the events.
    expect(within(filters).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Endpoint reached: 1 patient', 'Kidney transplant: 1 patient', 'Other event: 1 patient'])
    enableTrend()
    expect(within(filters).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Rapid decline: 1 patient', 'Uncertain slope: 1 patient', 'Reliable slope: 2 patients', 'Endpoint reached: 1 patient', 'Kidney transplant: 1 patient', 'Other event: 1 patient'])
  })

  it('offers the possible rapid decline as a mark of its own (issue #72)', () => {
    // R1 falls steadily (whole interval below -5); S scatters (slope below -5, interval reaching above it).
    render(<TrajectoriesWorkspace data={dataset([{ id: 'R1', values: [80, 70, 60, 50] }, { id: 'S', values: [80, 40, 75, 45] }], 'ml/min/1.73m²')} />)
    enableTrend()
    expect(within(rowOf('R1')).getByRole('button', { name: 'rapid ↓' })).toBeInTheDocument()
    expect(within(rowOf('S')).getByRole('button', { name: 'rapid ↓?' })).toBeInTheDocument()
    expect(filterButton(/^Rapid decline/)).toHaveAccessibleName('Rapid decline: 1 patient')
    fireEvent.click(filterButton(/^Possible rapid decline/))
    expect(filterButton(/^Possible rapid decline/)).toHaveAccessibleName('Possible rapid decline: 1 patient')
    expect(order()).toEqual(['S'])
  })

  it('narrows table and export scope to the patients carrying every chosen mark', () => {
    render(<TrajectoriesWorkspace data={marked()} />)
    enableTrend()
    fireEvent.click(filterButton(/^Rapid decline/))
    expect(filterButton(/^Rapid decline/)).toHaveAttribute('aria-pressed', 'true')
    expect(order()).toEqual(['R1'])
    expect(screen.getByRole('button', { name: 'Export 1 of 4 patients (XLSX)' })).toBeInTheDocument()
    // R1 has no event: both marks together match nobody, and the counts keep referring to the unfiltered scope.
    fireEvent.click(filterButton(/^Other event/))
    expect(screen.getByText(/No matching patients/)).toBeInTheDocument()
    expect(filterButton(/^Other event/)).toHaveAccessibleName('Other event: 1 patient')
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(order()).toEqual(['N', 'R1', 'R2', 'U'])
    expect(screen.getByRole('button', { name: 'Export cohort (XLSX)' })).toBeInTheDocument()
  })

  it('counts within the search, and keeps a chosen mark visible when its basis disappears', () => {
    render(<TrajectoriesWorkspace data={marked()} />)
    enableTrend()
    fireEvent.click(filterButton(/^Uncertain slope/))
    expect(order()).toEqual(['U'])
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'R' } })
    expect(filterButton(/^Uncertain slope/)).toHaveAccessibleName('Uncertain slope: 0 patients')
    expect(filterButton(/^Rapid decline/)).toHaveAccessibleName('Rapid decline: 1 patient')
    expect(screen.getByText(/No matching patients/)).toBeInTheDocument()
  })

  it('keeps the open patient when a settings change takes them out of the chosen mark', () => {
    // A second patient with an uncertain slope: the one the view would otherwise switch to.
    const data = marked()
    const second = dataset([{ id: 'U2', values: [60, 59, 58, 57], stepDays: 50 }], 'ml/min/1.73m²')
    data.patients.push(...second.patients); data.rows.push(...second.rows); data.rawRows.push(...second.rawRows)
    data.patientAttributes.U2 = {}
    render(<TrajectoriesWorkspace data={data} />)
    enableTrend()
    fireEvent.click(filterButton(/^Uncertain slope/))
    expect(order()).toEqual(['U', 'U2'])
    fireEvent.click(screen.getByRole('button', { name: 'Open patient U2' }))
    expect(screen.getByRole('heading', { name: 'Patient U2' })).toBeInTheDocument()
    expect(screen.queryByText(/does not match “Show only/)).not.toBeInTheDocument()
    // Without a fit nobody carries the mark any more.
    fireEvent.change(screen.getByLabelText(`Trend method: ${LABEL}`), { target: { value: 'none' } })
    expect(screen.getByRole('heading', { name: 'Patient U2' })).toBeInTheDocument()
    expect(screen.getByText(/Patient U2 does not match “Show only: Uncertain slope” and stays open\. No patient matches at present\./)).toBeInTheDocument()
    expect(screen.queryByText(/No matching patients/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export patient (XLSX)' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next patient' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous patient' })).toBeDisabled()
    expect(within(screen.getByLabelText('Open patient directly')).getAllByRole('option').map(option => option.textContent)).toEqual(['U2 (not in “Show only”)'])
    fireEvent.click(screen.getByRole('button', { name: 'Show all patients' }))
    expect(screen.getByRole('heading', { name: 'Patient U2' })).toBeInTheDocument()
    expect(screen.queryByText(/does not match “Show only/)).not.toBeInTheDocument()
    expect(screen.getByText('5 / 5')).toBeInTheDocument()
  })

  it('leaves the open patient in place while others still match, and continues with them on "Next patient"', () => {
    const data = marked()
    render(<TrajectoriesWorkspace data={data} />)
    enableTrend()
    fireEvent.click(screen.getByRole('button', { name: 'Open patient R2' }))
    // Chosen in the patient view: R2 has a transplant but no uncertain slope.
    fireEvent.click(filterButton(/^Uncertain slope/))
    expect(screen.getByRole('heading', { name: 'Patient R2' })).toBeInTheDocument()
    expect(screen.getByText(/Patient R2 does not match “Show only: Uncertain slope” and stays open\. “Next patient” continues with the one matching patient\./)).toBeInTheDocument()
    expect(screen.getByText('– / 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next patient' }))
    expect(screen.getByRole('heading', { name: 'Patient U' })).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.queryByText(/does not match “Show only/)).not.toBeInTheDocument()
  })

  it('offers "Select all matching" with the number of hits as soon as a search or filter is active', () => {
    render(<TrajectoriesWorkspace data={marked()} />)
    expect(screen.queryByRole('button', { name: /^Select all \d+ matching$/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'R' } })
    fireEvent.click(screen.getByRole('button', { name: 'Select all 2 matching' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: '' } })
    expect(screen.queryByRole('button', { name: /^Select all \d+ matching$/ })).not.toBeInTheDocument()
    fireEvent.click(filterButton(/^Other event/))
    expect(screen.getByRole('button', { name: 'Select all 1 matching' })).toBeInTheDocument()
    // Still offered beside a selection, as before.
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select patient N' }))
    expect(screen.getByRole('button', { name: 'Select all 4 matching' })).toBeInTheDocument()
  })
})

describe('paging: collapsed groups (K20), bars and page size (K21)', () => {
  // 120 patients: 70 in centre A (P-001 to P-070), 50 in centre B.
  const large = () => dataset(Array.from({ length: 120 }, (_, i) => ({ id: `P-${String(i + 1).padStart(3, '0')}`, values: [i], attributes: { Centre: i < 70 ? 'A' : 'B' } })))
  const group = () => fireEvent.change(screen.getByLabelText('Group by attribute'), { target: { value: 'Centre' } })
  const topPages = () => screen.getByRole('navigation', { name: 'Patient table pages' })

  it('gives a collapsed group one header row and no page of its own', () => {
    render(<TrajectoriesWorkspace data={large()} />)
    group()
    expect(within(topPages()).getByRole('status')).toHaveTextContent('Showing 1–50 of 120 patients')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse group A' }))
    // Before: page 1 held 50 hidden rows of A and showed its header only.
    expect(order()).toHaveLength(50)
    expect(order()[0]).toBe('P-071')
    expect(screen.getByRole('button', { name: 'Expand group A' })).toHaveTextContent('70 patients')
    // 50 expanded rows fit one page: no page turning, only the page size remains.
    expect(within(topPages()).queryByRole('button', { name: 'Next table page' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand group A' }))
    // B starts on the second page; collapsing it there leaves the 70 patients of A on two pages.
    fireEvent.click(within(topPages()).getByRole('button', { name: 'Next table page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse group B' }))
    expect(within(topPages()).getByRole('status')).toHaveTextContent('Showing 51–70 of 70 patients (50 more in collapsed groups)')
    expect(order()).toHaveLength(20)
    expect(screen.getByRole('button', { name: 'Collapse group A' })).toHaveTextContent('20 of 70 patients on this page')
    // The collapsed group keeps its header on every page, so it can be expanded there.
    expect(screen.getByRole('button', { name: 'Expand group B' })).toHaveTextContent('50 patients')
    // Selection of the page and the export keep their scope.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select visible patients on this page' }))
    expect(screen.getByText('20 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export cohort (XLSX)' })).toBeInTheDocument()
  }, 20_000)

  it('repeats the page controls below the table and returns to the table top from there', () => {
    render(<TrajectoriesWorkspace data={large()} />)
    const below = screen.getByRole('navigation', { name: 'Patient table pages, below the table' })
    expect(below).toHaveTextContent('Page 1 of 3 · patients 1–50 of 120')
    const scroller = screen.getByRole('region', { name: 'Patient table, horizontal scrolling' })
    scroller.getBoundingClientRect = () => ({ top: -900 }) as DOMRect
    scroller.scrollIntoView = vi.fn()
    fireEvent.click(within(below).getByRole('button', { name: 'Below the table: next page' }))
    expect(below).toHaveTextContent('Page 2 of 3 · patients 51–100 of 120')
    expect(order()[0]).toBe('P-051')
    expect(scroller.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(scroller).toHaveFocus()
    // From the bar above the table nothing has to move when its top is in view.
    scroller.getBoundingClientRect = () => ({ top: 120 }) as DOMRect
    fireEvent.click(within(topPages()).getByRole('button', { name: 'Previous table page' }))
    expect(scroller.scrollIntoView).toHaveBeenCalledTimes(1)
  }, 20_000)

  it('jumps to a chosen page and changes the page size', () => {
    render(<TrajectoriesWorkspace data={large()} />)
    fireEvent.change(screen.getByLabelText('Go to page'), { target: { value: '2' } })
    expect(order()[0]).toBe('P-101')
    expect(within(topPages()).getByRole('status')).toHaveTextContent('Showing 101–120 of 120 patients')
    fireEvent.change(screen.getByLabelText('Patients per page'), { target: { value: '25' } })
    expect(order()).toHaveLength(25)
    expect(order()[0]).toBe('P-001')
    expect(screen.getByLabelText('Go to page').querySelectorAll('option')).toHaveLength(5)
    fireEvent.change(screen.getByLabelText('Patients per page'), { target: { value: '100' } })
    expect(order()).toHaveLength(100)
    expect(within(topPages()).getByRole('status')).toHaveTextContent('Showing 1–100 of 120 patients')
  }, 20_000)

  it('shows no page controls for a table that fits the smallest page', () => {
    render(<TrajectoriesWorkspace data={ranking()} />)
    expect(screen.queryByRole('navigation', { name: 'Patient table pages' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Patient table pages, below the table' })).not.toBeInTheDocument()
  }, 20_000)
})
