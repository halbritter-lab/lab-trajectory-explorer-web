import { describe, it, expect } from 'vitest'
import { summarizeByBezeichnung, type SlopeMode } from '../../src/core/stats/summarize'
import { loadLabRows } from '../../src/core/parse/loader'
import { readWorkbook } from '../../src/io/readWorkbook'
import goldens from '../goldens/summary.json'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface SumGolden {
  patientId: number
  mode: SlopeMode
  rows: { bezeichnung: string; einheit: string; nNumeric: number; spanDays: number; slope: number | null; reason: string | null }[]
}

const FIXTURE = resolve(__dirname, '../fixtures/test_labs_clustered.xlsx')
const buf = readFileSync(FIXTURE)
// Copy into a fresh ArrayBuffer — buf.buffer.slice() is unreliable in jsdom
// (the underlying SharedArrayBuffer pool can return corrupt data)
const ab = new ArrayBuffer(buf.length)
new Uint8Array(ab).set(buf)
const rows = loadLabRows(readWorkbook(ab))
const EPS = 1e-6

describe('summarizeByBezeichnung parity with Python summarize_by_bezeichnung', () => {
  it.each(goldens as SumGolden[])('patient $patientId mode $mode', (g) => {
    const out = summarizeByBezeichnung(rows, g.patientId, g.mode)
    expect(out).toHaveLength(g.rows.length)
    out.forEach((s, i) => {
      expect(s.nNumeric).toBe(g.rows[i].nNumeric)
      expect(s.spanDays).toBe(g.rows[i].spanDays)
      expect(s.reason).toBe(g.rows[i].reason)
      if (g.rows[i].slope !== null) expect(Math.abs(s.slope - g.rows[i].slope!)).toBeLessThanOrEqual(EPS)
    })
  })
})
