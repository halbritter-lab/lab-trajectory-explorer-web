import { describe, expect, it } from 'vitest'
import { clinicalEventExclusionReason, filterFitPointsByClinicalEvents } from '../../../src/core/domains/nephrology/censoring'
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

  it('keeps display-only and unresolved warning events in the fit', () => {
    const result = filterFitPointsByClinicalEvents(points, [
      event({ type: 'other', date: d('2021-01-01'), title: 'Admission' }),
      event({ type: 'dialysis', intent: 'unknown', date: d('2022-01-01'), title: 'Dialysis' }),
    ], ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }).censoring)

    expect(result.points).toEqual(points)
    expect(result.excludedIdx).toEqual([])
  })

  it('keeps RRT events in the fit for the general exploration preset', () => {
    const result = filterFitPointsByClinicalEvents(points, [
      event({ type: 'kidney_transplant', date: d('2021-01-01'), title: 'Kidney transplant' }),
      event({ type: 'dialysis', intent: 'chronic', date: d('2020-01-01'), title: 'Chronic dialysis' }),
    ], generalExplorationConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' }).censoring)

    expect(result.points).toEqual(points)
    expect(result.excludedIdx).toEqual([])
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
      [event({ type: 'dialysis', intent: 'acute' }), null],
      [event({ type: 'other' }), null],
    ]
    for (const [ev, reason] of cases) {
      expect(clinicalEventExclusionReason(d('2020-01-01'), ev, censoring)).toBe(reason)
      const excluded = filterFitPointsByClinicalEvents(points, [ev], censoring).excludedIdx
      expect(excluded.includes(1)).toBe(reason !== null)
    }
    expect(clinicalEventExclusionReason(d('2019-01-01'), event({ type: 'kidney_transplant' }), censoring)).toBeNull()
    const off = generalExplorationConfig({ bezeichnung: 'eGFR', einheit: null }).censoring
    expect(clinicalEventExclusionReason(d('2020-01-01'), event({ type: 'kidney_transplant' }), off)).toBeNull()
  })
})
