import type { AnalysisModule, CohortFlagContribution, RapidEgfrDeclineModuleSettings } from './types'
import type { PatientId } from '../types'

export const RAPID_EGFR_DECLINE_DEFAULT = 5

export function isEgfrUnit(einheit: string | null): boolean {
  return einheit != null && einheit.toLowerCase().includes('ml/min')
}

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
