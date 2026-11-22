import { describe, expect, it } from 'vitest'
import { bedsideSchwartz, ckidU25, ckidU25K, ekfc2021 } from '../../src/core/domains/nephrology/egfr/formulas'
import goldens from '../goldens/egfr_paediatric.json'

// Hand-checked paediatric cases (issue #66); provenance in the fixture.
const EPS = 1e-5

describe('CKiD U25 fixture', () => {
  it.each(goldens.ckidU25)('age $ageYears, sex $sex, $heightCm cm, $scrMgdl mg/dl', (c) => {
    expect(Math.abs(ckidU25K(c.ageYears, c.sex as 'm' | 'w') - c.k)).toBeLessThan(EPS)
    expect(Math.abs(ckidU25({ scrMgdl: c.scrMgdl, ageYears: c.ageYears, sex: c.sex, heightCm: c.heightCm }) - c.egfr)).toBeLessThan(EPS)
  })
})

describe('bedside Schwartz fixture', () => {
  it.each(goldens.bedsideSchwartz)('$heightCm cm, $scrMgdl mg/dl', (c) => {
    expect(Math.abs(bedsideSchwartz({ scrMgdl: c.scrMgdl, heightCm: c.heightCm }) - c.egfr)).toBeLessThan(EPS)
  })
})

describe('EKFC fixture for children', () => {
  it.each(goldens.ekfc)('age $ageYears, sex $sex, $scrMgdl mg/dl', (c) => {
    expect(Math.abs(ekfc2021({ scrMgdl: c.scrMgdl, ageYears: c.ageYears, sex: c.sex }) - c.egfr)).toBeLessThan(EPS)
  })
})
