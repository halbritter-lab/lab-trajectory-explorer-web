import { describe, it, expect } from 'vitest'
import { parseWert } from '../../src/core/parse/wert'
import goldens from '../goldens/wert.json'

interface WertGolden {
  raw: string
  value: number | null
  operator: string
}

// The stored cases began as Python `_parse_wert` output. One case deviates
// deliberately since 2026-10-07 (OD-8): "1.234" was unparseable and is now
// the decimal 1.234.
describe('parseWert regression cases', () => {
  it.each(goldens as WertGolden[])('matches the stored case for %j', (g) => {
    const got = parseWert(g.raw)
    expect(got.operator).toBe(g.operator)
    expect(got.value).toBe(g.value)
  })
})
