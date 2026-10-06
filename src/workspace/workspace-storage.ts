import { create } from 'zustand'
import { del, get, update } from 'idb-keyval'
import { useAppStore } from './state/store'
import type { AnalysisContext, AnalysisSettings } from '../core/analysis/types'

export const WORKSPACE_STORAGE_KEY = 'lab-explorer:workspace:v1'
/** Saved workspaces contain patient data and are kept unencrypted, so they
 * expire seven days after the last data change. */
export const DATASET_TTL_MS = 7 * 24 * 60 * 60 * 1000
interface Snapshot extends AnalysisContext {
  version: 1
  writeToken: string
  savedAt: number
  fileName: string | null
  analysisSettings: AnalysisSettings
}
interface StorageStatus {
  enabled: boolean
  status: 'session' | 'saving' | 'saved' | 'error'
  message: string | null
}
export const useWorkspaceStorage = create<StorageStatus>(() => ({ enabled: false, status: 'session', message: null }))

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nullableText = (v: unknown) => v === null || typeof v === 'string'
const nullableNumber = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v)
const validDate = (v: unknown) => v instanceof Date && Number.isFinite(v.getTime())
const nullableDate = (v: unknown) => v === null || validDate(v)
const patientId = (v: unknown) => typeof v === 'string' && v.length > 0 || typeof v === 'number' && Number.isFinite(v)
const sex = (v: unknown) => v === null || ['m', 'w', 'd'].includes(v as string)

function validSnapshot(value: unknown): value is Snapshot {
  if (!record(value) || value.version !== 1 || typeof value.writeToken !== 'string' || !Number.isFinite(value.savedAt) || !nullableText(value.fileName)) return false
  if (!Array.isArray(value.rows) || !value.rows.length || !value.rows.every(row => record(row) && patientId(row.patientId)
    && nullableDate(row.labDatum) && nullableText(row.bezeichnung) && nullableText(row.einheit)
    && nullableText(row.wert) && nullableNumber(row.wertNum) && nullableText(row.loinc)
    && ['=', '<', '>', 'range', 'unparseable'].includes(row.wertOperator as string)
    && sex(row.patientSex) && nullableNumber(row.patientAgeAtLab)
    && (row.patientBirthDate === undefined || nullableDate(row.patientBirthDate))
    && (row.patientSexRaw === undefined || nullableText(row.patientSexRaw)))) return false
  if (!Array.isArray(value.events) || !value.events.every(event => record(event) && patientId(event.patientId)
    && validDate(event.date) && nullableDate(event.endDate) && typeof event.title === 'string'
    && nullableText(event.description) && ['kidney_transplant', 'dialysis', 'other'].includes(event.type as string)
    && [null, 'acute', 'chronic', 'unknown'].includes(event.intent as string | null)
    && ['', 'unknown_patient', 'unknown_dialysis_intent', 'unresolved_dialysis_interval'].includes(event.warning as string))) return false
  if (!record(value.patientAttributes) || !Object.values(value.patientAttributes).every(attrs => record(attrs) && Object.values(attrs).every(v => typeof v === 'string'))) return false
  if (!record(value.manualDemographics) || !Object.values(value.manualDemographics).every(v => record(v)
    && (v.sex === undefined || sex(v.sex)) && (v.age === undefined || typeof v.age === 'number' && Number.isFinite(v.age) && v.age >= 0 && v.age <= 130))) return false
  const settings = value.analysisSettings
  if (!record(settings) || !record(settings.egfr) || !record(settings.aki) || !record(settings.rapidEgfrDecline)) return false
  return ['off', 'ckd-epi-2021', 'mdrd-4', 'ekfc-2021'].includes(settings.egfr.formula as string)
    && (settings.egfr.source === null || Array.isArray(settings.egfr.source) && settings.egfr.source.length === 2 && settings.egfr.source.every(v => typeof v === 'string'))
    && typeof settings.aki.showOverlays === 'boolean' && typeof settings.aki.exclusionDays === 'number' && Number.isFinite(settings.aki.exclusionDays) && settings.aki.exclusionDays >= 0
    && typeof settings.rapidEgfrDecline.threshold === 'number' && Number.isFinite(settings.rapidEgfrDecline.threshold)
}

let writes: Promise<void> = Promise.resolve()
let revision = 0
let unsubscribe: (() => void) | undefined
let lastWriteToken: string | undefined
let claimPending = false
class StorageConflict extends Error {}
function enqueue(operation: () => Promise<void>): Promise<void> {
  writes = writes.catch(() => {}).then(operation)
  return writes
}
function reportError(message: string) {
  useWorkspaceStorage.setState({ status: 'error', message })
}
function snapshot(): Snapshot {
  const state = useAppStore.getState()
  return { version: 1, writeToken: crypto.randomUUID(), savedAt: Date.now(), rows: state.rows, fileName: state.fileName,
    events: state.events, patientAttributes: state.patientAttributes,
    manualDemographics: state.manualDemographics, analysisSettings: state.analysisSettings }
}
function save(): Promise<void> {
  if (!useAppStore.getState().rows.length) return setWorkspaceRemember(false)
  const currentRevision = ++revision
  const value = snapshot()
  useWorkspaceStorage.setState({ status: 'saving', message: null })
  return enqueue(async () => {
    if (currentRevision !== revision || !useWorkspaceStorage.getState().enabled) return
    try {
      // IndexedDB's read/write transaction makes compare-and-swap atomic across
      // tabs. A stale tab cannot resurrect a deleted copy or overwrite a new one.
      await update<Snapshot>(WORKSPACE_STORAGE_KEY, previous => {
        if (!claimPending && previous?.writeToken !== lastWriteToken) throw new StorageConflict()
        return value
      })
      lastWriteToken = value.writeToken
      claimPending = false
      if (currentRevision === revision) useWorkspaceStorage.setState({ status: 'saved', message: null })
    } catch (error) {
      if (error instanceof StorageConflict) {
        ++revision
        useWorkspaceStorage.setState({ enabled: false, status: 'error', message: 'The saved copy was changed or removed in another tab. Reload to resume that copy, or enable saving again to save this tab instead.' })
      } else if (currentRevision === revision) reportError('Could not save on this device. Keep this tab open or export your data, then retry.')
    }
  })
}

/** Serial ordering makes removal the last disk operation, even during a save. */
export async function setWorkspaceRemember(enabled: boolean): Promise<void> {
  if (enabled && !useWorkspaceStorage.getState().enabled) claimPending = true
  useWorkspaceStorage.setState({ enabled })
  if (enabled) { await save(); return }
  const currentRevision = ++revision
  await enqueue(async () => {
    try {
      await del(WORKSPACE_STORAGE_KEY)
      lastWriteToken = undefined
      claimPending = false
      if (currentRevision === revision) useWorkspaceStorage.setState({ status: 'session', message: null })
    } catch {
      if (currentRevision === revision) reportError('Could not remove the saved copy. Retry clearing saved data on this device.')
    }
  })
}

/** Restore the data preparation atomically, before mounting the workspace. */
export async function startWorkspaceStorage(): Promise<() => void> {
  unsubscribe?.()
  await writes
  lastWriteToken = undefined
  claimPending = false
  useWorkspaceStorage.setState({ enabled: false, status: 'session', message: null })
  try {
    const value: unknown = await get(WORKSPACE_STORAGE_KEY)
    if (value !== undefined) {
      if (!validSnapshot(value)) {
        reportError('The saved workspace is invalid or uses an unsupported version. Import your file or clear the saved copy.')
      } else if (Date.now() - value.savedAt > DATASET_TTL_MS) {
        await del(WORKSPACE_STORAGE_KEY)
        useWorkspaceStorage.setState({ message: 'The saved workspace expired after seven days. Import your file to continue.' })
      } else {
        lastWriteToken = value.writeToken
        useAppStore.getState().replaceDataset({ rows: value.rows,
          events: value.events, patientAttributes: value.patientAttributes,
          manualDemographics: value.manualDemographics, analysisSettings: value.analysisSettings,
          fileName: value.fileName })
        useWorkspaceStorage.setState({ enabled: true, status: 'saved', message: null })
      }
    }
  } catch {
    reportError('Local storage is unavailable. You can still import and work in this tab.')
  }
  const stop = useAppStore.subscribe((state, previous) => {
    if (useWorkspaceStorage.getState().enabled && (state.rows !== previous.rows || state.events !== previous.events
      || state.patientAttributes !== previous.patientAttributes || state.manualDemographics !== previous.manualDemographics
      || state.analysisSettings !== previous.analysisSettings || state.fileName !== previous.fileName)) void save()
  })
  unsubscribe = stop
  return stop
}
