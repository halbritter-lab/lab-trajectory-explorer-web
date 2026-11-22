import type { CellFlagContext, CohortFlag, SeriesKey, SettingsModule } from '../../analysis/types'
import { MIN_THEIL_SEN_PROJECTION_DATES } from '../../endpoints/thresholdEndpoints'
import type { FitModel } from '../../fitPipeline/types'
import type { PatientId } from '../../types'
import { isEgfrUnit } from './analytes'
import { DEFAULT_RAPID_EGFR_DECLINE } from './constants'

export { isEgfrUnit } from './analytes'
export const RAPID_EGFR_DECLINE_DEFAULT = DEFAULT_RAPID_EGFR_DECLINE

export interface RapidEgfrDeclineModuleSettings {
  /** Flag eGFR series falling faster than this (mL/min/1.73 m² per year);
   * 0 turns the flag off. */
  threshold: number
}

export const RAPID_EGFR_DECLINE_MODULE_ID = 'rapidEgfrDecline'

export function isRapidEgfrDecline(einheit: string | null, slope: number, threshold: number): boolean {
  return threshold > 0 && isEgfrUnit(einheit) && Number.isFinite(slope) && slope < -threshold
}

/** The two levels of the flag (decided 2026-11-21, issue #72): `yes` when the
 * whole 95 % interval of the slope lies below the negative threshold,
 * `possible` when only the slope does. */
export type RapidEgfrDeclineLevel = 'yes' | 'possible'

/** Flag tone of each level; the export and the row filters read the level back from it. */
export const RAPID_EGFR_DECLINE_TONES: Record<RapidEgfrDeclineLevel, string> = { yes: 'rapid', possible: 'rapid-possible' }

/** The bounds of a slope count as a 95 % interval when both are finite and
 * they are not Theil–Sen bounds on fewer than five fitted dates, which are a
 * slope range (decided 2026-11-16). */
export function hasSlopeInterval(fitModel: FitModel, ciLow: number | undefined, ciHigh: number | undefined, nFittedDates: number | undefined): boolean {
  if (!Number.isFinite(ciLow) || !Number.isFinite(ciHigh)) return false
  if (fitModel !== 'theil-sen') return true
  return nFittedDates !== undefined && nFittedDates >= MIN_THEIL_SEN_PROJECTION_DATES
}

export interface RapidEgfrDeclineFlagInput {
  patientId: PatientId
  bezeichnung: string
  einheit: string | null
  slope: number
  threshold: number
  /** Upper bound of the slope's 95 % interval. Omitted, NaN, or not a 95 %
   * interval (`hasInterval` false): the flag can only be `possible`. */
  ciHigh?: number
  /** Whether `ciHigh` is the upper bound of a 95 % interval. Defaults to
   * true, so a finite `ciHigh` alone counts. */
  hasInterval?: boolean
}

const intervalUpperBound = (input: Pick<RapidEgfrDeclineFlagInput, 'ciHigh' | 'hasInterval'>): number | null =>
  (input.hasInterval ?? true) && input.ciHigh !== undefined && Number.isFinite(input.ciHigh) ? input.ciHigh : null

/** Level of the flag for a slope, or null when the slope is not below the
 * negative threshold. Strict comparisons on both levels: a slope or an upper
 * bound of exactly −threshold is not below it. Without a 95 % interval the
 * level is `possible`, the conservative reading (Open decision OD-37). */
export function rapidEgfrDeclineLevel(input: Pick<RapidEgfrDeclineFlagInput, 'einheit' | 'slope' | 'threshold' | 'ciHigh' | 'hasInterval'>): RapidEgfrDeclineLevel | null {
  if (!isRapidEgfrDecline(input.einheit, input.slope, input.threshold)) return null
  const upper = intervalUpperBound(input)
  return upper !== null && upper < -input.threshold ? 'yes' : 'possible'
}

export function rapidEgfrDeclineFlagForCell(input: RapidEgfrDeclineFlagInput): CohortFlag | null {
  const level = rapidEgfrDeclineLevel(input)
  if (!level) return null
  return {
    id: `rapid-egfr-decline:${input.patientId}:${input.bezeichnung}:${input.einheit ?? ''}`,
    moduleId: RAPID_EGFR_DECLINE_MODULE_ID,
    patientId: input.patientId,
    seriesKey: { bezeichnung: input.bezeichnung, einheit: input.einheit },
    label: level === 'yes' ? 'rapid ↓' : 'rapid ↓?',
    title: level === 'yes'
      ? `Rapid decline: slope and its whole 95% interval < -${input.threshold} /year`
      : intervalUpperBound(input) !== null
        ? `Possible rapid decline: slope < -${input.threshold} /year, but its 95% interval reaches -${input.threshold} or above`
        : `Possible rapid decline: slope < -${input.threshold} /year, no 95% interval to confirm it`,
    tone: RAPID_EGFR_DECLINE_TONES[level],
    severity: 'warning',
    requiresFit: true,
  }
}

/** Level of a rapid-decline flag, read back from its tone; null for other flags. */
export function rapidEgfrDeclineFlagLevel(flag: CohortFlag): RapidEgfrDeclineLevel | null {
  if (flag.moduleId !== RAPID_EGFR_DECLINE_MODULE_ID) return null
  return flag.tone === RAPID_EGFR_DECLINE_TONES.yes ? 'yes' : 'possible'
}

/** Flags eGFR series whose fitted slope falls faster than the column's
 * threshold, unless the slope meets the reliability rule: "rapid ↓" when the
 * whole 95 % interval is below the negative threshold, "rapid ↓?" when only
 * the slope is. The threshold is a column setting (default 5). */
export const rapidEgfrDeclineModule = {
  id: 'rapidEgfrDecline' as const,
  label: 'Rapid eGFR decline',
  description: 'Flags eGFR series declining faster than a threshold per year.',
  appliesTo: (series: SeriesKey) => isEgfrUnit(series.einheit),
  defaultSettings: { threshold: DEFAULT_RAPID_EGFR_DECLINE } as RapidEgfrDeclineModuleSettings,
  parseSettings: (value: unknown): RapidEgfrDeclineModuleSettings | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const threshold = (value as Record<string, unknown>).threshold
    return typeof threshold === 'number' && Number.isFinite(threshold) ? value as RapidEgfrDeclineModuleSettings : null
  },
  columnSettingFields: [{
    key: 'threshold',
    label: 'Rapid decline > (mL/min/1.73m²/year)',
    ariaLabel: 'Rapid decline threshold',
    kind: 'number' as const,
    min: 0,
    step: 0.5,
    exportKey: 'rapid_egfr_threshold',
  }],
  exportColumns: [{ key: 'rapid_progression', value: ({ flags }: { flags: readonly CohortFlag[] }) => {
    const levels = flags.map(rapidEgfrDeclineFlagLevel)
    return levels.includes('yes') ? 'yes' : levels.includes('possible') ? 'possible' : ''
  } }],
  cellFlags: (ctx: CellFlagContext, settings: RapidEgfrDeclineModuleSettings): CohortFlag[] => {
    // Decided 2026-11-17: no flag on a slope the reliability rule calls
    // uncertain; the cell then carries the reliability note alone.
    if (ctx.unstableSlope) return []
    const flag = rapidEgfrDeclineFlagForCell({
      patientId: ctx.patientId,
      bezeichnung: ctx.seriesKey.bezeichnung,
      einheit: ctx.seriesKey.einheit,
      slope: ctx.slope,
      threshold: settings.threshold,
      ciHigh: ctx.ciHigh,
      hasInterval: hasSlopeInterval(ctx.fitModel, ctx.ciLow, ctx.ciHigh, ctx.nFittedDates),
    })
    return flag ? [flag] : []
  },
} satisfies SettingsModule<RapidEgfrDeclineModuleSettings, 'rapidEgfrDecline'>
