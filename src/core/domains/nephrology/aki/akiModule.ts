import { akiExclusionBands, akiExclusionWindows, episodesForSeries, isCreatinineMgdl } from './akiAware'
import type { AkiEpisode } from './kdigo'
import { DEFAULT_AKI_EXCLUSION_DAYS } from '../constants'
import type { LabRow, PatientId } from '../../../types'
import { windowsWithLength } from '../../../exclusions/windows'
import type {
  AkiModuleSettings,
  AnalysisModule,
  AnalysisOverlayContribution,
  ExclusionWindowContribution,
  SeriesContext,
  SeriesContribution,
  SeriesKey,
} from '../../../analysis/types'

/** Reason recorded for points inside an AKI exclusion window. */
export const AKI_EXCLUSION_REASON = 'aki'

/** The dataset-level AKI fit input of one series: one window per episode,
 * re-anchorable with another length. */
export function akiFitInput(patientId: PatientId, seriesKey: SeriesKey, episodes: readonly AkiEpisode[], exclusionDays: number): ExclusionWindowContribution {
  return {
    kind: 'exclusion-windows',
    id: `aki-aware:${patientId}:${seriesKey.bezeichnung}:${seriesKey.einheit ?? ''}`,
    patientId,
    seriesKey: { bezeichnung: seriesKey.bezeichnung, einheit: seriesKey.einheit ?? null },
    reason: AKI_EXCLUSION_REASON,
    windows: akiExclusionWindows(episodes, exclusionDays).map(({ start, end }) => ({ start, end })),
    lengthDays: exclusionDays,
  }
}

/** Cache key of the creatinine series whose episodes apply to `seriesKey`:
 * a KDIGO creatinine series detects on itself, every other series of the
 * patient shares the patient's creatinine source. */
function episodeSourceKey(patientId: PatientId, seriesKey: SeriesKey): string {
  return isCreatinineMgdl(seriesKey.bezeichnung, seriesKey.einheit)
    ? `${patientId}|${seriesKey.bezeichnung}|${seriesKey.einheit ?? ''}`
    : `${patientId}|creatinine-source`
}

/** AKI episodes shown for and excluded from one series (see episodesForSeries),
 * memoised per patient creatinine source for the duration of a cohort build. */
export function akiEpisodesForSeriesContext(ctx: Pick<SeriesContext, 'patientId' | 'seriesKey' | 'patientRows' | 'cache'>): AkiEpisode[] {
  const key = `aki-episodes:${episodeSourceKey(ctx.patientId, ctx.seriesKey)}`
  const cached = ctx.cache.get(key) as AkiEpisode[] | undefined
  if (cached) return cached
  const episodes = episodesForSeries(ctx.patientRows as LabRow[], ctx.patientId, ctx.seriesKey.bezeichnung, ctx.seriesKey.einheit)
  ctx.cache.set(key, episodes)
  return episodes
}

/** AKI windows of one column: applied when the column's slope mode is
 * 'aki-aware' or its fit configuration excludes AKI windows. The window length
 * is the column's own (legacy spec override, then fit configuration), else the
 * dataset contribution's, else the default. Prepared dataset contributions are
 * used when present; otherwise episodes are detected from the patient's rows. */
function akiSeriesContribution(ctx: SeriesContext): SeriesContribution {
  if (ctx.mode !== 'aki-aware' && !ctx.fitConfig?.exclusions.excludeAkiWindows) return {}
  const prepared = ctx.fitInputs.find((input) => input.kind === 'exclusion-windows' && input.reason === AKI_EXCLUSION_REASON)
  const days = ctx.exclusionDays ?? prepared?.lengthDays ?? ctx.fitConfig?.exclusions.akiExclusionDays ?? DEFAULT_AKI_EXCLUSION_DAYS
  if (prepared) {
    const windows = prepared.lengthDays === undefined ? prepared.windows : windowsWithLength(prepared.windows, days)
    return { exclusions: windows.map((window) => ({ ...window, reason: AKI_EXCLUSION_REASON })) }
  }
  return { exclusions: akiExclusionWindows(akiEpisodesForSeriesContext(ctx), days) }
}

function distinctNumericSeries(rows: LabRow[]): Array<{ patientId: PatientId; seriesKey: SeriesKey }> {
  const seen = new Map<string, { patientId: PatientId; seriesKey: SeriesKey }>()
  for (const r of rows) {
    if (r.bezeichnung === null || r.labDatum === null || r.wertNum === null) continue
    const seriesKey = { bezeichnung: r.bezeichnung, einheit: r.einheit ?? null }
    const key = `${r.patientId}|${seriesKey.bezeichnung}|${seriesKey.einheit ?? ''}`
    if (!seen.has(key)) seen.set(key, { patientId: r.patientId, seriesKey })
  }
  return [...seen.values()]
}

function overlaysForEpisodes(
  patientId: PatientId,
  seriesKey: SeriesKey,
  episodes: AkiEpisode[],
  exclusionDays: number,
): AnalysisOverlayContribution[] {
  const events = episodes.map((episode) => ({
    id: `aki-event:${patientId}:${seriesKey.bezeichnung}:${seriesKey.einheit ?? ''}:${episode.date.toISOString()}`,
    patientId,
    seriesKey,
    kind: 'event' as const,
    label: `AKI stage ${episode.stage}`,
    start: episode.date,
    episode,
  }))
  const bands = akiExclusionBands(episodes, exclusionDays).map((band) => ({
    id: `aki-band:${patientId}:${seriesKey.bezeichnung}:${seriesKey.einheit ?? ''}:${band.start.toISOString()}`,
    patientId,
    seriesKey,
    kind: 'band' as const,
    label: 'AKI exclusion window',
    start: band.start,
    end: band.end,
    band,
  }))
  return [...events, ...bands]
}

export const akiModule: AnalysisModule<AkiModuleSettings> = {
  id: 'aki',
  label: 'AKI',
  defaultSettings: { showOverlays: false, exclusionDays: DEFAULT_AKI_EXCLUSION_DAYS },
  apply: (ctx, settings) => {
    const fitInputs: ExclusionWindowContribution[] = []
    const overlays: AnalysisOverlayContribution[] = []
    const episodeCache = new Map<string, AkiEpisode[]>()

    function episodesForCachedSeries(patientId: PatientId, seriesKey: SeriesKey): AkiEpisode[] {
      const cacheKey = isCreatinineMgdl(seriesKey.bezeichnung, seriesKey.einheit)
        ? `${patientId}|${seriesKey.bezeichnung}|${seriesKey.einheit ?? ''}`
        : `${patientId}|creatinine-source`
      const cached = episodeCache.get(cacheKey)
      if (cached) return cached
      const episodes = episodesForSeries(ctx.rows, patientId, seriesKey.bezeichnung, seriesKey.einheit)
      episodeCache.set(cacheKey, episodes)
      return episodes
    }

    for (const { patientId, seriesKey } of distinctNumericSeries(ctx.rows)) {
      const episodes = episodesForCachedSeries(patientId, seriesKey)
      fitInputs.push(akiFitInput(patientId, seriesKey, episodes, settings.exclusionDays))
      if (settings.showOverlays && episodes.length > 0) {
        overlays.push(...overlaysForEpisodes(patientId, seriesKey, episodes, settings.exclusionDays))
      }
    }

    return { fitInputs, overlays }
  },
  series: akiSeriesContribution,
}
