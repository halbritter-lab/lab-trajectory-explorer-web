import { akiExclusionBands, akiExclusionWindows, episodesForSeries, isAkiCreatinineSource } from './akiAware'
import type { AkiEpisode } from './kdigo'
import { formatAkiChip, formatAkiEpisodeSummary } from './summary'
import { parsePeriEventSettings, type PeriEventSettings } from './periEvent'
import { DEFAULT_AKI_EXCLUSION_DAYS, DEFAULT_AKI_RECOVERY_HOURS, MGDL_PER_UMOLL } from '../constants'
import { excludesAkiWindows } from '../fitConfig'
import { COMPUTED_BEZEICHNUNG_SUFFIX, normaliseUnit } from '../analytes'
import { patientIdKey, type LabRow, type PatientId } from '../../../types'
import { windowsWithLength } from '../../../exclusions/windows'
import type { ClinicalEvent } from '../../../events/events'
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
  /** Recovery that separates two AKI episodes, in hours counted as calendar
   * days (48 by default, decided 2026-11-22, issue #67). Dataset-level: it
   * decides the episodes of every column, the episode list and its export. */
  recoveryHours: number
  /** Events selected for the peri-event creatinine analysis and its window
   * (issue #69, decided 2026-11-21). Dataset-level; absent while no events
   * are selected. It changes no episode, fit or flag. */
  periEvent?: PeriEventSettings
}

/** The dataset's peri-event creatinine setting; null while none is chosen. */
export function akiPeriEventSettings(analysisSettings: Readonly<Record<string, unknown>> | undefined): PeriEventSettings | null {
  return parsePeriEventSettings((analysisSettings?.aki as Partial<AkiModuleSettings> | undefined)?.periEvent)
}

/** The recovery length of a series context: the dataset's AKI module
 * setting, the default when the caller gave no settings. */
export function akiRecoveryHours(analysisSettings: Readonly<Record<string, unknown>> | undefined): number {
  const hours = (analysisSettings?.aki as Partial<AkiModuleSettings> | undefined)?.recoveryHours
  return typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_AKI_RECOVERY_HOURS
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
 * a KDIGO creatinine series detects on itself, a computed eGFR series on the
 * series it was computed from, every other series of the patient shares the
 * patient's creatinine source. */
function episodeSourceKey(patientId: PatientId, seriesKey: SeriesKey): string {
  return isAkiCreatinineSource(seriesKey.bezeichnung, seriesKey.einheit) || seriesKey.bezeichnung.endsWith(COMPUTED_BEZEICHNUNG_SUFFIX)
    ? `${patientId}|${seriesKey.bezeichnung}|${seriesKey.einheit ?? ''}`
    : `${patientId}|creatinine-source`
}

/** AKI episodes shown for and excluded from one series (see episodesForSeries),
 * memoised per patient creatinine source for the duration of a cohort build. */
export function akiEpisodesForSeriesContext(ctx: Pick<SeriesContext, 'patientId' | 'seriesKey' | 'patientRows' | 'cache'> & Partial<Pick<SeriesContext, 'events' | 'analysisSettings'>>): AkiEpisode[] {
  const recoveryHours = akiRecoveryHours(ctx.analysisSettings)
  const key = `aki-episodes:${recoveryHours}:${episodeSourceKey(ctx.patientId, ctx.seriesKey)}`
  const cached = ctx.cache.get(key) as AkiEpisode[] | undefined
  if (cached) return cached
  const episodes = episodesForSeries(ctx.patientRows as LabRow[], ctx.patientId, ctx.seriesKey.bezeichnung, ctx.seriesKey.einheit, ctx.events ?? [], recoveryHours)
  ctx.cache.set(key, episodes)
  return episodes
}

function preparedInput(ctx: SeriesContext): ExclusionWindowContribution | undefined {
  return ctx.fitInputs.find((input) => input.kind === 'exclusion-windows' && input.reason === AKI_EXCLUSION_REASON)
}

/** Length of a column's AKI windows: the column's own (legacy spec override,
 * then fit configuration), else the dataset contribution's, else the default.
 * The same length shapes the excluded windows and the drawn bands. */
function akiWindowDays(ctx: SeriesContext): number {
  return ctx.exclusionDays ?? ctx.fitConfig?.exclusions.akiExclusionDays ?? preparedInput(ctx)?.lengthDays ?? DEFAULT_AKI_EXCLUSION_DAYS
}

/** AKI windows applied to one column: when its slope mode is 'aki-aware' or
 * its fit configuration excludes AKI windows. Prepared dataset contributions
 * are used when present; otherwise episodes are detected from the patient's
 * rows. */
function akiExclusions(ctx: SeriesContext): SeriesContribution['exclusions'] {
  if (!excludesAkiWindows(ctx)) return undefined
  const prepared = preparedInput(ctx)
  const days = akiWindowDays(ctx)
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
  const bandDays = akiWindowDays(ctx)
  // On the creatinine series the episodes were detected in, the marker belongs
  // to the peak value itself: with several values on the peak day (K26) the
  // first of the day need not be the peak. Episodes are in mg/dl.
  const ownSeries = isAkiCreatinineSource(ctx.seriesKey.bezeichnung, ctx.seriesKey.einheit)
  const inSeriesUnit = (mgDl: number) => normaliseUnit(ctx.seriesKey.einheit) === 'µmol/l' ? mgDl * MGDL_PER_UMOLL : mgDl
  const markers: SeriesOverlay[] = episodes.map((episode) => {
    const stage = ROMAN[episode.stage] ?? episode.stage
    return {
      kind: 'marker',
      moduleId: AKI_MODULE_ID,
      date: episode.peakDate,
      label: `AKI ${stage}`,
      // The stage must follow from the numbers shown: name the value that set
      // it when that is not the peak, and its seven-day reference.
      title: `AKI stage ${stage}, onset ${formatDisplayDate(episode.date)}, creatinine peak ${formatDisplayNumber(episode.peakValue)} mg/dl on ${formatDisplayDate(episode.peakDate)}; staged ${episode.stageDate.getTime() === episode.peakDate.getTime() ? '' : `from ${formatDisplayNumber(episode.stageValue)} mg/dl on ${formatDisplayDate(episode.stageDate)} `}against ${formatDisplayNumber(episode.stageReferenceValue)} mg/dl, the lowest value of the 7 days before`,
      snapWithinDays: AKI_MARKER_TOLERANCE_DAYS,
      offMeasurementNote: '; no measurement of this parameter on that date',
      ...(ownSeries ? { value: inSeriesUnit(episode.peakValue) } : {}),
    }
  })
  // The band has the configured length in every column. Say whether this
  // column leaves its values out of the fit, so the shading is not read as an
  // exclusion where nothing is excluded, nor as the duration of the episode.
  const length = `${formatDisplayNumber(bandDays)} ${bandDays === 1 ? 'day' : 'days'}`
  const noFit = ctx.fitConfig?.fitModel === 'none'
  const fitState = noFit
    ? 'this column has no fit, so nothing is excluded'
    : excludesAkiWindows(ctx)
      ? 'values inside are excluded from this fit'
      : 'values inside are not excluded from this fit'
  // A column that leaves AKI windows in its fit ("Acute review", for example)
  // says so in a sentence of its own under the chart (decided 2026-11-22).
  const note = noFit || !excludesAkiWindows(ctx)
    ? `In this column nothing is excluded for AKI${noFit ? ' (it has no fit)' : ''}: the shaded band only shows the configured ${length} after each onset.`
    : undefined
  const bands: SeriesOverlay[] = akiExclusionBands([...episodes], bandDays).map((band) => ({
    kind: 'band',
    moduleId: AKI_MODULE_ID,
    start: band.start,
    end: band.end,
    title: `AKI window ${formatDisplayDate(band.start)} to ${formatDisplayDate(band.end)} (${Math.round((band.end.getTime() - band.start.getTime()) / MS_PER_DAY)} days): the configured ${length} after each onset, overlapping windows drawn as one; not the duration of the episode. ${fitState.charAt(0).toUpperCase()}${fitState.slice(1)}.`,
    legend: ` Shaded: AKI window, the configured ${length} after each onset (not the duration of the episode); ${fitState}`,
    ...(note === undefined ? {} : { note }),
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
  description: 'KDIGO acute kidney injury episodes detected on serum creatinine (mg/dl or µmol/l converted to mg/dl), outside dialysis.',
  defaultSettings: { showOverlays: false, exclusionDays: DEFAULT_AKI_EXCLUSION_DAYS, recoveryHours: DEFAULT_AKI_RECOVERY_HOURS } as AkiModuleSettings,
  /** A stored value without `recoveryHours` (saved before 2026-11-22) gets
   * the default of 48 hours. A peri-event setting that cannot be read is
   * dropped (no events selected) rather than making the settings unreadable. */
  parseSettings: (value: unknown): AkiModuleSettings | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const settings = value as Record<string, unknown>
    const length = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
    if (!(typeof settings.showOverlays === 'boolean' && length(settings.exclusionDays)
      && (settings.recoveryHours === undefined || length(settings.recoveryHours)))) return null
    const { periEvent: _stored, ...rest } = value as AkiModuleSettings
    const periEvent = parsePeriEventSettings(settings.periEvent)
    return { ...rest, recoveryHours: (settings.recoveryHours as number | undefined) ?? DEFAULT_AKI_RECOVERY_HOURS, ...(periEvent ? { periEvent } : {}) }
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
    const eventsByPatient = new Map<string, ClinicalEvent[]>()
    for (const event of ctx.events) {
      const key = patientIdKey(event.patientId)
      eventsByPatient.set(key, [...(eventsByPatient.get(key) ?? []), event])
    }
    // Bucket once: detection per series must not rescan every patient's rows.
    const rowsByPatient = new Map<PatientId, LabRow[]>()
    for (const row of ctx.rows) {
      const bucket = rowsByPatient.get(row.patientId)
      if (bucket) bucket.push(row)
      else rowsByPatient.set(row.patientId, [row])
    }
    for (const { patientId, seriesKey } of distinctNumericSeries(ctx.rows)) {
      const key = episodeSourceKey(patientId, seriesKey)
      let episodes = episodeCache.get(key)
      if (!episodes) {
        episodes = episodesForSeries(rowsByPatient.get(patientId) ?? [], patientId, seriesKey.bezeichnung, seriesKey.einheit, eventsByPatient.get(patientIdKey(patientId)) ?? [], settings.recoveryHours ?? DEFAULT_AKI_RECOVERY_HOURS)
        episodeCache.set(key, episodes)
      }
      fitInputs.push(akiFitInput(patientId, seriesKey, episodes, settings.exclusionDays))
    }
    return { fitInputs }
  },
  series: akiSeriesContribution,
} satisfies SettingsModule<AkiModuleSettings, 'aki'>
