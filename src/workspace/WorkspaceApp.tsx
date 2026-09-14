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
  const go = (next: Page) => { setRequestedPerson(null); setPage(next) }

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    mainRef.current?.focus({ preventScroll: true })
  }, [page])

  return <div className="workspace-app">
    <a className="skip-link" href="#workspace-main">Skip to content</a>
    <header className="workspace-header">
      <div className="workspace-brand"><span aria-hidden="true" className="workspace-logo">↗</span><div><strong>Lab Trajectory Explorer</strong><span>Workspace · Preview</span></div></div>
      <nav aria-label="Main navigation" className="workspace-nav">
        {(['Data', 'Trajectories', 'Cohort models'] as const).map((name, index) => <button type="button" key={name}
          aria-current={page === name ? 'page' : undefined} onClick={() => go(name)}>
          <span aria-hidden="true">0{index + 1}</span> {name}
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
        }} />
      </section>
      <section hidden={page !== 'Trajectories'} aria-label="Trajectory workspace">
        {hasData ? <TrajectoriesWorkspace key={datasetKey(data.rawRows)} data={data}
          requestedPatientId={requestedPerson?.rows === data.rawRows ? requestedPerson.id : null} />
          : <div className="card"><h1>Compare trajectories</h1><p>Load a file or the demo data first. Then compare patients and multiple parameters in the table, individual view and overlay.</p><button type="button" className="primary" onClick={() => go('Data')}>Load data</button></div>}
      </section>
      {page === 'Cohort models' && <section className="card workspace-model-pending">
        <p className="eyebrow">03 / Shared models</p><h1>Cohort models</h1>
        <p>Explore associations between trajectories and patient characteristics such as genotype, age or treatment group.</p>
        <p className="notice">Model fitting is not yet connected in this workspace. The first workflow covers data review, derivations, patient comparison and export.</p>
        <p>Existing models remain available in the <a href="./index.html">original application</a> with a separate file import.</p>
        <button type="button" onClick={() => go(hasData ? 'Trajectories' : 'Data')}>{hasData ? 'View trajectories' : 'Load data'}</button>
      </section>}
      {page === 'Methods' && <section className="card workspace-methodology"><h1>Methods and interpretation</h1><p>The application methodology describes the calculations and their limitations. This first workspace uses the general OLS analysis for individual trajectories; additional fit settings will follow separately.</p><Methodology /></section>}
    </main>
    <footer className="workspace-footer">Research use only · Not a medical device or a basis for clinical decisions. Computed values and trends are algorithmic estimates.</footer>
  </div>
}
