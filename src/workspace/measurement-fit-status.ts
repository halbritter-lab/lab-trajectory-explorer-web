import type { CohortCell } from '../core/cohort/screening'
import type { ClinicalEvent } from '../core/events/events'
import { filterFitPointsByClinicalEvents } from '../core/events/fitExclusions'
import type { FitConfig } from '../core/fitPipeline/types'
import type { LabRow } from '../core/types'

/** Explain existing prepared exclusions without rerunning the statistical fit. */
export function measurementFitStatus(rows: LabRow[], cell: CohortCell, events: ClinicalEvent[], config: FitConfig): string[] {
  const reasons = new Map<number, string[]>()
  for (const event of events) {
    for (const index of filterFitPointsByClinicalEvents(cell.points, [event], config.censoring).excludedIdx) {
      reasons.set(index, [...(reasons.get(index) ?? []), event.title])
    }
  }
  const excluded = new Set(cell.excludedIdx)
  // Cell points follow the same dated/numeric, stable date order as these rows.
  let numericIndex = 0
  return rows.map(row => {
    if (!row.labDatum || row.wertNum === null) return 'Unavailable: missing date or numeric value'
    const index = numericIndex++
    if (cell.fitModel === 'none') return 'Fit disabled'
    if (excluded.has(index)) return `Excluded: ${reasons.get(index)?.join('; ') || 'AKI exclusion window'}`
    return 'Available before time aggregation'
  })
}
