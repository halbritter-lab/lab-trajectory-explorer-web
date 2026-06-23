import { create } from 'zustand'
import type { LabRow, Sex } from '../../core/types'
import type { SlopeMode } from '../../core/stats/summarize'
import { appendComputedEgfr, type FormulaName, type Source } from '../../core/egfr/series'
import type { ValidAnnotation } from '../../core/annotations/annotations'
import { saveDataset, clearDataset, saveSettings } from '../../io/persistence'
import { datasetFromArrayBuffer, loadBundledFixture } from '../data/loadDataset'
import { RAPID_EGFR_DECLINE_DEFAULT } from '../../core/cohort/screening'

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
}

export type View = 'one' | 'cohort'
export type CohortPatientMode = 'all' | 'selected'

export interface ManualDemographics {
  sex?: Sex
  age?: number
}

export interface AppState {
  rows: LabRow[]
  fileName: string | null
  selectedPatientId: number | null
  selectedPatientIds: number[]
  view: View
  returnToCohort: boolean
  cohortPatientMode: CohortPatientMode
  seriesConfigs: SeriesConfig[]
  egfrFormula: FormulaName | 'off'
  egfrSource: Source | null
  manualDemographics: Record<number, ManualDemographics>
  annotations: ValidAnnotation[]
  showAnnotations: boolean
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
  setSeriesConfig: (index: number, cfg: Partial<SeriesConfig>) => void
  addSeries: () => void
  removeSeries: (index: number) => void
  patientIds: () => number[]
  setEgfrFormula: (f: FormulaName | 'off') => void
  setEgfrSource: (s: Source | null) => void
  setManualDemographics: (patientId: number, demo: ManualDemographics) => void
  setAnnotations: (a: ValidAnnotation[]) => void
  setShowAnnotations: (v: boolean) => void
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
  bezeichnung: null, einheit: null, mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180, cutoffDays: 90, exclusionDays: 30,
})

/** Resettable data fields (no actions). Single source of truth for both the
 * store's initial state and reset(), so the two cannot drift. */
type AppData = Pick<AppState,
  | 'rows' | 'fileName' | 'selectedPatientId' | 'selectedPatientIds' | 'view' | 'returnToCohort' | 'cohortPatientMode' | 'seriesConfigs' | 'egfrFormula'
  | 'egfrSource' | 'manualDemographics' | 'annotations' | 'showAnnotations' | 'cohortSort' | 'showAki' | 'showMethodology' | 'persist' | 'cohortZoom'
  | 'connectPoints' | 'rapidEgfrThreshold' | 'busy' | 'notice'>

const initialState = (): AppData => ({
  rows: [],
  fileName: null,
  selectedPatientId: null,
  selectedPatientIds: [],
  view: 'one',
  returnToCohort: false,
  cohortPatientMode: 'all',
  seriesConfigs: [defaultSeries()],
  egfrFormula: 'off',
  egfrSource: null,
  manualDemographics: {},
  annotations: [],
  showAnnotations: true,
  cohortSort: { key: 'id', dir: 'asc' },
  showAki: false,
  showMethodology: false,
  persist: false,
  cohortZoom: 'm',
  connectPoints: true,
  rapidEgfrThreshold: RAPID_EGFR_DECLINE_DEFAULT,
  busy: false,
  notice: null,
})

// Memoise the eGFR-appended rows so displayRows() is O(1) on repeated calls and
// returns a stable reference (selectors reading it won't see a new array every
// render). Recomputes only when the rows array or formula changes.
let egfrCache: { rows: LabRow[]; formula: FormulaName | 'off'; source: Source | null; manual: Record<number, ManualDemographics>; result: LabRow[] } | null = null
function rowsWithManualDemographics(rows: LabRow[], manual: Record<number, ManualDemographics>): LabRow[] {
  if (Object.keys(manual).length === 0) return rows
  return rows.map((r) => {
    const demo = manual[r.patientId]
    return demo ? { ...r, patientSex: demo.sex ?? r.patientSex, patientAgeAtLab: demo.age ?? r.patientAgeAtLab } : r
  })
}

function sameSource(a: Source | null, b: Source | null): boolean {
  return a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1])
}

function computeDisplayRows(rows: LabRow[], formula: FormulaName | 'off', source: Source | null, manual: Record<number, ManualDemographics>): LabRow[] {
  if (egfrCache && egfrCache.rows === rows && egfrCache.formula === formula && sameSource(egfrCache.source, source) && egfrCache.manual === manual) return egfrCache.result
  const withManual = rowsWithManualDemographics(rows, manual)
  const result = formula === 'off' ? withManual : appendComputedEgfr(withManual, { formula, source })
  egfrCache = { rows, formula, source, manual, result }
  return result
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
      const rows = await loadBundledFixture()
      get().setDataset(rows, 'test_labs.xlsx (synthetic)')
      set({ notice: { kind: 'info', text: `Loaded ${rows.length} rows from the synthetic dataset.` } })
    } catch (err) {
      set({ notice: { kind: 'error', text: err instanceof Error ? err.message : String(err) } })
    } finally {
      set({ busy: false })
    }
  },
  setDataset: (rows, fileName) => {
    const ids = [...new Set(rows.map((r) => r.patientId))].sort((a, b) => a - b)
    set({ rows, fileName: fileName ?? null, selectedPatientId: ids[0] ?? null, selectedPatientIds: ids, view: 'cohort', returnToCohort: false, egfrSource: null })
    if (get().persist) void saveDataset(rows, fileName ?? null)
  },
  selectPatient: (id) => set({ selectedPatientId: id }),
  setSelectedPatientIds: (ids) => set({ selectedPatientIds: [...new Set(ids)].sort((a, b) => a - b) }),
  setView: (v) => set({ view: v }),
  setReturnToCohort: (v) => set({ returnToCohort: v }),
  setCohortPatientMode: (v) => set({ cohortPatientMode: v }),
  setSeriesConfig: (index, cfg) =>
    set((s) => ({ seriesConfigs: s.seriesConfigs.map((c, i) => (i === index ? { ...c, ...cfg } : c)) })),
  addSeries: () => set((s) => (s.seriesConfigs.length >= 3 ? s : { seriesConfigs: [...s.seriesConfigs, defaultSeries()] })),
  removeSeries: (index) =>
    set((s) => (s.seriesConfigs.length <= 1 ? s : { seriesConfigs: s.seriesConfigs.filter((_, i) => i !== index) })),
  patientIds: () => [...new Set(get().rows.map((r) => r.patientId))].sort((a, b) => a - b),
  setEgfrFormula: (f) => set({ egfrFormula: f }),
  setEgfrSource: (s) => set({ egfrSource: s }),
  setManualDemographics: (patientId, demo) => set((s) => ({ manualDemographics: { ...s.manualDemographics, [patientId]: demo } })),
  setAnnotations: (a) => set({ annotations: a }),
  setShowAnnotations: (v) => set({ showAnnotations: v }),
  displayRows: () => { const s = get(); return computeDisplayRows(s.rows, s.egfrFormula, s.egfrSource, s.manualDemographics) },
  setCohortSort: (s) => set({ cohortSort: s }),
  setShowAki: (v) => set({ showAki: v }),
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
    set({ rapidEgfrThreshold: threshold })
    if (get().persist) void saveSettings({ cohortZoom: get().cohortZoom, rapidEgfrThreshold: threshold })
  },
  clearSaved: async () => { await clearDataset(); set({ persist: false }) },
  reset: () => set(initialState()),
}))
