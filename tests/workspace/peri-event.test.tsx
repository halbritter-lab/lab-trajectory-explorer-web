import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { read, utils } from 'xlsx'
import { DataWorkspace } from '../../src/workspace/DataWorkspace'
import { useAppStore } from '../../src/workspace/state/store'
import { workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { periEventExportRows, periEventNotes, periEventStatusLabel } from '../../src/workspace/peri-event'
import { periEventCreatinine } from '../../src/core/domains/nephrology/aki/periEvent'
import type { ClinicalEvent } from '../../src/core/events/events'
import type { LabRow } from '../../src/core/types'
import { exportFixture } from './export-fixture'

beforeEach(() => {
  useAppStore.getState().reset()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(cleanup)

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const lab = (date: string, value: number, patientId = 'P-01'): LabRow => ({ patientId, labDatum: day(date), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null })
const event = (date: string, title: string, patientId = 'P-01'): ClinicalEvent => ({ patientId, type: 'other', date: day(date), title, description: null, endDate: null, intent: null, warning: '' })
/** The worked example of the method reference (aki.md, peri-event creatinine). */
const rows = [lab('2026-03-01', 0.9), lab('2026-03-03', 1.0), lab('2026-03-04', 1.2), lab('2026-03-05', 1.35), lab('2026-03-06', 1.6)]
const events = [event('2026-03-03', 'Contrast CT'), event('2026-03-04', 'Cardiac catheterisation'), event('2026-02-01', 'Visit')]

describe('creatinine after selected events on the Data page (issue #69)', () => {
  it('lists one row per selected event, states the day resolution and switches the window', () => {
    useAppStore.getState().replaceDataset({ rows, events })
    render(<DataWorkspace onBrowse={vi.fn()} />)
    expect(screen.getByText('Creatinine after selected events (none selected)')).toBeInTheDocument()
    expect(screen.getByText(/Event dates have no time of day, so the window is counted in calendar days/)).toBeInTheDocument()
    const select = screen.getByLabelText('Events for the creatinine analysis') as HTMLSelectElement
    expect([...select.options].map(option => option.textContent)).toEqual(['None', 'Title: Cardiac catheterisation', 'Title: Contrast CT', 'Title: Visit', 'Type: other'])
    fireEvent.change(select, { target: { value: 'title:Contrast CT' } })
    expect(useAppStore.getState().periEventSettings).toEqual({ rule: { kind: 'title', value: 'Contrast CT' }, windowHours: 48 })
    const table = screen.getByRole('table', { name: 'Creatinine after selected events' })
    const cells = () => within(table).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell').map(cell => cell.textContent))
    expect(cells()).toEqual([['03/03/2026 Contrast CT (other)', '1 on 03/03/2026', '1.35 on 05/03/2026', '0.35', '1.35 ×', 'Met: rise ≥ 0.3 mg/dl', 'Kreatinin [mg/dl]', '–']])
    fireEvent.change(screen.getByLabelText('Window after the event'), { target: { value: '72' } })
    expect(cells()[0].slice(2, 6)).toEqual(['1.6 on 06/03/2026', '0.6', '1.6 ×', 'Met: rise ≥ 0.3 mg/dl and to ≥ 1.5 times baseline'])
    fireEvent.change(select, { target: { value: 'type:other' } })
    expect(screen.getByText('3 events: criterion met for 2, not met for 0, not evaluable for 1.')).toBeInTheDocument()
    expect(cells().map(row => [row[0], row[5], row[7]])).toEqual([
      ['01/02/2026 Visit (other)', 'Not evaluable: no value on or before the event day', '–'],
      ['03/03/2026 Contrast CT (other)', 'Met: rise ≥ 0.3 mg/dl and to ≥ 1.5 times baseline', '1 other selected event within 3 days'],
      ['04/03/2026 Cardiac catheterisation (other)', 'Met: rise ≥ 0.3 mg/dl', '1 other selected event within 3 days'],
    ])
    fireEvent.change(select, { target: { value: '' } })
    expect(useAppStore.getState().periEventSettings).toBeNull()
    expect(screen.getByText('No events selected.')).toBeInTheDocument()
  })

  it('recomputes no analysis and keeps fitted cohort models when the selection changes', () => {
    useAppStore.getState().replaceDataset({ rows, events })
    const results = { cohort: {} } as never
    useAppStore.setState({ cohortModelResults: results })
    const { analysisSettings } = useAppStore.getState()
    const analysis = useAppStore.getState().analysisResult()
    useAppStore.getState().setPeriEventSettings({ rule: { kind: 'title', value: 'Contrast CT' }, windowHours: 72 })
    expect(useAppStore.getState().cohortModelResults).toBe(results)
    expect(useAppStore.getState().analysisSettings).toBe(analysisSettings)
    expect(useAppStore.getState().analysisResult()).toBe(analysis)
    // A new dataset starts without a selection.
    useAppStore.getState().replaceDataset({ rows, events })
    expect(useAppStore.getState().periEventSettings).toBeNull()
  })
})

describe('peri_event_creatinine sheet', () => {
  it('is empty while no events are selected and holds one row per event of the exported patients otherwise', () => {
    const empty = read(workspaceWorkbookBytes(exportFixture()))
    expect(empty.SheetNames.at(-1)).toBe('peri_event_creatinine')
    expect(utils.sheet_to_json(empty.Sheets.peri_event_creatinine)).toEqual([])
    expect(utils.sheet_to_json<Record<string, unknown>>(empty.Sheets.settings).every(row => (row.peri_event_creatinine ?? '') === '')).toBe(true)
    const selection = { rule: { kind: 'type', value: 'other' }, windowHours: 48 } as const
    const workbook = read(workspaceWorkbookBytes({ ...exportFixture(), patientIds: ['001-A'], periEventSettings: selection }))
    const sheet = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.peri_event_creatinine)
    expect(sheet.map(row => [row.PatientID, row.event_title, row.event_rule, row.window_hours, row.status])).toEqual([['001-A', 'Visit', 'type:other', 48, sheet[0].status]])
    expect(JSON.stringify(sheet)).not.toContain('SECRET')
    expect(JSON.parse(String(utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.settings)[0].peri_event_creatinine))).toEqual(selection)
  })

  it('writes the worked example with its values, criterion and notes', () => {
    const results = periEventCreatinine(rows, events, { rule: { kind: 'type', value: 'other' }, windowHours: 48 })
    const [visit, contrast, catheter] = periEventExportRows(results, { kind: 'type', value: 'other' })
    expect(visit).toMatchObject({ status: 'not_evaluable', reason: 'no_baseline', criterion_met: null, baseline_value_mg_dl: null, peak_value_mg_dl: null, window_end_date: '2026-02-03' })
    expect(contrast).toMatchObject({ event_date: '2026-03-03', baseline_date: '2026-03-03', baseline_value_mg_dl: 1.0, baseline_days_before_event: 0, peak_date: '2026-03-05', peak_value_mg_dl: 1.35, n_window_values: 2, criterion_met: true, criterion: 'absolute_0_3_mg_dl', status: 'met', overlapping_events: 1 })
    expect(contrast.absolute_rise_mg_dl).toBeCloseTo(0.35, 12)
    expect(catheter).toMatchObject({ baseline_value_mg_dl: 1.2, peak_value_mg_dl: 1.6, criterion: 'absolute_0_3_mg_dl', window_end_date: '2026-03-06' })
    expect(catheter.ratio_to_baseline).toBeCloseTo(1.3333, 4)
    expect(periEventStatusLabel(results[0])).toBe('Not evaluable: no value on or before the event day')
    expect(periEventNotes(results[1])).toBe('1 other selected event within 2 days')
  })
})
