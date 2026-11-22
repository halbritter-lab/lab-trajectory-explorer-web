/**
 * The analysis settings "Remember on this device" keeps next to the dataset:
 * the Trajectories fit settings (shared and per parameter) and the view
 * choices that decide what the table and plots show. Cohort model settings
 * and results are not kept. Stored settings are validated item by item; an
 * item that no longer fits the dataset or this version falls back to its
 * default and is named to the user. They never invalidate the dataset copy.
 */
import { fitPresetById, isRecord as record, parseColumnModuleSettings } from '../core/analysis/registry'
import type { FitModel, TimeBalancing } from '../core/fitPipeline/types'
import type { UnknownDialysisPolicy } from '../core/domains/nephrology/fitConfig'
import { COMPUTED_BEZEICHNUNG_SUFFIX } from '../core/domains/nephrology/analytes'
import { DEFAULT_BOUNDED_VALUE_POLICY, type BoundedValuePolicy } from '../core/measurements/censored'
import { defaultFitSettings, defaultTrajectoryFitSettings, type TrajectoryFitSettings, type WorkspaceFitSettings } from './workspace-analysis'
import { parameterLabel } from './workspace-labels'
import type { AnchorComparisonSettings } from '../core/cohort/anchorComparison'
import { DEFAULT_WORKSPACE_DISPLAY, type WorkspaceAxis } from './WorkspacePlot'
import type { SparkSize } from './WorkspaceSparkline'

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
  axis: WorkspaceAxis
  scaleMode: 'shared' | 'zoom'
  chartSize: SparkSize
  cellDetails: 'minimal' | 'full' | 'compact'
  warningIcons: boolean
  /** "Measurement points" was switched by the user: the switch then decides,
   * also in a dense overlay. Absent while the switch is untouched. */
  pointsChosen?: true
  /** Parameter keys whose charts use a logarithmic y axis, which also gives
   * the doubling or halving time (issue #70). Absent while no column has one. */
  logKeys?: string[]
}

export function defaultTrajectoryView(): TrajectoryView {
  return { parameterKeys: null, trendKeys: [], fitKeys: [], display: {}, axis: 'baseline', scaleMode: 'shared', chartSize: 'small', cellDetails: 'minimal', warningIcons: false }
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
const BOUNDED_VALUES = allValues<BoundedValuePolicy>()(['limit', 'exclude', 'half-limit'])
const DIALYSIS_POLICIES = allValues<UnknownDialysisPolicy>()(['flag-only', 'exclude-dated-interval', 'censor-from-start'])
const AXES = allValues<TrajectoryView['axis']>()(['baseline', 'baselineDays', 'calendar', 'age', 'event'])
const SCALE_MODES = allValues<TrajectoryView['scaleMode']>()(['shared', 'zoom'])
const CHART_SIZES = allValues<TrajectoryView['chartSize']>()(['small', 'medium', 'large'])
const CELL_DETAILS = allValues<TrajectoryView['cellDetails']>()(['minimal', 'full', 'compact'])

const bool = (v: unknown): v is boolean => typeof v === 'boolean'
const days = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => list.includes(v as T)
/** JSON with sorted object keys, so two settings compare by content. */
const canonical = (v: unknown): string => JSON.stringify(v, (_key, value: unknown) =>
  record(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1)) : value)

/** `ignoredModules` receives the ids of stored module settings that were left at their defaults. */
function parseFitSettings(v: unknown, ignoredModules: string[]): WorkspaceFitSettings | null {
  if (!record(v) || typeof v.presetId !== 'string' || (v.presetId !== 'custom' && !fitPresetById(v.presetId))) return null
  if (!oneOf(FIT_MODELS, v.fitModel) || !oneOf(TIME_BALANCING, v.timeBalancing)) return null
  const { censoring: c, exclusions: x, endpoints: e } = v
  if (!record(c) || !bool(c.censorAfterKidneyTransplant) || !bool(c.censorAfterChronicDialysis) || !bool(c.excludeAcuteDialysisPeriods) || !oneOf(DIALYSIS_POLICIES, c.unknownDialysisPolicy)) return null
  if (!record(x) || !bool(x.excludeAkiWindows) || !days(x.akiExclusionDays)) return null
  if (!record(e) || !bool(e.percentDecline) || !bool(e.observedCkdG5) || !bool(e.projectedAgeToCkdG5)) return null
  const { observedCkdG4, confirmationDays } = e
  if ((observedCkdG4 !== undefined && !bool(observedCkdG4)) || (confirmationDays !== undefined && !days(confirmationDays))) return null
  const modules = parseColumnModuleSettings(v.moduleSettings)
  if (modules === null) return null
  // Absent in settings saved or exported before 2026-11-22 (issue #73): the default applies.
  if (v.boundedValues !== undefined && !oneOf(BOUNDED_VALUES, v.boundedValues)) return null
  const boundedValues = v.boundedValues ?? DEFAULT_BOUNDED_VALUE_POLICY
  const anchorComparison = v.anchorComparison === undefined ? undefined : parseAnchorComparison(v.anchorComparison)
  if (anchorComparison === null) return null
  ignoredModules.push(...modules.ignored)
  return {
    presetId: v.presetId, fitModel: v.fitModel, timeBalancing: v.timeBalancing,
    censoring: { censorAfterKidneyTransplant: c.censorAfterKidneyTransplant, censorAfterChronicDialysis: c.censorAfterChronicDialysis, excludeAcuteDialysisPeriods: c.excludeAcuteDialysisPeriods, unknownDialysisPolicy: c.unknownDialysisPolicy },
    exclusions: { excludeAkiWindows: x.excludeAkiWindows, akiExclusionDays: x.akiExclusionDays },
    // Key order is part of the exported fit_config JSON (see nephrology/fitConfig.ts).
    endpoints: { percentDecline: e.percentDecline, ...(observedCkdG4 !== undefined ? { observedCkdG4 } : {}), observedCkdG5: e.observedCkdG5,
      ...(confirmationDays !== undefined ? { confirmationDays } : {}), projectedAgeToCkdG5: e.projectedAgeToCkdG5 },
    boundedValues,
    moduleSettings: modules.settings,
    ...(anchorComparison ? { anchorComparison } : {}),
  }
}

/** A stored before/after setting (issue #64), or null when it does not fit. */
function parseAnchorComparison(v: unknown): AnchorComparisonSettings | null {
  // Whole days only, as the setting offers them: a fraction would be compared
  // with calendar days and act as the next lower whole number.
  if (!record(v) || !days(v.exclusionDays) || !Number.isInteger(v.exclusionDays) || !record(v.rule)) return null
  const { kind, value } = v.rule
  if (kind === 'first') return { rule: { kind }, exclusionDays: v.exclusionDays }
  if ((kind === 'title' || kind === 'type') && typeof value === 'string') return { rule: { kind, value }, exclusionDays: v.exclusionDays }
  return null
}

export interface RestoredSettings {
  trajectoryFitSettings: TrajectoryFitSettings
  trajectoryView: TrajectoryView
  /** 'none': no settings record for this copy; 'discarded': a record of
   * another settings version, dropped as a whole; 'restored': checked item by item. */
  stored: 'none' | 'discarded' | 'restored'
  /** Stored items that were replaced by their defaults, as shown to the user. */
  notRestored: string[]
  /** Settings saved under a preset whose definition has changed since: their
   * values are kept, under the preset id 'custom'. */
  keptAsCustom: string[]
}

/** Parameter keys are `JSON.stringify([name, unit])`. */
function parsedKey(key: string): [string, string | null] | null {
  try {
    const parsed: unknown = JSON.parse(key)
    return Array.isArray(parsed) && typeof parsed[0] === 'string' && (parsed[1] === null || typeof parsed[1] === 'string') ? [parsed[0], parsed[1]] : null
  } catch { return null }
}
/** Readable name of a parameter key, also for one the dataset does not have. */
export function parameterKeyLabel(key: string): string {
  const parsed = parsedKey(key)
  return parsed ? parameterLabel(parsed[0], parsed[1]) : key
}
/** A computed eGFR parameter exists only while the current derivation
 * produces it. Choices for one that is absent right now are kept, as the page
 * keeps them within a session, and apply again when the derivation is back. */
const isComputedParameter = (key: string) => parsedKey(key)?.[0].endsWith(COMPUTED_BEZEICHNUNG_SUFFIX) ?? false

/**
 * Check stored settings against this version and the parameters of the
 * restored dataset. `undefined` (no settings record for this copy) yields the
 * defaults without a complaint. A choice for a parameter that is not in the
 * dataset is dropped and named, unless it is a computed eGFR parameter.
 */
export function restoreSavedSettings(value: unknown, parameterKeys: ReadonlySet<string>): RestoredSettings {
  const out: RestoredSettings = { trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: defaultTrajectoryView(), stored: 'none', notRestored: [], keptAsCustom: [] }
  if (value === undefined) return out
  if (!record(value) || value.version !== SAVED_SETTINGS_VERSION) { out.stored = 'discarded'; return out }
  out.stored = 'restored'
  const keeps = (key: string) => parameterKeys.has(key) || isComputedParameter(key)
  /** A saved preset id only names the preset whose current definition the
   * saved values still match; otherwise the values stay and the name goes. */
  const underCurrentPreset = (settings: WorkspaceFitSettings, label: string): WorkspaceFitSettings => {
    // The before/after comparison is not part of a preset (see WorkspaceFitSettings).
    const { anchorComparison: _comparison, ...presetPart } = settings
    if (settings.presetId === 'custom' || canonical(presetPart) === canonical(defaultFitSettings(settings.presetId))) return settings
    out.keptAsCustom.push(label)
    return { ...settings, presetId: 'custom' }
  }
  const parse = (stored: unknown, label: string): WorkspaceFitSettings | null => {
    const ignored: string[] = []
    const parsed = parseFitSettings(stored, ignored)
    for (const id of ignored) out.notRestored.push(`module settings "${id}" (${label})`)
    return parsed && underCurrentPreset(parsed, label)
  }
  const fit = value.trajectoryFitSettings
  if (record(fit)) {
    const shared = parse(fit.shared, 'shared settings')
    if (shared) out.trajectoryFitSettings.shared = shared
    else out.notRestored.push('shared analysis settings')
    for (const [key, stored] of Object.entries(record(fit.columns) ? fit.columns : {})) {
      const own = keeps(key) ? parse(stored, `own settings of ${parameterKeyLabel(key)}`) : null
      if (own) out.trajectoryFitSettings.columns[key] = own
      else out.notRestored.push(`own settings of ${parameterKeyLabel(key)}${keeps(key) ? '' : ' (parameter not in this dataset)'}`)
    }
  } else out.notRestored.push('analysis settings of all parameters')

  const view = value.trajectoryView
  if (!record(view)) { out.notRestored.push('trend and display settings'); return out }
  const keyList = (name: 'trendKeys' | 'fitKeys', label: string) => {
    const stored = view[name]
    if (!Array.isArray(stored) || !stored.every(k => typeof k === 'string')) { out.notRestored.push(`${label} choices`); return }
    for (const key of new Set(stored as string[])) {
      if (keeps(key)) out.trajectoryView[name].push(key)
      else out.notRestored.push(`${label} of ${parameterKeyLabel(key)} (parameter not in this dataset)`)
    }
  }
  if (view.parameterKeys !== null) {
    if (Array.isArray(view.parameterKeys) && view.parameterKeys.every(k => typeof k === 'string')) {
      const stored = [...new Set(view.parameterKeys as string[])]
      const shown = stored.filter(keeps)
      for (const key of stored) if (!keeps(key)) out.notRestored.push(`column ${parameterKeyLabel(key)} (parameter not in this dataset)`)
      out.trajectoryView.parameterKeys = shown.some(key => parameterKeys.has(key)) ? shown : null
    } else out.notRestored.push('selected parameters')
  }
  keyList('trendKeys', 'Trend')
  keyList('fitKeys', 'trend line')
  if (record(view.display)) {
    for (const [key, shown] of Object.entries(view.display)) {
      if (Object.hasOwn(DEFAULT_WORKSPACE_DISPLAY, key) && bool(shown)) out.trajectoryView.display[key] = shown
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
  if (view.pointsChosen === true) out.trajectoryView.pointsChosen = true
  else if (view.pointsChosen !== undefined) out.notRestored.push('measurement points choice')
  if (view.logKeys !== undefined) {
    if (Array.isArray(view.logKeys) && view.logKeys.every(k => typeof k === 'string')) {
      const kept: string[] = []
      for (const key of new Set(view.logKeys as string[])) {
        if (keeps(key)) kept.push(key)
        else out.notRestored.push(`log axis of ${parameterKeyLabel(key)} (parameter not in this dataset)`)
      }
      if (kept.length) out.trajectoryView.logKeys = kept
    } else out.notRestored.push('log axis choices')
  }
  return out
}

/**
 * Whether leaving the page loses data: a dataset is loaded and not saved on
 * this device. The untouched bundled demo is not worth a question: it loads
 * again with one click.
 */
export function losesDataOnUnload(hasData: boolean, storage: { enabled: boolean; status: 'session' | 'saving' | 'saved' | 'error' }, untouchedDemo = false): boolean {
  return hasData && !untouchedDemo && !(storage.enabled && storage.status === 'saved')
}
