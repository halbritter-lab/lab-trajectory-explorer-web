import { useMemo, useRef } from 'react'
import { useAppStore } from '../state/store'
import { patientLabel } from '../options'
import { comparePatientIds, patientIdKey } from '../../core/types'

const DEMO_WORKBOOK_HREF = `${import.meta.env.BASE_URL}test_labs.xlsx`

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

export function Toolbar() {
  const fileInput = useRef<HTMLInputElement>(null)
  const rows = useAppStore((s) => s.rows)
  // Derive patient ids from rows via useMemo. Calling a store method that builds
  // a fresh array inside the selector returns a new reference every render and
  // sends Zustand into an infinite re-render loop (React error #185).
  const patientIds = useMemo(() => [...new Set(rows.map((r) => r.patientId))].sort(comparePatientIds), [rows])
  const selected = useAppStore((s) => s.selectedPatientId)
  const view = useAppStore((s) => s.view)
  const cohortDisplayMode = useAppStore((s) => s.cohortDisplayMode)
  const selectPatient = useAppStore((s) => s.selectPatient)
  const setView = useAppStore((s) => s.setView)
  const showMethodology = useAppStore((s) => s.showMethodology)
  const setShowMethodology = useAppStore((s) => s.setShowMethodology)
  const cohortZoom = useAppStore((s) => s.cohortZoom)
  const setCohortZoom = useAppStore((s) => s.setCohortZoom)
  const persist = useAppStore((s) => s.persist)
  const setPersist = useAppStore((s) => s.setPersist)
  const clearSaved = useAppStore((s) => s.clearSaved)
  const busy = useAppStore((s) => s.busy)
  const loadFile = useAppStore((s) => s.loadFile)
  const loadSynthetic = useAppStore((s) => s.loadSynthetic)
  const hasData = patientIds.length > 0

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await loadFile(file)
    e.target.value = '' // allow re-selecting the same file after an error
  }

  function onClearSaved() {
    if (window.confirm('Remove the dataset saved on this device? This cannot be undone.')) void clearSaved()
  }

  return (
    <header className="toolbar">
      <strong className="brand">Lab Trajectory Explorer</strong>
      {hasData && (
        <>
          <button disabled={busy} onClick={() => fileInput.current?.click()}>Upload xlsx/csv</button>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
          <span className="split-load">
            <button disabled={busy} onClick={() => void loadSynthetic()}>{busy ? 'Loading…' : 'Load demo data'}</button>
            <a href={DEMO_WORKBOOK_HREF} download="test_labs.xlsx" title="Download demo workbook" aria-label="Download demo workbook">
              <DownloadIcon />
            </a>
          </span>
        </>
      )}
      {hasData && (
        <label className="patient-picker">
          Patient
          <select
            aria-label="Patient"
            value={selected ?? ''}
            onChange={(e) => {
              const id = patientIds.find((pid) => patientIdKey(pid) === e.target.value)
              if (id !== undefined) selectPatient(id)
            }}
          >
            {patientIds.map((id) => <option key={patientIdKey(id)} value={patientIdKey(id)}>{patientLabel(rows, id)}</option>)}
          </select>
        </label>
      )}
      {hasData && (
        <span className="view-switch segmented">
          <button aria-pressed={view === 'one'} onClick={() => setView('one')}>One</button>
          <button aria-pressed={view === 'cohort'} onClick={() => setView('cohort')}>Cohort</button>
        </span>
      )}
      {hasData && view === 'cohort' && cohortDisplayMode === 'table' && (
        <span className="zoom-switch segmented" role="group" aria-label="Mini-graph size">
          {(['s', 'm', 'l'] as const).map((z) => (
            <button key={z} title={`Mini-graph size: ${{ s: 'small', m: 'medium', l: 'large' }[z]}`} aria-pressed={cohortZoom === z} onClick={() => setCohortZoom(z)}>{z.toUpperCase()}</button>
          ))}
        </span>
      )}
      <button className="methodology-link" onClick={() => setShowMethodology(!showMethodology)}>{showMethodology ? '← Back to data' : 'Theory & Methods'}</button>
      <label className="persist-toggle" title="Stores this dataset unencrypted in your browser on this device only">
        <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} /> Remember on this device
      </label>
      <button className="clear-saved" onClick={onClearSaved}>Clear saved data</button>
    </header>
  )
}
