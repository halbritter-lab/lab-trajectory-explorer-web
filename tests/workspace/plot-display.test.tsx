import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { TrajectoriesWorkspace } from '../../src/workspace/TrajectoriesWorkspace'
import type { WorkspaceData } from '../../src/workspace/workspace-data'
import type { LabRow } from '../../src/core/types'
import type { ClinicalEvent } from '../../src/core/events/events'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { useAppStore } from '../../src/workspace/state/store'
import { layoutMarkerLabels } from '../../src/workspace/marker-labels'
import { skippedByAkiDetection } from '../../src/workspace/aki-detection'
import { workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { defaultTrajectoryView, restoreSavedSettings, SAVED_SETTINGS_VERSION } from '../../src/workspace/saved-settings'
import { defaultFitSettings, defaultTrajectoryFitSettings, toFitConfig } from '../../src/workspace/workspace-analysis'

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
const CREA = { key: JSON.stringify(['Kreatinin', 'mg/dl']), label: 'Kreatinin [mg/dl]', bezeichnung: 'Kreatinin', einheit: 'mg/dl', derived: false }
const CRP = { key: JSON.stringify(['CRP', 'mg/l']), label: 'CRP [mg/l]', bezeichnung: 'CRP', einheit: 'mg/l', derived: false }
const lab = (patientId: string, parameter: typeof CREA, date: string, value: number): LabRow => ({ patientId, labDatum: day(date), bezeichnung: parameter.bezeichnung, einheit: parameter.einheit, wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: 50 })
const event = (patientId: string, date: string, title: string, extra: Partial<ClinicalEvent> = {}): ClinicalEvent => ({ patientId, type: 'other', date: day(date), title, description: null, endDate: null, intent: null, warning: '', ...extra } as ClinicalEvent)
function dataset(rows: LabRow[], parameters = [CREA], events: ClinicalEvent[] = []): WorkspaceData {
  const patients = [...new Set(rows.map(row => String(row.patientId)))].map(id => ({ id, label: id, attributes: {}, baselineAge: 50 }))
  return { rawRows: rows, rows, fileName: 'plots.csv', parameters, patients, events, patientAttributes: {}, analysis: { fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
}
const display = () => { const button = screen.getByRole('button', { name: 'Display' }); if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button) }
const chart = (label = CREA.label) => screen.getByRole('region', { name: `Chart ${label}` })
const ticks = (label?: string) => within(chart(label)).getAllByTestId('x-tick').map(tick => tick.textContent)
/** A stay of 20 days with daily creatinine, an AKI and a dated acute dialysis. */
const icuValues = [0.9, 1.0, 1.9, 3.1, 4.6, 4.4, 3.9, 3.0, 2.2, 1.6, 1.2, 1.0]
const icu = (events: ClinicalEvent[] = []) => dataset(icuValues.map((value, i) => lab('ICU', CREA, `2026-03-${String(i + 1).padStart(2, '0')}`, value)), [CREA], events)
const acuteDialysis = event('ICU', '2026-03-05', 'CVVH', { type: 'dialysis', intent: 'acute', endDate: day('2026-03-07') } as Partial<ClinicalEvent>)

describe('elapsed-time axis in days and calendar ticks (K27)', () => {
  it('offers days since first measurement beside years and labels whole days', () => {
    render(<TrajectoriesWorkspace data={icu()} requestedPatientId="ICU" />)
    expect(within(chart()).getByText('Years since first measurement of this parameter')).toBeInTheDocument()
    display()
    const axis = screen.getByLabelText('Time axis') as HTMLSelectElement
    expect([...axis.options].map(option => option.textContent)).toEqual(['Years since first measurement', 'Days since first measurement', 'Calendar date', 'Age'])
    expect(axis).toHaveValue('baseline')
    fireEvent.change(axis, { target: { value: 'baselineDays' } })
    expect(within(chart()).getByText('Days since first measurement of this parameter')).toBeInTheDocument()
    expect(ticks()).toEqual(['0', '2', '4', '6', '8', '10'])
    expect(chart().querySelector('svg.wt-plot')).toHaveAttribute('data-x-min', '0')
    // The unit is a display choice that the saved view keeps.
    expect(useAppStore.getState().trajectoryView.axis).toBe('baselineDays')
  })
  it('never shows fractions of a day on the days axis', () => {
    render(<TrajectoriesWorkspace data={dataset([lab('S', CREA, '2026-09-01', 1), lab('S', CREA, '2026-09-03', 1.2)])} requestedPatientId="S" />)
    display()
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'baselineDays' } })
    expect(ticks()).toEqual(['0', '1', '2'])
  })
  it('restores the days axis from saved settings', () => {
    const saved = { version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: { ...defaultTrajectoryView(), axis: 'baselineDays' } }
    const restored = restoreSavedSettings(JSON.parse(JSON.stringify(saved)), new Set())
    expect(restored.trajectoryView.axis).toBe('baselineDays')
    expect(restored.notRestored).toEqual([])
  })
  it('labels every calendar tick with a different date on a range of a few days', () => {
    render(<TrajectoriesWorkspace data={dataset([lab('S', CREA, '2026-09-01', 1), lab('S', CREA, '2026-09-02', 1.2)])} requestedPatientId="S" />)
    display()
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'calendar' } })
    expect(ticks()).toEqual(['01/09/2026', '02/09/2026'])
  })
  it('keeps five evenly spaced dates on a longer calendar range', () => {
    render(<TrajectoriesWorkspace data={icu()} requestedPatientId="ICU" />)
    display()
    fireEvent.change(screen.getByLabelText('Time axis'), { target: { value: 'calendar' } })
    expect(ticks()).toHaveLength(5)
    expect(new Set(ticks()).size).toBe(5)
    expect(ticks()[0]).toBe('01/03/2026')
    expect(ticks()[4]).toBe('12/03/2026')
  })
})

describe('marker labels (K31)', () => {
  const bounds = { left: 65, right: 630, top: 10 }
  it('anchors a label at the border inwards and leaves others centred', () => {
    expect(layoutMarkerLabels([{ x: 65, y: 100, label: 'AKI I' }, { x: 300, y: 100, label: 'AKI I' }, { x: 630, y: 100, label: 'AKI I' }], bounds).map(label => label.anchor)).toEqual(['start', 'middle', 'end'])
  })
  it('merges equal neighbours into one counted label at the highest marker', () => {
    expect(layoutMarkerLabels([{ x: 220, y: 90, label: 'AKI III' }, { x: 200, y: 120, label: 'AKI III' }, { x: 240, y: 60, label: 'AKI III' }, { x: 400, y: 80, label: 'AKI III' }], bounds))
      .toEqual([{ x: 220, y: 60, text: 'AKI III ×3', color: undefined, anchor: 'middle' }, { x: 400, y: 80, text: 'AKI III', color: undefined, anchor: 'middle' }])
    // A run ends where the next marker is 46 pixels away, and before it is 92 pixels wide.
    expect(layoutMarkerLabels([200, 245, 291].map(x => ({ x, y: 50, label: 'AKI I' })), bounds).map(label => label.text)).toEqual(['AKI I ×2', 'AKI I'])
    expect(layoutMarkerLabels([200, 240, 280, 320].map(x => ({ x, y: 50, label: 'AKI I' })), bounds).map(label => label.text)).toEqual(['AKI I ×3', 'AKI I'])
    expect(layoutMarkerLabels([{ x: 200, y: 50, label: 'AKI I', color: 'red' }, { x: 210, y: 80, label: 'AKI I', color: 'blue' }], bounds)).toHaveLength(2)
  })
  it('moves a different label that would overlap up by a line, not above the top', () => {
    const placed = layoutMarkerLabels([{ x: 200, y: 50, label: 'AKI I' }, { x: 210, y: 52, label: 'AKI III' }, { x: 215, y: 15, label: 'AKI II' }, { x: 220, y: 16, label: 'AKI I' }], bounds)
    expect(placed.map(label => [label.text, label.y])).toEqual([['AKI I', 50], ['AKI III', 30], ['AKI II', 15], ['AKI I', 16]])
  })
  it('moves a label off the measurement points of its trajectory', () => {
    // "AKI II" is 33 pixels wide around x = 300: the point at 310/95 is under it, the one at 330/95 is not.
    expect(layoutMarkerLabels([{ x: 300, y: 100, label: 'AKI II' }], bounds, [{ x: 330, y: 95 }])[0].y).toBe(100)
    expect(layoutMarkerLabels([{ x: 300, y: 100, label: 'AKI II' }], bounds, [{ x: 310, y: 95 }, { x: 310, y: 84 }])[0].y).toBe(78)
    expect(layoutMarkerLabels([{ x: 300, y: 12, label: 'AKI II' }], bounds, [{ x: 310, y: 10 }])[0].y).toBe(12)
  })
  it('draws the stage label outside the clipped trajectory and whole at the right border', () => {
    // The series ends with the creatinine peak: the marker sits on the last date.
    const rows = [['2026-01-01', 1.0], ['2026-01-10', 1.0], ['2026-01-11', 2.4]].map(([date, value]) => lab('P', CREA, date as string, value as number))
    render(<TrajectoriesWorkspace data={dataset(rows)} requestedPatientId="P" />)
    display()
    fireEvent.click(screen.getByLabelText('AKI windows and episodes'))
    const label = within(chart()).getByTestId('marker-label')
    expect(label).toHaveTextContent('AKI II')
    expect(label).toHaveAttribute('text-anchor', 'end')
    expect(label.closest('[clip-path]')).toBeNull()
    expect(within(chart()).getByTestId('aki-marker').querySelector('text')).toBeNull()
    // Points and diamonds on the first and last date are not cut in half.
    const clip = within(chart()).getByTestId('aki-marker').closest('[clip-path]')!.getAttribute('clip-path')!.slice(5, -1)
    expect(chart().querySelector(`#${clip} rect`)).toHaveAttribute('x', '58')
    expect(chart().querySelector(`#${clip} rect`)).toHaveAttribute('width', '579')
  })
})

describe('AKI window legend and tooltip (K30)', () => {
  const spike = [['2019-01-01', 1.0], ['2019-06-01', 1.1], ['2020-01-01', 1.05], ['2020-07-30', 1.15], ['2020-08-01', 2.4], ['2020-08-10', 1.8], ['2020-10-01', 1.2], ['2021-06-01', 1.3]].map(([date, value]) => lab('P1', CREA, date as string, value as number))
  const legend = () => within(chart()).getByTestId('aki-band-legend').textContent
  const tooltip = () => within(chart()).getByTestId('aki-band').querySelector('title')!.textContent
  const choosePreset = (id: string) => {
    fireEvent.click(screen.getByRole('button', { name: `Analysis settings: ${CREA.label}` }))
    fireEvent.change(screen.getByLabelText('Analysis preset'), { target: { value: id } })
    if (screen.queryByRole('button', { name: 'Close analysis settings' })) fireEvent.click(screen.getByRole('button', { name: 'Close analysis settings' }))
  }
  it('says whether the column excludes the window and that its length is the configured one', () => {
    render(<TrajectoriesWorkspace data={dataset(spike)} requestedPatientId="P1" />)
    display()
    fireEvent.click(screen.getByLabelText('AKI windows and episodes'))
    fireEvent.click(screen.getByRole('button', { name: 'Display' }))
    // Trend not ticked: the column has no fit.
    expect(legend()).toBe(' Shaded: AKI window, the configured 30 days after each onset (not the duration of the episode); this column has no fit, so nothing is excluded')
    expect(tooltip()).toBe('AKI window 01/08/2020 to 31/08/2020 (30 days): the configured 30 days after each onset, overlapping windows drawn as one; not the duration of the episode. This column has no fit, so nothing is excluded.')
    fireEvent.click(screen.getByRole('checkbox', { name: `Analyse trend: ${CREA.label}` }))
    expect(legend()).toContain('values inside are not excluded from this fit')
    expect(tooltip()).toContain('Values inside are not excluded from this fit.')
    choosePreset('ckd_progression')
    expect(legend()).toContain('; values inside are excluded from this fit')
    expect(tooltip()).toContain('Values inside are excluded from this fit.')
    choosePreset('acute_review')
    expect(legend()).toContain('this column has no fit, so nothing is excluded')
  })
})

describe('dated dialysis interval and values left out of AKI detection (K28)', () => {
  it('asks the detection rule, for serum creatinine only', () => {
    expect(skippedByAkiDetection(CREA, day('2026-03-05'), [acuteDialysis])).toBe(true)
    expect(skippedByAkiDetection(CREA, day('2026-03-07'), [acuteDialysis])).toBe(true)
    expect(skippedByAkiDetection(CREA, day('2026-03-08'), [acuteDialysis])).toBe(false)
    expect(skippedByAkiDetection(CREA, day('2026-03-04'), [acuteDialysis])).toBe(false)
    expect(skippedByAkiDetection(CRP, day('2026-03-05'), [acuteDialysis])).toBe(false)
    // Acute dialysis without an end date excludes nothing from detection.
    expect(skippedByAkiDetection(CREA, day('2026-03-05'), [{ ...acuteDialysis, endDate: null }])).toBe(false)
  })
  it('draws the interval as a band and names the values not used for detection, without a fit', () => {
    const data = icu([acuteDialysis])
    data.parameters = [CREA, CRP]
    data.rows = [...data.rows, lab('ICU', CRP, '2026-03-05', 80), lab('ICU', CRP, '2026-03-06', 60)]
    data.rawRows = data.rows
    render(<TrajectoriesWorkspace data={data} requestedPatientId="ICU" />)
    expect(within(chart()).queryByTestId('event-band')).toBeNull()
    // Independent of the events switch and of any fit: three creatinine values lie in the interval.
    expect([...chart().querySelectorAll('circle[data-aki-skipped] title')].map(title => title.textContent)).toEqual([
      '05/03/2026: 4.6 mg/dl, not used for AKI detection (dialysis)', '06/03/2026: 4.4 mg/dl, not used for AKI detection (dialysis)', '07/03/2026: 3.9 mg/dl, not used for AKI detection (dialysis)'])
    expect(within(chart()).getByTestId('aki-skipped-note')).toHaveTextContent('3 creatinine values measured under dialysis are not used for AKI detection; the point tooltips and the measurement table name them. This is separate from any exclusion from the fit.')
    expect(chart(CRP.label).querySelector('circle[data-aki-skipped]')).toBeNull()
    expect(within(chart(CRP.label)).queryByTestId('aki-skipped-note')).toBeNull()
    const table = screen.getByRole('table', { name: `Measurements ${CREA.label}`, hidden: true })
    expect(within(table).getByRole('columnheader', { name: 'AKI detection', hidden: true })).toBeInTheDocument()
    expect(within(table).getAllByText('Not used for AKI detection (dialysis)')).toHaveLength(3)
    expect(within(table).getAllByText('Fit disabled')).toHaveLength(12)
    expect(within(screen.getByRole('table', { name: `Measurements ${CRP.label}`, hidden: true })).queryByText('AKI detection')).toBeNull()
    display()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Events' }))
    const band = within(chart()).getByTestId('event-band')
    expect(band.querySelector('title')).toHaveTextContent('Patient ICU: CVVH, 05/03/2026 to 07/03/2026')
    // 05/03 and 07/03 on an axis from 01/03 to 12/03, in years since the first value.
    const x = (dayOfMonth: number) => 65 + (dayOfMonth - 1) / 11 * 565
    expect(Number(band.getAttribute('x'))).toBeCloseTo(x(5), 6)
    expect(Number(band.getAttribute('width'))).toBeCloseTo(x(7) - x(5), 6)
    expect(within(chart()).getByText(/Shaded: an event with an end date, from its start to its end\./)).toBeInTheDocument()
  })
  it('leaves the table without the column when no value was measured under dialysis', () => {
    render(<TrajectoriesWorkspace data={icu()} requestedPatientId="ICU" />)
    expect(within(screen.getByRole('table', { name: `Measurements ${CREA.label}`, hidden: true })).queryByText('AKI detection')).toBeNull()
    expect(within(chart()).queryByTestId('aki-skipped-note')).toBeNull()
  })
  it('widens the time range to the end of an interval that outlasts the measurements', () => {
    render(<TrajectoriesWorkspace data={icu([event('ICU', '2026-03-10', 'Ward', { endDate: day('2026-03-23') })])} requestedPatientId="ICU" />)
    display()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Events' }))
    const band = within(chart()).getByTestId('event-band')
    expect(Number(band.getAttribute('x')) + Number(band.getAttribute('width'))).toBeCloseTo(630, 6)
  })
})

describe('events in the measurement table (K17)', () => {
  it('lists events as set-off rows at their dates and sorts the event card by date', () => {
    const events = [event('ICU', '2026-03-04', 'Sepsis', { description: 'ward 3' }), event('ICU', '2026-02-20', 'Admission'), event('ICU', '2026-03-20', 'Discharge'), acuteDialysis]
    render(<TrajectoriesWorkspace data={icu(events)} requestedPatientId="ICU" />)
    const table = screen.getByRole('table', { name: `Measurements ${CREA.label}`, hidden: true })
    const rows = [...table.querySelectorAll('tbody tr')].map(row => `${row.getAttribute('data-testid') === 'event-row' ? 'E' : 'M'} ${row.querySelector('td')!.textContent}: ${row.querySelectorAll('td')[1].textContent}`)
    expect(rows.slice(0, 8)).toEqual([
      'E 20/02/2026: Event: Admission', 'M 01/03/2026: 0.9', 'M 02/03/2026: 1', 'M 03/03/2026: 1.9',
      'E 04/03/2026: Event: Sepsis (ward 3)', 'M 04/03/2026: 3.1', 'E 05/03/2026: Event: CVVH to 07/03/2026', 'M 05/03/2026: 4.6'])
    expect(rows.at(-1)).toBe('E 20/03/2026: Event: Discharge')
    expect(within(table).getAllByTestId('event-row')).toHaveLength(4)
    // The count in the summary stays the number of measurements.
    expect(screen.getByText('Show measurements (12)')).toBeInTheDocument()
    const card = screen.getByRole('heading', { name: 'Events for this patient' }).closest('section')!
    expect([...card.querySelectorAll('li')].map(item => item.textContent)).toEqual(['20/02/2026: Admission', '04/03/2026: Sepsis (ward 3)', '05/03/2026: CVVH to 07/03/2026', '20/03/2026: Discharge'])
  })
})

describe('Rolling OLS windows (K18)', () => {
  // One value at the start of every quarter, 2018-01-01 to 2022-01-01: flat at 60, then falling by 8 per year.
  const quarters = Array.from({ length: 17 }, (_, i) => `${2018 + Math.floor(i / 4)}-${String(1 + 3 * (i % 4)).padStart(2, '0')}-01`)
  const rows = quarters.map(date => lab('R', CREA, date, 60 - 8 * Math.max(0, (day(date).getTime() - day('2020-01-01').getTime()) / (365.25 * 86_400_000))))
  it('keeps every window with its bounds, count, slope and drawn line', () => {
    const [row] = buildCohortRows(rows, ['R'], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'rolling' }])
    const rolling = row.cells[0].rolling!
    expect(rolling.windows).toHaveLength(rolling.nWindows)
    expect(rolling.windows).toHaveLength(5)
    expect(rolling.windows.map(window => window.lineIndex)).toEqual([0, 1, 2, 3, 4])
    expect(row.cells[0].fitLines).toHaveLength(5)
    expect(rolling.windows[0]).toMatchObject({ start: day('2018-01-01'), end: day('2020-01-01'), firstDate: day('2018-01-01'), lastDate: day('2020-01-01'), n: 9 })
    expect(rolling.windows[0].slope).toBeCloseTo(0, 10)
    expect(Math.min(...rolling.windows.map(window => window.slope))).toBe(rolling.slopeMin)
    expect(Math.max(...rolling.windows.map(window => window.slope))).toBe(rolling.slopeMax)
  })
  it('lists the windows in the patient view, names each window line and exports the same rows', () => {
    render(<TrajectoriesWorkspace data={dataset(rows)} requestedPatientId="R" />)
    fireEvent.change(screen.getByLabelText(`Trend method: ${CREA.label}`), { target: { value: 'rolling-ols' } })
    fireEvent.click(screen.getByRole('checkbox', { name: `Analyse trend: ${CREA.label}` }))
    expect(screen.getByText('Show windows (5)')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Rolling OLS windows', hidden: true })
    const cells = [...table.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent))
    expect(cells).toHaveLength(5)
    expect(cells[0]).toEqual(['01/01/2018 to 01/01/2020', '01/01/2018', '01/01/2020', '9', '0'])
    expect(within(chart()).getByText('Dashed: Rolling OLS window lines from the prepared analyses; each line names its window.')).toBeInTheDocument()
    const titles = [...chart().querySelectorAll('polyline[data-fit-quality] title')].map(title => title.textContent)
    expect(titles).toHaveLength(5)
    expect(titles[0]).toBe('Rolling OLS window 01/01/2018 to 01/01/2020: 9 fitted measurements (01/01/2018 to 01/01/2020), slope 0 mg/dl/year')
  })
  // Review finding 2026-11-21: under quarterly medians (CKD progression) a
  // window is fitted on medians, and the list, tooltip and cell said "fitted
  // measurements" of them.
  describe('under quarterly medians', () => {
    // CRP, not creatinine: no AKI detection interferes. Three values per quarter on the 1st, 2nd and 3rd of its first month, from 2019-10-01: 48 values, 16 medians.
    const starts = Array.from({ length: 16 }, (_, i) => { const month = 9 + 3 * i; return `${2019 + Math.floor(month / 12)}-${String(1 + month % 12).padStart(2, '0')}` })
    const balanced = starts.flatMap((start, q) => [1, 2, 3].map(d => lab('M', CRP, `${start}-0${d}`, 60 - q + d)))
    const quarterly = () => ({ ...defaultFitSettings('ckd_progression'), fitModel: 'rolling-ols' as const })
    it('counts medians in the window, dated to their representative dates', () => {
      const [row] = buildCohortRows(balanced, ['M'], [{ bezeichnung: 'CRP', einheit: 'mg/l', mode: 'rolling', fitConfig: toFitConfig(quarterly(), CRP) }])
      const cell = row.cells[0]
      expect(cell.nNumeric).toBe(48)
      expect(cell.nFitted).toBe(16)
      expect(cell.rolling!.timeBalancing).toBe('quarterly-median')
      // 8 medians from 24 measurements; 2019-10-01 lies before the window start and is in the first median.
      expect(cell.rolling!.windows[0]).toMatchObject({ start: day('2019-10-02'), end: day('2021-10-01'), firstDate: day('2019-10-02'), lastDate: day('2021-07-02'), n: 8 })
      expect(buildCohortRows(rows, ['R'], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'rolling' }])[0].cells[0].rolling!.timeBalancing).toBe('raw')
    })
    it('says quarterly medians in the window list, the tooltip and the cell', () => {
      useAppStore.getState().setTrajectoryFitSettings({ shared: quarterly(), columns: {} })
      render(<TrajectoriesWorkspace data={dataset(balanced, [CRP])} requestedPatientId="M" />)
      fireEvent.click(screen.getByRole('checkbox', { name: `Analyse trend: ${CRP.label}` }))
      const table = screen.getByRole('table', { name: 'Rolling OLS windows', hidden: true })
      expect([...table.querySelectorAll('th')].map(cell => cell.textContent).slice(0, 4)).toEqual(['Window', 'Quarterly medians from', 'to', 'n'])
      expect([...table.querySelector('tbody tr')!.querySelectorAll('td')].map(cell => cell.textContent).slice(0, 4)).toEqual(['02/10/2019 to 01/10/2021', '02/10/2019', '02/07/2021', '8'])
      const details = table.closest('details')!
      expect(details).toHaveTextContent('Each fitted point is the median of one calendar quarter, dated to one of its measurement days: n counts medians, and a measurement outside the window bounds can enter through the median of its quarter.')
      const titles = [...chart(CRP.label).querySelectorAll('polyline[data-fit-quality] title')].map(title => title.textContent)
      expect(titles[0]).toMatch(/^Rolling OLS window 02\/10\/2019 to 01\/10\/2021: 8 quarterly medians \(02\/10\/2019 to 02\/07\/2021\), slope /)
      expect(document.body).not.toHaveTextContent(/\d+ fitted measurements \(/)
      expect(document.querySelector('[title*="with at least three quarterly medians"]')).not.toBeNull()
      expect(document.querySelector('[title*="with at least three fitted measurements"]')).toBeNull()
    })
    it('keeps "fitted measurements" without time balancing and explains the medians in the export', () => {
      render(<TrajectoriesWorkspace data={dataset(rows)} requestedPatientId="R" />)
      fireEvent.change(screen.getByLabelText(`Trend method: ${CREA.label}`), { target: { value: 'rolling-ols' } })
      fireEvent.click(screen.getByRole('checkbox', { name: `Analyse trend: ${CREA.label}` }))
      const table = screen.getByRole('table', { name: 'Rolling OLS windows', hidden: true })
      expect(table.querySelector('th:nth-child(2)')).toHaveTextContent('Fitted measurements from')
      expect(table.closest('details')).not.toHaveTextContent('median')
      const data = { ...dataset(balanced, [CRP]), analysis: { rows: balanced, messages: [], fitInputs: [] } } as unknown as WorkspaceData
      const workbook = XLSX.read(workspaceWorkbookBytes({ data, parameterKeys: [CRP.key], patientIds: ['M'], patientId: 'M',
        cohortRows: buildCohortRows(balanced, ['M'], [{ bezeichnung: 'CRP', einheit: 'mg/l', mode: 'rolling', fitConfig: toFitConfig(quarterly(), CRP) }]) }), { type: 'array' })
      expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.rolling_windows)[0]).toMatchObject({ window_start: '2019-10-02', first_date: '2019-10-02', last_date: '2021-07-02', n: 8 })
      const note = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.about).map(row => row.note).find(text => text?.startsWith('rolling_windows'))!
      expect(note).toContain('n counts medians and a measurement outside the window bounds can enter through the median of its period')
      expect(note).not.toContain('fitted measurement')
    })
  })
  it('exports the windows as the sheet after about, empty without a rolling column', () => {
    const data = { ...dataset(rows), analysis: { rows, messages: [], fitInputs: [] } } as unknown as WorkspaceData
    const workbook = (mode: 'rolling' | 'global') => XLSX.read(workspaceWorkbookBytes({ data, parameterKeys: [CREA.key], patientIds: ['R'], patientId: 'R',
      cohortRows: buildCohortRows(rows, ['R'], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode }]) }), { type: 'array' })
    const rolling = workbook('rolling')
    expect(rolling.SheetNames).toEqual(['measurements', 'raw_measurements', 'slopes', 'events', 'aki_episodes', 'patient_attributes', 'demographics', 'parameters', 'settings', 'about', 'rolling_windows'])
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(rolling.Sheets.rolling_windows)
    expect(records).toHaveLength(5)
    expect(Object.keys(records[0])).toEqual(['PatientID', 'Parameter', 'Unit', 'window', 'window_start', 'window_end', 'first_date', 'last_date', 'n', 'slope'])
    expect(records[4]).toMatchObject({ PatientID: 'R', Parameter: 'Kreatinin', Unit: 'mg/dl', window: 5, window_start: '2019-12-22', window_end: '2021-12-21', n: 8 })
    expect(records[4].slope).toBeCloseTo(-8, 1)
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(rolling.Sheets.about).some(row => String(row.note).startsWith('rolling_windows lists the fitted windows'))).toBe(true)
    const plain = workbook('global')
    expect(plain.SheetNames.at(-1)).toBe('rolling_windows')
    expect(XLSX.utils.sheet_to_json(plain.Sheets.rolling_windows)).toHaveLength(0)
  })
})

describe('density of a large overlay (K24)', () => {
  const cohort = (n: number) => dataset(Array.from({ length: n }, (_, i) => [lab(`P${String(i).padStart(3, '0')}`, CREA, '2026-01-01', 1 + i / 1000), lab(`P${String(i).padStart(3, '0')}`, CREA, '2026-07-01', 1.2 + i / 1000)]).flat())
  const overlay = (n: number) => { render(<TrajectoriesWorkspace data={cohort(n)} />); fireEvent.click(screen.getByRole('button', { name: 'Overlay' })) }
  const plot = () => chart().querySelector('svg.wt-plot')!
  const series = () => [...plot().querySelectorAll('.wt-series-layer > g')]
  it('draws 50 trajectories with their points', () => {
    overlay(50)
    expect(plot()).toHaveAttribute('data-density', '1')
    expect(plot().querySelectorAll('circle')).toHaveLength(100)
    expect(series()[0]).toHaveAttribute('opacity', '0.6')
    expect(within(chart()).queryByTestId('density-note')).toBeNull()
    display()
    expect(screen.getByRole('checkbox', { name: 'Measurement points' })).toBeChecked()
  })
  it('hides the points and draws paler lines from 51 trajectories, and the switch takes precedence', () => {
    overlay(51)
    expect(plot()).toHaveAttribute('data-density', '2')
    expect(plot().querySelectorAll('circle')).toHaveLength(0)
    expect(series()[0]).toHaveAttribute('opacity', '0.4')
    expect(series()[0].querySelector('polyline')).toHaveAttribute('stroke-width', '1.5')
    expect(within(chart()).getByTestId('density-note')).toHaveTextContent('51 trajectories in this chart: lines are drawn paler and measurement points are hidden. Search, a group filter or a selection narrows the overlay; Display → “Measurement points” shows the points. Numbers and table exports are unchanged.')
    expect(plot().getAttribute('data-export-context')).toContain('measurement points hidden in this dense overlay')
    display()
    const points = screen.getByRole('checkbox', { name: 'Measurement points' })
    expect(points).not.toBeChecked()
    fireEvent.click(points)
    expect(points).toBeChecked()
    expect(plot().querySelectorAll('circle')).toHaveLength(102)
    expect(within(chart()).getByTestId('density-note')).toHaveTextContent('51 trajectories in this chart: lines are drawn paler. Search, a group filter or a selection narrows the overlay. Numbers and table exports are unchanged.')
    fireEvent.click(points)
    expect(points).not.toBeChecked()
    expect(plot().querySelectorAll('circle')).toHaveLength(0)
    // The saved switch is the user's own choice, not the automatic state.
    expect(useAppStore.getState().trajectoryView.display.points).toBe(false)
  })
  it('does not store the automatic state as the switch and shows points again in the patient view', () => {
    overlay(51)
    expect(useAppStore.getState().trajectoryView.display.points ?? true).toBe(true)
    expect(useAppStore.getState().trajectoryView.pointsChosen).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Individual patient' }))
    expect(chart().querySelectorAll('svg.wt-plot circle')).toHaveLength(2)
  })
  it('keeps the points of a dense overlay when only the connecting lines are switched off', () => {
    overlay(51)
    display()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Connecting lines' }))
    expect(plot().querySelectorAll('polyline')).toHaveLength(0)
    expect(plot().querySelectorAll('circle')).toHaveLength(102)
    expect(screen.getByRole('checkbox', { name: 'Measurement points' })).toBeChecked()
    expect(within(chart()).queryByText('Measurement points and connecting lines are hidden.')).toBeNull()
    expect(within(chart()).getByTestId('density-note')).toHaveTextContent('51 trajectories in this chart: lines are drawn paler. Search, a group filter or a selection narrows the overlay. Numbers and table exports are unchanged.')
    // Back on, the density rule applies again: the switch itself was never touched.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Connecting lines' }))
    expect(plot().querySelectorAll('circle')).toHaveLength(0)
  })
  it('keeps the points when saved settings without connecting lines meet a large cohort', () => {
    useAppStore.setState({ trajectoryView: { ...defaultTrajectoryView(), display: { connect: false } } })
    overlay(51)
    expect(plot().querySelectorAll('circle')).toHaveLength(102)
  })
  it('decides per chart: a chart with few trajectories keeps its points in a large cohort', () => {
    const rows = cohort(60).rows
    render(<TrajectoriesWorkspace data={dataset([...rows, ...Array.from({ length: 5 }, (_, i) => [lab(`P00${i}`, CRP, '2026-01-01', 3 + i), lab(`P00${i}`, CRP, '2026-07-01', 4 + i)]).flat()], [CREA, CRP])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    const sparse = chart(CRP.label)
    expect(sparse.querySelector('svg.wt-plot')).toHaveAttribute('data-density', '0')
    expect(sparse.querySelectorAll('svg.wt-plot circle')).toHaveLength(10)
    expect(within(sparse).queryByTestId('density-note')).toBeNull()
    expect(sparse.querySelector('svg.wt-plot')!.getAttribute('data-export-context')).not.toContain('measurement points hidden')
    expect(plot()).toHaveAttribute('data-density', '2')
    expect(plot().querySelectorAll('circle')).toHaveLength(0)
    // One chart still hides its points by the rule, so the switch is shown off.
    display()
    expect(screen.getByRole('checkbox', { name: 'Measurement points' })).not.toBeChecked()
  })
  it('keeps the switched choice with the view, so it holds after the page is opened again', () => {
    const data = cohort(51)
    const first = render(<TrajectoriesWorkspace data={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
    display()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Measurement points' }))
    expect(useAppStore.getState().trajectoryView).toMatchObject({ pointsChosen: true, display: { points: true } })
    const saved = { version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: useAppStore.getState().trajectoryView }
    first.unmount()
    const restored = restoreSavedSettings(JSON.parse(JSON.stringify(saved)), new Set([CREA.key]))
    expect(restored.notRestored).toEqual([])
    expect(restored.trajectoryView.pointsChosen).toBe(true)
    useAppStore.setState({ trajectoryView: restored.trajectoryView })
    overlay(51)
    expect(plot().querySelectorAll('circle')).toHaveLength(102)
    display()
    expect(screen.getByRole('checkbox', { name: 'Measurement points' })).toBeChecked()
  })
  it('names a stored points choice that is not valid and falls back to the density rule', () => {
    const saved = { version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: { ...defaultTrajectoryView(), pointsChosen: 'yes' } }
    const restored = restoreSavedSettings(JSON.parse(JSON.stringify(saved)), new Set())
    expect(restored.notRestored).toEqual(['measurement points choice'])
    expect(restored.trajectoryView.pointsChosen).toBeUndefined()
  })
  it('keeps the first level up to 200 trajectories', () => {
    overlay(200)
    expect(plot()).toHaveAttribute('data-density', '2')
    expect(series()[0].querySelector('polyline')).toHaveAttribute('stroke-width', '1.5')
  })
  it('draws thinner and paler lines from 201 trajectories', () => {
    overlay(201)
    expect(plot()).toHaveAttribute('data-density', '3')
    expect(series()[0]).toHaveAttribute('opacity', '0.25')
    expect(series()[0].querySelector('polyline')).toHaveAttribute('stroke-width', '0.8')
    expect(within(chart()).getByTestId('density-note')).toHaveTextContent('201 trajectories in this chart: lines are drawn paler and thinner and measurement points are hidden.')
  })
  it('emphasises the hovered trajectory as a layer on top and dims the others as one layer', () => {
    overlay(51)
    const target = series()[7]
    expect(plot().querySelector('.wt-series-layer')).not.toHaveAttribute('opacity')
    expect(plot().querySelector('use')).toBeNull()
    fireEvent.mouseEnter(target.querySelector('[role=button]')!)
    expect(plot().querySelector('.wt-series-layer')).toHaveAttribute('opacity', '0.4')
    expect(series()[7]).toBe(target)
    expect(target).not.toHaveAttribute('opacity')
    expect(target.querySelector('polyline')).toHaveAttribute('stroke-width', '3')
    expect(series()[6]).toHaveAttribute('opacity', '0.4')
    const top = plot().querySelector('use.wt-emphasis-layer')!
    expect(top).toHaveAttribute('href', `#${target.id}`)
    expect(top).toHaveAttribute('pointer-events', 'none')
    expect(within(chart()).getByTestId('emphasised-patient')).toHaveTextContent('Patient P007')
    fireEvent.mouseLeave(target.querySelector('[role=button]')!)
    expect(plot().querySelector('use')).toBeNull()
  })
})
