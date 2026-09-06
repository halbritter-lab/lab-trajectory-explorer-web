import { describe, it, expect } from 'vitest'
import { describeConflict } from '../../../src/core/demographics/describe'

const tie = [
  { sex: 'm', count: 2 },
  { sex: 'w', count: 2 },
] as const

describe('describeConflict', () => {
  it('tells the user to enter a sex only when nothing resolved the tie', () => {
    const text = describeConflict({
      kind: 'sex_tie',
      patientId: 1,
      counts: [...tie],
      resolved: null,
    })
    expect(text).toContain('no eGFR is computed')
  })

  // An eGFR is computed in this case, and the export does not need a manual
  // entry to resolve anything, so the unresolved wording would be a false alarm.
  it('names the winner when the attributes table broke the tie', () => {
    const text = describeConflict({
      kind: 'sex_tie',
      patientId: 1,
      counts: [...tie],
      resolved: 'm',
    })
    expect(text).not.toContain('no eGFR is computed')
    expect(text).toContain('the attributes table')
    expect(text).toContain('"m"')
  })

  // resolveBirthAnchor takes the birth date carried by the row with the
  // earliest lab date, which is not the earliest of the birth dates.
  it('does not call the winning birth date the earliest one', () => {
    const text = describeConflict({
      kind: 'birth_date_row_disagreement',
      patientId: 1,
      distinctDates: 2,
      resolved: new Date('1980-05-05T00:00:00.000Z'),
    })
    expect(text).toContain('1980-05-05')
    expect(text).toContain('earliest lab row')
    expect(text).not.toContain('the earliest, ')
  })
})
