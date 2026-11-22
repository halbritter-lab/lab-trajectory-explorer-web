import type { LabRow } from '../core/types'
import { diagnosticRow, type ImportDiagnosticRow } from '../core/parse/loader'
import { implausiblyHighCreatinineRows, nonPositiveCreatinineRows } from '../core/domains/nephrology/aki/akiAware'
import { IMPLAUSIBLE_CREATININE_ABOVE_MGDL } from '../core/domains/nephrology/constants'
import { IMPORT_SOURCES, type ImportDiagnostic, type ImportSource } from '../io/loadDataset'
import { countLabel } from './workspace-labels'
import { msg, t, tp, type MessageKey } from '../i18n'

export const IMPORT_SOURCE_LABELS: Record<ImportSource, MessageKey> = { labs: msg('Lab values'), events: msg('Events'), attributes: msg('Attributes') }

/** The findings of each source table that has any, in the fixed order lab
 * values, events, attributes. */
export function diagnosticsBySource(diagnostics: readonly ImportDiagnostic[]): { source: ImportSource; label: string; diagnostics: ImportDiagnostic[] }[] {
  return IMPORT_SOURCES.map(source => ({ source, label: t(IMPORT_SOURCE_LABELS[source]), diagnostics: diagnostics.filter(d => d.source === source) }))
    .filter(group => group.diagnostics.length > 0)
}

/** A count the Data page shows about the imported lab rows, with the rows
 * behind it. Computed from the rows, not stored: it holds for a restored
 * dataset as well. */
export interface DataCheck {
  id: 'no_date' | 'no_number' | 'creatinine_non_positive' | 'creatinine_high'
  message: string
  rows: ImportDiagnosticRow[]
}

/** The row lists behind the Data page counts: values without a date, values
 * without a numeric measurement, and serum creatinine values of zero or less
 * or above the plausibility limit. Checks without a row are left out. */
export function dataChecks(rows: readonly LabRow[]): DataCheck[] {
  const noDate = rows.filter(r => !r.labDatum)
  const noNumber = rows.filter(r => r.wertNum === null)
  const nonPositive = nonPositiveCreatinineRows(rows)
  const high = implausiblyHighCreatinineRows(rows)
  const checks: DataCheck[] = [
    { id: 'no_date', message: t('{values} without a date; kept, but used in no dated calculation.', { values: countLabel(noDate.length, 'value') }), rows: noDate.map(r => diagnosticRow(r)) },
    { id: 'no_number', message: t('{values} without a numeric measurement; kept, but used in no calculation.', { values: countLabel(noNumber.length, 'value') }), rows: noNumber.map(r => diagnosticRow(r)) },
    { id: 'creatinine_non_positive', message: tp('{n} serum creatinine value of zero or less: not plausible, so not used for AKI detection or eGFR.', '{n} serum creatinine values of zero or less: not plausible, so not used for AKI detection or eGFR.', nonPositive.length), rows: nonPositive.map(r => diagnosticRow(r)) },
    { id: 'creatinine_high', message: tp('{n} serum creatinine value above {limit} mg/dl (µmol/l converted): not plausible, check the unit. The values are used unchanged.', '{n} serum creatinine values above {limit} mg/dl (µmol/l converted): not plausible, check the unit. The values are used unchanged.', high.length, { limit: IMPLAUSIBLE_CREATININE_ABOVE_MGDL }), rows: high.map(r => diagnosticRow(r)) },
  ]
  return checks.filter(check => check.rows.length > 0)
}

/** One line of the `import_diagnostics` sheet and file. */
export interface ImportDiagnosticRecord {
  source: ImportSource
  sheet: string
  kind: 'rejected' | 'warning' | 'data check'
  row: number | ''
  patient_id: string | number
  date: string
  parameter: string
  value: string
  message: string
}

/**
 * The import findings and data checks as table rows: a finding about one row
 * gives one line; a collective finding gives one line per listed row, each
 * repeating the message, and a last line without a row when more rows were
 * affected than listed; a finding without rows gives one line.
 */
export function importDiagnosticRecords(diagnostics: readonly ImportDiagnostic[], checks: readonly DataCheck[] = []): ImportDiagnosticRecord[] {
  const out: ImportDiagnosticRecord[] = []
  const line = (source: ImportSource, sheet: string, kind: ImportDiagnosticRecord['kind'], message: string, row?: Partial<ImportDiagnosticRow>): ImportDiagnosticRecord =>
    ({ source, sheet, kind, row: row?.row ?? '', patient_id: row?.patientId ?? '', date: row?.date ?? '', parameter: row?.parameter ?? '', value: row?.value ?? '', message })
  for (const group of diagnosticsBySource(diagnostics)) {
    for (const d of group.diagnostics) {
      if (!d.rows?.length) { out.push(line(d.source, d.sheet, d.severity, d.reason, { row: d.row ?? null, patientId: d.patientId })); continue }
      for (const row of d.rows) out.push(line(d.source, d.sheet, d.severity, d.reason, row))
      if (d.affected !== undefined && d.affected > d.rows.length) out.push(line(d.source, d.sheet, d.severity, `${d.reason} (${t('{n} further rows are not listed.', { n: d.affected - d.rows.length })})`, { patientId: d.patientId }))
    }
  }
  for (const check of checks) for (const row of check.rows) out.push(line('labs', '', 'data check', check.message, row))
  return out
}
