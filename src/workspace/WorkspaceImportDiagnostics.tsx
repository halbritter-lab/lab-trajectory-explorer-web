import { useEffect, useMemo, useState } from 'react'
import type { ImportDiagnosticRow } from '../core/parse/loader'
import type { LabRow } from '../core/types'
import type { ImportDiagnostic } from '../io/loadDataset'
import { downloadBlob, rowsToXlsxBytes } from '../io/export'
import { safeExportFilename } from './workspace-export'
import { dataChecks, diagnosticsBySource, IMPORT_SOURCE_LABELS, importDiagnosticRecords } from './import-diagnostics'
import { importMessage } from './labels/importMessages'
import { inEnglish, t, tp } from '../i18n'

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
        <thead><tr><th>{t('Row')}</th><th>{t('Patient')}</th><th>{t('Date')}</th><th>{t('Parameter')}</th><th>{t('Value')}</th></tr></thead>
        <tbody>{shown.map((row, i) => <tr key={i}><td>{row.row ?? '–'}</td><td>{row.patientId ?? '–'}</td><td>{row.date || '–'}</td><td>{row.parameter || '–'}</td><td>{row.value || '–'}</td></tr>)}</tbody>
      </table>
      {total > shown.length && <p className="muted">{total > rows.length ? t('Showing the first {shown} of {total} rows. The diagnostics download lists the first {listed}.', { shown: shown.length, total, listed: rows.length }) : t('Showing the first {shown} of {total} rows. The diagnostics download lists all of them.', { shown: shown.length, total })}</p>}
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
    <summary><strong>{label}</strong> ({[...new Set(details.map(d => d.sheet))].join(', ')}{rejected > 0 ? `, ${tp('{n} row rejected', '{n} rows rejected', rejected)}` : ''}): <span>{t('{n} import diagnostics — show details', { n: details.length })}</span></summary>
    <div className="data-diagnostics"><ul>{visible.map((d, i) => <li key={i}>
      {d.sheet}{d.row !== undefined ? `, ${t('row {row}', { row: d.row })}` : ''}{d.scope === 'sheet' ? '' : `, ${d.patientId === null ? t('patient without ID') : t('patient {id}', { id: d.patientId })}`}, {d.severity === 'rejected' ? t('rejected') : t('warning')}: {importMessage(d.reason)}
      {!!d.rows?.length && <AffectedRows rows={d.rows} total={d.affected ?? d.rows.length} summary={tp('Show the {n} affected row', 'Show the {n} affected rows', d.affected ?? d.rows.length)} />}
    </li>)}</ul>
      {remaining > 0 && <button type="button" onClick={() => setShowAll(true)}>{t('Show {remaining} remaining diagnostics', { remaining })}</button>}
    </div>
  </details>
}

/** The import findings of the loaded dataset, one list per source table (lab
 * values, events, attributes), with a download of all findings and data
 * checks. Rendered only when there is a finding. */
export function WorkspaceImportDiagnostics({ diagnostics, rows }: { diagnostics: ImportDiagnostic[]; rows: readonly LabRow[] }) {
  // Stable per import: each list resets its "show all" state when its findings change, not on every render.
  // The source labels are translated here, at render, so they follow a language switch.
  const groups = useMemo(() => diagnosticsBySource(diagnostics), [diagnostics])
  if (groups.length === 0) return null
  const rejected = diagnostics.some(d => d.severity === 'rejected')
  return <div className={`notice data-diagnostics-panel ${rejected ? 'amber' : ''}`} role="group" aria-label={t('Import diagnostics')}>
    <div className="data-diagnostics-sources">{groups.map(group => <SourceDiagnostics key={group.source} label={t(IMPORT_SOURCE_LABELS[group.source])} details={group.diagnostics} />)}</div>
    <button type="button" onClick={() => downloadBlob(rowsToXlsxBytes(inEnglish(() => importDiagnosticRecords(diagnostics, dataChecks(rows))), 'import_diagnostics'), safeExportFilename('import-diagnostics', 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}>{t('Download import diagnostics (XLSX)')}</button>
  </div>
}
