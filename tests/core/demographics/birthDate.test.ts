import { describe, it, expect } from 'vitest'
import {
  addYearsUtc,
  birthDateInterval,
  intersectBirthIntervals,
  intervalGapDays,
  intervalMidpoint,
  isEmptyInterval,
  medianDate,
} from '../../../src/core/demographics/birthDate'
import { completedYears } from '../../../src/core/parse/loader'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const day = (d: Date) => d.toISOString().slice(0, 10)

describe('birthDateInterval', () => {
  it('brackets the birth dates that yield a stated age', () => {
    const iv = birthDateInterval(utc('2022-01-15'), 46)
    expect(day(iv.lo)).toBe('1975-01-16')
    expect(day(iv.hi)).toBe('1976-01-15')
  })

  it('agrees with completedYears at both ends and fails one day outside', () => {
    const labDate = utc('2022-01-15')
    const iv = birthDateInterval(labDate, 46)
    expect(completedYears(iv.lo, labDate)).toBe(46)
    expect(completedYears(iv.hi, labDate)).toBe(46)
    const beforeLo = new Date(iv.lo.getTime() - 86_400_000)
    const afterHi = new Date(iv.hi.getTime() + 86_400_000)
    expect(completedYears(beforeLo, labDate)).toBe(47)
    expect(completedYears(afterHi, labDate)).toBe(45)
  })
})

describe('addYearsUtc', () => {
  it('clamps 29 February to 28 February in a non-leap year', () => {
    expect(day(addYearsUtc(utc('2024-02-29'), -1))).toBe('2023-02-28')
  })
})

describe('intersectBirthIntervals', () => {
  it('overlaps for ages that fit one birth date', () => {
    const iv = intersectBirthIntervals([
      birthDateInterval(utc('2022-01-15'), 46),
      birthDateInterval(utc('2022-07-20'), 46),
      birthDateInterval(utc('2023-03-02'), 47),
    ])!
    expect(isEmptyInterval(iv)).toBe(false)
    expect(day(iv.lo)).toBe('1975-07-21')
    expect(day(iv.hi)).toBe('1976-01-15')
  })

  it('is empty when one age is a typo', () => {
    const iv = intersectBirthIntervals([
      birthDateInterval(utc('2022-01-15'), 46),
      birthDateInterval(utc('2022-07-20'), 46),
      birthDateInterval(utc('2023-03-02'), 64),
    ])!
    expect(isEmptyInterval(iv)).toBe(true)
    expect(intervalGapDays(iv)).toBeGreaterThan(5000)
  })

  it('returns null for no intervals at all', () => {
    expect(intersectBirthIntervals([])).toBeNull()
  })
})

describe('intervalMidpoint and medianDate', () => {
  it('takes the middle of a range', () => {
    expect(day(intervalMidpoint({ lo: utc('2000-01-01'), hi: utc('2000-01-11') }))).toBe('2000-01-06')
  })

  it('returns an input date rather than a synthetic one', () => {
    const dates = [utc('2000-01-01'), utc('2000-06-01'), utc('2000-12-01')]
    expect(day(medianDate(dates)!)).toBe('2000-06-01')
    expect(medianDate([])).toBeNull()
  })
})
