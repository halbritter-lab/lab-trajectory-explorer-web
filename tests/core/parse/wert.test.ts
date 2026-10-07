import { describe, it, expect } from 'vitest'
import { parseWert } from '../../../src/core/parse/wert'

describe('parseWert', () => {
  it('returns unparseable for null and blank', () => {
    expect(parseWert(null)).toEqual({ value: null, operator: 'unparseable', raw: '' })
    expect(parseWert('   ')).toEqual({ value: null, operator: 'unparseable', raw: '' })
  })

  it('parses a plain integer and decimal', () => {
    expect(parseWert('42')).toEqual({ value: 42, operator: '=', raw: '42' })
    expect(parseWert('3.5')).toEqual({ value: 3.5, operator: '=', raw: '3.5' })
  })

  it('parses German decimal comma', () => {
    expect(parseWert('3,5')).toEqual({ value: 3.5, operator: '=', raw: '3,5' })
  })

  it('parses less-than and greater-than with value retained', () => {
    expect(parseWert('<30')).toEqual({ value: 30, operator: '<', raw: '<30' })
    expect(parseWert('>200')).toEqual({ value: 200, operator: '>', raw: '>200' })
  })

  it('normalises unicode comparison operators', () => {
    expect(parseWert('≤30')).toEqual({ value: 30, operator: '<', raw: '≤30' })
    expect(parseWert('≥200')).toEqual({ value: 200, operator: '>', raw: '≥200' })
  })

  it('marks ranges with null value', () => {
    expect(parseWert('10-20')).toEqual({ value: null, operator: 'range', raw: '10-20' })
    expect(parseWert('10–20')).toEqual({ value: null, operator: 'range', raw: '10–20' })
  })

  it('reads three digits after a point as a decimal (OD-8, decided 2026-10-07)', () => {
    expect(parseWert('1.234')).toEqual({ value: 1.234, operator: '=', raw: '1.234' })
    expect(parseWert('0.850')).toEqual({ value: 0.85, operator: '=', raw: '0.850' })
    expect(parseWert('-12.500')).toEqual({ value: -12.5, operator: '=', raw: '-12.500' })
    expect(parseWert('< 1.234')).toEqual({ value: 1.234, operator: '<', raw: '< 1.234' })
  })

  it('rejects mixed dot-and-comma as unparseable', () => {
    expect(parseWert('1.234,5')).toEqual({ value: null, operator: 'unparseable', raw: '1.234,5' })
  })

  it('treats free-text Befund as unparseable', () => {
    expect(parseWert('positiv')).toEqual({ value: null, operator: 'unparseable', raw: 'positiv' })
  })

  it('parses scientific notation', () => {
    expect(parseWert('1e3')).toEqual({ value: 1000, operator: '=', raw: '1e3' })
  })

  it('normalises a non-breaking space inside an operator prefix', () => {
    // Intentional improvement over the Python source, whose space-normalisation
    // replace is a no-op (U+0020 -> U+0020); we normalise U+00A0 so the value parses.
    const raw = '<' + String.fromCharCode(0x00a0) + '30'
    expect(parseWert(raw)).toEqual({ value: 30, operator: '<', raw })
  })
  it('treats numbers that overflow to infinity as unparseable', () => {
    // A non-finite value would later fail the saved-workspace check and be deleted.
    expect(parseWert('1e400')).toEqual({ value: null, operator: 'unparseable', raw: '1e400' })
    expect(parseWert('-1e400')).toEqual({ value: null, operator: 'unparseable', raw: '-1e400' })
    const huge = '<' + '9'.repeat(400)
    expect(parseWert(huge)).toEqual({ value: null, operator: 'unparseable', raw: huge })
    expect(parseWert('1e3')).toEqual({ value: 1000, operator: '=', raw: '1e3' })
  })
})
