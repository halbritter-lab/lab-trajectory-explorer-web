import type { CellFlagContext, CohortFlag, SeriesKey, SettingsModule } from '../../analysis/types'
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

export interface RapidEgfrDeclineFlagInput {
  patientId: PatientId
  bezeichnung: string
  einheit: string | null
  slope: number
  threshold: number
}

export function rapidEgfrDeclineFlagForCell(input: RapidEgfrDeclineFlagInput): CohortFlag | null {
  if (!isRapidEgfrDecline(input.einheit, input.slope, input.threshold)) return null
  return {
    id: `rapid-egfr-decline:${input.patientId}:${input.bezeichnung}:${input.einheit ?? ''}`,
    moduleId: RAPID_EGFR_DECLINE_MODULE_ID,
    patientId: input.patientId,
    seriesKey: { bezeichnung: input.bezeichnung, einheit: input.einheit },
    label: 'rapid ↓',
    title: `Rapid decline: slope < -${input.threshold} /year`,
    tone: 'rapid',
    severity: 'warning',
    requiresFit: true,
  }
}

/** Flags eGFR series whose fitted slope falls faster than the column's
 * threshold. The threshold is a column setting (default 5). */
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
  exportColumns: [{ key: 'rapid_progression', value: ({ flags }: { flags: readonly CohortFlag[] }) => flags.some((flag) => flag.moduleId === RAPID_EGFR_DECLINE_MODULE_ID) ? 'yes' : '' }],
  cellFlags: (ctx: CellFlagContext, settings: RapidEgfrDeclineModuleSettings): CohortFlag[] => {
    const flag = rapidEgfrDeclineFlagForCell({
      patientId: ctx.patientId,
      bezeichnung: ctx.seriesKey.bezeichnung,
      einheit: ctx.seriesKey.einheit,
      slope: ctx.slope,
      threshold: settings.threshold,
    })
    return flag ? [flag] : []
  },
} satisfies SettingsModule<RapidEgfrDeclineModuleSettings, 'rapidEgfrDecline'>
