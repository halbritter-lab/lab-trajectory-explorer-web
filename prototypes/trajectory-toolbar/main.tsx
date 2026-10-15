import { createRoot } from 'react-dom/client'
import { useWorkspaceData } from '../../src/workspace/workspace-data'
import { loadBundledFixtureData } from '../../src/io/loadDataset'
import { useAppStore } from '../../src/workspace/state/store'
import { TrajectoriesPreview } from './TrajectoriesPreview'
import { Icon } from './PreviewControls'
import '../../src/workspace/workspace.css'
import './preview.css'

function Preview() {
  const data = useWorkspaceData()
  const notice = useAppStore(state => state.notice)
  return <>
    <header className="pv-app-header">
      <a href="/" className="pv-brand"><span className="pv-logo"><Icon name="chart" /></span><strong>Lab Trajectory Explorer</strong></a>
      <nav aria-label="Preview navigation"><a href="/">Data</a><span aria-current="page">Trajectories</span><a href="/">Cohort models</a></nav>
      <a className="pv-original" href="/" target="_blank" rel="noreferrer">Current app <Icon name="external" /></a>
    </header>
    <div className="pv-preview-banner"><span className="pv-preview-label">Interactive preview</span><span>Toolbar &amp; analysis panel · bundled demo data</span></div>
    <main className="pv-main" onClick={event => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#methods/"]')
      if (link) { event.preventDefault(); window.open(`/${link.getAttribute('href')}`, '_blank', 'noopener') }
    }}>
      {data.rawRows.length ? <TrajectoriesPreview data={data} /> : notice?.kind === 'error' ? <p role="alert">{notice.text}</p> : <p role="status">Loading demo measurements…</p>}
    </main>
    <footer className="pv-footer">Research use only · Synthetic demo data · Interactive layout preview</footer>
  </>
}

createRoot(document.getElementById('root')!).render(<Preview />)
void loadBundledFixtureData('/').then(dataset => useAppStore.getState().replaceDataset({
  rows: dataset.rows, events: dataset.events, rejectedEvents: [],
  patientAttributes: dataset.patientAttributes, fileName: 'test_labs.xlsx (Demo)',
  notice: null,
})).catch(error => useAppStore.setState({ notice: { kind: 'error', text: `Demo could not load: ${String(error)}` } }))
