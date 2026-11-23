import { describe, expect, it } from 'vitest'
import { bedsideSchwartz, ckidU25, ckidU25K, ekfc2021 } from '../../src/core/domains/nephrology/egfr/formulas'
import { appendComputedEgfr } from '../../src/core/domains/nephrology/egfr/series'
import type { LabRow } from '../../src/core/types'
import goldens from '../goldens/egfr_paediatric.json'

// Hand-checked paediatric cases (issue #66; age-1 derivation cases since 2026-11-23, OD-70); provenance in the fixture.
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

// Row-level derivation at the age floor of CKiD U25 (owner decision 2026-11-23, OD-70).
describe('derivation fixture at age 1', () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`)
  const base = { patientId: 1, wertOperator: '=' as const, loinc: null }
  it.each(goldens.derivation)('$case', (c) => {
    const rows: LabRow[] = [
      ...c.heights.map(([iso, cm]) => ({ ...base, labDatum: at(iso as string), bezeichnung: 'Größe', einheit: 'cm', wert: String(cm), wertNum: cm as number, patientSex: null, patientAgeAtLab: null })),
      { ...base, labDatum: at(c.creatinineDate), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: String(c.scrMgdl), wertNum: c.scrMgdl, patientSex: c.sex as 'm' | 'w', patientAgeAtLab: c.ageYears },
    ]
    const options = c.rule === 'full-age' ? { formula: 'ckid-u25-ekfc' as const } : { formula: 'ckd-epi-2021' as const, paediatric: c.rule as 'ckid-u25-ekfc' | 'schwartz-bedside' }
    const out = appendComputedEgfr(rows, options).filter((r) => r.sourceSeries)
    if (c.egfr === null) expect(out).toEqual([])
    else expect(out.map((r) => [r.wertNum, r.egfrFormula, r.egfrHeightCm])).toEqual([[c.egfr, c.egfrFormula, c.heightCm]])
  })
})
