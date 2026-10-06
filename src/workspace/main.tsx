import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from './WorkspaceApp'
import './workspace.css'
import { startWorkspaceStorage } from './workspace-storage'

void startWorkspaceStorage().then(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><WorkspaceApp /></StrictMode>)
})
