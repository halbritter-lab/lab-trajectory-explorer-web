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

/** Endpoint-only policy: KRT truncates from its calendar date; a complete
 * acute dialysis interval excludes both boundary dates and retains later labs. */
export function filterEndpointPointsForEvents<T extends EndpointPoint>(points: readonly T[], events: readonly ClinicalEvent[]): T[] {
  const failure = firstKidneyFailureEvent(events)
  const cutoff = failure ? day(failure.date) : null
  const acute = events.filter(event => event.type === 'dialysis' && event.intent === 'acute' && valid(event.date) && valid(event.endDate) && event.endDate >= event.date)
  return points.filter(point => {
    const date = day(point.date)
    return (cutoff === null || date < cutoff) && !acute.some(event => date >= day(event.date) && date <= day(event.endDate!))
  })
}
