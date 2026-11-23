import type { CohortCell } from '../core/cohort/screening'
import type { LabRow } from '../core/types'
import { exclusionReasonLabel } from './workspace-labels'
import { t } from '../i18n'

/** Explain the prepared exclusions per measurement row without rerunning any
 * filter: reasons come from the core's per-point exclusion record, so event
 * censoring and AKI windows are reported from the same source as the fit. */
export function measurementFitStatus(rows: LabRow[], cell: CohortCell): string[] {
  // Cell points follow the same dated/numeric, stable date order as these rows.
  let numericIndex = 0
  return rows.map(row => {
    if (!row.labDatum || row.wertNum === null) return t('Unavailable: missing date or numeric value')
    const index = numericIndex++
    const reasons = cell.pointExclusionReasons[index] ?? []
    const visibleReasons = cell.fitModel === 'none' ? reasons.filter(reason => reason === 'censored-value') : reasons
    if (visibleReasons.length) return t('Excluded: {reasons}', { reasons: visibleReasons.map(exclusionReasonLabel).join('; ') })
    if (cell.fitModel === 'none') return t('Fit disabled')
    // Issue #73: a bound that enters the fit says at which value.
    const bound = row.wertOperator === '=' ? ''
      : cell.boundedValues === 'half-limit' && row.wertOperator === '<' ? `; ${t('bounded value, enters the fit at half its limit ({value})', { value: row.wertNum / 2 })}` : `; ${t('bounded value, enters the fit at its limit ({value})', { value: row.wertNum })}`
    if (cell.anchorComparison?.windowIdx.includes(index)) return `${t('Available before time balancing')}${bound}; ${t('left out of the after-anchor slope (exclusion window after the anchor event)')}`
    return `${t('Available before time balancing')}${bound}`
  })
}
