import { describe, expect, it } from 'vitest'
import { filterFitPointsByClinicalEvents } from '../../../src/core/events/fitExclusions'
import type { ClinicalEvent } from '../../../src/core/events/events'
import type { SeriesPoint } from '../../../src/core/stats/series'
import { ckdProgressionConfig, generalExplorationConfig } from '../../../src/core/fitPipeline/types'

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
