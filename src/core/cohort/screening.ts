import type { LabRow } from '../types'
import type { SeriesPoint } from '../stats/series'
import type { SlopeMode } from '../stats/summarize'
import { summarizeByBezeichnung } from '../stats/summarize'
import { buildSlopeLines, type LinePoint } from '../stats/slopeLines'
import { fitInputForSeries } from '../analysis/types'
import type { AnalysisFitInputContribution } from '../analysis/types'
import type { AkiEpisode } from '../aki/kdigo'
import { akiExclusionBands, episodesForSeries, fitAkiAware, type DateBand } from '../aki/akiAware'
import { formatAkiChip, formatAkiEpisodeSummary } from '../aki/summary'
import { rapidEgfrDeclineFlagForCell } from '../analysis/rapidEgfrDeclineModule'
import { isEgfrUnit } from '../analysis/rapidEgfrDeclineModule'
import type { ClinicalEvent } from '../events/events'
import { clinicalEventAffectsFit, filterFitPointsByClinicalEvents } from '../events/fitExclusions'
import type { FitConfig } from '../fitPipeline/types'
import { computeCkdEndpoints, type CkdEndpoints, type CkdEndpointSettings, type EndpointPoint } from '../endpoints/ckdEndpoints'
import { balanceSeriesPoints } from '../stats/timeBalancing'

export { formatAkiChip, formatAkiEpisodeSummary }
export { isEgfrUnit, isRapidEgfrDecline, RAPID_EGFR_DECLINE_DEFAULT } from '../analysis/rapidEgfrDeclineModule'

export interface CohortSeriesSpec {
  bezeichnung: string
  einheit: string | null
  mode: SlopeMode
  gapDays?: number
  windowDays?: number
  stepDays?: number
  cutoffDays?: number
  exclusionDays?: number
  eventDates?: Date[]
  eventDatesByPatient?: Record<number, Date[]>
  clinicalEvents?: ClinicalEvent[]
  clinicalEventsByPatient?: Record<number, ClinicalEvent[]>
  fitConfig?: FitConfig
  fitInputs?: AnalysisFitInputContribution[]
}

export interface CohortCell {
  bezeichnung: string
  einheit: string | null
  mode: SlopeMode
  nNumeric: number
  spanDays: number
  slope: number // value-units per YEAR (x-axis is fractional years)
  r2: number
  ciLow: number
  ciHigh: number
  reason: string | null
  points: SeriesPoint[]
  akiChip: string
  akiSummary: string
  fitLines: LinePoint[][]
  akiBands: DateBand[]
  excludedIdx: number[]
  endpoints: CkdEndpoints
}

export interface CohortRow {
  patientId: number
  cells: CohortCell[]
}

/** One CohortRow per patient; one CohortCell per series spec. The slope cell
 * reuses summarizeByBezeichnung (parity-tested); creatinine mg/dl columns also
 * carry an AKI chip from KDIGO detection. */
export function buildCohortRows(rows: LabRow[], patientIds: number[], specs: CohortSeriesSpec[]): CohortRow[] {
  const ids = [...new Set(patientIds)].sort((a, b) => a - b)
  // Bucket rows by patient once. Otherwise every (patient × series) cell would
  // re-scan the full table (summarize + per-cell filter + episode source),
  // making the whole cohort build O(patients × rows). Each helper still filters
  // by patientId internally, but now over the small per-patient slice.
  const byPatient = new Map<number, LabRow[]>()
  for (const r of rows) {
    const bucket = byPatient.get(r.patientId)
    if (bucket) bucket.push(r)
    else byPatient.set(r.patientId, [r])
  }
  return ids.map((pid) => {
    const prows = byPatient.get(pid) ?? []
    const cells = specs.map((spec): CohortCell => {
      const clinicalEvents = spec.clinicalEventsByPatient?.[pid] ?? spec.clinicalEvents ?? []
      const fitEventDates = spec.eventDatesByPatient?.[pid] ?? spec.eventDates ?? clinicalEvents
        .filter((event) => clinicalEventAffectsFit(event, spec.fitConfig?.censoring))
        .map((event) => event.date)
      const summaries = summarizeByBezeichnung(prows, pid, spec.mode, {
        gapDays: spec.gapDays,
        windowDays: spec.windowDays,
        stepDays: spec.stepDays,
        cutoffDays: spec.cutoffDays,
        exclusionDays: spec.exclusionDays,
        eventDates: fitEventDates,
        clinicalEvents,
        clinicalEventCensoring: spec.fitConfig?.censoring,
        excludeAkiWindows: spec.fitConfig?.exclusions.excludeAkiWindows,
        fitModel: spec.fitConfig?.fitModel,
        timeBalancing: spec.fitConfig?.timeBalancing,
        fitInputs: spec.fitInputs,
      })
      const match = summaries.find((s) => s.bezeichnung === spec.bezeichnung && s.einheit === (spec.einheit ?? '(no unit)'))
      const seriesRows = prows
        .filter((r) => r.bezeichnung === spec.bezeichnung && (r.einheit ?? null) === (spec.einheit ?? null) && r.wertNum !== null && r.labDatum !== null)
        .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
      const points: SeriesPoint[] = seriesRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
      const fitInput = fitInputForSeries(spec.fitInputs ?? [], pid, { bezeichnung: spec.bezeichnung, einheit: spec.einheit ?? null })
      const exclusionDays = spec.exclusionDays ?? fitInput?.exclusionDays ?? 30
      let episodes: AkiEpisode[] = []
      if (points.length > 0) {
        episodes = fitInput?.episodes ?? episodesForSeries(prows, pid, spec.bezeichnung, spec.einheit ?? null)
      }
      const excluded = new Set(filterFitPointsByClinicalEvents(points, clinicalEvents, spec.fitConfig?.censoring).excludedIdx)
      if ((spec.mode === 'aki-aware' || spec.fitConfig?.exclusions.excludeAkiWindows) && points.length > 0) {
        const kept = new Set(fitAkiAware(points, exclusionDays, episodes).keptIdx)
        points.forEach((_, i) => {
          if (!kept.has(i)) excluded.add(i)
        })
      }
      const excludedIdx = [...excluded].sort((a, b) => a - b)
      const endpointSettings = endpointSettingsFor(spec.einheit ?? null, spec.fitConfig?.endpoints)
      const endpointPoints = endpointPointsForSeries(seriesRows, clinicalEvents, spec.fitConfig, episodes, exclusionDays, spec.mode)
      const fitLines = points.length < 2 || spec.mode === 'rolling'
        ? []
        : buildSlopeLines(
            points,
            {
              mode: spec.mode,
              gapDays: spec.gapDays ?? 180,
              windowDays: spec.windowDays ?? 730,
              stepDays: spec.stepDays ?? 180,
              cutoffDays: spec.cutoffDays ?? 90,
              exclusionDays,
              eventDates: fitEventDates,
              clinicalEvents,
              clinicalEventCensoring: spec.fitConfig?.censoring,
              excludeAkiWindows: spec.fitConfig?.exclusions.excludeAkiWindows,
              fitModel: spec.fitConfig?.fitModel,
              timeBalancing: spec.fitConfig?.timeBalancing,
            },
            spec.mode === 'aki-aware' || spec.fitConfig?.exclusions.excludeAkiWindows ? episodes : undefined,
          )
      const akiStages = episodes.map((e) => e.stage)
      return {
        bezeichnung: spec.bezeichnung,
        einheit: spec.einheit,
        mode: spec.mode,
        nNumeric: match?.nNumeric ?? 0,
        spanDays: match?.spanDays ?? 0,
        slope: match?.slope ?? Number.NaN,
        r2: match?.r2 ?? Number.NaN,
        ciLow: match?.ciLow ?? Number.NaN,
        ciHigh: match?.ciHigh ?? Number.NaN,
        // A successful fit yields reason === null; only fall back to
        // 'no_numeric_values' when no summary matched this spec at all.
        reason: match ? match.reason : 'no_numeric_values',
        points,
        akiChip: formatAkiChip(akiStages),
        akiSummary: formatAkiEpisodeSummary(akiStages),
        fitLines,
        akiBands: akiExclusionBands(episodes, exclusionDays),
        excludedIdx,
        endpoints: computeCkdEndpoints({
          points: endpointPoints,
          slopePerYear: match?.slope ?? Number.NaN,
          enabled: endpointSettings,
        }),
      }
    })
    return { patientId: pid, cells }
  })
}

const disabledEndpointSettings: CkdEndpointSettings = {
  percentDecline: false,
  observedCkdG5: false,
  projectedAgeToCkdG5: false,
}

function endpointSettingsFor(einheit: string | null, endpoints?: Partial<CkdEndpointSettings>): CkdEndpointSettings {
  if (!isEgfrUnit(einheit)) return disabledEndpointSettings
  return {
    percentDecline: endpoints?.percentDecline ?? false,
    observedCkdG5: endpoints?.observedCkdG5 ?? false,
    projectedAgeToCkdG5: endpoints?.projectedAgeToCkdG5 ?? false,
  }
}

const MS_PER_YEAR = 365.25 * 86_400_000

function endpointPointsForSeries(
  rows: LabRow[],
  clinicalEvents: ClinicalEvent[],
  fitConfig: FitConfig | undefined,
  episodes: AkiEpisode[],
  exclusionDays: number,
  mode: SlopeMode,
): EndpointPoint[] {
  const indexed = rows
    .filter((r) => r.wertNum !== null && r.labDatum !== null)
    .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    .map((row, index) => ({ row, index, point: { date: row.labDatum!, value: row.wertNum! } }))
  const eventExcluded = new Set(
    filterFitPointsByClinicalEvents(
      indexed.map((item) => item.point),
      clinicalEvents,
      fitConfig?.censoring,
    ).excludedIdx,
  )
  let included = indexed.filter((item) => !eventExcluded.has(item.index))
  if ((mode === 'aki-aware' || fitConfig?.exclusions.excludeAkiWindows) && included.length > 0) {
    const kept = new Set(fitAkiAware(included.map((item) => item.point), exclusionDays, episodes).keptIdx)
    included = included.filter((_, index) => kept.has(index))
  }
  const balanced = balanceSeriesPoints(included.map((item) => item.point), fitConfig?.timeBalancing)
  return balanced.map((point) => ({
    ...point,
    ageYears: ageAtDate(point.date, included.map((item) => item.row)),
  }))
}

function ageAtDate(date: Date, rows: LabRow[]): number | null {
  const anchors = rows
    .filter((r) => r.labDatum !== null && r.patientAgeAtLab !== null)
    .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
  if (anchors.length === 0) return null
  const anchor = [...anchors].reverse().find((r) => r.labDatum!.getTime() <= date.getTime()) ?? anchors[0]
  return anchor.patientAgeAtLab! + (date.getTime() - anchor.labDatum!.getTime()) / MS_PER_YEAR
}

export interface CohortExportRecord {
  PatientID: number
  Bezeichnung: string
  Einheit: string
  slope_mode: string
  n: number
  span_days: number
  slope: number | ''
  /** Unit of the slope, making the per-year basis explicit (e.g. "mg/dl/yr"). */
  slope_unit: string
  r2: number | ''
  ci_low: number | ''
  ci_high: number | ''
  reason: string
  aki: string
  /** 'yes' when this eGFR series declines faster than the rapid-progression
   * threshold, else '' (and '' for non-eGFR series or when the flag is off). */
  rapid_progression: string
  endpoint_percent_decline: number | ''
  endpoint_observed_ckd_g5: string
  endpoint_projected_age_to_ckd_g5: number | ''
}

/** Unit string for a slope: the series unit per year (slopes are value-units
 * per year because the OLS x-axis is fractional years). */
export function slopeUnit(einheit: string | null): string {
  return `${einheit ?? '(no unit)'}/yr`
}

/** Disclaimer rows embedded as an "about" sheet in every export, so the
 * research-use caveat travels with the data. */
export const EXPORT_DISCLAIMER_ROWS: Record<string, unknown>[] = [
  { note: 'Lab Trajectory Explorer export' },
  { note: 'Research use only — not a medical device, not for clinical decision-making.' },
  { note: 'Slopes are per year (value-units/yr; eGFR in mL/min/1.73m2/yr).' },
  { note: 'eGFR is computed from creatinine + demographics (adult-only); AKI episodes use the KDIGO creatinine criterion only (urine output not evaluated).' },
  { note: 'All derived values are algorithmic estimates requiring independent clinical verification.' },
]

const numOrBlank = (v: number): number | '' => (Number.isNaN(v) ? '' : v)

/** Flatten cohort rows into export records (one per patient × series). Pass the
 * rapid-progression threshold (mL/min/1.73m²/yr) to populate rapid_progression;
 * 0 (default) leaves the flag off. */
export function cohortExportRecords(rows: CohortRow[], rapidThreshold = 0): CohortExportRecord[] {
  const out: CohortExportRecord[] = []
  for (const r of rows) {
    for (const c of r.cells) {
      out.push({
        PatientID: r.patientId,
        Bezeichnung: c.bezeichnung,
        Einheit: c.einheit ?? '',
        slope_mode: c.mode,
        n: c.nNumeric,
        span_days: c.spanDays,
        slope: numOrBlank(c.slope),
        slope_unit: slopeUnit(c.einheit),
        r2: numOrBlank(c.r2),
        ci_low: numOrBlank(c.ciLow),
        ci_high: numOrBlank(c.ciHigh),
        reason: c.reason ?? '',
        aki: c.akiChip,
        rapid_progression: rapidEgfrDeclineFlagForCell({
          patientId: r.patientId,
          bezeichnung: c.bezeichnung,
          einheit: c.einheit,
          slope: c.slope,
          threshold: rapidThreshold,
        }) ? 'yes' : '',
        endpoint_percent_decline: c.endpoints.percentDecline.value ?? '',
        endpoint_observed_ckd_g5: c.endpoints.observedCkdG5.met ? 'yes' : '',
        endpoint_projected_age_to_ckd_g5: c.endpoints.projectedAgeToCkdG5.value ?? '',
      })
    }
  }
  return out
}
