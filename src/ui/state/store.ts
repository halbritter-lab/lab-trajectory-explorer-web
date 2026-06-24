import { create } from 'zustand'
import type { LabRow } from '../../core/types'
import type { SlopeMode } from '../../core/stats/summarize'
import { computeAnalysisResult, defaultAnalysisSettings } from '../../core/analysis/registry'
import type { AnalysisResult, AnalysisSettings, ManualDemographics } from '../../core/analysis/types'
import type { FormulaName, Source } from '../../core/egfr/series'
import type { ClinicalEvent } from '../../core/events/events'
import {
  acuteReviewConfig,
  ckdProgressionConfig,
  generalExplorationConfig,
  type FitConfig,
  type FitPreset,
} from '../../core/fitPipeline/types'
import { saveDataset, clearDataset, saveSettings } from '../../io/persistence'
import { datasetFromArrayBuffer, loadBundledFixtureData } from '../data/loadDataset'

export type ZoomLevel = 's' | 'm' | 'l'

export interface Notice {
  kind: 'error' | 'info'
  text: string
}

export interface SeriesConfig {
  bezeichnung: string | null
  einheit: string | null
  mode: SlopeMode
  gapDays: number
  windowDays: number
  stepDays: number
  cutoffDays: number
  exclusionDays: number
  fitConfig: FitConfig
}

export type FitConfigPatch = {
  xAxis?: FitConfig['xAxis']
  censoring?: Partial<FitConfig['censoring']>
  exclusions?: Partial<FitConfig['exclusions']>
  timeBalancing?: FitConfig['timeBalancing']
  fitModel?: FitConfig['fitModel']
  endpoints?: Partial<FitConfig['endpoints']>
}

export type View = 'one' | 'cohort'
export type CohortPatientMode = 'all' | 'selected'
export type CohortDisplayMode = 'table' | 'overlay'
export type CohortOverlayXAxis = 'age' | 'calendar_time' | 'time_since_baseline'

export interface AppState {
  rows: LabRow[]
  fileName: string | null
  selectedPatientId: number | null
  selectedPatientIds: number[]
  view: View
  returnToCohort: boolean
  cohortPatientMode: CohortPatientMode
  cohortDisplayMode: CohortDisplayMode
  cohortOverlayXAxis: CohortOverlayXAxis
  seriesConfigs: SeriesConfig[]
  analysisSettings: AnalysisSettings
  egfrFormula: FormulaName | 'off'
  egfrSource: Source | null
  manualDemographics: Record<number, ManualDemographics>
  events: ClinicalEvent[]
  showEvents: boolean
  cohortSort: { key: 'id' | 'slope' | 'absSlope' | 'n' | 'duration'; dir: 'asc' | 'desc'; seriesIndex?: number }
  showAki: boolean
  showMethodology: boolean
  persist: boolean
  cohortZoom: ZoomLevel
  connectPoints: boolean
  /** Rapid eGFR-decline flag threshold (mL/min/1.73m²/yr); 0 disables the flag. */
  rapidEgfrThreshold: number
  busy: boolean
  notice: Notice | null
  setNotice: (n: Notice | null) => void
  loadFile: (file: File) => Promise<void>
  loadSynthetic: () => Promise<void>
  setDataset: (rows: LabRow[], fileName?: string) => void
  selectPatient: (id: number) => void
  setSelectedPatientIds: (ids: number[]) => void
  setView: (v: View) => void
  setReturnToCohort: (v: boolean) => void
  setCohortPatientMode: (v: CohortPatientMode) => void
  setCohortDisplayMode: (v: CohortDisplayMode) => void
  setCohortOverlayXAxis: (v: CohortOverlayXAxis) => void
  setSeriesConfig: (index: number, cfg: Partial<SeriesConfig>) => void
  addSeries: () => void
  removeSeries: (index: number) => void
  patientIds: () => number[]
  setEgfrFormula: (f: FormulaName | 'off') => void
  setEgfrSource: (s: Source | null) => void
  setManualDemographics: (patientId: number, demo: ManualDemographics) => void
  setEvents: (events: ClinicalEvent[]) => void
  setShowEvents: (value: boolean) => void
  setSeriesFitPreset: (index: number, preset: FitPreset) => void
  setSeriesFitConfig: (index: number, patch: FitConfigPatch) => void
  analysisResult: () => AnalysisResult
  displayRows: () => LabRow[]
  setCohortSort: (s: AppState['cohortSort']) => void
  setShowAki: (v: boolean) => void
  setShowMethodology: (v: boolean) => void
  setPersist: (v: boolean) => void
  setCohortZoom: (z: ZoomLevel) => void
  setConnectPoints: (v: boolean) => void
  setRapidEgfrThreshold: (n: number) => void
  clearSaved: () => Promise<void>
  reset: () => void
}

const defaultSeries = (): SeriesConfig => ({
  bezeichnung: null,
  einheit: null,
  mode: 'global',
  gapDays: 180,
  windowDays: 730,
  stepDays: 180,
  cutoffDays: 90,
  exclusionDays: 30,
  fitConfig: generalExplorationConfig({ bezeichnung: '(unselected)', einheit: null }),
})

/** Resettable data fields (no actions). Single source of truth for both the
 * store's initial state and reset(), so the two cannot drift. */
type AppData = Pick<AppState,
  | 'rows' | 'fileName' | 'selectedPatientId' | 'selectedPatientIds' | 'view' | 'returnToCohort' | 'cohortPatientMode' | 'seriesConfigs' | 'egfrFormula'
  | 'analysisSettings' | 'egfrSource' | 'manualDemographics' | 'events' | 'showEvents' | 'cohortSort' | 'showAki' | 'showMethodology' | 'persist' | 'cohortZoom'
  | 'cohortDisplayMode' | 'cohortOverlayXAxis' | 'connectPoints' | 'rapidEgfrThreshold' | 'busy' | 'notice'>

function analysisSettingsState(analysisSettings: AnalysisSettings) {
  return {
    analysisSettings,
    egfrFormula: analysisSettings.egfr.formula,
    egfrSource: analysisSettings.egfr.source,
    showAki: analysisSettings.aki.showOverlays,
    rapidEgfrThreshold: analysisSettings.rapidEgfrDecline.threshold,
  }
}

const initialState = (): AppData => {
  const analysisSettings = defaultAnalysisSettings()
  return {
    rows: [],
    fileName: null,
    selectedPatientId: null,
    selectedPatientIds: [],
    view: 'one',
    returnToCohort: false,
    cohortPatientMode: 'all',
    cohortDisplayMode: 'table',
    cohortOverlayXAxis: 'age',
    seriesConfigs: [defaultSeries()],
    ...analysisSettingsState(analysisSettings),
    manualDemographics: {},
    events: [],
    showEvents: true,
    cohortSort: { key: 'id', dir: 'asc' },
    showMethodology: false,
    persist: false,
    cohortZoom: 'm',
    connectPoints: true,
    busy: false,
    notice: null,
  }
}

// Memoise analysis results so displayRows() remains stable across repeated
// selector reads until one of the pipeline inputs changes by reference.
let analysisCache: {
  rows: LabRow[]
  settings: AnalysisSettings
  manual: Record<number, ManualDemographics>
  events: ClinicalEvent[]
  result: AnalysisResult
} | null = null

function computeStoreAnalysisResult(
  rows: LabRow[],
  settings: AnalysisSettings,
  manual: Record<number, ManualDemographics>,
  events: ClinicalEvent[],
): AnalysisResult {
  if (
    analysisCache &&
    analysisCache.rows === rows &&
    analysisCache.settings === settings &&
    analysisCache.manual === manual &&
    analysisCache.events === events
  ) return analysisCache.result

  const result = computeAnalysisResult({ rows, settings, manualDemographics: manual, events })
  analysisCache = { rows, settings, manual, events, result }
  return result
}

function parameterForSeries(config: SeriesConfig): FitConfig['parameter'] {
  return {
    bezeichnung: config.bezeichnung ?? '(unselected)',
    einheit: config.einheit ?? null,
  }
}

function fitConfigForPreset(preset: FitPreset, parameter: FitConfig['parameter']): FitConfig {
  if (preset === 'ckd_progression') return ckdProgressionConfig(parameter)
  if (preset === 'acute_review') return acuteReviewConfig(parameter)
  if (preset === 'custom') return { ...generalExplorationConfig(parameter), preset: 'custom' }
  return generalExplorationConfig(parameter)
}

function modeForFitModel(fitModel: FitConfig['fitModel']): SlopeMode {
  if (fitModel === 'theil-sen') return 'global-robust'
  if (fitModel === 'rolling-ols') return 'rolling'
  if (fitModel === 'segmented-ols') return 'gap-split'
  return 'global'
}

function patchedFitConfig(config: FitConfig, patch: FitConfigPatch): FitConfig {
  return {
    ...config,
    preset: 'custom',
    xAxis: patch.xAxis ?? config.xAxis,
    censoring: { ...config.censoring, ...(patch.censoring ?? {}) },
    exclusions: { ...config.exclusions, ...(patch.exclusions ?? {}) },
    timeBalancing: patch.timeBalancing ?? config.timeBalancing,
    fitModel: patch.fitModel ?? config.fitModel,
    endpoints: { ...config.endpoints, ...(patch.endpoints ?? {}) },
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState(),
  setNotice: (n) => set({ notice: n }),
  loadFile: async (file) => {
    set({ busy: true, notice: null })
    try {
      const rows = datasetFromArrayBuffer(await file.arrayBuffer())
      if (rows.length === 0) { set({ notice: { kind: 'error', text: 'No usable rows found in this file.' } }); return }
      get().setDataset(rows, file.name)
      set({ notice: { kind: 'info', text: `Loaded ${rows.length} rows from ${file.name}.` } })
    } catch (err) {
      set({ notice: { kind: 'error', text: err instanceof Error ? err.message : String(err) } })
    } finally {
      set({ busy: false })
    }
  },
  loadSynthetic: async () => {
    set({ busy: true, notice: null })
    try {
      const { rows, events } = await loadBundledFixtureData()
      get().setDataset(rows, 'test_labs.xlsx (synthetic)')
      set({
        events,
        notice: {
          kind: 'info',
          text: `Loaded ${rows.length} rows and ${events.length} events from the synthetic dataset.`,
        },
      })
    } catch (err) {
      set({ notice: { kind: 'error', text: err instanceof Error ? err.message : String(err) } })
    } finally {
      set({ busy: false })
    }
  },
  setDataset: (rows, fileName) => {
    const ids = [...new Set(rows.map((r) => r.patientId))].sort((a, b) => a - b)
    set((s) => ({
      rows,
      fileName: fileName ?? null,
      selectedPatientId: ids[0] ?? null,
      selectedPatientIds: ids,
      view: 'cohort',
      returnToCohort: false,
      events: [],
      ...analysisSettingsState({ ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, source: null } }),
    }))
    if (get().persist) void saveDataset(rows, fileName ?? null)
  },
  selectPatient: (id) => set({ selectedPatientId: id }),
  setSelectedPatientIds: (ids) => set({ selectedPatientIds: [...new Set(ids)].sort((a, b) => a - b) }),
  setView: (v) => set({ view: v }),
  setReturnToCohort: (v) => set({ returnToCohort: v }),
  setCohortPatientMode: (v) => set({ cohortPatientMode: v }),
  setCohortDisplayMode: (v) => set({ cohortDisplayMode: v }),
  setCohortOverlayXAxis: (v) => set({ cohortOverlayXAxis: v }),
  setSeriesConfig: (index, cfg) =>
    set((s) => ({
      seriesConfigs: s.seriesConfigs.map((c, i) => {
        if (i !== index) return c
        const next = { ...c, ...cfg }
        if ('bezeichnung' in cfg || 'einheit' in cfg) {
          next.fitConfig = { ...next.fitConfig, parameter: parameterForSeries(next) }
        }
        return next
      }),
    })),
  addSeries: () => set((s) => (s.seriesConfigs.length >= 3 ? s : { seriesConfigs: [...s.seriesConfigs, defaultSeries()] })),
  removeSeries: (index) =>
    set((s) => (s.seriesConfigs.length <= 1 ? s : { seriesConfigs: s.seriesConfigs.filter((_, i) => i !== index) })),
  patientIds: () => [...new Set(get().rows.map((r) => r.patientId))].sort((a, b) => a - b),
  setEgfrFormula: (f) => set((s) => analysisSettingsState({ ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, formula: f } })),
  setEgfrSource: (src) => set((s) => analysisSettingsState({ ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, source: src } })),
  setManualDemographics: (patientId, demo) => set((s) => ({ manualDemographics: { ...s.manualDemographics, [patientId]: demo } })),
  setEvents: (events) => set({ events }),
  setShowEvents: (value) => set({ showEvents: value }),
  setSeriesFitPreset: (index, preset) =>
    set((s) => ({
      seriesConfigs: s.seriesConfigs.map((c, i) => {
        if (i !== index) return c
        const fitConfig = fitConfigForPreset(preset, parameterForSeries(c))
        return {
          ...c,
          fitConfig,
          mode: modeForFitModel(fitConfig.fitModel),
          exclusionDays: fitConfig.exclusions.akiExclusionDays,
        }
      }),
    })),
  setSeriesFitConfig: (index, patch) =>
    set((s) => ({
      seriesConfigs: s.seriesConfigs.map((c, i) => {
        if (i !== index) return c
        const fitConfig = patchedFitConfig(c.fitConfig, patch)
        return {
          ...c,
          fitConfig,
          mode: patch.fitModel ? modeForFitModel(patch.fitModel) : c.mode,
          exclusionDays: fitConfig.exclusions.akiExclusionDays,
        }
      }),
    })),
  analysisResult: () => {
    const s = get()
    return computeStoreAnalysisResult(s.rows, s.analysisSettings, s.manualDemographics, s.events)
  },
  displayRows: () => get().analysisResult().rows,
  setCohortSort: (s) => set({ cohortSort: s }),
  setShowAki: (v) => set((s) => analysisSettingsState({
    ...s.analysisSettings,
    aki: { ...s.analysisSettings.aki, showOverlays: v },
  })),
  setShowMethodology: (v) => set({ showMethodology: v }),
  setCohortZoom: (z) => {
    set({ cohortZoom: z })
    if (get().persist) void saveSettings({ cohortZoom: z, rapidEgfrThreshold: get().rapidEgfrThreshold })
  },
  setPersist: (v) => {
    set({ persist: v })
    const s = get()
    if (v) {
      void saveDataset(s.rows, s.fileName)
      void saveSettings({ cohortZoom: s.cohortZoom, rapidEgfrThreshold: s.rapidEgfrThreshold })
    } else void clearDataset()
  },
  setConnectPoints: (v) => set({ connectPoints: v }),
  setRapidEgfrThreshold: (n) => {
    const threshold = Number.isFinite(n) ? Math.max(0, n) : 0
    set((s) => ({
      rapidEgfrThreshold: threshold,
      analysisSettings: {
        ...s.analysisSettings,
        rapidEgfrDecline: { ...s.analysisSettings.rapidEgfrDecline, threshold },
      },
    }))
    if (get().persist) void saveSettings({ cohortZoom: get().cohortZoom, rapidEgfrThreshold: threshold })
  },
  clearSaved: async () => { await clearDataset(); set({ persist: false }) },
  reset: () => set(initialState()),
}))
