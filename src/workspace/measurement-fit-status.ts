import type { CohortCell } from '../core/cohort/screening'
import type { LabRow } from '../core/types'
import { exclusionReasonLabel } from './workspace-labels'

/** Explain the prepared exclusions per measurement row without rerunning any
 * filter: reasons come from the core's per-point exclusion record, so event
 * censoring and AKI windows are reported from the same source as the fit. */
export function measurementFitStatus(rows: LabRow[], cell: CohortCell): string[] {
  // Cell points follow the same dated/numeric, stable date order as these rows.
  let numericIndex = 0
  return rows.map(row => {
    if (!row.labDatum || row.wertNum === null) return 'Unavailable: missing date or numeric value'
    const index = numericIndex++
    if (cell.fitModel === 'none') return 'Fit disabled'
    const reasons = cell.pointExclusionReasons[index] ?? []
    if (reasons.length) return `Excluded: ${reasons.map(exclusionReasonLabel).join('; ')}`
    return 'Available before time aggregation'
  })
}
