import { akiEndWindow, akiExclusionWindows, chooseAkiWindows, episodesForSeries, isAkiCreatinineSource, type AkiWindowRule, type DateBand } from './akiAware'
import { episodeLastDay, type AkiEpisode } from './kdigo'
import { formatAkiChip, formatAkiEpisodeSummary } from './summary'
import { DEFAULT_AKI_EXCLUSION_DAYS, DEFAULT_AKI_RECOVERY_HOURS, MGDL_PER_UMOLL } from '../constants'
import { akiDaysAfterEnd, excludesAkiWindows } from '../fitConfig'
import { clinicalEventExclusionWindows } from '../censoring'
import { fitValueOf } from '../../../measurements/censored'
import { COMPUTED_BEZEICHNUNG_SUFFIX, normaliseUnit } from '../analytes'
import { patientIdKey, type LabRow, type PatientId } from '../../../types'
import { fixedLengthWindow, windowContains, type ReasonedExclusionWindow } from '../../../exclusions/windows'
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
  /** Retrospective detection of an AKI present at the first value of an
   * admission without a look-back value: a later fall of the admission of
   * at least 0.3 mg/dl or to at most 1/1.5 of the first value (decided
   * 2026-11-22, row `akifirst`; off by default). Dataset-level. */
  retrospectiveFall?: boolean
}

/** The retrospective option of a series context (off without settings). */
export function akiRetrospectiveFall(analysisSettings: Readonly<Record<string, unknown>> | undefined): boolean {
  return (analysisSettings?.aki as Partial<AkiModuleSettings> | undefined)?.retrospectiveFall === true
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
 * re-anchorable with another length, with the last day of each episode from
 * which a column counts its longer window. */
export function akiFitInput(patientId: PatientId, seriesKey: SeriesKey, episodes: readonly AkiEpisode[], exclusionDays: number, recoveryHours = DEFAULT_AKI_RECOVERY_HOURS): ExclusionWindowContribution {
  return {
    kind: 'exclusion-windows',
    id: `aki-aware:${patientId}:${seriesKey.bezeichnung}:${seriesKey.einheit ?? ''}`,
    patientId,
    seriesKey: { bezeichnung: seriesKey.bezeichnung, einheit: seriesKey.einheit ?? null },
    reason: AKI_EXCLUSION_REASON,
    windows: akiExclusionWindows(episodes, exclusionDays).map(({ start, end }) => ({ start, end })),
    lengthDays: exclusionDays,
    lastDays: episodes.map((episode) => episodeLastDay(episode, recoveryHours * 3_600_000)),
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
  const retrospectiveFall = akiRetrospectiveFall(ctx.analysisSettings)
  const key = `aki-episodes:${recoveryHours}:${retrospectiveFall}:${episodeSourceKey(ctx.patientId, ctx.seriesKey)}`
  const cached = ctx.cache.get(key) as AkiEpisode[] | undefined
  if (cached) return cached
  const episodes = episodesForSeries(ctx.patientRows as LabRow[], ctx.patientId, ctx.seriesKey.bezeichnung, ctx.seriesKey.einheit, ctx.events ?? [], recoveryHours, { retrospectiveFall })
  ctx.cache.set(key, episodes)
  return episodes
}

function preparedInput(ctx: SeriesContext): ExclusionWindowContribution | undefined {
  return ctx.fitInputs.find((input) => input.kind === 'exclusion-windows' && input.reason === AKI_EXCLUSION_REASON)
}

/** Length of a column's shorter AKI windows, counted from the onset: the
 * column's own (legacy spec override, then fit configuration), else the
 * dataset contribution's, else the default of 30 days. */
function akiWindowDays(ctx: SeriesContext): number {
  return ctx.exclusionDays ?? ctx.fitConfig?.exclusions.akiExclusionDays ?? preparedInput(ctx)?.lengthDays ?? DEFAULT_AKI_EXCLUSION_DAYS
}

/** The AKI windows of one column and the rule that chose them (decided
 * 2026-11-22, row `akiwin`; see `chooseAkiWindows`). Prepared dataset
 * contributions supply the onsets and last days when present; otherwise the
 * episodes detected for the column. A prepared input without a length holds
 * windows of its own, which are used as they are (`rule` null). The choice
 * is the same whether or not the column excludes the windows, so a band
 * shows what the column would leave out. */
interface ColumnAkiWindows {
  rule: AkiWindowRule | null
  windows: ReasonedExclusionWindow<'aki'>[]
  onsetDays: number
  daysAfterEnd: number
}

function akiColumnWindows(ctx: SeriesContext, episodes: readonly AkiEpisode[]): ColumnAkiWindows {
  const onsetDays = akiWindowDays(ctx)
  const daysAfterEnd = akiDaysAfterEnd(ctx.fitConfig?.exclusions)
  const prepared = preparedInput(ctx)
  if (prepared && prepared.lengthDays === undefined) {
    return { rule: null, windows: prepared.windows.map((window) => ({ ...window, reason: 'aki' as const })), onsetDays, daysAfterEnd }
  }
  const recoveryMs = akiRecoveryHours(ctx.analysisSettings) * 3_600_000
  const anchors = prepared
    ? prepared.windows.map((window, i) => ({ onset: window.start, lastDay: prepared.lastDays?.[i] ?? window.start }))
    : episodes.map((episode) => ({ onset: episode.date, lastDay: episodeLastDay(episode, recoveryMs) }))
  if (anchors.length === 0) return { rule: null, windows: [], onsetDays, daysAfterEnd }
  const long = anchors.map(({ onset, lastDay }) => akiEndWindow(onset, lastDay, daysAfterEnd))
  const short = anchors.map(({ onset }) => ({ reason: 'aki' as const, ...fixedLengthWindow(onset, onsetDays) }))
  const chosen = chooseAkiWindows(fittedColumnPoints(ctx), clinicalEventExclusionWindows(ctx.events, ctx.fitConfig?.censoring), long, short, ctx.fitConfig?.timeBalancing ?? 'raw')
  return { rule: chosen.rule, windows: chosen.windows, onsetDays, daysAfterEnd }
}

/** The column's dated measurements with the values they enter its fit with,
 * oldest first: exact values, and bounds as the column's bounded-value
 * setting says (`fitValueOf`, as in `summarizeByBezeichnung`), so the window
 * choice and `n_aki_excluded` count the points the fit counts. */
function fittedColumnPoints(ctx: SeriesContext): { date: Date; value: number }[] {
  const policy = ctx.fitConfig?.boundedValues
  return (ctx.patientRows as LabRow[])
    .filter((r) => r.bezeichnung === ctx.seriesKey.bezeichnung && (r.einheit ?? null) === (ctx.seriesKey.einheit ?? null) && r.labDatum !== null)
    .flatMap((r) => {
      const value = fitValueOf(r, policy)
      return value === null ? [] : [{ date: r.labDatum!, value }]
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

const dayCount = (days: number) => `${formatDisplayNumber(days)} ${days === 1 ? 'day' : 'days'}`

/** What a column's AKI window covers, for legends, tooltips and notes. */
function windowDescription(windows: ColumnAkiWindows): string {
  if (windows.rule === 'onset_fallback') return `the ${dayCount(windows.onsetDays)} after each onset (shortened: with the window up to ${dayCount(windows.daysAfterEnd)} after the episode end the fit would keep fewer than 3 dates over 365 days)`
  if (windows.rule === 'episode_end') return `from each onset to ${dayCount(windows.daysAfterEnd)} after the end of the episode`
  return 'the windows supplied for this column'
}

/** Merge overlapping or touching windows into drawn bands. */
function bandsOf(windows: readonly { start: Date; end: Date | null }[]): DateBand[] {
  const sorted = windows.map((w) => ({ start: w.start, end: w.end ?? w.start })).sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: DateBand[] = []
  for (const b of sorted) {
    const last = merged[merged.length - 1]
    if (last && b.start.getTime() <= last.end.getTime()) {
      if (b.end.getTime() > last.end.getTime()) last.end = b.end
    } else merged.push({ ...b })
  }
  return merged
}

/** Episode markers at the creatinine peak and merged exclusion bands, shown
 * for every series of the patient (creatinine-derived), whether or not the
 * column excludes them from its fit. */
function akiOverlays(ctx: SeriesContext, episodes: readonly AkiEpisode[], windows: ColumnAkiWindows): SeriesOverlay[] {
  // On the creatinine series the episodes were detected in, the marker belongs
  // to the peak value itself: with several values on the peak day (K26) the
  // first of the day need not be the peak. Episodes are in mg/dl.
  const ownSeries = isAkiCreatinineSource(ctx.seriesKey.bezeichnung, ctx.seriesKey.einheit)
  const inSeriesUnit = (mgDl: number) => normaliseUnit(ctx.seriesKey.einheit) === 'µmol/l' ? mgDl * MGDL_PER_UMOLL : mgDl
  const markers: SeriesOverlay[] = episodes.map((episode) => {
    const stage = ROMAN[episode.stage] ?? episode.stage
    const reference = episode.baselineSource === 'lookback_mean'
      ? `the mean of ${episode.baselineN} ${episode.baselineN === 1 ? 'value' : 'values'} 7 to 365 days before the admission`
      : episode.baselineSource === 'admission_minimum'
        ? `the lowest later value of the admission (${formatDisplayDate(episode.stageReferenceDate)}, retrospective)`
        : 'the lowest value of the 7 days before'
    return {
      kind: 'marker',
      moduleId: AKI_MODULE_ID,
      date: episode.peakDate,
      label: `AKI ${stage}`,
      // The stage must follow from the numbers shown: name the value that set
      // it when that is not the peak, and its reference.
      title: `AKI stage ${stage}, onset ${formatDisplayDate(episode.date)}, creatinine peak ${formatDisplayNumber(episode.peakValue)} mg/dl on ${formatDisplayDate(episode.peakDate)}; staged ${episode.stageDate.getTime() === episode.peakDate.getTime() ? '' : `from ${formatDisplayNumber(episode.stageValue)} mg/dl on ${formatDisplayDate(episode.stageDate)} `}against ${formatDisplayNumber(episode.stageReferenceValue)} mg/dl, ${reference}`,
      snapWithinDays: AKI_MARKER_TOLERANCE_DAYS,
      offMeasurementNote: '; no measurement of this parameter on that date',
      ...(ownSeries ? { value: inSeriesUnit(episode.peakValue) } : {}),
    }
  })
  // Say whether this column leaves its values out of the fit, so the shading
  // is not read as an exclusion where nothing is excluded, nor as the
  // duration of the episode.
  const covers = windowDescription(windows)
  const noFit = ctx.fitConfig?.fitModel === 'none'
  const fitState = noFit
    ? 'this column has no fit, so nothing is excluded'
    : excludesAkiWindows(ctx)
      ? 'values inside are excluded from this fit'
      : 'values inside are not excluded from this fit'
  // A column that leaves AKI windows in its fit ("Acute review", for example)
  // says so in a sentence of its own under the chart (decided 2026-11-22).
  const note = noFit || !excludesAkiWindows(ctx)
    ? `In this column nothing is excluded for AKI${noFit ? ' (it has no fit)' : ''}: the shaded band only shows the window ${covers}.`
    : undefined
  const bands: SeriesOverlay[] = bandsOf(windows.windows).map((band) => ({
    kind: 'band',
    moduleId: AKI_MODULE_ID,
    start: band.start,
    end: band.end,
    title: `AKI window ${formatDisplayDate(band.start)} to ${formatDisplayDate(band.end)} (${Math.round((band.end.getTime() - band.start.getTime()) / MS_PER_DAY)} days): ${covers}, overlapping windows drawn as one. ${fitState.charAt(0).toUpperCase()}${fitState.slice(1)}.`,
    legend: ` Shaded: AKI window, ${covers}; ${fitState}`,
    ...(note === undefined ? {} : { note }),
  }))
  return [...bands, ...markers]
}

/** Export values of a column that excludes AKI windows: the rule and the
 * number of its fitted (exact, or bounded as the column's setting says),
 * uncensored measurements inside a window. */
function akiValues(ctx: SeriesContext, windows: ColumnAkiWindows): Record<string, string | number> | undefined {
  if (!excludesAkiWindows(ctx)) return undefined
  const censoring = clinicalEventExclusionWindows(ctx.events, ctx.fitConfig?.censoring)
  const excluded = fittedColumnPoints(ctx).filter((p) => !censoring.some((w) => windowContains(w, p.date)) && windows.windows.some((w) => windowContains(w, p.date))).length
  const rule = windows.rule === 'episode_end' ? `episode_end_plus_${windows.daysAfterEnd}d` : windows.rule === 'onset_fallback' ? `onset_plus_${windows.onsetDays}d_fallback` : windows.windows.length ? 'supplied' : ''
  return { aki_window: rule, n_aki_excluded: excluded }
}

/** The label of a column whose AKI windows fell back to the shorter length. */
function akiWindowFlag(ctx: SeriesContext, windows: ColumnAkiWindows): CohortFlag[] {
  if (windows.rule !== 'onset_fallback' || !excludesAkiWindows(ctx)) return []
  return [{
    id: `aki-window:${ctx.patientId}:${ctx.seriesKey.bezeichnung}:${ctx.seriesKey.einheit ?? ''}`,
    moduleId: AKI_MODULE_ID,
    patientId: ctx.patientId,
    seriesKey: ctx.seriesKey,
    label: `AKI window ${formatDisplayNumber(windows.onsetDays)} d`,
    title: `AKI windows shortened to ${dayCount(windows.onsetDays)} after each onset: with windows up to ${dayCount(windows.daysAfterEnd)} after the end of each episode the fit would keep fewer than 3 fitted dates over at least 365 days.`,
    tone: 'aki-window',
    severity: 'info',
    requiresFit: true,
  }]
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
  const windows = akiColumnWindows(ctx, episodes)
  const values = akiValues(ctx, windows)
  return {
    // AKI windows applied to one column: when its slope mode is 'aki-aware'
    // or its fit configuration excludes AKI windows.
    exclusions: excludesAkiWindows(ctx) ? windows.windows : undefined,
    overlays: akiOverlays(ctx, episodes, windows),
    flags: [...akiFlags(ctx, episodes), ...akiWindowFlag(ctx, windows)],
    ...(values ? { values } : {}),
  }
}

/** KDIGO AKI from serum creatinine (creatinine criterion only): episode
 * flags, chart overlays, and optional exclusion of the window after each
 * onset from trend fits. */
export const akiModule = {
  id: 'aki' as const,
  label: 'AKI',
  description: 'KDIGO acute kidney injury episodes detected on serum creatinine (mg/dl or µmol/l converted to mg/dl), outside dialysis.',
  defaultSettings: { showOverlays: false, exclusionDays: DEFAULT_AKI_EXCLUSION_DAYS, recoveryHours: DEFAULT_AKI_RECOVERY_HOURS, retrospectiveFall: false } as AkiModuleSettings,
  /** A stored value without `recoveryHours` (saved before 2026-11-22) gets
   * the default of 48 hours; one without `retrospectiveFall` gets false. */
  parseSettings: (value: unknown): AkiModuleSettings | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const settings = value as Record<string, unknown>
    const length = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
    return typeof settings.showOverlays === 'boolean' && length(settings.exclusionDays)
      && (settings.recoveryHours === undefined || length(settings.recoveryHours))
      && (settings.retrospectiveFall === undefined || typeof settings.retrospectiveFall === 'boolean')
      ? { ...(value as AkiModuleSettings), recoveryHours: (settings.recoveryHours as number | undefined) ?? DEFAULT_AKI_RECOVERY_HOURS, retrospectiveFall: (settings.retrospectiveFall as boolean | undefined) ?? false }
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
  exportColumns: [
    { key: 'aki', value: ({ flags }: { flags: readonly CohortFlag[] }) => flags.find((flag) => flag.moduleId === AKI_MODULE_ID && flag.tone === 'aki')?.label ?? '' },
    { key: 'aki_window', value: ({ values }: { values?: Readonly<Record<string, string | number>> }) => values?.aki_window ?? '' },
    { key: 'n_aki_excluded', value: ({ values }: { values?: Readonly<Record<string, string | number>> }) => values?.n_aki_excluded ?? '' },
  ],
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
        episodes = episodesForSeries(rowsByPatient.get(patientId) ?? [], patientId, seriesKey.bezeichnung, seriesKey.einheit, eventsByPatient.get(patientIdKey(patientId)) ?? [], settings.recoveryHours ?? DEFAULT_AKI_RECOVERY_HOURS, { retrospectiveFall: settings.retrospectiveFall === true })
        episodeCache.set(key, episodes)
      }
      fitInputs.push(akiFitInput(patientId, seriesKey, episodes, settings.exclusionDays, settings.recoveryHours ?? DEFAULT_AKI_RECOVERY_HOURS))
    }
    return { fitInputs }
  },
  series: akiSeriesContribution,
} satisfies SettingsModule<AkiModuleSettings, 'aki'>
