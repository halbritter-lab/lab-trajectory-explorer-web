import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../../src/core/types'
import { akiModule } from '../../../src/core/domains/nephrology/aki/akiModule'
import { MGDL_PER_UMOLL } from '../../../src/core/domains/nephrology/constants'
import { buildCohortRows } from '../../../src/core/cohort/screening'
import { cohortSeriesSpec } from '../../../src/core/cohort/specs'

function row(date: string, value: number, p: Partial<LabRow> = {}): LabRow {
  return {
    patientId: 1,
    labDatum: new Date(date),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: String(value),
    wertNum: value,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 50,
    ...p,
  }
}

describe('akiModule', () => {
  it('labels converted µmol/l AKI marker values in mg/dl', () => {
    const rows = [
      row('2020-01-01T00:00:00Z', 1 * MGDL_PER_UMOLL, { einheit: 'µmol/l' }),
      row('2020-01-02T00:00:00Z', 1.5 * MGDL_PER_UMOLL, { einheit: 'µmol/l' }),
    ]
    const series = akiModule.series({
      patientId: 1, seriesKey: { bezeichnung: 'Kreatinin', einheit: 'µmol/l' }, patientRows: rows,
      points: rows.map((r) => ({ date: r.labDatum!, value: r.wertNum! })), mode: 'global', events: [], fitInputs: [], cache: new Map(),
    })
    const marker = series.overlays?.find((overlay) => overlay.kind === 'marker')
    expect(marker).toMatchObject({ kind: 'marker', label: 'AKI I' })
    expect(marker?.title).toContain('creatinine peak 1.5 mg/dl')
  })
  it('names the value and the seven-day reference that give the stage in the marker title', () => {
    const titles = (values: [string, number][]) => {
      const rows = values.map(([date, value]) => row(`${date}T00:00:00Z`, value))
      return akiModule.series({
        patientId: 1, seriesKey: { bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, patientRows: rows,
        points: rows.map((r) => ({ date: r.labDatum!, value: r.wertNum! })), mode: 'global', events: [], fitInputs: [], cache: new Map(),
      }).overlays?.filter((overlay) => overlay.kind === 'marker').map((overlay) => overlay.title)
    }
    // Detected against 1.2 (48 hours), staged against 1.0: 3.2-fold is stage III. No "baseline 1.2" beside it.
    expect(titles([['2024-01-01', 1.0], ['2024-01-04', 1.2], ['2024-01-05', 3.2]])).toEqual([
      'AKI stage III, onset 05/01/2024, creatinine peak 3.2 mg/dl on 05/01/2024; staged against 1 mg/dl, the lowest value of the 7 days before',
    ])
    // The stage comes from 3.1 on day 7, not from the peak 3.3 on day 8.
    expect(titles([['2024-01-01', 1.0], ['2024-01-07', 1.4], ['2024-01-08', 3.1], ['2024-01-09', 3.3]])).toEqual([
      'AKI stage III, onset 08/01/2024, creatinine peak 3.3 mg/dl on 09/01/2024; staged from 3.1 mg/dl on 08/01/2024 against 1 mg/dl, the lowest value of the 7 days before',
    ])
  })
  it('detects episodes with the recovery length of the dataset settings, for markers, chips and fit inputs', () => {
    // 1.6 on day 4 crosses against the 1.0 of day 2, two calendar days later: one episode with 48 hours of
    // recovery, two with 24 hours (decided 2026-11-22: the recovery length is a setting).
    const rows = [row('2024-01-01T00:00:00Z', 1.0), row('2024-01-02T00:00:00Z', 1.6), row('2024-01-03T00:00:00Z', 1.0), row('2024-01-05T00:00:00Z', 1.6)]
    const chip = (recoveryHours?: number) => akiModule.series({
      patientId: 1, seriesKey: { bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, patientRows: rows,
      points: rows.map((r) => ({ date: r.labDatum!, value: r.wertNum! })), mode: 'global', events: [], fitInputs: [], cache: new Map(),
      ...(recoveryHours === undefined ? {} : { analysisSettings: { aki: { showOverlays: false, exclusionDays: 30, recoveryHours } } }),
    }).flags?.[0]?.label
    expect(chip()).toBe('AKI I')
    expect(chip(48)).toBe('AKI I')
    expect(chip(24)).toBe('AKI 2×I')
    // The cohort spec carries the dataset settings to every cell.
    const cellChip = (recoveryHours: number) => buildCohortRows(rows, [1], [cohortSeriesSpec({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, undefined,
      { analysisSettings: { aki: { showOverlays: false, exclusionDays: 30, recoveryHours } } })])[0].cells[0].flags.find((flag) => flag.moduleId === 'aki')?.label
    expect([cellChip(48), cellChip(24)]).toEqual(['AKI I', 'AKI 2×I'])
    const windows = (recoveryHours: number) => akiModule.apply({ rows, manualDemographics: {}, patientAttributes: {}, events: [] }, { showOverlays: false, exclusionDays: 30, recoveryHours }).fitInputs?.[0].windows.length
    expect([windows(48), windows(24)]).toEqual([1, 2])
  })
  const spiky = [
    row('2020-01-01T00:00:00Z', 1.0),
    row('2020-01-02T00:00:00Z', 1.6),
    row('2020-02-01T00:00:00Z', 1.0),
  ]

  it('always contributes aki-aware fit inputs for eligible series', () => {
    const out = akiModule.apply({ rows: spiky, manualDemographics: {}, patientAttributes: {}, events: [] }, { showOverlays: false, exclusionDays: 30, recoveryHours: 48 })
    expect(out.fitInputs).toHaveLength(1)
    expect(out.fitInputs?.[0]).toMatchObject({
      patientId: 1,
      seriesKey: { bezeichnung: 'Kreatinin', einheit: 'mg/dl' },
      kind: 'exclusion-windows',
      reason: 'aki',
      lengthDays: 30,
    })
    expect(out.fitInputs?.[0].windows).toHaveLength(1)
    expect(out).not.toHaveProperty('overlays')
  })

  it('contributes episode markers and window bands per series, whatever showOverlays says', () => {
    const out = akiModule.apply({ rows: spiky, manualDemographics: {}, patientAttributes: {}, events: [] }, { showOverlays: true, exclusionDays: 30, recoveryHours: 48 })
    expect(out.fitInputs?.[0].windows).toHaveLength(1)
    const seriesKey = { bezeichnung: 'Kreatinin', einheit: 'mg/dl' }
    const points = spiky.map((r) => ({ date: r.labDatum!, value: r.wertNum! }))
    const series = akiModule.series({ patientId: 1, seriesKey, patientRows: spiky, points, mode: 'global', events: [], fitInputs: out.fitInputs ?? [], cache: new Map() })
    expect(series.overlays?.some((o) => o.kind === 'marker')).toBe(true)
    expect(series.overlays?.some((o) => o.kind === 'band')).toBe(true)
  })

  it('creates cross-series fit inputs for computed eGFR using creatinine-derived episodes', () => {
    const egfrRows = spiky.map((r) => ({
      ...r,
      bezeichnung: 'eGFR (CKD-EPI 2021, computed)',
      einheit: 'ml/min/1,73m²',
      wertNum: 80 - (r.wertNum ?? 0),
    }))
    const out = akiModule.apply({ rows: [...spiky, ...egfrRows], manualDemographics: {}, patientAttributes: {}, events: [] }, { showOverlays: false, exclusionDays: 30, recoveryHours: 48 })
    const egfrInput = out.fitInputs?.find((i) => i.seriesKey.bezeichnung.includes('eGFR'))
    expect(egfrInput?.windows).toHaveLength(1)
  })

  it('reuses creatinine-derived episodes across non-creatinine series for a patient', () => {
    const egfrRows = spiky.map((r) => ({
      ...r,
      bezeichnung: 'eGFR (CKD-EPI 2021, computed)',
      einheit: 'ml/min/1,73m²',
      wertNum: 80 - (r.wertNum ?? 0),
    }))
    const cystatinRows = spiky.map((r) => ({
      ...r,
      bezeichnung: 'Cystatin C',
      einheit: 'mg/l',
      wertNum: 1.5 + (r.wertNum ?? 0),
    }))

    const out = akiModule.apply({ rows: [...spiky, ...egfrRows, ...cystatinRows], manualDemographics: {}, patientAttributes: {}, events: [] }, { showOverlays: false, exclusionDays: 30, recoveryHours: 48 })
    const egfrInput = out.fitInputs?.find((i) => i.seriesKey.bezeichnung.includes('eGFR'))
    const cystatinInput = out.fitInputs?.find((i) => i.seriesKey.bezeichnung === 'Cystatin C')

    expect(egfrInput?.windows).toEqual(cystatinInput?.windows)
    expect(egfrInput?.windows[0].start).toBe(cystatinInput?.windows[0].start)
  })
})
