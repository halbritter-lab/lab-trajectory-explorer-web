import type { CkdEndpoints } from '../../core/endpoints/ckdEndpoints'
import { projectedG5Label } from './qualityLabels'

/** Endpoint badge copy for the trajectory table and exports; dates come from the result.
 * Percent change uses raw measurements, not the display fit, but needs two of
 * them: with one, baseline and latest coincide and "0%" would read as stable. */
export function endpointBadge(endpoints: CkdEndpoints, measurementCount: number): { label: string; title: string } | null {
  const labels: string[] = []
  const details: string[] = []
  const decline = endpoints.percentDecline.value
  if (decline !== null && measurementCount >= 2) {
    const change = -decline
    labels.push(`${change > 0 ? '+' : ''}${change.toFixed(0)}%`)
    details.push(`total eGFR change ${change.toFixed(1)}% from baseline (not per year)`)
  }
  for (const [stage, event] of [['G4', endpoints.observedCkdG4], ['G5', endpoints.observedCkdG5]] as const) {
    if (!event?.met) continue
    labels.push(`CKD ${stage}`)
    details.push(`observed CKD ${stage}: event ${event.firstDate?.toISOString().slice(0, 10)} (${event.firstValue}), confirmed ${event.confirmedDate?.toISOString().slice(0, 10)} (${event.confirmedValue}); minimum ${endpoints.confirmationDays} days`)
    if (event.recoveryDate) {
      labels.push(`${stage} recovery`)
      details.push(`${stage} recovery ${event.recoveryDate.toISOString().slice(0, 10)} (${event.recoveryValue}); confirmed event retained`)
    }
  }
  if (!endpoints.observedCkdG5.met) {
    if (endpoints.projectedAgeToCkdG5.value !== null) {
      const age = endpoints.projectedAgeToCkdG5.value
      labels.push(`G5 @ ${age.toFixed(1)}y`)
      details.push(`projected age to CKD G5 ${age.toFixed(1)} years; fitted curve using all dated numeric measurements`)
    } else {
      const unavailable = projectedG5Label(endpoints)
      if (unavailable) { labels.push(unavailable.label); details.push(unavailable.title) }
    }
  }
  return labels.length ? { label: labels.join(' · '), title: details.join(' · ') } : null
}
