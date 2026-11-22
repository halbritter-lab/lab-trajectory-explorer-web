import { useEffect, useRef, useState } from 'react'
import { version } from '../../package.json'
import type { LabRow, PatientId } from '../core/types'
import { Methodology } from './methods/Methodology'
import { DataWorkspace } from './DataWorkspace'
import { TrajectoriesWorkspace } from './TrajectoriesWorkspace'
import { CohortModelsWorkspace } from './CohortModelsWorkspace'
import { ErrorBoundary } from './ErrorBoundary'
import { useWorkspaceData } from './workspace-data'
import { useAppStore } from './state/store'
import { useWorkspaceStorage } from './workspace-storage'
import { losesDataOnUnload } from './saved-settings'
import { getMethodLocation, type HelpWorkspace } from './methods/method-navigation'
import { CONTROL_ELEMENT_IDS, type SettingControl } from './analysis-record'
import { msg, setLanguage, t, tp, useLanguage, type Language } from '../i18n'

type Page = 'Data' | 'Trajectories' | 'Cohort models' | 'Methods'
const PAGE_LABELS = { Data: msg('Data'), Trajectories: msg('Trajectories'), 'Cohort models': msg('Cohort models'), Methods: msg('Methods') } as const

/** The EN | DE switch of the header (issue #71). */
function LanguageSwitch() {
  const language = useLanguage()
  const option = (code: Language, label: string, name: string) => <button type="button" lang={code} aria-pressed={language === code}
    aria-label={name} onClick={() => setLanguage(code)}>{label}</button>
  return <div className="workspace-language" role="group" aria-label={t('Interface language')}>
    {option('en', 'EN', 'English')}<span aria-hidden="true">|</span>{option('de', 'DE', 'Deutsch')}
  </div>
}
const datasetKeys = new WeakMap<LabRow[], number>()
let nextDatasetKey = 0
function datasetKey(rows: LabRow[]): number {
  let key = datasetKeys.get(rows)
  if (key === undefined) { key = ++nextDatasetKey; datasetKeys.set(rows, key) }
  return key
}

export function WorkspaceApp() {
  // The whole interface renders again when the language changes.
  useLanguage()
  const data = useWorkspaceData()
  const storageStatus = useWorkspaceStorage(s => s.status)
  const [page, setPage] = useState<Page>(() => getMethodLocation() ? 'Methods' : 'Data')
  const [requestedPerson, setRequestedPerson] = useState<{ id: PatientId; rows: LabRow[] } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const helpOrigin = useRef<HelpWorkspace>('Data')
  const firstRender = useRef(true)
  const hasData = data.rawRows.length > 0
  const storageEnabled = useWorkspaceStorage(s => s.enabled)
  // Session-only data are lost on reload or close: let the browser ask first.
  // In-app navigation changes only the hash or history state and never unloads.
  // The pristine bundled demo loads again with one click and is not worth a question.
  const untouchedDemo = useAppStore(s => s.pristineDemo)
  const unsaved = losesDataOnUnload(hasData, { enabled: storageEnabled, status: storageStatus }, untouchedDemo)
  useEffect(() => {
    if (!unsaved) return
    // returnValue is the legacy path: older Chromium ignores preventDefault alone and an empty string.
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

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

  /** From the analysis record: show the page of a control, open what hides
   * it and move the focus to it. */
  const goToControl = (control: Exclude<SettingControl, { page: 'Trajectories' }>) => {
    go(control.page)
    const id = CONTROL_ELEMENT_IDS[control.target]
    const focus = (openTab: boolean) => {
      const element = document.getElementById(id)
      if (!element) {
        // A control behind a tab (the Time to event area): open the tab, then look again.
        const opener = openTab ? document.querySelector<HTMLElement>(`[data-opens-control="${id}"]`) : null
        if (opener) { opener.click(); requestAnimationFrame(() => focus(false)) }
        return
      }
      for (let parent = element.closest('details'); parent; parent = parent.parentElement?.closest('details') ?? null) parent.open = true
      element.scrollIntoView({ block: 'start' })
      element.querySelector<HTMLElement>('select, input, button')?.focus({ preventScroll: true })
    }
    requestAnimationFrame(() => focus(true))
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
    }}>{t('Skip to content')}</a>
    <header className="workspace-header">
      <div className="workspace-brand"><span aria-hidden="true" className="workspace-logo">↗</span><div><div className="workspace-title"><strong>Lab Trajectory Explorer</strong><small className="workspace-version" aria-label={t('Version {version}', { version })}>v{version}</small></div><span>{t('Longitudinal lab data, for research use only')}</span></div></div>
      <nav aria-label={t('Main navigation')} className="workspace-nav">
        {(['Data', 'Trajectories', 'Cohort models'] as const).map(name => <button type="button" key={name}
          aria-current={page === name ? 'page' : undefined} onClick={() => go(name)}>
          {t(PAGE_LABELS[name])}
        </button>)}
        <button type="button" className="workspace-help" aria-current={page === 'Methods' ? 'page' : undefined} onClick={() => go('Methods')}>{t(PAGE_LABELS.Methods)}</button>
      </nav>
      <LanguageSwitch />
    </header>
    <div className="workspace-dataset" role="status">
      <span>{hasData ? data.fileName ?? t('Loaded dataset') : t('No data loaded yet')}</span>
      {hasData && <span>{tp('{n} patient', '{n} patients', data.patients.length)}, {tp('{n} parameter', '{n} parameters', data.parameters.length)}, {tp('{n} source measurement', '{n} source measurements', data.rawRows.length)}</span>}
      <span>{storageStatus === 'saved' ? t('Saved on this device') : storageStatus === 'saving' ? t('Saving …') : storageStatus === 'error' ? t('Check local storage in Data') : t('This session only')}</span>
    </div>
    <main id="workspace-main" className="workspace-main" ref={mainRef} tabIndex={-1}>
      <section hidden={page !== 'Data'} aria-label={t('Data workspace')}>
        <DataWorkspace onBrowse={id => {
          setRequestedPerson(id === undefined ? null : { id, rows: data.rawRows })
          setPage('Trajectories')
          if (typeof window !== 'undefined' && window.history?.pushState) {
            window.history.pushState({ page: 'Trajectories', mode: id !== undefined ? 'detail' : 'table', patientId: id ?? null }, '')
          }
        }} />
      </section>
      <section hidden={page !== 'Trajectories'} aria-label={t('Trajectory workspace')}>
        {hasData ? <TrajectoriesWorkspace key={datasetKey(data.rawRows)} data={data} active={page === 'Trajectories'} onNavigate={goToControl}
          requestedPatientId={requestedPerson?.rows === data.rawRows ? requestedPerson.id : null} />
          : <div className="card"><h1>{t('Compare trajectories')}</h1><p>{t('Load a file or the demo data first. Then compare patients and multiple parameters in the table, individual view and overlay.')}</p><button type="button" className="primary" onClick={() => go('Data')}>{t('Load data')}</button></div>}
      </section>
      <section hidden={page !== 'Cohort models'} aria-label={t('Cohort model workspace')}>
        {/* The page is rendered while hidden, so without a boundary an error in it would blank every page. */}
        <ErrorBoundary key={datasetKey(data.rawRows)} area={t('The Cohort models page')}
          hint={t('The loaded data and the other pages are not affected. Retry displays the page again.')}>
          <CohortModelsWorkspace
            data={data}
            onBrowseTrajectories={() => go('Trajectories')}
            onBrowseData={() => go('Data')}
          />
        </ErrorBoundary>
      </section>
      {page === 'Methods' && <section className="card workspace-methodology">
        <h1>{t('Methods and interpretation')}</h1>
        <Methodology onNavigate={go} returnTo={helpOrigin.current} />
      </section>}
    </main>
    <footer className="workspace-footer">
      <p>{t('Research use only. Not a medical device or a basis for clinical decisions. Computed values and trends are algorithmic estimates.')}</p>
      <div className="workspace-footer-links">
        <nav aria-label={t('Project links')}>
          <a href="https://github.com/halbritter-lab/lab-trajectory-explorer-web" target="_blank" rel="noopener noreferrer" aria-label={t('{name} (opens in a new tab)', { name: 'GitHub' })}>GitHub</a>
          <a href="https://www.uniklinik-freiburg.de/medizin4/forschung/nephrolab/groups/jan-halbritter.html" target="_blank" rel="noopener noreferrer" aria-label={t('{name} (opens in a new tab)', { name: 'Halbritter Lab' })}>Halbritter Lab</a>
        </nav>
        <p>{t('Created by')} <a href="https://jplerch.eu/" target="_blank" rel="noopener noreferrer" aria-label={t('{name} (opens in a new tab)', { name: 'Jan-Paul Lerch' })}>Jan-Paul Lerch</a></p>
      </div>
    </footer>
  </div>
}
