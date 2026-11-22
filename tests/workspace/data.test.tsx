import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { useAppStore } from '../../src/workspace/state/store'
import { useWorkspaceData, workspaceSpecs, importWorkspaceFile } from '../../src/workspace/workspace-data'
import type { LabRow } from '../../src/core/types'
import * as XLSX from 'xlsx'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { episodesForSeries } from '../../src/core/domains/nephrology/aki/akiAware'
import { akiFitInput } from '../../src/core/domains/nephrology/aki/akiModule'
import { defaultFitSettings, toFitConfig } from '../../src/workspace/workspace-analysis'
import { workspaceGroupableAttributes } from '../../src/workspace/workspace-model-results'

const row = (patch: Partial<LabRow> = {}): LabRow => ({ patientId: 'A:01', labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: 50, ...patch })
beforeEach(() => useAppStore.getState().reset())
it.each([false, true])('applies each column AKI window to exclusions, summaries and fit lines (prepared inputs: %s)', preparedInputs => {
  const measurements = [
    ['2019-01-01', 1], ['2019-06-01', 1.1], ['2020-01-01', 1.05], ['2020-07-30', 1.15],
    ['2020-08-01', 2.4], ['2020-08-10', 1.8], ['2020-10-01', 1.2], ['2021-06-01', 1.3],
  ] as const
  const rows = ['Kreatinin', 'Creatinine'].flatMap(bezeichnung => measurements.map(([date, value]) => row({
    bezeichnung, labDatum: new Date(`${date}T00:00:00Z`), wertNum: value, wert: String(value),
  })))
  useAppStore.getState().replaceDataset({ rows: rows })
  const { result } = renderHook(useWorkspaceData)
  const data = result.current
  const parameters = ['Kreatinin', 'Creatinine'].map(name => data.parameters.find(p => p.bezeichnung === name)!)
  const inputData = { ...data, analysis: { ...data.analysis, fitInputs: preparedInputs ? parameters.map(parameter =>
    akiFitInput('A:01', parameter, episodesForSeries(rows, 'A:01', parameter.bezeichnung, parameter.einheit), 30),
  ) : [] } }
  const configs = Object.fromEntries(parameters.map((parameter, index) => [parameter.key, toFitConfig({
    ...defaultFitSettings(), exclusions: { excludeAkiWindows: true, akiExclusionDays: 30, akiDaysAfterEnd: index === 0 ? 0 : 90 },
  }, parameter)]))
  const specs = workspaceSpecs(inputData, parameters.map(p => p.key), configs)
  // Since 2026-11-22 (row akiwin) each column counts its window from the onset (2020-08-01) to its days after
  // the episode's last day (2020-08-03: the gap before 2020-08-10 ended the episode, so the recovery window of
  // its last value). 0 days: the window ends on 2020-08-03; 90 days: on 2020-11-01.
  const [zeroDay, thirtyDay] = buildCohortRows(data.rows, ['A:01'], specs)[0].cells
  expect(zeroDay.excludedIdx).toEqual([4])
  expect(thirtyDay.excludedIdx).toEqual([4, 5, 6])
  expect(zeroDay.nFitted).toBe(7)
  expect(thirtyDay.nFitted).toBe(5)
  expect(zeroDay.slope).toBeGreaterThan(thirtyDay.slope)
  expect(zeroDay.fitLines[0].at(-1)!.value).toBeGreaterThan(thirtyDay.fitLines[0].at(-1)!.value)
})
it('exposes explicit birth anchors and marks manual or inferred anchors as estimated', () => {
  useAppStore.getState().replaceDataset({ rows: [row({ patientBirthDate: new Date('1970-08-15') })] })
  const { result } = renderHook(useWorkspaceData)
  expect(result.current.patients[0]).toMatchObject({ birthAnchor: new Date('1970-08-15'), ageEstimated: false, baselineAge: 49 })
  act(() => useAppStore.getState().setPatientAttributes({ 'A:01': { birthDate: '1965-05-01' } }))
  expect(result.current.patients[0]).toMatchObject({ birthAnchor: new Date('1965-05-01'), ageEstimated: false })
  act(() => useAppStore.getState().setManualDemographics('A:01', { age: 60 }))
  expect(result.current.patients[0].ageEstimated).toBe(true)
  expect(result.current.patients[0].birthAnchor).not.toEqual(new Date('1965-05-01'))
  act(() => { useAppStore.getState().reset(); useAppStore.getState().replaceDataset({ rows: [row({ patientAgeAtLab: null })] }) })
  expect(result.current.patients[0]).toMatchObject({ birthAnchor: null, ageEstimated: false })
  act(() => useAppStore.getState().replaceDataset({ rows: [row()] }))
  expect(result.current.patients[0].birthAnchor).toBeInstanceOf(Date)
  expect(result.current.patients[0].ageEstimated).toBe(true)
})
it('keeps arbitrary parameter/unit identities separate and memoizes unrelated state changes', () => {
  useAppStore.getState().replaceDataset({ rows: [row(), row({ bezeichnung: 'A|B', einheit: 'C' }), row({ bezeichnung: 'A', einheit: 'B|C' })], fileName: 'input.csv' })
  const { result } = renderHook(useWorkspaceData)
  const original = result.current
  expect(new Set(original.parameters.map(p => p.key)).size).toBe(3)
  expect(original.patients[0]).toMatchObject({ id: 'A:01', baselineAge: 50, attributes: { sex: 'm' } })
  act(() => useAppStore.getState().setNotice({ kind: 'info', text: 'hello' }))
  expect(result.current).toBe(original)
  const specs = workspaceSpecs(original, original.parameters.map(p => p.key).reverse())
  expect(specs.map(s => s.bezeichnung)).toEqual(original.parameters.map(p => p.bezeichnung).reverse())
  expect(specs[0].fitConfig).toMatchObject({ fitModel: 'ols', timeBalancing: 'raw', exclusions: { excludeAkiWindows: false } })
})
it('resolves missing demographics and recomputes derived rows without modifying imported values', () => {
  const raw = [row({ patientSex: null, patientAgeAtLab: null })]
  useAppStore.getState().replaceDataset({ rows: raw })
  useAppStore.getState().setEgfrFormula('ekfc-2021')
  const { result } = renderHook(useWorkspaceData)
  expect(result.current.rows).toHaveLength(1)
  act(() => useAppStore.getState().setManualDemographics('A:01', { sex: 'w', age: 60 }))
  expect(result.current.rows).toHaveLength(2)
  expect(result.current.parameters.some(p => p.derived)).toBe(true)
  expect(raw[0].patientSex).toBeNull()
  act(() => useAppStore.getState().setEgfrFormula('off'))
  expect(result.current.rows).toHaveLength(1)
})
it('loads real CSV, resets overrides after replacement, and preserves data on failed imports', async () => {
  useAppStore.getState().replaceDataset({ rows: [row()] })
  useAppStore.getState().setManualDemographics('A:01', { age: 80 })
  const observedOverrides: unknown[] = []
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (state.rows !== previous.rows) observedOverrides.push(state.manualDemographics)
  })
  const file = (text: string) => ({ name: 'actual.csv', arrayBuffer: async () => new TextEncoder().encode(text).buffer }) as File
  await importWorkspaceFile(file('patientId,labDatum,bezeichnung,einheit,wert\nX-02,2024-01-01,Custom,mmol/l,3\n'))
  expect(useAppStore.getState().rows[0].patientId).toBe('X-02')
  expect(useAppStore.getState().manualDemographics).toEqual({})
  expect(observedOverrides).toEqual([{}])
  const kept = useAppStore.getState().rows
  await importWorkspaceFile(file('wrong,columns\n1,2\n'))
  expect(useAppStore.getState().rows).toBe(kept)
  expect(useAppStore.getState().notice?.kind).toBe('error')
  unsubscribe()
})
it('loads an actual workbook with attributes, reports conflicts, and scopes clinical events by person', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { patientId: 'X-1', labDate: '2020-01-01', testName: 'Kreatinin', unit: 'mg/dl', value: 1, sex: 'm', ageAtLab: 50 },
    { patientId: 'X-1', labDate: '2021-01-01', testName: 'Kreatinin', unit: 'mg/dl', value: 2, sex: 'w', ageAtLab: 51 },
  ]), 'labs')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ patientId: 'X-1', sex: 'w', cohort: 'A' }]), 'attributes')
  await importWorkspaceFile({ name: 'real.xlsx', arrayBuffer: async () => XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) } as File)
  const { result } = renderHook(useWorkspaceData)
  expect(result.current.patients[0].attributes).toMatchObject({ sex: 'w', cohort: 'A' })
  expect(result.current.analysis.messages.some(m => m.id.startsWith('demographics:'))).toBe(true)
  expect(workspaceSpecs(result.current, result.current.parameters.map(p => p.key))[0].clinicalEventsByPatient).toEqual({})
})
it('names the patient-days with creatinine values of unknown order in the import message', async () => {
  // The one warning in each message is the import's "differing values on the same day".
  const file = (lines: string[]) => ({ name: 'labs.csv', arrayBuffer: async () => new TextEncoder().encode(['patientId,labDate,testName,unit,value', ...lines].join('\n')).buffer }) as File
  await importWorkspaceFile(file(['A,2026-09-01,Kreatinin,mg/dl,1.0', 'A,2026-09-01,Kreatinin,mg/dl,1.4', 'A,2026-09-02 06:00,Kreatinin,mg/dl,1.0', 'A,2026-09-02 20:00,Kreatinin,mg/dl,1.1']))
  expect(useAppStore.getState().notice?.text).toBe('4 lab values, 0 events and 0 attribute rows loaded. 0 rows rejected; 1 warning. 1 patient-day with several serum creatinine values whose order within the day is unknown: see “Demographics and data quality”.')
  await importWorkspaceFile(file(['A,2026-09-02 06:00,Kreatinin,mg/dl,1.0', 'A,2026-09-02 20:00,Kreatinin,mg/dl,1.1']))
  expect(useAppStore.getState().notice?.text).toBe('2 lab values, 0 events and 0 attribute rows loaded. 0 rows rejected; 1 warning.')
})
it('keeps sheet names in the diagnostics of a multi-sheet workbook without an Excel extension', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { patientId: 'X-1', labDate: '2020-01-01', testName: 'Kreatinin', unit: 'mg/dl', value: 1 },
    { patientId: 'X-1', labDate: '2021-02-30', testName: 'Kreatinin', unit: 'mg/dl', value: 2 },
  ]), 'labs')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ patientId: 'X-1', cohort: 'A' }]), 'attributes')
  await importWorkspaceFile({ name: 'study.ods', arrayBuffer: async () => XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) } as File)
  const sheets = useAppStore.getState().importDiagnostics.map(d => d.sheet)
  expect(sheets.length).toBeGreaterThan(0)
  expect(sheets).not.toContain('study.ods')
  expect(sheets).toContain('labs')
})
it('runs the rolling and segmented fit paths selected in the workspace', () => {
  useAppStore.getState().replaceDataset({ rows: [row({}), row({ labDatum: new Date('2021-01-01'), wertNum: 2 }), row({ labDatum: new Date('2022-01-01'), wertNum: 3 })] })
  const { result } = renderHook(useWorkspaceData)
  const [parameter] = result.current.parameters
  const modes = (['ols', 'theil-sen', 'rolling-ols', 'segmented-ols'] as const).map(fitModel => {
    const config = toFitConfig({ ...defaultFitSettings(), fitModel }, parameter)
    const [spec] = workspaceSpecs(result.current, [parameter.key], { [parameter.key]: config })
    return [spec.mode, buildCohortRows(result.current.rows, ['A:01'], [spec])[0].cells[0].mode]
  })
  expect(modes).toEqual([['global', 'global'], ['global-robust', 'global-robust'], ['rolling', 'rolling'], ['gap-split', 'gap-split']])
})
it('gives the overlay and the model grouping the same sex for every patient', () => {
  useAppStore.getState().replaceDataset({ rows: [
    row({ patientId: 'A', patientSex: null, labDatum: new Date('2019-01-01') }), row({ patientId: 'A', patientSex: 'w' }),
    row({ patientId: 'B', patientSex: null }),
  ], patientAttributes: { B: { sex: 'male' } } })
  const { result } = renderHook(useWorkspaceData)
  const model = workspaceGroupableAttributes(result.current.rows, result.current.patientAttributes)
  for (const patient of result.current.patients) expect(patient.attributes.sex).toBe(model[String(patient.id)]?.sex)
  expect(result.current.patients.map(patient => patient.attributes.sex)).toEqual(['w', 'm'])
})
