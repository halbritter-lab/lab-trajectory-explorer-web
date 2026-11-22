import type { SeriesPoint } from '../../stats/series'
import type { ClinicalEvent, ClinicalEventEffectInfo } from '../../events/events'
import type { ClinicalEventCensoringConfig, ExclusionReason } from './fitConfig'
import { applyExclusionWindows, exclusionReasonsAt, windowContains, type ReasonedExclusionWindow } from '../../exclusions/windows'

/** Reasons a clinical event can remove a measurement from a fit. */
export type ClinicalEventExclusionReason = Exclude<ExclusionReason, 'aki'>

export type ClinicalEventCensoring = ClinicalEventCensoringConfig

/**
 * The date range `event` removes from fits under `censoring`, with its
 * reason, or null when the event removes nothing. The single source of truth
 * for event-based exclusion: fit filtering, per-point reasons, the event table
 * and every chart derive from it, so they cannot disagree.
 *
 * Bounds are inclusive. Kidney transplant and chronic dialysis censor from
 * their date on; acute dialysis excludes its dated interval; dialysis of
 * unknown intent follows `unknownDialysisPolicy`. Every option defaults to on
 * (and the unknown-intent policy to `dated-interval-or-from-start`, the policy
 * of CKD progression since 2026-11-22) when no censoring is configured.
 *
 * One event alone: a kidney replacement therapy event whose option is off
 * yields nothing here; `clinicalEventExclusionWindows` adds the window that
 * ends the native-kidney fit at it (see there).
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
    const policy = censoring?.unknownDialysisPolicy ?? 'dated-interval-or-from-start'
    if (policy === 'censor-from-start') return { reason: 'unknown_dialysis_interval', start: event.date, end: null }
    if ((policy === 'exclude-dated-interval' || policy === 'dated-interval-or-from-start') && event.endDate !== null) {
      return { reason: 'unknown_dialysis_interval', start: event.date, end: event.endDate }
    }
    // No end date: the dialysis may be maintenance dialysis, so the values
    // from its start on are left out, with a warning (decision `dial`).
    if (policy === 'dated-interval-or-from-start') return { reason: 'unknown_dialysis_open', start: event.date, end: null }
  }
  return null
}

/** Kidney transplant or chronic dialysis: kidney replacement therapy. */
export function isKrtEvent(event: ClinicalEvent): boolean {
  return event.type === 'kidney_transplant' || (event.type === 'dialysis' && event.intent === 'chronic')
}

/** The patient's first kidney replacement therapy event with a valid date;
 * of several on one date the first in file order. */
export function firstKrtEvent(events: readonly ClinicalEvent[]): ClinicalEvent | null {
  let first: ClinicalEvent | null = null
  for (const event of events) {
    if (!isKrtEvent(event) || !Number.isFinite(event.date.getTime())) continue
    if (first === null || event.date.getTime() < first.date.getTime()) first = event
  }
  return first
}

/**
 * Exclusion windows of all events that remove anything, in event order.
 *
 * Fits of native kidney function never run across kidney replacement therapy
 * (owner decision `censor`, 2026-11-22). When the column includes the values
 * after the patient's first KRT event (its option is off), they are not
 * censored but fitted as a separate segment: a window `krt_segment` from that
 * event on ends the column's own fit, and a later KRT event ends the segment
 * (its own window, whatever its option, OD-50). With every option on, or
 * without a configuration, nothing is added.
 */
export function clinicalEventExclusionWindows(
  events: readonly ClinicalEvent[] = [],
  censoring?: ClinicalEventCensoring,
): ReasonedExclusionWindow<ClinicalEventExclusionReason>[] {
  const windows = events.flatMap((event) => {
    const window = clinicalEventExclusionWindow(event, censoring)
    return window ? [window] : []
  })
  const first = firstKrtEvent(events)
  if (first === null || clinicalEventExclusionWindow(first, censoring) !== null) return windows
  windows.push({ reason: 'krt_segment', start: first.date, end: null })
  for (const event of events) {
    if (!isKrtEvent(event) || !(event.date.getTime() > first.date.getTime()) || clinicalEventExclusionWindow(event, censoring) !== null) continue
    windows.push({ reason: event.type === 'kidney_transplant' ? 'post_kidney_transplant' : 'post_chronic_dialysis', start: event.date, end: null })
  }
  return windows
}

/** The separate segment after kidney replacement therapy a column fits when
 * it includes those values: the first KRT event, or null when the column
 * censors from it (or the patient has none). */
export function krtSegmentEvent(events: readonly ClinicalEvent[] = [], censoring?: ClinicalEventCensoring): ClinicalEvent | null {
  const first = firstKrtEvent(events)
  return first !== null && clinicalEventExclusionWindow(first, censoring) === null ? first : null
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
    if (window.reason === 'post_kidney_transplant') return { effect: 'censor_from_date', label: 'censor from event date' }
    if (window.reason === 'unknown_dialysis_open') return { effect: 'censor_from_date', label: 'censor from dialysis start, unknown intent without end date' }
    return { effect: 'censor_from_date', label: 'censor from dialysis start' }
  }
  return {
    effect: 'exclude_interval',
    label: window.reason === 'unknown_dialysis_interval' ? 'exclude dialysis interval, unknown intent' : 'exclude dialysis interval',
  }
}
