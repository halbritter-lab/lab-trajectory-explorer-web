import type { LabRow } from '../types'
import type { SeriesPoint } from '../stats/series'
import type { SlopeMode } from '../stats/summarize'
import { summarizeByBezeichnung } from '../stats/summarize'
import { buildSlopeLines, type LinePoint } from '../stats/slopeLines'
import type { AkiEpisode } from '../aki/kdigo'
import { akiExclusionBands, episodesForSeries, fitAkiAware, type DateBand } from '../aki/akiAware'
import { formatAkiChip, formatAkiEpisodeSummary } from '../aki/summary'

export { formatAkiChip, formatAkiEpisodeSummary }

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
      const summaries = summarizeByBezeichnung(prows, pid, spec.mode, {
        gapDays: spec.gapDays,
        windowDays: spec.windowDays,
        stepDays: spec.stepDays,
        cutoffDays: spec.cutoffDays,
        exclusionDays: spec.exclusionDays,
        eventDates: spec.eventDatesByPatient?.[pid] ?? spec.eventDates,
      })
      const match = summaries.find((s) => s.bezeichnung === spec.bezeichnung && s.einheit === (spec.einheit ?? '(no unit)'))
      const seriesRows = prows
        .filter((r) => r.bezeichnung === spec.bezeichnung && (r.einheit ?? null) === (spec.einheit ?? null) && r.wertNum !== null && r.labDatum !== null)
        .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
      const points: SeriesPoint[] = seriesRows.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
      const exclusionDays = spec.exclusionDays ?? 30
      let episodes: AkiEpisode[] = []
      if (points.length > 0) {
        episodes = episodesForSeries(prows, pid, spec.bezeichnung, spec.einheit ?? null)
      }
      let excludedIdx: number[] = []
      if (spec.mode === 'aki-aware' && points.length > 0) {
        const kept = new Set(fitAkiAware(points, exclusionDays, episodes).keptIdx)
        excludedIdx = points.map((_, i) => i).filter((i) => !kept.has(i))
      }
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
              eventDates: spec.eventDatesByPatient?.[pid] ?? spec.eventDates,
            },
            spec.mode === 'aki-aware' ? episodes : undefined,
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
      }
    })
    return { patientId: pid, cells }
  })
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
}

/** Unit string for a slope: the series unit per year (slopes are value-units
 * per year because the OLS x-axis is fractional years). */
export function slopeUnit(einheit: string | null): string {
  return `${einheit ?? '(no unit)'}/yr`
}

/** KDIGO defines rapid CKD progression as an eGFR decline faster than this many
 * mL/min/1.73m² per year. Used as the default flag threshold (configurable). */
export const RAPID_EGFR_DECLINE_DEFAULT = 5

/** True when the unit is an eGFR unit (mL/min/1.73m²). Matches measured and
 * computed eGFR regardless of spacing/decimal style. */
export function isEgfrUnit(einheit: string | null): boolean {
  return einheit != null && einheit.toLowerCase().includes('ml/min')
}

/** Flag an eGFR series whose per-year slope declines faster than `threshold`
 * (mL/min/1.73m²/yr), i.e. slope < -threshold. threshold <= 0 disables the flag.
 * Only eGFR-unit series qualify; the criterion does not apply to other analytes. */
export function isRapidEgfrDecline(einheit: string | null, slope: number, threshold: number): boolean {
  return threshold > 0 && isEgfrUnit(einheit) && Number.isFinite(slope) && slope < -threshold
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
        rapid_progression: isRapidEgfrDecline(c.einheit, c.slope, rapidThreshold) ? 'yes' : '',
      })
    }
  }
  return out
}
