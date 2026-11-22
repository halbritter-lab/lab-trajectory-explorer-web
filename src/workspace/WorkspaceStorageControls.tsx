import { savedStatusText, setWorkspaceRemember, useWorkspaceStorage } from './workspace-storage'
import { useAppStore } from './state/store'
import { t } from '../i18n'

export function WorkspaceStorageControls({ hasData }: { hasData: boolean }) {
  const { enabled, status, message, settingsError, savedAt } = useWorkspaceStorage()
  const busy = useAppStore(s => s.busy)
  async function clearCurrent() {
    if (useAppStore.getState().busy) return
    if (!window.confirm(t('Clear the current dataset and its saved workspace copy? Export anything you need before continuing.'))) return
    useAppStore.setState({ busy: true })
    try {
      await setWorkspaceRemember(false)
      if (useWorkspaceStorage.getState().status === 'error') return
      useAppStore.getState().reset()
    } finally { useAppStore.setState({ busy: false }) }
  }
  const legacyData = useWorkspaceStorage(s => s.legacyData)
  return <div className="workspace-storage">
    {legacyData !== 'none' && <div className="notice amber" role="status">
      <p>{legacyData === 'removed'
        ? t('Data or settings saved on this device by the former version of Lab Trajectory Explorer were removed: that version has been replaced and its saved copies are no longer read. Import your file again to continue.')
        : t("Data or settings saved on this device by the former version of Lab Trajectory Explorer could not be removed. They are no longer read; to delete them, clear this site's data in your browser settings.")}
        {' '}{t('To keep a dataset between visits, use “Remember on this device” below.')}</p>
      <button type="button" onClick={() => useWorkspaceStorage.setState({ legacyData: 'none' })}>{t('Dismiss')}</button>
    </div>}
    <label><input type="checkbox" checked={enabled} disabled={!hasData && !enabled}
      onChange={event => void setWorkspaceRemember(event.target.checked)} /> {t('Remember on this device')}</label>
    <p className="muted">{t('Optional. Keeps an unencrypted copy of the dataset in this browser. The copy is removed when the app is next opened more than seven days after the last data change; until then it stays on this device.')}</p>
    <details className="workspace-storage-details"><summary>{t('What is saved')}</summary>
      <p>{t('Saved: lab values, events, attributes, demographic edits, derivation settings and the analysis settings of the Trajectories page: presets and own settings per parameter, the selected parameters, Trend and trend-line choices and display options.')}</p>
      <p>{t('Not saved: sorting, grouping and patient selection, and cohort model settings and results.')}</p>
      <p>{t('The seven days start again with every data change; changing analysis settings does not extend them. “Clear saved data” removes the copy at once.')}</p>
      <p>{t('Without this option the browser asks before the page is reloaded or closed, because the data would be lost. It does not ask for the bundled demo data as loaded, which load again with one click; it asks once events or attributes were imported on top of them, a patient was edited or the eGFR derivation was changed.')}</p>
    </details>
    <div className="actions">
      {hasData && <button type="button" disabled={busy} onClick={() => void clearCurrent()}>{t('Clear dataset')}</button>}
      {(enabled || status === 'error') && <button type="button" onClick={() => void setWorkspaceRemember(false)}>{t('Clear saved data')}</button>}
      {enabled && status === 'error' && <button type="button" onClick={() => void setWorkspaceRemember(true)}>{t('Retry saving')}</button>}
      <span role={status === 'error' ? 'alert' : 'status'}>{message ?? ({ session: t('This session only'), saving: t('Saving on this device …'), saved: savedStatusText(savedAt), error: t('Storage error') })[status]}</span>
    </div>
    {settingsError && <p role="status">{settingsError}</p>}
  </div>
}
