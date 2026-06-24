import { akiExclusionBands, episodesForSeries, isCreatinineMgdl } from '../aki/akiAware'
import type { AkiEpisode } from '../aki/kdigo'
import type { LabRow, PatientId } from '../types'
import type { AkiModuleSettings, AnalysisModule, AnalysisOverlayContribution, SeriesKey } from './types'

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
  defaultSettings: { showOverlays: false, exclusionDays: 30 },
  apply: (ctx, settings) => {
    const fitInputs = []
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
      fitInputs.push({
        id: `aki-aware:${patientId}:${seriesKey.bezeichnung}:${seriesKey.einheit ?? ''}`,
        patientId,
        seriesKey,
        kind: 'aki-aware' as const,
        exclusionDays: settings.exclusionDays,
        episodes,
      })
      if (settings.showOverlays && episodes.length > 0) {
        overlays.push(...overlaysForEpisodes(patientId, seriesKey, episodes, settings.exclusionDays))
      }
    }

    return { fitInputs, overlays }
  },
}
