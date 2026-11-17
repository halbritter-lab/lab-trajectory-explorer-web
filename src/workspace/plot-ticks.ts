/** Axis ticks at round values inside [min, max]: steps of 1, 2 or 5 times a
 * power of ten, about `target` of them. The axis range itself is not changed,
 * so the ends of the range need not carry a tick. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const span = max - min
  if (!Number.isFinite(span) || span <= 0) return Number.isFinite(min) ? [min] : []
  const raw = span / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalised = raw / magnitude
  const step = (normalised < 1.5 ? 1 : normalised < 3 ? 2 : normalised < 7 ? 5 : 10) * magnitude
  const ticks: number[] = []
  // Count in whole steps: adding a fractional step repeatedly drifts.
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + step * 1e-9; k++) ticks.push(Number((k * step).toPrecision(12)))
  return ticks
}

/** Labels for `niceTicks`: at most two decimals as elsewhere, more only when
 * the step is finer than 0.01, so neighbouring ticks never share a label. */
export function tickLabels(ticks: readonly number[]): string[] {
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1
  const decimals = Math.max(2, Math.min(12, Math.ceil(-Math.log10(step) - 1e-9)))
  return ticks.map(tick => tick.toLocaleString('en-GB', { maximumFractionDigits: decimals }).replace(/^-0$/, '0'))
}
