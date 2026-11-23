import { generalExplorationConfig, type FitConfig } from '../analysis/fitConfig'
import type { AnalysisFitInputContribution } from '../analysis/types'
import type { ClinicalEvent } from '../events/events'
import { modeForFitModel } from '../fitPipeline/modes'
import { patientIdKey } from '../types'
import type { CohortSeriesSpec } from './screening'
import type { AnchorComparisonSettings } from './anchorComparison'

/** Clinical events bucketed by patientIdKey, as cohort specs expect them. */
export function clinicalEventsByPatient(events: readonly ClinicalEvent[]): Record<string, ClinicalEvent[]> {
  const byPatient: Record<string, ClinicalEvent[]> = Object.create(null)
  for (const event of events) (byPatient[patientIdKey(event.patientId)] ??= []).push(event)
  return byPatient
}

/**
 * The cohort spec of one parameter column: the slope mode follows the fit
 * model, the column's fit configuration (general exploration when it has
 * none) decides censoring, exclusions, aggregation and endpoints, and the
 * dataset's fit inputs and events are attached.
 */
export function cohortSeriesSpec(
  parameter: { bezeichnung: string; einheit: string | null },
  fitConfig: FitConfig = generalExplorationConfig(parameter),
  context: { clinicalEventsByPatient?: Record<string, ClinicalEvent[]>; exactBirthDateByPatient?: Record<string, Date>; fitInputs?: AnalysisFitInputContribution[]; analysisSettings?: Readonly<Record<string, unknown>>; anchorComparison?: AnchorComparisonSettings; logTrend?: boolean } = {},
): CohortSeriesSpec {
  return {
    bezeichnung: parameter.bezeichnung,
    einheit: parameter.einheit,
    mode: modeForFitModel(fitConfig.fitModel),
    fitConfig,
    exclusionDays: fitConfig.exclusions.akiExclusionDays,
    clinicalEventsByPatient: context.clinicalEventsByPatient,
    exactBirthDateByPatient: context.exactBirthDateByPatient,
    fitInputs: context.fitInputs,
    ...(context.analysisSettings ? { analysisSettings: context.analysisSettings } : {}),
    ...(context.anchorComparison ? { anchorComparison: context.anchorComparison } : {}),
    ...(context.logTrend ? { logTrend: true } : {}),
  }
}
