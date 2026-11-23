import { describe, expect, it } from 'vitest'
import { hasSlopeInterval, rapidEgfrDeclineModule, rapidEgfrDeclineFlagForCell, rapidEgfrDeclineLevel } from '../../../src/core/domains/nephrology/rapidEgfrDeclineModule'

const EGFR = 'ml/min/1,73m²'

describe('rapidEgfrDeclineModule', () => {
  it('exposes the default threshold of 5 per year (KDIGO 2012)', () => {
    expect(rapidEgfrDeclineModule.defaultSettings.threshold).toBe(5)
  })

  it('flags only eGFR-unit cells declining faster than the threshold', () => {
    expect(rapidEgfrDeclineFlagForCell({
      patientId: 7,
      bezeichnung: 'eGFR (CKD-EPI 2021, computed)',
      einheit: EGFR,
      slope: -6,
      threshold: 5,
      ciHigh: -5.5,
    })).toMatchObject({
      id: 'rapid-egfr-decline:7:eGFR (CKD-EPI 2021, computed):ml/min/1,73m²',
      patientId: 7,
      label: 'rapid ↓',
      tone: 'rapid',
      severity: 'warning',
    })

    expect(rapidEgfrDeclineFlagForCell({ patientId: 7, bezeichnung: 'Kreatinin', einheit: 'mg/dl', slope: -6, threshold: 5, ciHigh: -5.5 })).toBeNull()
    expect(rapidEgfrDeclineFlagForCell({ patientId: 7, bezeichnung: 'eGFR', einheit: EGFR, slope: -6, threshold: 0, ciHigh: -5.5 })).toBeNull()
  })

  // Decided 2026-11-21 (issue #72): two levels from the upper bound of the 95 % interval.
  it('sets "rapid ↓" only when the whole interval is below the negative threshold', () => {
    const level = (slope: number, ciHigh: number | undefined, hasInterval?: boolean) => rapidEgfrDeclineLevel({ einheit: EGFR, slope, threshold: 5, ciHigh, hasInterval })
    expect(level(-7.73, -7.0)).toBe('yes') // demo patient 9
    expect(level(-13.37, -0.72)).toBe('possible') // demo patient 7
    expect(level(-6.2, 12.68)).toBe('possible') // demo patient 6
    // Strict on both levels: an upper bound of exactly -5 is not below -5.
    expect(level(-6, -5)).toBe('possible')
    expect(level(-6, -5.0001)).toBe('yes')
    expect(level(-5, -6)).toBeNull()
    // No 95 % interval: the conservative reading (OD-37).
    expect(level(-6, undefined)).toBe('possible')
    expect(level(-6, Number.NaN)).toBe('possible')
    expect(level(-6, -5.5, false)).toBe('possible')
  })

  it('labels and explains the possible level', () => {
    const flag = rapidEgfrDeclineFlagForCell({ patientId: 6, bezeichnung: 'eGFR', einheit: EGFR, slope: -6.2, threshold: 5, ciHigh: 12.68 })
    expect(flag).toMatchObject({ label: 'rapid ↓?', tone: 'rapid-possible', title: 'Possible rapid decline: slope < -5 /year, but its 95% interval reaches -5 or above' })
    const noInterval = rapidEgfrDeclineFlagForCell({ patientId: 6, bezeichnung: 'eGFR', einheit: EGFR, slope: -6.2, threshold: 5, ciHigh: -5.5, hasInterval: false })
    expect(noInterval?.title).toBe('Possible rapid decline: slope < -5 /year, no 95% interval to confirm it')
  })

  it('treats Theil–Sen bounds below five fitted dates as no 95 % interval', () => {
    expect(hasSlopeInterval('ols', -9, -7, 3)).toBe(true)
    expect(hasSlopeInterval('ols', Number.NaN, -7, 3)).toBe(false)
    expect(hasSlopeInterval('theil-sen', -9, -7, 4)).toBe(false)
    expect(hasSlopeInterval('theil-sen', -9, -7, 5)).toBe(true)
    expect(hasSlopeInterval('theil-sen', -9, -7, undefined)).toBe(false)
    const ctx = { patientId: 7, seriesKey: { bezeichnung: 'eGFR', einheit: EGFR }, slope: -8, ciLow: -9, ciHigh: -7, fitModel: 'theil-sen' as const }
    expect(rapidEgfrDeclineModule.cellFlags({ ...ctx, nFittedDates: 4 }, { threshold: 5 })[0].label).toBe('rapid ↓?')
    expect(rapidEgfrDeclineModule.cellFlags({ ...ctx, nFittedDates: 5 }, { threshold: 5 })[0].label).toBe('rapid ↓')
  })

  it('exports yes, possible or blank', () => {
    const value = (ciHigh: number, slope = -8) => rapidEgfrDeclineModule.exportColumns[0].value({
      flags: rapidEgfrDeclineModule.cellFlags({ patientId: 7, seriesKey: { bezeichnung: 'eGFR', einheit: EGFR }, slope, ciLow: -20, ciHigh, fitModel: 'ols', nFittedDates: 8 }, { threshold: 5 }),
    })
    expect(value(-6)).toBe('yes')
    expect(value(-1)).toBe('possible')
    expect(value(-1, -4)).toBe('')
  })

  it('sets no flag on a slope that meets the reliability rule', () => {
    const ctx = { patientId: 7, seriesKey: { bezeichnung: 'eGFR', einheit: EGFR }, slope: -6, ciLow: -7, ciHigh: -5.5, fitModel: 'ols' as const }
    expect(rapidEgfrDeclineModule.cellFlags(ctx, { threshold: 5 })).toHaveLength(1)
    expect(rapidEgfrDeclineModule.cellFlags({ ...ctx, unstableSlope: false }, { threshold: 5 })).toHaveLength(1)
    expect(rapidEgfrDeclineModule.cellFlags({ ...ctx, unstableSlope: true }, { threshold: 5 })).toEqual([])
    // Neither level: an unreliable slope with a narrow interval far below -5 gets no mark.
    expect(rapidEgfrDeclineModule.cellFlags({ ...ctx, ciHigh: -20, slope: -25, unstableSlope: true }, { threshold: 5 })).toEqual([])
  })
})
