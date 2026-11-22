import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrajectoriesWorkspace } from '../../src/workspace/TrajectoriesWorkspace'
import type { WorkspaceData } from '../../src/workspace/workspace-data'
import type { LabRow } from '../../src/core/types'
import type { ClinicalEvent } from '../../src/core/events/events'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { useAppStore } from '../../src/workspace/state/store'
import { workspaceWorkbookSheets } from '../../src/workspace/workspace-export'
import { logTickLabels, logTicks } from '../../src/workspace/plot-ticks'
import { doublingTimeText } from '../../src/workspace/labels/doublingTime'
import { restoreSavedSettings, SAVED_SETTINGS_VERSION, defaultTrajectoryView } from '../../src/workspace/saved-settings'
import { defaultTrajectoryFitSettings } from '../../src/workspace/workspace-analysis'
import { generalExplorationConfig } from '../../src/core/analysis/fitConfig'

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
const param = (name: string, unit: string) => ({ key: JSON.stringify([name, unit]), label: `${name} [${unit}]`, bezeichnung: name, einheit: unit, derived: false })
const CEA = param('CEA', 'ng/ml')
const lab = (patientId: string, parameter: typeof CEA, date: string, value: number): LabRow => ({ patientId, labDatum: day(date), bezeichnung: parameter.bezeichnung, einheit: parameter.einheit, wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: 50 })
const event = (patientId: string, date: string, title: string, extra: Partial<ClinicalEvent> = {}): ClinicalEvent => ({ patientId, type: 'other', date: day(date), title, description: null, endDate: null, intent: null, warning: '', ...extra } as ClinicalEvent)
function dataset(rows: LabRow[], parameters = [CEA], events: ClinicalEvent[] = []): WorkspaceData {
  const patients = [...new Set(rows.map(row => String(row.patientId)))].map(id => ({ id, label: id, attributes: {}, baselineAge: 50 }))
  return { rawRows: rows, rows, fileName: 'markers.csv', parameters, patients, events, patientAttributes: {}, analysis: { rows, messages: [], fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
}
/** The worked example of the method reference, and a falling series with a zero. */
const cea = [['2021-01-04', 2.0], ['2021-07-05', 2.6], ['2022-01-03', 3.9], ['2022-07-04', 5.1], ['2023-01-02', 7.8]] as const
const rows = () => [
  ...cea.map(([date, value]) => lab('A', CEA, date, value)),
  ...[['2021-01-04', 40], ['2021-07-05', 20], ['2022-01-03', 10], ['2022-07-04', 0]].map(([date, value]) => lab('B', CEA, date as string, value as number)),
]
const sparkline = (patient: string) => screen.getByRole('img', { name: new RegExp(`patient ${patient}, CEA`) })

describe('logarithmic ticks', () => {
  it('uses powers of ten, then 1-2-5, then linear ticks inside a decade', () => {
    expect(logTicks(0.5, 2000)).toEqual([1, 10, 100, 1000])
    expect(logTicks(1.5, 40)).toEqual([2, 5, 10, 20])
    expect(logTicks(2.1, 4.9)).toEqual([3, 4])
    expect(logTickLabels([0.002, 0.01, 1000])).toEqual(['0.002', '0.01', '1,000'])
  })
})

describe('doubling time wording', () => {
  const cell = (fitModel: 'ols' | 'none') => buildCohortRows(rows(), ['A', 'B'], [{ bezeichnung: 'CEA', einheit: 'ng/ml', mode: 'global', fitConfig: { ...generalExplorationConfig(CEA), fitModel }, logTrend: true }])
  it('names doubling and halving, the interval and values left out', () => {
    const [a, b] = cell('ols')
    expect(doublingTimeText(a.cells[0])).toMatchObject({ short: 'doubles in 1.02 y', uncertain: false })
    expect(doublingTimeText(a.cells[0])!.long).toBe('Doubling time 1.02 years (95% CI 0.888 to 1.19 years): ln 2 divided by the OLS slope of the natural logarithm of the values, 0.681 per year, from 5 fitted points over 728 days.')
    const falling = doublingTimeText(b.cells[0])!
    expect(falling.short).toBe('halves in 0.498 y')
    expect(falling.long).toContain('1 value of zero or less left out (no logarithm).')
    // Three dates over 364 days: the reliability rule marks it.
    expect(falling.uncertain).toBe(true)
  })
  it('gives no time without a fit', () => {
    expect(doublingTimeText(cell('none')[0].cells[0])).toMatchObject({ short: null, long: 'No doubling time: the fit model is disabled.' })
  })
})

describe('logarithmic axis in the Trajectories table', () => {
  it('switches the column to a log axis and shows the doubling time with a trend', () => {
    render(<TrajectoriesWorkspace data={dataset(rows())} />)
    expect(sparkline('A')).toHaveAttribute('data-y-scale', 'linear')
    expect(sparkline('A')).toHaveAttribute('data-y-min', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Logarithmic value axis: CEA [ng/ml]' }))
    expect(screen.getByRole('button', { name: 'Logarithmic value axis: CEA [ng/ml]' })).toHaveAttribute('aria-pressed', 'true')
    expect(sparkline('A')).toHaveAttribute('data-y-scale', 'log')
    // The shared positive range of the column, not widened to zero.
    expect(sparkline('A')).toHaveAttribute('data-y-min', '2')
    expect(screen.queryByTestId('doubling-time')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Analyse trend: CEA [ng/ml]' }))
    expect(screen.getAllByTestId('doubling-time').map(node => node.textContent)).toEqual(['doubles in 1.02 y', 'halves in 0.498 y (uncertain)'])
    expect(useAppStore.getState().trajectoryView.logKeys).toEqual([CEA.key])
  })

  it('draws the patient chart on a log axis without the values of zero or less', () => {
    render(<TrajectoriesWorkspace data={dataset(rows())} requestedPatientId="B" />)
    fireEvent.click(screen.getByRole('button', { name: 'Logarithmic value axis: CEA [ng/ml]' }))
    const chart = screen.getByRole('region', { name: 'Chart CEA [ng/ml]' })
    expect(chart.querySelector('svg.wt-plot')).toHaveAttribute('data-y-scale', 'log')
    expect(within(chart).getByTestId('log-axis-note')).toHaveTextContent('1 value of zero or less is not drawn and left out of the doubling time.')
    expect(chart.querySelectorAll('.wt-chart-person circle')).toHaveLength(3)
  })
})

describe('events in the table charts', () => {
  it('draws event lines and end-date bands under the Events switch', () => {
    const events = [event('A', '2021-10-01', 'Chemotherapy start'), event('A', '2022-03-01', 'Stay', { endDate: day('2022-04-15') }), event('A', '2019-01-01', 'Before the series')]
    render(<TrajectoriesWorkspace data={dataset(rows(), [CEA], events)} />)
    expect(sparkline('A').querySelectorAll('[data-testid="spark-event-line"]')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Display' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /^Events/ }))
    expect(sparkline('A').querySelectorAll('[data-testid="spark-event-line"]')).toHaveLength(2)
    expect(sparkline('A').querySelectorAll('[data-testid="spark-event-band"]')).toHaveLength(1)
    expect(sparkline('A')).toHaveAccessibleName(/; 2 events$/)
    expect(sparkline('B').querySelectorAll('[data-testid="spark-event-line"]')).toHaveLength(0)
  })
})

describe('parameter columns', () => {
  it('selects three by default and shows more than three when chosen', () => {
    const parameters = ['A', 'B', 'C', 'D', 'E'].map(name => param(name, 'u'))
    render(<TrajectoriesWorkspace data={dataset(parameters.map(p => lab('P', p, '2022-01-01', 1)), parameters)} />)
    expect(screen.getByRole('button', { name: /^Parameters/ })).toHaveTextContent('3')
    fireEvent.click(screen.getByRole('button', { name: /^Parameters/ }))
    const dialog = document.querySelector('dialog')!
    fireEvent.click(within(dialog).getByRole('button', { name: 'All parameters', hidden: true }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply', hidden: true }))
    expect(screen.getByRole('button', { name: /^Parameters/ })).toHaveTextContent('5')
    for (const p of parameters) expect(screen.getByRole('img', { name: new RegExp(`patient P, ${p.bezeichnung} \\[u\\]`) })).toBeInTheDocument()
  })
})

describe('export and saved view', () => {
  const input = (logTrend: boolean) => {
    const data = dataset(rows())
    const cohortRows = buildCohortRows(data.rows, ['A', 'B'], [{ bezeichnung: 'CEA', einheit: 'ng/ml', mode: 'global', fitConfig: generalExplorationConfig(CEA), ...(logTrend ? { logTrend } : {}) }])
    return workspaceWorkbookSheets({ data, parameterKeys: [CEA.key], patientIds: ['A', 'B'], cohortRows, exportedAt: new Date(0), exportId: 'x' })
  }
  it('adds the log_trend sheet and its note only with a logarithmic column', () => {
    const off = input(false), on = input(true)
    expect(off.map(sheet => sheet.name)).not.toContain('log_trend')
    expect(on.map(sheet => sheet.name)).toEqual([...off.map(sheet => sheet.name), 'log_trend'])
    expect(on.slice(0, -1).filter(sheet => sheet.name !== 'about')).toEqual(off.filter(sheet => sheet.name !== 'about'))
    const about = (sheets: typeof on) => sheets.find(sheet => sheet.name === 'about')!.rows
    expect(about(on)).toHaveLength(about(off).length + 1)
    const sheet = on.at(-1)! as unknown as { rows: Record<string, unknown>[] }
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[0]).toMatchObject({ PatientID: 'A', n_fitted: 5, n_non_positive: 0, index_date: '2021-01-04', unstable_slope: '' })
    expect(sheet.rows[0].doubling_time_years as number).toBeCloseTo(1.0171, 4)
    expect(sheet.rows[0].doubling_time_ci_low as number).toBeCloseTo(0.8878, 4)
    expect(sheet.rows[1]).toMatchObject({ PatientID: 'B', n_fitted: 3, n_non_positive: 1, unstable_slope: 'yes' })
    expect(sheet.rows[1].doubling_time_years as number).toBeLessThan(0)
  })
  it('restores the log columns of a saved view', () => {
    const saved = (logKeys: unknown) => ({ version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: { ...defaultTrajectoryView(), logKeys } })
    expect(restoreSavedSettings(saved([CEA.key, 'gone']), new Set([CEA.key])).trajectoryView.logKeys).toEqual([CEA.key])
    expect(restoreSavedSettings(saved(undefined), new Set([CEA.key])).trajectoryView.logKeys).toBeUndefined()
    expect(restoreSavedSettings(saved(7), new Set([CEA.key])).notRestored).toContain('log axis choices')
  })
})
