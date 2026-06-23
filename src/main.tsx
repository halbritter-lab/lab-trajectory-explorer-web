import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadDataset, loadSettings, clearDataset } from './io/persistence'
import { useAppStore } from './ui/state/store'

async function boot() {
  try {
    const saved = await loadDataset()
    if (saved && saved.rows.length > 0) {
      useAppStore.setState({ persist: true })
      useAppStore.getState().setDataset(saved.rows, saved.fileName ?? undefined)
      const settings = await loadSettings()
      if (settings) {
        useAppStore.setState({ cohortZoom: settings.cohortZoom })
        if (typeof settings.rapidEgfrThreshold === 'number') {
          useAppStore.setState({ rapidEgfrThreshold: settings.rapidEgfrThreshold })
        }
      }
    }
  } catch (err) {
    // A corrupt saved entry would otherwise break every boot; clear it so the
    // next session starts clean, and leave a breadcrumb in the console.
    console.warn('Could not restore saved dataset; clearing it.', err)
    void clearDataset()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
