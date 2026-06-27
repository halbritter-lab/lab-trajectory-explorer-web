import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../src/ui/state/store'
import type { LabRow } from '../../../src/core/types'
import { DEFAULT_MIXED_MODEL_CONFIG } from '../../../src/core/mixedModel/config'
import type { MixedModelResult } from '../../../src/core/mixedModel/types'
import type { MixedModelResultIdentity } from '../../../src/core/mixedModel/resultIdentity'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('useAppStore', () => {
  beforeEach(() => useAppStore.getState().reset())

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
      formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
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
    warnings: [],
    nPatients: 3,
    nMeasurements: 6,
    fixedEffects: { intercept: 60, timeSinceBaseline: -3 },
    fixedEffectConfidenceIntervals: { timeSinceBaseline: [-3.5, -2.5] },
    randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
    residualSd: null,
  }

  function storeMixedModelResult() {
    useAppStore.setState({ cohortModelResults: { cohort: { result: mixedModelResult, identity: mixedModelIdentity } } })
    useAppStore.getState().setShowCohortMixedModelLine(true)
  }

  it('starts empty', () => {
    const state = useAppStore.getState()
    expect(state.rows).toEqual([])
    expect(state.selectedPatientId).toBeNull()
    expect(state.cohortSort).toEqual({ key: 'id', dir: 'asc' })
    const legacyKeys = [
      ['annot', 'ations'],
      ['show', 'Annot', 'ations'],
      ['set', 'Annot', 'ations'],
      ['set', 'Show', 'Annot', 'ations'],
    ].map((parts) => parts.join(''))
    legacyKeys.forEach((key) => expect(key in state).toBe(false))
  })

  it('setDataset stores rows and auto-selects the first patient', () => {
    useAppStore.getState().setDataset([row({ patientId: 7 }), row({ patientId: 9 })])
    expect(useAppStore.getState().rows).toHaveLength(2)
    expect(useAppStore.getState().selectedPatientId).toBe(7)
  })

  it('setDataset opens the cohort view by default after loading data', () => {
    useAppStore.getState().setView('one')
    useAppStore.getState().setDataset([row({ patientId: 7 }), row({ patientId: 9 })])
    expect(useAppStore.getState().view).toBe('cohort')
  })

  it('patientIds returns sorted unique ids', () => {
    useAppStore.getState().setDataset([row({ patientId: 9 }), row({ patientId: 7 }), row({ patientId: 9 })])
    expect(useAppStore.getState().patientIds()).toEqual([7, 9])
  })

  it('selectPatient and setView mutate state', () => {
    useAppStore.getState().setDataset([row({ patientId: 7 })])
    useAppStore.getState().selectPatient(7)
    useAppStore.getState().setView('cohort')
    expect(useAppStore.getState().selectedPatientId).toBe(7)
    expect(useAppStore.getState().view).toBe('cohort')
  })

  it('stores and clears the current cohort model result', () => {
    useAppStore.setState({ cohortModelResults: { cohort: { result: mixedModelResult, identity: mixedModelIdentity } } })

    expect(useAppStore.getState().cohortModelResults?.cohort.result).toBe(mixedModelResult)
    expect(useAppStore.getState().cohortModelResults?.cohort.identity).toEqual(mixedModelIdentity)

    useAppStore.getState().clearMixedModelResult()

    expect(useAppStore.getState().cohortModelResults).toBeNull()
  })

  it('toggles the cohort mixed model overlay line', () => {
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
    useAppStore.getState().setShowCohortMixedModelLine(true)
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(true)
  })

  it('opens and closes the cohort mixed model dialog', () => {
    expect(useAppStore.getState().mixedModelDialogOpen).toBe(false)
    useAppStore.getState().setMixedModelDialogOpen(true)
    expect(useAppStore.getState().mixedModelDialogOpen).toBe(true)
    useAppStore.getState().setMixedModelDialogOpen(false)
    expect(useAppStore.getState().mixedModelDialogOpen).toBe(false)
  })

  it('clears mixed model result state when selected patients change', () => {
    storeMixedModelResult()

    useAppStore.getState().setSelectedPatientIds([1])

    expect(useAppStore.getState().cohortModelResults).toBeNull()
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
  })

  it('clears mixed model result state when cohort patient mode changes', () => {
    storeMixedModelResult()

    useAppStore.getState().setCohortPatientMode('selected')

    expect(useAppStore.getState().cohortModelResults).toBeNull()
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
  })

  it('keeps mixed model result state when showAki changes', () => {
    storeMixedModelResult()

    useAppStore.getState().setShowAki(true)

    expect(useAppStore.getState().cohortModelResults?.cohort.result).toBe(mixedModelResult)
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(true)
  })

  it('keeps mixed model result state when only series fit endpoints change', () => {
    storeMixedModelResult()

    useAppStore.getState().setSeriesFitConfig(0, { endpoints: { percentDecline: true } })

    expect(useAppStore.getState().cohortModelResults?.cohort.result).toBe(mixedModelResult)
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(true)
  })

  it('clears mixed model result state when series fit model data policy changes', () => {
    storeMixedModelResult()

    useAppStore.getState().setSeriesFitConfig(0, { timeBalancing: 'monthly-median' })

    expect(useAppStore.getState().cohortModelResults).toBeNull()
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
  })

  it('stores mixed model config and invalidates current result', () => {
    storeMixedModelResult()

    useAppStore.getState().setMixedModelConfig({
      timeAxis: 'time_since_baseline',
      covariates: [],
      randomEffects: 'intercept',
    })

    expect(useAppStore.getState().mixedModelConfig).toEqual({
      timeAxis: 'time_since_baseline',
      covariates: [],
      randomEffects: 'intercept',
    })
    expect(useAppStore.getState().cohortModelResults).toBeNull()
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
  })
})

describe('loadFile feedback', () => {
  beforeEach(() => useAppStore.getState().reset())

  function fileFrom(bytes: Uint8Array, name: string): File {
    // jsdom File.arrayBuffer is unreliable; stub it to return the bytes.
    const f = new File([], name)
    Object.defineProperty(f, 'arrayBuffer', { value: async () => bytes.buffer })
    return f
  }

  it('sets an error notice (and does not crash) on an unreadable file', async () => {
    await useAppStore.getState().loadFile(fileFrom(new Uint8Array([1, 2, 3, 4]), 'bad.xlsx'))
    const { notice, busy, rows } = useAppStore.getState()
    expect(busy).toBe(false)
    expect(rows).toHaveLength(0)
    expect(notice?.kind).toBe('error')
  })
})

describe('loadSynthetic', () => {
  beforeEach(() => useAppStore.getState().reset())

  it('loads bundled demo events into events', async () => {
    const labBytes = readFileSync(resolve(__dirname, '../../../public/test_labs.xlsx'))
    const eventBytes = readFileSync(resolve(__dirname, '../../../public/test_events.csv'))
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      return new Response(url.endsWith('test_events.csv') ? eventBytes : labBytes)
    }
    try {
      await useAppStore.getState().loadSynthetic()

      const state = useAppStore.getState()
      expect(state.events.map((event) => event.title)).toEqual(expect.arrayContaining(['Dialysis start', 'Kidney transplant']))
      expect(state.events.map((event) => event.type)).toEqual(expect.arrayContaining(['dialysis', 'kidney_transplant']))
      expect(state.notice?.text).toContain('events')
      expect(state.notice?.text).toContain('demo dataset')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('stores structured clinical events', () => {
    useAppStore.getState().setEvents([
      {
        patientId: 1,
        type: 'kidney_transplant',
        date: new Date('2025-02-01'),
        title: 'Kidney transplant',
        description: '',
        endDate: null,
        intent: null,
        warning: '',
      },
    ])

    expect(useAppStore.getState().events[0].type).toBe('kidney_transplant')
    expect(useAppStore.getState().events[0].intent).toBeNull()
    expect(useAppStore.getState().events[0].title).toBe('Kidney transplant')
  })

  it('stores spec-level fit configuration on each series and resets presets', () => {
    expect(useAppStore.getState().seriesConfigs[0].fitConfig.preset).toBe('general_exploration')
    useAppStore.getState().setSeriesFitPreset(0, 'ckd_progression')
    expect(useAppStore.getState().seriesConfigs[0].fitConfig.preset).toBe('ckd_progression')
    expect(useAppStore.getState().seriesConfigs[0].fitConfig.censoring.censorAfterKidneyTransplant).toBe(true)
    useAppStore.getState().setSeriesFitConfig(0, { censoring: { censorAfterKidneyTransplant: false } })
    expect(useAppStore.getState().seriesConfigs[0].fitConfig.preset).toBe('custom')
    expect(useAppStore.getState().seriesConfigs[0].fitConfig.censoring.censorAfterKidneyTransplant).toBe(false)
    useAppStore.getState().reset()
    expect(useAppStore.getState().seriesConfigs[0].fitConfig.preset).toBe('general_exploration')
  })
})

describe('cohort zoom + exclusion days', () => {
  it('defaults cohortZoom to m and updates via setCohortZoom', () => {
    useAppStore.getState().reset()
    expect(useAppStore.getState().cohortZoom).toBe('m')
    useAppStore.getState().setCohortZoom('l')
    expect(useAppStore.getState().cohortZoom).toBe('l')
    useAppStore.getState().reset()
    expect(useAppStore.getState().cohortZoom).toBe('m')
  })
  it('series configs carry exclusionDays (default 30)', () => {
    useAppStore.getState().reset()
    expect(useAppStore.getState().seriesConfigs[0].exclusionDays).toBe(30)
    useAppStore.getState().setSeriesConfig(0, { mode: 'aki-aware', exclusionDays: 14 })
    expect(useAppStore.getState().seriesConfigs[0].exclusionDays).toBe(14)
  })
})

describe('analysis settings', () => {
  beforeEach(() => useAppStore.getState().reset())

  function expectEgfrCompatibilityFieldsToMatch() {
    const state = useAppStore.getState()
    expect(state.egfrFormula).toBe(state.analysisSettings.egfr.formula)
    expect(state.egfrSource).toBe(state.analysisSettings.egfr.source)
  }

  it('stores eGFR settings under analysisSettings and displayRows uses the analysis pipeline', () => {
    useAppStore.getState().setDataset([
      row({ patientSex: 'm', patientAgeAtLab: 50, wertNum: 1.0 }),
    ])
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')

    const state = useAppStore.getState()
    expect(state.analysisSettings.egfr.formula).toBe('ckd-epi-2021')
    expect(state.egfrFormula).toBe('ckd-epi-2021')
    expect(state.displayRows().some((r) => r.bezeichnung?.includes('eGFR (CKD-EPI 2021, computed)'))).toBe(true)
  })

  it('keeps eGFR compatibility fields aligned with analysis settings', () => {
    expectEgfrCompatibilityFieldsToMatch()

    useAppStore.getState().setEgfrFormula('ckd-epi-2021')
    expectEgfrCompatibilityFieldsToMatch()

    useAppStore.getState().setEgfrSource(['Kreatinin', 'mg/dl'])
    expectEgfrCompatibilityFieldsToMatch()

    useAppStore.getState().setDataset([row({ patientSex: 'm', patientAgeAtLab: 50, wertNum: 1.0 })])
    expectEgfrCompatibilityFieldsToMatch()
    expect(useAppStore.getState().analysisSettings.egfr.source).toBeNull()
  })
})

describe('analysis settings compatibility setters', () => {
  beforeEach(() => useAppStore.getState().reset())

  it('keeps showAki and rapid threshold compatibility fields in sync with analysisSettings', () => {
    useAppStore.getState().setShowAki(true)
    useAppStore.getState().setRapidEgfrThreshold(7)

    let state = useAppStore.getState()
    expect(state.showAki).toBe(true)
    expect(state.analysisSettings.aki.showOverlays).toBe(true)
    expect(state.rapidEgfrThreshold).toBe(7)
    expect(state.analysisSettings.rapidEgfrDecline.threshold).toBe(7)

    useAppStore.getState().setShowAki(false)
    state = useAppStore.getState()
    expect(state.showAki).toBe(false)
    expect(state.analysisSettings.aki.showOverlays).toBe(false)
  })

  it('keeps reset defaults aligned between compatibility fields and analysisSettings', () => {
    useAppStore.getState().setShowAki(true)
    useAppStore.getState().setRapidEgfrThreshold(7)

    useAppStore.getState().reset()

    const state = useAppStore.getState()
    expect(state.showAki).toBe(state.analysisSettings.aki.showOverlays)
    expect(state.showAki).toBe(false)
    expect(state.rapidEgfrThreshold).toBe(state.analysisSettings.rapidEgfrDecline.threshold)
    expect(state.rapidEgfrThreshold).toBe(5)
  })
})

describe('useAppStore - cohort grouping', () => {
  beforeEach(() => useAppStore.getState().reset())

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
      formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
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
    warnings: [],
    nPatients: 3,
    nMeasurements: 6,
    fixedEffects: { intercept: 60, timeSinceBaseline: -3 },
    fixedEffectConfidenceIntervals: { timeSinceBaseline: [-3.5, -2.5] },
    randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
    residualSd: null,
  }

  function seedGroupedResults() {
    useAppStore.setState({
      cohortModelResults: {
        cohort: { result: mixedModelResult, identity: mixedModelIdentity },
        'group:A': { result: mixedModelResult, identity: mixedModelIdentity },
      },
    })
    useAppStore.getState().setShowCohortMixedModelLine(true)
  }

  it('defaults the group-by attribute and the cohort model results to null', () => {
    expect(useAppStore.getState().cohortGroupByAttribute).toBeNull()
    expect(useAppStore.getState().cohortModelResults).toBeNull()
    expect(useAppStore.getState().cohortModelRunning).toBe(false)
  })

  it('setCohortGroupByAttribute sets the value and clears the results + the line toggle', () => {
    seedGroupedResults()

    useAppStore.getState().setCohortGroupByAttribute('genotype')

    expect(useAppStore.getState().cohortGroupByAttribute).toBe('genotype')
    expect(useAppStore.getState().cohortModelResults).toBeNull()
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
  })

  it('setCohortGroupByAttribute(null) clears the grouping', () => {
    useAppStore.getState().setCohortGroupByAttribute('genotype')
    useAppStore.getState().setCohortGroupByAttribute(null)
    expect(useAppStore.getState().cohortGroupByAttribute).toBeNull()
  })

  it('clearMixedModelResult clears all cohort model results', () => {
    useAppStore.setState({ cohortModelResults: { 'group:A': { result: mixedModelResult, identity: mixedModelIdentity } } })
    expect(useAppStore.getState().cohortModelResults?.['group:A'].result).toBe(mixedModelResult)

    useAppStore.getState().clearMixedModelResult()
    expect(useAppStore.getState().cohortModelResults).toBeNull()
  })

  it('clears cohort model results when selected patients change', () => {
    seedGroupedResults()
    useAppStore.getState().setSelectedPatientIds([1])
    expect(useAppStore.getState().cohortModelResults).toBeNull()
  })

  it('clears cohort model results when patient attributes are (re)imported', () => {
    seedGroupedResults()
    useAppStore.getState().setPatientAttributes({ '1': { genotype: 'A' } })
    expect(useAppStore.getState().cohortModelResults).toBeNull()
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
  })

  it('clears cohort model results when the mixed model config changes', () => {
    seedGroupedResults()
    useAppStore.getState().setMixedModelConfig({ timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept' })
    expect(useAppStore.getState().cohortModelResults).toBeNull()
  })

  it('resets the grouping and cohort model results when a new dataset is loaded', () => {
    useAppStore.getState().setCohortGroupByAttribute('genotype')
    useAppStore.setState({ cohortModelResults: { 'group:A': { result: mixedModelResult, identity: mixedModelIdentity } } })

    useAppStore.getState().setDataset([row({ patientId: 1 })], 'new.xlsx')

    expect(useAppStore.getState().cohortGroupByAttribute).toBeNull()
    expect(useAppStore.getState().cohortModelResults).toBeNull()
  })

  it('restores grouping defaults on reset', () => {
    useAppStore.getState().setCohortGroupByAttribute('genotype')
    useAppStore.setState({ cohortModelResults: { 'group:A': { result: mixedModelResult, identity: mixedModelIdentity } } })

    useAppStore.getState().reset()

    expect(useAppStore.getState().cohortGroupByAttribute).toBeNull()
    expect(useAppStore.getState().cohortModelResults).toBeNull()
  })

  it('runCohortModels writes results keyed by entity, merges, and toggles running off', async () => {
    const runJob = vi.fn(async () => mixedModelResult)
    const entityRows = [
      { patient_id: 'p1', eGFR: 60, time_since_baseline: 0 },
      { patient_id: 'p1', eGFR: 58, time_since_baseline: 1 },
    ]
    const params = {
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      fitConfigHash: 'fit',
      config: DEFAULT_MIXED_MODEL_CONFIG,
      formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
      runJob,
    }

    await useAppStore.getState().runCohortModels({
      ...params,
      entities: [{ entity: { kind: 'cohort' }, rows: entityRows }],
    })

    expect(Object.keys(useAppStore.getState().cohortModelResults ?? {})).toEqual(['cohort'])
    expect(useAppStore.getState().cohortModelRunning).toBe(false)

    // Fitting only a group preserves the prior cohort result (merge).
    await useAppStore.getState().runCohortModels({
      ...params,
      entities: [{ entity: { kind: 'group', value: 'A' }, rows: entityRows }],
    })

    expect(Object.keys(useAppStore.getState().cohortModelResults ?? {}).sort()).toEqual(['cohort', 'group:A'])
  })
})

describe('useAppStore - patient attributes', () => {
  beforeEach(() => useAppStore.getState().reset())

  it('starts with no patient attributes', () => {
    expect(useAppStore.getState().patientAttributes).toEqual({})
  })

  it('stores a patient attribute map', () => {
    useAppStore.getState().setPatientAttributes({ '10': { genotype: 'UMOD' } })
    expect(useAppStore.getState().patientAttributes).toEqual({ '10': { genotype: 'UMOD' } })
  })

  it('clears patient attributes when a new dataset is loaded', () => {
    useAppStore.getState().setPatientAttributes({ '10': { genotype: 'UMOD' } })
    useAppStore.getState().setDataset([row({ patientId: 1 })], 'new.xlsx')
    expect(useAppStore.getState().patientAttributes).toEqual({})
  })
})
