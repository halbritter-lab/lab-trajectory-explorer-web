import { describe, expect, it } from 'vitest'
import { clinicalEventExclusionReason, clinicalEventExclusionWindows, filterFitPointsByClinicalEvents, krtSegmentEvent } from '../../../src/core/domains/nephrology/censoring'
import type { ClinicalEvent } from '../../../src/core/events/events'
import type { SeriesPoint } from '../../../src/core/stats/series'
import { ckdProgressionConfig } from '../../../src/core/domains/nephrology/fitConfig'
import { generalExplorationConfig } from '../../../src/core/analysis/fitConfig'

const d = (s: string) => new Date(s)

function event(p: Partial<ClinicalEvent>): ClinicalEvent {
  return {
    patientId: 1,
    type: 'other',
    date: d('2020-01-01'),
    title: 'Event',
    description: null,
    endDate: null,
    intent: null,
    warning: '',
    ...p,
  }
}

const points: SeriesPoint[] = [
  { date: d('2019-01-01'), value: 1 },
  { date: d('2020-01-01'), value: 2 },
  { date: d('2021-01-01'), value: 3 },
  { date: d('2022-01-01'), value: 4 },
]

describe('filterFitPointsByClinicalEvents', () => {
  it('censors fit points on and after kidney transplant', () => {
    const result = filterFitPointsByClinicalEvents(points, [
      event({ type: 'kidney_transplant', date: d('2021-01-01'), title: 'Kidney transplant' }),
    ], ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }).censoring)

    expect(result.points.map((p) => p.date.toISOString().slice(0, 10))).toEqual(['2019-01-01', '2020-01-01'])
    expect(result.excludedIdx).toEqual([2, 3])
  })

  it('censors fit points on and after chronic dialysis start', () => {
    const result = filterFitPointsByClinicalEvents(points, [
      event({ type: 'dialysis', intent: 'chronic', date: d('2021-01-01'), title: 'Chronic dialysis' }),
    ], ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }).censoring)

    expect(result.excludedIdx).toEqual([2, 3])
  })

  it('excludes only a dated dialysis interval for acute or unknown interval events', () => {
    const result = filterFitPointsByClinicalEvents(points, [
      event({ type: 'dialysis', intent: 'acute', date: d('2020-06-01'), endDate: d('2021-06-01'), title: 'Acute dialysis' }),
    ], ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }).censoring)

    expect(result.points.map((p) => p.date.toISOString().slice(0, 10))).toEqual(['2019-01-01', '2020-01-01', '2022-01-01'])
    expect(result.excludedIdx).toEqual([2])
  })

  it('keeps display-only events and acute dialysis without an end date in the fit', () => {
    const result = filterFitPointsByClinicalEvents(points, [
      event({ type: 'other', date: d('2021-01-01'), title: 'Admission' }),
      event({ type: 'dialysis', intent: 'acute', date: d('2022-01-01'), title: 'Dialysis' }),
    ], ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }).censoring)

    expect(result.points).toEqual(points)
    expect(result.excludedIdx).toEqual([])
  })

  it('CKD progression: an undated dialysis of unknown intent censors from its start (decision `dial`, 2026-11-22)', () => {
    const censoring = ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }).censoring
    const undated = event({ type: 'dialysis', intent: 'unknown', date: d('2021-01-01'), title: 'Dialysis' })
    expect(filterFitPointsByClinicalEvents(points, [undated], censoring).excludedIdx).toEqual([2, 3])
    expect(clinicalEventExclusionReason(d('2021-01-01'), undated, censoring)).toBe('unknown_dialysis_open')
    expect(clinicalEventExclusionReason(d('2020-12-31'), undated, censoring)).toBeNull()
    // With an end date only the interval, as before; the first value after it is kept.
    const dated = event({ type: 'dialysis', intent: 'unknown', date: d('2021-01-01'), endDate: d('2021-02-01'), title: 'Dialysis' })
    expect(filterFitPointsByClinicalEvents(points, [dated], censoring).excludedIdx).toEqual([2])
    // The other policies are unchanged.
    expect(filterFitPointsByClinicalEvents(points, [undated], { ...censoring, unknownDialysisPolicy: 'exclude-dated-interval' }).excludedIdx).toEqual([])
    expect(filterFitPointsByClinicalEvents(points, [undated], { ...censoring, unknownDialysisPolicy: 'flag-only' }).excludedIdx).toEqual([])
    expect(clinicalEventExclusionReason(d('2022-01-01'), undated, { ...censoring, unknownDialysisPolicy: 'censor-from-start' })).toBe('unknown_dialysis_interval')
  })

  it('censors after RRT events in the general exploration preset (decision `censor`, 2026-11-22)', () => {
    const result = filterFitPointsByClinicalEvents(points, [
      event({ type: 'kidney_transplant', date: d('2021-01-01'), title: 'Kidney transplant' }),
      event({ type: 'dialysis', intent: 'chronic', date: d('2020-01-01'), title: 'Chronic dialysis' }),
    ], generalExplorationConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }).censoring)

    expect(result.points).toEqual(points.slice(0, 1))
    expect(result.excludedIdx).toEqual([1, 2, 3])
  })
})

describe('the separate segment after kidney replacement therapy', () => {
  const included = { censorAfterKidneyTransplant: false, censorAfterChronicDialysis: false, excludeAcuteDialysisPeriods: false, unknownDialysisPolicy: 'flag-only' } as const
  it('ends the native fit at the first KRT event when its option is off, and a later KRT event ends the segment', () => {
    const transplant = event({ type: 'kidney_transplant', date: d('2020-01-01'), title: 'Kidney transplant' })
    const dialysis = event({ type: 'dialysis', intent: 'chronic', date: d('2022-01-01'), title: 'Chronic dialysis' })
    expect(clinicalEventExclusionWindows([transplant, dialysis], included)).toEqual([
      { reason: 'krt_segment', start: d('2020-01-01'), end: null },
      { reason: 'post_chronic_dialysis', start: d('2022-01-01'), end: null },
    ])
    expect(krtSegmentEvent([dialysis, transplant], included)).toBe(transplant)
    expect(filterFitPointsByClinicalEvents(points, [transplant, dialysis], included).excludedIdx).toEqual([1, 2, 3])
  })

  it('adds nothing when the first KRT event censors, without a configuration, or without a KRT event', () => {
    const transplant = event({ type: 'kidney_transplant', date: d('2021-01-01'), title: 'Kidney transplant' })
    const dialysis = event({ type: 'dialysis', intent: 'chronic', date: d('2020-01-01'), title: 'Chronic dialysis' })
    // Chronic dialysis comes first and censors; the transplant option is off.
    expect(clinicalEventExclusionWindows([transplant, dialysis], { ...included, censorAfterChronicDialysis: true })).toEqual([
      { reason: 'post_chronic_dialysis', start: d('2020-01-01'), end: null },
    ])
    expect(krtSegmentEvent([transplant, dialysis], { ...included, censorAfterChronicDialysis: true })).toBeNull()
    expect(krtSegmentEvent([transplant])).toBeNull()
    expect(krtSegmentEvent([event({ type: 'dialysis', intent: 'acute', date: d('2020-01-01') })], included)).toBeNull()
  })
})

describe('clinicalEventExclusionReason', () => {
  const censoring = ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: null }).censoring
  it('names the event policy that excludes a point and agrees with the filter', () => {
    const cases: [ClinicalEvent, string | null][] = [
      [event({ type: 'kidney_transplant' }), 'post_kidney_transplant'],
      [event({ type: 'dialysis', intent: 'chronic' }), 'post_chronic_dialysis'],
      [event({ type: 'dialysis', intent: 'acute', endDate: d('2020-06-01') }), 'acute_dialysis'],
      [event({ type: 'dialysis', intent: 'unknown', endDate: d('2020-06-01') }), 'unknown_dialysis_interval'],
      [event({ type: 'dialysis', intent: 'unknown' }), 'unknown_dialysis_open'],
      [event({ type: 'dialysis', intent: 'acute' }), null],
      [event({ type: 'other' }), null],
    ]
    for (const [ev, reason] of cases) {
      expect(clinicalEventExclusionReason(d('2020-01-01'), ev, censoring)).toBe(reason)
      const excluded = filterFitPointsByClinicalEvents(points, [ev], censoring).excludedIdx
      expect(excluded.includes(1)).toBe(reason !== null)
    }
    expect(clinicalEventExclusionReason(d('2019-01-01'), event({ type: 'kidney_transplant' }), censoring)).toBeNull()
    const off = { ...generalExplorationConfig({ bezeichnung: 'eGFR', einheit: null }).censoring, censorAfterKidneyTransplant: false }
    expect(clinicalEventExclusionReason(d('2020-01-01'), event({ type: 'kidney_transplant' }), off)).toBeNull()
  })
})
