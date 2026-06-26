import { describe, expect, it } from 'vitest'
import { DEFAULT_MIXED_MODEL_CONFIG } from '../../../src/core/mixedModel/config'
import { MIXED_MODEL_SYNTHETIC_DATASET_ID, syntheticMixedModelRows } from '../../../src/core/mixedModel/syntheticData'
import { validateMixedModelRows } from '../../../src/core/mixedModel/validation'

describe('syntheticMixedModelRows', () => {
  it('provides a deterministic valid random-slope fixture', () => {
    const rows = syntheticMixedModelRows()
    expect(MIXED_MODEL_SYNTHETIC_DATASET_ID).toBe('synthetic-random-slope-v1')
    expect(rows).toHaveLength(16)
    expect(new Set(rows.map((row) => row.patient_id))).toEqual(new Set(['p1', 'p2', 'p3', 'p4']))
    expect(validateMixedModelRows(rows)).toEqual({ ok: true, warnings: [] })
    expect(validateMixedModelRows(rows, DEFAULT_MIXED_MODEL_CONFIG)).toEqual({ ok: true, warnings: [] })
    expect(rows).toEqual([
      { patient_id: 'p1', eGFR: 65, time_since_baseline: 0, baseline_age: 50, baseline_age_centered: -15 },
      { patient_id: 'p1', eGFR: 62.7, time_since_baseline: 1, baseline_age: 50, baseline_age_centered: -15 },
      { patient_id: 'p1', eGFR: 60.4, time_since_baseline: 2, baseline_age: 50, baseline_age_centered: -15 },
      { patient_id: 'p1', eGFR: 58.1, time_since_baseline: 3, baseline_age: 50, baseline_age_centered: -15 },
      { patient_id: 'p2', eGFR: 58, time_since_baseline: 0, baseline_age: 60, baseline_age_centered: -5 },
      { patient_id: 'p2', eGFR: 56.6, time_since_baseline: 1, baseline_age: 60, baseline_age_centered: -5 },
      { patient_id: 'p2', eGFR: 55.2, time_since_baseline: 2, baseline_age: 60, baseline_age_centered: -5 },
      { patient_id: 'p2', eGFR: 53.8, time_since_baseline: 3, baseline_age: 60, baseline_age_centered: -5 },
      { patient_id: 'p3', eGFR: 72, time_since_baseline: 0, baseline_age: 70, baseline_age_centered: 5 },
      { patient_id: 'p3', eGFR: 68.9, time_since_baseline: 1, baseline_age: 70, baseline_age_centered: 5 },
      { patient_id: 'p3', eGFR: 65.8, time_since_baseline: 2, baseline_age: 70, baseline_age_centered: 5 },
      { patient_id: 'p3', eGFR: 62.7, time_since_baseline: 3, baseline_age: 70, baseline_age_centered: 5 },
      { patient_id: 'p4', eGFR: 61, time_since_baseline: 0, baseline_age: 80, baseline_age_centered: 15 },
      { patient_id: 'p4', eGFR: 59, time_since_baseline: 1, baseline_age: 80, baseline_age_centered: 15 },
      { patient_id: 'p4', eGFR: 57, time_since_baseline: 2, baseline_age: 80, baseline_age_centered: 15 },
      { patient_id: 'p4', eGFR: 55, time_since_baseline: 3, baseline_age: 80, baseline_age_centered: 15 },
    ])
  })
})
