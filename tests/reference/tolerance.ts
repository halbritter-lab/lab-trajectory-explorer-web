import { expect } from 'vitest'

export interface Tolerance { rel: number; abs: number }

/** |actual − expected| ≤ abs + rel × |expected|; a missing expected value
 * (null in the JSON) expects no value (null, undefined or NaN). The tolerances
 * of each comparison are stated and justified in docs/reference-comparisons.md. */
export function expectClose(actual: number | null | undefined, expected: number | null | undefined, tolerance: Tolerance, label = ''): void {
  if (expected === null || expected === undefined) {
    expect(actual === null || actual === undefined || Number.isNaN(actual), `${label}: expected no value, got ${actual}`).toBe(true)
    return
  }
  expect(typeof actual === 'number' && Number.isFinite(actual), `${label}: expected ${expected}, got ${actual}`).toBe(true)
  const bound = tolerance.abs + tolerance.rel * Math.abs(expected)
  expect(Math.abs((actual as number) - expected), `${label}: ${actual} vs ${expected} (bound ${bound})`).toBeLessThanOrEqual(bound)
}

export interface ReferenceEnvironment { R: string; platform: string; packages: Record<string, string> }
