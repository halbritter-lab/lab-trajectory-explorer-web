import { describe, it, expect } from 'vitest'
import { ckdEpi2021, ekfc2021, mdrd4 } from '../../../src/core/egfr/formulas'

const close = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps

describe('ckdEpi2021', () => {
  it('returns NaN for unknown sex, sub-adult age, or non-positive creatinine', () => {
    expect(Number.isNaN(ckdEpi2021({ scrMgdl: 1, ageYears: 50, sex: null }))).toBe(true)
    expect(Number.isNaN(ckdEpi2021({ scrMgdl: 1, ageYears: 17, sex: 'm' }))).toBe(true)
    expect(Number.isNaN(ckdEpi2021({ scrMgdl: 0, ageYears: 50, sex: 'm' }))).toBe(true)
  })
  it('computes a plausible eGFR for a typical male', () => {
    expect(close(ckdEpi2021({ scrMgdl: 1.0, ageYears: 50, sex: 'm' }), 92, 2)).toBe(true)
  })
  it('female factor lowers eGFR vs male at the same inputs', () => {
    const m = ckdEpi2021({ scrMgdl: 1.0, ageYears: 50, sex: 'm' })
    const w = ckdEpi2021({ scrMgdl: 1.0, ageYears: 50, sex: 'w' })
    expect(w).not.toBe(m)
  })
  it("treats 'd' (diverse) like male", () => {
    expect(ckdEpi2021({ scrMgdl: 1.0, ageYears: 50, sex: 'd' })).toBe(ckdEpi2021({ scrMgdl: 1.0, ageYears: 50, sex: 'm' }))
  })
})

describe('mdrd4', () => {
  it('returns NaN on invalid inputs and a number for valid ones', () => {
    expect(Number.isNaN(mdrd4({ scrMgdl: 1, ageYears: 10, sex: 'm' }))).toBe(true)
    expect(mdrd4({ scrMgdl: 1.0, ageYears: 50, sex: 'm' })).toBeGreaterThan(0)
  })
})

describe('ekfc2021', () => {
  it('computes EKFC creatinine reference values', () => {
    expect(close(ekfc2021({ scrMgdl: 1.0, ageYears: 50, sex: 'm' }), 86.1, 0.05)).toBe(true)
    expect(close(ekfc2021({ scrMgdl: 1.0, ageYears: 50, sex: 'w' }), 64.8, 0.05)).toBe(true)
    expect(close(ekfc2021({ scrMgdl: 1.0, ageYears: 30, sex: 'm' }), 95.2, 0.05)).toBe(true)
  })

  it('uses the age-specific Q value for young adults', () => {
    expect(close(ekfc2021({ scrMgdl: 0.7, ageYears: 18, sex: 'w' }), 103.2, 0.05)).toBe(true)
  })

  it('keeps current adult-only app behavior for sub-18 rows', () => {
    expect(Number.isNaN(ekfc2021({ scrMgdl: 1.0, ageYears: 17, sex: 'm' }))).toBe(true)
  })
})
