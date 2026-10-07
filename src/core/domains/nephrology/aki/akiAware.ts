import type { LabRow, OlsFit, PatientId } from '../../../types'
import { isExactMeasurement } from '../../../measurements/censored'
import type { SeriesPoint } from '../../../stats/series'
import { fitOls } from '../../../stats/ols'
import { datesToYears } from '../../../stats/time'
import { findKdigoAkiEpisodes, type AkiEpisode } from './kdigo'
import { isKdigoCreatinineSeries, normaliseUnit } from '../analytes'
import { DEFAULT_AKI_EXCLUSION_DAYS, MGDL_PER_UMOLL } from '../constants'
import { fixedLengthWindow, type ReasonedExclusionWindow } from '../../../exclusions/windows'
import type { ClinicalEvent } from '../../../events/events'

const MS_PER_DAY = 86_400_000

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
 * episode order: exactly the ranges fitAkiAware drops. */
export function akiExclusionWindows(episodes: readonly AkiEpisode[], exclusionDays: number): ReasonedExclusionWindow<'aki'>[] {
  return episodes.map((episode) => ({ reason: 'aki' as const, ...fixedLengthWindow(episode.date, exclusionDays) }))
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

/** Exact dated serum creatinine values of zero or less. They are ignored by
 * AKI detection and by eGFR derivation; the Data page reports their number. */
export function nonPositiveCreatinineCount(rows: readonly LabRow[]): number {
  return rows.filter((r) => r.bezeichnung !== null && r.labDatum !== null && r.wertNum !== null && r.wertNum <= 0
    && isExactMeasurement(r) && isAkiCreatinineSource(r.bezeichnung, r.einheit)).length
}

/** Episodes for aki-aware fits: an eligible serum creatinine series detects on itself;
 * any other analyte (e.g. computed eGFR) uses the same patient's creatinine
 * series with the most exact dated rows. Names and units are never pooled.
 * Creatinine measured under dialysis (see `isUnderDialysis`; `events` are the
 * patient's clinical events) is left out before detection.
 * Returns [] when no eligible creatinine data exists. */
export function episodesForSeries(rows: LabRow[], patientId: PatientId, bezeichnung: string | null, einheit: string | null, events: readonly ClinicalEvent[] = []): AkiEpisode[] {
  const sub = rows.filter((r) => r.patientId === patientId && r.wertNum !== null && r.labDatum !== null && isExactMeasurement(r))
  let source: LabRow[]
  if (bezeichnung !== null && isAkiCreatinineSource(bezeichnung, einheit)) {
    source = sub.filter((r) => r.bezeichnung === bezeichnung && (r.einheit ?? null) === (einheit ?? null))
  } else {
    const groups = new Map<string, LabRow[]>()
    for (const r of sub) {
      if (r.bezeichnung === null || !isAkiCreatinineSource(r.bezeichnung, r.einheit)) continue
      const k = `${r.bezeichnung}|${r.einheit ?? ''}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    }
    source = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? []
  }
  const points: SeriesPoint[] = source
    .filter((r) => r.wertNum !== null && r.labDatum !== null && isExactMeasurement(r) && !isUnderDialysis(r.labDatum, events))
    .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    .map((r) => ({ date: r.labDatum!, value: normaliseUnit(r.einheit) === 'µmol/l' ? r.wertNum! / MGDL_PER_UMOLL : r.wertNum! }))
  return points.length > 0 ? findKdigoAkiEpisodes(points) : []
}
