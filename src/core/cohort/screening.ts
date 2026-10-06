import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../types'
import type { SeriesPoint } from '../stats/series'
import { fitGlobal, fitTheilSen } from '../stats/series'
import type { SlopeMode } from '../stats/summarize'
import { scalarFitModelFor, summarizeByBezeichnung, type SeriesSummary } from '../stats/summarize'
import { buildSlopeLines, type LinePoint } from '../stats/slopeLines'
import { fitInputForSeries } from '../analysis/types'
import type { AnalysisFitInputContribution } from '../analysis/types'
import type { AkiEpisode } from '../domains/nephrology/aki/kdigo'
import { akiExclusionBands, episodesForSeries, fitAkiAware, type DateBand } from '../domains/nephrology/aki/akiAware'
import { formatAkiChip, formatAkiEpisodeSummary } from '../domains/nephrology/aki/summary'
import { rapidEgfrDeclineFlagForCell } from '../domains/nephrology/rapidEgfrDeclineModule'
import { isEgfrUnit } from '../domains/nephrology/rapidEgfrDeclineModule'
import type { ClinicalEvent } from '../events/events'
import { clinicalEventAffectsFit, clinicalEventExclusionWindows } from '../domains/nephrology/censoring'
import { applyExclusionWindows, exclusionReasonsAt } from '../exclusions/windows'
import type { ExclusionReason, FitConfig } from '../fitPipeline/types'
import { computeCkdEndpoints, type CkdEndpoints, type CkdEndpointSettings } from '../domains/nephrology/endpoints/ckdEndpoints'
import { isUnstableSlope } from '../stats/slopeQuality'
import { DEFAULT_AKI_EXCLUSION_DAYS } from '../domains/nephrology/constants'
import { groupValueForPatient } from '../grouping/grouping'

export { formatAkiChip, formatAkiEpisodeSummary }
export { isEgfrUnit, isRapidEgfrDecline, RAPID_EGFR_DECLINE_DEFAULT } from '../domains/nephrology/rapidEgfrDeclineModule'

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
  eventDatesByPatient?: Record<string, Date[]>
  clinicalEvents?: ClinicalEvent[]
  clinicalEventsByPatient?: Record<string, ClinicalEvent[]>
  fitConfig?: FitConfig
  fitInputs?: AnalysisFitInputContribution[]
}

export interface CohortCell {
  bezeichnung: string
  einheit: string | null
  mode: SlopeMode
  /** The fit model actually used for this cell's slope. Distinct from `mode`
   * (the SlopeMode), which selects how the series is segmented rather than how
   * each segment is fitted. Defaults to 'ols' to match summarizeByBezeichnung. */
  fitModel: FitConfig['fitModel']
  nNumeric: number
  /** Points the fit consumed, after exclusions and balancing. Falls back to
   * nNumeric only when the fit path reported none. */
  nFitted: number
  fittedSpanDays: number
  spanDays: number
  slope: number // value-units per YEAR (x-axis is fractional years)
  r2: number
  ciLow: number
  ciHigh: number
  reason: SeriesSummary['reason']
  points: SeriesPoint[]
  akiChip: string
  akiSummary: string
  fitLines: LinePoint[][]
  akiBands: DateBand[]
  /** AKI episodes shown for this series (creatinine-derived, also for eGFR
   * columns), in detection order. Display context; the fit only uses them when
   * AKI-window exclusion is configured. */
  akiEpisodes: AkiEpisode[]
  excludedIdx: number[]
  /** Reasons each point in `points` is excluded from the fit, aligned by index;
   * an empty array means the point is available to the fit. Non-empty exactly
   * for the indices in `excludedIdx`. */
  pointExclusionReasons: ExclusionReason[][]
  endpoints: CkdEndpoints
}

export interface CohortRow {
  patientId: PatientId
  cells: CohortCell[]
  /** The patient's group value under the active group-by attribute; undefined
   * when grouping is inactive. */
  groupValue?: string
}

/** One CohortRow per patient; one CohortCell per series spec. The slope cell
 * reuses summarizeByBezeichnung (parity-tested); creatinine mg/dl columns also
 * carry an AKI chip from KDIGO detection. */
export function buildCohortRows(
  rows: LabRow[],
  patientIds: PatientId[],
  specs: CohortSeriesSpec[],
  attributeName?: string | null,
  byPatientAttributes?: Record<string, Record<string, string>>,
): CohortRow[] {
  const ids = [...new Set(patientIds)].sort(comparePatientIds)
  // Bucket rows by patient once. Otherwise every (patient × series) cell would
  // re-scan the full table (summarize + per-cell filter + episode source),
  // making the whole cohort build O(patients × rows). Each helper still filters
  // by patientId internally, but now over the small per-patient slice.
  const byPatient = new Map<PatientId, LabRow[]>()
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
      const exclusionDays = spec.exclusionDays ?? fitInput?.exclusionDays ?? DEFAULT_AKI_EXCLUSION_DAYS
      let episodes: AkiEpisode[] = []
      if (points.length > 0) {
        episodes = fitInput?.episodes ?? episodesForSeries(prows, pid, spec.bezeichnung, spec.einheit ?? null)
      }
      const eventWindows = clinicalEventExclusionWindows(clinicalEvents, spec.fitConfig?.censoring)
      const excluded = new Set(applyExclusionWindows(points, eventWindows).excludedIdx)
      const pointExclusionReasons: ExclusionReason[][] = points.map((point, i) =>
        excluded.has(i) ? exclusionReasonsAt(point.date, eventWindows) : [])
      if ((spec.mode === 'aki-aware' || spec.fitConfig?.exclusions.excludeAkiWindows) && points.length > 0) {
        const kept = new Set(fitAkiAware(points, exclusionDays, episodes).keptIdx)
        points.forEach((_, i) => {
          if (kept.has(i)) return
          excluded.add(i)
          pointExclusionReasons[i].push('aki')
        })
      }
      const excludedIdx = [...excluded].sort((a, b) => a - b)
      const endpointSettings = endpointSettingsFor(spec.einheit ?? null, spec.fitConfig?.endpoints)
      const endpointRows = seriesRows.filter(row => Number.isFinite(row.wertNum) && Number.isFinite(row.labDatum!.getTime()))
      // Ages and the all-data fit only feed the G5 projection; skip both otherwise.
      const projecting = endpointSettings.projectedAgeToCkdG5
      const ageAnchors = projecting ? ageAnchorsFor(endpointRows) : []
      const endpointPoints = endpointRows.map(row => ({ date: row.labDatum!, value: row.wertNum!, ageYears: projecting ? ageAtDate(row.labDatum!, ageAnchors) : null }))
      const endpointModel = scalarFitModelFor(spec.mode, spec.fitConfig?.fitModel)
      const endpointFit = !projecting || endpointModel === 'none'
        ? { slope: Number.NaN, intercept: Number.NaN }
        : endpointModel === 'theil-sen' ? fitTheilSen(endpointPoints) : fitGlobal(endpointPoints)
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
        fitModel: scalarFitModelFor(spec.mode, spec.fitConfig?.fitModel),
        nNumeric: match?.nNumeric ?? 0,
        nFitted: match?.nFitted ?? match?.nNumeric ?? 0,
        fittedSpanDays: match?.fittedSpanDays ?? 0,
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
        akiEpisodes: episodes,
        excludedIdx,
        pointExclusionReasons,
        endpoints: computeCkdEndpoints({
          points: endpointPoints,
          slopePerYear: endpointFit.slope,
          intercept: endpointFit.intercept,
          enabled: endpointSettings,
        }),
      }
    })
    const groupValue = attributeName
      ? groupValueForPatient(pid, byPatientAttributes ?? {}, attributeName)
      : undefined
    return { patientId: pid, cells, ...(groupValue !== undefined ? { groupValue } : {}) }
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
    observedCkdG4: endpoints?.observedCkdG4 ?? false,
    observedCkdG5: endpoints?.observedCkdG5 ?? false,
    projectedAgeToCkdG5: endpoints?.projectedAgeToCkdG5 ?? false,
    confirmationDays: endpoints?.confirmationDays,
  }
}

const MS_PER_YEAR = 365.25 * 86_400_000

/** Rows carrying an age, oldest first; computed once per series for ageAtDate. */
function ageAnchorsFor(rows: LabRow[]): LabRow[] {
  return rows
    .filter((r) => r.labDatum !== null && r.patientAgeAtLab !== null)
    .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
}

function ageAtDate(date: Date, anchors: LabRow[]): number | null {
  if (anchors.length === 0) return null
  let anchor = anchors[0]
  for (const r of anchors) if (r.labDatum!.getTime() <= date.getTime()) anchor = r
  return anchor.patientAgeAtLab! + (date.getTime() - anchor.labDatum!.getTime()) / MS_PER_YEAR
}

export interface CohortExportRecord {
  /** Active group-by value; present (as the first column) only when grouping is
   * active, i.e. when the source rows carry a groupValue. */
  group?: string
  PatientID: PatientId
  Bezeichnung: string
  Einheit: string
  slope_mode: string
  /** Scalar estimator that produced `slope` (`ols`, `theil-sen`, or `none`).
   * `slope_mode` separately records rolling, segmentation, and other paths. */
  fit_model: string
  n: number
  span_days: number
  slope: number | ''
  /** Unit of the slope, making the per-year basis explicit (e.g. "mg/dl/yr"). */
  slope_unit: string
  r2: number | ''
  ci_low: number | ''
  ci_high: number | ''
  reason: string
  /** 'yes' when the slope rests on fewer than three fitted measurements or a
   * fitted span under a year. Broader than `reason`: a two-point fit is
   * reported by the reference implementation as a clean fit with r2 = 1, so
   * `reason` alone leaves it unflagged. */
  unstable_slope: string
  /** 'yes' when the patient's demographics (sex and/or birth-date anchor) had to
   * be resolved from contradictory input rows, else ''. Populated from the
   * demographics module's conflict messages, keyed by patientIdKey. */
  demographics_conflict: string
  aki: string
  /** 'yes' when this eGFR series declines faster than the rapid-progression
   * threshold, else '' (and '' for non-eGFR series or when the flag is off). */
  rapid_progression: string
  endpoint_percent_decline: number | ''
  endpoint_observed_ckd_g5: string
  endpoint_projected_age_to_ckd_g5: number | ''
  // Columns added after the three above are appended, so positional readers of
  // older exports keep working. Provenance is blank for endpoints not evaluated.
  endpoint_observed_ckd_g4: string
  endpoint_confirmation_days: number | ''
  endpoint_input_policy: string
  endpoint_prediction_anchor: string
  endpoint_prediction_model: string
  endpoint_g4_first_date: string
  endpoint_g4_confirmed_date: string
  endpoint_g4_recovery_date: string
  endpoint_g4_first_value: number | ''
  endpoint_g4_confirmed_value: number | ''
  endpoint_g4_recovery_value: number | ''
  endpoint_g5_first_date: string
  endpoint_g5_confirmed_date: string
  endpoint_g5_recovery_date: string
  endpoint_g5_first_value: number | ''
  endpoint_g5_confirmed_value: number | ''
  endpoint_g5_recovery_value: number | ''
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
  { note: 'Observed G4 <30 and G5 <15 use all dated numeric eGFR measurements. Confirmation interval is recorded per result. Recovery before confirmation resets the candidate; later recovery preserves the event.' },
  { note: 'Individual endpoint prediction extends a global fitted curve on all dated numeric measurements, independently of display-fit exclusions and aggregation. Theil-Sen requires three points, uses separate-median intercept and 95% slope confidence bounds; these are not prediction intervals.' },
]

const numOrBlank = (v: number): number | '' => (Number.isNaN(v) ? '' : v)
const endpointDate = (date: Date | null): string => date?.toISOString().slice(0, 10) ?? ''

/** Flatten cohort rows into export records (one per patient × series). Pass the
 * rapid-progression threshold (mL/min/1.73m²/yr) to populate rapid_progression;
 * 0 (default) leaves the flag off. `conflictPatientKeys` holds the patientIdKey
 * of every patient whose demographics had to be resolved from contradictory
 * input, so the caveat travels with the exported table. */
export function cohortExportRecords(
  rows: CohortRow[],
  rapidThreshold = 0,
  conflictPatientKeys: ReadonlySet<string> = new Set(),
): CohortExportRecord[] {
  const out: CohortExportRecord[] = []
  for (const r of rows) {
    for (const c of r.cells) {
      const evaluated = c.endpoints.evaluated
      const observedEvaluated = evaluated.observedCkdG4 || evaluated.observedCkdG5
      const anyEvaluated = observedEvaluated || evaluated.percentDecline || evaluated.projectedAgeToCkdG5
      out.push({
        ...(r.groupValue !== undefined ? { group: r.groupValue } : {}),
        PatientID: r.patientId,
        Bezeichnung: c.bezeichnung,
        Einheit: c.einheit ?? '',
        slope_mode: c.mode,
        fit_model: c.fitModel,
        n: c.nNumeric,
        span_days: c.spanDays,
        slope: numOrBlank(c.slope),
        slope_unit: slopeUnit(c.einheit),
        r2: numOrBlank(c.r2),
        ci_low: numOrBlank(c.ciLow),
        ci_high: numOrBlank(c.ciHigh),
        reason: c.reason ?? '',
        unstable_slope: isUnstableSlope({ reason: c.reason, nFitted: c.nFitted, fittedSpanDays: c.fittedSpanDays, fitModel: c.fitModel }) ? 'yes' : '',
        demographics_conflict: conflictPatientKeys.has(patientIdKey(r.patientId)) ? 'yes' : '',
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
        endpoint_observed_ckd_g4: c.endpoints.observedCkdG4.met ? 'yes' : '',
        endpoint_confirmation_days: observedEvaluated ? c.endpoints.confirmationDays : '',
        endpoint_input_policy: anyEvaluated ? 'all dated numeric measurements' : '',
        endpoint_prediction_anchor: evaluated.projectedAgeToCkdG5 ? 'fitted curve' : '',
        endpoint_prediction_model: evaluated.projectedAgeToCkdG5 ? c.fitModel : '',
        endpoint_g4_first_date: endpointDate(c.endpoints.observedCkdG4.firstDate),
        endpoint_g4_confirmed_date: endpointDate(c.endpoints.observedCkdG4.confirmedDate),
        endpoint_g4_recovery_date: endpointDate(c.endpoints.observedCkdG4.recoveryDate),
        endpoint_g4_first_value: c.endpoints.observedCkdG4.firstValue ?? '',
        endpoint_g4_confirmed_value: c.endpoints.observedCkdG4.confirmedValue ?? '',
        endpoint_g4_recovery_value: c.endpoints.observedCkdG4.recoveryValue ?? '',
        endpoint_g5_first_date: endpointDate(c.endpoints.observedCkdG5.firstDate),
        endpoint_g5_confirmed_date: endpointDate(c.endpoints.observedCkdG5.confirmedDate),
        endpoint_g5_recovery_date: endpointDate(c.endpoints.observedCkdG5.recoveryDate),
        endpoint_g5_first_value: c.endpoints.observedCkdG5.firstValue ?? '',
        endpoint_g5_confirmed_value: c.endpoints.observedCkdG5.confirmedValue ?? '',
        endpoint_g5_recovery_value: c.endpoints.observedCkdG5.recoveryValue ?? '',
      })
    }
  }
  return out
}
