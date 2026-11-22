import { cohortCellFlags, type CohortCell } from '../../core/cohort/screening'
import type { ColumnModuleSettings } from '../../core/analysis/registry'
import { CLINICAL_EVENT_TYPES, type ClinicalEvent, type ClinicalEventType } from '../../core/events/events'
import { isUnstableSlope } from '../../core/stats/slopeQuality'
import type { PatientId } from '../../core/types'

type SlopeCell = Pick<CohortCell, 'slope' | 'reason' | 'nFitted' | 'nFittedDates' | 'fittedSpanDays' | 'fitModel'>

/** A slope exists but does not meet the reliability rule: the amber
 * "uncertain slope" notes. A cell without a slope is not uncertain, it has none. */
export const hasUncertainSlope = (cell: SlopeCell): boolean => Number.isFinite(cell.slope) && isUnstableSlope(cell)

/** Order of two cells under a sort by slope or by absolute slope. Cells without
 * a slope come last in either direction. With `uncertainLast` (the default of
 * the table, decided 2026-11-21) uncertain slopes form a block of their own
 * between the reliable slopes and the cells without one, sorted like the
 * reliable ones. Zero means a tie for the caller to break. */
export function compareSlopeCells(a: SlopeCell, b: SlopeCell, options: { absolute: boolean; ascending: boolean; uncertainLast: boolean }): number {
  const block = (cell: SlopeCell) => !Number.isFinite(cell.slope) ? 2 : options.uncertainLast && hasUncertainSlope(cell) ? 1 : 0
  const blockA = block(a), blockB = block(b)
  if (blockA !== blockB) return blockA - blockB
  if (blockA === 2) return 0
  const valueA = options.absolute ? Math.abs(a.slope) : a.slope
  const valueB = options.absolute ? Math.abs(b.slope) : b.slope
  return options.ascending ? valueA - valueB : valueB - valueA
}

/** What a patient row can be filtered by: the marks of its shown cells and the
 * types of its clinical events. */
export type RowMark = 'rapid' | 'rapid-possible' | 'uncertain' | 'endpoint' | 'aki' | `event:${ClinicalEventType}`

const MARK_LABELS: Record<RowMark, string> = {
  rapid: 'Rapid decline',
  'rapid-possible': 'Possible rapid decline',
  uncertain: 'Uncertain slope',
  endpoint: 'Endpoint reached',
  aki: 'AKI',
  'event:kidney_transplant': 'Kidney transplant',
  'event:dialysis': 'Dialysis',
  'event:other': 'Other event',
}
/** Display order: marks of the cells first, then event types. */
export const ROW_MARKS = Object.keys(MARK_LABELS) as RowMark[]
export const rowMarkLabel = (mark: RowMark): string => MARK_LABELS[mark]

/** An observed endpoint: kidney failure by event, a confirmed CKD G4 or G5, or
 * a confirmed 40%, 50% or 57% decline. Projections and the total change are not
 * endpoints reached. */
function endpointReached(endpoints: CohortCell['endpoints']): boolean {
  return Boolean(endpoints.kidneyFailureReached || endpoints.observedCkdG4?.met || endpoints.observedCkdG5?.met
    || endpoints.observedDecline40?.met || endpoints.observedDecline50?.met || endpoints.observedDecline57?.met)
}

/** The marks one patient row carries in the shown columns. `fit[i]` says whether
 * column i shows a trend: marks that need a fit (rapid decline, uncertain
 * slope) count only then, as in the cell. */
export function rowMarks(
  row: { patientId: PatientId; cells: readonly CohortCell[] },
  columns: ReadonlyArray<{ fit: boolean; settings: ColumnModuleSettings }>,
  events: readonly ClinicalEvent[] = [],
): Set<RowMark> {
  const marks = new Set<RowMark>()
  row.cells.forEach((cell, index) => {
    const column = columns[index]
    if (!column) return
    for (const flag of cohortCellFlags(cell, row.patientId, column.settings)) {
      if (flag.requiresFit && !column.fit) continue
      if (flag.tone === 'aki') marks.add('aki')
      else if (flag.tone === 'rapid') marks.add('rapid')
      else if (flag.tone === 'rapid-possible') marks.add('rapid-possible')
    }
    if (column.fit && cell.points.length > 0 && hasUncertainSlope(cell)) marks.add('uncertain')
    if (endpointReached(cell.endpoints)) marks.add('endpoint')
  })
  for (const event of events) if (CLINICAL_EVENT_TYPES.includes(event.type)) marks.add(`event:${event.type}`)
  return marks
}
