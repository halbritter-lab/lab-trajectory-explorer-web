import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { exportFixture } from './export-fixture'
import { workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { COHORT_SHEET_COLUMNS, COHORT_SHEET_HEADER, cohortSheetRow } from '../../src/workspace/cohort-sheet-columns'
import { groupRows, rowsWithGroupValue } from '../../src/workspace/trajectory-ui/grouping'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { analysisModules } from '../../src/core/analysis/registry'

const read = (bytes: Uint8Array) => XLSX.read(bytes, { type: 'array' })
const header = (workbook: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1 })[0]
const records = (workbook: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name])

/** The 75 columns of the cohort sheet as exported up to 0.3.7 without
 * grouping, in their positions. They must not move. */
const COLUMNS_UP_TO_0_3_7 = ['PatientID', 'slope_mode', 'fit_model', 'n', 'span_days', 'slope', 'slope_unit', 'r2', 'ci_low', 'ci_high', 'reason', 'unstable_slope', 'demographics_conflict', 'aki',
  'rapid_progression', 'endpoint_percent_change', 'endpoint_observed_ckd_g5', 'endpoint_projected_age_to_ckd_g5', 'endpoint_observed_ckd_g4', 'endpoint_confirmation_days',
  'endpoint_input_policy', 'endpoint_kidney_failure_reached', 'endpoint_kidney_failure_type', 'endpoint_kidney_failure_date', 'endpoint_prediction_anchor', 'endpoint_prediction_model',
  'endpoint_prediction_reason', 'endpoint_prediction_slope_ci_low', 'endpoint_prediction_slope_ci_high', 'endpoint_prediction_max_years', 'endpoint_g4_first_date',
  'endpoint_g4_confirmed_date', 'endpoint_g4_recovery_date', 'endpoint_g4_first_value', 'endpoint_g4_confirmed_value', 'endpoint_g4_recovery_value', 'endpoint_g5_first_date',
  'endpoint_g5_confirmed_date', 'endpoint_g5_recovery_date', 'endpoint_g5_first_value', 'endpoint_g5_confirmed_value', 'endpoint_g5_recovery_value', 'endpoint_confirmation_max_months',
  'endpoint_decline_baseline_value', 'endpoint_observed_decline_40', 'endpoint_observed_decline_57', 'endpoint_decline_40_first_date', 'endpoint_decline_40_confirmed_date',
  'endpoint_decline_40_recovery_date', 'endpoint_decline_40_first_value', 'endpoint_decline_40_confirmed_value', 'endpoint_decline_40_recovery_value', 'endpoint_decline_57_first_date',
  'endpoint_decline_57_confirmed_date', 'endpoint_decline_57_recovery_date', 'endpoint_decline_57_first_value', 'endpoint_decline_57_confirmed_value', 'endpoint_decline_57_recovery_value',
  'endpoint_prediction_age_basis', 'Parameter', 'Unit', 'n_fitted', 'fitted_span_days', 'rolling_window_days', 'rolling_step_days', 'rolling_windows', 'rolling_slope_min', 'rolling_slope_max',
  'index_date', 'last_fitted_date', 'first_eligible_date', 'last_eligible_date', 'intercept', 'slope_se', 'n_fitted_dates']
const COHORT_HEADER = [...COLUMNS_UP_TO_0_3_7, 'first_eligible_value', 'last_eligible_value', 'sex', 'baseline_age', 'group']

/** The fixture with its cohort rows grouped by the attribute `group`. */
function groupedFixture() {
  const input = exportFixture()
  const specs = input.data.parameters.map(parameter => ({ bezeichnung: parameter.bezeichnung, einheit: parameter.einheit, mode: 'global' as const }))
  return { ...input, cohortRows: buildCohortRows(input.data.rows, ['001-A', 'hidden'], specs, 'group', input.data.patientAttributes) }
}

describe('cohort workbook schema', () => {
  it('pins the sheets and the columns of every sheet', () => {
    const workbook = read(workspaceWorkbookBytes(exportFixture()))
    expect(workbook.SheetNames).toEqual(['measurements', 'raw_measurements', 'cohort', 'events', 'aki_episodes', 'patient_attributes', 'demographics', 'parameters', 'settings', 'about', 'columns'])
    const measurement = ['PatientID', 'Date', 'Parameter', 'Unit', 'Value', 'NumericValue', 'Operator', 'origin', 'formula', 'patient_sex', 'patient_age_at_lab', 'demographics', 'patient_birth_date']
    expect(header(workbook, 'measurements')).toEqual(measurement)
    expect(header(workbook, 'raw_measurements')).toEqual(measurement)
    expect(header(workbook, 'cohort')).toEqual(COHORT_HEADER)
    expect(header(workbook, 'events')).toEqual(['PatientID', 'type', 'date', 'title', 'description', 'endDate', 'intent', 'warning'])
    expect(header(workbook, 'aki_episodes')).toEqual(['PatientID', 'creatinine_parameter', 'creatinine_unit', 'stage', 'onset_date', 'peak_date', 'peak_value_mg_dl', 'baseline_date', 'baseline_value_mg_dl', 'criterion'])
    expect(header(workbook, 'patient_attributes')).toEqual(['PatientID', 'group'])
    expect(header(workbook, 'demographics')).toEqual(['PatientID', 'baseline_age', 'birth_anchor', 'age_estimated', 'manual_override', 'warnings'])
    expect(header(workbook, 'parameters')).toEqual(['parameter_key', 'parameter', 'unit', 'origin', 'formula', 'source_parameter', 'source_unit'])
    expect(header(workbook, 'settings')).toEqual(['parameter_key', 'parameter', 'unit', 'mode', 'fit_config', 'rapid_egfr_threshold', 'analysis_settings', 'patient_ids', 'source_file', 'scope'])
    expect(header(workbook, 'about')).toEqual(['note'])
    expect(header(workbook, 'columns')).toEqual(['column', 'meaning', 'unit', 'empty_when'])
    expect(header(read(workspaceWorkbookBytes({ ...exportFixture(), patientId: '001-A' })), 'slopes')).toEqual(COHORT_HEADER)
  })

  it('keeps every column in place when the table is grouped: group is last, empty without grouping', () => {
    const plain = read(workspaceWorkbookBytes(exportFixture()))
    const grouped = read(workspaceWorkbookBytes(groupedFixture()))
    expect(header(grouped, 'cohort')).toEqual(header(plain, 'cohort'))
    expect(header(grouped, 'cohort').at(-1)).toBe('group')
    expect(records(grouped, 'cohort').map(row => row.group)).toEqual(['A', 'A'])
    expect(records(plain, 'cohort').map(row => row.group ?? '')).toEqual(['', ''])
    // Column F is `slope` either way; a leading group column used to move it to G.
    expect(grouped.Sheets.cohort.F1.v).toBe('slope')
    const { group: _group, ...first } = records(grouped, 'cohort')[0]
    const { group: _empty, ...same } = records(plain, 'cohort')[0]
    expect(first).toEqual(same)
  })

  it('writes the header row of a sheet without rows', () => {
    const input = exportFixture()
    input.data.events = []
    // Only the derived parameter: no imported row is in scope.
    const workbook = read(workspaceWorkbookBytes({ ...input, parameterKeys: ['derived'] }))
    expect(records(workbook, 'events')).toEqual([])
    expect(header(workbook, 'events')[0]).toBe('PatientID')
    expect(records(workbook, 'aki_episodes')).toEqual([])
    expect(header(workbook, 'aki_episodes')).toHaveLength(10)
    expect(records(workbook, 'raw_measurements')).toEqual([])
    expect(header(workbook, 'raw_measurements')).toHaveLength(13)
  })

  it('names the ID PatientID in every sheet and writes one type: a number for a numeric ID', () => {
    const input = exportFixture()
    const rename = <T,>(value: T): T => value === '001-A' ? 7 as T : value
    const data = input.data
    data.rows = data.rows.map(row => ({ ...row, patientId: rename(row.patientId) }))
    data.rawRows = data.rawRows.map(row => ({ ...row, patientId: rename(row.patientId) }))
    data.patients = data.patients.map(patient => ({ ...patient, id: rename(patient.id) }))
    data.events = data.events.map(event => ({ ...event, patientId: rename(event.patientId) }))
    data.patientAttributes = { '7': data.patientAttributes['001-A'], hidden: data.patientAttributes.hidden }
    const workbook = read(workspaceWorkbookBytes({ ...input, cohortRows: input.cohortRows.map(row => ({ ...row, patientId: rename(row.patientId) })), patientIds: [7] }))
    for (const name of ['measurements', 'raw_measurements', 'cohort', 'events', 'patient_attributes', 'demographics']) {
      expect(workbook.Sheets[name].A1.v, name).toBe('PatientID')
      expect(workbook.Sheets[name].A2, name).toMatchObject({ t: 'n', v: 7 })
      expect(JSON.stringify(header(workbook, name)), name).not.toContain('patientId')
    }
  })

  it('leaves a number without a value as an empty cell, not as empty text', () => {
    const workbook = read(workspaceWorkbookBytes(exportFixture()))
    const sheet = workbook.Sheets.cohort
    const names = header(workbook, 'cohort')
    const cell = (name: string) => sheet[XLSX.utils.encode_cell({ r: 1, c: names.indexOf(name) })]
    // One measurement: no slope. Before, these were text cells holding ''.
    for (const name of ['slope', 'r2', 'ci_low', 'ci_high', 'intercept', 'slope_se', 'rolling_window_days', 'rolling_slope_min', 'endpoint_percent_change', 'endpoint_g4_first_value']) expect(cell(name), name).toBeUndefined()
    expect(cell('n')).toMatchObject({ t: 'n', v: 1 })
    expect(cell('reason')).toMatchObject({ t: 's', v: 'n_below_threshold' })
    // Text columns stay empty text, as before.
    expect(cell('aki')?.v ?? '').toBe('')
    const bound = exportFixture()
    Object.assign(bound.data.rawRows[0], { wertNum: null, wert: 'haemolytic', wertOperator: '' })
    expect(read(workspaceWorkbookBytes(bound)).Sheets.raw_measurements.F2).toBeUndefined()
  })

  it('adds first and last eligible value, sex and baseline age behind the earlier columns', () => {
    const input = exportFixture()
    input.data.patients[0].attributes.sex = 'w'
    const [first] = records(read(workspaceWorkbookBytes(input)), 'cohort')
    expect(first).toMatchObject({ Parameter: 'Marker|one', first_eligible_date: '2024-01-01', first_eligible_value: 10, last_eligible_value: 10, sex: 'w', baseline_age: 55 })
    // The same resolved values as the demographics sheet.
    expect(records(read(workspaceWorkbookBytes(input)), 'demographics')[0].baseline_age).toBe(first.baseline_age)
    input.data.patients[0].baselineAge = null
    delete input.data.patients[0].attributes.sex
    const blank = read(workspaceWorkbookBytes(input))
    const names = header(blank, 'cohort')
    expect(blank.Sheets.cohort[XLSX.utils.encode_cell({ r: 1, c: names.indexOf('baseline_age') })]).toBeUndefined()
    expect(records(blank, 'cohort')[0].sex ?? '').toBe('')
  })
})

describe('column directory', () => {
  it('describes every column of the cohort sheet, one row each, in sheet order', () => {
    const workbook = read(workspaceWorkbookBytes(exportFixture()))
    const rows = records(workbook, 'columns')
    expect(rows.map(row => row.column)).toEqual(header(workbook, 'cohort'))
    for (const row of rows) {
      expect(String(row.meaning).length, String(row.column)).toBeGreaterThan(10)
      expect(String(row.empty_when).length, String(row.column)).toBeGreaterThan(3)
    }
    // Every number and date has a unit; names are unique.
    for (const column of COHORT_SHEET_COLUMNS) if (column.kind !== 'text') expect(column.unit, column.name).not.toBe('')
    expect(new Set(COHORT_SHEET_HEADER).size).toBe(COHORT_SHEET_HEADER.length)
    expect(records(workbook, 'about').some(row => String(row.note).startsWith('The columns sheet describes every column of the cohort sheet'))).toBe(true)
  })

  it('describes the group cell of a patient without an attribute value as the export writes it', () => {
    const input = exportFixture()
    // The Trajectories table grouped by `group`; 001-A has no value for it.
    input.data.patientAttributes = { '001-A': { group: '  ' }, hidden: { group: 'SECRET' } }
    const sections = groupRows(input.cohortRows, row => input.data.patientAttributes[String(row.patientId)]?.group)
    const workbook = read(workspaceWorkbookBytes({ ...input, cohortRows: rowsWithGroupValue(sections) }))
    const cells = records(workbook, 'cohort').map(row => row.group)
    expect(cells).toEqual(['Not recorded', 'Not recorded'])
    const entry = records(workbook, 'columns').find(row => row.column === 'group')!
    // Not empty for such a patient, so the directory must not say so and must name the text.
    expect(String(entry.empty_when)).toBe('the table was not grouped')
    expect(String(entry.meaning)).toContain(`"${cells[0]}"`)
    expect(records(read(workspaceWorkbookBytes(exportFixture())), 'cohort').map(row => row.group ?? '')).toEqual(['', ''])
  })

  it('lists every export column of the analysis modules and rejects a column it does not know', () => {
    const keys = (analysisModules as readonly object[]).flatMap(module => 'exportColumns' in module ? (module.exportColumns as readonly { key: string }[]).map(column => column.key) : [])
    expect(keys.length).toBeGreaterThan(40)
    for (const key of keys) expect(COHORT_SHEET_HEADER, key).toContain(key)
    expect(() => cohortSheetRow({ PatientID: 1, undocumented_column: 1 })).toThrow(/undocumented_column/)
  })
})
