/**
 * Peri-event creatinine (issue #69, owner decision 2026-11-21): for every
 * selected event (for example a contrast administration or a cardiac
 * catheterisation) the last serum creatinine value on or before the event
 * day (baseline), the highest value of the window after it, the absolute and
 * relative rise, and whether the KDIGO creatinine criterion is met (rise
 * ≥ 0.3 mg/dl or ≥ 1.5 × baseline). One result per event.
 *
 * Dates are calendar days: imported event dates have no time of day, so the
 * 48-hour window is the two calendar days after the event day and the
 * 72-hour window the three days after it, and a value on the event day is a
 * baseline value. The result is a listing beside AKI detection; it changes
 * no episode, fit, flag or endpoint.
 */
import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../../../types'
import { isExactMeasurement } from '../../../measurements/censored'
import type { ClinicalEvent, DialysisIntent } from '../../../events/events'
import { eventMatchesRule, type AnchorRule } from '../../../cohort/anchorComparison'
import { normaliseUnit } from '../analytes'
import { KDIGO_ABSOLUTE_RISE_MGDL, KDIGO_RELATIVE_RISE_RATIO, KDIGO_THRESHOLD_TOLERANCE, MGDL_PER_UMOLL } from '../constants'
import { isUnderDialysis, largestCreatinineSeries } from './akiAware'

const MS_PER_DAY = 86_400_000

/** Which events are analysed: every event whose title or type equals the
 * value exactly, as for the anchor of the before/after comparison. */
export type PeriEventRule = Extract<AnchorRule, { kind: 'title' | 'type' }>
export const PERI_EVENT_WINDOW_HOURS = [48, 72] as const
export type PeriEventWindowHours = (typeof PERI_EVENT_WINDOW_HOURS)[number]
export const DEFAULT_PERI_EVENT_WINDOW_HOURS: PeriEventWindowHours = 48

export interface PeriEventSettings {
  rule: PeriEventRule
  windowHours: PeriEventWindowHours
}

export type PeriEventStatus = 'met' | 'not_met' | 'not_evaluable'
/** Why an event is not evaluable, in the order they are tested. */
export type PeriEventReason = 'no_creatinine' | 'event_under_dialysis' | 'no_baseline' | 'no_value_in_window'
export type PeriEventCriterion = 'absolute_0_3_mg_dl' | 'relative_1_5x' | 'both'

export interface PeriEventResult {
  patientId: PatientId
  event: ClinicalEvent
  windowHours: PeriEventWindowHours
  /** Last calendar day of the window: event day + windowHours / 24. */
  windowEnd: Date
  /** The serum creatinine series used; null without one. */
  parameter: string | null
  unit: string | null
  /** mg/dl; null without a value on or before the event day. */
  baselineValue: number | null
  baselineDate: Date | null
  /** Whole calendar days from the baseline day to the event day (0 on the event day). */
  baselineDaysBefore: number | null
  /** Values of the baseline day; more than one means the baseline is chosen among them (see `periEventCreatinine`). */
  baselineDayValues: number
  /** Highest value of the window, mg/dl; null without a value in the window. */
  peakValue: number | null
  peakDate: Date | null
  /** Values of the window that were used (outside dialysis). */
  windowValues: number
  /** Values of the window left out because they were measured under dialysis. */
  windowValuesUnderDialysis: number
  /** peak − baseline in mg/dl; null unless both exist. */
  absoluteRise: number | null
  /** peak / baseline; null unless both exist. */
  ratioToBaseline: number | null
  criterion: PeriEventCriterion | null
  status: PeriEventStatus
  reason: PeriEventReason | null
  /** First dialysis event (any intent) other than the event itself whose start lies on the event day or in the window. */
  dialysisStartInWindow: { date: Date; intent: DialysisIntent } | null
  /** Other selected events of the patient whose day lies within windowHours / 24 calendar days of this one, before or after. */
  overlappingEvents: number
}

const dayIndex = (date: Date) => Math.floor(date.getTime() / MS_PER_DAY)
const atLeast = (value: number, threshold: number) => value + KDIGO_THRESHOLD_TOLERANCE >= threshold

interface Value { day: number; date: Date; time: number | undefined; value: number; underDialysis: boolean; order: number }

/** The value of the baseline day that is the baseline: the latest by time of
 * day when every value of the day has one, otherwise (order unknown) the
 * lowest; among values of the same latest time also the lowest. */
function baselineOf(values: readonly Value[]): Value {
  const timed = values.every(v => v.time !== undefined)
  const candidates = timed ? values.filter(v => v.time === Math.max(...values.map(w => w.time!))) : values
  return candidates.reduce((best, v) => v.value < best.value ? v : best)
}

/**
 * Peri-event creatinine for one patient. `rows` are the patient's rows and
 * `events` all of the patient's events (dialysis events decide which values
 * are under dialysis even when they are not selected).
 *
 * - Series: the patient's eligible serum creatinine series (name and unit,
 *   non-serum materials excluded, mg/dl or µmol/l) with the most exact dated
 *   values above zero (the AKI choice for a column that is not creatinine,
 *   applied to the usable rows only); µmol/l is divided by 88.42. Only exact
 *   values above zero count.
 * - Values measured under dialysis (`isUnderDialysis`) are neither baseline
 *   nor peak. An event whose own day is under dialysis is not evaluable.
 * - Baseline: the values of the last calendar day on or before the event day
 *   (`baselineOf` chooses among several). No look-back limit.
 * - Window: the calendar days event + 1 to event + windowHours / 24, both
 *   included. The peak is its highest value, the earliest on a tie.
 * - Criterion: peak − baseline ≥ 0.3 mg/dl or peak / baseline ≥ 1.5, both
 *   inclusive with the KDIGO tolerance of 1e-12. The baseline is always
 *   above zero.
 */
export function periEventCreatinine(rows: readonly LabRow[], events: readonly ClinicalEvent[], settings: PeriEventSettings): PeriEventResult[] {
  const selected = events.filter(event => eventMatchesRule(event, settings.rule))
    .map((event, order) => ({ event, order })).sort((a, b) => a.event.date.getTime() - b.event.date.getTime() || a.order - b.order).map(({ event }) => event)
  if (selected.length === 0) return []
  const windowDays = settings.windowHours / 24
  // The series is chosen among the rows this analysis can use (exact, dated,
  // above zero), so a series of zeros cannot win over a valid one. AKI
  // detection counts its own input; the shared helper is unchanged.
  const series = largestCreatinineSeries(rows.filter(r => r.wertNum !== null && r.wertNum > 0 && r.labDatum !== null && isExactMeasurement(r)))
  const parameter = series[0]?.bezeichnung ?? null
  const unit = series[0] ? series[0].einheit ?? null : null
  const values: Value[] = series.map((r, order) => ({
    day: dayIndex(r.labDatum!), date: r.labDatum!, time: r.labTime, order,
    value: normaliseUnit(r.einheit) === 'µmol/l' ? r.wertNum! / MGDL_PER_UMOLL : r.wertNum!,
    underDialysis: isUnderDialysis(r.labDatum!, events),
  }))
  const usable = values.filter(v => !v.underDialysis)
  return selected.map(event => {
    const day = dayIndex(event.date)
    const before = usable.filter(v => v.day <= day)
    const lastDay = before.length ? Math.max(...before.map(v => v.day)) : null
    const baselineDay = lastDay === null ? [] : before.filter(v => v.day === lastDay)
    const baseline = baselineDay.length ? baselineOf(baselineDay) : null
    const inWindow = (v: Value) => v.day > day && v.day <= day + windowDays
    const window = usable.filter(inWindow).sort((a, b) => a.day - b.day || (a.time ?? -1) - (b.time ?? -1) || a.order - b.order)
    const peak = window.reduce<Value | null>((best, v) => best === null || v.value > best.value ? v : best, null)
    const underDialysis = isUnderDialysis(event.date, events)
    const reason: PeriEventReason | null = values.length === 0 ? 'no_creatinine' : underDialysis ? 'event_under_dialysis'
      : baseline === null ? 'no_baseline' : peak === null ? 'no_value_in_window' : null
    const evaluable = reason === null && baseline !== null && peak !== null
    const absoluteRise = evaluable ? peak.value - baseline.value : null
    const ratioToBaseline = evaluable ? peak.value / baseline.value : null
    const absolute = absoluteRise !== null && atLeast(absoluteRise, KDIGO_ABSOLUTE_RISE_MGDL)
    const relative = ratioToBaseline !== null && atLeast(ratioToBaseline, KDIGO_RELATIVE_RISE_RATIO)
    const dialysis = events.filter(e => e !== event && e.type === 'dialysis' && Number.isFinite(e.date.getTime()) && dayIndex(e.date) >= day && dayIndex(e.date) <= day + windowDays)
      .reduce<ClinicalEvent | null>((first, e) => first === null || dayIndex(e.date) < dayIndex(first.date) ? e : first, null)
    return {
      patientId: event.patientId, event, windowHours: settings.windowHours,
      windowEnd: new Date((day + windowDays) * MS_PER_DAY),
      parameter, unit,
      baselineValue: baseline?.value ?? null, baselineDate: baseline?.date ?? null,
      baselineDaysBefore: baseline ? day - baseline.day : null, baselineDayValues: baselineDay.length,
      peakValue: peak?.value ?? null, peakDate: peak?.date ?? null,
      windowValues: window.length, windowValuesUnderDialysis: values.filter(v => v.underDialysis && inWindow(v)).length,
      absoluteRise, ratioToBaseline,
      criterion: absolute && relative ? 'both' : absolute ? 'absolute_0_3_mg_dl' : relative ? 'relative_1_5x' : null,
      status: !evaluable ? 'not_evaluable' : absolute || relative ? 'met' : 'not_met',
      reason,
      dialysisStartInWindow: dialysis ? { date: dialysis.date, intent: dialysis.intent ?? 'unknown' } : null,
      overlappingEvents: selected.filter(other => other !== event && Math.abs(dayIndex(other.date) - day) <= windowDays).length,
    }
  })
}

/** Peri-event creatinine for every patient with a selected event, ordered by
 * patient, then event date, then the order of the events table. A selected
 * event of a patient without lab rows is listed as not evaluable. */
export function periEventCreatinineRows(rows: readonly LabRow[], events: readonly ClinicalEvent[], settings: PeriEventSettings): PeriEventResult[] {
  const rowsByPatient = new Map<string, LabRow[]>()
  for (const row of rows) { const key = patientIdKey(row.patientId); const bucket = rowsByPatient.get(key); if (bucket) bucket.push(row); else rowsByPatient.set(key, [row]) }
  const eventsByPatient = new Map<string, { id: PatientId; events: ClinicalEvent[] }>()
  for (const event of events) {
    const key = patientIdKey(event.patientId)
    const entry = eventsByPatient.get(key)
    if (entry) entry.events.push(event); else eventsByPatient.set(key, { id: event.patientId, events: [event] })
  }
  return [...eventsByPatient.entries()].sort(([, a], [, b]) => comparePatientIds(a.id, b.id))
    .flatMap(([key, entry]) => periEventCreatinine(rowsByPatient.get(key) ?? [], entry.events, settings))
}

/** Reads a stored setting; null when it is not a valid one. */
export function parsePeriEventSettings(value: unknown): PeriEventSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { rule, windowHours } = value as Record<string, unknown>
  if (typeof rule !== 'object' || rule === null) return null
  const { kind, value: ruleValue } = rule as Record<string, unknown>
  if ((kind !== 'title' && kind !== 'type') || typeof ruleValue !== 'string') return null
  if (!(PERI_EVENT_WINDOW_HOURS as readonly unknown[]).includes(windowHours)) return null
  return { rule: { kind, value: ruleValue }, windowHours: windowHours as PeriEventWindowHours }
}
