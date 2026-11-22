import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../core/types'
import type { ClinicalEvent, DialysisIntent } from '../core/events/events'
import { episodesForSeries, isAkiCreatinineSource } from '../core/domains/nephrology/aki/akiAware'
import type { AkiEpisode } from '../core/domains/nephrology/aki/kdigo'
import { DEFAULT_AKI_RECOVERY_HOURS, MAX_AKI_RECOVERY_HOURS } from '../core/domains/nephrology/constants'
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
   * end of the series and when a gap of more than seven days ended it
   * (`endedByGap`): the first value after the gap shows no recovery. */
  endDate: Date | null
  /** The episode ended at the first value after a gap of more than seven
   * days without a value back below the criterion before it. */
  endedByGap: boolean
  /** `AkiEpisode.lastValueDate`: the episode's last value before its end. */
  lastValueDate: Date
  /** The first dialysis of the patient that starts between onset and end,
   * both days included, with its intent (see `dialysisWindowEnd` for an
   * episode without an end and one ended by a gap). It does not change the
   * stage (decided 2026-11-21, K29). */
  dialysis: { start: Date; intent: DialysisIntent } | null
  /** Start of the first acute or unknown-intent dialysis without an end
   * date that starts between onset and `endDate`, both days included. Such a
   * dialysis does not block an end (see `isUnderDialysis`), so creatinine
   * after it can fall through the dialysis rather than recovery; the list
   * says so beside the end (review of 2026-11-22). Null without an end date. */
  endAfterOpenDialysis: Date | null
}

const ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' }
export const akiStageLabel = (stage: number) => ROMAN[stage] ?? String(stage)

const CRITERIA: Record<string, string> = {
  absolute_0_3_mg_dl_48h: 'rise ≥ 0.3 mg/dl within 48 hours',
  relative_1_5x_7d: 'rise to ≥ 1.5 times within 7 days',
}
export const akiCriterionLabel = (criterion: string) => CRITERIA[criterion] ?? criterion

/** Episode end as listed: the date, a note that no end was observed before
 * a gap, or a note that the episode is still open. */
export const akiEpisodeEndLabel = (episode: Pick<AkiEpisodeRow, 'endDate' | 'endedByGap' | 'lastValueDate'> & Partial<Pick<AkiEpisodeRow, 'endAfterOpenDialysis'>>) =>
  episode.endDate ? `${formatDisplayDate(episode.endDate)}${episode.endAfterOpenDialysis ? ` (after dialysis start ${formatDisplayDate(episode.endAfterOpenDialysis)} without end date)` : ''}`
    : episode.endedByGap ? `not observed: no values for more than 7 days after ${formatDisplayDate(episode.lastValueDate)}`
      : 'open at the last value'
/** Dialysis start as listed: date and intent, or "none". */
export const akiEpisodeDialysisLabel = (episode: Pick<AkiEpisodeRow, 'dialysis'>) =>
  episode.dialysis ? `${formatDisplayDate(episode.dialysis.start)} (${episode.dialysis.intent})` : 'none'

/** The recovery length the Data page field applies: whole calendar days,
 * which are all the detector distinguishes (36 hours act as 24), from 0 to
 * `MAX_AKI_RECOVERY_HOURS`. */
export const akiRecoveryFieldHours = (hours: number) => Math.min(MAX_AKI_RECOVERY_HOURS, Math.max(0, Math.floor(hours / 24) * 24))

const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

/** Last day on which a dialysis start counts towards an episode: its end
 * date; for an episode still open at the last value, or one ended by the
 * first value after a gap of more than seven days, the recovery window of
 * its last value before the end (the recovery length after it, two calendar
 * days by default), so that a dialysis months later, after the values stop,
 * is not attributed to it (decided 2026-11-22). */
export function dialysisWindowEnd(episode: Pick<AkiEpisode, 'endDate' | 'endedByGap' | 'lastValueDate'>, recoveryHours = DEFAULT_AKI_RECOVERY_HOURS): Date {
  return episode.endDate !== null && !episode.endedByGap ? episode.endDate : new Date(episode.lastValueDate.getTime() + recoveryHours * 3_600_000)
}

/** The earliest dialysis start between `onset` and `end` (calendar days,
 * both included). On one start date the first event in input order wins. */
export function dialysisStartInEpisode(onset: Date, end: Date, events: readonly ClinicalEvent[]): AkiEpisodeRow['dialysis'] {
  let first: ClinicalEvent | null = null
  for (const event of events) {
    if (event.type !== 'dialysis' || !Number.isFinite(event.date.getTime())) continue
    const day = utcDay(event.date)
    if (day < utcDay(onset) || day > utcDay(end)) continue
    if (first === null || day < utcDay(first.date)) first = event
  }
  return first ? { start: first.date, intent: first.intent ?? 'unknown' } : null
}

/** The first acute or unknown-intent dialysis without an end date that
 * starts between `onset` and `end` (calendar days, both included). */
export function openDialysisStartInEpisode(onset: Date, end: Date | null, events: readonly ClinicalEvent[]): Date | null {
  if (end === null) return null
  const open = events.filter(event => event.type === 'dialysis' && event.intent !== 'chronic' && !(event.endDate instanceof Date && Number.isFinite(event.endDate.getTime())))
  return dialysisStartInEpisode(onset, end, open)?.start ?? null
}

/** Every detected AKI episode, by patient and onset. Each serum creatinine
 * series detects on itself with the detector the fits and charts use
 * (`episodesForSeries`); series are not pooled, so a patient with two
 * creatinine series can list an episode once per series. A listing only:
 * which episodes a column shows or excludes is decided per column.
 * `recoveryHours` is the dataset's AKI module setting. */
export function akiEpisodeRows(rows: readonly LabRow[], events: readonly ClinicalEvent[], recoveryHours = DEFAULT_AKI_RECOVERY_HOURS): AkiEpisodeRow[] {
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
      for (const episode of episodesForSeries(patientRows, patientId, parameter, unit, patientEvents, recoveryHours)) {
        own.push({ patientId, parameter, unit, stage: episode.stage, onset: episode.date, peakDate: episode.peakDate, peakValue: episode.peakValue, baselineDate: episode.baselineDate, baselineValue: episode.baselineValue, criterion: episode.criterion,
          endDate: episode.endedByGap ? null : episode.endDate, endedByGap: episode.endedByGap, lastValueDate: episode.lastValueDate,
          dialysis: dialysisStartInEpisode(episode.date, dialysisWindowEnd(episode, recoveryHours), patientEvents),
          endAfterOpenDialysis: openDialysisStartInEpisode(episode.date, episode.endedByGap ? null : episode.endDate, patientEvents) })
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
    ended_by_gap: episode.endedByGap,
    last_value_date: utcDateOrBlank(episode.lastValueDate),
  }))
}
