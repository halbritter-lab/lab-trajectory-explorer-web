import { describe, it, expect } from 'vitest'
import { resolveBirthAnchor } from '../../../src/core/demographics/resolveAge'
import { completedYears } from '../../../src/core/parse/loader'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const day = (d: Date) => d.toISOString().slice(0, 10)
const base = { patientId: 1, attributeBirthDate: null, manualAge: undefined } as const

describe('resolveBirthAnchor', () => {
  it('reproduces every stated age when the rows are consistent', () => {
    const rows = [
      { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: null },
      { labDatum: utc('2022-07-20'), ageAtLab: 46, birthDate: null },
      { labDatum: utc('2023-03-02'), ageAtLab: 47, birthDate: null },
    ]
    const out = resolveBirthAnchor({ ...base, rows })
    expect(out.conflicts).toEqual([])
    for (const row of rows) {
      expect(completedYears(out.birthAnchor!, row.labDatum)).toBe(row.ageAtLab)
    }
  })

  it('reports a typo that fits no single birth date', () => {
    const out = resolveBirthAnchor({
      ...base,
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: null },
        { labDatum: utc('2022-07-20'), ageAtLab: 46, birthDate: null },
        { labDatum: utc('2023-03-02'), ageAtLab: 64, birthDate: null },
      ],
    })
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({ kind: 'age_no_common_birth_date' })
    // The two agreeing rows outvote the typo, so the anchor lands in the 1970s.
    expect(out.birthAnchor!.getUTCFullYear()).toBeGreaterThan(1970)
  })

  it('prefers a birth date on the rows over the stated ages', () => {
    const out = resolveBirthAnchor({
      ...base,
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: utc('1975-06-12') },
        { labDatum: utc('2023-03-02'), ageAtLab: 47, birthDate: utc('1975-06-12') },
      ],
    })
    expect(day(out.birthAnchor!)).toBe('1975-06-12')
    expect(out.conflicts).toEqual([])
  })

  it('prefers the attributes table over the rows', () => {
    const out = resolveBirthAnchor({
      ...base,
      attributeBirthDate: utc('1980-02-03'),
      rows: [{ labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: utc('1975-06-12') }],
    })
    expect(day(out.birthAnchor!)).toBe('1980-02-03')
  })

  it('reports nothing when the attributes birth date agrees with every stated age', () => {
    const out = resolveBirthAnchor({
      ...base,
      attributeBirthDate: utc('1975-06-12'),
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: null },
        { labDatum: utc('2023-08-20'), ageAtLab: 48, birthDate: null },
      ],
    })
    expect(day(out.birthAnchor!)).toBe('1975-06-12')
    expect(out.conflicts).toEqual([])
  })

  it('reports a contradiction when the attributes birth date disagrees with some stated ages, and still wins', () => {
    const out = resolveBirthAnchor({
      ...base,
      patientId: 7,
      attributeBirthDate: utc('1975-06-12'),
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: null },
        { labDatum: utc('2023-08-20'), ageAtLab: 48, birthDate: null },
        { labDatum: utc('2024-01-01'), ageAtLab: 99, birthDate: null },
      ],
    })
    expect(day(out.birthAnchor!)).toBe('1975-06-12')
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({
      kind: 'age_source_disagreement',
      patientId: 7,
      source: 'attributes',
      mismatchedRows: 1,
      totalRows: 3,
    })
  })

  it('reports a contradiction the same way when the birth date comes from the lab rows', () => {
    const out = resolveBirthAnchor({
      ...base,
      patientId: 3,
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: utc('1975-06-12') },
        { labDatum: utc('2023-08-20'), ageAtLab: 48, birthDate: null },
        { labDatum: utc('2024-01-01'), ageAtLab: 99, birthDate: null },
      ],
    })
    expect(day(out.birthAnchor!)).toBe('1975-06-12')
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({
      kind: 'age_source_disagreement',
      patientId: 3,
      source: 'labs',
      mismatchedRows: 1,
      totalRows: 3,
    })
  })

  it('stays silent for a manual age even when rows carry a contradicting birth date', () => {
    const out = resolveBirthAnchor({
      ...base,
      manualAge: 46,
      rows: [
        { labDatum: utc('2014-01-15'), ageAtLab: 99, birthDate: utc('1975-06-12') },
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: utc('1975-06-12') },
      ],
    })
    expect(out.conflicts).toEqual([])
  })

  it('reads a manual age as the age at the first lab date, so it ages with the series', () => {
    const out = resolveBirthAnchor({
      ...base,
      manualAge: 46,
      rows: [
        { labDatum: utc('2014-01-15'), ageAtLab: null, birthDate: null },
        { labDatum: utc('2022-01-15'), ageAtLab: null, birthDate: null },
      ],
    })
    expect(completedYears(out.birthAnchor!, utc('2014-01-15'))).toBe(46)
    expect(completedYears(out.birthAnchor!, utc('2022-01-15'))).toBe(54)
  })

  it('returns no anchor when there is nothing to anchor on', () => {
    const out = resolveBirthAnchor({
      ...base,
      rows: [{ labDatum: utc('2022-01-15'), ageAtLab: null, birthDate: null }],
    })
    expect(out.birthAnchor).toBeNull()
    expect(out.conflicts).toEqual([])
  })

  it('reports when the lab rows carry more than one distinct birth date, and anchors on the earliest row', () => {
    // The first row in file order carries the later, wrong birth date; the
    // fix must not pick "first in the array" but "earliest lab date", so this
    // also pins that the winner does not depend on row order.
    const out = resolveBirthAnchor({
      ...base,
      rows: [
        { labDatum: utc('2023-08-20'), ageAtLab: null, birthDate: utc('1980-01-01') },
        { labDatum: utc('2022-01-15'), ageAtLab: null, birthDate: utc('1975-06-12') },
      ],
    })
    expect(day(out.birthAnchor!)).toBe('1975-06-12')
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({
      kind: 'birth_date_row_disagreement',
      distinctDates: 2,
    })
    expect(day((out.conflicts[0] as { resolved: Date }).resolved)).toBe('1975-06-12')
  })

  it('reports nothing extra when the rows carry the same birth date more than once', () => {
    const out = resolveBirthAnchor({
      ...base,
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: utc('1975-06-12') },
        { labDatum: utc('2023-03-02'), ageAtLab: 47, birthDate: utc('1975-06-12') },
      ],
    })
    expect(out.conflicts).toEqual([])
  })

  it('treats an invalid attributes birth date as absent and still infers ages from the rows', () => {
    // Without a validity guard, an Invalid Date from the attributes table would
    // become birthAnchor directly, and completedYears(birthAnchor, ...) would
    // then return null for every row — the patient's whole age series (and
    // eGFR with it) disappearing silently instead of falling through to the
    // stated ageAtLab values.
    const out = resolveBirthAnchor({
      ...base,
      attributeBirthDate: new Date(NaN),
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: null },
        { labDatum: utc('2022-07-20'), ageAtLab: 46, birthDate: null },
      ],
    })
    expect(Number.isNaN(out.birthAnchor?.getTime())).toBe(false)
    expect(completedYears(out.birthAnchor!, utc('2022-01-15'))).toBe(46)
    expect(completedYears(out.birthAnchor!, utc('2022-07-20'))).toBe(46)
  })

  it('treats an invalid row birth date as absent and still infers ages from ageAtLab', () => {
    const out = resolveBirthAnchor({
      ...base,
      rows: [
        { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: new Date(NaN) },
        { labDatum: utc('2022-07-20'), ageAtLab: 46, birthDate: new Date(NaN) },
      ],
    })
    expect(Number.isNaN(out.birthAnchor?.getTime())).toBe(false)
    expect(completedYears(out.birthAnchor!, utc('2022-01-15'))).toBe(46)
  })

  it('ignores a row with an invalid lab date instead of letting it poison the anchor', () => {
    // An Invalid Date is not `null`, so a filter that only checks for null would
    // let it through. Its NaN timestamp then wins every interval comparison in
    // intersectBirthIntervals (NaN comparisons are always false), so a single
    // bad row can drag the whole anchor to Invalid Date without being flagged
    // by isEmptyInterval, which also returns false for NaN.
    const rows = [
      { labDatum: new Date(NaN), ageAtLab: 20, birthDate: null },
      { labDatum: utc('2022-01-15'), ageAtLab: 46, birthDate: null },
      { labDatum: utc('2022-07-20'), ageAtLab: 46, birthDate: null },
      { labDatum: utc('2023-03-02'), ageAtLab: 47, birthDate: null },
    ]
    const out = resolveBirthAnchor({ ...base, rows })
    expect(out.conflicts).toEqual([])
    expect(Number.isNaN(out.birthAnchor?.getTime())).toBe(false)
    for (const row of rows.slice(1)) {
      expect(completedYears(out.birthAnchor!, row.labDatum)).toBe(row.ageAtLab)
    }
  })
})
