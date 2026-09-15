import { useEffect, useRef, useState } from 'react'
import type { LabRow, PatientId } from '../core/types'
import { Methodology } from '../ui/pages/Methodology'
import { DataWorkspace } from './DataWorkspace'
import { TrajectoriesWorkspace } from './TrajectoriesWorkspace'
import { useWorkspaceData } from './workspace-data'

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
      const targetPage = state?.page ?? 'Data'
      setRequestedPerson(null)
      setPage(targetPage)
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
      <div className="workspace-brand"><span aria-hidden="true" className="workspace-logo">↗</span><div><strong>Lab Trajectory Explorer</strong><span>Workspace · Preview</span></div></div>
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
      <span>This session only</span>
    </div>
    <main id="workspace-main" className="workspace-main" ref={mainRef} tabIndex={-1}>
      <section hidden={page !== 'Data'} aria-label="Data workspace">
        <DataWorkspace onBrowse={id => {
          setRequestedPerson(id === undefined ? null : { id, rows: data.rawRows })
          setPage('Trajectories')
          if (typeof window !== 'undefined' && window.history?.pushState) {
            window.history.pushState({ page: 'Trajectories', mode: id ? 'detail' : 'table', patientId: id ?? null }, '')
          }
        }} />
      </section>
      <section hidden={page !== 'Trajectories'} aria-label="Trajectory workspace">
        {hasData ? <TrajectoriesWorkspace key={datasetKey(data.rawRows)} data={data}
          requestedPatientId={requestedPerson?.rows === data.rawRows ? requestedPerson.id : null} />
          : <div className="card"><h1>Compare trajectories</h1><p>Load a file or the demo data first. Then compare patients and multiple parameters in the table, individual view and overlay.</p><button type="button" className="primary" onClick={() => go('Data')}>Load data</button></div>}
      </section>
      {page === 'Cohort models' && <section className="card workspace-model-pending">
        <p className="eyebrow">Shared models</p><h1>Cohort models</h1>
        <p>Explore associations between trajectories and patient characteristics such as genotype, age or treatment group.</p>
        <p className="notice">Model fitting is not yet connected in this workspace. The first workflow covers data review, derivations, patient comparison and export.</p>
        <p>Existing models remain available in the <a href="./index.html">original application</a> with a separate file import.</p>
        <button type="button" onClick={() => go(hasData ? 'Trajectories' : 'Data')}>{hasData ? 'View trajectories' : 'Load data'}</button>
      </section>}
      {page === 'Methods' && <section className="card workspace-methodology">
        <h1>Methods and interpretation</h1>
        <h2>Available in this workspace</h2>
        <p>Start with Data to review measurements and demographics, then preview and apply a derived eGFR series. Use Trajectories to compare parameters across patients or inspect one patient. The same patient and parameter selection controls the table, overlay and workbook export.</p>
        <p>Optional individual trend lines use ordinary least squares (OLS) on the available numeric measurements. This general exploration configuration does not exclude AKI windows, censor measurements at clinical events, or aggregate measurements over time. Slope and R² describe the fitted data; quality notices flag limited support for a slope.</p>
        <p>Derived eGFR values use the chosen formula, creatinine source and resolved demographics. The Data preview explains unavailable values before applying a calculation. Select the source parameter as well to include its imported measurements in the export.</p>
        <h2>Available in the original application only</h2>
        <p>The sidebar, CKD-progression fit presets, configurable exclusions and time balancing, mixed models and trend projections described in the full reference are not yet connected here. Open the <a href="./index.html">original application</a> and import the file there to use those controls.</p>
        <details><summary>Full application reference — includes features not available here</summary><Methodology /></details>
      </section>}
    </main>
    <footer className="workspace-footer">Research use only · Not a medical device or a basis for clinical decisions. Computed values and trends are algorithmic estimates.</footer>
  </div>
}
