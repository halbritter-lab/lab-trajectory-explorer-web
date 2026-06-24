import { describe, it, expect } from 'vitest'
import { ckdEpi2021, ekfc2021, mdrd4 } from '../../src/core/egfr/formulas'
import { appendComputedEgfr, COMPUTED_BEZEICHNUNG_SUFFIX } from '../../src/core/egfr/series'
import { loadLabRows } from '../../src/core/parse/loader'
import { readWorkbook } from '../../src/io/readWorkbook'
import { comparePatientIds } from '../../src/core/types'
import goldens from '../goldens/egfr.json'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface EgfrGoldens {
  formulas: { scrMgdl: number; ageYears: number; sex: string | null; ckdepi: number | null; mdrd: number | null; ekfc: number | null }[]
  appended: { patientId: number; date: string; wertNum: number | null; operator: string }[]
}
const g = goldens as EgfrGoldens
const EPS = 1e-3
const cmp = (got: number, exp: number | null) => exp === null ? expect(Number.isNaN(got)).toBe(true) : expect(Math.abs(got - exp)).toBeLessThanOrEqual(EPS)

describe('eGFR formula parity', () => {
  it.each(g.formulas)('scr=$scrMgdl age=$ageYears sex=$sex', (c) => {
    cmp(ckdEpi2021({ scrMgdl: c.scrMgdl, ageYears: c.ageYears, sex: c.sex }), c.ckdepi)
    cmp(mdrd4({ scrMgdl: c.scrMgdl, ageYears: c.ageYears, sex: c.sex }), c.mdrd)
    cmp(ekfc2021({ scrMgdl: c.scrMgdl, ageYears: c.ageYears, sex: c.sex }), c.ekfc)
  })
})

const FIXTURE = resolve(__dirname, '../fixtures/test_labs.xlsx')
const buf = readFileSync(FIXTURE)
const rows = loadLabRows(readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))

describe('appendComputedEgfr parity', () => {
  it('produces the same computed eGFR rows as Python', () => {
    const out = appendComputedEgfr(rows, { formula: 'ckd-epi-2021' })
    const computed = out
      .filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
      .map((r) => ({ patientId: r.patientId, t: r.labDatum!.getTime(), wertNum: r.wertNum, operator: r.wertOperator }))
      .sort((a, b) => comparePatientIds(a.patientId, b.patientId) || a.t - b.t)
    const expected = g.appended
      .map((r) => ({ patientId: r.patientId, t: new Date(r.date).getTime(), wertNum: r.wertNum, operator: r.operator }))
      .sort((a, b) => a.patientId - b.patientId || a.t - b.t)
    expect(computed).toHaveLength(expected.length)
    computed.forEach((c, i) => {
      expect(c.patientId).toBe(expected[i].patientId)
      expect(c.operator).toBe(expected[i].operator)
      if (expected[i].wertNum !== null) expect(Math.abs(c.wertNum! - expected[i].wertNum!)).toBeLessThanOrEqual(0.05)
    })
  })
})
