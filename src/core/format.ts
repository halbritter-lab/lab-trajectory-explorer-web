/** Display formatting shared by the workspace and module-provided labels, so
 * a module's tooltip reads exactly like the surrounding interface. */

/** Up to two decimals, British grouping; an em dash for non-finite values. A value
 * that rounds to zero reads "0", never "-0". */
export const formatDisplayNumber = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString('en-GB', { maximumFractionDigits: 2 }).replace(/^-0$/, '0') : '—'

/** `YYYY-MM-DD` of the UTC calendar date for exports; blank for a missing or
 * invalid date. Imported dates are UTC midnight, so local getters would shift
 * them a day west of UTC. */
export const utcDateOrBlank = (date: Date | null | undefined): string =>
  date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : ''

/** Day/month/year of the UTC calendar date. */
export const formatDisplayDate = (date: Date): string => date.toLocaleDateString('en-GB', { timeZone: 'UTC' })

/** Fewest and most decimals a slope column is shown with. */
export const MIN_SLOPE_DECIMALS = 2
export const MAX_SLOPE_DECIMALS = 4

/** Decimals for the slopes of one parameter (decided 2026-11-21): as many as
 * give the median of the absolute slopes two significant digits, at least
 * MIN_SLOPE_DECIMALS and at most MAX_SLOPE_DECIMALS. Non-finite slopes are
 * left out; without any slope, or with a median of zero, the minimum applies.
 * Display only: computation and exports keep full precision. */
export function slopeDisplayDecimals(slopes: Iterable<number>): number {
  const sizes = [...slopes].filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b)
  if (!sizes.length) return MIN_SLOPE_DECIMALS
  const middle = sizes.length >> 1
  const median = sizes.length % 2 ? sizes[middle] : (sizes[middle - 1] + sizes[middle]) / 2
  if (!(median > 0)) return MIN_SLOPE_DECIMALS
  // The decimal exponent as printed, so 0.1 counts as 1e-1 whatever log10 returns.
  const exponent = Number(median.toExponential().split('e')[1])
  return Math.min(MAX_SLOPE_DECIMALS, Math.max(MIN_SLOPE_DECIMALS, 1 - exponent))
}

/** A number with exactly `decimals` decimals, British grouping; an em dash for
 * non-finite values. `signed` puts a plus before a value above zero. A value
 * that rounds to zero is never printed as "-0.00". */
export function formatFixedDecimals(value: number, decimals: number, signed = false): string {
  if (!Number.isFinite(value)) return '—'
  const text = value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/^-(?=[0.]*$)/, '')
  return signed && value > 0 ? `+${text}` : text
}
