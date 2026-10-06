import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../types'
import type { SeriesPoint } from '../stats/series'
import { fitGlobal, fitTheilSen } from '../stats/series'
import type { SlopeMode } from '../stats/summarize'
import { scalarFitModelFor, summarizeByBezeichnung, type SeriesSummary } from '../stats/summarize'
import { buildSlopeLines, type LinePoint } from '../stats/slopeLines'
import type { AnalysisFitInputContribution, CohortFlag, EndpointContext, SeriesOverlay } from '../analysis/types'
import { moduleCellFlags, moduleEndpoints, moduleExportValues, type CellEndpoints, type ColumnModuleSettings } from '../analysis/registry'
import { collectSeriesContributions, seriesContextFor, seriesRowsFor } from './seriesContributions'
import type { EndpointPoint } from '../endpoints/thresholdEndpoints'
import type { ClinicalEvent } from '../events/events'
import { applyExclusionWindows, exclusionReasonsAt } from '../exclusions/windows'
import type { FitConfig } from '../analysis/fitConfig'
import { isUnstableSlope } from '../stats/slopeQuality'
import { groupValueForPatient } from '../grouping/grouping'
import { CENSORED_VALUE_REASON, isExactMeasurement } from '../measurements/censored'
import { filterEndpointPointsForEvents } from '../domains/nephrology/endpoints/endpointEventPolicy'


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
  fitLines: LinePoint[][]
  /** Module badges known before fitting (e.g. AKI episodes). Badges that
   * depend on the fit and a column setting come from cohortCellFlags. */
  flags: CohortFlag[]
  /** Module chart overlays for this cell (e.g. AKI windows and episodes),
   * drawn whether or not the fit excludes them. */
  overlays: SeriesOverlay[]
  excludedIdx: number[]
  /** Reasons each point in `points` is excluded from the fit, aligned by index;
   * an empty array means the point is available to the fit. Non-empty exactly
   * for the indices in `excludedIdx`. Reasons are module codes; see
   * exclusionReasonLabel. */
  pointExclusionReasons: string[][]
  /** Endpoint results of every endpoint module (see CellEndpoints). */
  endpoints: CellEndpoints
}

export interface CohortRow {
  patientId: PatientId
  cells: CohortCell[]
  /** The patient's group value under the active group-by attribute; undefined
   * when grouping is inactive. */
  groupValue?: string
}

/** One CohortRow per patient; one CohortCell per series spec. The slope cell
 * reuses summarizeByBezeichnung (parity-tested); every registered module's
 * series hook adds windows, overlays and flags, and modules with column
 * settings flag the fitted cell. */
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
  // Memo for module series hooks (e.g. AKI episodes per patient creatinine source).
  const cache = new Map<string, unknown>()
  return ids.map((pid) => {
    const prows = byPatient.get(pid) ?? []
    const cells = specs.map((spec): CohortCell => {
      const seriesRows = seriesRowsFor(spec, prows)
      const points: SeriesPoint[] = seriesRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
      const seriesContext = seriesContextFor(spec, pid, prows, cache, points)
      const contributions = collectSeriesContributions(seriesContext)
      const windows = { censoring: contributions.censoring, exclusions: contributions.exclusions }
      const fitEventDates = spec.eventDatesByPatient?.[pid] ?? spec.eventDates ?? windows.censoring.map((window) => window.start)
      const displayName = (name: string | null) => name ?? '(unnamed)'
      const displayUnit = (unit: string | null) => unit ?? '(no unit)'
      const summaries = summarizeByBezeichnung(prows, pid, spec.mode, {
        gapDays: spec.gapDays,
        windowDays: spec.windowDays,
        stepDays: spec.stepDays,
        cutoffDays: spec.cutoffDays,
        eventDates: fitEventDates,
        fitModel: spec.fitConfig?.fitModel,
        timeBalancing: spec.fitConfig?.timeBalancing,
        // Only the spec's own series is read below; windows are resolved for it.
        exclusionWindows: (series) =>
          displayName(series.bezeichnung) === spec.bezeichnung && displayUnit(series.einheit) === displayUnit(spec.einheit ?? null)
            ? windows
            : undefined,
      })
      const match = summaries.find((s) => s.bezeichnung === spec.bezeichnung && s.einheit === (spec.einheit ?? '(no unit)'))
      const allWindows = [...windows.censoring, ...windows.exclusions]
      const excluded = new Set(applyExclusionWindows(points, allWindows).excludedIdx)
      const excludedIdx = points.flatMap((_, i) => excluded.has(i) || !isExactMeasurement(seriesRows[i]) ? [i] : [])
      const pointExclusionReasons = points.map((point, i) =>
        [...(!isExactMeasurement(seriesRows[i]) ? [CENSORED_VALUE_REASON] : []), ...(excluded.has(i) ? exclusionReasonsAt(point.date, allWindows) : [])])
      const fitModel = scalarFitModelFor(spec.mode, spec.fitConfig?.fitModel)
      const endpoints = moduleEndpoints(endpointContext(spec, pid, seriesRows, fitModel))
      const exactPoints = points.filter((_, i) => isExactMeasurement(seriesRows[i]))
      const fitLines = exactPoints.length < 2 || spec.mode === 'rolling'
        ? []
        : buildSlopeLines(
            exactPoints,
            {
              mode: spec.mode,
              gapDays: spec.gapDays ?? 180,
              windowDays: spec.windowDays ?? 730,
              stepDays: spec.stepDays ?? 180,
              cutoffDays: spec.cutoffDays ?? 90,
              eventDates: fitEventDates,
              fitModel: spec.fitConfig?.fitModel,
              timeBalancing: spec.fitConfig?.timeBalancing,
              exclusionWindows: windows,
            },
          )
      const slope = match?.slope ?? Number.NaN
      return {
        bezeichnung: spec.bezeichnung,
        einheit: spec.einheit,
        mode: spec.mode,
        fitModel,
        nNumeric: match?.nNumeric ?? 0,
        nFitted: match?.nFitted ?? match?.nNumeric ?? 0,
        fittedSpanDays: match?.fittedSpanDays ?? 0,
        spanDays: match?.spanDays ?? 0,
        slope,
        r2: match?.r2 ?? Number.NaN,
        ciLow: match?.ciLow ?? Number.NaN,
        ciHigh: match?.ciHigh ?? Number.NaN,
        // A successful fit yields reason === null; only fall back to
        // 'no_numeric_values' when no summary matched this spec at all.
        reason: match ? match.reason : 'no_numeric_values',
        points,
        fitLines,
        flags: contributions.flags,
        overlays: contributions.overlays,
        excludedIdx,
        pointExclusionReasons,
        endpoints,
      }
    })
    const groupValue = attributeName
      ? groupValueForPatient(pid, byPatientAttributes ?? {}, attributeName)
      : undefined
    return { patientId: pid, cells, ...(groupValue !== undefined ? { groupValue } : {}) }
  })
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

/** Endpoint inputs of one cell: exact finite dated measurements before KRT and
 * outside complete acute dialysis intervals, independent of display-fit
 * exclusions and aggregation. The projection fits those same rows. */
function endpointContext(spec: CohortSeriesSpec, patientId: PatientId, seriesRows: LabRow[], scalarFitModel: FitConfig['fitModel']): EndpointContext {
  const events = spec.clinicalEventsByPatient?.[patientIdKey(patientId)] ?? spec.clinicalEvents ?? []
  const endpointRows = filterEndpointPointsForEvents(
    seriesRows.filter(row => isExactMeasurement(row) && Number.isFinite(row.wertNum) && Number.isFinite(row.labDatum!.getTime()))
      .map(row => ({ date: row.labDatum!, value: row.wertNum!, ageYears: null, row })), events,
  ).map(point => point.row)
  const points = (withAges: boolean): EndpointPoint[] => {
    const ageAnchors = withAges ? ageAnchorsFor(endpointRows) : []
    return endpointRows.map(row => ({ date: row.labDatum!, value: row.wertNum!, ageYears: withAges ? ageAtDate(row.labDatum!, ageAnchors) : null }))
  }
  return {
    patientId,
    seriesKey: { bezeichnung: spec.bezeichnung, einheit: spec.einheit ?? null },
    mode: spec.mode,
    fitConfig: spec.fitConfig,
    events,
    hasSeriesMeasurements: seriesRows.length > 0,
    scalarFitModel,
    points,
    fit: () => {
      if (scalarFitModel === 'none') return { slope: Number.NaN, intercept: Number.NaN }
      const all = points(false)
      return scalarFitModel === 'theil-sen' ? fitTheilSen(all) : fitGlobal(all)
    },
  }
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
  // Module columns follow here in registry order: e.g. `aki` (the AKI chip),
  // `rapid_progression` ('yes' for a rapid eGFR decline under the column's
  // threshold) and the CKD endpoint columns (`endpoint_*`).
  [moduleColumn: string]: string | number | undefined
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
  { note: 'Bounds (<x, >x), including bounds on derived eGFR, remain visible and count as raw numeric rows but are excluded from fits, endpoints, AKI detection and mixed models. Exact rows on the same date remain eligible.' },
  { note: 'Observed G4 <30 and G5 <15 use dated exact numeric eGFR measurements before the first kidney transplant or chronic dialysis and outside complete acute dialysis intervals (boundary dates inclusive). KRT is reported separately as kidney failure reached, even without lab-confirmed G5. Confirmation interval is recorded per result.' },
  { note: 'Individual endpoint prediction fits the same endpoint-eligible rows independently of display-fit AKI exclusions and aggregation. Theil-Sen requires three points, uses separate-median intercept and 95% slope confidence bounds; these are not prediction intervals.' },
]

const numOrBlank = (v: number): number | '' => (Number.isNaN(v) ? '' : v)

/** Every badge of a fitted cell: those known before fitting plus those that
 * depend on the fit and the column's module settings (evaluated only for
 * modules the column configures). */
export function cohortCellFlags(cell: CohortCell, patientId: PatientId, columnSettings?: ColumnModuleSettings): CohortFlag[] {
  return [
    ...cell.flags,
    ...moduleCellFlags({ patientId, seriesKey: { bezeichnung: cell.bezeichnung, einheit: cell.einheit ?? null }, slope: cell.slope, fitModel: cell.fitModel }, columnSettings),
  ]
}

/** Column settings for the export: one value for every column, or one per
 * column index. */
export type ExportColumnSettings = ColumnModuleSettings | ((cellIndex: number) => ColumnModuleSettings | undefined)

/** Flatten cohort rows into export records (one per patient × series). Module
 * columns (e.g. the AKI chip and rapid_progression) come from the cell's
 * badges; pass each column's module settings to evaluate badges that depend on
 * them (none are evaluated without settings). `conflictPatientKeys` holds the
 * patientIdKey of every patient whose demographics had to be resolved from
 * contradictory input, so the caveat travels with the exported table. */
export function cohortExportRecords(
  rows: CohortRow[],
  columnSettings?: ExportColumnSettings,
  conflictPatientKeys: ReadonlySet<string> = new Set(),
): CohortExportRecord[] {
  const out: CohortExportRecord[] = []
  for (const r of rows) {
    for (const [cellIndex, c] of r.cells.entries()) {
      const settings = typeof columnSettings === 'function' ? columnSettings(cellIndex) : columnSettings
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
        ...moduleExportValues({ flags: cohortCellFlags(c, r.patientId, settings), endpoints: c.endpoints, fitModel: c.fitModel }),
      })
    }
  }
  return out
}
