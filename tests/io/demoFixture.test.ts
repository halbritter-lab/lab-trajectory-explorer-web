import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readWorkbook } from '../../src/io/readWorkbook'
import { loadLabRows } from '../../src/core/parse/loader'
import { resolveDemographics } from '../../src/core/demographics/resolve'
import { loadDatasetFromWorkbook } from '../../src/io/loadDataset'
import { MIN_QUALIFYING_PATIENTS } from '../../src/core/mixedModel/validation'
import { defaultModelParameterKey, modelablePatientCount } from '../../src/workspace/cohort-model-parameter'
import { validateMixedModelRows } from '../../src/core/mixedModel/validation'
import { DEFAULT_MIXED_MODEL_CONFIG } from '../../src/core/mixedModel/config'
import { workspaceModelSpec, type WorkspaceData } from '../../src/workspace/workspace-data'
import { groupInteractionFactor, workspaceGroupableAttributes, workspaceModelEntities } from '../../src/workspace/workspace-model-results'
import { groupPatients } from '../../src/core/grouping/grouping'
import { availableMixedModelFactors } from '../../src/core/mixedModel/factors'
import { defaultFitSettings } from '../../src/workspace/workspace-analysis'
import { computeAnalysisResult, defaultAnalysisSettings } from '../../src/core/analysis/registry'

describe('shipped demo workbook', () => {
  it('carries demographics that resolve without conflict', () => {
    const file = resolve(__dirname, '../../public/test_labs.xlsx')
    const buf = readFileSync(file)
    const rows = loadLabRows(
      readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    )
    const { rows: resolved, conflicts } = resolveDemographics(rows, {}, {})
    expect(conflicts).toEqual([])
    // The guarantee, exercised on the file we actually ship.
    expect(resolved).toBe(rows)
  })

  it('loads as a complete 3-sheet workbook with labs, events, and attributes', () => {
    const file = resolve(__dirname, '../../public/test_labs.xlsx')
    const buf = readFileSync(file)
    const dataset = loadDatasetFromWorkbook(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    )
    expect(dataset.sheetNames).toEqual(['labs', 'events', 'attributes'])
    expect(dataset.rows.length).toBeGreaterThan(100)
    expect(dataset.events.length).toBe(8)
    expect(Object.keys(dataset.patientAttributes).length).toBe(26)
  })

  it('preselects an imported eGFR that the cohort model can fit with the default settings', () => {
    const file = resolve(__dirname, '../../public/test_labs.xlsx')
    const buf = readFileSync(file)
    const { rows } = loadDatasetFromWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const parameters = [...new Map(rows.filter(r => r.bezeichnung !== null).map(r => {
      const key = JSON.stringify([r.bezeichnung, r.einheit])
      return [key, { key, bezeichnung: r.bezeichnung!, einheit: r.einheit }]
    })).values()]
    const patients = new Set(rows.map(r => String(r.patientId)))
    const chosen = parameters.find(p => p.key === defaultModelParameterKey(parameters, rows, patients))!
    expect(chosen.bezeichnung).toBe('eGFR')
    expect(modelablePatientCount(rows, chosen, patients)).toBeGreaterThanOrEqual(MIN_QUALIFYING_PATIENTS)

    // The real preparation and validation accept it, with the default and with
    // the CKD progression settings (quarterly medians).
    const { events, patientAttributes } = loadDatasetFromWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const patientIds = [...new Set(rows.map(r => r.patientId))]
    const analysis = computeAnalysisResult({ rows, events, patientAttributes, manualDemographics: {}, settings: defaultAnalysisSettings() })
    const data = { rawRows: rows, rows: analysis.rows, analysis, fileName: 'test_labs.xlsx', events, patientAttributes, manualDemographics: {},
      parameters: parameters.map(p => ({ ...p, label: p.bezeichnung, derived: false })),
      patients: patientIds.map(id => ({ id, label: String(id), attributes: {}, baselineAge: null })) } as unknown as WorkspaceData
    for (const preset of ['general_exploration', 'ckd_progression']) {
      const spec = workspaceModelSpec(data, chosen.key, { shared: defaultFitSettings(preset), columns: {} })!
      const [cohort] = workspaceModelEntities(analysis.rows, patientIds, spec, DEFAULT_MIXED_MODEL_CONFIG, patientAttributes, [])
      expect(validateMixedModelRows(cohort.rows, DEFAULT_MIXED_MODEL_CONFIG), preset).toMatchObject({ ok: true })
    }

    // Subgroup comparison by cohort (the preset's default grouping) and by sex: both
    // groups fit, also under CKD progression, whose quarterly medians drop a patient.
    const groupable = workspaceGroupableAttributes(analysis.rows, patientAttributes)
    for (const preset of ['general_exploration', 'ckd_progression']) {
      const presetSpec = workspaceModelSpec(data, chosen.key, { shared: defaultFitSettings(preset), columns: {} })!
      for (const [attribute, expected] of [['cohort', ['A', 'B']], ['sex', ['m', 'w']]] as const) {
        const units = workspaceModelEntities(analysis.rows, patientIds, presetSpec, DEFAULT_MIXED_MODEL_CONFIG, patientAttributes, groupPatients(patientIds, groupable, attribute))
        const fittable = units.filter(unit => validateMixedModelRows(unit.rows, DEFAULT_MIXED_MODEL_CONFIG).ok)
          .map(unit => unit.entity.kind === 'cohort' ? 'cohort' : unit.entity.value)
        expect(fittable, `${preset} by ${attribute}`).toEqual(expect.arrayContaining(['cohort', ...expected]))
      }
    }
    const spec = workspaceModelSpec(data, chosen.key, { shared: defaultFitSettings(), columns: {} })!

    // Group interaction with cohort as a level and slope factor.
    const factor = groupInteractionFactor('cohort', availableMixedModelFactors(analysis.rows, patientAttributes).find(f => f.key === 'cohort'))
    const interaction = { ...DEFAULT_MIXED_MODEL_CONFIG, factors: [factor] }
    const [pooled] = workspaceModelEntities(analysis.rows, patientIds, spec, interaction, patientAttributes, [])
    expect(validateMixedModelRows(pooled.rows, interaction)).toMatchObject({ ok: true })
  })
})
