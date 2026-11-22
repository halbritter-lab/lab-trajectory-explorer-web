// Issue #66, decision `switch`: a change of the eGFR equation is counted,
// marked in the patient's chart and named beside a slope fitted across it.
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { TrajectoriesWorkspace } from '../../src/workspace/TrajectoriesWorkspace'
import { appendComputedEgfr, egfrFormulaSwitches } from '../../src/core/domains/nephrology/egfr/series'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { formulaSwitchNote } from '../../src/workspace/egfr-switch'
import type { WorkspaceData } from '../../src/workspace/workspace-data'
import type { LabRow } from '../../src/core/types'
import { useAppStore } from '../../src/workspace/state/store'
import { defaultTrajectoryView } from '../../src/workspace/saved-settings'

if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value() {} })
beforeEach(() => {
  useAppStore.getState().reset()
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => false }))
})
afterEach(() => vi.restoreAllMocks())

const day = (year: number) => new Date(Date.UTC(year, 0, 1))
const lab = (patientId: string, year: number, name: string, unit: string, value: number, age: number | null): LabRow =>
  ({ patientId, labDatum: day(year), bezeichnung: name, einheit: unit, wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: age })

/** C: 16 and 17 with heights (CKiD U25), then 18 and 19 (CKD-EPI 2021). A: an adult. */
function data(): WorkspaceData {
  const rawRows = [
    lab('C', 2020, 'Kreatinin', 'mg/dl', 0.8, 16), lab('C', 2020, 'Größe', 'cm', 170, 16),
    lab('C', 2021, 'Kreatinin', 'mg/dl', 0.85, 17), lab('C', 2021, 'Größe', 'cm', 175, 17),
    lab('C', 2022, 'Kreatinin', 'mg/dl', 0.9, 18), lab('C', 2023, 'Kreatinin', 'mg/dl', 0.95, 19),
    lab('A', 2020, 'Kreatinin', 'mg/dl', 1.0, 50), lab('A', 2022, 'Kreatinin', 'mg/dl', 1.1, 52),
  ]
  const rows = appendComputedEgfr(rawRows, { formula: 'ckd-epi-2021', source: ['Kreatinin', 'mg/dl'] })
  const key = (row: LabRow) => JSON.stringify([row.bezeichnung, row.einheit])
  const rawKeys = new Set(rawRows.map(key))
  const parameters = [...new Map(rows.map(row => [key(row), { key: key(row), label: `${row.bezeichnung} [${row.einheit}]`, bezeichnung: row.bezeichnung!, einheit: row.einheit, derived: !rawKeys.has(key(row)) }])).values()]
  const patients = ['A', 'C'].map(id => ({ id, label: id, attributes: {}, baselineAge: id === 'A' ? 50 : 16 }))
  return { rawRows, rows, fileName: 'egfr.csv', parameters, patients, events: [], patientAttributes: {}, analysis: { rows, messages: [], fitInputs: [] },
    analysisSettings: { egfr: { formula: 'ckd-epi-2021', source: ['Kreatinin', 'mg/dl'] }, aki: { showOverlays: false, exclusionDays: 0, recoveryHours: 48 }, rapidEgfrDecline: { threshold: 0 } }, manualDemographics: {} } as unknown as WorkspaceData
}

describe('formula change', () => {
  it('is found where the equation of consecutive values differs', () => {
    expect([...egfrFormulaSwitches(data().rows)]).toEqual([['C', [{ date: day(2022), from: 'ckid-u25', to: 'ckd-epi-2021' }]]])
    // Worked example of the method reference (egfr.md, "Children and adolescents"):
    // 39.0 × 1.045^4 × 1.70 / 0.80 = 98.83; 48.601 × 1.75 / 0.85 = 100.06; CKD-EPI 2021 126.96 and 118.25.
    expect(data().rows.filter(row => row.patientId === 'C' && row.sourceSeries).map(row => row.wertNum)).toEqual([98.8, 100.1, 127.0, 118.2])
  })

  it('gives a notice only for a slope whose fitted span contains the change', () => {
    const switches = egfrFormulaSwitches(data().rows).get('C')
    expect(formulaSwitchNote({ slope: -1, firstFittedDate: day(2020), lastFittedDate: day(2023) }, switches)?.title)
      .toBe('This slope is fitted across a change of the eGFR equation: CKiD U25 → CKD-EPI 2021 on 2022-01-01. The equations do not agree at a change (Pottel 2019: a mean jump of 23 mL/min/1.73 m² from CKiD to CKD-EPI at 18 years), so part of this slope can come from the change of equation rather than from kidney function.')
    expect(formulaSwitchNote({ slope: -1, firstFittedDate: day(2022), lastFittedDate: day(2023) }, switches)).toBeNull()
    expect(formulaSwitchNote({ slope: Number.NaN, firstFittedDate: day(2020), lastFittedDate: day(2023) }, switches)).toBeNull()
  })

  it('names the change beside the slope and marks it in the patient chart', () => {
    const egfr = data().parameters.find(parameter => parameter.derived)!.key
    useAppStore.setState({ trajectoryView: { ...defaultTrajectoryView(), parameterKeys: [egfr], trendKeys: [egfr], fitKeys: [egfr] } })
    render(<TrajectoriesWorkspace data={data()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient C' }))
    expect(screen.getByTestId('formula-switch-note')).toHaveTextContent('Formula change in fit: This slope is fitted across a change of the eGFR equation: CKiD U25 → CKD-EPI 2021 on 2022-01-01.')
    expect(screen.getAllByTestId('egfr-formula-switch')).toHaveLength(1)
    expect(screen.getByTestId('egfr-switch-legend')).toHaveTextContent('Dotted vertical line: the eGFR equation changes (CKiD U25 → CKD-EPI 2021 on 2022-01-01).')
  })

  it('writes the change into the cohort sheet, column egfr_formula_switch, and the equation into the measurements', () => {
    const input = data()
    const egfr = input.parameters.find(parameter => parameter.derived)!
    const cohortRows = buildCohortRows(input.rows, ['A', 'C'], [{ bezeichnung: egfr.bezeichnung, einheit: egfr.einheit, mode: 'global' }])
    const workbook = XLSX.read(workspaceWorkbookBytes({ data: input, cohortRows, parameterKeys: [egfr.key], patientIds: ['A', 'C'] }), { type: 'array' })
    const cohort = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.cohort, { defval: '' })
    expect(cohort.map(row => [row.PatientID, row.egfr_formula_switch])).toEqual([['A', ''], ['C', 'CKiD U25 → CKD-EPI 2021 on 2022-01-01']])
    const measurements = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.measurements, { defval: '' })
    expect(measurements.filter(row => row.PatientID === 'C').map(row => [row.egfr_equation, row.egfr_height_cm])).toEqual([['ckid-u25', 170], ['ckid-u25', 175], ['ckd-epi-2021', ''], ['ckd-epi-2021', '']])
  })
})
