import { describe, expect, it } from 'vitest'
import { attributeSortKey, parseAttributeSort, compareAttributeValues } from '../../prototypes/trajectory-toolbar/preview-attributes'

describe('preview attribute sorting', () => {
  it('sorts text and numeric labels naturally with missing values last in either direction', () => {
    const values = ['Site 10', null, 'Site 2', '', 'Site 1']
    expect([...values].sort((a, b) => compareAttributeValues(a, b, true))).toEqual(['Site 1', 'Site 2', 'Site 10', null, ''])
    expect([...values].sort((a, b) => compareAttributeValues(a, b, false))).toEqual(['Site 10', 'Site 2', 'Site 1', null, ''])
  })

  it('round-trips attribute names without confusing parameter sorts', () => {
    const name = 'Site: "name" [study]'
    expect(parseAttributeSort(attributeSortKey(name, true))).toEqual({ attribute: name, ascending: true })
    expect(parseAttributeSort(attributeSortKey(name, false))).toEqual({ attribute: name, ascending: false })
    expect(parseAttributeSort('["marker","U/L"]:latest')).toBeNull()
    expect(parseAttributeSort('id')).toBeNull()
  })
})
