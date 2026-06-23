import { describe, expect, it } from 'vitest'
import { rapidEgfrDeclineModule, rapidEgfrDeclineFlagForCell } from '../../../src/core/analysis/rapidEgfrDeclineModule'

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
})
