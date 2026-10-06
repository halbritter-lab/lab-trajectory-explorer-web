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
  return <div className="workspace-storage">
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
