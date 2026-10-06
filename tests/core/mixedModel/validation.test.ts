import { describe, expect, it } from 'vitest'
import type { MixedModelConfig } from '../../../src/core/mixedModel/config'
import { hashMixedModelInput, hashString, validateMixedModelRows } from '../../../src/core/mixedModel/validation'
import type { MixedModelSpikeRow } from '../../../src/core/mixedModel/types'

const NO_COVARIATE_CONFIG: MixedModelConfig = {
  timeAxis: 'time_since_baseline',
  covariates: [],
  randomEffects: 'intercept_slope',
}

const BASELINE_AGE_CONFIG: MixedModelConfig = {
  timeAxis: 'time_since_baseline',
  covariates: ['baseline_age'],
  randomEffects: 'intercept_slope',
}

const rows: MixedModelSpikeRow[] = Array.from({ length: 10 }, (_, index) =>
  [0, 1, 2].map((time_since_baseline) => ({
    patient_id: String(index + 1), value: 60 - index - time_since_baseline,
    time_since_baseline,
  })),
).flat()

describe('validateMixedModelRows', () => {
  it('accepts 10 patients with three distinct times for a random slope', () => {
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
    expect(validateMixedModelRows([{ ...rows[0], value: Number.NaN }, ...rows.slice(1)])).toMatchObject({
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

  it('rejects nine patients even when all have three distinct times', () => {
    expect(validateMixedModelRows(rows.filter((row) => row.patient_id !== '10'), NO_COVARIATE_CONFIG)).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_PATIENTS',
      message: 'Mixed model fitting requires at least 10 patients.',
    })
  })

  it('rejects patients with fewer than 2 rows', () => {
    expect(validateMixedModelRows(
      rows.filter((row) => !(row.patient_id === '10' && row.time_since_baseline !== 0)),
      NO_COVARIATE_CONFIG,
    )).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_REPEATED_MEASURES',
    })
  })

  it('does not count a singleton tenth patient toward the repeated-patient minimum', () => {
    const ninePlusSingleton = [...rows.filter(row => row.patient_id !== '10'),
      { patient_id: '10', value: 50, time_since_baseline: 0 }]
    expect(validateMixedModelRows(ninePlusSingleton, NO_COVARIATE_CONFIG)).toMatchObject({
      ok: false, code: 'INSUFFICIENT_REPEATED_MEASURES',
      message: 'Mixed model fitting requires at least 10 patients with at least 3 distinct measurement times each.',
    })
  })

  it('requires two distinct times per patient for a random intercept', () => {
    const twoTimeRows = rows.filter(row => row.time_since_baseline !== 2)
    const interceptConfig: MixedModelConfig = { ...NO_COVARIATE_CONFIG, randomEffects: 'intercept' }
    expect(validateMixedModelRows(twoTimeRows, interceptConfig)).toEqual({ ok: true, warnings: [] })
    expect(validateMixedModelRows(twoTimeRows, NO_COVARIATE_CONFIG)).toMatchObject({
      ok: false, code: 'INSUFFICIENT_REPEATED_MEASURES',
    })
    expect(validateMixedModelRows([...twoTimeRows, { ...twoTimeRows[0], time_since_baseline: 0 }], interceptConfig)).toEqual({
      ok: true, warnings: ['1 duplicate patient/time row was retained for mixed model fitting.'],
    })
  })

  it('warns when an extra patient has only two times for a random slope', () => {
    expect(validateMixedModelRows([...rows,
      { patient_id: '11', value: 51, time_since_baseline: 0 },
      { patient_id: '11', value: 50, time_since_baseline: 1 },
    ], NO_COVARIATE_CONFIG)).toEqual({ ok: true, warnings: [
      '1 patient has fewer than 3 distinct time_since_baseline values and contributes limited within-patient time information.',
    ] })
  })

  it('accepts an otherwise fit-ready cohort when an extra patient has only one measurement', () => {
    const result = validateMixedModelRows(
      [...rows, { patient_id: '004-0141', value: 51, time_since_baseline: 0 }],
      NO_COVARIATE_CONFIG,
    )

    expect(result).toEqual({
      ok: true,
      warnings: ['1 patient has fewer than 2 repeated measurements and contributes limited within-patient information.'],
    })
  })

  it('accepts an otherwise fit-ready cohort when an extra patient has no time variation', () => {
    const result = validateMixedModelRows(
      [...rows, { patient_id: '045-1315', value: 51, time_since_baseline: 0 }, { patient_id: '045-1315', value: 50, time_since_baseline: 0 }],
      NO_COVARIATE_CONFIG,
    )

    expect(result).toEqual({
      ok: true,
      warnings: ['1 patient has fewer than 3 distinct time_since_baseline values and contributes limited within-patient time information.'],
    })
  })

  it('warns about duplicate patient/time rows without blocking an otherwise fit-ready cohort', () => {
    expect(validateMixedModelRows([...rows, rows[0]], NO_COVARIATE_CONFIG)).toEqual({
      ok: true,
      warnings: ['1 duplicate patient/time row was retained for mixed model fitting.'],
    })
  })

  it('uses exact time values for duplicate detection', () => {
    expect(validateMixedModelRows(
      [...rows, { patient_id: '1', value: 57, time_since_baseline: 0.00000000001 }],
      NO_COVARIATE_CONFIG,
    )).toEqual({
      ok: true,
      warnings: [],
    })
  })

  it('rejects ten patients when one has only two distinct times despite duplicate rows', () => {
    const noTimeVariationRows = [...rows.filter(row => !(row.patient_id === '10' && row.time_since_baseline === 2)),
      { patient_id: '10', value: 50, time_since_baseline: 1 }]

    expect(validateMixedModelRows(noTimeVariationRows, NO_COVARIATE_CONFIG)).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_REPEATED_MEASURES',
      stage: 'data-validation',
      message: expect.any(String),
      warnings: [],
    })
  })

  it('uses exact time values for within-patient time variation', () => {
    const exactTimeVariationRows = rows.map(row => row.patient_id === '10' && row.time_since_baseline === 2
      ? { ...row, time_since_baseline: 0.00000000001 } : row)

    expect(validateMixedModelRows(exactTimeVariationRows, NO_COVARIATE_CONFIG)).toEqual({ ok: true, warnings: [] })
  })

  it('does not require baseline age by default', () => {
    const result = validateMixedModelRows(rows)

    expect(result).toEqual({ ok: true, warnings: [] })
  })

  it('requires baseline age when baseline_age covariate is selected', () => {
    const result = validateMixedModelRows(rows.map(row => row.patient_id === '1' ? row : {
      ...row, baseline_age: 60, baseline_age_centered: 0,
    }), BASELINE_AGE_CONFIG)

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
      { patient_id: '2', value: 62.00000000004, time_since_baseline: 0 },
      { patient_id: '1', value: 60, time_since_baseline: 0.00000000004 },
      { patient_id: '1', value: 58, time_since_baseline: 1 },
    ]
    const equivalentRows: MixedModelSpikeRow[] = [
      { patient_id: '1', value: 58, time_since_baseline: 1 },
      { patient_id: '1', value: 60, time_since_baseline: 0 },
      { patient_id: '2', value: 62, time_since_baseline: 0 },
    ]
    const differentRoundedRows: MixedModelSpikeRow[] = [
      { patient_id: '1', value: 58, time_since_baseline: 1 },
      { patient_id: '1', value: 60, time_since_baseline: 0.00000000006 },
      { patient_id: '2', value: 62, time_since_baseline: 0 },
    ]

    expect(hashMixedModelInput(canonicalRows)).toBe(hashMixedModelInput(equivalentRows))
    expect(hashMixedModelInput(canonicalRows)).not.toBe(hashMixedModelInput(differentRoundedRows))
  })

  it('canonicalizes runtime null baseline age as missing, not zero', () => {
    const missingBaselineAge: MixedModelSpikeRow[] = [
      { patient_id: '1', value: 60, time_since_baseline: 0 },
    ]
    const nullBaselineAge = [
      { patient_id: '1', value: 60, time_since_baseline: 0, baseline_age: null },
    ] as unknown as MixedModelSpikeRow[]
    const zeroBaselineAge: MixedModelSpikeRow[] = [
      { patient_id: '1', value: 60, time_since_baseline: 0, baseline_age: 0 },
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
