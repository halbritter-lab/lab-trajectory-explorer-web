/**
 * The analysis module contract. A module is a domain package (nephrology
 * today) that plugs into the generic core at a few named seams; the core
 * never imports a module directly, only this contract and the registry.
 *
 * Phases, in the order the app runs them:
 *  1. `apply` (dataset): once per analysis run; may add derived rows,
 *     messages and dataset-level fit inputs.
 *  2. `series` (patient × column, before fitting): censoring and exclusion
 *     windows, chart overlays and flags.
 *  3. `endpoints` (patient × column): endpoint results evaluated with the
 *     generic evaluators in core/endpoints on all dated measurements.
 *  4. `cellFlags` (patient × column, after fitting): flags that depend on the
 *     fitted slope and the column's own module settings.
 */
import type { ClinicalEvent } from '../events/events'
import type { EndpointPoint } from '../endpoints/thresholdEndpoints'
import type { ExclusionWindow, ReasonedExclusionWindow } from '../exclusions/windows'
import type { FitConfig, FitModel } from '../fitPipeline/types'
import type { SeriesPoint } from '../stats/series'
import type { SlopeMode } from '../stats/summarize'
import type { LabRow, PatientId } from '../types'

export type { AnalysisSettings, CellEndpoints, ColumnModuleSettings } from './registry'

export interface ManualDemographics {
  sex?: LabRow['patientSex']
  age?: number
}

export interface SeriesKey {
  bezeichnung: string
  einheit: string | null
}

export interface AnalysisContext {
  rows: LabRow[]
  manualDemographics: Record<string, ManualDemographics>
  patientAttributes: Record<string, Record<string, string>>
  events: ClinicalEvent[]
}

export interface AnalysisMessage {
  id: string
  text: string
  severity: 'info' | 'warning'
}

/**
 * Date ranges a module wants left out of the fits of one patient's series,
 * all for one reason. Produced once per dataset; a column's fit
 * configuration decides whether the module applies them (see the module's
 * `series` hook).
 */
export interface ExclusionWindowContribution {
  kind: 'exclusion-windows'
  id: string
  patientId: PatientId
  seriesKey: SeriesKey
  reason: string
  windows: ExclusionWindow[]
  /** Set when every window is `[start, start + lengthDays]`, so a column may
   * re-anchor the same windows with another length. */
  lengthDays?: number
}

/** Dataset-level inputs modules contribute to fits. */
export type AnalysisFitInputContribution = ExclusionWindowContribution

export interface AnalysisContribution {
  rows?: LabRow[]
  messages?: AnalysisMessage[]
  fitInputs?: AnalysisFitInputContribution[]
}

export interface AnalysisResult {
  rows: LabRow[]
  messages: AnalysisMessage[]
  fitInputs: AnalysisFitInputContribution[]
}

/** One (patient, series column) as a module's `series` hook sees it. */
export interface SeriesContext {
  patientId: PatientId
  seriesKey: SeriesKey
  /** All analysis rows of this patient, every series. */
  patientRows: readonly LabRow[]
  /** This series' dated numeric measurements, oldest first. */
  points: readonly SeriesPoint[]
  mode: SlopeMode
  /** The column's fit configuration, when it has one. */
  fitConfig?: FitConfig
  /** The column's legacy window-length override (days), when set. */
  exclusionDays?: number
  /** Clinical events of this patient that the column considers. */
  events: readonly ClinicalEvent[]
  /** Dataset-level fit inputs for exactly this patient and series. */
  fitInputs: readonly AnalysisFitInputContribution[]
  /** Memo shared by every cell of one cohort build, for per-patient work. */
  cache: Map<string, unknown>
}

/** A shaded date range drawn behind a trajectory. */
export interface OverlayBand {
  kind: 'band'
  moduleId: string
  start: Date
  end: Date
  title: string
}

/** A dated marker drawn on a trajectory. It sits on this series' measurement
 * nearest to `date` when one lies within `snapWithinDays`, otherwise on the
 * time axis with `offMeasurementNote` appended to its title. */
export interface OverlayMarker {
  kind: 'marker'
  moduleId: string
  date: Date
  label: string
  title: string
  snapWithinDays: number
  offMeasurementNote: string
}

export type SeriesOverlay = OverlayBand | OverlayMarker

/** A short badge on a cohort cell (table and export). */
export interface CohortFlag {
  id: string
  moduleId: string
  patientId: PatientId
  seriesKey: SeriesKey
  label: string
  /** Explanation shown as tooltip. */
  title: string
  /** Visual style key; the workspace renders `wt-badge-<tone>`. */
  tone: string
  severity?: 'info' | 'warning'
  /** Shown only together with the fitted trend statistics. */
  requiresFit?: boolean
}

/** What a module adds to one (patient, series column) before fitting. */
export interface SeriesContribution {
  /** Removed from the series before anything else is computed. Their starts
   * also split 'event-driven' fits into segments. */
  censoring?: ReasonedExclusionWindow[]
  /** Left out of the trend fit (and listed as excluded points). */
  exclusions?: ReasonedExclusionWindow[]
  overlays?: SeriesOverlay[]
  flags?: CohortFlag[]
}

/** The fitted cell a module's `cellFlags` hook sees. */
export interface CellFlagContext {
  patientId: PatientId
  seriesKey: SeriesKey
  slope: number
  fitModel: FitModel
}

/** One (patient, series column) as a module's `endpoints` hook sees it. */
export interface EndpointContext {
  patientId: PatientId
  seriesKey: SeriesKey
  mode: SlopeMode
  fitConfig?: FitConfig
  /** The estimator of the column's slope; endpoint projections reuse it. */
  scalarFitModel: FitModel
  /** Every dated numeric measurement of the series with a finite value,
   * oldest first; ages (from the nearest earlier age-carrying row) only
   * when requested. */
  points(withAges: boolean): EndpointPoint[]
  /** Global fit of those measurements with the scalar model (OLS or
   * Theil-Sen); NaN slope and intercept when the model is 'none'. */
  fit(): { slope: number; intercept: number }
}

/** The fitted cell a module's export columns read. `E` is the module's own
 * endpoint result type. */
export interface ModuleExportCell<E = unknown> {
  flags: readonly CohortFlag[]
  endpoints: E
  fitModel: FitModel
}

/** A column a module adds to the cohort export, after the generic columns
 * and in registry order. */
export interface ModuleExportColumn<E = unknown> {
  key: string
  value(cell: ModuleExportCell<E>): string | number
}

/** A per-column module setting the workspace renders generically. */
export interface ModuleSettingField {
  key: string
  label: string
  ariaLabel: string
  kind: 'number' | 'boolean'
  min?: number
  step?: number
  /** Column of the export's settings sheet that records the value. */
  exportKey?: string
}

/** How the workspace charts present a module's overlays. */
export interface OverlayPresentation {
  /** Label of the display toggle. */
  toggleLabel: string
  color: string
  /** Legend text after the marker symbol. */
  markerLegend: string
  /** Legend text after the band swatch. */
  bandLegend: string
  /** Legend text when no marker is plotted. */
  emptyLegend: string
  /** Chart-export context fragment for `markerCount` plotted markers. */
  exportContext: (markerCount: number) => string
}

/**
 * An analysis module. `S` is its settings type (stored with the workspace
 * under `id`); modules without settings use `undefined`. Hooks are written in
 * method syntax so modules with different settings fit one registry list.
 */
export interface AnalysisModule<S = undefined, Id extends string = string> {
  id: Id
  label: string
  description?: string
  /** Series this module contributes to; every series when omitted. */
  appliesTo?(series: SeriesKey): boolean
  defaultSettings?: S
  /** The stored value when it is valid settings for this module, else null. */
  parseSettings?(value: unknown): S | null
  /** Settings a column may override, rendered as plain inputs. */
  columnSettingFields?: readonly ModuleSettingField[]
  /** Readable labels of the exclusion reasons this module produces. */
  exclusionReasonLabels?: Readonly<Record<string, string>>
  overlayPresentation?: OverlayPresentation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exportColumns?: readonly ModuleExportColumn<any>[]
  apply?(ctx: AnalysisContext, settings: S): AnalysisContribution
  series?(ctx: SeriesContext): SeriesContribution
  /** This module's endpoint results for one cell, merged into the cell's
   * `endpoints` record (keys are the module's endpoint ids). */
  endpoints?(ctx: EndpointContext): object
  /** Runs only for columns that configure this module's settings. */
  cellFlags?(ctx: CellFlagContext, settings: S): CohortFlag[]
}

/** A module whose settings are stored with the workspace. */
export interface SettingsModule<S, Id extends string = string> extends AnalysisModule<S, Id> {
  defaultSettings: S
  parseSettings(value: unknown): S | null
}

export function seriesKeyEquals(a: SeriesKey, b: SeriesKey): boolean {
  return a.bezeichnung === b.bezeichnung && (a.einheit ?? null) === (b.einheit ?? null)
}

/** Every fit input contributed for this patient and series. */
export function fitInputsForSeries(
  fitInputs: readonly AnalysisFitInputContribution[],
  patientId: PatientId,
  seriesKey: SeriesKey,
): AnalysisFitInputContribution[] {
  return fitInputs.filter((input) => input.patientId === patientId && seriesKeyEquals(input.seriesKey, seriesKey))
}
