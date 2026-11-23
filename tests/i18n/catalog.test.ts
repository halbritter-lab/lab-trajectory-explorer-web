import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { catalogSource, extractMessages } from '../../scripts/i18n_extract.mjs'
import { EN_MESSAGES } from '../../src/i18n/en'
import { de } from '../../src/i18n/de'

const root = resolve(__dirname, '../..')
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe('interface message catalogs (issue #71)', () => {
  it('the English catalog lists exactly the messages the source uses', () => {
    expect([...EN_MESSAGES]).toEqual(extractMessages(root))
    expect(readFileSync(resolve(root, 'src/i18n/en.ts'), 'utf8')).toBe(catalogSource(extractMessages(root)))
  })
  it('German translates every English message and nothing else', () => {
    expect(Object.keys(de).sort()).toEqual([...EN_MESSAGES].sort())
    for (const key of EN_MESSAGES) expect(de[key].trim(), key).not.toBe('')
  })
  it('keeps the placeholders of every message', () => {
    for (const key of EN_MESSAGES) expect(placeholders(de[key]), key).toEqual(placeholders(key))
  })
})

// Code review of the language switch (issue #71): "Daten" also means data, so
// calendar dates of measurements are "Messtage" in German, in chips and notes alike.
describe('German dates of measurements', () => {
  it('never translates "dates" as the ambiguous "Daten"', () => {
    const ambiguous = Object.entries(de).filter(([key, value]) => /\bdates\b/.test(key) && /\bDaten\b/.test(value)).map(([key]) => key)
    expect(ambiguous).toEqual([])
    expect(de['< 3 dates']).toBe('< 3 Messtage')
    expect(de['G5 < 3 dates']).toBe('G5 < 3 Messtage')
    expect(de['Fewer than two dates']).toBe('Weniger als zwei Messtage')
  })
})
