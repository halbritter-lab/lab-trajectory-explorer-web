import type { BirthInterval } from './types'

const MS_PER_DAY = 86_400_000

/** Shift a UTC date by whole years. 29 February in a non-leap target year would
 * roll forward into March, which would put an interval endpoint in the wrong
 * month; clamp it back to the last day of February instead. */
export function addYearsUtc(date: Date, delta: number): Date {
  const month = date.getUTCMonth()
  const shifted = new Date(Date.UTC(date.getUTCFullYear() + delta, month, date.getUTCDate()))
  if (shifted.getUTCMonth() !== month) shifted.setUTCDate(0)
  return shifted
}

/** The inclusive range of birth dates for which `completedYears(birth, labDate)`
 * equals `age`. "46 years old on 2022-01-15" means born 1975-01-16 … 1976-01-15. */
export function birthDateInterval(labDate: Date, age: number): BirthInterval {
  const hi = addYearsUtc(labDate, -age)
  const lo = addYearsUtc(labDate, -(age + 1))
  lo.setUTCDate(lo.getUTCDate() + 1)
  return { lo, hi }
}

/** Tightest range consistent with every input. Returns null only when there is
 * nothing to intersect; a contradiction comes back as an inverted interval, so
 * callers can report how far apart the constraints are. */
export function intersectBirthIntervals(intervals: readonly BirthInterval[]): BirthInterval | null {
  if (intervals.length === 0) return null
  let lo = intervals[0].lo
  let hi = intervals[0].hi
  for (const interval of intervals) {
    if (interval.lo.getTime() > lo.getTime()) lo = interval.lo
    if (interval.hi.getTime() < hi.getTime()) hi = interval.hi
  }
  return { lo, hi }
}

export function isEmptyInterval(interval: BirthInterval): boolean {
  return interval.lo.getTime() > interval.hi.getTime()
}

/** How far the constraints miss each other, in days. Zero for a valid range. */
export function intervalGapDays(interval: BirthInterval): number {
  const gap = interval.lo.getTime() - interval.hi.getTime()
  return gap <= 0 ? 0 : Math.round(gap / MS_PER_DAY)
}

export function intervalMidpoint(interval: BirthInterval): Date {
  return new Date(Math.round((interval.lo.getTime() + interval.hi.getTime()) / 2))
}

/** Median of dates, taking the earlier of the two middles for an even count so
 * the result is always one of the inputs rather than a synthetic half-day. */
export function medianDate(dates: readonly Date[]): Date | null {
  if (dates.length === 0) return null
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
  return sorted[Math.floor((sorted.length - 1) / 2)]
}
