const MS_PER_YEAR = 365.25 * 86_400_000

/** Express each date as fractional years elapsed since the first (min) date,
 * matching the Python `(times - t0).total_seconds() / (365.25*86400)`. */
export function datesToYears(dates: Date[]): number[] {
  if (dates.length === 0) return []
  const t0 = Math.min(...dates.map((x) => x.getTime()))
  return dates.map((x) => (x.getTime() - t0) / MS_PER_YEAR)
}
