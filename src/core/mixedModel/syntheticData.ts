import type { MixedModelSpikeRow } from './types'

export const MIXED_MODEL_SYNTHETIC_DATASET_ID = 'synthetic-random-slope-v1'

const PATIENT_PARAMETERS = [
  { patient_id: 'p1', intercept: 65, slope: -2.3, baseline_age: 50 },
  { patient_id: 'p2', intercept: 58, slope: -1.4, baseline_age: 60 },
  { patient_id: 'p3', intercept: 72, slope: -3.1, baseline_age: 70 },
  { patient_id: 'p4', intercept: 61, slope: -2.0, baseline_age: 80 },
] as const

const TIMES = [0, 1, 2, 3] as const

export function syntheticMixedModelRows(): MixedModelSpikeRow[] {
  const meanBaselineAge = PATIENT_PARAMETERS.reduce((sum, patient) => sum + patient.baseline_age, 0) / PATIENT_PARAMETERS.length
  return PATIENT_PARAMETERS.flatMap(({ patient_id, intercept, slope, baseline_age }) =>
    TIMES.map((time_since_baseline) => ({
      patient_id,
      eGFR: roundTo1Decimal(intercept + slope * time_since_baseline),
      time_since_baseline,
      baseline_age,
      baseline_age_centered: baseline_age - meanBaselineAge,
    })),
  )
}

function roundTo1Decimal(value: number): number {
  return Math.round(value * 10) / 10
}
