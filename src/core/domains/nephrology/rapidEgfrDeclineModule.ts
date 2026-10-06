import type { AnalysisModule, CohortFlagContribution, RapidEgfrDeclineModuleSettings } from '../../analysis/types'
import type { PatientId } from '../../types'
import { isEgfrUnit } from './analytes'
import { DEFAULT_RAPID_EGFR_DECLINE } from './constants'

export { isEgfrUnit } from './analytes'
export const RAPID_EGFR_DECLINE_DEFAULT = DEFAULT_RAPID_EGFR_DECLINE

export function isRapidEgfrDecline(einheit: string | null, slope: number, threshold: number): boolean {
  return threshold > 0 && isEgfrUnit(einheit) && Number.isFinite(slope) && slope < -threshold
}

export const rapidEgfrDeclineModule: AnalysisModule<RapidEgfrDeclineModuleSettings> = {
  id: 'rapid-egfr-decline',
  label: 'Rapid eGFR decline',
  defaultSettings: { threshold: RAPID_EGFR_DECLINE_DEFAULT },
  apply: () => ({}),
}

export interface RapidEgfrDeclineFlagInput {
  patientId: PatientId
  bezeichnung: string
  einheit: string | null
  slope: number
  threshold: number
}

export function rapidEgfrDeclineFlagForCell(input: RapidEgfrDeclineFlagInput): CohortFlagContribution | null {
  if (!isRapidEgfrDecline(input.einheit, input.slope, input.threshold)) return null
  return {
    id: `rapid-egfr-decline:${input.patientId}:${input.bezeichnung}:${input.einheit ?? ''}`,
    patientId: input.patientId,
    seriesKey: { bezeichnung: input.bezeichnung, einheit: input.einheit },
    label: 'rapid ↓',
    severity: 'warning',
  }
}
