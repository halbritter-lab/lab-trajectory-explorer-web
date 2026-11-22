import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../core/types'
import type { ClinicalEvent, DialysisIntent } from '../core/events/events'
import { episodesForSeries, isAkiCreatinineSource } from '../core/domains/nephrology/aki/akiAware'
import { formatDisplayDate, utcDateOrBlank } from '../core/format'

export interface AkiEpisodeRow {
  patientId: PatientId
  /** The serum creatinine series the episode was detected on. */
  parameter: string
  unit: string | null
  stage: number
  onset: Date
  peakDate: Date
  /** mg/dl; µmol/l series are converted before detection. */
  peakValue: number
  baselineDate: Date
  baselineValue: number
  criterion: string
  /** Date of the first value back below the criterion that ended the
   * episode (`AkiEpisode.endDate`); null while the episode is open at the
   * end of the series. */
  endDate: Date | null
  /** The first dialysis of the patient that starts between onset and end,
   * both days included (on or after the onset when the episode has no end),
   * with its intent. It does not change the stage (decided 2026-11-21, K29). */
  dialysis: { start: Date; intent: DialysisIntent } | null
}

const ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' }
export const akiStageLabel = (stage: number) => ROMAN[stage] ?? String(stage)

const CRITERIA: Record<string, string> = {
  absolute_0_3_mg_dl_48h: 'rise ≥ 0.3 mg/dl within 48 hours',
  relative_1_5x_7d: 'rise to ≥ 1.5 times within 7 days',
}
export const akiCriterionLabel = (criterion: string) => CRITERIA[criterion] ?? criterion

/** Episode end as listed: the date, or a note that the episode is still open. */
export const akiEpisodeEndLabel = (episode: Pick<AkiEpisodeRow, 'endDate'>) =>
  episode.endDate ? formatDisplayDate(episode.endDate) : 'open at the last value'
/** Dialysis start as listed: date and intent, or "none". */
export const akiEpisodeDialysisLabel = (episode: Pick<AkiEpisodeRow, 'dialysis'>) =>
  episode.dialysis ? `${formatDisplayDate(episode.dialysis.start)} (${episode.dialysis.intent})` : 'none'

const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

/** The earliest dialysis start between `onset` and `end` (calendar days, both
 * included; no upper bound when `end` is null). On one start date the first
 * event in input order wins. */
export function dialysisStartInEpisode(onset: Date, end: Date | null, events: readonly ClinicalEvent[]): AkiEpisodeRow['dialysis'] {
  let first: ClinicalEvent | null = null
  for (const event of events) {
    if (event.type !== 'dialysis' || !Number.isFinite(event.date.getTime())) continue
    const day = utcDay(event.date)
    if (day < utcDay(onset) || (end !== null && day > utcDay(end))) continue
    if (first === null || day < utcDay(first.date)) first = event
  }
  return first ? { start: first.date, intent: first.intent ?? 'unknown' } : null
}

/** Every detected AKI episode, by patient and onset. Each serum creatinine
 * series detects on itself with the detector the fits and charts use
 * (`episodesForSeries`); series are not pooled, so a patient with two
 * creatinine series can list an episode once per series. A listing only:
 * which episodes a column shows or excludes is decided per column. */
export function akiEpisodeRows(rows: readonly LabRow[], events: readonly ClinicalEvent[]): AkiEpisodeRow[] {
  const byPatient = new Map<PatientId, LabRow[]>()
  // Push into buckets: copying a bucket per row is quadratic in a patient's rows.
  for (const row of rows) { const bucket = byPatient.get(row.patientId); if (bucket) bucket.push(row); else byPatient.set(row.patientId, [row]) }
  const eventsByPatient = new Map<string, ClinicalEvent[]>()
  for (const event of events) { const key = patientIdKey(event.patientId); const bucket = eventsByPatient.get(key); if (bucket) bucket.push(event); else eventsByPatient.set(key, [event]) }
  const out: AkiEpisodeRow[] = []
  for (const patientId of [...byPatient.keys()].sort(comparePatientIds)) {
    const patientRows = byPatient.get(patientId)!
    const series = new Map<string, [string, string | null]>()
    for (const row of patientRows) {
      if (row.bezeichnung !== null && isAkiCreatinineSource(row.bezeichnung, row.einheit)) series.set(JSON.stringify([row.bezeichnung, row.einheit]), [row.bezeichnung, row.einheit])
    }
    const own: AkiEpisodeRow[] = []
    for (const [parameter, unit] of series.values()) {
      const patientEvents = eventsByPatient.get(patientIdKey(patientId)) ?? []
      for (const episode of episodesForSeries(patientRows, patientId, parameter, unit, patientEvents)) {
        own.push({ patientId, parameter, unit, stage: episode.stage, onset: episode.date, peakDate: episode.peakDate, peakValue: episode.peakValue, baselineDate: episode.baselineDate, baselineValue: episode.baselineValue, criterion: episode.criterion,
          endDate: episode.endDate, dialysis: dialysisStartInEpisode(episode.date, episode.endDate, patientEvents) })
      }
    }
    // Stable sort: episodes of two series with one onset keep the series order.
    out.push(...own.sort((a, b) => a.onset.getTime() - b.onset.getTime()))
  }
  return out
}

/** Rows of the workbook's `aki_episodes` sheet. */
export function akiEpisodeExportRows(episodes: readonly AkiEpisodeRow[]) {
  return episodes.map(episode => ({
    PatientID: episode.patientId,
    creatinine_parameter: episode.parameter,
    creatinine_unit: episode.unit ?? '',
    stage: episode.stage,
    onset_date: utcDateOrBlank(episode.onset),
    peak_date: utcDateOrBlank(episode.peakDate),
    peak_value_mg_dl: episode.peakValue,
    baseline_date: utcDateOrBlank(episode.baselineDate),
    baseline_value_mg_dl: episode.baselineValue,
    criterion: episode.criterion,
    end_date: utcDateOrBlank(episode.endDate),
    dialysis_start: episode.dialysis ? `${utcDateOrBlank(episode.dialysis.start)} (${episode.dialysis.intent})` : '',
  }))
}
