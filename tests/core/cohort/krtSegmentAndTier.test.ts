import { describe, expect, it } from 'vitest'
import { buildCohortRows, cohortExportRecords, type CohortSeriesSpec } from '../../../src/core/cohort/screening'
import { clinicalEventsByPatient, cohortSeriesSpec } from '../../../src/core/cohort/specs'
import { generalExplorationConfig, theilSenConfig } from '../../../src/core/analysis/fitConfig'
import { acuteReviewConfig, ckdProgressionConfig } from '../../../src/core/domains/nephrology/fitConfig'
import type { ClinicalEvent } from '../../../src/core/events/events'
import { fitGlobal } from '../../../src/core/stats/series'
import { slopeTier } from '../../../src/core/stats/slopeQuality'
import type { LabRow } from '../../../src/core/types'

const day = (s: string) => new Date(`${s}T00:00:00Z`)
const parameter = { bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²' }
const lab = (date: string, value: number): LabRow => ({ patientId: 'P', labDatum: day(date), bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²', wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: 60 })
const event = (date: string, type: ClinicalEvent['type'], intent: ClinicalEvent['intent'] = null, endDate: string | null = null): ClinicalEvent =>
  ({ patientId: 'P', type, date: day(date), title: type, description: null, endDate: endDate ? day(endDate) : null, intent, warning: '' })

// The worked example of the method reference (clinical-events.md, "Kidney
// replacement therapy in every preset"): four values before a transplant on
// 2021-06-01, three after it.
const series = [['2018-01-01', 60], ['2019-01-01', 55], ['2020-01-01', 50], ['2021-01-01', 44], ['2021-09-01', 70], ['2022-03-01', 68], ['2022-09-01', 66]] as const
const rows = series.map(([date, value]) => lab(date, value))
const transplant = event('2021-06-01', 'kidney_transplant')
const cell = (config: CohortSeriesSpec['fitConfig'], events: ClinicalEvent[] = [transplant]) =>
  buildCohortRows(rows, ['P'], [cohortSeriesSpec(parameter, config!, { clinicalEventsByPatient: clinicalEventsByPatient(events) })])[0].cells[0]
const general = generalExplorationConfig(parameter)
const including = { ...general, preset: 'custom' as const, censoring: { ...general.censoring, censorAfterKidneyTransplant: false } }
const points = (from: number, to: number) => series.slice(from, to).map(([date, value]) => ({ date: day(date), value }))

describe('kidney replacement therapy in every preset (decision `censor`, 2026-11-22)', () => {
  it('General exploration and Theil–Sen fit only the values before the transplant', () => {
    const before = fitGlobal(points(0, 4))
    const ols = cell(general)
    expect(ols.slope).toBeCloseTo(before.slope, 12)
    expect(ols.slope).toBeCloseTo(-5.299, 3)
    expect(ols).toMatchObject({ nNumeric: 7, nFitted: 4, nFittedDates: 4, fittedSpanDays: 1096 })
    expect(ols.pointExclusionReasons.slice(4)).toEqual([['post_kidney_transplant'], ['post_kidney_transplant'], ['post_kidney_transplant']])
    expect(ols.krtSegment).toBeUndefined()
    // Across the transplant, as until 2026-11-22: a rising slope.
    expect(fitGlobal(points(0, 7)).slope).toBeCloseTo(2.458, 3)
    const robust = cell(theilSenConfig(parameter))
    expect(robust.nFitted).toBe(4)
    expect(robust.slope).toBeCloseTo(-5.168, 3)
  })

  it('Acute review marks the same values without fitting', () => {
    const acute = cell(acuteReviewConfig(parameter))
    expect(acute.fitModel).toBe('none')
    expect(acute.pointExclusionReasons.slice(4).every(reasons => reasons.includes('post_kidney_transplant'))).toBe(true)
    expect(acute.krtSegment).toBeUndefined()
  })

  it('included on request, the values after the transplant are a separate segment and the slope stays that of native kidney function', () => {
    const included = cell(including)
    expect(included.slope).toBeCloseTo(cell(general).slope, 12)
    expect(included.nFitted).toBe(4)
    expect(included.pointExclusionReasons.slice(4)).toEqual([['krt_segment'], ['krt_segment'], ['krt_segment']])
    const segment = included.krtSegment!
    expect(segment.event).toBe(transplant)
    expect(segment.fit).toMatchObject({ nFitted: 3, nFittedDates: 3, fittedSpanDays: 365, firstDate: day('2021-09-01'), lastDate: day('2022-09-01') })
    expect(segment.fit.slope).toBeCloseTo(fitGlobal(points(4, 7)).slope, 12)
    expect(segment.fit.slope).toBeCloseTo(-4.003, 3)
    expect(segment.line).toHaveLength(2)
    expect(segment.line![0].date).toEqual(day('2021-09-01'))
    const [record] = cohortExportRecords([{ patientId: 'P', cells: [included] }])
    expect(record).toMatchObject({ krt_segment_start: '2021-06-01', krt_segment_n_fitted: 3, krt_segment_n_fitted_dates: 3, krt_segment_fitted_span_days: 365, slope_tier: 'reliable' })
    expect(record.krt_segment_slope).toBeCloseTo(-4.003, 3)
    const [plain] = cohortExportRecords([{ patientId: 'P', cells: [cell(general)] }])
    expect(plain).toMatchObject({ krt_segment_start: '', krt_segment_slope: '', krt_segment_n_fitted: '', slope_tier: 'reliable' })
  })

  it('a later KRT event ends the segment; chronic dialysis first and censored leaves no segment', () => {
    const dialysis = event('2022-06-01', 'dialysis', 'chronic')
    const ended = cell({ ...including, censoring: { ...including.censoring, censorAfterChronicDialysis: false } }, [transplant, dialysis])
    expect(ended.krtSegment!.fit.nFitted).toBe(2)
    expect(ended.pointExclusionReasons.at(-1)).toEqual(['krt_segment', 'post_chronic_dialysis'])
    const first = cell(including, [event('2020-06-01', 'dialysis', 'chronic'), transplant])
    expect(first.krtSegment).toBeUndefined()
    expect(first.nFitted).toBe(3)
  })

  it('no segment without a fit, or with the trend off', () => {
    expect(cell({ ...including, fitModel: 'none' }).krtSegment).toBeUndefined()
  })
})

describe('dialysis of unknown intent without an end date under CKD progression (decision `dial`, 2026-11-22)', () => {
  const dialysis = event('2021-06-01', 'dialysis', 'unknown')
  it('leaves out the values from the dialysis start, and only the dated interval with an end date', () => {
    const ckd = ckdProgressionConfig(parameter)
    const undated = cell(ckd, [dialysis])
    expect(undated.pointExclusionReasons.slice(4)).toEqual([['unknown_dialysis_open'], ['unknown_dialysis_open'], ['unknown_dialysis_open']])
    const dated = cell(ckd, [{ ...dialysis, endDate: day('2021-10-01') }])
    expect(dated.pointExclusionReasons.slice(4)).toEqual([['unknown_dialysis_interval'], [], []])
    // General exploration only flags it.
    expect(cell(general, [dialysis]).pointExclusionReasons.slice(4)).toEqual([[], [], []])
  })

  it('keeps the values as endpoint input and never reports kidney failure', () => {
    const undated = cell(ckdProgressionConfig(parameter), [dialysis])
    expect(undated.endpoints.kidneyFailureReached).toBeFalsy()
    expect(undated.lastEligibleValue).toBe(66)
  })
})

describe('slope tier (decision `minfu`, 2026-11-22)', () => {
  const tier = (nFittedDates: number, fittedSpanDays: number, extra: Partial<Parameters<typeof slopeTier>[0]> = {}) =>
    slopeTier({ reason: null, nFitted: nFittedDates, nFittedDates, fittedSpanDays, fitModel: 'ols', slope: -3, ...extra })
  it('is reliable from 4 fitted dates over 731 whole days, estimable from 3 dates over 365 days, else uncertain', () => {
    expect(tier(4, 731)).toBe('reliable')
    // 2 × 365.25 = 730.5 days: two calendar years without a leap day (730 days) are not enough.
    expect(tier(4, 730)).toBe('estimable')
    expect(tier(3, 1500)).toBe('estimable')
    expect(tier(3, 365)).toBe('estimable')
    expect(tier(3, 364)).toBe('uncertain')
    expect(tier(2, 1500)).toBe('uncertain')
    // Dates, not points: six fitted points on three dates are not reliable.
    expect(tier(3, 900, { nFitted: 6 })).toBe('estimable')
  })
  it('has no tier without a slope or without a fit', () => {
    expect(tier(5, 900, { slope: Number.NaN })).toBeNull()
    expect(tier(5, 900, { fitModel: 'none' })).toBeNull()
  })
  it('counts fitted dates after time balancing: eight values in two quarters are uncertain', () => {
    const quarterly = ['2020-01-05', '2020-02-01', '2020-03-01', '2020-03-20', '2022-04-02', '2022-05-01', '2022-05-20', '2022-06-10'].map((date, i) => lab(date, 60 - i))
    const c = buildCohortRows(quarterly, ['P'], [cohortSeriesSpec(parameter, ckdProgressionConfig(parameter))])[0].cells[0]
    expect(c).toMatchObject({ nNumeric: 8, nFitted: 2 })
    const [record] = cohortExportRecords([{ patientId: 'P', cells: [c] }])
    expect(record).toMatchObject({ unstable_slope: 'yes', slope_tier: 'uncertain' })
  })
})
