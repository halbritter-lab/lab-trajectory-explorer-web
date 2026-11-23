// Issue #66 (owner decisions `peds-eq`, `height` and `switch` of 2026-11-22):
// equations for children and adolescents, the height series and formula changes.
import { describe, expect, it } from 'vitest'
import { appendComputedEgfr, egfrFormulaSwitches, fitCrossesFormulaSwitch, heightOnDate, patientHeights, rowEgfrFormula } from '../../../src/core/domains/nephrology/egfr/series'
import { isHeightSeries } from '../../../src/core/domains/nephrology/analytes'
import type { LabRow } from '../../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1.0', wertNum: 1.0, wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: 50, ...p }
}
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const height = (iso: string, cm: number, p: Partial<LabRow> = {}) => row({ labDatum: day(iso), bezeichnung: 'Größe', einheit: 'cm', wert: String(cm), wertNum: cm, patientSex: null, patientAgeAtLab: null, ...p })
const crea = (iso: string, value: number, age: number, p: Partial<LabRow> = {}) => row({ labDatum: day(iso), wert: String(value), wertNum: value, patientAgeAtLab: age, ...p })
const computed = (rows: LabRow[]) => rows.filter((r) => r.sourceSeries)

describe('height series', () => {
  it('recognises a height series by name and cm, or by LOINC', () => {
    for (const name of ['Größe', 'Körpergröße', ' height ', 'Body height', 'GROESSE', 'Körpergrösse']) expect(isHeightSeries(name, 'cm')).toBe(true)
    expect(isHeightSeries('Größe', 'CM')).toBe(true)
    expect(isHeightSeries('Größe', 'm')).toBe(false)
    expect(isHeightSeries('Größe Niere', 'cm')).toBe(false)
    expect(isHeightSeries('Länge', 'cm')).toBe(false)
    expect(isHeightSeries('Body Ht', 'cm', '8302-2')).toBe(true)
    expect(isHeightSeries('Body Ht', 'mm', '8302-2')).toBe(false)
  })

  it('uses a height of the same day, interpolates between two heights at most 90 days away, never extrapolates', () => {
    const heights = patientHeights([height('2020-01-01', 120), height('2020-01-01', 122), height('2020-03-31', 130), height('2020-01-01', 1, { wertOperator: '<' })]).get('1')!
    // Two values of one day are averaged; the bound is left out.
    expect(heights.map((h) => h.cm)).toEqual([121, 130])
    expect(heightOnDate(heights, day('2020-01-01'), 90)).toEqual({ cm: 121, basis: 'measured' })
    // 2020-02-15 is 45 days after 2020-01-01 and 45 days before 2020-03-31: 121 + 9 × 45/90 = 125.5.
    expect(heightOnDate(heights, day('2020-02-15'), 90)).toEqual({ cm: 125.5, basis: 'interpolated' })
    // Both neighbours must be within the limit: 89 days before and 93 after is too far.
    const far = patientHeights([height('2020-01-01', 120), height('2020-07-01', 126)]).get('1')!
    expect(heightOnDate(far, day('2020-03-30'), 90)).toEqual({ gap: 'height_gap' })
    // 89 days before and exactly 90 after: 120 + 6 × 89/179.
    const near = patientHeights([height('2020-01-01', 120), height('2020-06-28', 126)]).get('1')!
    expect(heightOnDate(near, day('2020-03-30'), 90)).toEqual({ cm: 120 + 6 * 89 / 179, basis: 'interpolated' })
    expect(heightOnDate(heights, day('2020-04-01'), 90)).toEqual({ gap: 'height_gap' }) // after the last height
    expect(heightOnDate(heights, day('2019-12-31'), 90)).toEqual({ gap: 'height_gap' }) // before the first
    expect(heightOnDate(undefined, day('2020-01-01'), 90)).toEqual({ gap: 'no_height' })
  })
})

describe('equation per row', () => {
  it('chooses the equation by formula, under-18 rule, age and height', () => {
    const heights = patientHeights([height('2020-01-01', 150)]).get('1')
    const on = day('2020-01-01'), off = day('2021-01-01')
    const adult = { formula: 'ckd-epi-2021' as const, paediatric: 'ckid-u25-ekfc' as const }
    expect(rowEgfrFormula(18, on, adult, heights)).toEqual({ formula: 'ckd-epi-2021' })
    expect(rowEgfrFormula(17, on, adult, heights)).toEqual({ formula: 'ckid-u25', heightCm: 150 })
    expect(rowEgfrFormula(17, off, adult, heights)).toEqual({ formula: 'ekfc-2021' })
    expect(rowEgfrFormula(2, off, adult, heights)).toEqual({ formula: 'ekfc-2021' })
    expect(rowEgfrFormula(1, on, adult, heights)).toEqual({ formula: 'ckid-u25', heightCm: 150 })
    expect(rowEgfrFormula(1, off, adult, heights)).toEqual({ gap: 'height_gap_under_2' })
    expect(rowEgfrFormula(1, on, adult, undefined)).toEqual({ gap: 'no_height' })
    expect(rowEgfrFormula(0, on, adult, heights)).toEqual({ gap: 'under_1' })
    expect(rowEgfrFormula(null, on, adult, heights)).toEqual({ gap: 'age' })
    expect(rowEgfrFormula(10, on, { ...adult, paediatric: 'off' }, heights)).toEqual({ gap: 'under_18' })
    expect(rowEgfrFormula(10, on, { ...adult, paediatric: 'schwartz-bedside' }, heights)).toEqual({ formula: 'schwartz-bedside', heightCm: 150 })
    expect(rowEgfrFormula(10, off, { ...adult, paediatric: 'schwartz-bedside' }, heights)).toEqual({ gap: 'height_gap' })
    const fullAge = { formula: 'ckid-u25-ekfc' as const, paediatric: 'off' as const }
    expect(rowEgfrFormula(25, on, fullAge, heights)).toEqual({ formula: 'ckid-u25', heightCm: 150 })
    expect(rowEgfrFormula(26, on, fullAge, heights)).toEqual({ formula: 'ekfc-2021' })
    expect(rowEgfrFormula(20, off, fullAge, heights)).toEqual({ formula: 'ekfc-2021' })
    expect(rowEgfrFormula(1, on, fullAge, heights)).toEqual({ formula: 'ckid-u25', heightCm: 150 })
    expect(rowEgfrFormula(1, off, fullAge, heights)).toEqual({ gap: 'height_gap_under_2' })
    expect(rowEgfrFormula(0, on, fullAge, heights)).toEqual({ gap: 'under_1' })
    expect(rowEgfrFormula(1, on, { ...adult, paediatric: 'schwartz-bedside' }, heights)).toEqual({ formula: 'schwartz-bedside', heightCm: 150 })
    expect(rowEgfrFormula(0, on, { ...adult, paediatric: 'schwartz-bedside' }, heights)).toEqual({ gap: 'under_1' })
    // Rule `off` decides before the age floor: under 18 means no value.
    expect(rowEgfrFormula(1, on, { ...adult, paediatric: 'off' }, heights)).toEqual({ gap: 'under_18' })
  })

  it('uses CKiD U25 from age 1 with a 30-day height limit under 2, and 90 days from 2 (OD-70, 2026-11-23)', () => {
    const adult = { formula: 'ckd-epi-2021' as const, paediatric: 'ckid-u25-ekfc' as const }
    const schwartz = { ...adult, paediatric: 'schwartz-bedside' as const }
    // Heights 25 days before and after (2019-12-07, 2020-01-26): within 30 days, interpolated 84 + 2 × 25/50 = 85 cm.
    const near = patientHeights([height('2019-12-07', 84), height('2020-01-26', 86)]).get('1')
    expect(rowEgfrFormula(1, day('2020-01-01'), adult, near)).toEqual({ formula: 'ckid-u25', heightCm: 85 })
    expect(rowEgfrFormula(1, day('2020-01-01'), schwartz, near)).toEqual({ formula: 'schwartz-bedside', heightCm: 85 })
    // Heights 35 days before and after (2019-11-27, 2020-02-05): too far at 1 year, and no EKFC under 2.
    const far = patientHeights([height('2019-11-27', 84), height('2020-02-05', 86)]).get('1')
    expect(rowEgfrFormula(1, day('2020-01-01'), adult, far)).toEqual({ gap: 'height_gap_under_2' })
    expect(rowEgfrFormula(1, day('2020-01-01'), schwartz, far)).toEqual({ gap: 'height_gap_under_2' })
    // The same heights at 2 years: within 90 days.
    expect(rowEgfrFormula(2, day('2020-01-01'), adult, far)).toEqual({ formula: 'ckid-u25', heightCm: 85 })
    // Exactly 30 days on both sides is still within the limit at 1 year.
    const edge = patientHeights([height('2019-12-02', 84), height('2020-01-31', 86)]).get('1')
    expect(rowEgfrFormula(1, day('2020-01-01'), adult, edge)).toEqual({ formula: 'ckid-u25', heightCm: 85 })
  })

  it('computes the hand-checked age-1 values and none without a near height', () => {
    // Boy, 1 year, 85 cm interpolated (25 days to each height), Scr 0.25 mg/dl:
    // k = 39.0 × 1.008^(1 − 12) = 35.727181; eGFR = 35.727181 × 0.85 / 0.25 = 121.47 → 121.5.
    const boy = [height('2019-12-07', 84), height('2020-01-26', 86), crea('2020-01-01', 0.25, 1)]
    expect(computed(appendComputedEgfr(boy, { formula: 'ckd-epi-2021' })).map((r) => [r.wertNum, r.egfrFormula, r.egfrHeightCm])).toEqual([[121.5, 'ckid-u25', 85]])
    // Girl: k = 36.1 × 1.008^(1 − 12) = 33.070545; eGFR = 33.070545 × 0.85 / 0.25 = 112.44 → 112.4.
    const girl = boy.map((r) => ({ ...r, patientSex: r.patientSex === null ? null : 'w' as const }))
    expect(computed(appendComputedEgfr(girl, { formula: 'ckid-u25-ekfc' })).map((r) => [r.wertNum, r.egfrFormula])).toEqual([[112.4, 'ckid-u25']])
    // Heights 35 days away: no value at 1 year (no EKFC under 2); at 2 years CKiD U25 with the same heights.
    const far = [height('2019-11-27', 84), height('2020-02-05', 86), crea('2020-01-01', 0.25, 1)]
    expect(computed(appendComputedEgfr(far, { formula: 'ckd-epi-2021' }))).toEqual([])
    // Boy, 2 years: k = 39.0 × 1.008^(2 − 12) = 36.012998; 36.012998 × 0.85 / 0.25 = 122.44 → 122.4.
    expect(computed(appendComputedEgfr([...far.slice(0, 2), crea('2020-01-01', 0.25, 2)], { formula: 'ckd-epi-2021' })).map((r) => [r.wertNum, r.egfrFormula])).toEqual([[122.4, 'ckid-u25']])
    // Without any height: no value at 1 year, EKFC at 2.
    expect(computed(appendComputedEgfr([crea('2020-01-01', 0.25, 1)], { formula: 'ckd-epi-2021' }))).toEqual([])
    expect(computed(appendComputedEgfr([crea('2020-01-01', 0.25, 2)], { formula: 'ckd-epi-2021' })).map((r) => r.egfrFormula)).toEqual(['ekfc-2021'])
    // Under 1 year: none, also with a height of the same day.
    expect(computed(appendComputedEgfr([height('2020-01-01', 70), crea('2020-01-01', 0.25, 0)], { formula: 'ckd-epi-2021' }))).toEqual([])
  })

  it('computes bedside Schwartz without a resolved sex, which it does not use, but no other equation', () => {
    const rows = [height('2020-01-01', 130), crea('2020-01-01', 0.5, 8, { patientSex: null }), crea('2020-01-01', 0.5, 30, { patientSex: null, patientId: 2 })]
    // 0.413 × 130 / 0.5 = 107.38; the adult of patient 2 needs a sex for CKD-EPI 2021.
    expect(computed(appendComputedEgfr(rows, { formula: 'ckd-epi-2021', paediatric: 'schwartz-bedside' })).map((r) => [r.patientId, r.wertNum, r.egfrFormula])).toEqual([[1, 107.4, 'schwartz-bedside']])
    // Under the default rule the child gets CKiD U25, which has a sex term: no value.
    expect(computed(appendComputedEgfr(rows, { formula: 'ckd-epi-2021' }))).toEqual([])
  })

  it('computes CKiD U25 for a child with a height, then the adult formula, and records the change', () => {
    const rows = [height('2020-01-01', 176), crea('2020-01-01', 0.9, 17), crea('2021-01-01', 0.9, 18), crea('2022-01-01', 0.9, 19)]
    const out = computed(appendComputedEgfr(rows, { formula: 'ckd-epi-2021' }))
    // CKiD U25, male 17: 39.0 × 1.045^5 × 1.76 / 0.9 = 95.04; CKD-EPI 2021 male 0.9 mg/dl: 142 × 0.9938^18 = 126.96, then × 0.9938 = 126.17.
    expect(out.map((r) => [r.wertNum, r.egfrFormula, r.egfrHeightCm])).toEqual([[95.0, 'ckid-u25', 176], [127.0, 'ckd-epi-2021', undefined], [126.2, 'ckd-epi-2021', undefined]])
    const switches = egfrFormulaSwitches(out).get('1')!
    expect(switches).toEqual([{ date: day('2021-01-01'), from: 'ckid-u25', to: 'ckd-epi-2021' }])
    expect(fitCrossesFormulaSwitch(switches, day('2020-01-01'), day('2022-01-01'))).toHaveLength(1)
    expect(fitCrossesFormulaSwitch(switches, day('2020-01-01'), day('2021-01-01'))).toHaveLength(1)
    expect(fitCrossesFormulaSwitch(switches, day('2021-01-01'), day('2022-01-01'))).toEqual([])
    expect(fitCrossesFormulaSwitch(switches, null, null)).toEqual([])
  })

  it('gives bedside Schwartz only with a height, and the full-age rule changes adults up to 25', () => {
    const rows = [height('2020-01-01', 120), crea('2020-01-01', 0.5, 8), crea('2020-06-01', 0.5, 8)]
    const schwartz = computed(appendComputedEgfr(rows, { formula: 'ckd-epi-2021', paediatric: 'schwartz-bedside' }))
    // 0.413 × 120 / 0.5 = 99.12; the second value lies after the last height: none.
    expect(schwartz.map((r) => [r.wertNum, r.egfrFormula])).toEqual([[99.1, 'schwartz-bedside']])
    const adultRows = [height('2020-01-01', 180), crea('2020-01-01', 1.0, 24)]
    expect(computed(appendComputedEgfr(adultRows, { formula: 'ckd-epi-2021' })).map((r) => r.egfrFormula)).toEqual(['ckd-epi-2021'])
    const fullAge = computed(appendComputedEgfr(adultRows, { formula: 'ckid-u25-ekfc' }))
    // 50.8 × 1.80 / 1.0 = 91.44
    expect(fullAge.map((r) => [r.bezeichnung, r.wertNum, r.egfrFormula])).toEqual([['eGFR (CKiD U25 / EKFC, computed)', 91.4, 'ckid-u25']])
  })
})
