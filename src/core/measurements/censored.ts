import type { LabRow } from '../types'

/** A bound is retained for display but supplies no exact observed value. */
export const CENSORED_VALUE_REASON = 'censored-value'

export function isExactMeasurement(row: Pick<LabRow, 'wertOperator'>): boolean {
  return row.wertOperator === '='
}
