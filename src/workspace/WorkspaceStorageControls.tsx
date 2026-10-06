import { setWorkspaceRemember, useWorkspaceStorage } from './workspace-storage'
import { useAppStore } from './state/store'

export function WorkspaceStorageControls({ hasData }: { hasData: boolean }) {
  const { enabled, status, message } = useWorkspaceStorage()
  const busy = useAppStore(s => s.busy)
  async function clearCurrent() {
    if (useAppStore.getState().busy) return
    if (!window.confirm('Clear the current dataset and its saved workspace copy? Export anything you need before continuing.')) return
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
        ? 'Data or settings saved on this device by the former version of Lab Trajectory Explorer were removed: that version has been replaced and its saved copies are no longer read. Import your file again to continue.'
        : 'Data or settings saved on this device by the former version of Lab Trajectory Explorer could not be removed. They are no longer read; to delete them, clear this site\'s data in your browser settings.'}
        {' '}To keep a dataset between visits, use “Remember on this device” below.</p>
      <button type="button" onClick={() => useWorkspaceStorage.setState({ legacyData: 'none' })}>Dismiss</button>
    </div>}
    <label><input type="checkbox" checked={enabled} disabled={!hasData && !enabled}
      onChange={event => void setWorkspaceRemember(event.target.checked)} /> Remember on this device</label>
    <p className="muted">Optional, unencrypted browser storage for seven days after the last data change. Saves lab values, events, attributes, demographic edits and derivation settings. Analysis views and model results reset when reopening.</p>
    <div className="actions">
      {hasData && <button type="button" disabled={busy} onClick={() => void clearCurrent()}>Clear dataset</button>}
      {(enabled || status === 'error') && <button type="button" onClick={() => void setWorkspaceRemember(false)}>Clear saved data</button>}
      {enabled && status === 'error' && <button type="button" onClick={() => void setWorkspaceRemember(true)}>Retry saving</button>}
      <span role={status === 'error' ? 'alert' : 'status'}>{message ?? ({ session: 'This session only', saving: 'Saving on this device …', saved: 'Saved on this device', error: 'Storage error' })[status]}</span>
    </div>
  </div>
}
