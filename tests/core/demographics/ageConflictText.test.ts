import { describe, expect, it } from 'vitest'
import { resolveBirthAnchor } from '../../../src/core/demographics/resolveAge'
import { describeConflict } from '../../../src/core/demographics/describe'

/** The age conflict names the lab dates whose stated age is not reproduced
 * (owner decision of 2026-11-21); the day count is no longer quoted. */
const rows = (entries: [string, number][]) => entries.map(([date, ageAtLab]) => ({ labDatum: new Date(`${date}T00:00:00Z`), ageAtLab }))
const conflictText = (patientId: string, entries: [string, number][]) => {
  const out = resolveBirthAnchor({ patientId, rows: rows(entries), attributeBirthDate: null, manualAge: undefined })
  return { out, texts: out.conflicts.map(describeConflict) }
}

describe('age_no_common_birth_date message', () => {
  it('names the two lab dates of a one-year slip instead of "3 days apart"', () => {
    const { out, texts } = conflictText('A1', [['2023-01-10', 54], ['2023-04-12', 54], ['2023-07-11', 54], ['2023-10-10', 55], ['2024-01-09', 55], ['2024-04-09', 55], ['2024-07-09', 56]])
    expect(out.birthAnchor).toEqual(new Date('1968-07-11T00:00:00Z'))
    expect(out.conflicts[0]).toMatchObject({ kind: 'age_no_common_birth_date', gapDays: 3, statedDates: 7 })
    expect(texts).toEqual(['Patient A1: the age values fit no single birth date — ages derived from the median instead. The stated age differs from the derived age on 2 of 7 lab dates: 2023-07-11 (stated 54, derived 55), 2024-07-09 (stated 56, derived 55).'])
  })

  it('names three lab dates and counts the rest', () => {
    const { texts } = conflictText('A2', [['2021-03-01', 60], ['2022-03-01', 60], ['2023-03-01', 60], ['2024-03-01', 60], ['2025-03-01', 60]])
    expect(texts).toEqual(['Patient A2: the age values fit no single birth date — ages derived from the median instead. The stated age differs from the derived age on 4 of 5 lab dates: 2021-03-01 (stated 60, derived 58), 2022-03-01 (stated 60, derived 59), 2024-03-01 (stated 60, derived 61) and 1 more.'])
  })

  it('shows the size of a typo in the age or in the lab year', () => {
    const typoAge = conflictText('A3', [['2023-02-07', 61], ['2023-08-07', 61], ['2024-02-07', 62], ['2024-08-07', 12]])
    expect(typoAge.texts[0]).toMatch(/on 1 of 4 lab dates: 2024-08-07 \(stated 12, derived 62\)\.$/)
    const typoYear = conflictText('A4', [['2023-02-01', 61], ['2023-08-02', 61], ['2024-02-07', 62], ['3024-05-08', 62]])
    expect(typoYear.texts[0]).toMatch(/on 1 of 4 lab dates: 3024-05-08 \(stated 62, derived 1062\)\.$/)
    expect(typoYear.texts[0]).not.toMatch(/days apart/)
  })

  it('counts a lab date once when several parameters carry the same stated age', () => {
    const { out } = conflictText('A5', [['2023-01-10', 54], ['2023-01-10', 54], ['2023-01-10', 54], ['2024-01-10', 54], ['2024-01-10', 54]])
    expect(out.conflicts[0]).toMatchObject({ kind: 'age_no_common_birth_date', statedDates: 2 })
    const conflict = out.conflicts[0]
    expect(conflict.kind === 'age_no_common_birth_date' && conflict.mismatches).toHaveLength(1)
  })

  it('still reads a conflict stored without rows', () => {
    expect(describeConflict({ kind: 'age_no_common_birth_date', patientId: 'B', gapDays: 12 })).toBe('Patient B: the age values fit no single birth date — ages derived from the median instead.')
  })
})

it('worked example (b) of the method reference', () => {
  const { out, texts } = conflictText('7', [['2019-03-10', 51], ['2021-08-20', 55], ['2023-01-05', 55]])
  expect(out.birthAnchor).toEqual(new Date('1967-07-07T00:00:00Z'))
  expect(out.conflicts[0]).toMatchObject({ gapDays: 203 })
  expect(texts[0]).toBe('Patient 7: the age values fit no single birth date — ages derived from the median instead. The stated age differs from the derived age on 1 of 3 lab dates: 2021-08-20 (stated 55, derived 54).')
})
