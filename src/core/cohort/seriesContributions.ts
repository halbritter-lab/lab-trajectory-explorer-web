import { analysisModules, type RegisteredAnalysisModule } from '../analysis/registry'
import { fitInputsForSeries, type CohortFlag, type SeriesContext, type SeriesOverlay } from '../analysis/types'
import type { ReasonedExclusionWindow } from '../exclusions/windows'
import type { SeriesPoint } from '../stats/series'
import { patientIdKey, type LabRow, type PatientId } from '../types'
import type { CohortSeriesSpec } from './screening'

/** The column's dated numeric measurements of one patient, oldest first. */
export function seriesRowsFor(spec: Pick<CohortSeriesSpec, 'bezeichnung' | 'einheit'>, patientRows: readonly LabRow[]): LabRow[] {
  return patientRows
    .filter((r) => r.bezeichnung === spec.bezeichnung && (r.einheit ?? null) === (spec.einheit ?? null) && r.wertNum !== null && r.labDatum !== null)
    .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
}

/** The (patient, column) context every module's `series` hook receives. */
export function seriesContextFor(
  spec: CohortSeriesSpec,
  patientId: PatientId,
  patientRows: readonly LabRow[],
  cache: Map<string, unknown>,
  points: readonly SeriesPoint[] = seriesRowsFor(spec, patientRows).map((r) => ({ date: r.labDatum!, value: r.wertNum! })),
): SeriesContext {
  const seriesKey = { bezeichnung: spec.bezeichnung, einheit: spec.einheit ?? null }
  return {
    patientId,
    seriesKey,
    patientRows,
    points,
    mode: spec.mode,
    fitConfig: spec.fitConfig,
    exclusionDays: spec.exclusionDays,
    events: spec.clinicalEventsByPatient?.[patientIdKey(patientId)] ?? spec.clinicalEvents ?? [],
    fitInputs: fitInputsForSeries(spec.fitInputs ?? [], patientId, seriesKey),
    cache,
  }
}

export interface CollectedSeriesContributions {
  /** Censoring windows of every module, in module order. */
  censoring: ReasonedExclusionWindow[]
  /** Fit exclusion windows of every module, in module order. */
  exclusions: ReasonedExclusionWindow[]
  overlays: SeriesOverlay[]
  flags: CohortFlag[]
}

/** Run every module's `series` hook for one (patient, column). The single
 * way cohort cells, slope lines and mixed-model rows learn what to leave out,
 * and charts and tables what to draw. */
export function collectSeriesContributions(
  ctx: SeriesContext,
  modules: readonly RegisteredAnalysisModule[] = analysisModules,
): CollectedSeriesContributions {
  const out: CollectedSeriesContributions = { censoring: [], exclusions: [], overlays: [], flags: [] }
  for (const module of modules) {
    const contribution = module.series?.(ctx)
    if (!contribution) continue
    if (contribution.censoring) out.censoring.push(...contribution.censoring)
    if (contribution.exclusions) out.exclusions.push(...contribution.exclusions)
    if (contribution.overlays) out.overlays.push(...contribution.overlays)
    if (contribution.flags) out.flags.push(...contribution.flags)
  }
  return out
}

/** Censoring and exclusion windows for one (patient, column). */
export function seriesExclusions(
  ctx: SeriesContext,
  modules: readonly RegisteredAnalysisModule[] = analysisModules,
): Pick<CollectedSeriesContributions, 'censoring' | 'exclusions'> {
  const { censoring, exclusions } = collectSeriesContributions(ctx, modules)
  return { censoring, exclusions }
}
