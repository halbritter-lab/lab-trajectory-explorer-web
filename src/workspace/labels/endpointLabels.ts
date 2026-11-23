import type { CkdEndpoints } from '../../core/domains/nephrology/endpoints/ckdEndpoints'
import { projectedG5Label, qualityLabelText } from './qualityLabels'
import { msg, t } from '../../i18n'

/** The endpoint results a table cell can show as badges. Which are shown is a
 * view setting (`TrajectoryView.hiddenEndpointBadges`, decided 2026-11-22,
 * `badges`); the export keeps every result. */
export const ENDPOINT_BADGES = [
  { id: 'percentChange', label: msg('Total eGFR change') },
  { id: 'kidneyFailure', label: msg('Kidney failure reached') },
  { id: 'ckdG4', label: msg('CKD G4 (and recovery)') },
  { id: 'ckdG5', label: msg('CKD G5 (and recovery)') },
  { id: 'g5Single', label: msg('Single value <15, unconfirmed') },
  { id: 'decline40', label: msg('40% decline') },
  { id: 'decline50', label: msg('50% decline') },
  { id: 'decline57', label: msg('57% decline') },
  { id: 'projection', label: msg('Extrapolation to CKD G5') },
] as const
export type EndpointBadgeId = typeof ENDPOINT_BADGES[number]['id']
export const ENDPOINT_BADGE_IDS: readonly EndpointBadgeId[] = ENDPOINT_BADGES.map(badge => badge.id)

/** Label of an unconfirmed single value below 15 (decided 2026-11-22, `g5single`). */
export const g5SingleUnconfirmedLabel = () => t('single value <15, unconfirmed (possible AKI)')

/** Endpoint badge copy for the trajectory table and exports; dates come from the result.
 * Percent change uses endpoint-eligible measurements, not the display fit, but needs two of
 * them: with one, baseline and latest coincide and "0%" would read as stable.
 * `hidden` leaves the named badges out of the label and the detail text. */
export function endpointBadge(endpoints: CkdEndpoints, measurementCount: number, hidden: ReadonlySet<string> = new Set()): { label: string; title: string } | null {
  const labels: string[] = []
  const details: string[] = []
  const shown = (id: EndpointBadgeId) => !hidden.has(id)
  const decline = endpoints.percentDecline.value
  if (shown('percentChange') && decline !== null && endpoints.endpointPointCount >= 2 && measurementCount >= 2) {
    const change = -decline
    labels.push(`${change > 0 ? '+' : ''}${change.toFixed(0)}%`)
    details.push(t('total eGFR change {change}% from first to latest eligible measurement (not per year)', { change: change.toFixed(1) }))
    // A total fall of 40 % without the event badge otherwise looks like a missing badge.
    if (decline >= 40 && !endpoints.observedDecline40.met) details.push(t('this is not a confirmed 40% decline event: that event is measured from the baseline (mean of the first 90 days{baseline}) and needs a confirming measurement at least {days} days and at most 12 months later', { baseline: endpoints.declineBaselineValue !== null ? `, ${endpoints.declineBaselineValue.toFixed(1)}` : '', days: endpoints.confirmationDays }))
  }
  if (shown('kidneyFailure') && endpoints.kidneyFailureReached) {
    const event = endpoints.kidneyFailureReached
    const type = event.type === 'kidney_transplant' ? t('kidney transplant') : t('chronic dialysis')
    labels.push(t('Kidney failure reached ({type}, {date})', { type, date: event.date.toISOString().slice(0, 10) }))
    details.push(t('kidney failure reached: {type} on {date}; distinct from lab-confirmed CKD G5', { type, date: event.date.toISOString().slice(0, 10) }))
  }
  for (const [stage, event] of [['G4', endpoints.observedCkdG4], ['G5', endpoints.observedCkdG5]] as const) {
    if (!event?.met || !shown(stage === 'G4' ? 'ckdG4' : 'ckdG5')) continue
    labels.push(`CKD ${stage}`)
    details.push(t('observed CKD {stage}: event {first} ({firstValue}), confirmed {confirmed} ({confirmedValue}); minimum {days} days, maximum 12 calendar months', { stage, first: event.firstDate?.toISOString().slice(0, 10) ?? '', firstValue: event.firstValue ?? '', confirmed: event.confirmedDate?.toISOString().slice(0, 10) ?? '', confirmedValue: event.confirmedValue ?? '', days: endpoints.confirmationDays }))
    if (event.recoveryDate) {
      labels.push(t('{stage} recovery', { stage }))
      details.push(t('{stage} recovery {date} ({value}); confirmed event retained', { stage, date: event.recoveryDate.toISOString().slice(0, 10), value: event.recoveryValue ?? '' }))
    }
  }
  if (shown('g5Single') && endpoints.g5SingleUnconfirmed) {
    labels.push(g5SingleUnconfirmedLabel())
    details.push(`${g5SingleUnconfirmedLabel()}: ${t('an eligible eGFR value below 15 without a low value on the dates directly before and after it. It is not an observed CKD G5, because chronicity is not assumed from a single value (KDIGO 2024), and it can reflect an acute kidney injury. It does not withhold the extrapolation')}`)
  }
  for (const [threshold, event, id] of [[40, endpoints.observedDecline40, 'decline40'], [50, endpoints.observedDecline50, 'decline50'], [57, endpoints.observedDecline57, 'decline57']] as const) {
    if (!event?.met || !shown(id)) continue
    labels.push(t('{threshold}% decline', { threshold }))
    details.push(t('confirmed {threshold}% eGFR decline: baseline {baseline}{aki}; event {first} ({firstValue}), confirmed {confirmed} ({confirmedValue}); minimum {days} days, maximum 12 calendar months', { threshold, baseline: String(endpoints.declineBaselineValue), aki: endpoints.inputExcludesAkiWindows ? ` ${t('(AKI exclusion windows left out)')}` : '', first: event.firstDate?.toISOString().slice(0, 10) ?? '', firstValue: event.firstValue ?? '', confirmed: event.confirmedDate?.toISOString().slice(0, 10) ?? '', confirmedValue: event.confirmedValue ?? '', days: endpoints.confirmationDays }))
    if (event.recoveryDate) details.push(t('{threshold}% decline recovery {date} ({value}); confirmed event retained', { threshold, date: event.recoveryDate.toISOString().slice(0, 10), value: event.recoveryValue ?? '' }))
  }
  // observedCkdG5.met is false both without an event and with the observed
  // endpoint switched off; projectedG5Label tells the two apart.
  if (!endpoints.observedCkdG5.met && shown('projection')) {
    if (endpoints.projectedAgeToCkdG5.value !== null) {
      const age = endpoints.projectedAgeToCkdG5.value
      // Whole years on either age basis (decided 2026-11-16): the projection has
      // no interval, so a decimal would claim a precision it does not have. The
      // export keeps the unrounded value.
      const exact = endpoints.projectedAgeToCkdG5.ageBasis === 'birth_date'
      labels.push(t('G5 @ ~{age}y', { age: Math.round(age) }))
      details.push(t('conditional extrapolation of the fitted trend, not a prognosis: the fitted line reaches CKD G5 at about {age} years of age{basis}; fitted curve using endpoint-eligible dated exact numeric measurements ({excluded} excluded)', { age: Math.round(age), basis: exact ? ` ${t('(the projection has no interval; the export holds the unrounded value)')}` : ` ${t('(no birth date: counted from the age in completed years, so the true value can be up to one year higher)')}`, excluded: endpoints.inputExcludesAkiWindows ? t('bounds, AKI exclusion windows and kidney replacement therapy/acute dialysis periods') : t('bounds and kidney replacement therapy/acute dialysis periods') }))
    } else if (measurementCount > 0 || endpoints.projectedAgeToCkdG5.reason !== 'insufficient_points') {
      // A cell without any measurement already says so; "G5 < 3 dates" would only add noise.
      const unavailable = projectedG5Label(endpoints)
      if (unavailable) { labels.push(qualityLabelText(unavailable.label)); details.push(unavailable.title) }
    }
  }
  // Details contain semicolons themselves, so each one becomes its own sentence.
  return labels.length ? { label: labels.join(', '), title: details.map(detail => `${detail[0].toUpperCase()}${detail.slice(1)}${detail.endsWith('.') ? '' : '.'}`).join(' ') } : null
}
