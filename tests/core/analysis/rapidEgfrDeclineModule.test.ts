import { describe, expect, it } from 'vitest'
import { rapidEgfrDeclineModule, rapidEgfrDeclineFlagForCell } from '../../../src/core/domains/nephrology/rapidEgfrDeclineModule'

describe('rapidEgfrDeclineModule', () => {
  it('exposes default threshold matching current KDIGO rapid progression default', () => {
    expect(rapidEgfrDeclineModule.defaultSettings.threshold).toBe(5)
  })

  it('flags only eGFR-unit cells declining faster than the threshold', () => {
    expect(rapidEgfrDeclineFlagForCell({
      patientId: 7,
      bezeichnung: 'eGFR (CKD-EPI 2021, computed)',
      einheit: 'ml/min/1,73m²',
      slope: -6,
      threshold: 5,
    })).toMatchObject({
      id: 'rapid-egfr-decline:7:eGFR (CKD-EPI 2021, computed):ml/min/1,73m²',
      patientId: 7,
      label: 'rapid ↓',
      severity: 'warning',
    })

    expect(rapidEgfrDeclineFlagForCell({
      patientId: 7,
      bezeichnung: 'Kreatinin',
      einheit: 'mg/dl',
      slope: -6,
      threshold: 5,
    })).toBeNull()

    expect(rapidEgfrDeclineFlagForCell({
      patientId: 7,
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1,73m²',
      slope: -6,
      threshold: 0,
    })).toBeNull()
  })

  it('sets no flag on a slope that meets the reliability rule', () => {
    const ctx = { patientId: 7, seriesKey: { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }, slope: -6, fitModel: 'ols' as const }
    expect(rapidEgfrDeclineModule.cellFlags(ctx, { threshold: 5 })).toHaveLength(1)
    expect(rapidEgfrDeclineModule.cellFlags({ ...ctx, unstableSlope: false }, { threshold: 5 })).toHaveLength(1)
    expect(rapidEgfrDeclineModule.cellFlags({ ...ctx, unstableSlope: true }, { threshold: 5 })).toEqual([])
  })
})
