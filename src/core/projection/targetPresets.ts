import type { ProjectionTarget } from './linearProjection'

const RENAL_BOUNDARIES = [{id:'g4',label:'G4 boundary',threshold:30},{id:'g5',label:'G5 boundary',threshold:15}] as const

/** Copy definitions into settings; no implicit unit conversion. */
export function projectionTargetPresets(response: {outcome:string; unit:string}): ProjectionTarget[] {
  const unit = response.unit.toLowerCase().replace(/\s/g,'').replace(',','.').replace('²','2').replace('^2','2')
  if (!/^egfr(?:\b|_)/i.test(response.outcome) || unit !== 'ml/min/1.73m2') return []
  return RENAL_BOUNDARIES.map(target => ({...target,...response,direction:'below'}))
}
