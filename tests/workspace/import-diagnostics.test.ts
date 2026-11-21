import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { LabRow } from '../../src/core/types'
import type { ImportDiagnostic } from '../../src/io/loadDataset'
import { dataChecks, diagnosticsBySource, importDiagnosticRecords } from '../../src/workspace/import-diagnostics'
import { workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { exportFixture } from './export-fixture'

const lab = (over: Partial<LabRow>): LabRow => ({ patientId: 'A', labDatum: new Date('2024-01-15'), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: '1,0', wertNum: 1, wertOperator: '=', loinc: null, patientSex: 'w', patientAgeAtLab: 50, ...over })

const diagnostics: ImportDiagnostic[] = [
  { source: 'attributes', sheet: 'attr.csv', patientId: 'B', severity: 'rejected', row: 4, reason: 'Patient B already has an attribute row; this later row is not imported.' },
  { source: 'labs', sheet: 'labs.csv', patientId: null, severity: 'rejected', row: 7, reason: 'Patient ID missing; row not imported.' },
  { source: 'labs', sheet: 'labs.csv', patientId: null, severity: 'warning', scope: 'sheet', reason: '2 duplicate lab rows.', affected: 3,
    rows: [{ row: 3, patientId: 'A', date: '2024-01-15', parameter: 'Kreatinin [mg/dl]', value: '1,0' }, { row: 9, patientId: 'B', date: '2024-02-15', parameter: 'Kreatinin [mg/dl]', value: '1,2' }] },
  { source: 'labs', sheet: 'labs.csv', patientId: null, severity: 'warning', scope: 'sheet', reason: '1 lab date was read day-first.' },
]

describe('import diagnostics as a table', () => {
  it('groups by source in the order lab values, events, attributes', () => {
    expect(diagnosticsBySource(diagnostics).map((g) => [g.source, g.label, g.diagnostics.length])).toEqual([['labs', 'Lab values', 3], ['attributes', 'Attributes', 1]])
  })

  it('writes one line per finding or affected row, with the source row', () => {
    expect(importDiagnosticRecords(diagnostics)).toEqual([
      { source: 'labs', sheet: 'labs.csv', kind: 'rejected', row: 7, patient_id: '', date: '', parameter: '', value: '', message: 'Patient ID missing; row not imported.' },
      { source: 'labs', sheet: 'labs.csv', kind: 'warning', row: 3, patient_id: 'A', date: '2024-01-15', parameter: 'Kreatinin [mg/dl]', value: '1,0', message: '2 duplicate lab rows.' },
      { source: 'labs', sheet: 'labs.csv', kind: 'warning', row: 9, patient_id: 'B', date: '2024-02-15', parameter: 'Kreatinin [mg/dl]', value: '1,2', message: '2 duplicate lab rows.' },
      { source: 'labs', sheet: 'labs.csv', kind: 'warning', row: '', patient_id: '', date: '', parameter: '', value: '', message: '2 duplicate lab rows. (1 further rows are not listed.)' },
      { source: 'labs', sheet: 'labs.csv', kind: 'warning', row: '', patient_id: '', date: '', parameter: '', value: '', message: '1 lab date was read day-first.' },
      { source: 'attributes', sheet: 'attr.csv', kind: 'rejected', row: 4, patient_id: 'B', date: '', parameter: '', value: '', message: 'Patient B already has an attribute row; this later row is not imported.' },
    ])
  })

  it('lists the rows behind the Data page counts', () => {
    const rows = [
      lab({ sourceRow: 2 }),
      lab({ sourceRow: 3, labDatum: null }),
      lab({ sourceRow: 4, wert: 'negativ', wertNum: null, wertOperator: 'unparseable', bezeichnung: 'Nitrit', einheit: null }),
      lab({ sourceRow: 5, wert: '0', wertNum: 0 }),
      lab({ sourceRow: 6, wert: '88', wertNum: 88 }),
      lab({ sourceRow: 7, wert: '25', wertNum: 25 }),
    ]
    const checks = dataChecks(rows)
    expect(checks.map((c) => [c.id, c.message, c.rows.map((r) => r.row)])).toEqual([
      ['no_date', '1 value without a date; kept, but used in no dated calculation.', [3]],
      ['no_number', '1 value without a numeric measurement; kept, but used in no calculation.', [4]],
      ['creatinine_non_positive', '1 serum creatinine value of zero or less: not plausible, so not used for AKI detection or eGFR.', [5]],
      ['creatinine_high', '1 serum creatinine value above 25 mg/dl (µmol/l converted): not plausible, check the unit. The values are used unchanged.', [6]],
    ])
    expect(importDiagnosticRecords([], checks)[1]).toEqual({ source: 'labs', sheet: '', kind: 'data check', row: 4, patient_id: 'A', date: '2024-01-15', parameter: 'Nitrit [no unit]', value: 'negativ', message: '1 value without a numeric measurement; kept, but used in no calculation.' })
    expect(dataChecks([lab({})])).toEqual([])
  })
})

describe('cohort workbook: import_diagnostics sheet', () => {
  it('is appended after the existing sheets and holds findings of the whole dataset', () => {
    const input = exportFixture()
    const before = XLSX.read(workspaceWorkbookBytes(input), { type: 'array' })
    expect(before.SheetNames).toEqual(['measurements', 'raw_measurements', 'cohort', 'events', 'aki_episodes', 'patient_attributes', 'demographics', 'parameters', 'settings', 'about', 'import_diagnostics'])
    input.data.importDiagnostics = diagnostics
    const workbook = XLSX.read(workspaceWorkbookBytes(input), { type: 'array' })
    const sheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.import_diagnostics, { defval: '' })
    expect(Object.keys(sheet[0])).toEqual(['source', 'sheet', 'kind', 'row', 'patient_id', 'date', 'parameter', 'value', 'message'])
    expect(sheet.filter((r) => r.kind !== 'data check').map((r) => [r.source, r.kind, r.row, r.patient_id])).toEqual([
      ['labs', 'rejected', 7, ''], ['labs', 'warning', 3, 'A'], ['labs', 'warning', 9, 'B'], ['labs', 'warning', '', ''], ['labs', 'warning', '', ''], ['attributes', 'rejected', 4, 'B'],
    ])
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.about).some((row) => String(row.note).startsWith('import_diagnostics lists what the import reported'))).toBe(true)
  })
})
