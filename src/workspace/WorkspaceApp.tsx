import { useEffect, useRef, useState } from 'react'
import { version } from '../../package.json'
import type { LabRow, PatientId } from '../core/types'
import { Methodology } from './methods/Methodology'
import { DataWorkspace } from './DataWorkspace'
import { TrajectoriesWorkspace } from './TrajectoriesWorkspace'
import { CohortModelsWorkspace } from './CohortModelsWorkspace'
import { useWorkspaceData } from './workspace-data'
import { countLabel } from './workspace-labels'
import { useWorkspaceStorage } from './workspace-storage'
import { getMethodLocation, type HelpWorkspace } from './methods/method-navigation'

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
  const [page, setPage] = useState<Page>(() => getMethodLocation() ? 'Methods' : 'Data')
  const [requestedPerson, setRequestedPerson] = useState<{ id: PatientId; rows: LabRow[] } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const helpOrigin = useRef<HelpWorkspace>('Data')
  const firstRender = useRef(true)
  const hasData = data.rawRows.length > 0

  const go = (next: Page, pushHistory = true) => {
    setRequestedPerson(null)
    setPage(next)
    if (pushHistory && typeof window !== 'undefined' && window.history?.pushState) {
      if (next === 'Methods' && page === 'Methods') window.location.hash = '#methods/start'
      else if (next === 'Methods') window.history.pushState({ page: next, mode: 'table' }, '', '#methods/start')
      else if (getMethodLocation()) window.history.pushState({ page: next, mode: 'table' }, '', window.location.pathname + window.location.search)
      else window.history.pushState({ page: next, mode: 'table' }, '')
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const current = window.history.state as { page?: Page } | null
      if (!current?.page) {
        window.history.replaceState({ page: getMethodLocation() ? 'Methods' : 'Data', mode: 'table' }, '')
      }
    }
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { page?: Page } | null
      // In-page anchors (such as the methodology section links) add history
      // entries without app state; they must not leave the current page.
      if (getMethodLocation()) { setPage('Methods'); return }
      if (!state?.page) return
      setRequestedPerson(null)
      setPage(state.page)
    }
    const onHashChange = () => { if (getMethodLocation()) setPage('Methods') }
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  useEffect(() => {
    if (page !== 'Methods') helpOrigin.current = page
    if (firstRender.current) { firstRender.current = false; return }
    // The help article focuses its topic or section, including on a fresh deep link.
    if (page === 'Methods') return
    mainRef.current?.focus({ preventScroll: true })
  }, [page])

  return <div className="workspace-app">
    <a className="skip-link" href="#workspace-main" onClick={event => {
      event.preventDefault()
      mainRef.current?.focus({ preventScroll: true })
      mainRef.current?.scrollIntoView({ block: 'start' })
    }}>Skip to content</a>
    <header className="workspace-header">
      <div className="workspace-brand"><span aria-hidden="true" className="workspace-logo">↗</span><div><div className="workspace-title"><strong>Lab Trajectory Explorer</strong><small className="workspace-version" aria-label={`Version ${version}`}>v{version}</small></div><span>Longitudinal lab data · research use only</span></div></div>
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
      {hasData && <span>{countLabel(data.patients.length, 'patient')} · {countLabel(data.parameters.length, 'parameter')} · {countLabel(data.rawRows.length, 'source measurement')}</span>}
      <span>{storageStatus === 'saved' ? 'Saved on this device' : storageStatus === 'saving' ? 'Saving …' : storageStatus === 'error' ? 'Check local storage in Data' : 'This session only'}</span>
    </div>
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
        <Methodology onNavigate={go} returnTo={helpOrigin.current} />
      </section>}
    </main>
    <footer className="workspace-footer">
      <p>Research use only · Not a medical device or a basis for clinical decisions. Computed values and trends are algorithmic estimates.</p>
      <div className="workspace-footer-links">
        <nav aria-label="Project links">
          <a href="https://github.com/halbritter-lab/lab-trajectory-explorer-web" target="_blank" rel="noopener noreferrer" aria-label="GitHub (opens in a new tab)">GitHub</a>
          <a href="https://www.uniklinik-freiburg.de/medizin4/forschung/nephrolab/groups/jan-halbritter.html" target="_blank" rel="noopener noreferrer" aria-label="Halbritter Lab (opens in a new tab)">Halbritter Lab</a>
        </nav>
        <p>Created by <a href="https://jplerch.eu/" target="_blank" rel="noopener noreferrer" aria-label="Jan-Paul Lerch (opens in a new tab)">Jan-Paul Lerch</a></p>
      </div>
    </footer>
  </div>
}
