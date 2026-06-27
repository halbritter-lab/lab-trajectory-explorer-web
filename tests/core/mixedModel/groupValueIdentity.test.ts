import { describe, expect, it } from 'vitest'
import {
  buildMixedModelResultIdentity,
  mixedModelIdentityEquals,
} from '../../../src/core/mixedModel/resultIdentity'
import type { MixedModelSpikeRow } from '../../../src/core/mixedModel/types'

const rows: MixedModelSpikeRow[] = [
  { patient_id: 'p1', eGFR: 70, time_since_baseline: 0 },
  { patient_id: 'p1', eGFR: 68, time_since_baseline: 1 },
  { patient_id: 'p2', eGFR: 60, time_since_baseline: 0 },
  { patient_id: 'p2', eGFR: 57, time_since_baseline: 1 },
]

describe('mixed model result identity groupValue', () => {
  it('stamps the groupValue onto the identity when provided', () => {
    const identity = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2'],
      rows,
      fitConfigHash: 'fit12345',
      groupValue: 'A',
    })
    expect(identity.groupValue).toBe('A')
  })

  it('treats two identities differing only by groupValue as unequal', () => {
    const a = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2'],
      rows,
      fitConfigHash: 'fit12345',
      groupValue: 'A',
    })
    const b = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2'],
      rows,
      fitConfigHash: 'fit12345',
      groupValue: 'B',
    })

    expect(mixedModelIdentityEquals(a, b)).toBe(false)
  })

  it('preserves equality when groupValue is omitted on both sides', () => {
    const a = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2'],
      rows,
      fitConfigHash: 'fit12345',
    })
    const b = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2'],
      rows,
      fitConfigHash: 'fit12345',
    })

    expect(a.groupValue).toBeUndefined()
    expect(mixedModelIdentityEquals(a, b)).toBe(true)
  })

  it('treats a groupValue-stamped identity as unequal to an unstamped one', () => {
    const stamped = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2'],
      rows,
      fitConfigHash: 'fit12345',
      groupValue: 'A',
    })
    const unstamped = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2'],
      rows,
      fitConfigHash: 'fit12345',
    })

    expect(mixedModelIdentityEquals(stamped, unstamped)).toBe(false)
  })
})
