import type { PeriEventCriterion, PeriEventReason, PeriEventResult, PeriEventRule } from '../core/domains/nephrology/aki/periEvent'
import { formatDisplayDate, utcDateOrBlank } from '../core/format'
import { countLabel } from './workspace-labels'
import { msg, t, type MessageKey } from '../i18n'

const REASONS: Record<PeriEventReason, MessageKey> = {
  no_creatinine: msg('no serum creatinine values'),
  event_under_dialysis: msg('event day under dialysis'),
  no_baseline: msg('no value on or before the event day'),
  no_value_in_window: msg('no value in the window'),
}
export const periEventReasonLabel = (reason: PeriEventReason) => t(REASONS[reason])

const CRITERIA: Record<PeriEventCriterion, MessageKey> = {
  absolute_0_3_mg_dl: msg('rise ≥ 0.3 mg/dl'),
  relative_1_5x: msg('rise to ≥ 1.5 times baseline'),
  both: msg('rise ≥ 0.3 mg/dl and to ≥ 1.5 times baseline'),
}

/** "Met: rise ≥ 0.3 mg/dl", "Not met" or "Not evaluable: <reason>". */
export function periEventStatusLabel(result: Pick<PeriEventResult, 'status' | 'reason' | 'criterion'>): string {
  if (result.status === 'met') return t('Met: {criterion}', { criterion: t(CRITERIA[result.criterion!]) })
  if (result.status === 'not_met') return t('Not met')
  return t('Not evaluable: {reason}', { reason: periEventReasonLabel(result.reason!) })
}

/** The notes beside a result: overlapping events, dialysis in the window and
 * a baseline chosen among several values of its day; "–" without any. */
export function periEventNotes(result: PeriEventResult): string {
  const days = result.windowHours / 24
  const notes = [
    result.overlappingEvents > 0 ? t('{events} within {days} days', { events: countLabel(result.overlappingEvents, 'other selected event'), days }) : '',
    result.dialysisStartInWindow ? t('dialysis start {date} ({intent})', { date: formatDisplayDate(result.dialysisStartInWindow.date), intent: result.dialysisStartInWindow.intent }) : '',
    result.windowValuesUnderDialysis > 0 ? t('{values} under dialysis left out', { values: countLabel(result.windowValuesUnderDialysis, 'value') }) : '',
    result.baselineDayValues > 1 ? t('baseline chosen among {n} values of its day', { n: result.baselineDayValues }) : '',
  ].filter(Boolean)
  return notes.length ? notes.join('; ') : '–'
}

export const periEventRuleValue = (rule: PeriEventRule) => `${rule.kind}:${rule.value}`
export function periEventRuleFromValue(value: string): PeriEventRule | null {
  if (value.startsWith('title:')) return { kind: 'title', value: value.slice('title:'.length) }
  if (value.startsWith('type:')) return { kind: 'type', value: value.slice('type:'.length) }
  return null
}

export const PERI_EVENT_SHEET_HEADER = ['PatientID', 'event_date', 'event_type', 'event_title', 'event_rule', 'window_hours', 'window_end_date',
  'creatinine_parameter', 'creatinine_unit', 'baseline_date', 'baseline_value_mg_dl', 'baseline_days_before_event', 'n_baseline_day_values',
  'peak_date', 'peak_value_mg_dl', 'n_window_values', 'absolute_rise_mg_dl', 'ratio_to_baseline', 'criterion_met', 'criterion', 'status', 'reason',
  'dialysis_start_in_window', 'n_window_values_under_dialysis', 'overlapping_events'] as const

/** Rows of the workbook's `peri_event_creatinine` sheet, one per event. */
export function periEventExportRows(results: readonly PeriEventResult[], rule: PeriEventRule | null) {
  return results.map(result => ({
    PatientID: result.patientId,
    event_date: utcDateOrBlank(result.event.date),
    event_type: result.event.type,
    event_title: result.event.title,
    event_rule: rule ? periEventRuleValue(rule) : '',
    window_hours: result.windowHours,
    window_end_date: utcDateOrBlank(result.windowEnd),
    creatinine_parameter: result.parameter ?? '',
    creatinine_unit: result.unit ?? '',
    baseline_date: utcDateOrBlank(result.baselineDate),
    baseline_value_mg_dl: result.baselineValue,
    baseline_days_before_event: result.baselineDaysBefore,
    n_baseline_day_values: result.baselineDayValues,
    peak_date: utcDateOrBlank(result.peakDate),
    peak_value_mg_dl: result.peakValue,
    n_window_values: result.windowValues,
    absolute_rise_mg_dl: result.absoluteRise,
    ratio_to_baseline: result.ratioToBaseline,
    criterion_met: result.status === 'not_evaluable' ? null : result.status === 'met',
    criterion: result.criterion ?? '',
    status: result.status,
    reason: result.reason ?? '',
    dialysis_start_in_window: result.dialysisStartInWindow ? `${utcDateOrBlank(result.dialysisStartInWindow.date)} (${result.dialysisStartInWindow.intent})` : '',
    n_window_values_under_dialysis: result.windowValuesUnderDialysis,
    overlapping_events: result.overlappingEvents,
  }))
}
