import { patientIdKey, type LabRow, type OlsFit, type PatientId } from '../../../types'
import { isExactMeasurement } from '../../../measurements/censored'
import type { SeriesPoint } from '../../../stats/series'
import { fitOls } from '../../../stats/ols'
import { datesToYears } from '../../../stats/time'
import { episodeLastDay, findKdigoAkiEpisodes, type AkiEpisode } from './kdigo'
import { isKdigoCreatinineSeries, normaliseUnit } from '../analytes'
import { DEFAULT_AKI_EXCLUSION_DAYS, DEFAULT_AKI_RECOVERY_HOURS, IMPLAUSIBLE_CREATININE_ABOVE_MGDL, MGDL_PER_UMOLL } from '../constants'
import { applyExclusionWindows, fixedLengthWindow, type ExclusionWindow, type ReasonedExclusionWindow } from '../../../exclusions/windows'
import { balanceSeriesPoints } from '../../../stats/timeBalancing'
import { distinctDateCount } from '../../../stats/time'
import type { TimeBalancing } from '../../../fitPipeline/types'
import type { ClinicalEvent } from '../../../events/events'

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000

export interface DateBand {
  start: Date
  end: Date
}

/** One [episode.date, episode.date + exclusionDays] band per episode, sorted
 * and with overlapping/touching bands merged. Mirrors merge_bands=True in
 * analyses/batch_screening.py:draw_aki_episode_markers. */
export function akiExclusionBands(episodes: AkiEpisode[], exclusionDays: number): DateBand[] {
  const bands = episodes
    .map((e) => ({ start: e.date, end: new Date(e.date.getTime() + exclusionDays * MS_PER_DAY) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: DateBand[] = []
  for (const b of bands) {
    const last = merged[merged.length - 1]
    if (last && b.start.getTime() <= last.end.getTime()) {
      if (b.end.getTime() > last.end.getTime()) last.end = b.end
    } else {
      merged.push({ ...b })
    }
  }
  return merged
}

/** One `[onset, onset + exclusionDays]` window per episode, unmerged and in
 * episode order: the shorter window of the fit exclusion (the fallback of
 * `chooseAkiWindows`) and the ranges fitAkiAware drops. */
export function akiExclusionWindows(episodes: readonly AkiEpisode[], exclusionDays: number): ReasonedExclusionWindow<'aki'>[] {
  return episodes.map((episode) => ({ reason: 'aki' as const, ...fixedLengthWindow(episode.date, exclusionDays) }))
}

/** One `[onset, last day + daysAfterEnd]` window per episode, unmerged and in
 * episode order (decided 2026-11-22, row `akiwin`): the last day is the
 * episode's end date, or for an episode without an observed end the last
 * day of the recovery window of its last value (`episodeLastDay`). */
export function akiEpisodeEndWindows(episodes: readonly AkiEpisode[], daysAfterEnd: number, recoveryHours = DEFAULT_AKI_RECOVERY_HOURS): ReasonedExclusionWindow<'aki'>[] {
  return episodes.map((episode) => akiEndWindow(episode.date, episodeLastDay(episode, recoveryHours * MS_PER_HOUR), daysAfterEnd))
}

/** `[onset, lastDay + daysAfterEnd]`, never shorter than the onset date. */
export function akiEndWindow(onset: Date, lastDay: Date, daysAfterEnd: number): ReasonedExclusionWindow<'aki'> {
  const end = fixedLengthWindow(lastDay, daysAfterEnd).end!
  return { reason: 'aki' as const, start: onset, end: end.getTime() < onset.getTime() ? onset : end }
}

/** Which AKI windows a column applies: `episode_end`, onset to the episode's
 * last day plus the days after the end; `onset_fallback`, the shorter window
 * of the given days from the onset, because the longer one would leave too
 * few values for a reliable fit. */
export type AkiWindowRule = 'episode_end' | 'onset_fallback'

export interface ChosenAkiWindows {
  rule: AkiWindowRule
  windows: ReasonedExclusionWindow<'aki'>[]
  /** Fitted dates and span the longer windows would leave (after censoring,
   * the windows and time balancing). */
  longFittedDates: number
  longFittedSpanDays: number
}

/** Fitted dates and span a fit must keep for the longer AKI windows: the
 * reliability rule of `isUnstableSlope` (3 dates, 365 days). */
export const AKI_LONG_WINDOW_MIN_FITTED_DATES = 3
export const AKI_LONG_WINDOW_MIN_SPAN_DAYS = 365

/** The AKI windows of one column (decided 2026-11-22, row `akiwin`): the
 * windows from each onset to `daysAfterEnd` days after the episode's last
 * day when the fit keeps enough values with them, otherwise the shorter
 * windows of `onsetDays` days from each onset, for every episode of the
 * column alike. "Enough values" is the reliability rule of the slope: the
 * column's exact measurements outside its censoring windows and outside the
 * longer windows, time balanced as the fit is, still have at least three
 * distinct dates spanning at least 365 days. `long` and `short` are the two
 * window sets, aligned with the episodes. */
export function chooseAkiWindows(points: readonly SeriesPoint[], censoring: readonly ExclusionWindow[], long: ReasonedExclusionWindow<'aki'>[], short: ReasonedExclusionWindow<'aki'>[], timeBalancing: TimeBalancing = 'raw'): ChosenAkiWindows {
  const uncensored = applyExclusionWindows(points, censoring).kept
  const kept = balanceSeriesPoints(applyExclusionWindows(uncensored, long).kept, timeBalancing)
  const dates = distinctDateCount(kept)
  const span = kept.length < 2 ? 0 : Math.trunc((kept[kept.length - 1].date.getTime() - kept[0].date.getTime()) / MS_PER_DAY)
  const enough = dates >= AKI_LONG_WINDOW_MIN_FITTED_DATES && span >= AKI_LONG_WINDOW_MIN_SPAN_DAYS
  return { rule: enough || long.length === 0 ? 'episode_end' : 'onset_fallback', windows: enough || long.length === 0 ? long : short, longFittedDates: dates, longFittedSpanDays: span }
}


export interface AkiAwareFit {
  fit: OlsFit
  /** Indices into the date-sorted points that survive the exclusion. */
  keptIdx: number[]
  episodes: AkiEpisode[]
}

/** Port of analyses/methods.py:_aki_aware_segmenter + single-segment OLS:
 * drop observations with episode.date <= t <= episode.date + exclusionDays
 * (the baseline itself is a normal chronic point and stays), then fit one OLS
 * segment over the remainder, years measured from the first kept date.
 * `episodes`: pass precomputed episodes (possibly []) for cross-series
 * detection; undefined runs KDIGO on the points themselves. */
export function fitAkiAware(points: SeriesPoint[], exclusionDays = DEFAULT_AKI_EXCLUSION_DAYS, episodes?: AkiEpisode[]): AkiAwareFit {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const eps = episodes ?? findKdigoAkiEpisodes(sorted)
  const windowMs = exclusionDays * MS_PER_DAY
  const keptIdx: number[] = []
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i].date.getTime()
    const excluded = eps.some((e) => t >= e.date.getTime() && t <= e.date.getTime() + windowMs)
    if (!excluded) keptIdx.push(i)
  }
  const kept = keptIdx.map((i) => sorted[i])
  const fit = fitOls(datesToYears(kept.map((p) => p.date)), kept.map((p) => p.value))
  return { fit, keptIdx, episodes: eps }
}

/** Eligible serum creatinine source for KDIGO detection. */
export const isAkiCreatinineSource = isKdigoCreatinineSeries

const utcDay = (date: Date): number => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
const validDate = (date: Date | null): date is Date => date instanceof Date && Number.isFinite(date.getTime())

/** Whether a creatinine value of this day was measured under dialysis and
 * therefore says nothing about an acute kidney injury (decided 2026-10-07):
 * from the start of a chronic dialysis up to, but not including, the day of
 * the next kidney transplant on or after that start, and inside a dated acute
 * dialysis interval, both boundary days included. Detection continues after
 * transplantation. Dialysis of unknown intent and acute dialysis without an
 * end date exclude nothing. `events` are those of one patient. */
export function isUnderDialysis(date: Date, events: readonly ClinicalEvent[]): boolean {
  const day = utcDay(date)
  const transplants = events.filter((e) => e.type === 'kidney_transplant' && validDate(e.date)).map((e) => utcDay(e.date))
  for (const event of events) {
    if (event.type !== 'dialysis' || !validDate(event.date)) continue
    const start = utcDay(event.date)
    if (event.intent === 'chronic') {
      const end = Math.min(...transplants.filter((t) => t >= start), Infinity)
      if (day >= start && day < end) return true
    } else if (event.intent === 'acute' && validDate(event.endDate)) {
      if (day >= start && day <= utcDay(event.endDate)) return true
    }
  }
  return false
}

/** Whether a day lies in a dated acute dialysis interval (`date` through
 * `endDate`, both included). Its days do not count towards a gap of more
 * than seven days, so an AKI episode continues across the interval (decided
 * 2026-11-22, issue #67). */
export function isInAcuteDialysisInterval(date: Date, events: readonly ClinicalEvent[]): boolean {
  const day = utcDay(date)
  return events.some((e) => e.type === 'dialysis' && e.intent === 'acute' && validDate(e.date) && validDate(e.endDate)
    && day >= utcDay(e.date) && day <= utcDay(e.endDate))
}

/** Exact dated serum creatinine values of zero or less. They are ignored by
 * AKI detection and by eGFR derivation; the Data page reports their number. */
export function nonPositiveCreatinineCount(rows: readonly LabRow[]): number {
  return nonPositiveCreatinineRows(rows).length
}

/** The rows `nonPositiveCreatinineCount` counts, in input order. */
export function nonPositiveCreatinineRows(rows: readonly LabRow[]): LabRow[] {
  return rows.filter((r) => r.bezeichnung !== null && r.labDatum !== null && r.wertNum !== null && r.wertNum <= 0
    && isExactMeasurement(r) && isAkiCreatinineSource(r.bezeichnung, r.einheit))
}

/** Patient-days on which AKI detection cannot order the serum creatinine
 * values of one series: two or more exact positive values on one day of which
 * at least one has no time of day, or of which two share one time of day.
 * Detection compares such values with earlier values only (see
 * `findKdigoAkiEpisodes`); the Data page reports the number. A day counts
 * once per patient, whatever the number of series; values under dialysis are
 * not known here and count. */
export function sameDayUnorderedCreatinine(rows: readonly LabRow[]): { patientDays: number; patients: number } {
  const slots = new Map<string, { untimed: number; times: Map<number, number> }>()
  for (const r of rows) {
    if (r.bezeichnung === null || r.labDatum === null || r.wertNum === null || r.wertNum <= 0
      || !isExactMeasurement(r) || !isAkiCreatinineSource(r.bezeichnung, r.einheit)) continue
    const key = JSON.stringify([patientIdKey(r.patientId), r.labDatum.getTime(), r.bezeichnung, r.einheit ?? null])
    let slot = slots.get(key)
    if (!slot) slots.set(key, (slot = { untimed: 0, times: new Map() }))
    if (r.labTime === undefined) slot.untimed++
    else slot.times.set(r.labTime, (slot.times.get(r.labTime) ?? 0) + 1)
  }
  const days = new Set<string>()
  const patients = new Set<string>()
  for (const [key, { untimed, times }] of slots) {
    const counts = [...times.values()]
    const total = untimed + counts.reduce((sum, n) => sum + n, 0)
    if (total < 2 || (untimed === 0 && counts.every((n) => n === 1))) continue
    const [patient, day] = JSON.parse(key) as [string, number]
    days.add(JSON.stringify([patient, day]))
    patients.add(patient)
  }
  return { patientDays: days.size, patients: patients.size }
}

/** Exact dated serum creatinine values above IMPLAUSIBLE_CREATININE_ABOVE_MGDL
 * (µmol/l converted to mg/dl first), often a µmol/l column labelled mg/dl. The
 * Data page warns about their number; the values are used unchanged. */
export function implausiblyHighCreatinineCount(rows: readonly LabRow[]): number {
  return implausiblyHighCreatinineRows(rows).length
}

/** The rows `implausiblyHighCreatinineCount` counts, in input order. */
export function implausiblyHighCreatinineRows(rows: readonly LabRow[]): LabRow[] {
  return rows.filter((r) => r.bezeichnung !== null && r.labDatum !== null && r.wertNum !== null
    && isExactMeasurement(r) && isAkiCreatinineSource(r.bezeichnung, r.einheit)
    && (normaliseUnit(r.einheit) === 'µmol/l' ? r.wertNum / MGDL_PER_UMOLL : r.wertNum) > IMPLAUSIBLE_CREATININE_ABOVE_MGDL)
}

/** The rows of the eligible serum creatinine series (name and unit) with the
 * most rows among `rows`, which are one patient's exact dated numeric rows;
 * on a tie the series met first in `rows`. Bounds and undated rows are not
 * passed in, so they cannot win the choice. [] without such a series. Used
 * by AKI detection for a column that is neither creatinine nor computed eGFR
 * and by the peri-event creatinine analysis. */
export function largestCreatinineSeries(rows: readonly LabRow[]): LabRow[] {
  const groups = new Map<string, LabRow[]>()
  for (const r of rows) {
    if (r.bezeichnung === null || !isAkiCreatinineSource(r.bezeichnung, r.einheit)) continue
    const k = `${r.bezeichnung}|${r.einheit ?? ''}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  return [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? []
}

/** Episodes for aki-aware fits: an eligible serum creatinine series detects on itself;
 * a derived series (computed eGFR) uses the creatinine series it was computed
 * from (`LabRow.sourceSeries`); any other analyte uses the same patient's
 * creatinine series with the most exact dated rows. Names and units are never pooled.
 * Creatinine measured under dialysis (see `isUnderDialysis`; `events` are the
 * patient's clinical events) is left out before detection; no episode ends on
 * a value whose recovery window holds such a day, and an episode continues
 * across a dated acute dialysis interval (`isInAcuteDialysisInterval`).
 * `recoveryHours` is the recovery that separates two episodes (the AKI
 * module setting, 48 by default); `detection.retrospectiveFall` the
 * module's retrospective option. Returns [] when no eligible creatinine data
 * exists. */
export interface AkiDetectionOptions {
  /** Retrospective detection of an AKI present at the first value of an
   * admission (see `findKdigoAkiEpisodes`; off by default). */
  retrospectiveFall?: boolean
}

export function episodesForSeries(rows: LabRow[], patientId: PatientId, bezeichnung: string | null, einheit: string | null, events: readonly ClinicalEvent[] = [], recoveryHours = DEFAULT_AKI_RECOVERY_HOURS, detection: AkiDetectionOptions = {}): AkiEpisode[] {
  // One pass over the dataset per call; callers pass every patient's rows.
  const own = rows.filter((r) => r.patientId === patientId)
  const sub = own.filter((r) => r.wertNum !== null && r.labDatum !== null && isExactMeasurement(r))
  const sameSeries = (r: LabRow) => r.bezeichnung === bezeichnung && (r.einheit ?? null) === (einheit ?? null)
  let derivedFrom: LabRow['sourceSeries']
  let source: LabRow[]
  if (bezeichnung !== null && isAkiCreatinineSource(bezeichnung, einheit)) {
    source = sub.filter(sameSeries)
  } else if ((derivedFrom = own.find((r) => sameSeries(r) && r.sourceSeries)?.sourceSeries)) {
    source = sub.filter((r) => r.bezeichnung === derivedFrom!.bezeichnung && r.einheit === derivedFrom!.einheit)
  } else {
    source = largestCreatinineSeries(sub)
  }
  const points: SeriesPoint[] = source
    .filter((r) => r.wertNum !== null && r.labDatum !== null && isExactMeasurement(r) && !isUnderDialysis(r.labDatum, events))
    .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    .map((r) => ({ date: r.labDatum!, timeOfDay: r.labTime ?? null, value: normaliseUnit(r.einheit) === 'µmol/l' ? r.wertNum! / MGDL_PER_UMOLL : r.wertNum! }))
  return points.length > 0 ? findKdigoAkiEpisodes(points, { recoveryMs: recoveryHours * MS_PER_HOUR, retrospectiveFall: detection.retrospectiveFall ?? false, blocksRecovery: (date) => isUnderDialysis(date, events), bridgesGap: (date) => isInAcuteDialysisInterval(date, events) }) : []
}
