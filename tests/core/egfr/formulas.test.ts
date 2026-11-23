import { describe, it, expect } from 'vitest'
import { bedsideSchwartz, ckdEpi2009, ckdEpi2021, ckidU25, ckidU25K, ekfc2021, mdrd4, normaliseSex, isUnrecognisedSex } from '../../../src/core/domains/nephrology/egfr/formulas'

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

describe('ckdEpi2009', () => {
  // Expected values computed independently from Levey 2009 (without race term).
  it('matches hand-computed values for both creatinine branches', () => {
    expect(ckdEpi2009({ scrMgdl: 1.2, ageYears: 60, sex: 'm' })).toBeCloseTo(65.331569, 5)
    expect(ckdEpi2009({ scrMgdl: 1.2, ageYears: 60, sex: 'w' })).toBeCloseTo(49.081204, 5)
    expect(ckdEpi2009({ scrMgdl: 0.6, ageYears: 40, sex: 'w' })).toBeCloseTo(114.015087, 5)
    expect(ckdEpi2009({ scrMgdl: 0.6, ageYears: 40, sex: 'm' })).toBeCloseTo(125.765801, 5)
  })
  it('returns NaN under the same conditions as CKD-EPI 2021', () => {
    expect(Number.isNaN(ckdEpi2009({ scrMgdl: 1, ageYears: 50, sex: null }))).toBe(true)
    expect(Number.isNaN(ckdEpi2009({ scrMgdl: 1, ageYears: 17, sex: 'm' }))).toBe(true)
    expect(Number.isNaN(ckdEpi2009({ scrMgdl: 0, ageYears: 50, sex: 'm' }))).toBe(true)
    expect(Number.isNaN(ckdEpi2009({ scrMgdl: 1, ageYears: 50, sex: 'unknown' }))).toBe(true)
    expect(Number.isNaN(ckdEpi2009({ scrMgdl: 1, ageYears: 18, sex: 'm' }))).toBe(false)
  })
  it("treats 'd' (diverse) like male", () => {
    expect(ckdEpi2009({ scrMgdl: 1.0, ageYears: 50, sex: 'd' })).toBe(ckdEpi2009({ scrMgdl: 1.0, ageYears: 50, sex: 'm' }))
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

  // Since 2026-11-22 (issue #66) EKFC is computed from age 2: Q from the
  // polynomial (Pottel 2021), 69.9389 µmol/l for a male aged 17.
  it('is valid from age 2 and gives no value below 2', () => {
    // 1.0 / (69.9389 / 88.4) = 1.263960 ≥ 1, so the exponent is −1.132: 107.3 × 1.263960^−1.132 = 82.307
    expect(close(ekfc2021({ scrMgdl: 1.0, ageYears: 17, sex: 'm' }), 82.307140, 1e-5)).toBe(true)
    // Q = exp(3.200 + 0.259·2 − 0.543·ln 2 − 0.00763·4 + 0.0000790·8) = 27.4326 µmol/l = 0.310324 mg/dl;
    // 0.25/0.310324 = 0.805610 < 1: 107.3 × 0.805610^−0.322 = 115.034
    expect(close(ekfc2021({ scrMgdl: 0.25, ageYears: 2, sex: 'm' }), 115.034342, 1e-5)).toBe(true)
    expect(Number.isNaN(ekfc2021({ scrMgdl: 0.25, ageYears: 1.9, sex: 'm' }))).toBe(true)
    expect(Number.isNaN(ekfc2021({ scrMgdl: 0.25, ageYears: 1, sex: 'w' }))).toBe(true)
  })
})

describe('ckidU25 (Pierce 2021)', () => {
  // k × height [m] / Scr; k by sex and age band. Hand-computed:
  // 1.008^−11 = exp(−11 × 0.0079681) = 0.916082; 1.008^−7 = 0.945750;
  // 1.045^5 = 1.246182; 1.023^5 = 1.120413.
  it.each([
    [1, 'm', 75, 0.25, 39.0 * 0.916082, 107.1815],   // k = 35.7272
    [1, 'w', 74, 0.25, 36.1 * 0.916082, 97.8888],    // k = 33.0705
    [5, 'm', 110, 0.35, 39.0 * 0.945750, 115.9219],  // k = 36.8842
    [12, 'm', 150, 0.6, 39.0, 97.5],                 // band start: 39.0 × 1.045^0
    [12, 'w', 150, 0.6, 36.1, 90.25],
    [17, 'm', 176, 0.9, 39.0 * 1.246182, 95.0421],   // k = 48.6011
    [17, 'w', 164, 0.75, 36.1 * 1.120413, 88.4439],  // k = 40.4469
    [18, 'm', 178, 0.95, 50.8, 95.1832],
    [18, 'w', 165, 0.75, 41.4, 91.08],
    [24.9, 'm', 180, 1.0, 50.8, 91.44],
    [24.9, 'w', 166, 0.8, 41.4, 85.905],
  ] as const)('age %s, sex %s, %s cm, %s mg/dl', (age, sex, height, scr, k, egfr) => {
    expect(ckidU25K(age, sex)).toBeCloseTo(k, 3)
    expect(ckidU25({ scrMgdl: scr, ageYears: age, sex, heightCm: height })).toBeCloseTo(egfr, 3)
  })
  it('uses the male constants for d, and gives no value outside 1 to 25 years or without height', () => {
    expect(ckidU25({ scrMgdl: 0.6, ageYears: 12, sex: 'd', heightCm: 150 })).toBe(97.5)
    expect(Number.isNaN(ckidU25({ scrMgdl: 0.6, ageYears: 0.9, sex: 'm', heightCm: 70 }))).toBe(true)
    expect(Number.isNaN(ckidU25({ scrMgdl: 0.6, ageYears: 26, sex: 'm', heightCm: 180 }))).toBe(true)
    expect(ckidU25({ scrMgdl: 1.0, ageYears: 25, sex: 'm', heightCm: 180 })).toBeCloseTo(91.44, 6)
    expect(Number.isNaN(ckidU25({ scrMgdl: 0.6, ageYears: 12, sex: 'm', heightCm: 0 }))).toBe(true)
    expect(Number.isNaN(ckidU25({ scrMgdl: 0.6, ageYears: 12, sex: null, heightCm: 150 }))).toBe(true)
  })
})

describe('bedsideSchwartz (Schwartz 2009)', () => {
  it('is 0.413 × height [cm] / Scr', () => {
    expect(bedsideSchwartz({ scrMgdl: 0.5, heightCm: 120 })).toBeCloseTo(99.12, 9)
    expect(bedsideSchwartz({ scrMgdl: 0.6, heightCm: 150 })).toBeCloseTo(103.25, 9)
    expect(Number.isNaN(bedsideSchwartz({ scrMgdl: 0, heightCm: 150 }))).toBe(true)
  })
})

describe('normaliseSex', () => {
  it('accepts German and English, short and long forms', () => {
    for (const raw of ['m', 'M', ' male ', 'Mann', 'männlich', 'maennlich']) {
      expect(normaliseSex(raw)).toBe('m')
    }
    for (const raw of ['w', 'W', 'f', 'Female', 'weiblich', 'Frau']) {
      expect(normaliseSex(raw)).toBe('w')
    }
    for (const raw of ['d', 'divers', 'Diverse']) {
      expect(normaliseSex(raw)).toBe('d')
    }
  })

  it('does not map unknown-sex placeholders onto d', () => {
    // 'd' uses male coefficients, so treating an unrecorded sex as 'd' would
    // silently produce a sex-specific eGFR for a patient who has no sex on file.
    for (const raw of ['other', 'x', 'unknown', 'n/a', '?']) {
      expect(normaliseSex(raw)).toBeNull()
    }
  })

  it('reports unrecognised values but not absent ones', () => {
    expect(isUnrecognisedSex('unknown')).toBe(true)
    expect(isUnrecognisedSex('female')).toBe(false)
    expect(isUnrecognisedSex(null)).toBe(false)
    expect(isUnrecognisedSex(undefined)).toBe(false)
    expect(isUnrecognisedSex('  ')).toBe(false)
  })
})

describe('sex aliases in the equations', () => {
  it('gives an English spelling the same eGFR as its German equivalent', () => {
    const input = { scrMgdl: 1.1, ageYears: 55 }
    expect(ckdEpi2021({ ...input, sex: 'female' })).toBe(ckdEpi2021({ ...input, sex: 'w' }))
    expect(ckdEpi2009({ ...input, sex: 'female' })).toBe(ckdEpi2009({ ...input, sex: 'w' }))
    expect(mdrd4({ ...input, sex: 'male' })).toBe(mdrd4({ ...input, sex: 'm' }))
    expect(ekfc2021({ ...input, sex: 'f' })).toBe(ekfc2021({ ...input, sex: 'w' }))
  })
})
