import type { CohortCell } from '../../core/cohort/screening'
import type { ClinicalEvent } from '../../core/events/events'
import { windowContains } from '../../core/exclusions/windows'
import { clinicalEventExclusionWindows } from '../../core/domains/nephrology/censoring'
import { AKI_MODULE_ID } from '../../core/domains/nephrology/aki/akiModule'
import { isAkiCreatinineSource } from '../../core/domains/nephrology/aki/akiAware'
import { isEgfrUnit } from '../../core/domains/nephrology/analytes'

const PHRASES: Record<string, string> = {
  post_kidney_transplant: 'after kidney transplant',
  post_chronic_dialysis: 'after chronic dialysis start',
  acute_dialysis: 'during acute dialysis',
  unknown_dialysis_interval: 'during dialysis of unknown intent',
  aki: 'in an AKI window',
}

export interface FitInclusionCaveat {
  label: string
  title: string
}

/** Names what a kidney-function slope runs across: measurements that stay in
 * the fit although they follow a kidney transplant or chronic dialysis start,
 * lie in a dated dialysis interval or in a detected AKI window. Display only;
 * it changes no fit. Points the column already excludes are not counted. A
 * measurement inside several windows is counted once, under the first of the
 * reasons in the order above. Null for other parameters and when nothing
 * such is in the fit. */
export function fitInclusionCaveat(cell: CohortCell, events: readonly ClinicalEvent[]): FitInclusionCaveat | null {
  if (cell.fitModel === 'none' || !Number.isFinite(cell.slope)) return null
  if (!isEgfrUnit(cell.einheit) && !isAkiCreatinineSource(cell.bezeichnung, cell.einheit)) return null
  // Every censoring option on, dialysis of unknown intent as a dated interval.
  const windows = [
    ...clinicalEventExclusionWindows(events),
    ...cell.overlays.flatMap(overlay => overlay.kind === 'band' && overlay.moduleId === AKI_MODULE_ID ? [{ reason: 'aki', start: overlay.start, end: overlay.end }] : []),
  ]
  const counts = new Map<string, number>()
  cell.points.forEach((point, index) => {
    if (cell.pointExclusionReasons[index]?.length) return
    const reason = Object.keys(PHRASES).find(key => windows.some(window => window.reason === key && windowContains(window, point.date)))
    if (reason) counts.set(reason, (counts.get(reason) ?? 0) + 1)
  })
  if (!counts.size) return null
  const parts = Object.keys(PHRASES).flatMap(reason => counts.has(reason) ? [`${counts.get(reason)} ${counts.get(reason) === 1 ? 'value' : 'values'} ${PHRASES[reason]}`] : [])
  return {
    label: `Fit includes ${parts.join(', ')}`,
    title: 'These measurements are part of the slope. To leave them out, open the analysis settings of this parameter and tick the matching option under “Clinical events & censoring” or “AKI exclusion windows”, or choose the CKD progression preset.',
  }
}
