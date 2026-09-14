import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceApp } from './WorkspaceApp'
import './workspace.css'

// The acceptance workspace is session-only; it never restores a prior patient dataset.
createRoot(document.getElementById('root')!).render(<StrictMode><WorkspaceApp /></StrictMode>)
