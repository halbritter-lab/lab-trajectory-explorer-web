import type { AkiEpisode } from '../aki/kdigo'
import type { DateBand } from '../aki/akiAware'
import type { Source, FormulaName } from '../egfr/series'
import type { ClinicalEvent } from '../events/events'
import type { LabRow } from '../types'

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
  manualDemographics: Record<number, ManualDemographics>
  events: ClinicalEvent[]
}

export interface AnalysisMessage {
  id: string
  text: string
  severity: 'info' | 'warning'
}

export interface CohortFlagContribution {
  id: string
  patientId: number
  seriesKey?: SeriesKey
  label: string
  severity?: 'info' | 'warning'
}

export interface AnalysisOverlayContribution {
  id: string
  patientId: number
  seriesKey?: SeriesKey
  kind: 'event' | 'band'
  label: string
  start: Date
  end?: Date
  episode?: AkiEpisode
  band?: DateBand
}

export interface AnalysisFitInputContribution {
  id: string
  patientId: number
  seriesKey: SeriesKey
  kind: 'aki-aware'
  exclusionDays: number
  episodes: AkiEpisode[]
}

export interface AnalysisContribution {
  rows?: LabRow[]
  messages?: AnalysisMessage[]
  cohortFlags?: CohortFlagContribution[]
  overlays?: AnalysisOverlayContribution[]
  fitInputs?: AnalysisFitInputContribution[]
}

export interface AnalysisModule<TSettings> {
  id: string
  label: string
  defaultSettings: TSettings
  apply: (ctx: AnalysisContext, settings: TSettings) => AnalysisContribution
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

export function fitInputForSeries(
  fitInputs: readonly AnalysisFitInputContribution[],
  patientId: number,
  seriesKey: SeriesKey,
): AnalysisFitInputContribution | undefined {
  return fitInputs.find((input) => input.patientId === patientId && seriesKeyEquals(input.seriesKey, seriesKey))
}
