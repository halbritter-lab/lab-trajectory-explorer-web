import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MIXED_MODEL_CONFIG,
  MIXED_MODEL_OUTCOME,
  mixedModelFormula,
  mixedModelFormulaForOutcome,
  mixedModelOutcomeLabel,
} from '../../../src/core/mixedModel/config'
import { mixedModelExportSheets } from '../../../src/core/mixedModel/modelExport'
import { mixedModelRowsFromCohortInputs } from '../../../src/core/mixedModel/cohortDataset'
import type { MixedModelSuccess } from '../../../src/core/mixedModel/types'
import type { LabRow } from '../../../src/core/types'

describe('neutral mixed-model outcome', () => {
  it('fits a neutral outcome column whatever the series', () => {
    expect(MIXED_MODEL_OUTCOME).toBe('value')
    expect(mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)).toBe('value ~ time_since_baseline + (1 + time_since_baseline | patient_id)')
    const row = (labDatum: string, wertNum: number): LabRow => ({ patientId: 1, labDatum: new Date(labDatum), bezeichnung: 'Creatinine', einheit: 'mg/dl', wert: String(wertNum), wertNum, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null })
    const rows = mixedModelRowsFromCohortInputs([row('2020-01-01', 1.1), row('2021-01-01', 1.3)], [1], { bezeichnung: 'Creatinine', einheit: 'mg/dl', mode: 'global' })
    expect(rows.map((r) => r.value)).toEqual([1.1, 1.3])
  })

  it('names the series in displayed and exported formulas', () => {
    const outcome = mixedModelOutcomeLabel('Creatinine', 'mg/dl')
    expect(outcome).toBe('Creatinine (mg/dl)')
    expect(mixedModelOutcomeLabel('Score', '')).toBe('Score')
    expect(mixedModelFormulaForOutcome(mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG), outcome))
      .toBe('Creatinine (mg/dl) ~ time_since_baseline + (1 + time_since_baseline | patient_id)')
    // A formula that does not start with the outcome column is left alone.
    expect(mixedModelFormulaForOutcome('other ~ x', outcome)).toBe('other ~ x')

    const result = { status: 'success', converged: true, warnings: [], metadata: { formula: mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG) },
      fixedEffects: { intercept: 1, timeSinceBaseline: 0.1 }, fixedEffectConfidenceIntervals: { timeSinceBaseline: null } } as unknown as MixedModelSuccess
    const settings = mixedModelExportSheets([{ entity: 'Whole cohort', result, identity: { seriesKey: 'Creatinine|mg/dl' } }]).find((sheet) => sheet.name === 'models')?.rows
    expect(settings).toEqual([expect.objectContaining({ formula: 'Creatinine (mg/dl) ~ time_since_baseline + (1 + time_since_baseline | patient_id)' })])
  })
})
