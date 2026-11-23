import { StrictMode } from 'react'
import { t } from '../i18n'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from './WorkspaceApp'
import { ErrorBoundary } from './ErrorBoundary'
import './workspace.css'
import { startWorkspaceStorage } from './workspace-storage'

void startWorkspaceStorage().then(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode>
    <ErrorBoundary area="Lab Trajectory Explorer"
      hint={t('The data loaded in this tab are still in memory. Retry displays the app again; if the error returns, reload the page. Reloading discards data that are not saved on this device.')}>
      <WorkspaceApp />
    </ErrorBoundary>
  </StrictMode>)
})
