import type { AkiEpisode } from '../domains/nephrology/aki/kdigo'
import type { DateBand } from '../domains/nephrology/aki/akiAware'
import type { Source, FormulaName } from '../domains/nephrology/egfr/series'
import type { ClinicalEvent } from '../events/events'
import type { ExclusionWindow, ReasonedExclusionWindow } from '../exclusions/windows'
import type { FitConfig } from '../fitPipeline/types'
import type { SlopeMode } from '../stats/summarize'
import type { LabRow, PatientId } from '../types'

export interface ManualDemographics {
  sex?: LabRow['patientSex']
  age?: number
}

export interface SeriesKey {
  bezeichnung: string
  einheit: string | null
}

export interface EgfrModuleSettings {
  formula: FormulaName | 'off'
  source: Source | null
}

export interface AkiModuleSettings {
  showOverlays: boolean
  exclusionDays: number
}

export interface RapidEgfrDeclineModuleSettings {
  threshold: number
}

export interface AnalysisSettings {
  egfr: EgfrModuleSettings
  aki: AkiModuleSettings
  rapidEgfrDecline: RapidEgfrDeclineModuleSettings
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

export interface CohortFlagContribution {
  id: string
  patientId: PatientId
  seriesKey?: SeriesKey
  label: string
  severity?: 'info' | 'warning'
}

export interface AnalysisOverlayContribution {
  id: string
  patientId: PatientId
  seriesKey?: SeriesKey
  kind: 'event' | 'band'
  label: string
  start: Date
  end?: Date
  episode?: AkiEpisode
  band?: DateBand
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
  cohortFlags?: CohortFlagContribution[]
  overlays?: AnalysisOverlayContribution[]
  fitInputs?: AnalysisFitInputContribution[]
}

/** One (patient, series column) as a module's `series` hook sees it. */
export interface SeriesContext {
  patientId: PatientId
  seriesKey: SeriesKey
  /** All analysis rows of this patient, every series. */
  patientRows: readonly LabRow[]
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

/** What a module adds to one (patient, series column) before fitting. */
export interface SeriesContribution {
  /** Removed from the series before anything else is computed. Their starts
   * also split 'event-driven' fits into segments. */
  censoring?: ReasonedExclusionWindow[]
  /** Left out of the trend fit (and listed as excluded points). */
  exclusions?: ReasonedExclusionWindow[]
}

export interface AnalysisModule<TSettings> {
  id: string
  label: string
  defaultSettings: TSettings
  apply: (ctx: AnalysisContext, settings: TSettings) => AnalysisContribution
  /** Per (patient, series column) hook; see SeriesContribution. */
  series?: (ctx: SeriesContext) => SeriesContribution
}

export interface AnalysisResult {
  rows: LabRow[]
  messages: AnalysisMessage[]
  cohortFlags: CohortFlagContribution[]
  overlays: AnalysisOverlayContribution[]
  fitInputs: AnalysisFitInputContribution[]
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
