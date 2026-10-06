import type { CkdEndpoints } from '../../core/domains/nephrology/endpoints/ckdEndpoints'
import { projectedG5Label } from './qualityLabels'

/** Endpoint badge copy for the trajectory table and exports; dates come from the result.
 * Percent change uses endpoint-eligible measurements, not the display fit, but needs two of
 * them: with one, baseline and latest coincide and "0%" would read as stable. */
export function endpointBadge(endpoints: CkdEndpoints, measurementCount: number): { label: string; title: string } | null {
  const labels: string[] = []
  const details: string[] = []
  const decline = endpoints.percentDecline.value
  if (decline !== null && endpoints.endpointPointCount >= 2 && measurementCount >= 2) {
    const change = -decline
    labels.push(`${change > 0 ? '+' : ''}${change.toFixed(0)}%`)
    details.push(`total eGFR change ${change.toFixed(1)}% from baseline (not per year)`)
  }
  if (endpoints.kidneyFailureReached) {
    const event = endpoints.kidneyFailureReached
    const type = event.type === 'kidney_transplant' ? 'kidney transplant' : 'chronic dialysis'
    labels.push(`Kidney failure reached (${type}, ${event.date.toISOString().slice(0, 10)})`)
    details.push(`kidney failure reached: ${type} on ${event.date.toISOString().slice(0, 10)}; distinct from lab-confirmed CKD G5`)
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
  for (const [threshold, event] of [[40, endpoints.observedDecline40], [57, endpoints.observedDecline57]] as const) {
    if (!event.met) continue
    labels.push(`${threshold}% decline`)
    details.push(`confirmed ${threshold}% eGFR decline: baseline ${endpoints.declineBaselineValue}; event ${event.firstDate?.toISOString().slice(0, 10)} (${event.firstValue}), confirmed ${event.confirmedDate?.toISOString().slice(0, 10)} (${event.confirmedValue}); minimum ${endpoints.confirmationDays} days, maximum 12 calendar months`)
    if (event.recoveryDate) details.push(`${threshold}% decline recovery ${event.recoveryDate.toISOString().slice(0, 10)} (${event.recoveryValue}); confirmed event retained`)
  }
  if (!endpoints.observedCkdG5.met) {
    if (endpoints.projectedAgeToCkdG5.value !== null) {
      const age = endpoints.projectedAgeToCkdG5.value
      labels.push(`G5 @ ${age.toFixed(1)}y`)
      details.push(`projected age to CKD G5 ${age.toFixed(1)} years; fitted curve using endpoint-eligible dated exact numeric measurements (bounds and kidney replacement therapy/acute dialysis periods excluded)`)
    } else {
      const unavailable = projectedG5Label(endpoints)
      if (unavailable) { labels.push(unavailable.label); details.push(unavailable.title) }
    }
  }
  return labels.length ? { label: labels.join(' · '), title: details.join(' · ') } : null
}
