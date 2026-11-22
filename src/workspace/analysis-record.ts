/**
 * The analysis record (issue #83): every setting of the app, where the export
 * records it, and the effective values in one list.
 *
 * `SETTINGS` is the catalog. Each leaf of the settings objects the app keeps
 * (the store fields marked 'settings' below, walked key by key) needs an
 * entry with either the export field that records it or the reason it
 * changes no exported number. `tests/workspace/analysis-record.test.ts`
 * walks the settings and fails for a leaf without an entry, so a new setting
 * cannot reach a result without reaching the export too.
 */
import { version as APP_VERSION } from '../../package.json'
import { columnSettingModules, defaultAnalysisSettings, fitPresetById, isRecord, type AnalysisSettings } from '../core/analysis/registry'
import { DEFAULT_PAEDIATRIC_RULE, EGFR_FORMULA_LABELS, PAEDIATRIC_RULE_LABELS } from '../core/domains/nephrology/analytes'
import { DEFAULT_MIXED_MODEL_CONFIG, type MixedModelConfig, type MixedModelFactor } from '../core/mixedModel/config'
import type { PresetExclusionPolicy } from '../core/mixedModel/cohortDataset'
import type { AnchorComparisonSettings } from '../core/cohort/anchorComparison'
import type { FitConfig } from '../core/analysis/fitConfig'
import type { ManualDemographics } from '../core/analysis/types'
import { defaultFitSettings, type TrajectoryFitSettings, type WorkspaceFitSettings } from './workspace-analysis'
import { defaultTrajectoryView, type TrajectoryView } from './saved-settings'
import type { StoredMixedModelResult } from './state/store'
import { anchorRuleLabel } from '../core/cohort/anchorComparison'
import type { PeriEventSettings } from '../core/domains/nephrology/aki/periEvent'

/** Where a setting is changed in the interface. */
export type SettingControl =
  | { page: 'Data'; target: 'egfr' | 'aki-recovery' | 'demographics' | 'peri-event' }
  | { page: 'Trajectories'; target: 'analysis' | 'parameters' | 'trend' | 'log' | 'grouping' }
  | { page: 'Cohort models'; target: 'model' | 'fit-summary' }

/** The element each control of another page is in (see WorkspaceApp). */
export const CONTROL_ELEMENT_IDS: Record<Exclude<SettingControl, { page: 'Trajectories' }>['target'], string> = {
  egfr: 'data-egfr', 'aki-recovery': 'data-aki-recovery', demographics: 'data-demographics', 'peri-event': 'data-peri-event',
  model: 'cohort-model-settings', 'fit-summary': 'cohort-model-fit-summary',
}

export type SettingArea = 'Data' | 'Trajectories' | 'Cohort models'

export interface SettingDefinition {
  label: string
  area: SettingArea
  /** The workbook column (sheet.column) that records the value; the model
   * workbook for cohort model settings. */
  exportField?: string
  /** Why the setting changes no exported number. */
  noNumericEffect?: string
  /** Where it is changed; null where the interface has no control (the value
   * stays at its default unless a stored or applied setting brings another). */
  control: SettingControl | null
}

const DATA_EGFR: SettingControl = { page: 'Data', target: 'egfr' }
const TRAJECTORY_SETTINGS: SettingControl = { page: 'Trajectories', target: 'analysis' }
const MODEL_SETTINGS: SettingControl = { page: 'Cohort models', target: 'model' }
const ANALYSIS_SETTINGS = 'settings.analysis_settings'

/** Path prefix of the fit settings: the shared settings and each parameter's own settings have this shape. */
export const FIT_PREFIX = 'fit'

/** Module settings a column can override, from the registry: exported where
 * the module names an export column for the field. A key without one has no
 * entry and fails the completeness test. */
function columnModuleDefinitions(): Record<string, SettingDefinition> {
  const entries: Record<string, SettingDefinition> = {}
  for (const module of columnSettingModules()) {
    for (const field of module.columnSettingFields ?? []) {
      if (!field.exportKey) continue
      entries[`${FIT_PREFIX}.moduleSettings.${module.id}.${field.key}`] = { label: field.label, area: 'Trajectories', exportField: `settings.${field.exportKey}`, control: TRAJECTORY_SETTINGS }
    }
  }
  return entries
}

/** The catalog of settings, by path. */
export const SETTINGS: Readonly<Record<string, SettingDefinition>> = {
  // Data: dataset-level analysis settings (store `analysisSettings`), written as JSON to settings.analysis_settings.
  'analysisSettings.egfr.formula': { label: 'eGFR formula', area: 'Data', exportField: `${ANALYSIS_SETTINGS}; parameters.formula`, control: DATA_EGFR },
  'analysisSettings.egfr.source': { label: 'Creatinine source of the eGFR', area: 'Data', exportField: `${ANALYSIS_SETTINGS}; parameters.source_parameter, parameters.source_unit`, control: DATA_EGFR },
  'analysisSettings.egfr.paediatric': { label: 'eGFR under 18 years', area: 'Data', exportField: `${ANALYSIS_SETTINGS}; measurements.egfr_equation`, control: DATA_EGFR },
  'analysisSettings.aki.recoveryHours': { label: 'Recovery between AKI episodes (hours)', area: 'Data', exportField: ANALYSIS_SETTINGS, control: { page: 'Data', target: 'aki-recovery' } },
  // No control: the columns set their own AKI exclusion window (fit.exclusions.akiExclusionDays).
  'analysisSettings.aki.exclusionDays': { label: 'AKI exclusion window, dataset default (days)', area: 'Data', exportField: ANALYSIS_SETTINGS, control: null },
  // Written to analysis_settings like every dataset setting, but no computation reads it.
  'analysisSettings.aki.showOverlays': { label: 'AKI overlays, dataset default', area: 'Data', noNumericEffect: 'No computation reads it; the charts have their own overlay switch under Display.', control: null },
  // No control: each column has its own threshold (fit.moduleSettings.rapidEgfrDecline.threshold).
  'analysisSettings.rapidEgfrDecline.threshold': { label: 'Rapid decline threshold, dataset default', area: 'Data', exportField: ANALYSIS_SETTINGS, control: null },
  // Manual demographic entries are data, but they change ages, sex and with them eGFR and endpoints.
  manualDemographics: { label: 'Manual demographic entries', area: 'Data', exportField: 'demographics.manual_override', control: { page: 'Data', target: 'demographics' } },

  // Trajectories: shared settings and each parameter's own settings.
  [`${FIT_PREFIX}.presetId`]: { label: 'Analysis preset', area: 'Trajectories', exportField: 'settings.fit_config (preset)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.fitModel`]: { label: 'Fit model', area: 'Trajectories', exportField: 'settings.fit_config (fitModel)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.timeBalancing`]: { label: 'Time balancing', area: 'Trajectories', exportField: 'settings.fit_config (timeBalancing)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.censoring.censorAfterKidneyTransplant`]: { label: 'Censor after kidney transplant', area: 'Trajectories', exportField: 'settings.fit_config (censoring)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.censoring.censorAfterChronicDialysis`]: { label: 'Censor after chronic dialysis', area: 'Trajectories', exportField: 'settings.fit_config (censoring)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.censoring.excludeAcuteDialysisPeriods`]: { label: 'Exclude acute dialysis intervals', area: 'Trajectories', exportField: 'settings.fit_config (censoring)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.censoring.unknownDialysisPolicy`]: { label: 'Unknown dialysis', area: 'Trajectories', exportField: 'settings.fit_config (censoring)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.exclusions.excludeAkiWindows`]: { label: 'Exclude AKI windows from fit', area: 'Trajectories', exportField: 'settings.fit_config (exclusions)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.exclusions.akiExclusionDays`]: { label: 'AKI exclusion window (days)', area: 'Trajectories', exportField: 'settings.fit_config (exclusions)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.endpoints.percentDecline`]: { label: 'Percent eGFR decline', area: 'Trajectories', exportField: 'settings.fit_config (endpoints)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.endpoints.observedCkdG4`]: { label: 'Observed CKD G4', area: 'Trajectories', exportField: 'settings.fit_config (endpoints)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.endpoints.observedCkdG5`]: { label: 'Observed CKD G5', area: 'Trajectories', exportField: 'settings.fit_config (endpoints)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.endpoints.confirmationDays`]: { label: 'Minimum confirmation interval (days)', area: 'Trajectories', exportField: 'settings.fit_config (endpoints)', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.endpoints.projectedAgeToCkdG5`]: { label: 'Projected age to CKD G5', area: 'Trajectories', exportField: 'settings.fit_config (endpoints)', control: TRAJECTORY_SETTINGS },
  ...columnModuleDefinitions(),
  [`${FIT_PREFIX}.anchorComparison.rule.kind`]: { label: 'Before/after anchor', area: 'Trajectories', exportField: 'settings.anchor_comparison', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.anchorComparison.rule.value`]: { label: 'Before/after anchor value', area: 'Trajectories', exportField: 'settings.anchor_comparison', control: TRAJECTORY_SETTINGS },
  [`${FIT_PREFIX}.anchorComparison.exclusionDays`]: { label: 'Before/after exclusion window (days)', area: 'Trajectories', exportField: 'settings.anchor_comparison', control: TRAJECTORY_SETTINGS },

  // Trajectories: the view. Only the selection and Trend decide exported numbers.
  'trajectoryView.parameterKeys': { label: 'Selected parameters', area: 'Trajectories', exportField: 'settings.parameter_key (one row per parameter)', control: { page: 'Trajectories', target: 'parameters' } },
  // Trend off writes fitModel "none" to fit_config: the column has no slope.
  'trajectoryView.trendKeys': { label: 'Trend', area: 'Trajectories', exportField: 'settings.trend; settings.fit_config (fitModel)', control: { page: 'Trajectories', target: 'trend' } },
  'trajectoryView.fitKeys': { label: 'Trend line', area: 'Trajectories', noNumericEffect: 'Draws the fitted line in the charts.', control: null },
  'trajectoryView.display': { label: 'Display options', area: 'Trajectories', noNumericEffect: 'Chart overlays and markers.', control: null },
  'trajectoryView.axis': { label: 'Time axis of the charts', area: 'Trajectories', noNumericEffect: 'Every slope is fitted on time since the first fitted measurement, whatever the chart axis.', control: null },
  'trajectoryView.scaleMode': { label: 'Scale mode', area: 'Trajectories', noNumericEffect: 'Chart scale only.', control: null },
  'trajectoryView.chartSize': { label: 'Chart size', area: 'Trajectories', noNumericEffect: 'Chart size only.', control: null },
  'trajectoryView.cellDetails': { label: 'Cell details', area: 'Trajectories', noNumericEffect: 'How much a table cell shows.', control: null },
  'trajectoryView.warningIcons': { label: 'Warning display', area: 'Trajectories', noNumericEffect: 'Icons or text for warnings.', control: null },
  'trajectoryView.pointsChosen': { label: 'Measurement points choice', area: 'Trajectories', noNumericEffect: 'Whether charts draw the points.', control: null },
  // A logarithmic axis adds the log_trend sheet (issue #70); the column's own slope is unchanged.
  'trajectoryView.logKeys': { label: 'Logarithmic value axis', area: 'Trajectories', exportField: 'log_trend (one row per patient for each parameter on a logarithmic axis)', control: { page: 'Trajectories', target: 'log' } },

  // Cohort models: recorded with each fitted model in the model workbook (models sheet).
  // Data page: the peri-event creatinine selection (issue #69); it changes no fit.
  'periEventSettings': { label: 'Creatinine after selected events', area: 'Data', exportField: 'settings.peri_event_creatinine; sheet peri_event_creatinine', control: { page: 'Data', target: 'peri-event' } },
  'mixedModelConfig.timeAxis': { label: 'Model time axis', area: 'Cohort models', exportField: 'model workbook: models.modelConfig', control: MODEL_SETTINGS },
  'mixedModelConfig.covariates': { label: 'Model covariates', area: 'Cohort models', exportField: 'model workbook: models.modelConfig', control: MODEL_SETTINGS },
  'mixedModelConfig.randomEffects': { label: 'Random effects', area: 'Cohort models', exportField: 'model workbook: models.modelConfig', control: MODEL_SETTINGS },
  'mixedModelConfig.factors': { label: 'Model factors', area: 'Cohort models', exportField: 'model workbook: models.modelConfig, factors', control: MODEL_SETTINGS },
  presetExclusionPolicy: { label: 'Preset windows in the model', area: 'Cohort models', exportField: 'model workbook: models.preset_exclusion_policy', control: { page: 'Cohort models', target: 'fit-summary' } },
  projectionSettings: { label: 'Projection settings', area: 'Cohort models', exportField: 'model workbook: projections.settings', control: MODEL_SETTINGS },
  showCohortMixedModelLine: { label: 'Model line in the charts', area: 'Cohort models', noNumericEffect: 'Draws the model line in the Trajectories charts.', control: null },
}

/**
 * Every field of the store, classified. The completeness test fails for a
 * field missing here. 'settings' fields are walked leaf by leaf against
 * `SETTINGS` (under the prefix given by `settingsPrefix`); the others carry
 * no choice of the user that changes a number.
 */
export const STORE_FIELDS = {
  // The imported dataset: raw_measurements, events, patient_attributes and import_diagnostics of the workbook.
  rows: 'data', events: 'data', patientAttributes: 'data', importDiagnostics: 'data',
  // settings.source_file.
  fileName: 'data',
  // Session state: which demo, rejected rows shown beside the import, busy and notices.
  pristineDemo: 'state', rejectedEvents: 'state', busy: 'state', notice: 'state',
  // Results and the progress of a fit, not choices.
  cohortModelResults: 'state', cohortModelRunning: 'state', cohortModelProgress: 'state', cohortModelRuntimeLoaded: 'state',
  analysisSettings: 'settings', periEventSettings: 'settings', manualDemographics: 'settings', trajectoryFitSettings: 'settings', trajectoryView: 'settings',
  mixedModelConfig: 'settings', presetExclusionPolicy: 'settings', projectionSettings: 'settings', showCohortMixedModelLine: 'settings',
} as const satisfies Record<string, 'data' | 'state' | 'settings'>

/** Paths whose value is one setting although it is an object or a list. */
const LEAF_PATHS = new Set(['analysisSettings.egfr.source', 'periEventSettings', 'manualDemographics', 'trajectoryView.display', 'mixedModelConfig.covariates', 'mixedModelConfig.factors', 'projectionSettings', 'trajectoryView.parameterKeys', 'trajectoryView.trendKeys', 'trajectoryView.fitKeys'])

/** The leaves of a settings value as [path, value], depth first in key order.
 * An empty object counts as a leaf, so a new empty setting is not skipped. */
export function settingLeaves(value: unknown, prefix: string): Array<[string, unknown]> {
  if (LEAF_PATHS.has(prefix) || !isRecord(value) || Object.keys(value).length === 0) return [[prefix, value]]
  return Object.entries(value).flatMap(([key, child]) => settingLeaves(child, `${prefix}.${key}`))
}

/** Samples with every key a setting can have, optional ones included: the
 * `Required` types make the build fail when a type gains an optional key that
 * is not here. */
const ANCHOR_SAMPLE: AnchorComparisonSettings = { rule: { kind: 'title', value: 'Transplant' }, exclusionDays: 30 }
export function fitSettingsSample(): Required<Omit<WorkspaceFitSettings, 'censoring' | 'exclusions' | 'endpoints'>> & {
  censoring: Required<FitConfig['censoring']>; exclusions: Required<FitConfig['exclusions']>; endpoints: Required<FitConfig['endpoints']>
} {
  const settings = defaultFitSettings('ckd_progression')
  const endpoints: Required<FitConfig['endpoints']> = { percentDecline: true, observedCkdG4: true, observedCkdG5: true, confirmationDays: 90, projectedAgeToCkdG5: true }
  return { ...settings, endpoints, anchorComparison: ANCHOR_SAMPLE }
}
export function trajectoryViewSample(): Required<TrajectoryView> {
  return { ...defaultTrajectoryView(), pointsChosen: true, logKeys: ['p1'] }
}
export function mixedModelConfigSample(): Required<MixedModelConfig> {
  const factor: Required<MixedModelFactor> = { key: 'genotype', kind: 'categorical', effect: 'level', reference: 'A', kindSource: 'user', referenceSource: 'default' }
  return { ...DEFAULT_MIXED_MODEL_CONFIG, factors: [factor] }
}

/** The leaves of every store field marked 'settings', from full samples. */
export function allSettingLeaves(state: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(STORE_FIELDS).filter(([, kind]) => kind === 'settings').flatMap(([field]) => {
    if (field === 'trajectoryFitSettings') {
      // The shared settings and every parameter's own settings share one shape.
      const settings = state[field] as TrajectoryFitSettings
      return [settings.shared, ...Object.values(settings.columns)].flatMap(s => settingLeaves(s, FIT_PREFIX))
    }
    return settingLeaves(state[field], field)
  })
}

// ---------------------------------------------------------------------------
// The record: effective values against their defaults.

export interface RecordEntry {
  path: string
  label: string
  value: string
  /** The default, shown beside a deviating value. */
  defaultValue: string
  deviates: boolean
  control: SettingControl | null
  /** Parameter key for settings of one parameter. */
  parameterKey?: string
  exportField?: string
}

export interface RecordSection {
  id: string
  title: string
  area: SettingArea
  note?: string
  entries: RecordEntry[]
}

const FIT_MODEL_TEXT: Record<string, string> = { ols: 'OLS', 'theil-sen': 'Theil–Sen', 'rolling-ols': 'Rolling OLS', 'segmented-ols': 'Segmented OLS', none: 'None (no fit line)' }
const TIME_BALANCING_TEXT: Record<string, string> = { raw: 'Raw (unweighted points)', 'monthly-median': 'Monthly median', 'quarterly-median': 'Quarterly median' }
const DIALYSIS_TEXT: Record<string, string> = { 'flag-only': 'Flag only', 'exclude-dated-interval': 'Exclude dated interval', 'censor-from-start': 'Censor from start' }
const MODEL_TEXT: Record<string, string> = { time_since_baseline: 'Time since first measurement', age: 'Age', intercept: 'Own starting level', intercept_slope: 'Own starting level and rate', apply: 'Applied', skip: 'Skipped' }

/** A setting value as the record shows it. */
export function settingValueText(path: string, value: unknown): string {
  const leaf = path.split('.').slice(1).join('.') || path
  if (value === undefined) return 'Off'
  if (path === 'analysisSettings.egfr.formula') return value === 'off' ? 'Off' : EGFR_FORMULA_LABELS[value as keyof typeof EGFR_FORMULA_LABELS] ?? String(value)
  if (path === 'periEventSettings') {
    if (!value) return 'None selected'
    const { rule, windowHours } = value as PeriEventSettings
    return `${rule.kind === 'title' ? 'Title' : 'Type'}: ${rule.value}, window ${windowHours} hours`
  }
  if (path === 'trajectoryView.logKeys') return value ? 'Logarithmic' : 'Linear'
  if (path === 'analysisSettings.egfr.paediatric') return PAEDIATRIC_RULE_LABELS[value as keyof typeof PAEDIATRIC_RULE_LABELS] ?? String(value)
  if (path === 'analysisSettings.egfr.source') return Array.isArray(value) ? `${value[0]} (${value[1]})` : 'Automatic'
  if (path.endsWith('.presetId')) return value === 'custom' ? 'Custom configuration' : fitPresetById(String(value))?.name ?? String(value)
  if (path.endsWith('.fitModel')) return FIT_MODEL_TEXT[String(value)] ?? String(value)
  if (path.endsWith('.timeBalancing')) return TIME_BALANCING_TEXT[String(value)] ?? String(value)
  if (path.endsWith('.unknownDialysisPolicy')) return DIALYSIS_TEXT[String(value)] ?? String(value)
  if (path.endsWith('anchorComparison')) {
    if (!value) return 'Off'
    const { rule, exclusionDays } = value as AnchorComparisonSettings
    const anchor = anchorRuleLabel(rule)
    return `At the ${anchor}${exclusionDays ? `, ${exclusionDays} days after it left out` : ''}`
  }
  if (path === 'mixedModelConfig.factors') return Array.isArray(value) && value.length ? (value as MixedModelFactor[]).map(f => `${f.key}${f.reference ? ` (reference ${f.reference})` : ''}${f.effect === 'level_slope' ? ', level and slope' : ''}`).join('; ') : 'None'
  if (path === 'mixedModelConfig.covariates') return Array.isArray(value) && value.length ? value.join(', ') : 'None'
  if (path.startsWith('mixedModelConfig.') || path === 'presetExclusionPolicy') return MODEL_TEXT[String(value)] ?? String(value)
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (value === null) return leaf === 'source' ? 'Automatic' : 'None'
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  return JSON.stringify(value)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function entry(path: string, value: unknown, defaultValue: unknown, extra: Partial<RecordEntry> = {}): RecordEntry {
  const definition = SETTINGS[path]
  return {
    path, label: definition?.label ?? path, value: settingValueText(path, value), defaultValue: settingValueText(path, defaultValue),
    deviates: !same(value, defaultValue), control: definition?.control ?? null, exportField: definition?.exportField, ...extra,
  }
}

/** The fit settings as entries, the before/after comparison as one entry. */
function fitEntries(settings: WorkspaceFitSettings, reference: WorkspaceFitSettings, parameterKey?: string): RecordEntry[] {
  const { anchorComparison, ...rest } = settings
  const referenceLeaves = new Map(settingLeaves({ ...reference, anchorComparison: undefined }, FIT_PREFIX))
  const leaves = settingLeaves(rest, FIT_PREFIX).filter(([path]) => SETTINGS[path] && !SETTINGS[path].noNumericEffect)
  const extra = parameterKey === undefined ? {} : { parameterKey }
  return [
    ...leaves.map(([path, value]) => entry(path, value, referenceLeaves.get(path), extra)),
    {
      path: `${FIT_PREFIX}.anchorComparison`, label: 'Before/after comparison', value: settingValueText(`${FIT_PREFIX}.anchorComparison`, anchorComparison),
      defaultValue: settingValueText(`${FIT_PREFIX}.anchorComparison`, reference.anchorComparison), deviates: !same(anchorComparison, reference.anchorComparison),
      control: TRAJECTORY_SETTINGS, exportField: 'settings.anchor_comparison', ...extra,
    },
  ]
}

export interface AnalysisRecordInput {
  analysisSettings: AnalysisSettings
  manualDemographics: Record<string, ManualDemographics>
  trajectoryFitSettings: TrajectoryFitSettings
  /** The parameters shown under Trajectories, in order, with Trend and the logarithmic value axis on or off. */
  parameters: ReadonlyArray<{ key: string; label: string; trend: boolean; log: boolean }>
  /** The Data page's creatinine after selected events; null while none are selected. */
  periEventSettings: PeriEventSettings | null
  groupBy: string
  mixedModelConfig: MixedModelConfig
  presetExclusionPolicy: PresetExclusionPolicy
  cohortModelResults: Record<string, StoredMixedModelResult> | null
}

/** The effective settings in one list, by page, each against its default:
 * the dataset settings against the module defaults, the shared settings
 * against General exploration, a parameter's own settings against the
 * shared ones. Settings without numeric effect are left out. */
export function analysisRecord(input: AnalysisRecordInput): RecordSection[] {
  const defaults = defaultAnalysisSettings()
  const defaultLeaves = new Map(settingLeaves(defaults, 'analysisSettings'))
  const manualCount = Object.values(input.manualDemographics).filter(entry => Object.keys(entry).length > 0).length
  const data: RecordSection = {
    id: 'data', title: 'Data', area: 'Data',
    entries: [
      ...settingLeaves(input.analysisSettings, 'analysisSettings').filter(([path]) => SETTINGS[path] && !SETTINGS[path].noNumericEffect).map(([path, value]) => entry(path, value, defaultLeaves.get(path))),
      { ...entry('manualDemographics', null, null), value: manualCount ? `${manualCount} ${manualCount === 1 ? 'patient' : 'patients'}` : 'None', defaultValue: 'None', deviates: manualCount > 0 },
      entry('periEventSettings', input.periEventSettings, null),
    ],
  }
  const shared = input.trajectoryFitSettings.shared
  const sharedSection: RecordSection = {
    id: 'shared', title: 'Trajectories: shared settings', area: 'Trajectories',
    note: 'The settings of every parameter without its own settings; deviations are against General exploration, the default.',
    entries: fitEntries(shared, defaultFitSettings()),
  }
  const parameterSections: RecordSection[] = input.parameters.map(parameter => {
    const own = input.trajectoryFitSettings.columns[parameter.key]
    // Trend is off until it is switched on (TrajectoryView.trendKeys starts empty).
    const trend = { ...entry('trajectoryView.trendKeys', parameter.trend, false), parameterKey: parameter.key }
    // The value axis is linear until the column's log button is pressed.
    const log = { ...entry('trajectoryView.logKeys', parameter.log, false), parameterKey: parameter.key }
    const entries = own ? fitEntries(own, shared, parameter.key).filter(e => e.deviates) : []
    return {
      id: `parameter:${parameter.key}`, title: `Trajectories: ${parameter.label}`, area: 'Trajectories' as const,
      note: own ? (entries.length ? 'Own settings of this parameter; deviations are against the shared settings.' : 'Own settings of this parameter, equal to the shared settings.') : 'Uses the shared settings.',
      entries: [trend, log, ...entries],
    }
  })
  const grouping: RecordSection = {
    id: 'grouping', title: 'Trajectories: table', area: 'Trajectories',
    entries: [{ path: 'groupBy', label: 'Group by', value: input.groupBy || 'No grouping', defaultValue: 'No grouping', deviates: input.groupBy !== '', control: { page: 'Trajectories', target: 'grouping' }, exportField: 'settings.group_by' }],
  }
  const model = input.mixedModelConfig
  const models: RecordSection = {
    id: 'models', title: 'Cohort models', area: 'Cohort models',
    note: 'Recorded with each fitted model in the model workbook, not in the cohort workbook.',
    entries: [
      ...(['timeAxis', 'randomEffects', 'factors'] as const).map(key => entry(`mixedModelConfig.${key}`, key === 'factors' ? model.factors ?? model.covariates.map(c => ({ key: c, kind: 'numeric', effect: 'level' })) : model[key], key === 'factors' ? [] : DEFAULT_MIXED_MODEL_CONFIG[key])),
      entry('presetExclusionPolicy', input.presetExclusionPolicy, 'apply'),
    ],
  }
  return [data, sharedSection, ...parameterSections, grouping, models]
}

export interface VersionEntry { label: string; value: string }

/** App, formula and R versions behind the current results. */
export function analysisVersions(input: Pick<AnalysisRecordInput, 'analysisSettings' | 'cohortModelResults'>): VersionEntry[] {
  const formula = input.analysisSettings.egfr.formula
  const fitted = Object.values(input.cohortModelResults ?? {}).map(stored => stored.result.metadata)
  const runtimes = [...new Set(fitted.map(meta => meta.runtimeVersion).filter((v): v is string => typeof v === 'string' && v !== ''))]
  const packages = [...new Set(fitted.flatMap(meta => Object.entries(meta.packageVersions ?? {}).map(([name, version]) => `${name} ${version}`)))].sort()
  return [
    { label: 'Lab Trajectory Explorer', value: APP_VERSION },
    { label: 'eGFR formula', value: formula === 'off' ? 'Off (no eGFR computed)' : formula === 'ckid-u25-ekfc' ? EGFR_FORMULA_LABELS[formula] : `${EGFR_FORMULA_LABELS[formula]}; under 18: ${PAEDIATRIC_RULE_LABELS[input.analysisSettings.egfr.paediatric ?? DEFAULT_PAEDIATRIC_RULE]}` },
    { label: 'R (cohort models)', value: runtimes.length ? runtimes.join(', ') : 'No model fitted in this session' },
    { label: 'R packages', value: packages.length ? packages.join('; ') : 'No model fitted in this session' },
  ]
}
