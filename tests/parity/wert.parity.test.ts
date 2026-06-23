import { describe, it, expect } from 'vitest'
import { parseWert } from '../../src/core/parse/wert'
import goldens from '../goldens/wert.json'

interface WertGolden {
  raw: string
  value: number | null
  operator: string
}

describe('parseWert parity with Python _parse_wert', () => {
  it.each(goldens as WertGolden[])('matches Python for %j', (g) => {
    const got = parseWert(g.raw)
    expect(got.operator).toBe(g.operator)
    expect(got.value).toBe(g.value)
  })
})
