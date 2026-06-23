import { get, set, del } from 'idb-keyval'
import type { LabRow } from '../core/types'

const KEY = 'lab-explorer:dataset'

/** Persisted datasets contain patient data and are kept unencrypted, so they
 * expire automatically: a dataset older than this is discarded on load rather
 * than lingering on disk indefinitely. */
export const DATASET_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface SavedDataset {
  rows: LabRow[]
  fileName: string | null
  savedAt: number
}

/** Persist the dataset to IndexedDB. Structured clone preserves Date fields,
 * so LabRow[] round-trips without manual (de)serialisation. Stamps savedAt so
 * the entry can expire (see DATASET_TTL_MS). */
export async function saveDataset(rows: LabRow[], fileName: string | null): Promise<void> {
  const payload: SavedDataset = { rows, fileName, savedAt: Date.now() }
  await set(KEY, payload)
}

/** Load the persisted dataset, or null if none / expired. An expired entry is
 * cleared so stale patient data does not remain on disk. */
export async function loadDataset(): Promise<SavedDataset | null> {
  const v = await get<SavedDataset>(KEY)
  if (!v) return null
  if (!Number.isFinite(v.savedAt) || Date.now() - v.savedAt > DATASET_TTL_MS) {
    await clearDataset()
    return null
  }
  return v
}

const SETTINGS_KEY = 'lab-explorer:settings'

export interface SavedSettings {
  cohortZoom: 's' | 'm' | 'l'
  rapidEgfrThreshold?: number
}

/** Persist UI settings (only called when the user opted into persistence). */
export async function saveSettings(s: SavedSettings): Promise<void> {
  await set(SETTINGS_KEY, s)
}

/** Load persisted UI settings, or null if none. */
export async function loadSettings(): Promise<SavedSettings | null> {
  const v = await get<SavedSettings>(SETTINGS_KEY)
  return v ?? null
}

/** Remove any persisted dataset. */
export async function clearDataset(): Promise<void> {
  await del(KEY)
  await del(SETTINGS_KEY)
}

/** Whether a persisted dataset exists. */
export async function hasSavedDataset(): Promise<boolean> {
  return (await get(KEY)) !== undefined
}
