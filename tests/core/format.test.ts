import { describe, expect, it } from 'vitest'
import { formatDisplayNumber } from '../../src/core/format'

describe('formatDisplayNumber', () => {
  it('shows a value that rounds to zero as 0, never -0', () => {
    expect(formatDisplayNumber(-0.004)).toBe('0')
    expect(formatDisplayNumber(-0)).toBe('0')
    expect(formatDisplayNumber(-0.005)).toBe('-0.01')
    expect(formatDisplayNumber(-1.5)).toBe('-1.5')
  })
})
