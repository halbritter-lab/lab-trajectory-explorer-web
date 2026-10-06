import type { SeriesPoint } from '../../../stats/series'
import {
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
  stage: number
}

/** KDIGO severity stage from baseline & peak creatinine (mg/dl). Stage by
 * peak/baseline ratio; absolute peak >= 4.0 overrides to stage 3. Returns 0
 * when the pair is below the KDIGO AKI floor (ratio < 1.5x AND absolute rise
 * < 0.3 mg/dl), so the function is self-guarding rather than relying on callers
 * to pre-filter crossings. The same numeric tolerance applies to detector
 * crossings and this floor; episode merging and stage priority are unchanged. */
export function kdigoStage(baselineValue: number, peakValue: number): number {
  const ratio = baselineValue > 0 ? peakValue / baselineValue : Infinity
  if (atLeast(peakValue, KDIGO_STAGE_3_ABSOLUTE_MGDL) || atLeast(ratio, KDIGO_STAGE_3_RATIO)) return 3
  if (atLeast(ratio, KDIGO_STAGE_2_RATIO)) return 2
  if (atLeast(ratio, KDIGO_RELATIVE_RISE_RATIO) || atLeast(peakValue - baselineValue, KDIGO_ABSOLUTE_RISE_MGDL)) return 1
  return 0
}

interface RawCrossing {
  date: Date
  baselineDate: Date
  baselineValue: number
  peakValue: number
  peakDate: Date
  criterion: AkiEpisode['criterion']
}

/** Merge consecutive crossings sharing a baseline into one episode keeping the
 * max peak. Mirrors analyses/methods.py:_cluster_aki_episodes. */
function clusterEpisodes(raw: RawCrossing[]): AkiEpisode[] {
  const clusters: RawCrossing[] = []
  for (const c of raw) {
    const last = clusters[clusters.length - 1]
    if (last && last.baselineDate.getTime() === c.baselineDate.getTime()) {
      if (c.peakValue > last.peakValue) { last.peakValue = c.peakValue; last.peakDate = c.date }
    } else {
      clusters.push({ ...c, peakDate: c.date })
    }
  }
  return clusters.map((g) => ({
    date: g.date, baselineDate: g.baselineDate, baselineValue: g.baselineValue,
    peakValue: g.peakValue, peakDate: g.peakDate, criterion: g.criterion,
    stage: kdigoStage(g.baselineValue, g.peakValue),
  }))
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

/** Detect KDIGO AKI episodes on creatinine values already in mg/dl. O(n) via
 * two sliding-window minima (48h absolute, 7d relative). The window and
 * clustering algorithm follows the original Python implementation; threshold
 * comparisons use the owner's numeric tolerance. */
export function findKdigoAkiEpisodes(points: SeriesPoint[]): AkiEpisode[] {
  if (points.length === 0) return []
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const times = sorted.map((p) => p.date.getTime())
  const values = sorted.map((p) => p.value)
  const win48 = new MinWindow(values)
  const win7 = new MinWindow(values)
  const raw: RawCrossing[] = []
  for (let j = 0; j < sorted.length; j++) {
    const tj = times[j]
    const vj = values[j]
    // Windows hold only indices < j (j is pushed after querying), and j advances
    // in time, so expiring from the head leaves the in-window prior points.
    win48.expire(times, tj, KDIGO_ABSOLUTE_WINDOW_MS)
    win7.expire(times, tj, KDIGO_RELATIVE_WINDOW_MS)

    const i48 = win48.argmin()
    let fired = false
    if (i48 >= 0 && atLeast(vj - values[i48], KDIGO_ABSOLUTE_RISE_MGDL)) {
      raw.push({ date: sorted[j].date, baselineDate: sorted[i48].date, baselineValue: values[i48], peakValue: vj, peakDate: sorted[j].date, criterion: 'absolute_0_3_mg_dl_48h' })
      fired = true
    }
    if (!fired) {
      const i7 = win7.argmin()
      if (i7 >= 0 && values[i7] > 0 && atLeast(vj / values[i7], KDIGO_RELATIVE_RISE_RATIO)) {
        raw.push({ date: sorted[j].date, baselineDate: sorted[i7].date, baselineValue: values[i7], peakValue: vj, peakDate: sorted[j].date, criterion: 'relative_1_5x_7d' })
      }
    }

    win48.push(j)
    win7.push(j)
  }
  return clusterEpisodes(raw)
}
