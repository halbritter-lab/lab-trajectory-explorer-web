import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../../src/core/types'
import { computeAnalysisResult } from '../../../src/core/analysis/registry'
import type { AnalysisModule, AnalysisSettings } from '../../../src/core/analysis/types'

function row(p: Partial<LabRow> = {}): LabRow {
  return {
    patientId: 1,
    labDatum: new Date('2020-01-01'),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1',
    wertNum: 1,
    wertOperator: '=',
    loinc: null,
    patientSex: 'm',
    patientAgeAtLab: 50,
    ...p,
  }
}

describe('computeAnalysisResult', () => {
  it('returns the original row reference when no module contributes rows', () => {
    const rows = [row()]
    const result = computeAnalysisResult({
      rows,
      manualDemographics: {},
      events: [],
      settings: {
        egfr: { formula: 'off', source: null },
        aki: { showOverlays: false, exclusionDays: 30 },
        rapidEgfrDecline: { threshold: 5 },
      },
      modules: [],
    })

    expect(result.rows).toBe(rows)
    expect(result.overlays).toEqual([])
    expect(result.fitInputs).toEqual([])
    expect(result.cohortFlags).toEqual([])
    expect(result.messages).toEqual([])
  })

  it('preserves empty result arrays when a module contributes empty arrays', () => {
    const rows = [row()]
    const modules: AnalysisModule<AnalysisSettings>[] = [
      {
        id: 'empty-contributions',
        label: 'Empty contributions',
        defaultSettings: {
          egfr: { formula: 'off', source: null },
          aki: { showOverlays: false, exclusionDays: 30 },
          rapidEgfrDecline: { threshold: 5 },
        },
        apply: () => ({
          messages: [],
          cohortFlags: [],
          overlays: [],
          fitInputs: [],
        }),
      },
    ]

    const result = computeAnalysisResult({
      rows,
      manualDemographics: {},
      events: [],
      settings: {
        egfr: { formula: 'off', source: null },
        aki: { showOverlays: false, exclusionDays: 30 },
        rapidEgfrDecline: { threshold: 5 },
      },
      modules,
    })

    expect(result.rows).toBe(rows)
    expect(result.overlays).toEqual([])
    expect(result.fitInputs).toEqual([])
    expect(result.cohortFlags).toEqual([])
    expect(result.messages).toEqual([])
  })

  it('feeds rows contributed by an earlier module into later modules', () => {
    const rows = [row()]
    const computed = row({ bezeichnung: 'computed', wertNum: 2 })
    const seenRows: number[] = []
    const modules: AnalysisModule<AnalysisSettings>[] = [
      {
        id: 'append-row',
        label: 'Append row',
        defaultSettings: {
          egfr: { formula: 'off', source: null },
          aki: { showOverlays: false, exclusionDays: 30 },
          rapidEgfrDecline: { threshold: 5 },
        },
        apply: (ctx) => ({ rows: [...ctx.rows, computed] }),
      },
      {
        id: 'observe-rows',
        label: 'Observe rows',
        defaultSettings: {
          egfr: { formula: 'off', source: null },
          aki: { showOverlays: false, exclusionDays: 30 },
          rapidEgfrDecline: { threshold: 5 },
        },
        apply: (ctx) => {
          seenRows.push(ctx.rows.length)
          return {}
        },
      },
    ]

    const result = computeAnalysisResult({
      rows,
      manualDemographics: {},
      events: [],
      settings: {
        egfr: { formula: 'off', source: null },
        aki: { showOverlays: false, exclusionDays: 30 },
        rapidEgfrDecline: { threshold: 5 },
      },
      modules,
    })

    expect(result.rows).toEqual([rows[0], computed])
    expect(seenRows).toEqual([2])
  })
})
