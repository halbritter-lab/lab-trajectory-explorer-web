/**
 * Exclusion windows: date ranges whose measurements a fit leaves out, each
 * with the reason it does so. Domain-neutral; domain modules decide which
 * windows exist (a clinical event, an episode, a run-in period) and this file
 * decides only what "inside a window" means.
 */

const MS_PER_DAY = 86_400_000

/** An inclusive date range. `end: null` means open-ended: everything from
 * `start` on is inside. */
export interface ExclusionWindow {
  start: Date
  end: Date | null
}

export interface ReasonedExclusionWindow<R extends string = string> extends ExclusionWindow {
  reason: R
}

/** True when `date` lies in the window, both bounds included. */
export function windowContains(window: ExclusionWindow, date: Date): boolean {
  const t = date.getTime()
  return t >= window.start.getTime() && (window.end === null || t <= window.end.getTime())
}

/** A fixed-length window `[start, start + days]`. The end is rounded down to
 * a whole millisecond, which changes nothing for millisecond timestamps:
 * t <= floor(end) exactly when t <= end. */
export function fixedLengthWindow(start: Date, days: number): ExclusionWindow {
  return { start, end: new Date(Math.floor(start.getTime() + days * MS_PER_DAY)) }
}

/** The same window starts with another fixed length (see fixedLengthWindow). */
export function windowsWithLength(windows: readonly ExclusionWindow[], days: number): ExclusionWindow[] {
  return windows.map((window) => fixedLengthWindow(window.start, days))
}

/** Reasons of every window containing `date`, without repeats, in window
 * order. Empty when no window contains it. */
export function exclusionReasonsAt<R extends string>(date: Date, windows: readonly ReasonedExclusionWindow<R>[]): R[] {
  const reasons: R[] = []
  for (const window of windows) {
    if (windowContains(window, date) && !reasons.includes(window.reason)) reasons.push(window.reason)
  }
  return reasons
}

export interface ExclusionResult<P> {
  /** Points outside every window, in input order. */
  kept: P[]
  /** Input indices of `kept`. */
  keptIdx: number[]
  /** Input indices of points inside at least one window. */
  excludedIdx: number[]
}

/** Split points into those outside every window and those inside one. The one
 * place a fit, a point table and a chart decide that a measurement is
 * excluded, so the three never disagree. */
export function applyExclusionWindows<P extends { date: Date }>(
  points: readonly P[],
  windows: readonly ExclusionWindow[],
): ExclusionResult<P> {
  if (windows.length === 0) return { kept: [...points], keptIdx: points.map((_, i) => i), excludedIdx: [] }
  const kept: P[] = []
  const keptIdx: number[] = []
  const excludedIdx: number[] = []
  points.forEach((point, index) => {
    if (windows.some((window) => windowContains(window, point.date))) {
      excludedIdx.push(index)
    } else {
      kept.push(point)
      keptIdx.push(index)
    }
  })
  return { kept, keptIdx, excludedIdx }
}
