import { describe, expect, it } from 'vitest'
import { formatDisplayNumber, formatFixedDecimals, slopeDisplayDecimals } from '../../src/core/format'

describe('formatDisplayNumber', () => {
  it('shows a value that rounds to zero as 0, never -0', () => {
    expect(formatDisplayNumber(-0.004)).toBe('0')
    expect(formatDisplayNumber(-0)).toBe('0')
    expect(formatDisplayNumber(-0.005)).toBe('-0.01')
    expect(formatDisplayNumber(-1.5)).toBe('-1.5')
  })
})

describe('slopeDisplayDecimals', () => {
  it('gives the median absolute slope two significant digits, between two and four decimals', () => {
    expect(slopeDisplayDecimals([-5.33, 4.37, -16.53])).toBe(2)
    expect(slopeDisplayDecimals([0.0948])).toBe(3)
    expect(slopeDisplayDecimals([0.0103, -0.25, 0.02])).toBe(3)
    expect(slopeDisplayDecimals([0.004, -0.006])).toBe(4)
    expect(slopeDisplayDecimals([0.00002])).toBe(4)
  })
  it('switches at a power of ten: 0.1 keeps two decimals, anything below takes three', () => {
    expect(slopeDisplayDecimals([0.1])).toBe(2)
    expect(slopeDisplayDecimals([0.0999])).toBe(3)
    expect(slopeDisplayDecimals([0.01])).toBe(3)
    expect(slopeDisplayDecimals([0.00999])).toBe(4)
  })
  it('takes the mean of the two middle values for an even count and ignores missing slopes', () => {
    expect(slopeDisplayDecimals([0.05, 0.25, NaN, Infinity])).toBe(2)
    expect(slopeDisplayDecimals([0.05, 0.13, NaN])).toBe(3)
  })
  it('falls back to two decimals without a slope or with a median of zero', () => {
    expect(slopeDisplayDecimals([])).toBe(2)
    expect(slopeDisplayDecimals([NaN])).toBe(2)
    expect(slopeDisplayDecimals([0, 0, 0.3])).toBe(2)
  })
})

describe('formatFixedDecimals', () => {
  it('pads to the given decimals and signs only on request', () => {
    expect(formatFixedDecimals(0.010349, 3, true)).toBe('+0.010')
    expect(formatFixedDecimals(0.006869, 3)).toBe('0.007')
    expect(formatFixedDecimals(-1.6972, 3)).toBe('-1.697')
    expect(formatFixedDecimals(-18, 2, true)).toBe('-18.00')
    expect(formatFixedDecimals(1234.5, 2)).toBe('1,234.50')
  })
  it('never prints a negative zero and uses a dash for a missing value', () => {
    expect(formatFixedDecimals(-0.0004, 3)).toBe('0.000')
    expect(formatFixedDecimals(-0.004, 2, true)).toBe('0.00')
    expect(formatFixedDecimals(NaN, 2)).toBe('—')
  })
})
