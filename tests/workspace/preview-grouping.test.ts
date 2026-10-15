import { describe, expect, it } from 'vitest'
import { groupRows } from '../../prototypes/trajectory-toolbar/preview-grouping'

describe('preview patient groups', () => {
  it('keeps the active patient sort within each group and does not mutate input', () => {
    const rows = [{ id: 4, group: 'Site 10' }, { id: 3, group: 'Site 2' }, { id: 2, group: 'Site 10' }, { id: 1, group: 'Site 2' }]
    const grouped = groupRows(rows, row => row.group)
    expect(grouped.map(group => group.label)).toEqual(['Site 2', 'Site 10'])
    expect(grouped.map(group => group.rows.map(row => row.id))).toEqual([[3, 1], [4, 2]])
    expect(rows.map(row => row.id)).toEqual([4, 3, 2, 1])
  })

  it('puts missing values last without merging them with a literal Not recorded value', () => {
    const grouped = groupRows(['', 'Not recorded', null, '  ', 'A'], value => value)
    expect(grouped.map(group => group.rows)).toEqual([['A'], ['Not recorded'], ['', null, '  ']])
    expect(new Set(grouped.map(group => group.key)).size).toBe(3)
    expect(grouped.at(-1)?.label).toBe('Not recorded')
  })

  it('keeps different raw categories distinct when display labels coincide', () => {
    const grouped = groupRows(['F', 'Female', 'F'], value => value, () => 'Female')
    expect(grouped).toHaveLength(2)
    expect(grouped.flatMap(group => group.rows)).toHaveLength(3)
    expect(groupRows([], () => null)).toEqual([])
  })
})
