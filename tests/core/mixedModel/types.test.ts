import { describe, expect, it } from 'vitest'
import type { MixedModelFailure, MixedModelResult, MixedModelSuccess } from '../../../src/core/mixedModel/types'

describe('mixed model result contracts', () => {
  it('represents success and failure as discriminated results', () => {
    const success: MixedModelSuccess = {
      status: 'success',
      metadata: {
        engine: 'webr-lme4',
        formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
        runtimeVersion: '0.6.0',
        packageVersions: { lme4: '2.0-1' },
        browserUserAgent: 'vitest',
        wasmAssetSource: 'local-dev',
        optimizer: 'lmer-default',
        reml: true,
        tolerance: 1e-6,
        datasetId: 'synthetic-random-slope-v1',
        datasetHash: 'abc',
        randomSeed: null,
        fitConfigHash: 'def',
      },
      converged: true,
      warnings: [],
      nPatients: 4,
      nMeasurements: 16,
      fixedEffects: { intercept: 60, timeSinceBaseline: -2 },
      randomEffects: { interceptSd: 4, slopeSd: 0.5, interceptSlopeCorrelation: null },
      residualSd: 0.1,
    }

    const failure: MixedModelFailure = {
      status: 'unsupported',
      engine: 'webr-lme4',
      stage: 'package-load',
      code: 'PACKAGE_UNAVAILABLE',
      message: 'lme4 is unavailable in this webR package repository.',
      warnings: ['installPackages(lme4) failed'],
      metadata: {
        engine: 'webr-lme4',
        formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
      },
    }

    const results: MixedModelResult[] = [success, failure]
    expect(results.map((result) => result.status)).toEqual(['success', 'unsupported'])
  })
})
