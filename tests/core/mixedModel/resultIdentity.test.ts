import { describe, expect, it } from 'vitest'
import {
  buildMixedModelResultIdentity,
  mixedModelFitConfigHash,
  mixedModelIdentityEquals,
  mixedModelMeanLinePoints,
} from '../../../src/core/mixedModel/resultIdentity'
import { DEFAULT_MIXED_MODEL_CONFIG } from '../../../src/core/mixedModel/config'
import { hashMixedModelInput } from '../../../src/core/mixedModel/validation'
import { ckdProgressionConfig } from '../../../src/core/fitPipeline/types'
import type { CohortSeriesSpec } from '../../../src/core/cohort/screening'
import type { MixedModelSpikeRow, MixedModelSuccess } from '../../../src/core/mixedModel/types'

const rows: MixedModelSpikeRow[] = [
  { patient_id: 'p1', eGFR: 70, time_since_baseline: 0 },
  { patient_id: 'p1', eGFR: 68, time_since_baseline: 1 },
  { patient_id: 'p2', eGFR: 60, time_since_baseline: 0 },
  { patient_id: 'p2', eGFR: 57, time_since_baseline: 1 },
  { patient_id: 'p3', eGFR: 55, time_since_baseline: 0 },
  { patient_id: 'p3', eGFR: 51, time_since_baseline: 2 },
]

const success: MixedModelSuccess = {
  status: 'success',
  metadata: {
    engine: 'webr-lme4',
    formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
    runtimeVersion: '4.6.0',
    packageVersions: { lme4: '2.0.1' },
    browserUserAgent: 'test',
    wasmAssetSource: 'cdn',
    optimizer: 'nloptwrap',
    reml: true,
    tolerance: 0.000001,
    datasetId: 'cohort',
    datasetHash: 'abc12345',
    randomSeed: null,
    fitConfigHash: 'fit12345',
  },
  converged: true,
  warnings: [],
  nPatients: 3,
  nMeasurements: 6,
  fixedEffects: { intercept: 62, timeSinceBaseline: -2.5 },
  randomEffects: { interceptSd: 4, slopeSd: 1.2, interceptSlopeCorrelation: -0.3 },
  residualSd: 2.1,
}

describe('mixed model result identity', () => {
  it('includes baseline_age in dataset identity when present', () => {
    const base = hashMixedModelInput([
      { patient_id: 'p1', eGFR: 70, time_since_baseline: 0, baseline_age: 50 },
      { patient_id: 'p1', eGFR: 68, time_since_baseline: 1, baseline_age: 50 },
    ])
    const changed = hashMixedModelInput([
      { patient_id: 'p1', eGFR: 70, time_since_baseline: 0, baseline_age: 51 },
      { patient_id: 'p1', eGFR: 68, time_since_baseline: 1, baseline_age: 51 },
    ])

    expect(changed).not.toBe(base)
  })

  it('includes mixed model config in fit config hash but ignores endpoint-only settings', () => {
    const fitConfig = ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    const spec: CohortSeriesSpec = {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      mode: 'global',
      cutoffDays: 90,
      exclusionDays: 30,
      fitConfig,
    }
    const baseline = mixedModelFitConfigHash(spec, DEFAULT_MIXED_MODEL_CONFIG)
    const interceptOnly = mixedModelFitConfigHash(spec, {
      timeAxis: 'time_since_baseline',
      covariates: ['baseline_age'],
      randomEffects: 'intercept',
    })
    const endpointOnly = mixedModelFitConfigHash({
      ...spec,
      fitConfig: {
        ...spec.fitConfig!,
        endpoints: { ...spec.fitConfig!.endpoints, percentDecline: !spec.fitConfig!.endpoints.percentDecline },
      },
    }, DEFAULT_MIXED_MODEL_CONFIG)

    expect(interceptOnly).not.toBe(baseline)
    expect(endpointOnly).toBe(baseline)
  })

  it('hashes mixed-model data policy but ignores endpoint-only changes', () => {
    const fitConfig = ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    const spec: CohortSeriesSpec = {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      mode: 'global',
      cutoffDays: 90,
      exclusionDays: 30,
      fitConfig,
    }

    const base = mixedModelFitConfigHash(spec)
    const changedTimeBalancing = mixedModelFitConfigHash({
      ...spec,
      fitConfig: { ...fitConfig, timeBalancing: 'monthly-median' },
    })
    const changedCensoring = mixedModelFitConfigHash({
      ...spec,
      fitConfig: {
        ...fitConfig,
        censoring: { ...fitConfig.censoring, censorAfterChronicDialysis: !fitConfig.censoring.censorAfterChronicDialysis },
      },
    })
    const changedEndpoints = mixedModelFitConfigHash({
      ...spec,
      fitConfig: {
        ...fitConfig,
        endpoints: { ...fitConfig.endpoints, observedCkdG5: !fitConfig.endpoints.observedCkdG5 },
      },
    })

    expect(changedTimeBalancing).not.toBe(base)
    expect(changedCensoring).not.toBe(base)
    expect(changedEndpoints).toBe(base)
  })

  it('builds a stable identity from series, rows, selected patients, and fit config', () => {
    const a = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p3', 'p1', 'p2'],
      rows,
      fitConfigHash: 'fit12345',
    })
    const b = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2', 'p3'],
      rows: [...rows].reverse(),
      fitConfigHash: 'fit12345',
    })

    expect(a).toEqual(b)
    expect(a.nPatients).toBe(3)
    expect(a.nMeasurements).toBe(6)
    expect(a.datasetHash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('builds a stable patient ID hash when patient IDs tie under display sorting', () => {
    const a = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'P1', '01', '1'],
      rows,
      fitConfigHash: 'fit12345',
    })
    const b = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['1', '01', 'P1', 'p1'],
      rows,
      fitConfigHash: 'fit12345',
    })

    expect(a.patientIdsHash).toBe(b.patientIdsHash)
    expect(mixedModelIdentityEquals(a, b)).toBe(true)
  })

  it('detects changed fit config, patient set, row values, or series identity', () => {
    const current = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2', 'p3'],
      rows,
      fitConfigHash: 'fit12345',
    })
    const changedSeries = buildMixedModelResultIdentity({
      seriesIndex: 1,
      seriesKey: 'Creatinine|mg/dl',
      patientIds: ['p1', 'p2', 'p3'],
      rows,
      fitConfigHash: 'fit12345',
    })
    const changedFitConfig = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2', 'p3'],
      rows,
      fitConfigHash: 'fit67890',
    })
    const changedPatientSet = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2'],
      rows,
      fitConfigHash: 'fit12345',
    })
    const changedRows = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2', 'p3'],
      rows: rows.map((row, index) => (index === 0 ? { ...row, eGFR: row.eGFR + 1 } : row)),
      fitConfigHash: 'fit12345',
    })

    expect(mixedModelIdentityEquals(current, changedSeries)).toBe(false)
    expect(mixedModelIdentityEquals(current, changedFitConfig)).toBe(false)
    expect(mixedModelIdentityEquals(current, changedPatientSet)).toBe(false)
    expect(mixedModelIdentityEquals(current, changedRows)).toBe(false)
  })

  it('derives fixed-effect mean line points over the model row time range', () => {
    expect(mixedModelMeanLinePoints(success, rows)).toEqual([
      { time_since_baseline: 0, eGFR: 62 },
      { time_since_baseline: 2, eGFR: 57 },
    ])
  })

  it('uses centered baseline age context for mean line points', () => {
    const result = {
      status: 'success' as const,
      metadata: success.metadata,
      converged: true,
      warnings: [],
      nPatients: 3,
      nMeasurements: 6,
      fixedEffects: { intercept: 100, timeSinceBaseline: -2, baselineAge: -0.5 },
      randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
      residualSd: null,
    }

    expect(mixedModelMeanLinePoints(result, [
      { patient_id: 'p1', eGFR: 70, time_since_baseline: 0, baseline_age: 50, baseline_age_centered: -10 },
      { patient_id: 'p1', eGFR: 68, time_since_baseline: 1, baseline_age: 50, baseline_age_centered: -10 },
      { patient_id: 'p2', eGFR: 60, time_since_baseline: 0, baseline_age: 60, baseline_age_centered: 0 },
      { patient_id: 'p2', eGFR: 58, time_since_baseline: 1, baseline_age: 60, baseline_age_centered: 0 },
      { patient_id: 'p3', eGFR: 55, time_since_baseline: 0, baseline_age: 70, baseline_age_centered: 10 },
      { patient_id: 'p3', eGFR: 53, time_since_baseline: 1, baseline_age: 70, baseline_age_centered: 10 },
    ], { baselineAgeCentered: 10 })).toEqual([
      { time_since_baseline: 0, eGFR: 95 },
      { time_since_baseline: 1, eGFR: 93 },
    ])
  })

  it('projects fixed-effect mean line points onto an age axis at the mean baseline age', () => {
    expect(mixedModelMeanLinePoints(success, [
      { patient_id: 'p1', eGFR: 70, time_since_baseline: 0, baseline_age: 50, baseline_age_centered: -10 },
      { patient_id: 'p1', eGFR: 68, time_since_baseline: 1, baseline_age: 50, baseline_age_centered: -10 },
      { patient_id: 'p2', eGFR: 60, time_since_baseline: 0, baseline_age: 60, baseline_age_centered: 0 },
      { patient_id: 'p2', eGFR: 58, time_since_baseline: 1, baseline_age: 60, baseline_age_centered: 0 },
      { patient_id: 'p3', eGFR: 55, time_since_baseline: 0, baseline_age: 70, baseline_age_centered: 10 },
      { patient_id: 'p3', eGFR: 53, time_since_baseline: 2, baseline_age: 70, baseline_age_centered: 10 },
    ], { ageAxisBaselineAge: 60 })).toEqual([
      { time_since_baseline: 0, age: 60, eGFR: 62 },
      { time_since_baseline: 2, age: 62, eGFR: 57 },
    ])
  })

  it('derives fixed-effect mean line points for large row arrays', () => {
    const manyRows: MixedModelSpikeRow[] = Array.from({ length: 200_000 }, (_, index) => ({
      patient_id: `p${index % 3}`,
      eGFR: 70 - index / 1000,
      time_since_baseline: index / 10,
    }))

    expect(mixedModelMeanLinePoints(success, manyRows)).toEqual([
      { time_since_baseline: 0, eGFR: 62 },
      { time_since_baseline: 19999.9, eGFR: -49937.75 },
    ])
  })
})
