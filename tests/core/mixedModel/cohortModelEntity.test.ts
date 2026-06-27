import { describe, expect, it } from 'vitest'
import { entityKey, entityGroupValue } from '../../../src/core/mixedModel/cohortModelEntity'

describe('cohort model entity', () => {
  it('keys the pooled cohort and groups without collision', () => {
    expect(entityKey({ kind: 'cohort' })).toBe('cohort')
    expect(entityKey({ kind: 'group', value: 'A' })).toBe('group:A')
    // a group literally named "cohort" must not collide with the pooled key
    expect(entityKey({ kind: 'group', value: 'cohort' })).toBe('group:cohort')
  })

  it('exposes the group value (undefined for the cohort)', () => {
    expect(entityGroupValue({ kind: 'cohort' })).toBeUndefined()
    expect(entityGroupValue({ kind: 'group', value: 'B' })).toBe('B')
  })
})
