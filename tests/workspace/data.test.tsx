import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { useAppStore } from '../../src/ui/state/store'
import { useWorkspaceData, workspaceSpecs, importWorkspaceFile } from '../../src/workspace/workspace-data'
import type { LabRow } from '../../src/core/types'
import * as XLSX from 'xlsx'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { episodesForSeries } from '../../src/core/aki/akiAware'
import { defaultFitSettings, toFitConfig } from '../../src/workspace/workspace-analysis'

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
  useAppStore.getState().setDataset(rows)
  const { result } = renderHook(useWorkspaceData)
  const data = result.current
  const parameters = ['Kreatinin', 'Creatinine'].map(name => data.parameters.find(p => p.bezeichnung === name)!)
  const inputData = { ...data, analysis: { ...data.analysis, fitInputs: preparedInputs ? parameters.map(parameter => ({
    id: `aki:${parameter.key}`, patientId: 'A:01', seriesKey: parameter, kind: 'aki-aware' as const,
    exclusionDays: 30, episodes: episodesForSeries(rows, 'A:01', parameter.bezeichnung, parameter.einheit),
  })) : [] } }
  const configs = Object.fromEntries(parameters.map((parameter, index) => [parameter.key, toFitConfig({
    ...defaultFitSettings(), exclusions: { excludeAkiWindows: true, akiExclusionDays: index === 0 ? 0 : 30 },
  }, parameter)]))
  const specs = workspaceSpecs(inputData, parameters.map(p => p.key), configs)
  const [zeroDay, thirtyDay] = buildCohortRows(data.rows, ['A:01'], specs)[0].cells
  expect(zeroDay.excludedIdx).toEqual([4])
  expect(thirtyDay.excludedIdx).toEqual([4, 5])
  expect(zeroDay.nFitted).toBe(7)
  expect(thirtyDay.nFitted).toBe(6)
  expect(zeroDay.slope).toBeGreaterThan(thirtyDay.slope)
  expect(zeroDay.fitLines[0].at(-1)!.value).toBeGreaterThan(thirtyDay.fitLines[0].at(-1)!.value)
})
it('exposes explicit birth anchors and marks manual or inferred anchors as estimated', () => {
  useAppStore.getState().setDataset([row({ patientBirthDate: new Date('1970-08-15') })])
  const { result } = renderHook(useWorkspaceData)
  expect(result.current.patients[0]).toMatchObject({ birthAnchor: new Date('1970-08-15'), ageEstimated: false, baselineAge: 49 })
  act(() => useAppStore.getState().setPatientAttributes({ 'A:01': { birthDate: '1965-05-01' } }))
  expect(result.current.patients[0]).toMatchObject({ birthAnchor: new Date('1965-05-01'), ageEstimated: false })
  act(() => useAppStore.getState().setManualDemographics('A:01', { age: 60 }))
  expect(result.current.patients[0].ageEstimated).toBe(true)
  expect(result.current.patients[0].birthAnchor).not.toEqual(new Date('1965-05-01'))
  act(() => { useAppStore.getState().reset(); useAppStore.getState().setDataset([row({ patientAgeAtLab: null })]) })
  expect(result.current.patients[0]).toMatchObject({ birthAnchor: null, ageEstimated: false })
  act(() => useAppStore.getState().setDataset([row()]))
  expect(result.current.patients[0].birthAnchor).toBeInstanceOf(Date)
  expect(result.current.patients[0].ageEstimated).toBe(true)
})
it('keeps arbitrary parameter/unit identities separate and memoizes unrelated state changes', () => {
  useAppStore.getState().setDataset([row(), row({ bezeichnung: 'A|B', einheit: 'C' }), row({ bezeichnung: 'A', einheit: 'B|C' })], 'input.csv')
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
  useAppStore.getState().setDataset(raw)
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
  useAppStore.getState().setDataset([row()])
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
