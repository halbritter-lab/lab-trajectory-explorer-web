/** Axis ticks at round values inside [min, max]: steps of 1, 2 or 5 times a
 * power of ten, about `target` of them. The axis range itself is not changed,
 * so the ends of the range need not carry a tick. */
export function niceTicks(min: number, max: number, target = 4, minStep = 0): number[] {
  const span = max - min
  if (!Number.isFinite(span) || span <= 0) return Number.isFinite(min) ? [min] : []
  const raw = span / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalised = raw / magnitude
  // `minStep` keeps an axis of whole units (days) from showing fractions.
  const step = Math.max(minStep, (normalised < 1.5 ? 1 : normalised < 3 ? 2 : normalised < 7 ? 5 : 10) * magnitude)
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

const MS_PER_DAY = 86_400_000

/** Ticks of a calendar axis, in milliseconds. From four days of range on:
 * five evenly spaced positions, ends included; they are at least a day apart
 * and so never share a date label. Below that: one tick per UTC midnight
 * inside the range, so every label is a different day. A range without a
 * midnight gets a single tick at its start. */
export function calendarTicks(min: number, max: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return []
  if (max - min >= 4 * MS_PER_DAY) return [0, .25, .5, .75, 1].map(f => min + (max - min) * f)
  const ticks: number[] = []
  for (let day = Math.ceil(min / MS_PER_DAY); day * MS_PER_DAY <= max; day++) ticks.push(day * MS_PER_DAY)
  return ticks.length ? ticks : [min]
}

/** Ticks of a logarithmic value axis over [min, max], both positive: powers
 * of ten when they give at least three ticks, else 1, 2 and 5 times a power of
 * ten, else (a range inside about one decade) the round ticks of a linear
 * axis. The axis range itself is not changed. */
export function logTicks(min: number, max: number, target = 4): number[] {
  if (!(min > 0) || !Number.isFinite(max) || max <= min) return min > 0 ? [min] : []
  for (const multipliers of [[1], [1, 2, 5]]) {
    const ticks: number[] = []
    for (let k = Math.floor(Math.log10(min)); k <= Math.ceil(Math.log10(max)); k++) {
      for (const m of multipliers) {
        const value = Number((m * 10 ** k).toPrecision(12))
        if (value >= min * (1 - 1e-9) && value <= max * (1 + 1e-9)) ticks.push(value)
      }
    }
    if (ticks.length >= 3) return ticks
  }
  return niceTicks(min, max, target).filter(tick => tick > 0)
}

/** Labels for `logTicks`: three significant digits for the 1-2-5 ticks, so
 * 0.002 and 2000 both read; the linear fallback keeps `tickLabels`. */
export function logTickLabels(ticks: readonly number[]): string[] {
  const oneTwoFive = ticks.every(tick => [1, 2, 5].includes(Number((tick / 10 ** Math.floor(Math.log10(tick))).toPrecision(6))))
  return oneTwoFive ? ticks.map(tick => tick.toLocaleString('en-GB', { maximumSignificantDigits: 3 })) : tickLabels(ticks)
}
