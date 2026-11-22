/**
 * "Apply settings from an export" (issue #83): read the settings of a cohort
 * or patient workbook of this app and apply them to the loaded dataset.
 *
 * The fit settings go through the same item-by-item check as the settings
 * saved on this device (`restoreSavedSettings`), so a stored and an exported
 * setting are accepted or refused by one rule. Whatever cannot be applied is
 * listed; it keeps its current value.
 */
import { readWorkbookSheets } from '../io/readWorkbook'
import { isRecord, parseAnalysisSettings, type AnalysisSettings } from '../core/analysis/registry'
import { columnSettingModules } from '../core/analysis/registry'
import { COMPUTED_EGFR_UNIT, computedEgfrName } from '../core/domains/nephrology/analytes'
import { defaultTrajectoryView, projectionOnNotice, restoreSavedSettings, parameterKeyLabel, SAVED_SETTINGS_VERSION } from './saved-settings'
import { defaultFitSettings, type TrajectoryFitSettings } from './workspace-analysis'
import { parameterLabel } from './workspace-labels'
import { eventMatchesRule } from '../core/cohort/anchorComparison'
import { parsePeriEventSettings, type PeriEventSettings } from '../core/domains/nephrology/aki/periEvent'
import type { ClinicalEvent } from '../core/events/events'

export interface ExportedColumn {
  parameterKey: string
  /** Readable name, from the parameter and unit columns. */
  label: string
  /** The settings as written; checked when applied. */
  settings: unknown
  source: 'shared' | 'own'
  trend: boolean
}

export interface ExportedSettings {
  columns: ExportedColumn[]
  /** `analysis_settings` as written; checked when applied. */
  analysisSettings: unknown
  groupBy: string
  appVersion: string | null
  exportId: string | null
  inputDataId: string | null
  /** The workbook predates `column_settings` (before 2026-11-22): the settings
   * were rebuilt from `fit_config` and the module columns. */
  rebuilt: boolean
  /** Patients with manual demographic entries in `demographics`. */
  manualDemographicPatients: number
  /** `peri_event_creatinine` of the first row as written: undefined when the
   * workbook has no such column (before 2026-11-22), '' without a selection. */
  periEventCreatinine: unknown
  /** Parameters with rows in `log_trend`, matched to `settings` by parameter
   * and unit: shown on a logarithmic axis when exported. */
  logParameterKeys: string[]
}

const text = (value: unknown) => value === null || value === undefined ? '' : String(value)
const json = (value: unknown): unknown => {
  try { return text(value) === '' ? undefined : JSON.parse(text(value)) } catch { return undefined }
}

/** Fit settings of a workbook without `column_settings`, rebuilt from the
 * columns every export since 2026-11-21 has: `fit_config`, the module columns
 * and `anchor_comparison`. Trend is read from fitModel ("none" counts as Trend off,
 * so the fit model of such a column is the default's). */
function rebuiltColumn(row: Record<string, unknown>): { settings: unknown; trend: boolean } | null {
  const config = json(row.fit_config)
  if (!isRecord(config)) return null
  const trend = config.fitModel !== 'none'
  const presetId = config.preset === 'custom' || typeof config.preset !== 'string' ? 'custom' : config.preset
  const moduleSettings: Record<string, Record<string, unknown>> = {}
  for (const module of columnSettingModules()) {
    const settings: Record<string, unknown> = { ...(module.defaultSettings as Record<string, unknown>) }
    for (const field of module.columnSettingFields ?? []) if (field.exportKey && row[field.exportKey] !== undefined && row[field.exportKey] !== '') settings[field.key] = row[field.exportKey]
    moduleSettings[module.id] = settings
  }
  const anchorComparison = json(row.anchor_comparison)
  return {
    trend,
    settings: {
      presetId, fitModel: trend ? config.fitModel : defaultFitSettings(presetId).fitModel, timeBalancing: config.timeBalancing,
      censoring: config.censoring, exclusions: config.exclusions, endpoints: config.endpoints, moduleSettings,
      ...(anchorComparison === undefined ? {} : { anchorComparison }),
    },
  }
}

/** Read the settings of a workbook this app exported. Throws with a readable
 * message for a file without a `settings` sheet of this app. */
export function readExportedSettings(bytes: ArrayBuffer | Uint8Array): ExportedSettings {
  const workbook = readWorkbookSheets(bytes)
  if (!workbook.sheetNames.includes('settings')) throw new Error('This file has no settings sheet: choose a cohort or patient workbook exported by Lab Trajectory Explorer.')
  const rows = workbook.getSheet('settings') as Record<string, unknown>[]
  if (!rows.length || !rows.every(row => typeof row.parameter_key === 'string' && 'fit_config' in row)) throw new Error('The settings sheet of this file is not one written by Lab Trajectory Explorer.')
  let rebuilt = false
  const columns = rows.flatMap((row): ExportedColumn[] => {
    const parameterKey = String(row.parameter_key)
    const label = typeof row.parameter === 'string' ? parameterLabel(row.parameter, text(row.unit) || null) : parameterKeyLabel(parameterKey)
    const stored = json(row.column_settings)
    if (stored !== undefined) return [{ parameterKey, label, settings: stored, source: row.settings_source === 'own' ? 'own' : 'shared', trend: row.trend === true || row.trend === 'true' || row.trend === 'TRUE' }]
    const fallback = rebuiltColumn(row)
    rebuilt = true
    // Without settings_source each parameter gets its own settings.
    return [{ parameterKey, label, settings: fallback?.settings ?? null, source: 'own', trend: fallback?.trend ?? true }]
  })
  const about = workbook.sheetNames.includes('about') ? (workbook.getSheet('about') as Record<string, unknown>[]).map(row => text(row.note)) : []
  const aboutValue = (key: string) => about.find(note => note.startsWith(`${key}: `))?.slice(key.length + 2) ?? null
  const demographics = workbook.sheetNames.includes('demographics') ? workbook.getSheet('demographics') as Record<string, unknown>[] : []
  const manualDemographicPatients = demographics.filter(row => { const value = json(row.manual_override); return isRecord(value) && Object.keys(value).length > 0 }).length
  // log_trend has no parameter_key: its rows name parameter and unit as the settings rows do.
  const logTrend = workbook.sheetNames.includes('log_trend') ? workbook.getSheet('log_trend') as Record<string, unknown>[] : []
  const logSeries = new Set(logTrend.map(row => JSON.stringify([text(row.Parameter), text(row.Unit)])))
  const logParameterKeys = rows.filter(row => logSeries.has(JSON.stringify([text(row.parameter), text(row.unit)]))).map(row => String(row.parameter_key))
  const periEventCreatinine = 'peri_event_creatinine' in rows[0] ? text(rows[0].peri_event_creatinine) : undefined
  return {
    columns, analysisSettings: json(rows[0].analysis_settings), groupBy: text(rows[0].group_by), rebuilt, manualDemographicPatients,
    periEventCreatinine, logParameterKeys: [...new Set(logParameterKeys)],
    appVersion: aboutValue('app_version'), exportId: aboutValue('export_id'), inputDataId: aboutValue('input_data_id'),
  }
}

export interface AppliedSettings {
  analysisSettings: AnalysisSettings
  trajectoryFitSettings: TrajectoryFitSettings
  /** The parameters to show, in the exported order; null keeps the current selection. */
  parameterKeys: string[] | null
  trendKeys: string[]
  /** Parameters on a logarithmic value axis. */
  logKeys: string[]
  /** The Data page's peri-event creatinine selection. */
  periEventSettings: PeriEventSettings | null
  /** What was applied, in a few words each. */
  applied: string[]
  /** What could not be applied and keeps its current value. */
  notApplied: string[]
}

export interface ApplyTarget {
  /** The parameters of the loaded dataset, computed eGFR included. */
  parameterKeys: ReadonlySet<string>
  /** Imported parameters as [name, unit], the possible eGFR creatinine sources. */
  importedParameters: ReadonlyArray<readonly [string, string | null]>
  analysisSettings: AnalysisSettings
  trajectoryFitSettings: TrajectoryFitSettings
  trendKeys: readonly string[]
  logKeys: readonly string[]
  /** The loaded events, for the peri-event selection. */
  events: readonly ClinicalEvent[]
  periEventSettings: PeriEventSettings | null
}

/**
 * Apply exported settings to the loaded dataset. Parameters of the export
 * that the dataset lacks are skipped and named, and so is a creatinine source
 * the dataset lacks. Settings that are shared in the export become the shared
 * settings; a parameter's own settings become its own settings. The shown
 * parameters and Trend follow the export where the dataset has the
 * parameter. Grouping, the patient selection and manual demographic entries
 * are not settings of this action and are named when the export has them.
 */
export function applyExportedSettings(exported: ExportedSettings, target: ApplyTarget): AppliedSettings {
  const labels = new Map(exported.columns.map(column => [column.parameterKey, column.label]))
  const label = (key: string) => labels.get(key) ?? parameterKeyLabel(key)
  const applied: string[] = []
  const notApplied: string[] = []

  // Dataset settings (Data page).
  let analysisSettings = target.analysisSettings
  const parsed = exported.analysisSettings === undefined ? null : parseAnalysisSettings(exported.analysisSettings)
  if (!parsed) notApplied.push('dataset settings (eGFR formula and source, AKI recovery): not readable in this file')
  else {
    const source = parsed.egfr.source
    const hasSource = source === null || target.importedParameters.some(([name, unit]) => name === source[0] && unit === source[1])
    analysisSettings = hasSource ? parsed : { ...parsed, egfr: { ...parsed.egfr, source: target.analysisSettings.egfr.source } }
    applied.push('dataset settings (eGFR formula and source, AKI recovery)')
    if (!hasSource) notApplied.push(`creatinine source ${parameterLabel(source[0], source[1])} of the eGFR (not in this dataset; the current source is kept)`)
  }

  // The parameters of the dataset once these settings apply: the computed
  // eGFR of the applied formula joins them (the derivation produces it).
  const formula = analysisSettings.egfr.formula
  const available = new Set(target.parameterKeys)
  if (formula !== 'off') available.add(JSON.stringify([computedEgfrName(formula), COMPUTED_EGFR_UNIT]))
  const present = exported.columns.filter(column => available.has(column.parameterKey))
  for (const column of exported.columns) if (!available.has(column.parameterKey)) notApplied.push(`settings of ${column.label} (parameter not in this dataset)`)

  // Trajectories settings, checked item by item like saved settings.
  const shared = present.find(column => column.source === 'shared') ?? exported.columns.find(column => column.source === 'shared')
  const columns: Record<string, unknown> = {}
  for (const column of present) if (column.source === 'own') columns[column.parameterKey] = column.settings
  const restored = restoreSavedSettings({
    version: SAVED_SETTINGS_VERSION,
    trajectoryFitSettings: { shared: shared?.settings ?? target.trajectoryFitSettings.shared, columns },
    trajectoryView: defaultTrajectoryView(),
  }, available)
  notApplied.push(...restored.notRestored)
  if (restored.projectionOn.length) applied.push(projectionOnNotice(restored.projectionOn).replace(/\.$/, ''))
  if (restored.keptAsCustom.length) applied.push(`${restored.keptAsCustom.join(', ')}: the preset has changed since the export, so the values are kept as custom settings`)
  const sharedApplied = shared !== undefined && !restored.notRestored.includes('shared analysis settings')
  // Own settings of parameters the file does not list stay as they are.
  const exportedKeys = new Set(exported.columns.map(column => column.parameterKey))
  const kept = Object.fromEntries(Object.entries(target.trajectoryFitSettings.columns).filter(([key]) => !exportedKeys.has(key)))
  const trajectoryFitSettings: TrajectoryFitSettings = {
    shared: sharedApplied ? restored.trajectoryFitSettings.shared : target.trajectoryFitSettings.shared,
    columns: { ...kept, ...restored.trajectoryFitSettings.columns },
  }
  if (sharedApplied) applied.push('shared analysis settings')
  const own = Object.keys(restored.trajectoryFitSettings.columns)
  if (own.length) applied.push(`own settings of ${own.map(label).join(', ')}`)
  if (exported.rebuilt) applied.push('settings rebuilt from fit_config (the workbook was written before column_settings existed)')

  // Selection and Trend.
  const parameterKeys = present.length ? present.map(column => column.parameterKey) : null
  const trendKeys = [...target.trendKeys.filter(key => !exportedKeys.has(key)), ...present.filter(column => column.trend).map(column => column.parameterKey)]
  if (parameterKeys) applied.push(`parameter selection and Trend (${countText(parameterKeys.length, 'parameter')})`)
  // Log axes: the export records them only through rows in log_trend, so a
  // listed parameter without such rows keeps its current axis.
  const logOn = present.filter(column => exported.logParameterKeys.includes(column.parameterKey)).map(column => column.parameterKey)
  const logKeys = [...target.logKeys.filter(key => !logOn.includes(key)), ...logOn]
  if (logOn.length) applied.push(`logarithmic value axis of ${logOn.map(label).join(', ')}`)

  // Data page: creatinine after selected events. An older workbook without
  // the column keeps the current selection.
  let periEventSettings = target.periEventSettings
  const periEvent = exported.periEventCreatinine
  if (periEvent === '') { periEventSettings = null; applied.push('creatinine after selected events (none selected)') }
  else if (periEvent !== undefined) {
    const parsedPeriEvent = parsePeriEventSettings(json(periEvent))
    const ruleText = parsedPeriEvent ? `${parsedPeriEvent.rule.kind === 'title' ? 'Title' : 'Type'}: ${parsedPeriEvent.rule.value}` : ''
    if (!parsedPeriEvent) notApplied.push('creatinine after selected events: not readable in this file')
    else if (!target.events.some(event => eventMatchesRule(event, parsedPeriEvent.rule))) notApplied.push(`creatinine after selected events, ${ruleText} (no such event in this dataset; the current selection is kept)`)
    else { periEventSettings = parsedPeriEvent; applied.push(`creatinine after selected events (${ruleText}, ${parsedPeriEvent.windowHours} hours)`) }
  }

  if (exported.groupBy) notApplied.push(`grouping by ${exported.groupBy} (choose it under Trajectories: Group by)`)
  if (exported.manualDemographicPatients) notApplied.push(`manual demographic entries of ${countText(exported.manualDemographicPatients, 'patient')} (enter them under Data: Review and edit patients)`)
  return { analysisSettings, trajectoryFitSettings, parameterKeys, trendKeys, logKeys, periEventSettings, applied, notApplied }
}

const countText = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
