import { describe, it, expect } from 'vitest'
import { summarizeByBezeichnung } from '../../../src/core/stats/summarize'
import { episodesForSeries } from '../../../src/core/aki/akiAware'
import type { LabRow } from '../../../src/core/types'
import type { AnalysisFitInputContribution } from '../../../src/core/analysis/types'
import type { ClinicalEvent } from '../../../src/core/events/events'

function akiRow(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}
const ad = (s: string) => new Date(s)

function row(p: Partial<LabRow>): LabRow {
  return {
    patientId: 1, labDatum: null, bezeichnung: 'X', einheit: 'u', wert: null,
    wertNum: null, wertOperator: '=', loinc: null, patientSex: null,
    patientAgeAtLab: null, ...p,
  }
}
const d = (s: string) => new Date(s)

describe('summarizeByBezeichnung', () => {
  it('flags no_numeric_values when a series has only text', () => {
    const rows = [row({ bezeichnung: 'A', wert: 'pos', wertNum: null, labDatum: d('2020-01-01') })]
    const out = summarizeByBezeichnung(rows, 1, 'global')
    expect(out[0].reason).toBe('no_numeric_values')
    expect(out[0].nNumeric).toBe(0)
  })

  it('flags n_below_threshold for fewer than 3 numeric', () => {
    const rows = [
      row({ bezeichnung: 'A', wertNum: 1, labDatum: d('2020-01-01') }),
      row({ bezeichnung: 'A', wertNum: 2, labDatum: d('2020-06-01') }),
    ]
    const out = summarizeByBezeichnung(rows, 1, 'global')
    expect(out[0].reason).toBe('n_below_threshold')
  })

  it('flags span_too_short but still computes a slope', () => {
    const rows = [
      row({ bezeichnung: 'A', wertNum: 1, labDatum: d('2020-01-01') }),
      row({ bezeichnung: 'A', wertNum: 2, labDatum: d('2020-02-01') }),
      row({ bezeichnung: 'A', wertNum: 3, labDatum: d('2020-03-01') }),
    ]
    const out = summarizeByBezeichnung(rows, 1, 'global')
    expect(out[0].reason).toBe('span_too_short')
    expect(Number.isNaN(out[0].slope)).toBe(false)
  })

  it('returns null reason and a slope for a long valid series', () => {
    const rows = [
      row({ bezeichnung: 'A', wertNum: 1, labDatum: d('2019-01-01') }),
      row({ bezeichnung: 'A', wertNum: 2, labDatum: d('2020-01-01') }),
      row({ bezeichnung: 'A', wertNum: 3, labDatum: d('2021-01-01') }),
    ]
    const out = summarizeByBezeichnung(rows, 1, 'global')
    expect(out[0].reason).toBeNull()
    expect(out[0].slope).toBeGreaterThan(0)
  })

  it('splits separate (Bezeichnung, Einheit) into separate rows, sorted by n', () => {
    const rows = [
      row({ bezeichnung: 'A', einheit: 'u1', wertNum: 1, labDatum: d('2019-01-01') }),
      row({ bezeichnung: 'A', einheit: 'u1', wertNum: 2, labDatum: d('2020-01-01') }),
      row({ bezeichnung: 'A', einheit: 'u2', wertNum: 5, labDatum: d('2019-01-01') }),
    ]
    const out = summarizeByBezeichnung(rows, 1, 'global')
    expect(out).toHaveLength(2)
    expect(out[0].nNumeric).toBeGreaterThanOrEqual(out[1].nNumeric)
  })
})

describe('summarizeByBezeichnung aki-aware mode', () => {
  const rows: LabRow[] = [
    akiRow({ labDatum: ad('2019-01-01T00:00:00Z'), wertNum: 1.0 }),
    akiRow({ labDatum: ad('2019-06-01T00:00:00Z'), wertNum: 1.1 }),
    akiRow({ labDatum: ad('2020-01-01T00:00:00Z'), wertNum: 1.05 }),
    akiRow({ labDatum: ad('2020-07-30T00:00:00Z'), wertNum: 1.15 }),
    akiRow({ labDatum: ad('2020-08-01T00:00:00Z'), wertNum: 2.4 }),
    akiRow({ labDatum: ad('2020-08-10T00:00:00Z'), wertNum: 1.8 }),
    akiRow({ labDatum: ad('2020-10-01T00:00:00Z'), wertNum: 1.2 }),
    akiRow({ labDatum: ad('2021-06-01T00:00:00Z'), wertNum: 1.3 }),
  ]
  it('excludes AKI windows from the fit (slope differs from global)', () => {
    const global = summarizeByBezeichnung(rows, 1, 'global')[0]
    const aware = summarizeByBezeichnung(rows, 1, 'aki-aware')[0]
    expect(aware.nNumeric).toBe(8) // display counts still cover all points
    expect(aware.slope).not.toBeCloseTo(global.slope, 6)
    expect(aware.slope).toBeLessThan(global.slope)
    expect(aware.reason).toBeNull()
  })
  it('reports n_below_threshold when fewer than 3 points survive exclusion', () => {
    const burst: LabRow[] = [
      akiRow({ labDatum: ad('2020-01-01T00:00:00Z'), wertNum: 1.0 }),
      akiRow({ labDatum: ad('2020-01-02T00:00:00Z'), wertNum: 1.6 }),
      akiRow({ labDatum: ad('2020-01-10T00:00:00Z'), wertNum: 1.4 }),
    ]
    const aware = summarizeByBezeichnung(burst, 1, 'aki-aware')[0]
    expect(Number.isNaN(aware.slope)).toBe(true)
    expect(aware.reason).toBe('n_below_threshold')
  })
  it('honours the exclusionDays parameter', () => {
    // With a 0-day window only the episode-day points drop out.
    const zero = summarizeByBezeichnung(rows, 1, 'aki-aware', { exclusionDays: 0 })[0]
    const thirty = summarizeByBezeichnung(rows, 1, 'aki-aware', { exclusionDays: 30 })[0]
    expect(zero.slope).not.toBeCloseTo(thirty.slope, 6)
  })
  it('honours the exclusionDays parameter when AKI fit inputs are supplied', () => {
    const fitInputs: AnalysisFitInputContribution[] = [{
      id: 'aki-aware:1:Kreatinin:mg/dl',
      patientId: 1,
      seriesKey: { bezeichnung: 'Kreatinin', einheit: 'mg/dl' },
      kind: 'aki-aware',
      exclusionDays: 30,
      episodes: episodesForSeries(rows, 1, 'Kreatinin', 'mg/dl'),
    }]
    const zero = summarizeByBezeichnung(rows, 1, 'aki-aware', { exclusionDays: 0, fitInputs })[0]
    const thirty = summarizeByBezeichnung(rows, 1, 'aki-aware', { exclusionDays: 30, fitInputs })[0]
    expect(zero.slope).not.toBeCloseTo(thirty.slope, 6)
  })
})

describe('summarizeByBezeichnung extended preset modes', () => {
  it('global-robust resists a late outlier better than ordinary OLS', () => {
    const rows = [
      row({ bezeichnung: 'A', wertNum: 1, labDatum: d('2019-01-01') }),
      row({ bezeichnung: 'A', wertNum: 2, labDatum: d('2020-01-01') }),
      row({ bezeichnung: 'A', wertNum: 3, labDatum: d('2021-01-01') }),
      row({ bezeichnung: 'A', wertNum: 4, labDatum: d('2022-01-01') }),
      row({ bezeichnung: 'A', wertNum: 5, labDatum: d('2023-01-01') }),
      row({ bezeichnung: 'A', wertNum: 30, labDatum: d('2024-01-01') }),
    ]
    const ols = summarizeByBezeichnung(rows, 1, 'global')[0]
    const robust = summarizeByBezeichnung(rows, 1, 'global-robust')[0]
    expect(robust.slope).toBeLessThan(ols.slope)
    expect(robust.slope).toBeGreaterThan(0.9)
    expect(robust.slope).toBeLessThan(1.2)
  })

  it('chronic-ckd excludes the early cutoff period before fitting', () => {
    const rows = [
      row({ bezeichnung: 'A', wertNum: 100, labDatum: d('2020-01-01') }),
      row({ bezeichnung: 'A', wertNum: 70, labDatum: d('2020-02-01') }),
      row({ bezeichnung: 'A', wertNum: 50, labDatum: d('2020-04-15') }),
      row({ bezeichnung: 'A', wertNum: 49, labDatum: d('2021-04-15') }),
      row({ bezeichnung: 'A', wertNum: 48, labDatum: d('2022-04-15') }),
    ]
    const global = summarizeByBezeichnung(rows, 1, 'global')[0]
    const chronic = summarizeByBezeichnung(rows, 1, 'chronic-ckd', { cutoffDays: 90 })[0]
    expect(chronic.slope).toBeGreaterThan(global.slope)
    expect(chronic.slope).toBeLessThan(0)
  })

  it('event-driven splits at event dates and reports the strongest segment slope', () => {
    const rows = [
      row({ bezeichnung: 'A', wertNum: 1, labDatum: d('2020-01-01') }),
      row({ bezeichnung: 'A', wertNum: 2, labDatum: d('2020-02-01') }),
      row({ bezeichnung: 'A', wertNum: 3, labDatum: d('2020-03-01') }),
      row({ bezeichnung: 'A', wertNum: 10, labDatum: d('2021-01-01') }),
      row({ bezeichnung: 'A', wertNum: 10.5, labDatum: d('2022-01-01') }),
      row({ bezeichnung: 'A', wertNum: 11, labDatum: d('2023-01-01') }),
    ]
    const out = summarizeByBezeichnung(rows, 1, 'event-driven', { eventDates: [d('2020-06-01')] })[0]
    expect(out.nSegments).toBe(2)
    expect(out.slope).toBeGreaterThan(10)
  })

  it('excludes post-transplant values from fit summaries while preserving display counts', () => {
    const rows = [
      row({ bezeichnung: 'A', wertNum: 8, labDatum: d('2018-01-01') }),
      row({ bezeichnung: 'A', wertNum: 9, labDatum: d('2019-01-01') }),
      row({ bezeichnung: 'A', wertNum: 10, labDatum: d('2020-01-01') }),
      row({ bezeichnung: 'A', wertNum: 11, labDatum: d('2021-01-01') }),
      row({ bezeichnung: 'A', wertNum: 200, labDatum: d('2022-01-01') }),
      row({ bezeichnung: 'A', wertNum: 220, labDatum: d('2023-01-01') }),
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

    const unfiltered = summarizeByBezeichnung(rows, 1, 'global')[0]
    const filtered = summarizeByBezeichnung(rows, 1, 'global', { clinicalEvents: [transplant] })[0]

    expect(filtered.nNumeric).toBe(6)
    expect(filtered.reason).toBeNull()
    expect(filtered.slope).toBeGreaterThan(0.9)
    expect(filtered.slope).toBeLessThan(1.1)
    expect(filtered.slope).toBeLessThan(unfiltered.slope)
  })
})
