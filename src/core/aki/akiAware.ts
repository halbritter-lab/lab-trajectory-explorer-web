import type { LabRow, OlsFit, PatientId } from '../types'
import type { SeriesPoint } from '../stats/series'
import { fitOls } from '../stats/ols'
import { datesToYears } from '../stats/time'
import { findKdigoAkiEpisodes, type AkiEpisode } from './kdigo'

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
export function fitAkiAware(points: SeriesPoint[], exclusionDays = 30, episodes?: AkiEpisode[]): AkiAwareFit {
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

/** Serum creatinine in mg/dl (KDIGO-eligible). Same predicate the cohort
 * screening used; urine series and other units are excluded. */
export function isCreatinineMgdl(bez: string, einheit: string | null): boolean {
  const b = bez.toLowerCase()
  const u = (einheit ?? '').toLowerCase().replace(/μ/g, 'µ')
  const isCreat = (b.includes('kreatinin') || b.includes('creatinin')) && !b.includes('urin') && !b.includes('harn') && !bez.endsWith('UR')
  return isCreat && u === 'mg/dl'
}

/** Episodes for aki-aware fits: a creatinine mg/dl series detects on itself;
 * any other analyte (e.g. computed eGFR) uses the same patient's creatinine
 * mg/dl series with the most rows (cross-series, mirrors the Python
 * aki_creatinine_source). Returns [] when no creatinine mg/dl data exists. */
export function episodesForSeries(rows: LabRow[], patientId: PatientId, bezeichnung: string | null, einheit: string | null): AkiEpisode[] {
  const sub = rows.filter((r) => r.patientId === patientId)
  let source: LabRow[]
  if (bezeichnung !== null && isCreatinineMgdl(bezeichnung, einheit)) {
    source = sub.filter((r) => r.bezeichnung === bezeichnung && (r.einheit ?? null) === (einheit ?? null))
  } else {
    const groups = new Map<string, LabRow[]>()
    for (const r of sub) {
      if (r.bezeichnung === null || !isCreatinineMgdl(r.bezeichnung, r.einheit)) continue
      const k = `${r.bezeichnung}|${r.einheit ?? ''}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    }
    source = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? []
  }
  const points: SeriesPoint[] = source
    .filter((r) => r.wertNum !== null && r.labDatum !== null)
    .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    .map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
  return points.length > 0 ? findKdigoAkiEpisodes(points) : []
}
