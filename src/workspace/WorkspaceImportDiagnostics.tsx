import { useEffect, useState } from 'react'
import type { ImportDiagnosticRow } from '../core/parse/loader'
import type { LabRow } from '../core/types'
import type { ImportDiagnostic } from '../io/loadDataset'
import { downloadBlob, rowsToXlsxBytes } from '../io/export'
import { safeExportFilename } from './workspace-export'
import { dataChecks, diagnosticsBySource, importDiagnosticRecords } from './import-diagnostics'
import { countLabel } from './workspace-labels'

const DIAGNOSTIC_PREVIEW_LIMIT = 20
/** Rows shown per list on the page; the download holds all listed rows. */
const ROW_PREVIEW_LIMIT = 200

/** The rows behind a count or a collective finding, collapsed until opened. */
export function AffectedRows({ rows, total = rows.length, summary }: { rows: readonly ImportDiagnosticRow[]; total?: number; summary: string }) {
  // The table is built when the list is first opened, not for every collapsed list.
  const [opened, setOpened] = useState(false)
  const shown = rows.slice(0, ROW_PREVIEW_LIMIT)
  return <details className="data-affected-rows">
    <summary onClick={() => setOpened(true)}>{summary}</summary>
    {opened && <div className="table-scroll data-preview-scroll" role="region" aria-label={summary} tabIndex={0}>
      <table>
        <thead><tr><th>Row</th><th>Patient</th><th>Date</th><th>Parameter</th><th>Value</th></tr></thead>
        <tbody>{shown.map((row, i) => <tr key={i}><td>{row.row ?? '–'}</td><td>{row.patientId ?? '–'}</td><td>{row.date || '–'}</td><td>{row.parameter || '–'}</td><td>{row.value || '–'}</td></tr>)}</tbody>
      </table>
      {total > shown.length && <p className="muted">Showing the first {shown.length} of {total} rows. The diagnostics download lists {total > rows.length ? `the first ${rows.length}` : 'all of them'}.</p>}
    </div>}
  </details>
}

function SourceDiagnostics({ label, details }: { label: string; details: ImportDiagnostic[] }) {
  const [showAll, setShowAll] = useState(false)
  useEffect(() => setShowAll(false), [details])
  const visible = showAll ? details : details.slice(0, DIAGNOSTIC_PREVIEW_LIMIT)
  const remaining = details.length - visible.length
  const rejected = details.filter(d => d.severity === 'rejected').length
  return <details className="data-diagnostics-source">
    <summary><strong>{label}</strong> ({details[0].sheet}{rejected > 0 ? `, ${countLabel(rejected, 'row')} rejected` : ''}): <span>{details.length} import diagnostics — show details</span></summary>
    <div className="data-diagnostics"><ul>{visible.map((d, i) => <li key={i}>
      {d.sheet}{d.row !== undefined ? `, row ${d.row}` : ''}{d.scope === 'sheet' ? '' : `, patient ${d.patientId ?? 'without ID'}`}, {d.severity === 'rejected' ? 'rejected' : 'warning'}: {d.reason}
      {!!d.rows?.length && <AffectedRows rows={d.rows} total={d.affected ?? d.rows.length} summary={`Show the ${countLabel(d.affected ?? d.rows.length, 'affected row')}`} />}
    </li>)}</ul>
      {remaining > 0 && <button type="button" onClick={() => setShowAll(true)}>Show {remaining} remaining diagnostics</button>}
    </div>
  </details>
}

/** The import findings of the loaded dataset, one list per source table (lab
 * values, events, attributes), with a download of all findings and data
 * checks. Rendered only when there is a finding. */
export function WorkspaceImportDiagnostics({ diagnostics, rows }: { diagnostics: ImportDiagnostic[]; rows: readonly LabRow[] }) {
  const groups = diagnosticsBySource(diagnostics)
  if (groups.length === 0) return null
  const rejected = diagnostics.some(d => d.severity === 'rejected')
  return <div className={`notice data-diagnostics-panel ${rejected ? 'amber' : ''}`} role="group" aria-label="Import diagnostics">
    <div className="data-diagnostics-sources">{groups.map(group => <SourceDiagnostics key={group.source} label={group.label} details={group.diagnostics} />)}</div>
    <button type="button" onClick={() => downloadBlob(rowsToXlsxBytes(importDiagnosticRecords(diagnostics, dataChecks(rows)), 'import_diagnostics'), safeExportFilename('import-diagnostics', 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}>Download import diagnostics (XLSX)</button>
  </div>
}
