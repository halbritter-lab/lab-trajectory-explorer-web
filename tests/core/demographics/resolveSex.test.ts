import { describe, it, expect } from 'vitest'
import { resolveSex } from '../../../src/core/demographics/resolveSex'

const base = { patientId: 1, attributeSex: null, manualSex: null } as const

describe('resolveSex', () => {
  it('reports nothing when every row agrees', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'w', 'w'] })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toEqual([])
  })

  it('takes the majority and reports the outlier', () => {
    const out = resolveSex({ ...base, rowSexes: [...Array(27).fill('w'), 'm'] })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({
      kind: 'sex_row_disagreement',
      resolved: 'w',
      counts: [{ sex: 'w', count: 27 }, { sex: 'm', count: 1 }],
    })
  })

  it('treats a tie as unknown', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'm'] })
    expect(out.sex).toBeNull()
    expect(out.conflicts[0]).toMatchObject({ kind: 'sex_tie', resolved: null })
  })

  // The conflict is what the sidebar and the export column report. Naming the
  // row majority there while the attributes table decided the eGFR tells the
  // reader the analysis used the other sex than it did.
  it('names the sex that won, not the row majority the attributes table overruled', () => {
    const out = resolveSex({ ...base, rowSexes: ['m', 'm', 'm', 'w'], attributeSex: 'w' })
    expect(out.sex).toBe('w')
    expect(out.conflicts.find((c) => c.kind === 'sex_row_disagreement')).toMatchObject({
      resolved: 'w',
    })
  })

  it('lets the attributes table break a tie and records what broke it', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'm'], attributeSex: 'm' })
    expect(out.sex).toBe('m')
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({ kind: 'sex_tie', resolved: 'm' })
  })

  it('ignores unreadable spellings, which arrive as null', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', null, null] })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toEqual([])
  })

  it('lets the attributes table win over the rows, and says so', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'w'], attributeSex: 'm' })
    expect(out.sex).toBe('m')
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({
      kind: 'sex_source_disagreement',
      fromAttributes: 'm',
      fromRows: 'w',
    })
  })

  it('reports nothing when the attributes table merely confirms the rows', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'w'], attributeSex: 'w' })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toEqual([])
  })

  it('goes quiet once a manual entry exists', () => {
    const out = resolveSex({ ...base, rowSexes: ['w', 'm'], attributeSex: 'd', manualSex: 'w' })
    expect(out.sex).toBe('w')
    expect(out.conflicts).toEqual([])
  })
})
