/**
 * The analysis settings "Remember on this device" keeps next to the dataset:
 * the Trajectories fit settings (shared and per parameter) and the view
 * choices that decide what the table and plots show. Cohort model settings
 * and results are not kept. Stored settings are validated item by item; an
 * item that no longer fits the dataset or this version falls back to its
 * default and is named to the user. They never invalidate the dataset copy.
 */
import { fitPresetById, overlayModules, parseColumnModuleSettings } from '../core/analysis/registry'
import type { FitModel, TimeBalancing } from '../core/fitPipeline/types'
import type { UnknownDialysisPolicy } from '../core/domains/nephrology/fitConfig'
import { defaultTrajectoryFitSettings, type TrajectoryFitSettings, type WorkspaceFitSettings } from './workspace-analysis'

/** Every value a union allows, checked at compile time: adding a code to the
 * union without listing it here fails the build instead of making every saved
 * copy that uses it invalid on the next start. */
export function allValues<T extends string | null>() {
  return <const L extends readonly T[]>(list: L & ([T] extends [L[number]] ? unknown : 'missing union members')) => list as readonly T[]
}

export interface TrajectoryView {
  /** Parameters shown as columns, in order; null means the page's default. */
  parameterKeys: string[] | null
  /** Parameter keys with Trend on, and those whose trend line is shown. */
  trendKeys: string[]
  fitKeys: string[]
  display: Record<string, boolean>
  axis: 'baseline' | 'calendar' | 'age'
  scaleMode: 'shared' | 'zoom'
  chartSize: 'small' | 'medium' | 'large'
  cellDetails: 'minimal' | 'full' | 'compact'
  warningIcons: boolean
}

export function defaultTrajectoryView(): TrajectoryView {
  return { parameterKeys: null, trendKeys: [], fitKeys: [], display: {}, axis: 'baseline', scaleMode: 'shared', chartSize: 'small', cellDetails: 'minimal', warningIcons: true }
}

/** Raise when the stored shape changes incompatibly; older copies are then
 * discarded as a whole (the dataset itself is kept). */
export const SAVED_SETTINGS_VERSION = 1
export interface SavedSettings {
  version: typeof SAVED_SETTINGS_VERSION
  trajectoryFitSettings: TrajectoryFitSettings
  trajectoryView: TrajectoryView
}

const FIT_MODELS = allValues<FitModel>()(['none', 'ols', 'theil-sen', 'rolling-ols', 'segmented-ols'])
const TIME_BALANCING = allValues<TimeBalancing>()(['raw', 'monthly-median', 'quarterly-median'])
const DIALYSIS_POLICIES = allValues<UnknownDialysisPolicy>()(['flag-only', 'exclude-dated-interval', 'censor-from-start'])
const AXES = allValues<TrajectoryView['axis']>()(['baseline', 'calendar', 'age'])
const SCALE_MODES = allValues<TrajectoryView['scaleMode']>()(['shared', 'zoom'])
const CHART_SIZES = allValues<TrajectoryView['chartSize']>()(['small', 'medium', 'large'])
const CELL_DETAILS = allValues<TrajectoryView['cellDetails']>()(['minimal', 'full', 'compact'])

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const bool = (v: unknown): v is boolean => typeof v === 'boolean'
const days = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => list.includes(v as T)

function parseFitSettings(v: unknown): WorkspaceFitSettings | null {
  if (!record(v) || typeof v.presetId !== 'string' || (v.presetId !== 'custom' && !fitPresetById(v.presetId))) return null
  if (!oneOf(FIT_MODELS, v.fitModel) || !oneOf(TIME_BALANCING, v.timeBalancing)) return null
  const { censoring: c, exclusions: x, endpoints: e } = v
  if (!record(c) || !bool(c.censorAfterKidneyTransplant) || !bool(c.censorAfterChronicDialysis) || !bool(c.excludeAcuteDialysisPeriods) || !oneOf(DIALYSIS_POLICIES, c.unknownDialysisPolicy)) return null
  if (!record(x) || !bool(x.excludeAkiWindows) || !days(x.akiExclusionDays)) return null
  if (!record(e) || !bool(e.percentDecline) || !bool(e.observedCkdG5) || !bool(e.projectedAgeToCkdG5)) return null
  const { observedCkdG4, confirmationDays } = e
  if ((observedCkdG4 !== undefined && !bool(observedCkdG4)) || (confirmationDays !== undefined && !days(confirmationDays))) return null
  const moduleSettings = parseColumnModuleSettings(v.moduleSettings)
  if (moduleSettings === null) return null
  return {
    presetId: v.presetId, fitModel: v.fitModel, timeBalancing: v.timeBalancing,
    censoring: { censorAfterKidneyTransplant: c.censorAfterKidneyTransplant, censorAfterChronicDialysis: c.censorAfterChronicDialysis, excludeAcuteDialysisPeriods: c.excludeAcuteDialysisPeriods, unknownDialysisPolicy: c.unknownDialysisPolicy },
    exclusions: { excludeAkiWindows: x.excludeAkiWindows, akiExclusionDays: x.akiExclusionDays },
    // Key order is part of the exported fit_config JSON (see nephrology/fitConfig.ts).
    endpoints: { percentDecline: e.percentDecline, ...(observedCkdG4 !== undefined ? { observedCkdG4 } : {}), observedCkdG5: e.observedCkdG5,
      ...(confirmationDays !== undefined ? { confirmationDays } : {}), projectedAgeToCkdG5: e.projectedAgeToCkdG5 },
    moduleSettings,
  }
}

export interface RestoredSettings {
  trajectoryFitSettings: TrajectoryFitSettings
  trajectoryView: TrajectoryView
  /** Stored items that were replaced by their defaults, as shown to the user. */
  notRestored: string[]
}

/** Parameter keys are `JSON.stringify([name, unit])`. */
function parameterName(key: string): string {
  try {
    const [name, unit] = JSON.parse(key) as [string, string | null]
    return `${name} [${unit ?? 'no unit'}]`
  } catch { return key }
}

/**
 * Check stored settings against this version and the parameters of the
 * restored dataset. `undefined` (a copy saved before settings were kept)
 * yields the defaults without a complaint.
 */
export function restoreSavedSettings(value: unknown, parameterKeys: ReadonlySet<string>): RestoredSettings {
  const out: RestoredSettings = { trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: defaultTrajectoryView(), notRestored: [] }
  if (value === undefined) return out
  if (!record(value) || value.version !== SAVED_SETTINGS_VERSION) {
    out.notRestored.push('all analysis settings (saved by another version)')
    return out
  }
  const fit = value.trajectoryFitSettings
  if (record(fit)) {
    const shared = parseFitSettings(fit.shared)
    if (shared) out.trajectoryFitSettings.shared = shared
    else out.notRestored.push('shared analysis settings')
    for (const [key, stored] of Object.entries(record(fit.columns) ? fit.columns : {})) {
      const own = parameterKeys.has(key) ? parseFitSettings(stored) : null
      if (own) out.trajectoryFitSettings.columns[key] = own
      else out.notRestored.push(`own settings of ${parameterName(key)}${parameterKeys.has(key) ? '' : ' (parameter not in this dataset)'}`)
    }
  } else out.notRestored.push('analysis settings of all parameters')

  const view = value.trajectoryView
  if (!record(view)) { out.notRestored.push('trend and display settings'); return out }
  const keyList = (name: 'trendKeys' | 'fitKeys', label: string) => {
    const stored = view[name]
    if (!Array.isArray(stored) || !stored.every(k => typeof k === 'string')) { out.notRestored.push(`${label} choices`); return }
    for (const key of stored as string[]) {
      if (parameterKeys.has(key)) out.trajectoryView[name].push(key)
      else out.notRestored.push(`${label} of ${parameterName(key)} (parameter not in this dataset)`)
    }
  }
  if (view.parameterKeys !== null) {
    if (Array.isArray(view.parameterKeys) && view.parameterKeys.every(k => typeof k === 'string')) {
      const shown = (view.parameterKeys as string[]).filter(key => parameterKeys.has(key))
      for (const key of view.parameterKeys as string[]) if (!parameterKeys.has(key)) out.notRestored.push(`column ${parameterName(key)} (parameter not in this dataset)`)
      out.trajectoryView.parameterKeys = shown.length ? shown : null
    } else out.notRestored.push('selected parameters')
  }
  keyList('trendKeys', 'Trend')
  keyList('fitKeys', 'trend line')
  if (record(view.display)) {
    const known = new Set(['points', 'connect', 'events', ...overlayModules().map(module => module.id)])
    for (const [key, shown] of Object.entries(view.display)) {
      if (known.has(key) && bool(shown)) out.trajectoryView.display[key] = shown
      else out.notRestored.push(`display option "${key}"`)
    }
  } else out.notRestored.push('display options')
  if (oneOf(AXES, view.axis)) out.trajectoryView.axis = view.axis
  else out.notRestored.push('time axis')
  if (oneOf(SCALE_MODES, view.scaleMode)) out.trajectoryView.scaleMode = view.scaleMode
  else out.notRestored.push('scale mode')
  if (oneOf(CHART_SIZES, view.chartSize)) out.trajectoryView.chartSize = view.chartSize
  else out.notRestored.push('chart size')
  if (oneOf(CELL_DETAILS, view.cellDetails)) out.trajectoryView.cellDetails = view.cellDetails
  else out.notRestored.push('cell details')
  if (bool(view.warningIcons)) out.trajectoryView.warningIcons = view.warningIcons
  else out.notRestored.push('warning display')
  return out
}

/** The page may be left without losing data only when nothing is loaded or
 * the dataset is saved on this device. */
export function losesDataOnUnload(hasData: boolean, storage: { enabled: boolean; status: 'session' | 'saving' | 'saved' | 'error' }): boolean {
  return hasData && !(storage.enabled && storage.status === 'saved')
}
