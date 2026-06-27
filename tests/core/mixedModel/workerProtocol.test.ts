import { describe, expect, it } from 'vitest'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFormula } from '../../../src/core/mixedModel/config'
import { isMixedModelWorkerResponse } from '../../../src/core/mixedModel/workerProtocol'

describe('isMixedModelWorkerResponse', () => {
  it('accepts mixed-model worker responses and rejects unrelated messages', () => {
    const successResponse = {
      type: 'mixed-model-result',
      requestId: 'req-1',
      result: {
        status: 'success',
        metadata: {},
        converged: true,
        warnings: [],
        nPatients: 3,
        nMeasurements: 6,
        fixedEffects: { intercept: 60, timeSinceBaseline: -2 },
        fixedEffectConfidenceIntervals: { timeSinceBaseline: [-2.8, -1.2] },
        randomEffects: { interceptSd: null, slopeSd: 0.5, interceptSlopeCorrelation: null },
        residualSd: 1.2,
      },
    }

    expect(isMixedModelWorkerResponse(successResponse)).toBe(true)
    expect(
      isMixedModelWorkerResponse({
        type: 'mixed-model-result',
        requestId: 'req-1',
        result: {
          status: 'unsupported',
          engine: 'webr-lme4',
          stage: 'package-load',
          code: 'PACKAGE_UNAVAILABLE',
          message: 'lme4 is unavailable in this webR package repository.',
          warnings: [],
          metadata: {},
        },
      }),
    ).toBe(true)
    expect(
      isMixedModelWorkerResponse({
        ...successResponse,
        result: {
          ...successResponse.result,
          fixedEffects: { ...successResponse.result.fixedEffects, intercept: Number.NaN },
        },
      }),
    ).toBe(false)
    expect(isMixedModelWorkerResponse({ type: 'other', requestId: 'req-1', result: {} })).toBe(false)
    expect(isMixedModelWorkerResponse(null)).toBe(false)
  })

  it('accepts success responses with optional baselineAge fixed effect', () => {
    expect(isMixedModelWorkerResponse({
      type: 'mixed-model-result',
      requestId: 'r1',
      result: {
        status: 'success',
        metadata: {
          engine: 'webr-lme4',
          formula: mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG),
          modelConfig: DEFAULT_MIXED_MODEL_CONFIG,
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
        fixedEffects: { intercept: 60, timeSinceBaseline: -3, baselineAge: -0.4 },
        fixedEffectConfidenceIntervals: { timeSinceBaseline: [-3.6, -2.4] },
        randomEffects: { interceptSd: 1, slopeSd: 0.2, interceptSlopeCorrelation: null },
        residualSd: 4,
      },
    })).toBe(true)
  })
})
