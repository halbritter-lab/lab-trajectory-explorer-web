import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../../src/core/types'
import { akiModule } from '../../../src/core/domains/nephrology/aki/akiModule'

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
  const spiky = [
    row('2020-01-01T00:00:00Z', 1.0),
    row('2020-01-02T00:00:00Z', 1.6),
    row('2020-02-01T00:00:00Z', 1.0),
  ]

  it('always contributes aki-aware fit inputs for eligible series', () => {
    const out = akiModule.apply({ rows: spiky, manualDemographics: {}, patientAttributes: {}, events: [] }, { showOverlays: false, exclusionDays: 30 })
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
    const out = akiModule.apply({ rows: spiky, manualDemographics: {}, patientAttributes: {}, events: [] }, { showOverlays: true, exclusionDays: 30 })
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
    const out = akiModule.apply({ rows: [...spiky, ...egfrRows], manualDemographics: {}, patientAttributes: {}, events: [] }, { showOverlays: false, exclusionDays: 30 })
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

    const out = akiModule.apply({ rows: [...spiky, ...egfrRows, ...cystatinRows], manualDemographics: {}, patientAttributes: {}, events: [] }, { showOverlays: false, exclusionDays: 30 })
    const egfrInput = out.fitInputs?.find((i) => i.seriesKey.bezeichnung.includes('eGFR'))
    const cystatinInput = out.fitInputs?.find((i) => i.seriesKey.bezeichnung === 'Cystatin C')

    expect(egfrInput?.windows).toEqual(cystatinInput?.windows)
    expect(egfrInput?.windows[0].start).toBe(cystatinInput?.windows[0].start)
  })
})
