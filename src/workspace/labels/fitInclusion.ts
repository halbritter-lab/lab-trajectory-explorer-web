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

/** Every censoring option on, dialysis of unknown intent as a dated interval
 * only: an undated one is named by `openUnknownDialysisWarning` instead. */
const EVERY_OPTION = { censorAfterKidneyTransplant: true, censorAfterChronicDialysis: true, excludeAcuteDialysisPeriods: true, unknownDialysisPolicy: 'exclude-dated-interval' } as const

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
  const windows = [
    ...clinicalEventExclusionWindows(events, EVERY_OPTION),
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

/** The warning of decision `dial` (2026-11-22): the column left out the
 * values from the start of a dialysis of unknown intent without an end date
 * (policy `dated-interval-or-from-start`), which may be maintenance dialysis
 * or a short acute one whose end was not recorded. Null when no value was
 * left out for that reason. */
export function openUnknownDialysisWarning(cell: CohortCell): FitInclusionCaveat | null {
  const n = cell.pointExclusionReasons.filter(reasons => reasons.includes('unknown_dialysis_open')).length
  if (n === 0) return null
  return {
    label: `${n} ${n === 1 ? 'value' : 'values'} after dialysis of unknown intent left out`,
    title: 'A dialysis of unknown intent has no end date, so every value from its start on is left out of the slope; it may have been maintenance dialysis. If it was acute, add its end date or intent "acute" to the event file. Endpoints still use these values.',
  }
}
