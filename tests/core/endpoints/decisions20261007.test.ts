import { describe, expect, it } from 'vitest'
import { computeCkdEndpoints, normalizeConfirmationDays, type EndpointPoint } from '../../../src/core/domains/nephrology/endpoints/ckdEndpoints'
import { ckdEndpointsModule } from '../../../src/core/domains/nephrology/endpoints/ckdEndpointsModule'
import { isEgfrUnit } from '../../../src/core/domains/nephrology/analytes'
import { isRapidEgfrDecline } from '../../../src/core/domains/nephrology/rapidEgfrDeclineModule'
import { projectionTargetPresets } from '../../../src/core/domains/nephrology/projectionPresets'
import { ckdProgressionConfig } from '../../../src/core/domains/nephrology/fitConfig'
import { appendComputedEgfr } from '../../../src/core/domains/nephrology/egfr/series'
import { buildCohortRows, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import { isExactMeasurement } from '../../../src/core/measurements/censored'
import { endpointBadge } from '../../../src/workspace/labels/endpointLabels'
import type { LabRow } from '../../../src/core/types'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const point = (date: string, value: number, ageYears: number | null = null): EndpointPoint => ({ date: d(date), value, ageYears })
const projecting = { percentDecline: false, observedCkdG4: false, observedCkdG5: false, projectedAgeToCkdG5: true }
const declining = { slopePerYear: -10, intercept: 60, slopeCiLow: -12, slopeCiHigh: -8 }

// Owner decisions of 2026-10-07; the numbers are the former open decisions.
describe('one eGFR rule by unit (OD-20)', () => {
  it('accepts mL/min/1.73 m² in its usual spellings and nothing else', () => {
    for (const unit of ['ml/min/1,73m²', 'mL/min/1.73m²', 'ml/min/1.73 m2', 'ML/MIN/1,73M^2', ' ml / min / 1.73 m² ']) expect(isEgfrUnit(unit)).toBe(true)
    for (const unit of ['ml/min', 'mL/min/m²', 'ml/min/1.73', 'ml/s', 'mg/dl', '', null]) expect(isEgfrUnit(unit)).toBe(false)
  })
  // Owner decision of 2026-10-08: three further ways of writing the same unit.
  it('accepts the UCUM, "qm" and "per" spellings of mL/min/1.73 m²', () => {
    for (const unit of ['mL/min/{1.73_m2}', 'ml/min/{1,73_m²}', 'ml/min/1.73qm', 'ML/MIN/1,73 QM', 'mL/min per 1.73 m2', 'ml/min per 1,73m²']) expect(isEgfrUnit(unit)).toBe(true)
    for (const unit of ['ml/min/1,73 m² KOF', 'ml/min/{1.73}', 'ml/min/qm', 'ml/min per m2', 'ml per min per 1.73 m2', 'ml/min/1.73m3']) expect(isEgfrUnit(unit)).toBe(false)
    expect(ckdEndpointsModule.appliesTo({ bezeichnung: 'eGFR', einheit: 'mL/min/{1.73_m2}' })).toBe(true)
    expect(isRapidEgfrDecline('ml/min/1.73qm', -10, 5)).toBe(true)
    expect(projectionTargetPresets({ outcome: 'eGFR', unit: 'mL/min per 1.73 m2' }).map((t) => t.threshold)).toEqual([30, 15])
  })
  it('gives a clearance in ml/min neither endpoints nor the rapid-decline flag', () => {
    expect(ckdEndpointsModule.appliesTo({ bezeichnung: 'Kreatinin-Clearance', einheit: 'ml/min' })).toBe(false)
    expect(ckdEndpointsModule.appliesTo({ bezeichnung: 'GFR (CKD-EPI)', einheit: 'ml/min/1,73m²' })).toBe(true)
    expect(isRapidEgfrDecline('ml/min', -10, 5)).toBe(false)
    expect(isRapidEgfrDecline('ml/min/1,73m²', -10, 5)).toBe(true)
  })
  it('offers the projection presets by unit, whatever the series is called', () => {
    expect(projectionTargetPresets({ outcome: 'GFR (CKD-EPI)', unit: 'ml/min/1,73m²' }).map((t) => t.threshold)).toEqual([30, 15])
    expect(projectionTargetPresets({ outcome: 'eGFR', unit: 'ml/min' })).toEqual([])
  })
})

describe('projection follow-up of 365 days (OD-17)', () => {
  it('projects over exactly one calendar year without a leap day and withholds one day less', () => {
    const year = computeCkdEndpoints({ points: [point('2021-01-01', 60, 60), point('2021-07-01', 55, 60), point('2022-01-01', 50, 61)], ...declining, enabled: projecting })
    expect(year.projectedAgeToCkdG5.reason).toBeNull()
    // The line 60 - 10 t reaches 15 at t = 4.5 years; the latest point is 365 days after the first.
    expect(year.projectedAgeToCkdG5.value).toBeCloseTo(61 + 4.5 - 365 / 365.25, 10)
    const short = computeCkdEndpoints({ points: [point('2021-01-01', 60, 60), point('2021-07-01', 55, 60), point('2021-12-31', 50, 60)], ...declining, enabled: projecting })
    expect(short.projectedAgeToCkdG5).toMatchObject({ value: null, reason: 'span_too_short' })
  })
})

describe('a confirmed G5 always rules out the projection (OD-18)', () => {
  const points = [point('2020-01-01', 14, 60), point('2020-05-01', 13, 60), point('2021-06-01', 12, 61)]
  it('withholds the projection with the observed-G5 endpoint switched off, without reporting the event', () => {
    const result = computeCkdEndpoints({ points, slopePerYear: -1, intercept: 14, slopeCiLow: -2, slopeCiHigh: -0.5, enabled: projecting })
    expect(result.projectedAgeToCkdG5).toMatchObject({ value: null, reason: 'observed_ckd_g5' })
    expect(result.observedCkdG5.met).toBe(false)
    expect(result.evaluated.observedCkdG5).toBe(false)
  })
  it('names the confirmed event in the badge and exports the interval that decided it', () => {
    const off = computeCkdEndpoints({ points, slopePerYear: -1, intercept: 14, enabled: projecting })
    expect(endpointBadge(off, points.length)).toEqual({
      label: 'G5 not projected',
      title: 'The eligible measurements contain a confirmed CKD G5 event (minimum 90 days), so no future age at CKD G5 is projected. Switch on Observed CKD G5 to see its dates.',
    })
    const value = (key: string, endpoints: typeof off) => ckdEndpointsModule.exportColumns.find((c) => c.key === key)!.value({ flags: [], endpoints, fitModel: 'ols' })
    expect([value('endpoint_prediction_reason', off), value('endpoint_confirmation_days', off), value('endpoint_confirmation_max_months', off), value('endpoint_observed_ckd_g5', off)]).toEqual(['observed_ckd_g5', 90, 12, ''])
    // With the observed endpoint on, the event badge speaks for itself.
    const on = computeCkdEndpoints({ points, slopePerYear: -1, intercept: 14, enabled: { ...projecting, observedCkdG5: true } })
    expect(endpointBadge(on, points.length)?.label).toBe('CKD G5')
    const none = computeCkdEndpoints({ points, slopePerYear: -1, intercept: 14, enabled: { ...projecting, projectedAgeToCkdG5: false } })
    expect(value('endpoint_confirmation_days', none)).toBe('')
  })
  it('gives the same reason as with the endpoint switched on, and prefers it to kidney failure reached', () => {
    const on = computeCkdEndpoints({ points, slopePerYear: -1, intercept: 14, enabled: { ...projecting, observedCkdG5: true } })
    expect(on.projectedAgeToCkdG5.reason).toBe('observed_ckd_g5')
    const krt = { type: 'chronic_dialysis' as const, date: d('2022-01-01') }
    expect(computeCkdEndpoints({ points, slopePerYear: -1, intercept: 14, enabled: projecting, kidneyFailureReached: krt }).projectedAgeToCkdG5.reason).toBe('observed_ckd_g5')
  })
})

describe('minimum confirmation interval of at most 365 days (OD-19)', () => {
  it('limits a stored interval to 365 days, which can still confirm', () => {
    expect([90, 365, 366, 400, 0, undefined].map(normalizeConfirmationDays)).toEqual([90, 365, 365, 365, 90, 90])
    const observed = { percentDecline: false, observedCkdG4: false, observedCkdG5: true, projectedAgeToCkdG5: false }
    const result = computeCkdEndpoints({ points: [point('2021-01-01', 14), point('2022-01-01', 13)], slopePerYear: -1, enabled: observed, confirmationDays: 400 })
    expect(result.confirmationDays).toBe(365)
    expect(result.observedCkdG5).toMatchObject({ met: true, confirmedDate: d('2022-01-01') })
  })
})

describe('projected age from an exact birth date (OD-16)', () => {
  const parameter = { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }
  const rows: LabRow[] = [60, 45, 30].map((value, i) => ({ patientId: 1, labDatum: new Date(Date.UTC(2020 + i, 0, 1)), ...parameter,
    wert: String(value), wertNum: value, wertOperator: '=' as const, loinc: null, patientSex: 'w' as const, patientAgeAtLab: 60 + i }))
  const spec: CohortSeriesSpec = { ...parameter, mode: 'global', fitConfig: ckdProgressionConfig(parameter) }
  const whole = () => buildCohortRows(rows, [1], [spec])[0].cells[0].endpoints.projectedAgeToCkdG5

  it('counts from the age in completed years without a birth date and says so', () => {
    // The fitted line reaches 15 about one year after the latest row, at which the stated age is 62.
    expect(whole().value).toBeCloseTo(63, 2)
    expect(whole().ageBasis).toBe('whole_years')
  })
  it('counts from the exact age when the birth date is known', () => {
    const projected = buildCohortRows(rows, [1], [{ ...spec, exactBirthDateByPatient: { '1': d('1959-07-01') } }])[0].cells[0].endpoints.projectedAgeToCkdG5
    // 1959-07-01 to 2022-01-01 is 22830 days: the patient is 62.505 at the latest row, not 62.
    expect(projected.value! - whole().value!).toBeCloseTo(22830 / 365.25 - 62, 10)
    expect(projected.ageBasis).toBe('birth_date')
  })
  it('reports no basis without a projection and exports the basis with one', () => {
    const column = ckdEndpointsModule.exportColumns.find((c) => c.key === 'endpoint_prediction_age_basis')!
    const cell = (endpoints: ReturnType<typeof computeCkdEndpoints>) => column.value({ flags: [], endpoints, fitModel: 'ols' })
    const withheld = computeCkdEndpoints({ points: [point('2020-01-01', 60, 60)], ...declining, enabled: projecting })
    expect(withheld.projectedAgeToCkdG5.ageBasis).toBeUndefined()
    expect(cell(withheld)).toBe('')
    const base = { points: [point('2020-01-01', 60, 60), point('2021-01-01', 50, 61), point('2022-01-01', 40, 62)], ...declining, enabled: projecting }
    expect(cell(computeCkdEndpoints(base))).toBe('age in completed years')
    expect(cell(computeCkdEndpoints({ ...base, ageBasis: 'birth_date' }))).toBe('birth date')
  })
})

describe('a derived eGFR inherits the non-exact status of its creatinine row (OD-15)', () => {
  it('keeps range and unparseable sources out of fits and endpoints, and flips bounds as before', () => {
    const source = (wertOperator: LabRow['wertOperator'], day: number): LabRow => ({ patientId: 1, labDatum: new Date(Date.UTC(2020, 0, day)), bezeichnung: 'Kreatinin',
      einheit: 'mg/dl', wert: '1.0', wertNum: 1, wertOperator, loinc: null, patientSex: 'm', patientAgeAtLab: 50 })
    const derived = appendComputedEgfr([source('=', 1), source('<', 2), source('>', 3), source('range', 4), source('unparseable', 5)], { formula: 'ckd-epi-2021' }).slice(5)
    expect(derived.map((r) => r.wertOperator)).toEqual(['=', '>', '<', 'range', 'unparseable'])
    expect(derived.map(isExactMeasurement)).toEqual([true, false, false, false, false])
    expect(new Set(derived.map((r) => r.wertNum)).size).toBe(1)
  })
})
