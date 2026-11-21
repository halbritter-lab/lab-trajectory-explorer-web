import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrajectoriesWorkspace } from '../../src/workspace/TrajectoriesWorkspace'
import { computedEgfrKey, EGFR_GAP_TEXT, egfrGapReason, missingEgfrNotes } from '../../src/workspace/egfr-gaps'
import { appendComputedEgfr } from '../../src/core/domains/nephrology/egfr/series'
import type { WorkspaceData } from '../../src/workspace/workspace-data'
import type { LabRow, Sex } from '../../src/core/types'
import { useAppStore } from '../../src/workspace/state/store'

if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value() {} })
beforeEach(() => {
  useAppStore.getState().reset()
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => false }))
})
afterEach(() => vi.restoreAllMocks())

const lab = (patientId: string, year: number, value: number | null, sex: Sex | null, age: number | null, name = 'Kreatinin', unit = 'mg/dl'): LabRow =>
  ({ patientId, labDatum: new Date(Date.UTC(year, 0, 1)), bezeichnung: name, einheit: unit, wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: sex, patientAgeAtLab: age })

/** P1 is complete; P2 has no sex; P3 is a child with one value of zero; P4 has creatinine in µmol/l only. */
function data(formula: 'ckd-epi-2021' | 'off' = 'ckd-epi-2021'): WorkspaceData {
  const rawRows = [
    ...[2020, 2021, 2022].map((year, i) => lab('P1', year, 1 + i / 10, 'm', 50 + i)),
    ...[2020, 2021, 2022, 2023].map((year, i) => lab('P2', year, 1.2, null, 60 + i)),
    lab('P3', 2020, 0, 'w', 12), lab('P3', 2021, 0.6, 'w', 13),
    lab('P4', 2020, 88, 'm', 40, 'Kreatinin', 'µmol/l'),
  ]
  const rows = formula === 'off' ? rawRows : appendComputedEgfr(rawRows, { formula, source: ['Kreatinin', 'mg/dl'] })
  const key = (row: LabRow) => JSON.stringify([row.bezeichnung, row.einheit])
  const rawKeys = new Set(rawRows.map(key))
  const parameters = [...new Map(rows.map(row => [key(row), { key: key(row), label: `${row.bezeichnung} [${row.einheit}]`, bezeichnung: row.bezeichnung!, einheit: row.einheit, derived: !rawKeys.has(key(row)) }])).values()]
  const patients = ['P1', 'P2', 'P3', 'P4'].map(id => ({ id, label: id, attributes: {}, baselineAge: 50 }))
  return { rawRows, rows, fileName: 'egfr.csv', parameters, patients, events: [], patientAttributes: {}, analysis: { fitInputs: [] },
    analysisSettings: { egfr: { formula, source: ['Kreatinin', 'mg/dl'] } }, manualDemographics: {} } as unknown as WorkspaceData
}

describe('egfrGapReason', () => {
  it('returns the first reason in the order of the Data page', () => {
    const row = lab('P', 2020, 1, 'm', 50)
    expect(egfrGapReason(row)).toBeNull()
    expect(egfrGapReason({ ...row, labDatum: null, wertNum: null })).toBe('date')
    expect(egfrGapReason({ ...row, wertNum: null, patientSex: null })).toBe('value')
    expect(egfrGapReason({ ...row, wertNum: 0, patientSex: null })).toBe('non_positive')
    expect(egfrGapReason({ ...row, patientSex: null, patientAgeAtLab: null })).toBe('sex')
    expect(egfrGapReason({ ...row, patientAgeAtLab: null })).toBe('age')
    // 18 is an adult; 17 is not.
    expect(egfrGapReason({ ...row, patientAgeAtLab: 17 })).toBe('under_18')
    expect(egfrGapReason({ ...row, patientAgeAtLab: 18 })).toBeNull()
    expect(EGFR_GAP_TEXT.sex).toBe('Sex missing or unresolved')
  })
})

describe('missingEgfrNotes', () => {
  it('names the reason for every patient without a computed value, and nobody else', () => {
    const notes = missingEgfrNotes(data())
    expect([...notes.keys()]).toEqual(['P2', 'P3', 'P4'])
    expect(notes.get('P2')).toEqual({ label: 'No eGFR: sex missing', text: 'No eGFR for this patient: sex missing (4 creatinine values). Enter the sex under Data → “Review and edit patients”.' })
    expect(notes.get('P3')).toEqual({ label: 'No eGFR: creatinine not positive', text: 'No eGFR for this patient: creatinine not positive (1 creatinine value); age under 18 (1 creatinine value).' })
    expect(notes.get('P4')!.text).toBe('No eGFR for this patient: no value in the creatinine source Kreatinin [mg/dl]. Values under another name or unit are not used.')
  })
  it('names both demographics when sex and age are missing on different rows', () => {
    const input = data()
    input.rows = input.rows.map(row => row.patientId === 'P2' && row.labDatum!.getUTCFullYear() === 2020 ? { ...row, patientSex: 'm' as const, patientAgeAtLab: null } : row)
    expect(missingEgfrNotes(input).get('P2')!.text).toBe('No eGFR for this patient: sex missing (3 creatinine values); age missing (1 creatinine value). Enter the sex and the age under Data → “Review and edit patients”.')
  })
  it('gives nothing while the derivation is off', () => {
    expect(computedEgfrKey(data('off'))).toBeNull()
    expect(missingEgfrNotes(data('off')).size).toBe(0)
  })
})

describe('the empty cell of the computed eGFR names the reason (K06)', () => {
  const EGFR = data().parameters.find(parameter => parameter.derived)!.label
  const cell = (id: string, label: string) => {
    const index = screen.getAllByRole('columnheader').findIndex(header => header.getAttribute('aria-label')?.startsWith(label))
    return within(screen.getByRole('button', { name: `Open patient ${id}` }).closest('tr')!).getAllByRole('cell')[index - 1]
  }

  it('shows the reason in the cell and its hint, and only in the computed column', () => {
    expect(EGFR).toMatch(/^eGFR/)
    render(<TrajectoriesWorkspace data={data()} />)
    const hint = within(cell('P2', EGFR)).getByRole('button', { name: 'No eGFR: sex missing' })
    expect(hint).toHaveTextContent('No eGFR: sex missing')
    fireEvent.focus(hint)
    expect(screen.getByRole('tooltip')).toHaveTextContent('No eGFR for this patient: sex missing (4 creatinine values). Enter the sex under Data → “Review and edit patients”.')
    fireEvent.blur(hint)
    expect(within(cell('P4', EGFR)).getByRole('button', { name: 'No eGFR: no creatinine in the source' })).toBeInTheDocument()
    // P1 has values; P4's empty creatinine cell in mg/dl is an imported parameter and keeps the general text.
    expect(within(cell('P1', EGFR)).queryByRole('button', { name: /^No eGFR/ })).not.toBeInTheDocument()
    expect(within(cell('P4', 'Kreatinin [mg/dl]')).getByRole('button', { name: 'No numeric measurements' })).toBeInTheDocument()
  })

  it('states the reason in the patient view', () => {
    render(<TrajectoriesWorkspace data={data()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open patient P3' }))
    expect(screen.getByText('No eGFR for this patient: creatinine not positive (1 creatinine value); age under 18 (1 creatinine value).')).toBeInTheDocument()
  })
})
