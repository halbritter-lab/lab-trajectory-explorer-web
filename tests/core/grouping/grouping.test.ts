import { describe, it, expect } from 'vitest'
import { UNGROUPED, groupPatients, groupColors } from '../../../src/core/grouping/grouping'
import type { PatientId } from '../../../src/core/types'

describe('groupPatients', () => {
  it('partitions patients by the chosen attribute value (trimmed)', () => {
    const byPatient = {
      '1': { genotype: 'A' },
      '2': { genotype: '  B  ' },
      '3': { genotype: 'A' },
    }
    const groups = groupPatients([1, 2, 3], byPatient, 'genotype')
    expect(groups).toEqual([
      { value: 'A', patientIds: [1, 3] },
      { value: 'B', patientIds: [2] },
    ])
  })

  it('falls back to UNGROUPED for missing, unknown, or blank values', () => {
    const byPatient = {
      '1': { genotype: 'A' },
      '2': { genotype: '   ' },
      '3': { other: 'x' },
      // patient 4 has no entry at all
    }
    const groups = groupPatients([1, 2, 3, 4], byPatient, 'genotype')
    expect(groups).toEqual([
      { value: 'A', patientIds: [1] },
      { value: UNGROUPED, patientIds: [2, 3, 4] },
    ])
  })

  it('orders named groups numeric-aware with UNGROUPED always last', () => {
    const byPatient = {
      '1': { g: '10' },
      '2': { g: '2' },
      '3': {},
      '4': { g: '1' },
    }
    const groups = groupPatients([1, 2, 3, 4], byPatient, 'g')
    expect(groups.map((group) => group.value)).toEqual(['1', '2', '10', UNGROUPED])
  })

  it('preserves input order of patient ids within each group', () => {
    const byPatient: Record<string, Record<string, string>> = {
      '3': { g: 'X' },
      '1': { g: 'X' },
      '2': { g: 'X' },
    }
    const ids: PatientId[] = [3, 1, 2]
    const groups = groupPatients(ids, byPatient, 'g')
    expect(groups[0].patientIds).toEqual([3, 1, 2])
  })

  it('returns an empty list when there are no patients', () => {
    expect(groupPatients([], {}, 'g')).toEqual([])
  })
})

describe('groupColors', () => {
  it('assigns palette colors to named groups in order and gray to UNGROUPED', () => {
    const groups = groupPatients([1, 2, 3], { '1': { g: 'A' }, '2': { g: 'B' } }, 'g')
    const colors = groupColors(groups)
    expect(colors.get('A')).toBe('#2563eb')
    expect(colors.get('B')).toBe('#dc2626')
    expect(colors.get(UNGROUPED)).toBe('#4b5563')
  })

  it('uses a high-contrast palette without pale yellow plot colors', () => {
    const groups = Array.from({ length: 8 }, (_, i) => ({ value: `v${i}`, patientIds: [i] }))
    const colors = groups.map((group) => groupColors(groups).get(group.value))

    expect(colors).toEqual(['#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c', '#0891b2', '#be123c', '#4b5563'])
    expect(colors).not.toContain('#F0E442')
  })

  it('is stable regardless of UNGROUPED presence (named groups keep palette order)', () => {
    const named = groupColors([
      { value: 'A', patientIds: [1] },
      { value: 'B', patientIds: [2] },
    ])
    const withUngrouped = groupColors([
      { value: 'A', patientIds: [1] },
      { value: 'B', patientIds: [2] },
      { value: UNGROUPED, patientIds: [3] },
    ])
    expect(withUngrouped.get('A')).toBe(named.get('A'))
    expect(withUngrouped.get('B')).toBe(named.get('B'))
  })

  it('cycles the palette when there are more than 8 named groups', () => {
    const groups = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, patientIds: [i] }))
    const colors = groupColors(groups)
    expect(colors.get('v0')).toBe('#2563eb')
    // 9th named group wraps back to the first palette color
    expect(colors.get('v8')).toBe('#2563eb')
  })
})
