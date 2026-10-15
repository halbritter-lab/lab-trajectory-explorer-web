import { describe, expect, it } from 'vitest'
import { presetsForScope, previewTrendConfig } from '../../prototypes/trajectory-toolbar/preview-analysis'
import { defaultFitSettings } from '../../src/workspace/workspace-analysis'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { cohortSeriesSpec } from '../../src/core/cohort/specs'
import type { LabRow } from '../../src/core/types'

const parameter = { key: 'marker', label: 'Study marker', bezeichnung: 'Study marker', einheit: 'U/L', derived: false }

describe('preview analysis scope and activation', () => {
  it('limits shared defaults to general presets and allows deliberate per-parameter assignment', () => {
    expect(presetsForScope('').every(preset => preset.category === 'Standard')).toBe(true)
    expect(presetsForScope(parameter.key).some(preset => preset.id === 'ckd_progression')).toBe(true)
  })

  it('calculates a slope only when analysis is enabled, without mutating the configured method', () => {
    const settings = defaultFitSettings()
    const rows: LabRow[] = [10, 8, 6].map((value, index) => ({
      patientId: 'P-1', labDatum: new Date(`${2020 + index}-01-01`),
      bezeichnung: parameter.bezeichnung, einheit: parameter.einheit,
      wert: String(value), wertNum: value, wertOperator: '=', loinc: null,
      patientSex: null, patientAgeAtLab: null,
    }))
    const result = (enabled: boolean) => buildCohortRows(rows, ['P-1'], [cohortSeriesSpec(parameter, previewTrendConfig(settings, parameter, enabled))])[0].cells[0]
    expect(result(false).slope).toBeNaN()
    expect(result(false).fitLines).toHaveLength(0)
    expect(result(true).slope).toBeLessThan(0)
    expect(result(true).fitLines.length).toBeGreaterThan(0)
    expect(settings.fitModel).toBe('ols')
    expect(result(false).points).toHaveLength(3)
  })
})
