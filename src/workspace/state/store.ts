import { create } from 'zustand'
import type { LabRow } from '../../core/types'
import { computeAnalysisResult, defaultAnalysisSettings } from '../../core/analysis/registry'
import type { AnalysisResult, AnalysisSettings, ManualDemographics } from '../../core/analysis/types'
import type { FormulaName, Source } from '../../core/domains/nephrology/egfr/series'
import type { ClinicalEvent, RejectedClinicalEvent } from '../../core/events/events'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFormulaKey, type MixedModelConfig } from '../../core/mixedModel/config'
import type { MixedModelResult } from '../../core/mixedModel/types'
import { mixedModelIdentityEquals, type MixedModelResultIdentity } from '../../core/mixedModel/resultIdentity'
import type { AppliedProjectionSettings } from '../../core/projection/projectionSnapshot'
import { runCohortMixedModels } from '../../core/mixedModel/cohortModelFit'
import type { CohortModelEntityRows } from '../../core/mixedModel/cohortModelEntity'
import type { PresetExclusionPolicy } from '../../core/mixedModel/cohortDataset'
import { runMixedModelWorkerJob, type RunMixedModelWorkerJobOptions } from '../../core/mixedModel/browserClient'
import type { ImportDiagnostic } from '../../io/loadDataset'
import { defaultTrajectoryFitSettings, modelPreparationKey, type TrajectoryFitSettings } from '../workspace-analysis'

export interface Notice {
  kind: 'error' | 'info'
  text: string
  details?: ImportDiagnostic[]
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
  notice?: Notice | null
}

export interface AppState {
  rows: LabRow[]
  fileName: string | null
  manualDemographics: Record<string, ManualDemographics>
  events: ClinicalEvent[]
  /** Event rows rejected by the latest event import (session only). */
  rejectedEvents: RejectedClinicalEvent[]
  /** Generic per-patient attribute maps keyed by patientIdKey. Domain-neutral:
   * attribute names (e.g. "genotype") carry no special meaning to the app. */
  patientAttributes: Record<string, Record<string, string>>
  analysisSettings: AnalysisSettings
  mixedModelConfig: MixedModelConfig
  presetExclusionPolicy: PresetExclusionPolicy
  /** The analysis settings currently chosen under Trajectories. Trajectories
   * owns and publishes them; cohort models read them to prepare the same
   * measurements. */
  trajectoryFitSettings: TrajectoryFitSettings
  /** Cohort mixed-model results keyed by entity (`'cohort'` for the pooled fit,
   * `'group:<value>'` per group), or null when nothing has been fit. Single
   * source of truth read by the results table and the charts. */
  cohortModelResults: Record<string, StoredMixedModelResult> | null
  /** True while a `runCohortModels` run is in flight (drives the fit button). */
  cohortModelRunning: boolean
  cohortModelProgress: CohortModelProgress | null
  showCohortMixedModelLine: boolean
  projectionSettings: Record<string, AppliedProjectionSettings>
  busy: boolean
  notice: Notice | null
  setNotice: (n: Notice | null) => void
  /** Replace the whole session with a new dataset. Aborts running model jobs
   * and commits rows and their dependent state together, so observers never
   * see new rows with old overrides. */
  replaceDataset: (dataset: DatasetReplacement) => void
  setEgfrFormula: (f: FormulaName | 'off') => void
  setEgfrSource: (s: Source | null) => void
  setManualDemographics: (patientId: LabRow['patientId'], demo: ManualDemographics) => void
  setEvents: (events: ClinicalEvent[]) => void
  setPatientAttributes: (byPatient: Record<string, Record<string, string>>) => void
  analysisResult: () => AnalysisResult
  setMixedModelConfig: (config: MixedModelConfig) => void
  setPresetExclusionPolicy: (policy: PresetExclusionPolicy) => void
  setTrajectoryFitSettings: (settings: TrajectoryFitSettings) => void
  runCohortModels: (params: RunCohortModelsParams) => Promise<void>
  setShowCohortMixedModelLine: (value: boolean) => void
  setProjectionSettings: (seriesIndex: number, seriesKey: string, entityKey: string, applied: AppliedProjectionSettings) => void
  reset: () => void
}

/** Resettable data fields (no actions). Single source of truth for both the
 * store's initial state and reset(), so the two cannot drift. */
type AppData = Pick<AppState,
  | 'rows' | 'fileName' | 'manualDemographics' | 'events' | 'rejectedEvents' | 'patientAttributes'
  | 'analysisSettings' | 'mixedModelConfig' | 'presetExclusionPolicy' | 'trajectoryFitSettings' | 'cohortModelResults' | 'cohortModelRunning'
  | 'cohortModelProgress' | 'showCohortMixedModelLine' | 'projectionSettings' | 'busy' | 'notice'>

const initialState = (): AppData => ({
  rows: [],
  fileName: null,
  manualDemographics: {},
  events: [],
  rejectedEvents: [],
  patientAttributes: {},
  analysisSettings: defaultAnalysisSettings(),
  mixedModelConfig: DEFAULT_MIXED_MODEL_CONFIG,
  presetExclusionPolicy: 'apply',
  trajectoryFitSettings: defaultTrajectoryFitSettings(),
  cohortModelResults: null,
  cohortModelRunning: false,
  cohortModelProgress: null,
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

/** Single source of truth for invalidating every cached mixed-model fit (pooled
 * and per-group) plus the overlay line toggle. Every setter that changes the
 * mixed-model data policy spreads this so the pooled and grouped result stores
 * cannot drift out of sync. */
const clearedMixedModelResults = (): Pick<AppData, 'cohortModelResults' | 'cohortModelRunning' | 'cohortModelProgress' | 'showCohortMixedModelLine' | 'projectionSettings'> => {
  abortActiveCohortModelRun()
  return {
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
  replaceDataset: (dataset) => {
    abortActiveCohortModelRun()
    const initial = initialState()
    set({
      ...initial,
      rows: dataset.rows,
      fileName: dataset.fileName ?? null,
      events: dataset.events ?? [],
      rejectedEvents: dataset.rejectedEvents ?? [],
      patientAttributes: dataset.patientAttributes ?? {},
      manualDemographics: dataset.manualDemographics ?? {},
      analysisSettings: dataset.analysisSettings ?? initial.analysisSettings,
      notice: dataset.notice ?? null,
    })
  },
  setEgfrFormula: (f) => set((s) => ({
    analysisSettings: { ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, formula: f } },
    ...clearedMixedModelResults(),
  })),
  setEgfrSource: (src) => set((s) => ({
    analysisSettings: { ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, source: src } },
    ...clearedMixedModelResults(),
  })),
  setManualDemographics: (patientId, demo) => set((s) => ({
    manualDemographics: { ...s.manualDemographics, [patientId]: demo },
    ...clearedMixedModelResults(),
  })),
  setEvents: (events) => set({ events, ...clearedMixedModelResults() }),
  // Re-importing attributes can re-partition the cohort (group membership and
  // values change), so any cached pooled/per-group fit is stale: invalidate them
  // alongside, exactly like every other data-policy setter.
  setPatientAttributes: (byPatient) => set({ patientAttributes: byPatient, ...clearedMixedModelResults() }),
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
  // measurements a cohort model receives, so fitted models are discarded like
  // after every other data-policy change. Other settings are only recorded.
  setTrajectoryFitSettings: (settings) => set((state) => modelPreparationKey(settings) === modelPreparationKey(state.trajectoryFitSettings)
    ? { trajectoryFitSettings: settings }
    : { trajectoryFitSettings: settings, ...clearedMixedModelResults() }),
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
        return { cohortModelResults, projectionSettings }
      })
    } finally {
      if (activeCohortModelRun === controller) {
        activeCohortModelRun = null
        set({ cohortModelRunning: false, cohortModelProgress: null })
      }
    }
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
