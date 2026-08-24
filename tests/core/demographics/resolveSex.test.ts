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
    expect(out.conflicts[0].kind).toBe('sex_tie')
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
