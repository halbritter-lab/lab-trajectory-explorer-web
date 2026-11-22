import type { SeriesPoint } from '../../../stats/series'
import {
  AKI_RECOVERY_WINDOW_MS,
  KDIGO_ABSOLUTE_RISE_MGDL,
  KDIGO_ABSOLUTE_WINDOW_MS,
  KDIGO_RELATIVE_RISE_RATIO,
  KDIGO_RELATIVE_WINDOW_MS,
  KDIGO_STAGE_2_RATIO,
  KDIGO_STAGE_3_ABSOLUTE_MGDL,
  KDIGO_STAGE_3_RATIO,
  KDIGO_THRESHOLD_TOLERANCE,
} from '../constants'

/** Inclusive KDIGO boundary despite binary rounding of decimal inputs. */
function atLeast(value: number, threshold: number): boolean {
  return value + KDIGO_THRESHOLD_TOLERANCE >= threshold
}

export interface AkiEpisode {
  date: Date
  baselineDate: Date
  baselineValue: number
  peakValue: number
  peakDate: Date
  criterion: 'absolute_0_3_mg_dl_48h' | 'relative_1_5x_7d'
  /** Highest stage reached by a crossing of the episode, each graded against
   * its reference, the lowest value of the seven days before it (decided
   * 2026-11-16). The reference can be lower than `baselineValue`, the
   * detection baseline. */
  stage: number
  /** The crossing that set `stage` (the first one to reach it) and its
   * reference, so that `stage === kdigoStage(stageReferenceValue, stageValue)`.
   * `stageValue` need not be the episode's peak. */
  stageValue: number
  stageDate: Date
  stageReferenceValue: number
  stageReferenceDate: Date
  /** Date of the value that ended the episode: the first value after the
   * episode's last crossing that does not meet the criterion and whose
   * recovery holds (see `findKdigoAkiEpisodes`). `null` when no such value
   * exists, so the episode is still open at the end of the series. */
  endDate: Date | null
  /** True when the episode ended at the first value after a gap of more than
   * seven days without a candidate end before it: `endDate` is then a value
   * that was not assessed against any earlier value, not one back below the
   * criterion. */
  endedByGap: boolean
  /** Date of the episode's last value before its end: its last crossing or a
   * later value that could not end it (`blocksRecovery`, or no earlier value
   * in its 7-day window after a gap bridged by `bridgesGap`); for an episode
   * still open, its last such value. Bounds the dialysis start of the
   * episode list when `endDate` is empty or `endedByGap` is true. */
  lastValueDate: Date
}

export interface KdigoEpisodeOptions {
  /** Sustained reversal that separates two episodes; default 48 hours
   * (`AKI_RECOVERY_WINDOW_MS`). Dates are calendar days. */
  recoveryMs?: number
  /** Days on which creatinine cannot show recovery (days under dialysis,
   * whose values are left out of detection). A value back below the
   * criterion ends no episode when one of the days of its recovery window is
   * such a day. */
  blocksRecovery?: (date: Date) => boolean
  /** Days that do not count towards a gap of more than seven days (a dated
   * acute dialysis interval): an episode continues across them. */
  bridgesGap?: (date: Date) => boolean
}

/** KDIGO severity stage of one creatinine value against a reference value
 * (both mg/dl). The detector passes the lowest value of the seven days before
 * the value as the reference, not the detection baseline. Stage by
 * value/reference ratio; a value >= 4.0 overrides to stage 3. Returns 0 when
 * the pair is below the KDIGO AKI floor (ratio < 1.5x AND rise over the
 * reference < 0.3 mg/dl), so the function is self-guarding rather than relying
 * on callers to pre-filter crossings. The same numeric tolerance applies to
 * detector crossings and this floor. */
export function kdigoStage(referenceValue: number, value: number): number {
  const ratio = referenceValue > 0 ? value / referenceValue : Infinity
  if (atLeast(value, KDIGO_STAGE_3_ABSOLUTE_MGDL) || atLeast(ratio, KDIGO_STAGE_3_RATIO)) return 3
  if (atLeast(ratio, KDIGO_STAGE_2_RATIO)) return 2
  if (atLeast(ratio, KDIGO_RELATIVE_RISE_RATIO) || atLeast(value - referenceValue, KDIGO_ABSOLUTE_RISE_MGDL)) return 1
  return 0
}

interface RawCrossing {
  date: Date
  baselineDate: Date
  baselineValue: number
  peakValue: number
  peakDate: Date
  criterion: AkiEpisode['criterion']
  stage: number
  stageValue: number
  stageDate: Date
  stageReferenceValue: number
  stageReferenceDate: Date
}

const MS_PER_DAY = 86_400_000

/** Group crossings into episodes by recovery (ADQI 16, decided 2026-11-21,
 * issue #67). `crossings[j]` is the crossing of detection value j or null
 * when value j does not meet the criterion; `hasReference[j]` says whether an
 * earlier value lay in its 7-day window. While an episode is open, the first
 * value that does not cross, has an earlier value in its 7-day window and
 * whose recovery window (the calendar days after it up to `recoveryMs`)
 * holds no blocked day is its candidate end. A
 * crossing more than `recoveryMs` after that value starts a new episode and
 * ends the previous one there; any other crossing joins the open episode,
 * which keeps the highest peak and the highest stage, and clears the
 * candidate. A value without an earlier value in its 7-day window (after a
 * gap of more than seven days) ends the open episode at the candidate, or at
 * itself without one: detection starts afresh there (decided 2026-11-22). Days
 * for which `bridgesGap` holds (a dated acute dialysis interval) do not count
 * towards such a gap: when seven days or fewer between the two values remain,
 * the value continues the open episode without being a candidate end.
 * Replaces the merge by shared baseline date of
 * analyses/methods.py:_cluster_aki_episodes. */
function clusterEpisodes(sorted: readonly SeriesPoint[], crossings: readonly (RawCrossing | null)[], hasReference: readonly boolean[], recoveryMs: number, blocksRecovery: (date: Date) => boolean, bridgesGap: (date: Date) => boolean): AkiEpisode[] {
  const episodes: AkiEpisode[] = []
  let open: AkiEpisode | null = null
  let recovery: Date | null = null
  const blocked = (date: Date) => {
    for (let d = 1; d * MS_PER_DAY <= recoveryMs; d++) if (blocksRecovery(new Date(date.getTime() + d * MS_PER_DAY))) return true
    return false
  }
  /** Whether at least seven calendar days that count towards a gap lie
   * strictly between two values, i.e. the values are more than seven such
   * days apart (stops counting at the seventh). */
  const gapDays = KDIGO_RELATIVE_WINDOW_MS / MS_PER_DAY
  const isGap = (from: Date, to: Date) => {
    let n = 0
    for (let t = from.getTime() + MS_PER_DAY; t < to.getTime() && n < gapDays; t += MS_PER_DAY) if (!bridgesGap(new Date(t))) n++
    return n >= gapDays
  }
  for (let j = 0; j < sorted.length; j++) {
    const c = crossings[j]
    if (c === null) {
      if (open && !hasReference[j] && isGap(sorted[j - 1].date, sorted[j].date)) {
        open.endDate = recovery ?? sorted[j].date
        open.endedByGap = recovery === null
        open = null
        recovery = null
      } else if (open && recovery === null) {
        // A value without an earlier value in its 7-day window (after a gap
        // bridged by dialysis) is compared with nothing, so it shows no
        // reversal and continues the episode (review of 2026-11-22).
        if (!hasReference[j] || blocked(sorted[j].date)) open.lastValueDate = sorted[j].date
        else recovery = sorted[j].date
      }
      continue
    }
    if (open && (recovery === null || c.date.getTime() - recovery.getTime() <= recoveryMs)) {
      if (c.peakValue > open.peakValue) { open.peakValue = c.peakValue; open.peakDate = c.date }
      if (c.stage > open.stage) {
        open.stage = c.stage; open.stageValue = c.stageValue; open.stageDate = c.stageDate
        open.stageReferenceValue = c.stageReferenceValue; open.stageReferenceDate = c.stageReferenceDate
      }
      open.lastValueDate = c.date
    } else {
      if (open) open.endDate = recovery
      open = { ...c, peakDate: c.date, endDate: null, endedByGap: false, lastValueDate: c.date }
      episodes.push(open)
    }
    recovery = null
  }
  if (open) open.endDate = recovery
  return episodes
}

/** Monotonic sliding-window minimum over chronologically-sorted points.
 * Holds point indices with non-decreasing value from the head, so head() is the
 * argmin among indices currently in the window; on value ties the earliest
 * (smallest, i.e. oldest) index stays in front — matching the original
 * argmin-by-first-occurrence so episode clustering by baseline is unchanged. */
class MinWindow {
  private dq: number[] = []
  private head = 0
  constructor(private values: number[]) {}
  /** Drop window members older than `windowMs` before reference time `tRef`. */
  expire(times: number[], tRef: number, windowMs: number): void {
    while (this.head < this.dq.length && tRef - times[this.dq[this.head]] > windowMs) this.head++
  }
  /** Index of the minimum value currently in the window, or -1 if empty. */
  argmin(): number {
    return this.head < this.dq.length ? this.dq[this.head] : -1
  }
  /** Add index `i` (must be appended in increasing time order). */
  push(i: number): void {
    while (this.dq.length > this.head && this.values[this.dq[this.dq.length - 1]] > this.values[i]) this.dq.pop()
    this.dq.push(i)
  }
}

/** Positive values in detection order, with a `slot` per value: values of one
 * date and one slot form a group whose members are never compared with each
 * other (decided 2026-11-21). On a date where every value carries a time of
 * day the slot is that time, so the time orders the values and only values of
 * the same time share a group. On a date where at least one value has no time
 * of day all values share one slot. Within a group the values ascend, so the
 * result does not depend on the row order of the source. */
function detectionOrder(points: SeriesPoint[]): { sorted: SeriesPoint[]; slots: number[] } {
  const positive = points.filter((p) => p.value > 0)
  const datesWithoutTime = new Set<number>()
  for (const p of positive) if (p.timeOfDay === null || p.timeOfDay === undefined) datesWithoutTime.add(p.date.getTime())
  const slot = (p: SeriesPoint) => (datesWithoutTime.has(p.date.getTime()) ? -1 : p.timeOfDay!)
  const sorted = positive.sort((a, b) => a.date.getTime() - b.date.getTime() || slot(a) - slot(b) || a.value - b.value)
  return { sorted, slots: sorted.map(slot) }
}

/** Detect KDIGO AKI episodes on creatinine values already in mg/dl. O(n) via
 * two sliding-window minima (48h absolute, 7d relative). Each crossing is
 * staged against the seven-day minimum. The window and
 * clustering algorithm follows the original Python implementation; threshold
 * comparisons use the owner's numeric tolerance. Values of zero or less are
 * not creatinine concentrations and take no part: they are neither a baseline
 * nor a rise (decided 2026-10-07; eGFR derivation rejects them as well).
 * Dates are calendar days and both windows count in days. Within a day the
 * time of day (`SeriesPoint.timeOfDay`) orders the values; values whose order
 * is unknown are compared with earlier values only, never with each other
 * (see `detectionOrder`). Crossings without a recovery of `recoveryMs`
 * between them form one episode (see `clusterEpisodes`). */
export function findKdigoAkiEpisodes(points: SeriesPoint[], options: KdigoEpisodeOptions = {}): AkiEpisode[] {
  const { sorted, slots } = detectionOrder(points)
  if (sorted.length === 0) return []
  const times = sorted.map((p) => p.date.getTime())
  const values = sorted.map((p) => p.value)
  const win48 = new MinWindow(values)
  const win7 = new MinWindow(values)
  const crossings: (RawCrossing | null)[] = sorted.map(() => null)
  const hasReference: boolean[] = sorted.map(() => false)
  for (let start = 0, end = 0; start < sorted.length; start = end) {
    end = start + 1
    while (end < sorted.length && times[end] === times[start] && slots[end] === slots[start]) end++
    // Windows hold only indices before the group (its members are pushed after
    // all of them were queried), and groups advance in time, so expiring from
    // the head leaves the in-window prior points.
    win48.expire(times, times[start], KDIGO_ABSOLUTE_WINDOW_MS)
    win7.expire(times, times[start], KDIGO_RELATIVE_WINDOW_MS)
    const i48 = win48.argmin()
    const i7 = win7.argmin()
    for (let j = start; j < end; j++) {
      const vj = values[j]
      hasReference[j] = i7 >= 0
      // The stage is graded against the seven-day minimum even when the 48-hour
      // criterion detects the crossing: an extra value the day before must not
      // lower the stage. The 48-hour window lies inside the seven-day one, so
      // i7 exists whenever i48 does and its value is never higher.
      const staging = i7 >= 0 ? { stage: kdigoStage(values[i7], vj), stageValue: vj, stageDate: sorted[j].date, stageReferenceValue: values[i7], stageReferenceDate: sorted[i7].date } : null
      if (staging && i48 >= 0 && atLeast(vj - values[i48], KDIGO_ABSOLUTE_RISE_MGDL)) {
        crossings[j] = { date: sorted[j].date, baselineDate: sorted[i48].date, baselineValue: values[i48], peakValue: vj, peakDate: sorted[j].date, criterion: 'absolute_0_3_mg_dl_48h', ...staging }
      } else if (staging && atLeast(vj / values[i7], KDIGO_RELATIVE_RISE_RATIO)) {
        crossings[j] = { date: sorted[j].date, baselineDate: sorted[i7].date, baselineValue: values[i7], peakValue: vj, peakDate: sorted[j].date, criterion: 'relative_1_5x_7d', ...staging }
      }
    }
    for (let j = start; j < end; j++) {
      win48.push(j)
      win7.push(j)
    }
  }
  return clusterEpisodes(sorted, crossings, hasReference, options.recoveryMs ?? AKI_RECOVERY_WINDOW_MS, options.blocksRecovery ?? (() => false), options.bridgesGap ?? (() => false))
}
