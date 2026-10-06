import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../src/workspace/state/store'
import { importWorkspaceFile } from '../../../src/workspace/workspace-data'
import type { LabRow } from '../../../src/core/types'
import { DEFAULT_MIXED_MODEL_CONFIG } from '../../../src/core/mixedModel/config'
import type { MixedModelResult } from '../../../src/core/mixedModel/types'
import type { MixedModelResultIdentity } from '../../../src/core/mixedModel/resultIdentity'
import * as XLSX from 'xlsx'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

const mixedModelIdentity: MixedModelResultIdentity = {
  seriesIndex: 0,
  seriesKey: 'eGFR|ml/min/1.73m2',
  patientIdsHash: 'patients',
  datasetHash: 'dataset',
  fitConfigHash: 'fit',
  nPatients: 3,
  nMeasurements: 6,
}

const mixedModelResult: MixedModelResult = {
  status: 'success',
  metadata: {
    engine: 'webr-lme4',
    formula: 'value ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
    runtimeVersion: '4.6.0',
    packageVersions: {},
    browserUserAgent: 'test',
    wasmAssetSource: 'cdn',
    optimizer: 'nloptwrap',
    reml: true,
    tolerance: 0.000001,
    datasetId: 'cohort',
    datasetHash: 'dataset',
    randomSeed: null,
    fitConfigHash: 'fit',
  },
  converged: true,
  singular: false,
  warnings: [],
  nPatients: 3,
  nMeasurements: 6,
  fixedEffects: { intercept: 60, timeSinceBaseline: -3 },
  fixedEffectConfidenceIntervals: { timeSinceBaseline: [-3.5, -2.5] },
  randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
  residualSd: null,
}

function seedResults() {
  useAppStore.setState({
    cohortModelResults: {
      cohort: { result: mixedModelResult, identity: mixedModelIdentity },
      'group:A': { result: mixedModelResult, identity: mixedModelIdentity },
    },
  })
  useAppStore.getState().setShowCohortMixedModelLine(true)
}

function expectResultsCleared() {
  expect(useAppStore.getState().cohortModelResults).toBeNull()
  expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
}

describe('useAppStore', () => {
  beforeEach(() => useAppStore.getState().reset())

  it('starts empty, without the removed legacy interface state', () => {
    const state = useAppStore.getState()
    expect(state.rows).toEqual([])
    expect(state.patientAttributes).toEqual({})
    expect(state.cohortModelResults).toBeNull()
    expect(state.cohortModelRunning).toBe(false)
    for (const key of ['selectedPatientId', 'view', 'seriesConfigs', 'cohortZoom', 'showAki', 'rapidEgfrThreshold', 'egfrFormula', 'persist']) {
      expect(key in state).toBe(false)
    }
  })

  it('reports rejected workbook events even when no auxiliary row is accepted', async () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { patientId: 1, labDate: '2024-01-15', testName: 'Creatinine', unit: 'mg/dl', value: 1.2 },
    ]), 'labs')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { patientId: 1, type: 'dialysis', date: 'invalid', title: 'Start', intent: 'chronic' },
    ]), 'events')
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    await importWorkspaceFile({ name: 'partial.xlsx', arrayBuffer: async () => buffer } as File)
    const state = useAppStore.getState()
    expect(state.rows).toHaveLength(1)
    expect(state.events).toEqual([])
    expect(state.rejectedEvents.map((item) => item.event.title)).toEqual(['Start'])
    expect(state.notice?.text).toContain('1 rows rejected')
    expect(state.notice?.details).toEqual([
      { sheet: 'events', patientId: 1, severity: 'rejected', reason: 'Event date "invalid" is not a recognised date (use YYYY-MM-DD, DD.MM.YYYY or DD/MM/YYYY); row not imported.' },
    ])
  })

  it('sets an error notice and keeps the session on an unreadable file', async () => {
    useAppStore.getState().replaceDataset({ rows: [row({})], fileName: 'kept.csv' })
    await importWorkspaceFile({ name: 'bad.xlsx', arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer } as File)
    const { notice, busy, rows, fileName } = useAppStore.getState()
    expect(busy).toBe(false)
    expect(rows).toHaveLength(1)
    expect(fileName).toBe('kept.csv')
    expect(notice?.kind).toBe('error')
  })

  it('replaceDataset replaces the whole session and clears model state', () => {
    useAppStore.getState().setPatientAttributes({ '10': { genotype: 'UMOD' } })
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')
    seedResults()
    useAppStore.getState().replaceDataset({ rows: [row({ patientId: 1 })], fileName: 'new.xlsx' })
    const state = useAppStore.getState()
    expect(state.rows).toHaveLength(1)
    expect(state.fileName).toBe('new.xlsx')
    expect(state.patientAttributes).toEqual({})
    expect(state.analysisSettings.egfr.formula).toBe('off')
    expectResultsCleared()
  })

  it('stores eGFR settings under analysisSettings and the analysis result uses them', () => {
    useAppStore.getState().replaceDataset({ rows: [row({ patientSex: 'm', patientAgeAtLab: 50, wertNum: 1.0 })] })
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')
    useAppStore.getState().setEgfrSource(['Kreatinin', 'mg/dl'])
    const state = useAppStore.getState()
    expect(state.analysisSettings.egfr).toEqual({ formula: 'ckd-epi-2021', source: ['Kreatinin', 'mg/dl'] })
    expect(state.analysisResult().rows.some((r) => r.bezeichnung?.includes('eGFR (CKD-EPI 2021, computed)'))).toBe(true)
  })

  it('stores structured clinical events', () => {
    useAppStore.getState().setEvents([{
      patientId: 1, type: 'kidney_transplant', date: new Date('2025-02-01'), title: 'Kidney transplant',
      description: '', endDate: null, intent: null, warning: '',
    }])
    expect(useAppStore.getState().events[0]).toMatchObject({ type: 'kidney_transplant', intent: null, title: 'Kidney transplant' })
  })

  it('stores a patient attribute map', () => {
    useAppStore.getState().setPatientAttributes({ '10': { genotype: 'UMOD' } })
    expect(useAppStore.getState().patientAttributes).toEqual({ '10': { genotype: 'UMOD' } })
  })
})

describe('useAppStore - model invalidation', () => {
  beforeEach(() => useAppStore.getState().reset())


  it('clears results when patient attributes are (re)imported', () => {
    seedResults()
    useAppStore.getState().setPatientAttributes({ '1': { genotype: 'A' } })
    expectResultsCleared()
  })

  it('clears results when the mixed model config changes', () => {
    seedResults()
    useAppStore.getState().setMixedModelConfig({ timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept' })
    expect(useAppStore.getState().mixedModelConfig).toEqual({ timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept' })
    expectResultsCleared()
  })

  it('clears results when eGFR derivation, demographics or events change', () => {
    for (const change of [
      () => useAppStore.getState().setEgfrFormula('mdrd-4'),
      () => useAppStore.getState().setEgfrSource(['Kreatinin', 'mg/dl']),
      () => useAppStore.getState().setManualDemographics(1, { age: 40 }),
      () => useAppStore.getState().setEvents([]),
    ]) {
      seedResults()
      change()
      expectResultsCleared()
    }
  })

  it('restores defaults on reset', () => {
    seedResults()
    useAppStore.getState().reset()
    expectResultsCleared()
  })
})

describe('useAppStore - cohort model runs and projections', () => {
  beforeEach(() => useAppStore.getState().reset())

  const entityRows = [
    { patient_id: 'p1', value: 60, time_since_baseline: 0 },
    { patient_id: 'p1', value: 58, time_since_baseline: 1 },
  ]
  const params = {
    seriesIndex: 0,
    seriesKey: mixedModelIdentity.seriesKey,
    fitConfigHash: 'fit',
    config: DEFAULT_MIXED_MODEL_CONFIG,
    formula: mixedModelResult.metadata.formula,
  }

  it('runCohortModels writes results keyed by entity, merges, and toggles running off', async () => {
    const runJob = vi.fn(async () => mixedModelResult)
    await useAppStore.getState().runCohortModels({ ...params, runJob, entities: [{ entity: { kind: 'cohort' }, rows: entityRows }] })
    expect(Object.keys(useAppStore.getState().cohortModelResults ?? {})).toEqual(['cohort'])
    expect(useAppStore.getState().cohortModelRunning).toBe(false)
    // Fitting only a group preserves the prior cohort result (merge).
    await useAppStore.getState().runCohortModels({ ...params, runJob, entities: [{ entity: { kind: 'group', value: 'A' }, rows: entityRows }] })
    expect(Object.keys(useAppStore.getState().cohortModelResults ?? {}).sort()).toEqual(['cohort', 'group:A'])
  })

  it('discards a run superseded by a dataset replacement', async () => {
    let release!: (result: MixedModelResult) => void
    const pending = useAppStore.getState().runCohortModels({ ...params, entities: [{ entity: { kind: 'cohort' }, rows: entityRows }],
      runJob: () => new Promise((resolve) => { release = resolve }) })
    expect(useAppStore.getState().cohortModelRunning).toBe(true)
    useAppStore.getState().replaceDataset({ rows: [row({})] })
    release(mixedModelResult)
    await pending
    expect(useAppStore.getState().cohortModelResults).toBeNull()
    expect(useAppStore.getState().cohortModelRunning).toBe(false)
  })

  it('stores independent copied projection settings and clears them with their fit', () => {
    seedResults()
    const applied = { sourceIdentity: mixedModelIdentity, settings: { targets: [], profile: {}, referenceTimeYears: 0, horizonYears: 20 } }
    useAppStore.getState().setProjectionSettings(0, mixedModelIdentity.seriesKey, 'cohort', applied)
    const key = JSON.stringify([0, mixedModelIdentity.seriesKey, 'cohort'])
    expect(useAppStore.getState().projectionSettings[key]).toEqual(applied)
    applied.settings.horizonYears = 3
    expect(useAppStore.getState().projectionSettings[key].settings.horizonYears).toBe(20)
    useAppStore.getState().setEvents([])
    expect(useAppStore.getState().projectionSettings).toEqual({})
  })

  it('rejects stale and cross-series projection settings', () => {
    seedResults()
    const settings = { targets: [], profile: {}, referenceTimeYears: 0, horizonYears: 20 }
    useAppStore.getState().setProjectionSettings(0, mixedModelIdentity.seriesKey, 'cohort', { sourceIdentity: { ...mixedModelIdentity, datasetHash: 'stale' }, settings })
    useAppStore.getState().setProjectionSettings(1, mixedModelIdentity.seriesKey, 'cohort', { sourceIdentity: mixedModelIdentity, settings })
    expect(useAppStore.getState().projectionSettings).toEqual({})
  })

  it('rejects projection settings for a singular fit', () => {
    seedResults()
    useAppStore.setState({cohortModelResults:{cohort:{result:{...mixedModelResult,singular:true},identity:mixedModelIdentity}}})
    useAppStore.getState().setProjectionSettings(0,mixedModelIdentity.seriesKey,'cohort',{
      sourceIdentity:mixedModelIdentity,settings:{targets:[],profile:{},referenceTimeYears:0,horizonYears:20},
    })
    expect(useAppStore.getState().projectionSettings).toEqual({})
  })

  it('preserves applied settings across same-identity refits, but resets changed identities', async () => {
    const runParams = { ...params, entities: [{ entity: { kind: 'cohort' as const }, rows: entityRows }], runJob: vi.fn(async () => mixedModelResult) }
    await useAppStore.getState().runCohortModels(runParams)
    const identity = useAppStore.getState().cohortModelResults!.cohort.identity
    const applied = { sourceIdentity: identity, settings: { targets: [], profile: {}, referenceTimeYears: 2, horizonYears: 7 } }
    useAppStore.getState().setProjectionSettings(0, identity.seriesKey, 'cohort', applied)
    const key = JSON.stringify([0, identity.seriesKey, 'cohort'])
    expect(useAppStore.getState().projectionSettings[key]).toEqual(applied)
    const replacement = { ...mixedModelResult, fixedEffects: { intercept: 80, timeSinceBaseline: 5 } }
    await useAppStore.getState().runCohortModels({ ...runParams, runJob: async () => replacement })
    expect(useAppStore.getState().projectionSettings[key]).toEqual(applied)
    expect(useAppStore.getState().cohortModelResults!.cohort.result).toBe(replacement)
    await useAppStore.getState().runCohortModels({ ...runParams, fitConfigHash: 'different' })
    expect(useAppStore.getState().projectionSettings).toEqual({})
  })
})
