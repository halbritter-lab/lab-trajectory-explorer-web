import { create } from 'zustand'
import { createStore, del, get, keys, update, type UseStore } from 'idb-keyval'
import { useAppStore } from './state/store'
import type { AnalysisContext } from '../core/analysis/types'
import { parseAnalysisSettings, type AnalysisSettings } from '../core/analysis/registry'
import type { Sex, WertOperator } from '../core/types'
import type { ClinicalEventType, ClinicalEventWarning, DialysisIntent } from '../core/events/events'

export const WORKSPACE_STORAGE_KEY = 'lab-explorer:workspace:v1'
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
interface StorageStatus {
  enabled: boolean
  status: 'session' | 'saving' | 'saved' | 'error'
  message: string | null
  /** Data saved by the former interface found at start-up: removed, or found
   * but not (completely) removable. Shown once as a notice. */
  legacyData: 'none' | 'removed' | 'removal-failed'
}
export const useWorkspaceStorage = create<StorageStatus>(() => ({ enabled: false, status: 'session', message: null, legacyData: 'none' }))

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nullableText = (v: unknown) => v === null || typeof v === 'string'
const nullableNumber = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v)
const validDate = (v: unknown) => v instanceof Date && Number.isFinite(v.getTime())
const nullableDate = (v: unknown) => v === null || validDate(v)
const patientId = (v: unknown) => typeof v === 'string' && v.length > 0 || typeof v === 'number' && Number.isFinite(v)
/** Every value a union allows, checked at compile time: adding a code to the
 * union without listing it here fails the build instead of making every saved
 * copy that uses it invalid (and therefore deleted) on the next start. */
function allValues<T extends string | null>() {
  return <const L extends readonly T[]>(list: L & ([T] extends [L[number]] ? unknown : 'missing union members')) => list as readonly T[]
}
const SEX_CODES = allValues<Sex>()(['m', 'w', 'd'])
const OPERATORS = allValues<WertOperator>()(['=', '<', '>', 'range', 'unparseable'])
const EVENT_TYPES = allValues<ClinicalEventType>()(['kidney_transplant', 'dialysis', 'other'])
const INTENTS = allValues<DialysisIntent | null>()([null, 'acute', 'chronic', 'unknown'])
const EVENT_WARNINGS = allValues<ClinicalEventWarning>()(['', 'unknown_patient', 'unknown_dialysis_intent', 'unresolved_dialysis_interval'])
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
      if (current !== undefined && (!record(current) || current.writeToken === token && current.savedAt === savedAt)) store.delete(WORKSPACE_STORAGE_KEY)
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
  // Never write a copy the next start would reject and delete.
  if (!validSnapshot(value)) {
    reportError('This dataset cannot be saved on this device because it contains values the saved format does not accept. It stays available in this tab; export your data to keep it.')
    return Promise.resolve()
  }
  useWorkspaceStorage.setState({ status: 'saving', message: null })
  return enqueue(async () => {
    if (currentRevision !== revision || !useWorkspaceStorage.getState().enabled) return
    try {
      // IndexedDB's read/write transaction makes compare-and-swap atomic across
      // tabs. A stale tab cannot resurrect a deleted copy or overwrite a new one.
      await update<Snapshot>(WORKSPACE_STORAGE_KEY, previous => {
        if (!claimPending && previous?.writeToken !== lastWriteToken) throw new StorageConflict()
        return value
      }, workspaceIdbStore())
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
      await del(WORKSPACE_STORAGE_KEY, workspaceIdbStore())
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
  useWorkspaceStorage.setState({ enabled: false, status: 'session', message: null, legacyData: 'none' })
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
    const value: unknown = await get(WORKSPACE_STORAGE_KEY, workspaceIdbStore())
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
      useWorkspaceStorage.setState({ enabled: true, status: 'saved', message: null })
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
