import type { ProjectionTarget } from '../../projection/linearProjection'
import { isEgfrOutcome } from './analytes'
import { CKD_G4_EGFR_THRESHOLD, CKD_G5_EGFR_THRESHOLD } from './constants'

const RENAL_BOUNDARIES = [{id:'g4',label:'G4 boundary',threshold:CKD_G4_EGFR_THRESHOLD},{id:'g5',label:'G5 boundary',threshold:CKD_G5_EGFR_THRESHOLD}] as const

/** Copy definitions into settings; no implicit unit conversion. */
export function projectionTargetPresets(response: {outcome:string; unit:string}): ProjectionTarget[] {
  if (!isEgfrOutcome(response.outcome, response.unit)) return []
  return RENAL_BOUNDARIES.map(target => ({...target,...response,direction:'below'}))
}
