import { akiExclusionBands, akiExclusionWindows, episodesForSeries, isCreatinineMgdl } from './akiAware'
import type { AkiEpisode } from './kdigo'
import { formatAkiChip, formatAkiEpisodeSummary } from './summary'
import { DEFAULT_AKI_EXCLUSION_DAYS } from '../constants'
import type { LabRow, PatientId } from '../../../types'
import { windowsWithLength } from '../../../exclusions/windows'
import { formatDisplayDate, formatDisplayNumber } from '../../../format'
import type {
  AnalysisContext,
  AnalysisContribution,
  CohortFlag,
  ExclusionWindowContribution,
  SeriesContext,
  SeriesContribution,
  SeriesKey,
  SeriesOverlay,
  SettingsModule,
} from '../../../analysis/types'

export interface AkiModuleSettings {
  /** Kept so saved workspaces keep loading; the chart's display toggle
   * decides whether AKI overlays are drawn. */
  showOverlays: boolean
  /** Window length of the dataset-level fit inputs; a column's fit
   * configuration may choose its own. */
  exclusionDays: number
}

export const AKI_MODULE_ID = 'aki'
/** Reason recorded for points inside an AKI exclusion window. */
export const AKI_EXCLUSION_REASON = 'aki'

const MS_PER_DAY = 86_400_000
const ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' }
/** A marker sits on this series' measurement when one lies this close to the
 * creatinine peak; otherwise on the time axis. */
export const AKI_MARKER_TOLERANCE_DAYS = 2

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

function preparedInput(ctx: SeriesContext): ExclusionWindowContribution | undefined {
  return ctx.fitInputs.find((input) => input.kind === 'exclusion-windows' && input.reason === AKI_EXCLUSION_REASON)
}

/** AKI windows applied to one column: when its slope mode is 'aki-aware' or
 * its fit configuration excludes AKI windows. The window length is the
 * column's own (legacy spec override, then fit configuration), else the
 * dataset contribution's, else the default. Prepared dataset contributions are
 * used when present; otherwise episodes are detected from the patient's rows. */
function akiExclusions(ctx: SeriesContext): SeriesContribution['exclusions'] {
  if (ctx.mode !== 'aki-aware' && !ctx.fitConfig?.exclusions.excludeAkiWindows) return undefined
  const prepared = preparedInput(ctx)
  const days = ctx.exclusionDays ?? prepared?.lengthDays ?? ctx.fitConfig?.exclusions.akiExclusionDays ?? DEFAULT_AKI_EXCLUSION_DAYS
  if (prepared) {
    const windows = prepared.lengthDays === undefined ? prepared.windows : windowsWithLength(prepared.windows, days)
    return windows.map((window) => ({ ...window, reason: AKI_EXCLUSION_REASON }))
  }
  return akiExclusionWindows(akiEpisodesForSeriesContext(ctx), days)
}

/** Episode markers at the creatinine peak and merged exclusion bands, shown
 * for every series of the patient (creatinine-derived), whether or not the
 * column excludes them from its fit. */
function akiOverlays(ctx: SeriesContext, episodes: readonly AkiEpisode[]): SeriesOverlay[] {
  const bandDays = ctx.exclusionDays ?? preparedInput(ctx)?.lengthDays ?? DEFAULT_AKI_EXCLUSION_DAYS
  const markers: SeriesOverlay[] = episodes.map((episode) => {
    const stage = ROMAN[episode.stage] ?? episode.stage
    return {
      kind: 'marker',
      moduleId: AKI_MODULE_ID,
      date: episode.peakDate,
      label: `AKI ${stage}`,
      title: `AKI stage ${stage} · onset ${formatDisplayDate(episode.date)} · creatinine peak ${formatDisplayNumber(episode.peakValue)} on ${formatDisplayDate(episode.peakDate)} (baseline ${formatDisplayNumber(episode.baselineValue)})`,
      snapWithinDays: AKI_MARKER_TOLERANCE_DAYS,
      offMeasurementNote: ' · no measurement of this parameter on that date',
    }
  })
  const bands: SeriesOverlay[] = akiExclusionBands([...episodes], bandDays).map((band) => ({
    kind: 'band',
    moduleId: AKI_MODULE_ID,
    start: band.start,
    end: band.end,
    title: `AKI window ${formatDisplayDate(band.start)} to ${formatDisplayDate(band.end)} (${Math.round((band.end.getTime() - band.start.getTime()) / MS_PER_DAY)} days)`,
  }))
  return [...bands, ...markers]
}

function akiFlags(ctx: SeriesContext, episodes: readonly AkiEpisode[]): CohortFlag[] {
  const stages = episodes.map((episode) => episode.stage)
  const label = formatAkiChip(stages)
  if (!label) return []
  return [{
    id: `aki:${ctx.patientId}:${ctx.seriesKey.bezeichnung}:${ctx.seriesKey.einheit ?? ''}`,
    moduleId: AKI_MODULE_ID,
    patientId: ctx.patientId,
    seriesKey: ctx.seriesKey,
    label,
    title: formatAkiEpisodeSummary(stages),
    tone: 'aki',
    severity: 'warning',
  }]
}

function akiSeriesContribution(ctx: SeriesContext): SeriesContribution {
  const episodes = ctx.points.length > 0 ? akiEpisodesForSeriesContext(ctx) : []
  return {
    exclusions: akiExclusions(ctx),
    overlays: akiOverlays(ctx, episodes),
    flags: akiFlags(ctx, episodes),
  }
}

/** KDIGO AKI from serum creatinine (creatinine criterion only): episode
 * flags, chart overlays, and optional exclusion of the window after each
 * onset from trend fits. */
export const akiModule = {
  id: 'aki' as const,
  label: 'AKI',
  description: 'KDIGO acute kidney injury episodes detected on serum creatinine (mg/dl).',
  defaultSettings: { showOverlays: false, exclusionDays: DEFAULT_AKI_EXCLUSION_DAYS } as AkiModuleSettings,
  parseSettings: (value: unknown): AkiModuleSettings | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const settings = value as Record<string, unknown>
    return typeof settings.showOverlays === 'boolean'
      && typeof settings.exclusionDays === 'number' && Number.isFinite(settings.exclusionDays) && settings.exclusionDays >= 0
      ? value as AkiModuleSettings
      : null
  },
  exclusionReasonLabels: { [AKI_EXCLUSION_REASON]: 'AKI window' },
  overlayPresentation: {
    toggleLabel: 'AKI windows and episodes',
    color: '#b42318',
    markerLegend: ` AKI episode at the creatinine peak (KDIGO creatinine criterion, automated screening); an open diamond on the time axis marks a peak without a measurement of this parameter within ${AKI_MARKER_TOLERANCE_DAYS} days.`,
    bandLegend: ' Shaded: AKI window after onset',
    emptyLegend: 'No AKI episodes detected for the plotted trajectories.',
    exportContext: (markerCount: number) => `AKI windows and episodes shown (${markerCount} episodes)`,
  },
  exportColumns: [{ key: 'aki', value: ({ flags }: { flags: readonly CohortFlag[] }) => flags.find((flag) => flag.moduleId === AKI_MODULE_ID)?.label ?? '' }],
  apply: (ctx: AnalysisContext, settings: AkiModuleSettings): AnalysisContribution => {
    const fitInputs: ExclusionWindowContribution[] = []
    const episodeCache = new Map<string, AkiEpisode[]>()
    for (const { patientId, seriesKey } of distinctNumericSeries(ctx.rows)) {
      const key = episodeSourceKey(patientId, seriesKey)
      let episodes = episodeCache.get(key)
      if (!episodes) {
        episodes = episodesForSeries(ctx.rows, patientId, seriesKey.bezeichnung, seriesKey.einheit)
        episodeCache.set(key, episodes)
      }
      fitInputs.push(akiFitInput(patientId, seriesKey, episodes, settings.exclusionDays))
    }
    return { fitInputs }
  },
  series: akiSeriesContribution,
} satisfies SettingsModule<AkiModuleSettings, 'aki'>
