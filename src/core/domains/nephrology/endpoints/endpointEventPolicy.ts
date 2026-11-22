import type { ClinicalEvent } from '../../../events/events'
import type { EndpointPoint } from '../../../endpoints/thresholdEndpoints'

export interface KidneyFailureReached {
  type: 'kidney_transplant' | 'chronic_dialysis'
  date: Date
}

const day = (date: Date): string => date.toISOString().slice(0, 10)
const valid = (date: Date | null): date is Date => date instanceof Date && Number.isFinite(date.getTime())

/** Earliest dated kidney replacement therapy, independent of lab confirmation. */
export function firstKidneyFailureEvent(events: readonly ClinicalEvent[]): KidneyFailureReached | null {
  const candidates = events.filter(event => valid(event.date) && (event.type === 'kidney_transplant' || (event.type === 'dialysis' && event.intent === 'chronic')))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || Number(b.type === 'kidney_transplant') - Number(a.type === 'kidney_transplant'))
  const first = candidates[0]
  return first ? { type: first.type === 'kidney_transplant' ? 'kidney_transplant' : 'chronic_dialysis', date: first.date } : null
}

/** The earliest dated death of the patient (event type `death`, issue #78). */
export function firstDeathEvent(events: readonly ClinicalEvent[]): Date | null {
  const dates = events.filter(event => event.type === 'death' && valid(event.date)).map(event => event.date.getTime())
  return dates.length === 0 ? null : new Date(Math.min(...dates))
}

/** Endpoint-only policy: KRT truncates from its calendar date; a complete
 * acute dialysis interval excludes both boundary dates and retains later labs.
 * Values dated after the earliest death are data errors and left out; a value
 * on the day of death is kept (since 2026-11-22, issue #78). */
export function filterEndpointPointsForEvents<T extends EndpointPoint>(points: readonly T[], events: readonly ClinicalEvent[]): T[] {
  const failure = firstKidneyFailureEvent(events)
  const cutoff = failure ? day(failure.date) : null
  const death = firstDeathEvent(events)
  const deathDay = death ? day(death) : null
  const acute = events.filter(event => event.type === 'dialysis' && event.intent === 'acute' && valid(event.date) && valid(event.endDate) && event.endDate >= event.date)
  return points.filter(point => {
    const date = day(point.date)
    return (cutoff === null || date < cutoff) && (deathDay === null || date <= deathDay) && !acute.some(event => date >= day(event.date) && date <= day(event.endDate!))
  })
}
