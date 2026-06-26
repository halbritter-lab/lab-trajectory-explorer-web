import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MIXED_MODEL_CONFIG,
  mixedModelFormula,
  mixedModelFormulaKey,
  type MixedModelConfig,
} from '../../../src/core/mixedModel/config'
import {
  MIXED_MODEL_TOLERANCE,
  type MixedModelMetadata,
} from '../../../src/core/mixedModel/types'
import { normalizeExtractedFitResult } from '../../../src/core/mixedModel/webrResultNormalization'
import type { MixedModelWorkerRequest } from '../../../src/core/mixedModel/workerProtocol'

const LEGACY_MIXED_MODEL_CONFIG: MixedModelConfig = {
  timeAxis: 'time_since_baseline',
  covariates: [],
  randomEffects: 'intercept_slope',
}

const request: MixedModelWorkerRequest = {
  type: 'run-mixed-model',
  requestId: 'req-1',
  engine: 'webr-lme4',
  config: LEGACY_MIXED_MODEL_CONFIG,
  formula: mixedModelFormula(LEGACY_MIXED_MODEL_CONFIG),
  formulaKey: mixedModelFormulaKey(LEGACY_MIXED_MODEL_CONFIG),
  rows: [
    { patient_id: 'p1', eGFR: 60, time_since_baseline: 0 },
    { patient_id: 'p1', eGFR: 58, time_since_baseline: 1 },
  ],
  datasetId: 'dataset-1',
  fitConfigHash: 'fit-1',
  wasmAssetSource: 'local-dev',
}

const metadata: MixedModelMetadata = {
  engine: 'webr-lme4',
  formula: mixedModelFormula(LEGACY_MIXED_MODEL_CONFIG),
  modelConfig: LEGACY_MIXED_MODEL_CONFIG,
  runtimeVersion: 'R 4.5.0',
  packageVersions: {},
  browserUserAgent: 'vitest',
  wasmAssetSource: 'local-dev',
  optimizer: null,
  reml: true,
  tolerance: MIXED_MODEL_TOLERANCE,
  datasetId: 'dataset-1',
  datasetHash: 'hash-1',
  randomSeed: null,
  fitConfigHash: 'fit-1',
}

const validExtraction = {
  converged: true,
  warnings: [],
  fixedEffects: { intercept: 60, timeSinceBaseline: -2 },
  randomEffects: { interceptSd: null, slopeSd: 0.5, interceptSlopeCorrelation: null },
  residualSd: null,
  optimizer: undefined,
  packageVersions: { lme4: '1.1-37', jsonlite: '2.0.0' },
}

describe('webR worker fit extraction validation', () => {
  it('accepts nullable numeric fields and rejects malformed extracted payloads', () => {
    expect(normalizeExtractedFitResult(request, metadata, validExtraction)).toMatchObject({
      status: 'success',
      converged: true,
      warnings: [],
      randomEffects: { interceptSd: null, slopeSd: 0.5, interceptSlopeCorrelation: null },
      residualSd: null,
    })
    expect(normalizeExtractedFitResult(request, metadata, {
      ...validExtraction,
      warnings: {},
    }).warnings).toEqual([])
    expect(normalizeExtractedFitResult(request, metadata, {
      ...validExtraction,
      warnings: 'boundary fit',
    }).warnings).toEqual(['boundary fit'])

    expect(() =>
      normalizeExtractedFitResult(request, metadata, {
        ...validExtraction,
        warnings: { unexpected: 'warning' },
      }),
    ).toThrow(/warnings/)
    expect(() =>
      normalizeExtractedFitResult(request, metadata, {
        ...validExtraction,
        packageVersions: { lme4: 1 },
      }),
    ).toThrow(/packageVersions/)
    expect(() =>
      normalizeExtractedFitResult(request, metadata, {
        ...validExtraction,
        residualSd: Number.NaN,
      }),
    ).toThrow(/residualSd/)
  })

  it('drops NA (null) warning elements instead of failing the fit', () => {
    expect(
      normalizeExtractedFitResult(request, metadata, {
        ...validExtraction,
        warnings: ['boundary (singular) fit', null],
      }).warnings,
    ).toEqual(['boundary (singular) fit'])
  })

  it('rejects array-shaped fixed effects rather than treating them as a record', () => {
    expect(() =>
      normalizeExtractedFitResult(request, metadata, {
        ...validExtraction,
        fixedEffects: [60, -2],
      }),
    ).toThrow(/fixed or random effect/)
  })

  it('preserves extracted baseline-age fixed effects for baseline-age configs', () => {
    expect(normalizeExtractedFitResult({
      ...request,
      config: DEFAULT_MIXED_MODEL_CONFIG,
      formula: mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG),
      formulaKey: mixedModelFormulaKey(DEFAULT_MIXED_MODEL_CONFIG),
    }, metadata, {
      converged: true,
      warnings: [],
      fixedEffects: { intercept: 60, timeSinceBaseline: -3, baselineAge: -0.4 },
      randomEffects: { interceptSd: 1, slopeSd: 0.2, interceptSlopeCorrelation: null },
      residualSd: 4,
      optimizer: 'nloptwrap',
      packageVersions: {},
    })).toMatchObject({
      fixedEffects: { intercept: 60, timeSinceBaseline: -3, baselineAge: -0.4 },
    })
  })
})
