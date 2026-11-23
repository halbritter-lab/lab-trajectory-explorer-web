import { describe, expect, it } from 'vitest'
import { bedsideSchwartz, ckdEpi2009, ckdEpi2021, ckidU25, ekfc2021, mdrd4 } from '../../src/core/domains/nephrology/egfr/formulas'
import reference from './egfr.json'
import { expectClose } from './tolerance'

// eGFR equations against the R packages egfr and kidney.epi (issue #79, #34).
// egfr returns full precision: the same closed-form expression, 1e-12 relative.
// kidney.epi rounds to two decimals: 0.005 absolute plus the floating error.
// docs/reference-comparisons.md gives the justification and the differences.
const FULL = { rel: 1e-12, abs: 1e-12 }
const ROUNDED = { rel: 1e-12, abs: 0.005 + 1e-9 }

const adultFormulas = { ckdEpi2021, ckdEpi2009, mdrd4, ekfc: ekfc2021 } as const

/** kidney.epi's EKFC Q values for adults in µmol/l (80 men, 62 women), the
 * app's and egfr's in mg/dl (0.90, 0.70; 79.56 and 61.88 µmol/l): OD-85. */
function kidneyEpiEkfcAdult(scr: number, age: number, sex: string): number {
  const q = (sex === 'm' ? 80 : 62) / 88.4
  const ratio = scr / q
  return 107.3 * ratio ** (ratio < 1 ? -0.322 : -1.132) * (age > 40 ? 0.99 ** (age - 40) : 1)
}

describe(`adult eGFR against egfr and kidney.epi (R ${reference.environment.R})`, () => {
  it.each(Object.keys(adultFormulas) as (keyof typeof adultFormulas)[])('%s', (name) => {
    for (const c of reference.cases.adults) {
      const value = adultFormulas[name]({ scrMgdl: c.scrMgdl, ageYears: c.ageYears, sex: c.sex })
      const label = `${name} Scr ${c.scrMgdl} age ${c.ageYears} ${c.sex}`
      expectClose(value, c.egfr[name], FULL, `${label} vs egfr`)
      if (name !== 'ekfc' && c.ageYears === 18) {
        // kidney.epi's adult equations start above 18; the app's at 18.
        expect(c.kidneyEpi[name], `${label} kidney.epi range`).toBeNull()
      } else if (name === 'ckdEpi2009' && c.sex === 'w') {
        // Documented difference (OD-88): kidney.epi's female constant 144, the
        // app's and egfr's 141 × 1.018 = 143.538.
        expectClose(value * 144 / (141 * 1.018), c.kidneyEpi.ckdEpi2009, ROUNDED, `${label} kidney.epi constant 144`)
      } else if (name === 'ekfc' && c.ageYears > 25) {
        // Documented difference (OD-85): kidney.epi's adult Q in µmol/l.
        expectClose(kidneyEpiEkfcAdult(c.scrMgdl, c.ageYears, c.sex), c.kidneyEpi.ekfc, ROUNDED, `${label} kidney.epi Q`)
        expect(Math.abs(value - c.kidneyEpi.ekfc!) / value, `${label} kidney.epi difference`).toBeLessThan(0.008)
      } else {
        expectClose(value, c.kidneyEpi[name], ROUNDED, `${label} vs kidney.epi`)
      }
    }
  })
})

describe('paediatric eGFR against egfr and kidney.epi', () => {
  it('EKFC (age-dependent Q up to 25)', () => {
    for (const c of reference.cases.children) {
      const value = ekfc2021({ scrMgdl: c.scrMgdl, ageYears: c.ageYears, sex: c.sex })
      const label = `EKFC Scr ${c.scrMgdl} age ${c.ageYears} ${c.sex}`
      expectClose(value, c.egfr.ekfc, FULL, `${label} vs egfr`)
      // kidney.epi returns no value at age 2 itself (its range starts above 2).
      if (c.ageYears === 2) expect(c.kidneyEpi.ekfc).toBeNull()
      else expectClose(value, c.kidneyEpi.ekfc, ROUNDED, `${label} vs kidney.epi`)
    }
  })

  it('CKiD U25', () => {
    for (const c of reference.cases.children) {
      const value = ckidU25({ scrMgdl: c.scrMgdl, ageYears: c.ageYears, sex: c.sex, heightCm: c.heightCm })
      const label = `CKiD U25 Scr ${c.scrMgdl} age ${c.ageYears} ${c.sex}`
      expectClose(value, c.egfr.ckidU25, FULL, `${label} vs egfr`)
      if (c.ageYears >= 15 && c.ageYears < 18) {
        // Documented difference (OD-86, resolved 2026-11-23: the app's
        // formula stays): kidney.epi uses a constant k of 41.8 (boys) and
        // 37.6 (girls) from 15 to under 18, which does not match the
        // published formula.
        const k = c.sex === 'm' ? 41.8 : 37.6
        expectClose(k * (c.heightCm / 100) / c.scrMgdl, c.kidneyEpi.ckidU25, ROUNDED, `${label} kidney.epi constant`)
      } else {
        expectClose(value, c.kidneyEpi.ckidU25, ROUNDED, `${label} vs kidney.epi`)
      }
    }
  })

  it('bedside Schwartz', () => {
    for (const c of reference.cases.children) {
      const value = bedsideSchwartz({ scrMgdl: c.scrMgdl, heightCm: c.heightCm })
      const label = `bedside Schwartz Scr ${c.scrMgdl} height ${c.heightCm}`
      expectClose(value, c.egfr.bedsideSchwartz, FULL, `${label} vs egfr`)
      expectClose(value, c.kidneyEpi.bedsideSchwartz, ROUNDED, `${label} vs kidney.epi`)
    }
  })
})
