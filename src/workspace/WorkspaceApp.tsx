import { useEffect, useRef, useState } from 'react'
import type { LabRow, PatientId } from '../core/types'
import { Methodology } from './methods/Methodology'
import { DataWorkspace } from './DataWorkspace'
import { TrajectoriesWorkspace } from './TrajectoriesWorkspace'
import { CohortModelsWorkspace } from './CohortModelsWorkspace'
import { useWorkspaceData } from './workspace-data'
import { useWorkspaceStorage } from './workspace-storage'
import { CKD_G4_EGFR_THRESHOLD, CKD_G5_EGFR_THRESHOLD, DEFAULT_CONFIRMATION_DAYS } from '../core/domains/nephrology/constants'

type Page = 'Data' | 'Trajectories' | 'Cohort models' | 'Methods'
const datasetKeys = new WeakMap<LabRow[], number>()
let nextDatasetKey = 0
function datasetKey(rows: LabRow[]): number {
  let key = datasetKeys.get(rows)
  if (key === undefined) { key = ++nextDatasetKey; datasetKeys.set(rows, key) }
  return key
}

export function WorkspaceApp() {
  const data = useWorkspaceData()
  const storageStatus = useWorkspaceStorage(s => s.status)
  const [page, setPage] = useState<Page>('Data')
  const [requestedPerson, setRequestedPerson] = useState<{ id: PatientId; rows: LabRow[] } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const hasData = data.rawRows.length > 0

  const go = (next: Page, pushHistory = true) => {
    setRequestedPerson(null)
    setPage(next)
    if (pushHistory && typeof window !== 'undefined' && window.history?.pushState) {
      window.history.pushState({ page: next, mode: 'table' }, '')
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const current = window.history.state as { page?: Page } | null
      if (!current?.page) {
        window.history.replaceState({ page: 'Data', mode: 'table' }, '')
      }
    }
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { page?: Page } | null
      // In-page anchors (such as the methodology section links) add history
      // entries without app state; they must not leave the current page.
      if (!state?.page) return
      setRequestedPerson(null)
      setPage(state.page)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    mainRef.current?.focus({ preventScroll: true })
  }, [page])

  return <div className="workspace-app">
    <a className="skip-link" href="#workspace-main">Skip to content</a>
    <header className="workspace-header">
      <div className="workspace-brand"><span aria-hidden="true" className="workspace-logo">↗</span><div><strong>Lab Trajectory Explorer</strong><span>Longitudinal lab data · research use only</span></div></div>
      <nav aria-label="Main navigation" className="workspace-nav">
        {(['Data', 'Trajectories', 'Cohort models'] as const).map(name => <button type="button" key={name}
          aria-current={page === name ? 'page' : undefined} onClick={() => go(name)}>
          {name}
        </button>)}
      </nav>
      <button type="button" className="workspace-help" aria-current={page === 'Methods' ? 'page' : undefined} onClick={() => go('Methods')}>Methods</button>
    </header>
    <div className="workspace-dataset" role="status">
      <span>{hasData ? data.fileName ?? 'Loaded dataset' : 'No data loaded yet'}</span>
      {hasData && <span>{data.patients.length} patients · {data.parameters.length} parameters · {data.rawRows.length} source measurements</span>}
      <span>{storageStatus === 'saved' ? 'Saved on this device' : storageStatus === 'saving' ? 'Saving …' : storageStatus === 'error' ? 'Check local storage in Data' : 'This session only'}</span>
    </div>
    <p className="workspace-guide">Data: prepare and check inputs · Trajectories: compare individual courses · Cohort models: estimate population associations</p>
    <main id="workspace-main" className="workspace-main" ref={mainRef} tabIndex={-1}>
      <section hidden={page !== 'Data'} aria-label="Data workspace">
        <DataWorkspace onBrowse={id => {
          setRequestedPerson(id === undefined ? null : { id, rows: data.rawRows })
          setPage('Trajectories')
          if (typeof window !== 'undefined' && window.history?.pushState) {
            window.history.pushState({ page: 'Trajectories', mode: id !== undefined ? 'detail' : 'table', patientId: id ?? null }, '')
          }
        }} />
      </section>
      <section hidden={page !== 'Trajectories'} aria-label="Trajectory workspace">
        {hasData ? <TrajectoriesWorkspace key={datasetKey(data.rawRows)} data={data}
          requestedPatientId={requestedPerson?.rows === data.rawRows ? requestedPerson.id : null} />
          : <div className="card"><h1>Compare trajectories</h1><p>Load a file or the demo data first. Then compare patients and multiple parameters in the table, individual view and overlay.</p><button type="button" className="primary" onClick={() => go('Data')}>Load data</button></div>}
      </section>
      <section hidden={page !== 'Cohort models'} aria-label="Cohort model workspace">
        <CohortModelsWorkspace key={datasetKey(data.rawRows)}
          data={data}
          onBrowseTrajectories={() => go('Trajectories')}
          onBrowseData={() => go('Data')}
        />
      </section>
      {page === 'Methods' && <section className="card workspace-methodology">
        <h1>Methods and interpretation</h1>
        <h2>Available in this workspace</h2>
        <p>Start with Data to review measurements and demographics, then preview and apply a derived eGFR series. Use Trajectories to compare parameters across patients or inspect one patient. The same patient and parameter selection controls the table, overlay and workbook export.</p>
        <p>Individual analyses support OLS, Theil–Sen, rolling OLS, segmented OLS and no fit. Choose a shared preset or override settings for one parameter column. Advanced settings control clinical-event censoring, AKI exclusions and time aggregation. General exploration defaults to OLS without these exclusions or aggregation. Slope and R² describe the fitted data; quality notices refer to the measurements actually used by the fit.</p>
        <p>Derived eGFR values use the chosen formula, creatinine source and resolved demographics. The Data preview explains unavailable values before applying a calculation. Select the source parameter as well to include its imported measurements in the export.</p>
        <p>Cohort models allow fitting population-level linear mixed models (WebR / lme4) and evaluating trend projections directly within this workspace.</p>
          <h2>Reference &amp; Theory</h2>
          <h3>Observed endpoints and individual prediction</h3>
          <p>G4 uses eGFR below {CKD_G4_EGFR_THRESHOLD} and G5 below {CKD_G5_EGFR_THRESHOLD} mL/min/1.73m². A first low measurement starts a candidate. A later low measurement confirms it after the configured minimum interval (default {DEFAULT_CONFIRMATION_DAYS} days). Recovery before confirmation restarts the candidate; recovery afterwards is shown separately and preserves the event. Event date and confirmation date remain distinct.</p>
          <p>Endpoints and individual endpoint prediction use all dated exact numeric measurements, including later recovery, independently of display-fit censoring and aggregation. Values marked &lt; or &gt; remain visible but are excluded from calculations. Prediction extends the global fitted curve, using OLS or the selected Theil–Sen estimator. New measurements can change a prediction but do not revoke an already confirmed event in that history.</p>
          <p>Theil–Sen requires at least three measurements and two distinct dates. Its intercept is median(value) minus slope × median(time); 95% slope confidence bounds quantify slope uncertainty, not the range of future individual measurements.</p>
        <Methodology />
      </section>}
    </main>
    <footer className="workspace-footer">Research use only · Not a medical device or a basis for clinical decisions. Computed values and trends are algorithmic estimates.</footer>
  </div>
}
