import { describe, it, expect } from 'vitest'
import { buildSlopeLines } from '../../../src/core/stats/slopeLines'
import type { SeriesPoint } from '../../../src/core/stats/series'
import type { ClinicalEvent } from '../../../src/core/events/events'

const d = (s: string) => new Date(s)
const pts: SeriesPoint[] = [
  { date: d('2019-01-01'), value: 1 },
  { date: d('2020-01-01'), value: 2 },
  { date: d('2021-01-01'), value: 3 },
]

describe('buildSlopeLines', () => {
  it('global mode returns a single 2-point line', () => {
    const lines = buildSlopeLines(pts, { mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180 })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveLength(2)
  })

  it('gap-split returns one line per fittable segment', () => {
    const lines = buildSlopeLines(pts, { mode: 'gap-split', gapDays: 180, windowDays: 730, stepDays: 180 })
    expect(lines.length).toBeGreaterThanOrEqual(1)
  })

  it('returns no lines when fewer than 3 points (global)', () => {
    const lines = buildSlopeLines(pts.slice(0, 2), { mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180 })
    expect(lines).toEqual([])
  })

  it('chronic-ckd starts the trend after the cutoff period', () => {
    const lines = buildSlopeLines([...pts, { date: d('2022-01-01'), value: 4 }], { mode: 'chronic-ckd', gapDays: 180, windowDays: 730, stepDays: 180, cutoffDays: 300 })
    expect(lines).toHaveLength(1)
    expect(lines[0][0].date.toISOString().slice(0, 10)).toBe('2020-01-01')
  })

  it('event-driven returns one line per fittable event segment', () => {
    const eventPts = [
      ...pts,
      { date: d('2022-01-01'), value: 4 },
      { date: d('2023-01-01'), value: 5 },
      { date: d('2024-01-01'), value: 6 },
    ]
    const lines = buildSlopeLines(eventPts, { mode: 'event-driven', gapDays: 180, windowDays: 730, stepDays: 180, eventDates: [d('2021-06-01')] })
    expect(lines).toHaveLength(2)
  })

  it('uses clinical event exclusions for the fitted overlay without removing plotted points', () => {
    const transplantPts = [
      { date: d('2018-01-01'), value: 8 },
      { date: d('2019-01-01'), value: 9 },
      { date: d('2020-01-01'), value: 10 },
      { date: d('2021-01-01'), value: 11 },
      { date: d('2022-01-01'), value: 200 },
      { date: d('2023-01-01'), value: 220 },
    ]
    const transplant: ClinicalEvent = {
      patientId: 1,
      type: 'kidney_transplant',
      date: d('2022-01-01'),
      title: 'Kidney transplant',
      description: null,
      endDate: null,
      intent: null,
      warning: '',
    }

    const lines = buildSlopeLines(transplantPts, {
      mode: 'global',
      gapDays: 180,
      windowDays: 730,
      stepDays: 180,
      clinicalEvents: [transplant],
    })

    expect(lines).toHaveLength(1)
    expect(lines[0][0].date.toISOString().slice(0, 10)).toBe('2018-01-01')
    expect(lines[0][1].date.toISOString().slice(0, 10)).toBe('2021-01-01')
    expect(lines[0][1].value - lines[0][0].value).toBeLessThan(4)
  })

  it('applies quarterly median time balancing before building the fit line', () => {
    const clustered = [
      { date: d('2020-01-01'), value: 10 },
      { date: d('2020-01-10'), value: 100 },
      { date: d('2020-01-20'), value: 100 },
      { date: d('2020-04-01'), value: 20 },
      { date: d('2020-07-01'), value: 30 },
    ]

    const raw = buildSlopeLines(clustered, { mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180, timeBalancing: 'raw' })
    const quarterly = buildSlopeLines(clustered, { mode: 'global', gapDays: 180, windowDays: 730, stepDays: 180, timeBalancing: 'quarterly-median' })

    expect(raw).toHaveLength(1)
    expect(quarterly).toHaveLength(1)
    expect(quarterly[0][0].date.toISOString().slice(0, 10)).toBe('2020-01-10')
    expect(quarterly[0][0].value).toBeGreaterThan(raw[0][0].value)
    expect(quarterly[0][1].value).toBeLessThan(raw[0][1].value)
  })
})

describe('buildSlopeLines aki-aware', () => {
  const dd = (s: string) => new Date(s)
  const spiky = [
    { date: dd('2019-01-01T00:00:00Z'), value: 1.0 },
    { date: dd('2019-06-01T00:00:00Z'), value: 1.1 },
    { date: dd('2020-01-01T00:00:00Z'), value: 1.05 },
    { date: dd('2020-07-30T00:00:00Z'), value: 1.15 },
    { date: dd('2020-08-01T00:00:00Z'), value: 2.4 },
    { date: dd('2020-08-10T00:00:00Z'), value: 1.8 },
    { date: dd('2020-10-01T00:00:00Z'), value: 1.2 },
    { date: dd('2021-06-01T00:00:00Z'), value: 1.3 },
  ]
  const cfg = { mode: 'aki-aware' as const, gapDays: 180, windowDays: 730, stepDays: 180, exclusionDays: 30 }
  it('returns one line spanning the kept points only', () => {
    const lines = buildSlopeLines(spiky, cfg)
    expect(lines).toHaveLength(1)
    expect(lines[0][0].date.toISOString().slice(0, 10)).toBe('2019-01-01')
    expect(lines[0][1].date.toISOString().slice(0, 10)).toBe('2021-06-01')
  })
  it('returns [] when nothing survives', () => {
    const burst = [
      { date: dd('2020-01-02'), value: 1.0 }, { date: dd('2020-01-04'), value: 1.6 }, { date: dd('2020-01-10'), value: 1.4 },
    ]
    // self-detection finds the 01-04 episode (abs +0.6 within 48 h); the 30 d
    // window drops 01-04 and 01-10, leaving 1 point -> unfittable
    expect(buildSlopeLines(burst, cfg)).toEqual([])
  })
})
