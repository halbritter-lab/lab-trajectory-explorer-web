import { useEffect, useRef, useState } from 'react'
import type { LabRow, PatientId } from '../core/types'
import { Methodology } from '../ui/pages/Methodology'
import { DataWorkspace } from './DataWorkspace'
import { TrajectoriesWorkspace } from './TrajectoriesWorkspace'
import { useWorkspaceData } from './workspace-data'

type Page = 'Daten' | 'Verläufe' | 'Kohortenmodelle' | 'Methodik'
const datasetKeys = new WeakMap<LabRow[], number>()
let nextDatasetKey = 0
function datasetKey(rows: LabRow[]): number {
  let key = datasetKeys.get(rows)
  if (key === undefined) { key = ++nextDatasetKey; datasetKeys.set(rows, key) }
  return key
}

export function WorkspaceApp() {
  const data = useWorkspaceData()
  const [page, setPage] = useState<Page>('Daten')
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
    <a className="skip-link" href="#workspace-main">Zum Inhalt</a>
    <header className="workspace-header">
      <div className="workspace-brand"><span aria-hidden="true" className="workspace-logo">↗</span><div><strong>Lab Trajectory Explorer</strong><span>Arbeitsplatz · Vorschau</span></div></div>
      <nav aria-label="Hauptnavigation" className="workspace-nav">
        {(['Daten', 'Verläufe', 'Kohortenmodelle'] as const).map((name, index) => <button type="button" key={name}
          aria-current={page === name ? 'page' : undefined} onClick={() => go(name)}>
          <span aria-hidden="true">0{index + 1}</span> {name}
        </button>)}
      </nav>
      <button type="button" className="workspace-help" aria-current={page === 'Methodik' ? 'page' : undefined} onClick={() => go('Methodik')}>Methodik</button>
    </header>
    <div className="workspace-dataset" role="status">
      <span>{hasData ? data.fileName ?? 'Geladener Datensatz' : 'Noch keine Daten geladen'}</span>
      {hasData && <span>{data.patients.length} Personen · {data.parameters.length} Parameter · {data.rawRows.length} Quellmessungen</span>}
      <span>Nur diese Sitzung</span>
    </div>
    <main id="workspace-main" className="workspace-main" ref={mainRef} tabIndex={-1}>
      <section hidden={page !== 'Daten'} aria-label="Datenarbeitsplatz">
        <DataWorkspace onBrowse={id => {
          setRequestedPerson(id === undefined ? null : { id, rows: data.rawRows })
          setPage('Verläufe')
        }} />
      </section>
      <section hidden={page !== 'Verläufe'} aria-label="Verlaufsarbeitsplatz">
        {hasData ? <TrajectoriesWorkspace key={datasetKey(data.rawRows)} data={data}
          requestedPatientId={requestedPerson?.rows === data.rawRows ? requestedPerson.id : null} />
          : <div className="card"><h1>Verläufe vergleichen</h1><p>Lade zuerst eine Datei oder die Beispieldaten. Danach kannst du Personen und mehrere Parameter in Tabelle, Einzelansicht und Überlagerung vergleichen.</p><button type="button" className="primary" onClick={() => go('Daten')}>Daten laden</button></div>}
      </section>
      {page === 'Kohortenmodelle' && <section className="card workspace-model-pending">
        <p className="eyebrow">03 / Gemeinsame Modelle</p><h1>Kohortenmodelle</h1>
        <p>Hier untersuchst du Zusammenhänge zwischen Verläufen und Personenmerkmalen wie Genotyp, Alter oder Behandlungsgruppe.</p>
        <p className="notice">Die Modellberechnung ist in diesem neuen Arbeitsplatz noch nicht angebunden. Der erste Bedienweg umfasst Datenprüfung, Ableitungen, Patientenvergleich und Export.</p>
        <p>Die vorhandenen Modelle stehen weiterhin in der <a href="./index.html">bisherigen Anwendung</a> zur Verfügung. Dateien müssen dort erneut geladen werden.</p>
        <button type="button" onClick={() => go(hasData ? 'Verläufe' : 'Daten')}>{hasData ? 'Verläufe ansehen' : 'Daten laden'}</button>
      </section>}
      {page === 'Methodik' && <section className="card workspace-methodology"><h1>Methodik und Interpretation</h1><p>Die Methodenbeschreibung der Anwendung bleibt für Berechnungen und ihre Grenzen maßgeblich. Dieser erste Arbeitsplatz verwendet für Einzelverläufe die allgemeine OLS-Auswertung; zusätzliche Fit-Konfigurationen folgen separat.</p><Methodology /></section>}
    </main>
    <footer className="workspace-footer">Nur für Forschung · Kein Medizinprodukt und keine Grundlage für klinische Entscheidungen. Berechnete Werte und Trends sind algorithmische Schätzungen.</footer>
  </div>
}
