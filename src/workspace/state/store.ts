import { create } from 'zustand'
import type { LabRow } from '../../core/types'
import { computeAnalysisResult, defaultAnalysisSettings } from '../../core/analysis/registry'
import type { AnalysisResult, AnalysisSettings, ManualDemographics } from '../../core/analysis/types'
import type { FormulaName, PaediatricRule, Source } from '../../core/domains/nephrology/egfr/series'
import type { ClinicalEvent, RejectedClinicalEvent } from '../../core/events/events'
import type { PeriEventSettings } from '../../core/domains/nephrology/aki/periEvent'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFormulaKey, type MixedModelConfig } from '../../core/mixedModel/config'
import type { MixedModelResult } from '../../core/mixedModel/types'
import { mixedModelIdentityEquals, type MixedModelResultIdentity } from '../../core/mixedModel/resultIdentity'
import type { AppliedProjectionSettings } from '../../core/projection/projectionSnapshot'
import { runCohortMixedModels } from '../../core/mixedModel/cohortModelFit'
import type { CohortModelEntityRows } from '../../core/mixedModel/cohortModelEntity'
import type { PresetExclusionPolicy } from '../../core/mixedModel/cohortDataset'
import { runMixedModelWorkerJob, type RunMixedModelWorkerJobOptions } from '../../core/mixedModel/browserClient'
import type { ImportDiagnostic, ImportSource } from '../../io/loadDataset'
import { defaultTrajectoryFitSettings, modelPreparationKey, type TrajectoryFitSettings } from '../workspace-analysis'
import { defaultTrajectoryView, type TrajectoryView } from '../saved-settings'

export interface Notice {
  kind: 'error' | 'info'
  text: string
}

export interface StoredMixedModelResult {
  result: MixedModelResult
  identity: MixedModelResultIdentity
}

export interface CohortModelProgress {
  completed: number
  total: number
  key: string | null
}

export interface RunCohortModelsParams {
  /** Entities to fit (pooled cohort and/or groups), in display order. */
  entities: CohortModelEntityRows[]
  seriesIndex: number
  seriesKey: string
  fitConfigHash: string
  config: MixedModelConfig
  formula: string
  /** Injectable worker seam (tests pass a mock); defaults to the real webR job. */
  runJob?: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
}

/** A complete replacement session: everything that belongs to one dataset. */
export interface DatasetReplacement {
  rows: LabRow[]
  fileName?: string | null
  events?: ClinicalEvent[]
  rejectedEvents?: RejectedClinicalEvent[]
  patientAttributes?: Record<string, Record<string, string>>
  manualDemographics?: Record<string, ManualDemographics>
  analysisSettings?: AnalysisSettings
  /** The peri-event creatinine selection of a restored copy; none otherwise. */
  periEventSettings?: PeriEventSettings | null
  notice?: Notice | null
  /** Import findings of the lab values, events and attributes of this dataset. */
  importDiagnostics?: ImportDiagnostic[]
  /** The bundled demo exactly as shipped (see AppState.pristineDemo). */
  pristineDemo?: boolean
}

export interface AppState {
  rows: LabRow[]
  fileName: string | null
  /** The loaded dataset is the bundled demo exactly as shipped, which loads
   * again with one click. Any import on top of it, demographic edit or change
   * of the derivation settings ends that, and a copy restored from this device
   * never counts. */
  pristineDemo: boolean
  manualDemographics: Record<string, ManualDemographics>
  events: ClinicalEvent[]
  /** Event rows rejected by the latest event import (session only). */
  rejectedEvents: RejectedClinicalEvent[]
  /** Import findings of the loaded dataset, each marked with its source table
   * (lab values, events, attributes). A source keeps its findings until that
   * table is imported again; they are saved with the dataset. */
  importDiagnostics: ImportDiagnostic[]
  /** Generic per-patient attribute maps keyed by patientIdKey. Domain-neutral:
   * attribute names (e.g. "genotype") carry no special meaning to the app. */
  patientAttributes: Record<string, Record<string, string>>
  analysisSettings: AnalysisSettings
  /** Events and window of the peri-event creatinine analysis on the Data page
   * (issue #69); null while no events are selected. Saved with the dataset copy. */
  periEventSettings: PeriEventSettings | null
  mixedModelConfig: MixedModelConfig
  presetExclusionPolicy: PresetExclusionPolicy
  /** The analysis settings currently chosen under Trajectories. Trajectories
   * owns and publishes them; cohort models read them to prepare the same
   * measurements. */
  trajectoryFitSettings: TrajectoryFitSettings
  /** Trend, trend-line and display choices of the Trajectories page. The page
   * owns them and publishes them here so they can be saved with the dataset. */
  trajectoryView: TrajectoryView
  /** Cohort mixed-model results keyed by entity (`'cohort'` for the pooled fit,
   * `'group:<value>'` per group), or null when nothing has been fit. Single
   * source of truth read by the results table and the charts. */
  cohortModelResults: Record<string, StoredMixedModelResult> | null
  /** True while a `runCohortModels` run is in flight (drives the fit button). */
  cohortModelRunning: boolean
  cohortModelProgress: CohortModelProgress | null
  /** R is loaded in the fit worker: true after a run with a fitted model,
   * false again whenever a running fit is stopped (Cancel, or a change that
   * discards the models) or a run ends with a timeout or a worker failure,
   * all of which stop the worker. The page shows its "loads R" notice while
   * this is false. */
  cohortModelRuntimeLoaded: boolean
  showCohortMixedModelLine: boolean
  projectionSettings: Record<string, AppliedProjectionSettings>
  busy: boolean
  notice: Notice | null
  setNotice: (n: Notice | null) => void
  /** Replace the findings of one source table; the other sources keep theirs. */
  setImportDiagnostics: (source: ImportSource, diagnostics: ImportDiagnostic[]) => void
  /** Replace the whole session with a new dataset. Aborts running model jobs
   * and commits rows and their dependent state together, so observers never
   * see new rows with old overrides. */
  replaceDataset: (dataset: DatasetReplacement) => void
  setEgfrFormula: (f: FormulaName | 'off') => void
  setEgfrSource: (s: Source | null) => void
  setEgfrPaediatric: (rule: PaediatricRule) => void
  /** Recovery that separates two AKI episodes (hours, dataset-level). */
  setAkiRecoveryHours: (hours: number) => void
  /** Replace the dataset-level analysis settings as a whole ("Apply settings
   * from an export"); an unchanged value changes nothing. */
  applyAnalysisSettings: (settings: AnalysisSettings) => void
  /** Events and window of the peri-event creatinine analysis (dataset-level);
   * null selects no events. Kept apart from `analysisSettings`, so a change
   * recomputes no analysis or fit and keeps the cohort models. */
  setPeriEventSettings: (settings: PeriEventSettings | null) => void
  setManualDemographics: (patientId: LabRow['patientId'], demo: ManualDemographics) => void
  setEvents: (events: ClinicalEvent[]) => void
  setPatientAttributes: (byPatient: Record<string, Record<string, string>>) => void
  analysisResult: () => AnalysisResult
  setMixedModelConfig: (config: MixedModelConfig) => void
  setPresetExclusionPolicy: (policy: PresetExclusionPolicy) => void
  setTrajectoryFitSettings: (settings: TrajectoryFitSettings) => void
  setTrajectoryView: (view: TrajectoryView) => void
  runCohortModels: (params: RunCohortModelsParams) => Promise<void>
  /** Stops the running fits. Results already stored are kept; nothing of the
   * stopped run is stored. */
  cancelCohortModels: () => void
  setShowCohortMixedModelLine: (value: boolean) => void
  setProjectionSettings: (seriesIndex: number, seriesKey: string, entityKey: string, applied: AppliedProjectionSettings) => void
  reset: () => void
}

/** Resettable data fields (no actions). Single source of truth for both the
 * store's initial state and reset(), so the two cannot drift. */
type AppData = Pick<AppState,
  | 'rows' | 'fileName' | 'pristineDemo' | 'manualDemographics' | 'events' | 'rejectedEvents' | 'importDiagnostics' | 'patientAttributes'
  | 'analysisSettings' | 'periEventSettings' | 'mixedModelConfig' | 'presetExclusionPolicy' | 'trajectoryFitSettings' | 'trajectoryView' | 'cohortModelResults' | 'cohortModelRunning'
  | 'cohortModelProgress' | 'cohortModelRuntimeLoaded' | 'showCohortMixedModelLine' | 'projectionSettings' | 'busy' | 'notice'>

const initialState = (): AppData => ({
  rows: [],
  fileName: null,
  pristineDemo: false,
  manualDemographics: {},
  events: [],
  rejectedEvents: [],
  importDiagnostics: [],
  patientAttributes: {},
  analysisSettings: defaultAnalysisSettings(),
  periEventSettings: null,
  mixedModelConfig: DEFAULT_MIXED_MODEL_CONFIG,
  presetExclusionPolicy: 'apply',
  trajectoryFitSettings: defaultTrajectoryFitSettings(),
  trajectoryView: defaultTrajectoryView(),
  cohortModelResults: null,
  cohortModelRunning: false,
  cohortModelProgress: null,
  cohortModelRuntimeLoaded: false,
  showCohortMixedModelLine: false,
  projectionSettings: {},
  busy: false,
  notice: null,
})

// Memoise analysis results so repeated selector reads stay stable until one of
// the pipeline inputs changes by reference.
let analysisCache: {
  rows: LabRow[]
  settings: AnalysisSettings
  manual: Record<string, ManualDemographics>
  attributes: Record<string, Record<string, string>>
  events: ClinicalEvent[]
  result: AnalysisResult
} | null = null

function computeStoreAnalysisResult(
  rows: LabRow[],
  settings: AnalysisSettings,
  manual: Record<string, ManualDemographics>,
  attributes: Record<string, Record<string, string>>,
  events: ClinicalEvent[],
): AnalysisResult {
  if (
    analysisCache &&
    analysisCache.rows === rows &&
    analysisCache.settings === settings &&
    analysisCache.manual === manual &&
    analysisCache.attributes === attributes &&
    analysisCache.events === events
  ) return analysisCache.result

  const result = computeAnalysisResult({
    rows,
    settings,
    manualDemographics: manual,
    patientAttributes: attributes,
    events,
  })
  analysisCache = { rows, settings, manual, attributes, events, result }
  return result
}

/** The in-flight cohort-model run, so any result-invalidating change can abort
 * it. Module-scoped (not in serializable state). */
let activeCohortModelRun: AbortController | null = null
function abortActiveCohortModelRun() {
  activeCohortModelRun?.abort()
  activeCohortModelRun = null
}

export function projectionSettingsKey(seriesIndex: number, seriesKey: string, entityKey: string): string {
  return JSON.stringify([seriesIndex, seriesKey, entityKey])
}

/** Whether replacing the Trajectories fit settings by `settings` discards the
 * stored cohort models or stops a running fit: when the preparation of a
 * parameter with a stored model changes, or any preparation changes while a
 * fit runs. The one rule for the store and for the question the Cohort
 * models page asks beforehand. */
export function trajectorySettingsDiscardModels(state: Pick<AppData, 'trajectoryFitSettings' | 'cohortModelResults' | 'cohortModelRunning'>, settings: TrajectoryFitSettings): boolean {
  const previous = state.trajectoryFitSettings
  const fittedKeys = [...new Set(Object.values(state.cohortModelResults ?? {}).map((stored) => stored.identity.seriesKey))]
  return fittedKeys.some((key) => modelPreparationKey(settings, key) !== modelPreparationKey(previous, key))
    // A running fit has no stored identity yet; any preparation change stops it.
    || (state.cohortModelRunning && modelPreparationKey(settings) !== modelPreparationKey(previous))
}

/** Single source of truth for invalidating every cached mixed-model fit (pooled
 * and per-group) plus the overlay line toggle. Every setter that changes the
 * mixed-model data policy spreads this so the pooled and grouped result stores
 * cannot drift out of sync. */
const clearedMixedModelResults = (): Pick<AppData, 'cohortModelResults' | 'cohortModelRunning' | 'cohortModelProgress' | 'showCohortMixedModelLine' | 'projectionSettings'> & Partial<Pick<AppData, 'cohortModelRuntimeLoaded'>> => {
  // Stopping a running fit stops its worker, so R loads again with the next fit.
  const wasRunning = activeCohortModelRun !== null
  abortActiveCohortModelRun()
  return {
    ...(wasRunning ? { cohortModelRuntimeLoaded: false } : {}),
    cohortModelResults: null,
    cohortModelRunning: false,
    cohortModelProgress: null,
    showCohortMixedModelLine: false,
    projectionSettings: {},
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState(),
  setNotice: (n) => set({ notice: n }),
  setImportDiagnostics: (source, diagnostics) => set((s) => ({
    importDiagnostics: [...s.importDiagnostics.filter((d) => d.source !== source), ...diagnostics.filter((d) => d.source === source)],
  })),
  replaceDataset: (dataset) => {
    abortActiveCohortModelRun()
    const initial = initialState()
    set({
      ...initial,
      rows: dataset.rows,
      fileName: dataset.fileName ?? null,
      events: dataset.events ?? [],
      rejectedEvents: dataset.rejectedEvents ?? [],
      importDiagnostics: dataset.importDiagnostics ?? [],
      patientAttributes: dataset.patientAttributes ?? {},
      manualDemographics: dataset.manualDemographics ?? {},
      analysisSettings: dataset.analysisSettings ?? initial.analysisSettings,
      periEventSettings: dataset.periEventSettings ?? null,
      notice: dataset.notice ?? null,
      pristineDemo: dataset.pristineDemo ?? false,
    })
  },
  setEgfrFormula: (f) => set((s) => ({
    analysisSettings: { ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, formula: f } },
    pristineDemo: false,
    ...clearedMixedModelResults(),
  })),
  setEgfrSource: (src) => set((s) => ({
    analysisSettings: { ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, source: src } },
    pristineDemo: false,
    ...clearedMixedModelResults(),
  })),
  setEgfrPaediatric: (rule) => set((s) => ({
    analysisSettings: { ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, paediatric: rule } },
    pristineDemo: false,
    ...clearedMixedModelResults(),
  })),
  setAkiRecoveryHours: (hours) => set((s) => ({
    analysisSettings: { ...s.analysisSettings, aki: { ...s.analysisSettings.aki, recoveryHours: hours } },
    pristineDemo: false,
    ...clearedMixedModelResults(),
  })),
  applyAnalysisSettings: (settings) => set((s) => JSON.stringify(settings) === JSON.stringify(s.analysisSettings) ? s : ({
    analysisSettings: settings,
    pristineDemo: false,
    ...clearedMixedModelResults(),
  })),
  setPeriEventSettings: (settings) => set({ periEventSettings: settings, pristineDemo: false }),
  setManualDemographics: (patientId, demo) => set((s) => ({
    manualDemographics: { ...s.manualDemographics, [patientId]: demo },
    pristineDemo: false,
    ...clearedMixedModelResults(),
  })),
  setEvents: (events) => set({ events, pristineDemo: false, ...clearedMixedModelResults() }),
  // Re-importing attributes can re-partition the cohort (group membership and
  // values change), so any cached pooled/per-group fit is stale: invalidate them
  // alongside, exactly like every other data-policy setter.
  setPatientAttributes: (byPatient) => set({ patientAttributes: byPatient, pristineDemo: false, ...clearedMixedModelResults() }),
  analysisResult: () => {
    const s = get()
    return computeStoreAnalysisResult(
      s.rows,
      s.analysisSettings,
      s.manualDemographics,
      s.patientAttributes,
      s.events,
    )
  },
  setMixedModelConfig: (config) => set({
    mixedModelConfig: config,
    ...clearedMixedModelResults(),
  }),
  setPresetExclusionPolicy: (policy) => set((state) => policy === state.presetExclusionPolicy ? state : ({
    presetExclusionPolicy: policy,
    ...clearedMixedModelResults(),
  })),
  // A change to fit model, time balancing, censoring or exclusions changes the
  // measurements a cohort model receives, so models fitted for the affected
  // parameter are discarded like after every other data-policy change. Other
  // settings, and other parameters' settings, are only recorded.
  setTrajectoryFitSettings: (settings) => set((state) => {
    const previous = state.trajectoryFitSettings
    if (JSON.stringify(settings) === JSON.stringify(previous)) return state
    return trajectorySettingsDiscardModels(state, settings) ? { trajectoryFitSettings: settings, ...clearedMixedModelResults() } : { trajectoryFitSettings: settings }
  }),
  // Unchanged content keeps the stored object, so nothing is saved again.
  setTrajectoryView: (view) => set((state) => JSON.stringify(view) === JSON.stringify(state.trajectoryView) ? state : { trajectoryView: view }),
  runCohortModels: async ({ entities, seriesIndex, seriesKey, fitConfigHash, config, formula, runJob = runMixedModelWorkerJob }) => {
    abortActiveCohortModelRun()
    const controller = new AbortController()
    activeCohortModelRun = controller
    set({ cohortModelRunning: true, cohortModelProgress: { completed: 0, total: entities.length, key: null } })
    try {
      const map = await runCohortMixedModels({
        entities,
        seriesIndex,
        seriesKey,
        fitConfigHash,
        config,
        formula,
        formulaKey: mixedModelFormulaKey(config),
        datasetId: 'cohort',
        runJob,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted && activeCohortModelRun === controller) set({ cohortModelProgress: progress })
        },
      })
      // A superseded run was aborted; its results are also identity-guarded by
      // consumers, so a late arrival is harmless either way.
      if (controller.signal.aborted || activeCohortModelRun !== controller) return
      // Merge so fitting only groups keeps a prior cohort result (and vice versa).
      set((s) => {
        const cohortModelResults = { ...(s.cohortModelResults ?? {}), ...map }
        const projectionSettings = Object.fromEntries(Object.entries(s.projectionSettings).filter(([key, applied]) => {
          const entityKey = JSON.parse(key)[2] as string
          const stored = cohortModelResults[entityKey]
          return stored?.result.status === 'success' && stored.result.converged && !stored.result.singular && mixedModelIdentityEquals(applied.sourceIdentity, stored.identity)
        }))
        // A fitted model proves R is loaded; a timeout or a worker failure stopped the worker.
        const results = Object.values(map).map((stored) => stored.result)
        const runtime = results.some((result) => result.status === 'success') ? { cohortModelRuntimeLoaded: true }
          : results.some((result) => result.status !== 'success' && (result.status === 'timeout' || result.code.startsWith('WORKER_'))) ? { cohortModelRuntimeLoaded: false } : {}
        return { cohortModelResults, projectionSettings, ...runtime }
      })
    } finally {
      if (activeCohortModelRun === controller) {
        activeCohortModelRun = null
        set({ cohortModelRunning: false, cohortModelProgress: null })
      }
    }
  },
  cancelCohortModels: () => {
    if (!activeCohortModelRun) return
    // Aborting stops the worker (see browserClient), so R loads again with the next fit.
    abortActiveCohortModelRun()
    set({ cohortModelRunning: false, cohortModelProgress: null, cohortModelRuntimeLoaded: false })
  },
  setShowCohortMixedModelLine: (value) => set({ showCohortMixedModelLine: value }),
  setProjectionSettings: (seriesIndex, seriesKey, entityKey, applied) => set((s) => {
    const stored = s.cohortModelResults?.[entityKey]
    if (!stored || stored.result.status !== 'success' || !stored.result.converged || stored.result.singular ||
      applied.sourceIdentity.seriesIndex !== seriesIndex || applied.sourceIdentity.seriesKey !== seriesKey ||
      !mixedModelIdentityEquals(stored.identity, applied.sourceIdentity)) return {}
    return { projectionSettings: { ...s.projectionSettings, [projectionSettingsKey(seriesIndex, seriesKey, entityKey)]: structuredClone(applied) } }
  }),
  reset: () => {
    abortActiveCohortModelRun()
    set(initialState())
  },
}))
