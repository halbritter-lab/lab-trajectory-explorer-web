import { analysisModules, type RegisteredAnalysisModule } from '../analysis/registry'
import { fitInputsForSeries, type SeriesContext } from '../analysis/types'
import type { ReasonedExclusionWindow } from '../exclusions/windows'
import { patientIdKey, type LabRow, type PatientId } from '../types'
import type { CohortSeriesSpec } from './screening'

/** The (patient, column) context every module's `series` hook receives. */
export function seriesContextFor(
  spec: CohortSeriesSpec,
  patientId: PatientId,
  patientRows: readonly LabRow[],
  cache: Map<string, unknown>,
): SeriesContext {
  const seriesKey = { bezeichnung: spec.bezeichnung, einheit: spec.einheit ?? null }
  return {
    patientId,
    seriesKey,
    patientRows,
    mode: spec.mode,
    fitConfig: spec.fitConfig,
    exclusionDays: spec.exclusionDays,
    events: spec.clinicalEventsByPatient?.[patientIdKey(patientId)] ?? spec.clinicalEvents ?? [],
    fitInputs: fitInputsForSeries(spec.fitInputs ?? [], patientId, seriesKey),
    cache,
  }
}

export interface SeriesExclusions {
  /** Censoring windows of every module, in module order. */
  censoring: ReasonedExclusionWindow[]
  /** Fit exclusion windows of every module, in module order. */
  exclusions: ReasonedExclusionWindow[]
}

/** Collect every module's windows for one (patient, column). The single way
 * cohort cells, slope lines and mixed-model rows learn what to leave out. */
export function seriesExclusions(
  ctx: SeriesContext,
  modules: readonly RegisteredAnalysisModule[] = analysisModules,
): SeriesExclusions {
  const out: SeriesExclusions = { censoring: [], exclusions: [] }
  for (const module of modules) {
    const contribution = module.series?.(ctx)
    if (contribution?.censoring) out.censoring.push(...contribution.censoring)
    if (contribution?.exclusions) out.exclusions.push(...contribution.exclusions)
  }
  return out
}
