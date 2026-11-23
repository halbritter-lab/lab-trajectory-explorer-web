import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { draftMergeProblem, WorkspaceSeriesMerge } from '../../src/workspace/WorkspaceSeriesMerge'
import { comparisonSeries, SeriesComparison } from '../../src/workspace/SeriesComparison'
import { PatientMeasurementTable } from '../../src/workspace/PatientMeasurementTable'
import { buildWorkspaceData, type WorkspaceData } from '../../src/workspace/workspace-data'
import { applyExportedSettings, type ApplyTarget, type ExportedSettings } from '../../src/workspace/exported-settings'
import { defaultFitSettings } from '../../src/workspace/workspace-analysis'
import { useAppStore } from '../../src/workspace/state/store'
import { defaultAnalysisSettings } from '../../src/core/analysis/registry'
import type { SeriesMerge } from '../../src/core/analysis/seriesMerge'
import type { LabRow } from '../../src/core/types'

const lab = (day: string, value: number, name = 'Kreatinin', unit = 'mg/dl', extra: Partial<LabRow> = {}): LabRow =>
  ({ patientId: 'P1', labDatum: new Date(`${day}T00:00:00Z`), bezeichnung: name, einheit: unit, wert: String(value).replace('.', ','), wertNum: value, wertOperator: '=', loinc: '2160-0', patientSex: 'm', patientAgeAtLab: 50, ...extra })

const rows: LabRow[] = [
  lab('2020-01-01', 1.0, 'Kreatinin', 'mg/dl', { labMethod: 'Jaffe' }), lab('2021-01-01', 1.2, 'Kreatinin', 'mg/dl', { labMethod: 'Jaffe' }),
  lab('2020-06-01', 80, 'Kreatinin', 'µmol/l', { labMethod: 'enzymatic' }), lab('2021-06-01', 90, 'Kreatinin', 'µmol/l', { labMethod: 'enzymatic' }),
  lab('2020-01-01', 14, 'Hb', 'g/dl', { loinc: null }),
]
const merge: SeriesMerge = { name: 'Kreatinin (merged)', unit: 'mg/dl', sources: [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, { bezeichnung: 'Kreatinin', einheit: 'µmol/l' }] }

function workspaceData(merges: SeriesMerge[] = []): WorkspaceData {
  const analysisSettings = { ...defaultAnalysisSettings(), seriesMerge: { merges } }
  useAppStore.getState().replaceDataset({ rows, analysisSettings })
  return buildWorkspaceData({ rows, fileName: 'x.csv', events: [], patientAttributes: {}, analysisSettings, manualDemographics: {} }, useAppStore.getState().analysisResult())
}

beforeEach(() => useAppStore.getState().reset())

describe('Data page: Merge series', () => {
  it('suggests by LOINC, merges only on the button and lists the merge with its counts', () => {
    const { rerender } = render(<WorkspaceSeriesMerge data={workspaceData()} />)
    const button = screen.getByRole('button', { name: 'Merge selected series' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Choose series by LOINC code'), { target: { value: '2160-0' } })
    // The code ticks the two creatinine series but merges nothing.
    expect(useAppStore.getState().analysisSettings.seriesMerge.merges).toEqual([])
    const options = within(screen.getByRole('group', { name: 'Series to merge' }))
    expect(options.getByLabelText(/Kreatinin \[mg\/dl\]/)).toBeChecked()
    expect(options.getByLabelText(/Kreatinin \[µmol\/l\]/)).toBeChecked()
    expect(options.getByLabelText(/Hb \[g\/dl\]/)).not.toBeChecked()
    expect(screen.getByLabelText('Name of the merged series')).toHaveAttribute('placeholder', 'Kreatinin (merged)')
    fireEvent.click(button)
    expect(useAppStore.getState().analysisSettings.seriesMerge.merges).toEqual([{ ...merge, loinc: '2160-0' }])
    rerender(<WorkspaceSeriesMerge data={buildWorkspaceData({ rows, fileName: 'x.csv', events: [], patientAttributes: {}, analysisSettings: useAppStore.getState().analysisSettings, manualDemographics: {} }, useAppStore.getState().analysisResult())} />)
    const list = screen.getByRole('list', { name: 'Merged series' })
    expect(list).toHaveTextContent('Kreatinin (merged) [mg/dl] (chosen by LOINC 2160-0): Kreatinin [mg/dl], 2 values, unchanged; Kreatinin [µmol/l], 2 values, ÷ 88.42 into mg/dl.')
    fireEvent.click(screen.getByRole('button', { name: 'Remove merged series Kreatinin (merged) [mg/dl]' }))
    expect(useAppStore.getState().analysisSettings.seriesMerge.merges).toEqual([])
  })

  it('names why a draft cannot be merged', () => {
    const imported = [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, { bezeichnung: 'Kreatinin', einheit: 'µmol/l' }, { bezeichnung: 'Hb', einheit: 'g/dl' }]
    expect(draftMergeProblem({ ...merge, sources: [merge.sources[0]] }, imported, [])).toBe('Choose at least two series.')
    expect(draftMergeProblem({ ...merge, name: 'Kreatinin' }, imported, [])).toMatch(/is an imported series/)
    expect(draftMergeProblem(merge, imported, [merge])).toMatch(/exists already/)
    expect(draftMergeProblem({ ...merge, name: 'Other' }, imported, [merge])).toMatch(/already belongs to a merged series/)
    expect(draftMergeProblem({ name: 'Mixed', unit: 'mg/dl', sources: [merge.sources[0], imported[2]] }, imported, [])).toMatch(/Hb \[g\/dl\] cannot be converted to mg\/dl/)
    expect(draftMergeProblem(merge, imported, [])).toBeNull()
    // Code review of wave 3: unitless series, creatinine of two materials, the name of a computed eGFR.
    expect(draftMergeProblem({ name: 'X', unit: '', sources: [{ bezeichnung: 'Note', einheit: null }, { bezeichnung: 'Note 2', einheit: null }] }, imported, [])).toBe('Series without a unit cannot be merged.')
    expect(draftMergeProblem({ name: 'X', unit: 'mg/dl', sources: [merge.sources[0], { bezeichnung: 'Kreatinin i.U.', einheit: 'mg/dl' }] }, imported, [])).toMatch(/^Creatinine of different materials cannot be merged/)
    expect(draftMergeProblem({ name: 'eGFR (CKD-EPI 2021, computed)', unit: 'ml/min/1,73m²', sources: [{ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }, { bezeichnung: 'eGFR lab', einheit: 'ml/min/1,73m²' }] }, imported, []))
      .toMatch(/is the name of a computed eGFR/)
  })

  it('returns the eGFR source to Automatic when its merged series is removed', () => {
    workspaceData([merge])
    useAppStore.getState().setEgfrSource(['Kreatinin (merged)', 'mg/dl'])
    useAppStore.getState().setSeriesMerges([])
    expect(useAppStore.getState().analysisSettings.egfr.source).toBeNull()
  })
})

describe('Patient view: Compare series', () => {
  it('draws the chosen series in one unit, each with its own shape and comparison line', () => {
    const series = comparisonSeries(rows, 'P1', [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, { bezeichnung: 'Kreatinin', einheit: 'µmol/l' }, { bezeichnung: 'Hb', einheit: 'g/dl' }], 'mg/dl')
    // Hb does not convert to mg/dl and is left out.
    expect(series.map(s => s.ref.einheit)).toEqual(['mg/dl', 'µmol/l'])
    expect(series[1].points[0].value).toBeCloseTo(80 / 88.42, 12)
    // (90 − 80) / 88.42 mg/dl over 365 days, per 365.25-day year.
    expect(series[1].fit!.slope).toBeCloseTo((10 / 88.42) / (365 / 365.25), 10)
    render(<SeriesComparison rows={rows} patientId="P1" />)
    const options = within(screen.getByRole('group', { name: 'Series to compare' }))
    fireEvent.click(options.getByLabelText(/Kreatinin \[mg\/dl\]/))
    expect(options.getByLabelText(/Hb \[g\/dl\]/)).toBeDisabled()
    fireEvent.click(options.getByLabelText(/Kreatinin \[µmol\/l\]/))
    const chart = screen.getByRole('group', { name: /Comparison of Kreatinin \[mg\/dl\], Kreatinin \[µmol\/l\] in mg\/dl/ })
    expect(chart.querySelectorAll('[data-testid="comparison-line"]')).toHaveLength(2)
    expect(chart.querySelector('[data-shape="square"] path title')?.textContent).toBe('Kreatinin [µmol/l], 01/06/2020: 0.905 mg/dl (80 µmol/l as measured), laboratory or method: enzymatic')
    expect(screen.getByRole('table', { name: 'Compared series' })).toHaveTextContent('enzymatic')
  })

  it('names the source series and the laboratory per row of a merged series', () => {
    const data = workspaceData([merge])
    const parameter = data.parameters.find(p => p.bezeichnung === 'Kreatinin (merged)')!
    expect(parameter.derived).toBe(true)
    const measurements = data.rows.filter(r => r.bezeichnung === 'Kreatinin (merged)').sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    render(<PatientMeasurementTable parameter={parameter} measurements={measurements} fitStatus={measurements.map(() => '')} events={[]} />)
    const table = screen.getByRole('table', { name: 'Measurements Kreatinin (merged) [mg/dl]' })
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Date', 'Derived value', 'Numeric value', 'Age', 'Fit preparation', 'Source series', 'Laboratory or method'])
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('Kreatinin [µmol/l]')
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('enzymatic')
  })
})

describe('Apply settings from an export', () => {
  const exported = (merges: SeriesMerge[], source: [string, string] | null = null): ExportedSettings => ({
    columns: [], analysisSettings: { ...defaultAnalysisSettings(), egfr: { formula: 'ckd-epi-2021', source }, seriesMerge: { merges } },
    groupBy: '', appVersion: null, exportId: null, inputDataId: null, rebuilt: false, manualDemographicPatients: 0, periEventCreatinine: undefined, logParameterKeys: [],
  })
  const target = (importedParameters: ApplyTarget['importedParameters']): ApplyTarget => ({
    parameterKeys: new Set(), importedParameters, analysisSettings: defaultAnalysisSettings(), trajectoryFitSettings: { shared: defaultFitSettings(), columns: {} },
    trendKeys: [], logKeys: [], events: [], periEventSettings: null,
  })

  it('applies a merge whose series are all present, with a merged creatinine source', () => {
    const applied = applyExportedSettings(exported([merge], ['Kreatinin (merged)', 'mg/dl']), target([['Kreatinin', 'mg/dl'], ['Kreatinin', 'µmol/l']]))
    expect(applied.analysisSettings.seriesMerge.merges).toEqual([merge])
    expect(applied.analysisSettings.egfr.source).toEqual(['Kreatinin (merged)', 'mg/dl'])
    expect(applied.applied).toContain('merged series Kreatinin (merged) [mg/dl]')
  })

  it('reports a merge whose series are absent and leaves it out (OD-81)', () => {
    const applied = applyExportedSettings(exported([merge], ['Kreatinin (merged)', 'mg/dl']), target([['Kreatinin', 'mg/dl']]))
    expect(applied.analysisSettings.seriesMerge.merges).toEqual([])
    expect(applied.notApplied).toContain('merged series Kreatinin (merged) [mg/dl] (Kreatinin [µmol/l] not in this dataset; the merge is left out)')
    // Its series is then no creatinine source of this dataset: the current source is kept.
    expect(applied.analysisSettings.egfr.source).toBeNull()
    expect(applied.notApplied.some(text => text.startsWith('creatinine source Kreatinin (merged) [mg/dl]'))).toBe(true)
  })
})
