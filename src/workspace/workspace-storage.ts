import { create } from 'zustand'
import { createStore, del, delMany, get, getMany, keys, promisifyRequest, update, type UseStore } from 'idb-keyval'
import { useAppStore } from './state/store'
import type { AnalysisContext } from '../core/analysis/types'
import { isRecord as record, parseAnalysisSettings, type AnalysisSettings } from '../core/analysis/registry'
import type { Sex, WertOperator } from '../core/types'
import { allValues, restoreSavedSettings, SAVED_SETTINGS_VERSION, type RestoredSettings, type SavedSettings } from './saved-settings'
import {
  CLINICAL_EVENT_TYPES,
  CLINICAL_EVENT_WARNINGS,
  DIALYSIS_INTENTS,
  type ClinicalEventType,
  type ClinicalEventWarning,
  type DialysisIntent,
} from '../core/events/events'

export const WORKSPACE_STORAGE_KEY = 'lab-explorer:workspace:v1'
/** The analysis settings have their own record, so changing them never
 * rewrites the dataset copy: its `savedAt` (the expiry clock), its write token
 * and its rows stay as the last data change left them. */
export const WORKSPACE_SETTINGS_KEY = 'lab-explorer:workspace-settings:v1'
/** Keys of earlier versions start with this prefix in idb-keyval's shared
 * default database (`keyval-store`), which other apps on the same origin
 * (for example other GitHub Pages projects) can also use. */
const LEGACY_KEY_PREFIX = 'lab-explorer:'
const DEFAULT_IDB_DATABASE = 'keyval-store'
let dedicatedStore: UseStore | undefined
/** This app's own IndexedDB database, so its data is never mixed with, read
 * or cleared by another app on the same origin. Opened lazily. */
export function workspaceIdbStore(): UseStore {
  return dedicatedStore ??= createStore('lab-trajectory-explorer', 'keyval')
}
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
/** `datasetToken` is the write token of the dataset copy the settings belong
 * to. A record for another copy is never applied. */
interface SettingsRecord extends SavedSettings { datasetToken: string }
interface StorageStatus {
  enabled: boolean
  status: 'session' | 'saving' | 'saved' | 'error'
  message: string | null
  /** Data saved by the former interface found at start-up: removed, or found
   * but not (completely) removable. Shown once as a notice. */
  legacyData: 'none' | 'removed' | 'removal-failed'
  /** The last write of the analysis settings alone failed. Shown next to the
   * status, which keeps describing the dataset copy; cleared by the next
   * successful write. */
  settingsError: string | null
  /** When the dataset copy on this device was written (its `savedAt`, the
   * start of the seven days); null while no copy of this tab is saved. */
  savedAt: number | null
}
export const useWorkspaceStorage = create<StorageStatus>(() => ({ enabled: false, status: 'session', message: null, legacyData: 'none', settingsError: null, savedAt: null }))

/** Local date and time to the minute: "2026-11-21 14:05". */
function localMinute(time: number): string {
  const date = new Date(time)
  const two = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}
/** The status of a saved copy. Nothing removes the copy while the app is
 * closed: expiry is checked only when the app starts (startWorkspaceStorage),
 * so the copy stays on the device until the app is opened after that time. */
export function savedStatusText(savedAt: number | null): string {
  if (savedAt === null) return 'Saved on this device'
  return `Saved on ${localMinute(savedAt)}; removed when the app is next opened after ${localMinute(savedAt + DATASET_TTL_MS)}`
}

const nullableText = (v: unknown) => v === null || typeof v === 'string'
const nullableNumber = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v)
const validDate = (v: unknown) => v instanceof Date && Number.isFinite(v.getTime())
const nullableDate = (v: unknown) => v === null || validDate(v)
const patientId = (v: unknown) => typeof v === 'string' && v.length > 0 || typeof v === 'number' && Number.isFinite(v)
const SEX_CODES = allValues<Sex>()(['m', 'w', 'd'])
const OPERATORS = allValues<WertOperator>()(['=', '<', '>', 'range', 'unparseable'])
const EVENT_TYPES = allValues<ClinicalEventType>()(CLINICAL_EVENT_TYPES)
const INTENTS = allValues<DialysisIntent | null>()([null, ...DIALYSIS_INTENTS])
const EVENT_WARNINGS = allValues<ClinicalEventWarning>()(CLINICAL_EVENT_WARNINGS)
const sex = (v: unknown) => v === null || SEX_CODES.includes(v as Sex)

function validSnapshot(value: unknown): value is Snapshot {
  if (!record(value) || value.version !== 1 || typeof value.writeToken !== 'string' || !Number.isFinite(value.savedAt) || !nullableText(value.fileName)) return false
  if (!Array.isArray(value.rows) || !value.rows.length || !value.rows.every(row => record(row) && patientId(row.patientId)
    && nullableDate(row.labDatum) && nullableText(row.bezeichnung) && nullableText(row.einheit)
    && nullableText(row.wert) && nullableNumber(row.wertNum) && nullableText(row.loinc)
    && OPERATORS.includes(row.wertOperator as WertOperator)
    && sex(row.patientSex) && nullableNumber(row.patientAgeAtLab)
    && (row.patientBirthDate === undefined || nullableDate(row.patientBirthDate))
    && (row.patientSexRaw === undefined || nullableText(row.patientSexRaw)))) return false
  if (!Array.isArray(value.events) || !value.events.every(event => record(event) && patientId(event.patientId)
    && validDate(event.date) && nullableDate(event.endDate) && typeof event.title === 'string'
    && nullableText(event.description) && EVENT_TYPES.includes(event.type as ClinicalEventType)
    && INTENTS.includes(event.intent as DialysisIntent | null)
    && EVENT_WARNINGS.includes(event.warning as ClinicalEventWarning))) return false
  if (!record(value.patientAttributes) || !Object.values(value.patientAttributes).every(attrs => record(attrs) && Object.values(attrs).every(v => typeof v === 'string'))) return false
  if (!record(value.manualDemographics) || !Object.values(value.manualDemographics).every(v => record(v)
    && (v.sex === undefined || sex(v.sex)) && (v.age === undefined || typeof v.age === 'number' && Number.isFinite(v.age) && v.age >= 0 && v.age <= 130))) return false
  // Each analysis module validates its own settings (see parseAnalysisSettings).
  return parseAnalysisSettings(value.analysisSettings) !== null
}

type SnapshotState = 'usable' | 'expired' | 'invalid'
/** Expiry is checked before the schema, so an expired copy is always removed
 * as expired, whatever shape an older version saved it in. */
function classifySnapshot(value: unknown): SnapshotState {
  if (!record(value) || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)) return 'invalid'
  if (Date.now() - value.savedAt > DATASET_TTL_MS) return 'expired'
  return validSnapshot(value) ? 'usable' : 'invalid'
}

/** Delete the saved copy only if it is still the one that was read, so a copy
 * another tab saved in the meantime survives. Same transaction as the check. */
function deleteIfUnchanged(read: unknown): Promise<void> {
  const token = record(read) ? read.writeToken : undefined
  const savedAt = record(read) ? read.savedAt : undefined
  return workspaceIdbStore()('readwrite', store => new Promise<void>((resolve, reject) => {
    const request = store.get(WORKSPACE_STORAGE_KEY)
    request.onsuccess = () => {
      const current: unknown = request.result
      if (current !== undefined && (!record(current) || current.writeToken === token && current.savedAt === savedAt)) {
        store.delete(WORKSPACE_STORAGE_KEY)
        store.delete(WORKSPACE_SETTINGS_KEY)
      }
      resolve()
    }
    request.onerror = () => reject(request.error)
  }))
}

async function defaultDatabaseMayExist(): Promise<boolean> {
  // Avoid creating idb-keyval's shared database just to look inside it.
  if (typeof indexedDB.databases !== 'function') return true
  return (await indexedDB.databases()).some(db => db.name === DEFAULT_IDB_DATABASE)
}

export interface LegacyStorageOutcome {
  /** Former-interface keys (dataset, settings, …) were present. */
  formerInterfaceData: boolean
  /** State of a workspace copy the previous release left in the shared database. */
  legacyWorkspaceCopy: SnapshotState | null
}

/**
 * Remove everything earlier versions kept in the shared default database,
 * regardless of age: the former interface's `lab-explorer:dataset` and
 * `lab-explorer:settings`, and any other `lab-explorer:*` key. A usable,
 * unexpired workspace copy is first moved to this app's own database (once:
 * the source is deleted); it replaces a dedicated copy only if that one is
 * expired or invalid. Findings are recorded in `outcome` before anything is
 * deleted, so they survive a failing deletion.
 */
export async function migrateLegacyStorage(
  outcome: LegacyStorageOutcome = { formerInterfaceData: false, legacyWorkspaceCopy: null },
): Promise<LegacyStorageOutcome> {
  if (!await defaultDatabaseMayExist()) return outcome
  const legacyKeys = (await keys()).filter((key): key is string => typeof key === 'string' && key.startsWith(LEGACY_KEY_PREFIX))
  outcome.formerInterfaceData = legacyKeys.some(key => key !== WORKSPACE_STORAGE_KEY)
  if (legacyKeys.includes(WORKSPACE_STORAGE_KEY)) {
    const value: unknown = await get(WORKSPACE_STORAGE_KEY)
    outcome.legacyWorkspaceCopy = classifySnapshot(value)
    if (outcome.legacyWorkspaceCopy === 'usable') {
      await update(WORKSPACE_STORAGE_KEY, previous => previous !== undefined && classifySnapshot(previous) === 'usable' ? previous : value, workspaceIdbStore())
    }
  }
  for (const key of legacyKeys) await del(key)
  return outcome
}

/** What a restored copy brought back and what starts from defaults. */
export function restoredNotice({ stored, notRestored, keptAsCustom }: Pick<RestoredSettings, 'stored' | 'notRestored' | 'keptAsCustom'>): string {
  const notSaved = 'Cohort model settings and results are not saved: fit the models again under Cohort models.'
  if (stored === 'none') return `Dataset restored from this device. No analysis settings were saved with this copy, so presets, trend and display settings start from their defaults. ${notSaved}`
  if (stored === 'discarded') return `Dataset restored from this device. Its saved analysis settings could not be used (saved by another version), so presets, trend and display settings start from their defaults. ${notSaved}`
  return `Dataset and analysis settings (presets, trend and display choices) restored from this device. ${notSaved}`
    + (keptAsCustom.length ? ` Shown as "Custom configuration" with their saved values, because the preset has changed since they were saved: ${keptAsCustom.join('; ')}. The fits use the saved values, so results do not change; the preset name is no longer shown, and the exported fit configuration gives preset "custom" and time axis "calendar_time".` : '')
    + (notRestored.length ? ` Not restored, the defaults are used instead: ${notRestored.join('; ')}.` : '')
}

const EXPIRED_MESSAGE = 'The saved workspace expired after seven days and was removed. Import your file to continue.'
const INVALID_MESSAGE = 'The saved workspace could not be read (invalid or from an unsupported version) and was removed. Import your file to continue.'

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
function reportConflict() {
  ++revision
  useWorkspaceStorage.setState({ enabled: false, status: 'error', message: 'The saved copy was changed or removed in another tab. Reload to resume that copy, or enable saving again to save this tab instead.' })
}
/**
 * Compare the copy on the device with this tab's last write. The status
 * ("Saved on …; removed … after …") is this tab's knowledge; another tab can
 * replace or remove the copy without this tab writing anything. Called when
 * the tab is shown or focused again, so the status does not keep naming a
 * save and removal time of a copy that is no longer on the device. Writes
 * nothing. The settings record is read first because it is small and carries
 * the token of the dataset copy it was written with; the dataset record is
 * read only when that does not settle it.
 */
export function checkSavedCopy(): Promise<void> {
  return enqueue(async () => {
    const token = lastWriteToken
    if (token === undefined || claimPending || !useWorkspaceStorage.getState().enabled) return
    try {
      const settings: unknown = await get(WORKSPACE_SETTINGS_KEY, workspaceIdbStore())
      if (record(settings) && settings.datasetToken === token) return
      const dataset: unknown = await get(WORKSPACE_STORAGE_KEY, workspaceIdbStore())
      if (record(dataset) && dataset.writeToken === token) return
    } catch {
      // An unreadable store is reported by the next save, not here.
      return
    }
    reportConflict()
  })
}
function snapshot(): Snapshot {
  const state = useAppStore.getState()
  return { version: 1, writeToken: crypto.randomUUID(), savedAt: Date.now(), rows: state.rows, fileName: state.fileName,
    events: state.events, patientAttributes: state.patientAttributes,
    manualDemographics: state.manualDemographics, analysisSettings: state.analysisSettings }
}
function settingsRecord(datasetToken: string): SettingsRecord {
  const state = useAppStore.getState()
  return { version: SAVED_SETTINGS_VERSION, datasetToken, trajectoryFitSettings: state.trajectoryFitSettings, trajectoryView: state.trajectoryView }
}
/** One read/write transaction: IndexedDB makes the compare-and-swap atomic
 * across tabs, so a stale tab cannot resurrect a deleted copy or overwrite a
 * new one, and the dataset copy and its settings always change together. */
function writeCopy(value: Snapshot): Promise<void> {
  return workspaceIdbStore()('readwrite', store => new Promise<void>((resolve, reject) => {
    const request = store.get(WORKSPACE_STORAGE_KEY)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const previous: unknown = request.result
      if (!claimPending && (record(previous) ? previous.writeToken : undefined) !== lastWriteToken) { reject(new StorageConflict()); return }
      try {
        store.put(value, WORKSPACE_STORAGE_KEY)
        store.put(settingsRecord(value.writeToken), WORKSPACE_SETTINGS_KEY)
        resolve(promisifyRequest(store.transaction))
      } catch (error) {
        // Neither record may be committed alone: the dataset under a new token
        // would look like another tab's copy to the next save.
        store.transaction.abort()
        reject(error)
      }
    }
  }))
}
function save(): Promise<void> {
  if (!useAppStore.getState().rows.length) return setWorkspaceRemember(false)
  const currentRevision = ++revision
  const value = snapshot()
  // Never write a copy the next start would reject and delete.
  if (!validSnapshot(value)) {
    reportError('This dataset cannot be saved on this device because it contains values the saved format does not accept. It stays available in this tab; export your data to keep it.')
    return Promise.resolve()
  }
  useWorkspaceStorage.setState({ status: 'saving', message: null })
  return enqueue(async () => {
    if (currentRevision !== revision || !useWorkspaceStorage.getState().enabled) return
    try {
      await writeCopy(value)
      lastWriteToken = value.writeToken
      claimPending = false
      if (currentRevision === revision) useWorkspaceStorage.setState({ status: 'saved', message: null, settingsError: null, savedAt: value.savedAt })
    } catch (error) {
      if (error instanceof StorageConflict) {
        reportConflict()
      } else if (currentRevision === revision) reportError('Could not save on this device. Keep this tab open or export your data, then retry.')
    }
  })
}

let settingsRevision = 0
/**
 * Write the analysis settings alone. The dataset copy is never validated or
 * rewritten, and the storage status keeps describing it: a failure here is
 * reported on its own. Only a tab whose dataset is the saved copy writes; two
 * tabs on the same copy: the last write wins. A settings record that already
 * carries this tab's token is overwritten directly. Otherwise (no record, or
 * one of another copy) the dataset record decides, so a copy saved without
 * settings gets them with the first change, and a tab whose dataset was
 * replaced by another tab writes nothing.
 */
function saveSettings(): void {
  const currentRevision = ++settingsRevision
  void enqueue(async () => {
    const token = lastWriteToken
    if (currentRevision !== settingsRevision || token === undefined || claimPending || !useWorkspaceStorage.getState().enabled) return
    const value = settingsRecord(token)
    try {
      await workspaceIdbStore()('readwrite', store => new Promise<void>((resolve, reject) => {
        const put = () => { try { store.put(value, WORKSPACE_SETTINGS_KEY); resolve(promisifyRequest(store.transaction)) } catch (error) { reject(error) } }
        const request = store.get(WORKSPACE_SETTINGS_KEY)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const previous: unknown = request.result
          if (record(previous) && previous.datasetToken === token) { put(); return }
          const dataset = store.get(WORKSPACE_STORAGE_KEY)
          dataset.onerror = () => reject(dataset.error)
          dataset.onsuccess = () => { if (record(dataset.result) && dataset.result.writeToken === token) put(); else resolve() }
        }
      }))
      if (useWorkspaceStorage.getState().settingsError !== null) useWorkspaceStorage.setState({ settingsError: null })
    } catch {
      useWorkspaceStorage.setState({ settingsError: 'Could not save the analysis settings on this device. The dataset copy is unchanged and its seven days are not extended; the next settings change is saved again.' })
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
      await delMany([WORKSPACE_STORAGE_KEY, WORKSPACE_SETTINGS_KEY], workspaceIdbStore())
      lastWriteToken = undefined
      claimPending = false
      if (currentRevision === revision) useWorkspaceStorage.setState({ status: 'session', message: null, settingsError: null, savedAt: null })
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
  useWorkspaceStorage.setState({ enabled: false, status: 'session', message: null, legacyData: 'none', settingsError: null, savedAt: null })
  const legacy: LegacyStorageOutcome = { formerInterfaceData: false, legacyWorkspaceCopy: null }
  let legacyCleanupFailed = false
  try {
    await migrateLegacyStorage(legacy)
  } catch (error) {
    // Clean-up of the shared database must never block this app's own data.
    legacyCleanupFailed = true
    console.warn('Could not clean up data saved by an earlier version.', error)
  }
  if (legacy.formerInterfaceData) useWorkspaceStorage.setState({ legacyData: legacyCleanupFailed ? 'removal-failed' : 'removed' })
  try {
    // One transaction, so the dataset copy and its settings are read as they were written together.
    const [value, storedSettings]: unknown[] = await getMany([WORKSPACE_STORAGE_KEY, WORKSPACE_SETTINGS_KEY], workspaceIdbStore())
    const state = value === undefined ? null : classifySnapshot(value)
    if (state === 'expired') {
      await deleteIfUnchanged(value)
      useWorkspaceStorage.setState({ message: EXPIRED_MESSAGE })
    } else if (state === 'invalid') {
      await deleteIfUnchanged(value)
      useWorkspaceStorage.setState({ message: INVALID_MESSAGE })
    } else if (state === null && (legacy.legacyWorkspaceCopy === 'expired' || legacy.legacyWorkspaceCopy === 'invalid')) {
      // An unusable copy left by the previous release was removed during migration.
      useWorkspaceStorage.setState({ message: legacy.legacyWorkspaceCopy === 'expired' ? EXPIRED_MESSAGE : INVALID_MESSAGE })
    } else if (state === 'usable' && validSnapshot(value)) {
      lastWriteToken = value.writeToken
      useAppStore.getState().replaceDataset({ rows: value.rows,
        events: value.events, patientAttributes: value.patientAttributes,
        manualDemographics: value.manualDemographics, analysisSettings: parseAnalysisSettings(value.analysisSettings)!,
        fileName: value.fileName })
      // Parameters include derived ones (computed eGFR), so they come from the analysis.
      const parameterKeys = new Set(useAppStore.getState().analysisResult().rows.filter(r => r.bezeichnung !== null).map(r => JSON.stringify([r.bezeichnung, r.einheit])))
      // Settings written for another dataset copy are never applied.
      const mine = record(storedSettings) && storedSettings.datasetToken === value.writeToken ? storedSettings : undefined
      const restored = restoreSavedSettings(mine, parameterKeys)
      useAppStore.setState({ trajectoryFitSettings: restored.trajectoryFitSettings, trajectoryView: restored.trajectoryView, notice: { kind: 'info', text: restoredNotice(restored) } })
      useWorkspaceStorage.setState({ enabled: true, status: 'saved', message: null, savedAt: value.savedAt })
    }
  } catch {
    reportError('Local storage is unavailable. You can still import and work in this tab.')
  }
  const stop = useAppStore.subscribe((state, previous) => {
    if (!useWorkspaceStorage.getState().enabled) return
    // A data change rewrites the copy (and restarts its seven days); a change of
    // analysis settings alone writes only the settings record.
    if (state.rows !== previous.rows || state.events !== previous.events
      || state.patientAttributes !== previous.patientAttributes || state.manualDemographics !== previous.manualDemographics
      || state.analysisSettings !== previous.analysisSettings || state.fileName !== previous.fileName) void save()
    else if (state.trajectoryFitSettings !== previous.trajectoryFitSettings || state.trajectoryView !== previous.trajectoryView) saveSettings()
  })
  const onShown = () => { if (document.visibilityState === 'visible') void checkSavedCopy() }
  document.addEventListener('visibilitychange', onShown)
  window.addEventListener('focus', onShown)
  const stopAll = () => {
    stop()
    document.removeEventListener('visibilitychange', onShown)
    window.removeEventListener('focus', onShown)
  }
  unsubscribe = stopAll
  return stopAll
}
