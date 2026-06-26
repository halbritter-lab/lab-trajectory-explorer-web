import { describe, expect, it } from 'vitest'
import { DEFAULT_MIXED_MODEL_CONFIG, type MixedModelConfig } from '../../../src/core/mixedModel/config'
import { hashMixedModelInput, hashString, validateMixedModelRows } from '../../../src/core/mixedModel/validation'
import type { MixedModelSpikeRow } from '../../../src/core/mixedModel/types'

const NO_COVARIATE_CONFIG: MixedModelConfig = {
  timeAxis: 'time_since_baseline',
  covariates: [],
  randomEffects: 'intercept_slope',
}

const rows: MixedModelSpikeRow[] = [
  { patient_id: '1', eGFR: 60, time_since_baseline: 0 },
  { patient_id: '1', eGFR: 58, time_since_baseline: 1 },
  { patient_id: '2', eGFR: 62, time_since_baseline: 0 },
  { patient_id: '2', eGFR: 59, time_since_baseline: 1 },
  { patient_id: '3', eGFR: 57, time_since_baseline: 0 },
  { patient_id: '3', eGFR: 54, time_since_baseline: 1 },
]

describe('validateMixedModelRows', () => {
  it('accepts at least 3 patients with repeated finite measurements and time variation', () => {
    expect(validateMixedModelRows(rows, NO_COVARIATE_CONFIG)).toEqual({ ok: true, warnings: [] })
  })

  it('rejects empty datasets before fitting', () => {
    expect(validateMixedModelRows([])).toMatchObject({
      ok: false,
      code: 'EMPTY_DATASET',
      stage: 'data-validation',
      message: expect.any(String),
      warnings: [],
    })
  })

  it('rejects empty patient IDs before fitting', () => {
    expect(validateMixedModelRows([{ ...rows[0], patient_id: ' ' }, ...rows.slice(1)])).toMatchObject({
      ok: false,
      code: 'EMPTY_PATIENT_ID',
      stage: 'data-validation',
      message: expect.any(String),
      warnings: [],
    })
  })

  it('rejects non-finite eGFR values before fitting', () => {
    expect(validateMixedModelRows([{ ...rows[0], eGFR: Number.NaN }, ...rows.slice(1)])).toMatchObject({
      ok: false,
      code: 'NON_FINITE_VALUE',
      stage: 'data-validation',
      message: expect.any(String),
      warnings: [],
    })
  })

  it('rejects non-finite time values before fitting', () => {
    expect(validateMixedModelRows([{ ...rows[0], time_since_baseline: Number.POSITIVE_INFINITY }, ...rows.slice(1)])).toMatchObject({
      ok: false,
      code: 'NON_FINITE_VALUE',
      stage: 'data-validation',
      message: expect.any(String),
      warnings: [],
    })
  })

  it('rejects fewer than 3 patients', () => {
    expect(validateMixedModelRows(rows.filter((row) => row.patient_id !== '3'), NO_COVARIATE_CONFIG)).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_PATIENTS',
    })
  })

  it('rejects patients with fewer than 2 rows', () => {
    expect(validateMixedModelRows(
      rows.filter((row) => !(row.patient_id === '3' && row.time_since_baseline === 1)),
      NO_COVARIATE_CONFIG,
    )).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_REPEATED_MEASURES',
    })
  })

  it('rejects duplicate patient/time rows', () => {
    expect(validateMixedModelRows([...rows, rows[0]], NO_COVARIATE_CONFIG)).toMatchObject({
      ok: false,
      code: 'DUPLICATE_PATIENT_TIME',
    })
  })

  it('uses exact time values for duplicate detection', () => {
    expect(validateMixedModelRows(
      [...rows, { patient_id: '1', eGFR: 57, time_since_baseline: 0.00000000001 }],
      NO_COVARIATE_CONFIG,
    )).toEqual({
      ok: true,
      warnings: [],
    })
  })

  it('rejects patients with no within-patient time variation', () => {
    const noTimeVariationRows: MixedModelSpikeRow[] = [
      { patient_id: '1', eGFR: 60, time_since_baseline: 0 },
      { patient_id: '1', eGFR: 59, time_since_baseline: 0 },
      { patient_id: '2', eGFR: 62, time_since_baseline: 0 },
      { patient_id: '2', eGFR: 59, time_since_baseline: 1 },
      { patient_id: '3', eGFR: 57, time_since_baseline: 0 },
      { patient_id: '3', eGFR: 54, time_since_baseline: 1 },
    ]

    expect(validateMixedModelRows(noTimeVariationRows, NO_COVARIATE_CONFIG)).toMatchObject({
      ok: false,
      code: 'NO_WITHIN_PATIENT_TIME_VARIATION',
      stage: 'data-validation',
      message: expect.any(String),
      warnings: [],
    })
  })

  it('uses exact time values for within-patient time variation', () => {
    const exactTimeVariationRows: MixedModelSpikeRow[] = [
      { patient_id: '1', eGFR: 60, time_since_baseline: 0 },
      { patient_id: '1', eGFR: 58, time_since_baseline: 0.00000000001 },
      { patient_id: '2', eGFR: 62, time_since_baseline: 0 },
      { patient_id: '2', eGFR: 59, time_since_baseline: 1 },
      { patient_id: '3', eGFR: 57, time_since_baseline: 0 },
      { patient_id: '3', eGFR: 54, time_since_baseline: 1 },
    ]

    expect(validateMixedModelRows(exactTimeVariationRows, NO_COVARIATE_CONFIG)).toEqual({ ok: true, warnings: [] })
  })

  it('requires baseline age by default', () => {
    const result = validateMixedModelRows([
      { patient_id: 'p1', eGFR: 70, time_since_baseline: 0 },
      { patient_id: 'p1', eGFR: 68, time_since_baseline: 1 },
      { patient_id: 'p2', eGFR: 60, time_since_baseline: 0, baseline_age: 60, baseline_age_centered: -5 },
      { patient_id: 'p2', eGFR: 58, time_since_baseline: 1, baseline_age: 60, baseline_age_centered: -5 },
      { patient_id: 'p3', eGFR: 55, time_since_baseline: 0, baseline_age: 70, baseline_age_centered: 5 },
      { patient_id: 'p3', eGFR: 53, time_since_baseline: 1, baseline_age: 70, baseline_age_centered: 5 },
    ])

    expect(result).toMatchObject({
      ok: false,
      code: 'MISSING_BASELINE_AGE',
    })
  })

  it('requires baseline age when baseline_age covariate is selected', () => {
    const result = validateMixedModelRows([
      { patient_id: 'p1', eGFR: 70, time_since_baseline: 0 },
      { patient_id: 'p1', eGFR: 68, time_since_baseline: 1 },
      { patient_id: 'p2', eGFR: 60, time_since_baseline: 0, baseline_age: 60, baseline_age_centered: -5 },
      { patient_id: 'p2', eGFR: 58, time_since_baseline: 1, baseline_age: 60, baseline_age_centered: -5 },
      { patient_id: 'p3', eGFR: 55, time_since_baseline: 0, baseline_age: 70, baseline_age_centered: 5 },
      { patient_id: 'p3', eGFR: 53, time_since_baseline: 1, baseline_age: 70, baseline_age_centered: 5 },
    ], DEFAULT_MIXED_MODEL_CONFIG)

    expect(result).toMatchObject({
      ok: false,
      code: 'MISSING_BASELINE_AGE',
    })
  })

  it('produces stable hashes independent of input row order', () => {
    expect(hashMixedModelInput(rows)).toBe(hashMixedModelInput([...rows].reverse()))
  })

  it('canonicalizes hashes by patient, time, eGFR, and 10-decimal numeric rounding', () => {
    const canonicalRows: MixedModelSpikeRow[] = [
      { patient_id: '2', eGFR: 62.00000000004, time_since_baseline: 0 },
      { patient_id: '1', eGFR: 60, time_since_baseline: 0.00000000004 },
      { patient_id: '1', eGFR: 58, time_since_baseline: 1 },
    ]
    const equivalentRows: MixedModelSpikeRow[] = [
      { patient_id: '1', eGFR: 58, time_since_baseline: 1 },
      { patient_id: '1', eGFR: 60, time_since_baseline: 0 },
      { patient_id: '2', eGFR: 62, time_since_baseline: 0 },
    ]
    const differentRoundedRows: MixedModelSpikeRow[] = [
      { patient_id: '1', eGFR: 58, time_since_baseline: 1 },
      { patient_id: '1', eGFR: 60, time_since_baseline: 0.00000000006 },
      { patient_id: '2', eGFR: 62, time_since_baseline: 0 },
    ]

    expect(hashMixedModelInput(canonicalRows)).toBe(hashMixedModelInput(equivalentRows))
    expect(hashMixedModelInput(canonicalRows)).not.toBe(hashMixedModelInput(differentRoundedRows))
  })

  it('canonicalizes runtime null baseline age as missing, not zero', () => {
    const missingBaselineAge: MixedModelSpikeRow[] = [
      { patient_id: '1', eGFR: 60, time_since_baseline: 0 },
    ]
    const nullBaselineAge = [
      { patient_id: '1', eGFR: 60, time_since_baseline: 0, baseline_age: null },
    ] as unknown as MixedModelSpikeRow[]
    const zeroBaselineAge: MixedModelSpikeRow[] = [
      { patient_id: '1', eGFR: 60, time_since_baseline: 0, baseline_age: 0 },
    ]

    expect(hashMixedModelInput(nullBaselineAge)).toBe(hashMixedModelInput(missingBaselineAge))
    expect(hashMixedModelInput(nullBaselineAge)).not.toBe(hashMixedModelInput(zeroBaselineAge))
  })
})

describe('hashString', () => {
  it('returns an 8-character FNV-1a 32-bit hex hash for known input', () => {
    expect(hashString('hello')).toBe('4f9f2cab')
  })
})
