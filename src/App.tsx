import { useRef } from 'react'
import { useAppStore } from './ui/state/store'
import { Toolbar } from './ui/shell/Toolbar'
import { Sidebar } from './ui/shell/Sidebar'
import { SeriesStrip } from './ui/seriesStrip/SeriesStrip'
import { OnePatientView } from './ui/patient/OnePatientView'
import { CohortView } from './ui/cohort/CohortView'
import { Methodology } from './ui/pages/Methodology'
import './ui/app.css'

const TEST_DATA_HREF = `${import.meta.env.BASE_URL}test_labs.xlsx`

function EmptyState() {
  const setShowMethodology = useAppStore((s) => s.setShowMethodology)
  const busy = useAppStore((s) => s.busy)
  const loadFile = useAppStore((s) => s.loadFile)
  const loadSynthetic = useAppStore((s) => s.loadSynthetic)
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <div className="empty-state">
      <p>Upload a workbook or load the synthetic dataset to begin.</p>
      <div className="empty-state-actions">
        <button disabled={busy} onClick={() => fileInput.current?.click()}>Upload xlsx/csv</button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) { await loadFile(f); e.target.value = '' } }}
        />
        <button disabled={busy} onClick={() => void loadSynthetic()}>{busy ? 'Loading…' : 'Load synthetic data'}</button>
        <a className="button-link" href={TEST_DATA_HREF} download="test_labs.xlsx">Download test data</a>
      </div>
      <p className="empty-state-hint">
        New here? Read the{' '}
        <button className="link-button" onClick={() => setShowMethodology(true)}>Theory &amp; Methods</button>{' '}
        page for how slopes, eGFR, and AKI detection work.
      </p>
    </div>
  )
}

export function App() {
  const hasData = useAppStore((s) => s.rows.length > 0)
  const view = useAppStore((s) => s.view)
  const showMethodology = useAppStore((s) => s.showMethodology)
  const notice = useAppStore((s) => s.notice)
  const setNotice = useAppStore((s) => s.setNotice)
  const busy = useAppStore((s) => s.busy)
  return (
    <div className="app">
      <Toolbar />
      {/* Polite live region announces load success/failure to screen readers. */}
      <div className="status-region" role="status" aria-live="polite">
        {notice && (
          <div className={`notice notice-${notice.kind}`}>
            <span>{notice.text}</span>
            <button className="notice-dismiss" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
          </div>
        )}
      </div>
      <div className="body">
        <Sidebar />
        <main className="main" aria-busy={busy}>
          {showMethodology ? (
            <Methodology />
          ) : hasData ? (
            <>
              <SeriesStrip />
              {view === 'cohort' ? <CohortView /> : <OnePatientView />}
            </>
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
      <footer className="app-disclaimer" role="contentinfo">
        Research use only — not a medical device and not for clinical decision-making. All slopes,
        eGFR, and AKI episodes are algorithmic estimates.
      </footer>
    </div>
  )
}
