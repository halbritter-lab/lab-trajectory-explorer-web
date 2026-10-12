/** Display formatting shared by the workspace and module-provided labels, so
 * a module's tooltip reads exactly like the surrounding interface. */

/** Up to two decimals, British grouping; an em dash for non-finite values. A value
 * that rounds to zero reads "0", never "-0". */
export const formatDisplayNumber = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString('en-GB', { maximumFractionDigits: 2 }).replace(/^-0$/, '0') : '—'

/** Day/month/year of the UTC calendar date. */
export const formatDisplayDate = (date: Date): string => date.toLocaleDateString('en-GB', { timeZone: 'UTC' })
