import type { SeriesPoint } from '../../stats/series'
import type { ClinicalEvent, ClinicalEventEffectInfo } from '../../events/events'
import type { ExclusionReason, FitConfig } from '../../fitPipeline/types'
import { applyExclusionWindows, exclusionReasonsAt, windowContains, type ReasonedExclusionWindow } from '../../exclusions/windows'

/** Reasons a clinical event can remove a measurement from a fit. */
export type ClinicalEventExclusionReason = Exclude<ExclusionReason, 'aki'>

export type ClinicalEventCensoring = FitConfig['censoring']

/**
 * The date range `event` removes from fits under `censoring`, with its
 * reason, or null when the event removes nothing. The single source of truth
 * for event-based exclusion: fit filtering, per-point reasons, the event table
 * and every chart derive from it, so they cannot disagree.
 *
 * Bounds are inclusive. Kidney transplant and chronic dialysis censor from
 * their date on; acute dialysis excludes its dated interval; dialysis of
 * unknown intent follows `unknownDialysisPolicy`. Every option defaults to on
 * (and the unknown-intent policy to the dated interval) when no censoring is
 * configured.
 */
export function clinicalEventExclusionWindow(
  event: ClinicalEvent,
  censoring?: ClinicalEventCensoring,
): ReasonedExclusionWindow<ClinicalEventExclusionReason> | null {
  if (event.type === 'kidney_transplant') {
    return (censoring?.censorAfterKidneyTransplant ?? true) ? { reason: 'post_kidney_transplant', start: event.date, end: null } : null
  }
  if (event.type !== 'dialysis') return null
  if (event.intent === 'chronic') {
    return (censoring?.censorAfterChronicDialysis ?? true) ? { reason: 'post_chronic_dialysis', start: event.date, end: null } : null
  }
  if (event.intent === 'acute') {
    return (censoring?.excludeAcuteDialysisPeriods ?? true) && event.endDate !== null
      ? { reason: 'acute_dialysis', start: event.date, end: event.endDate }
      : null
  }
  if (event.intent === 'unknown') {
    const policy = censoring?.unknownDialysisPolicy ?? 'exclude-dated-interval'
    if (policy === 'censor-from-start') return { reason: 'unknown_dialysis_interval', start: event.date, end: null }
    if (policy === 'exclude-dated-interval' && event.endDate !== null) {
      return { reason: 'unknown_dialysis_interval', start: event.date, end: event.endDate }
    }
  }
  return null
}

/** Exclusion windows of all events that remove anything, in event order. */
export function clinicalEventExclusionWindows(
  events: readonly ClinicalEvent[] = [],
  censoring?: ClinicalEventCensoring,
): ReasonedExclusionWindow<ClinicalEventExclusionReason>[] {
  return events.flatMap((event) => {
    const window = clinicalEventExclusionWindow(event, censoring)
    return window ? [window] : []
  })
}

export interface EventFitExclusionResult {
  points: SeriesPoint[]
  excludedIdx: number[]
}

/** Points outside every event exclusion window, and the indices removed. */
export function filterFitPointsByClinicalEvents(
  points: SeriesPoint[],
  events: ClinicalEvent[] = [],
  censoring?: ClinicalEventCensoring,
): EventFitExclusionResult {
  if (events.length === 0) return { points, excludedIdx: [] }
  const { kept, excludedIdx } = applyExclusionWindows(points, clinicalEventExclusionWindows(events, censoring))
  return { points: kept, excludedIdx }
}

/** Whether the event removes anything from fits under `censoring`. */
export function clinicalEventAffectsFit(event: ClinicalEvent, censoring?: ClinicalEventCensoring): boolean {
  return clinicalEventExclusionWindow(event, censoring) !== null
}

/** Why a measurement on `date` is excluded from the fit by `event` under the
 * given censoring policy, or null when the event does not exclude it. */
export function clinicalEventExclusionReason(
  date: Date,
  event: ClinicalEvent,
  censoring?: ClinicalEventCensoring,
): ClinicalEventExclusionReason | null {
  const window = clinicalEventExclusionWindow(event, censoring)
  return window && windowContains(window, date) ? window.reason : null
}

/** Event-based reasons for a measurement on `date`, without repeats, in event order. */
export function clinicalEventExclusionReasonsAt(
  date: Date,
  events: readonly ClinicalEvent[],
  censoring?: ClinicalEventCensoring,
): ClinicalEventExclusionReason[] {
  return exclusionReasonsAt(date, clinicalEventExclusionWindows(events, censoring))
}

/**
 * What an event does when its censoring option is on (every option enabled,
 * unknown-intent dialysis excluding its dated interval). Derived from
 * `clinicalEventExclusionWindow`, so the event table describes exactly what the
 * fits do.
 */
export function effectForEvent(event: ClinicalEvent): ClinicalEventEffectInfo {
  const window = clinicalEventExclusionWindow(event)
  if (window === null) {
    return event.type === 'other'
      ? { effect: 'display_only', label: 'display only' }
      : { effect: 'warning_no_exclusion', label: 'warning, not excluded from fit' }
  }
  if (window.end === null) {
    return window.reason === 'post_kidney_transplant'
      ? { effect: 'censor_from_date', label: 'censor from event date' }
      : { effect: 'censor_from_date', label: 'censor from dialysis start' }
  }
  return {
    effect: 'exclude_interval',
    label: window.reason === 'unknown_dialysis_interval' ? 'exclude dialysis interval, unknown intent' : 'exclude dialysis interval',
  }
}
