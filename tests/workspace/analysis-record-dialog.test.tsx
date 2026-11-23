import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { setLanguage } from '../../src/i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalysisRecordDialog } from '../../src/workspace/AnalysisRecord'
import { useAppStore } from '../../src/workspace/state/store'
import { defaultFitSettings } from '../../src/workspace/workspace-analysis'
import { trajectoryColumnSettings } from '../../src/workspace/trajectory-ui/analysis'
import { workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { exportFixture } from './export-fixture'

for (const method of ['showModal', 'close'] as const) {
  if (!HTMLDialogElement.prototype[method]) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value() {} })
}

beforeEach(() => {
  useAppStore.getState().reset()
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

function renderRecord(overrides: Partial<Parameters<typeof AnalysisRecordDialog>[0]> = {}) {
  const { data } = exportFixture()
  const props = {
    data, parameters: data.parameters.slice(0, 2), trendKeys: ['marker'], logKeys: [] as string[], groupBy: '',
    onClose: vi.fn(), onChange: vi.fn(), onApplyView: vi.fn(), ...overrides,
  }
  render(<AnalysisRecordDialog {...props} />)
  return props
}

describe('analysis record dialog', () => {
  it('shows every page, marks changed values with their default and leads to the control', () => {
    useAppStore.getState().setTrajectoryFitSettings({ shared: defaultFitSettings('theil_sen'), columns: {} })
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')
    const props = renderRecord()
    const dialog = screen.getByRole('dialog', { name: 'Analysis record' })
    for (const name of ['Data', 'Trajectories: shared settings', 'Trajectories: Marker|one (mg/L)', 'Cohort models', 'Versions', 'Apply settings from an export']) {
      expect(within(dialog).getByRole('region', { name })).toBeInTheDocument()
    }
    const data = within(dialog).getByRole('region', { name: 'Data' })
    expect(within(data).getByText('CKD-EPI 2021')).toBeInTheDocument()
    expect(within(data).getByText('Default: Off')).toBeInTheDocument()
    const shared = within(dialog).getByRole('region', { name: 'Trajectories: shared settings' })
    expect(within(shared).getByText('Theil–Sen')).toBeInTheDocument()
    // Trend starts off: on for the first parameter is a change, off for the second is not.
    const first = within(dialog).getByRole('region', { name: 'Trajectories: Marker|one (mg/L)' })
    expect(within(first).getByText('(changed)')).toBeInTheDocument()
    const second = within(dialog).getByRole('region', { name: 'Trajectories: Marker|one (g/L)' })
    expect(within(second).queryByText('(changed)')).not.toBeInTheDocument()
    fireEvent.click(within(shared).getByRole('button', { name: 'Change Fit model (Trajectories: shared settings)' }))
    expect(props.onClose).toHaveBeenCalled()
    expect(props.onChange).toHaveBeenCalledWith({ page: 'Trajectories', target: 'analysis' }, undefined, 'Fit model')
    fireEvent.click(within(data).getByRole('button', { name: 'Change eGFR formula (Data)' }))
    expect(props.onChange).toHaveBeenLastCalledWith({ page: 'Data', target: 'egfr' }, undefined, 'eGFR formula')
    expect(within(dialog).getByRole('region', { name: 'Versions' })).toHaveTextContent(/Lab Trajectory Explorer\s*\d+\.\d+\.\d+/)
  })

  it('applies the settings of an exported workbook and lists what it could not apply', async () => {
    const input = exportFixture()
    const parameters = input.parameterKeys.map(key => input.data.parameters.find(p => p.key === key)!)
    const settings = { shared: defaultFitSettings('theil_sen'), columns: { marker: { ...defaultFitSettings(), presetId: 'custom', timeBalancing: 'monthly-median' as const } } }
    const bytes = workspaceWorkbookBytes({ ...input, ...trajectoryColumnSettings(settings, parameters, ['marker']) })
    // The loaded dataset lacks the exported parameter "derived".
    const props = renderRecord({ data: { ...input.data, parameters: input.data.parameters.filter(p => p.key !== 'derived') } })
    const file = new File([bytes as Uint8Array<ArrayBuffer>], 'cohort.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(screen.getByLabelText('Apply settings from an exported workbook'), { target: { files: [file] } })
    const report = await screen.findByRole('status')
    expect(report).toHaveTextContent('cohort.xlsx')
    expect(within(report).getByText(/^settings of Derived eGFR .*ml\/min\/1.73m2.* \(parameter not in this dataset\)$/)).toBeInTheDocument()
    expect(report).toHaveTextContent('creatinine source Creatinine')
    await waitFor(() => expect(useAppStore.getState().trajectoryFitSettings).toEqual(settings))
    expect(useAppStore.getState().analysisSettings.egfr.formula).toBe('ekfc-2021')
    expect(props.onApplyView).toHaveBeenCalledWith(['marker'], ['marker'], [])
  })

  it('refuses a file that is not an export of this app', async () => {
    renderRecord()
    fireEvent.change(screen.getByLabelText('Apply settings from an exported workbook'), { target: { files: [new File(['PatientID,Date\n1,2024-01-01'], 'labs.csv')] } })
    expect(await screen.findByRole('status')).toHaveTextContent('labs.csv: This file has no settings sheet')
  })

  // Code review of the language switch (issue #71).
  it('translates fixed labels but shows an imported attribute name verbatim, also when it matches a catalog text', () => {
    act(() => setLanguage('de'))
    renderRecord({ groupBy: 'Sex' })
    const table = screen.getByRole('region', { name: 'Verläufe: Tabelle' })
    expect(within(table).getByText('Gruppieren nach')).toBeInTheDocument()
    // "Sex" is the imported attribute name here, not the app's label.
    expect(within(table).getByText('Sex')).toBeInTheDocument()
    expect(within(table).queryByText('Geschlecht')).not.toBeInTheDocument()
    expect(within(table).getByText('Standard: Keine Gruppierung')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Versionen' })).toHaveTextContent(/Lab Trajectory Explorer\s*\d+\.\d+\.\d+/)
  })

  it('shows the report of an applied file and a refusal in the language of the moment', async () => {
    renderRecord()
    fireEvent.change(screen.getByLabelText('Apply settings from an exported workbook'), { target: { files: [new File(['PatientID,Date\n1,2024-01-01'], 'labs.csv')] } })
    expect(await screen.findByRole('status')).toHaveTextContent('labs.csv: This file has no settings sheet')
    act(() => setLanguage('de'))
    expect(screen.getByRole('status')).not.toHaveTextContent('This file has no settings sheet')
  })

  it('composes the applied-settings report in each language', async () => {
    const input = exportFixture()
    const bytes = workspaceWorkbookBytes(input)
    renderRecord({ data: { ...input.data, parameters: input.data.parameters.filter(p => p.key !== 'derived') } })
    const file = new File([bytes as Uint8Array<ArrayBuffer>], 'cohort.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(screen.getByLabelText('Apply settings from an exported workbook'), { target: { files: [file] } })
    const report = await screen.findByRole('status')
    expect(report).toHaveTextContent('(parameter not in this dataset)')
    act(() => setLanguage('de'))
    expect(report).toHaveTextContent('(Parameter nicht in diesem Datensatz)')
    expect(report).not.toHaveTextContent('(parameter not in this dataset)')
  })
})
