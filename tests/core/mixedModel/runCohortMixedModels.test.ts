import { describe, expect, it, vi } from 'vitest'
import type { RunMixedModelWorkerJobOptions } from '../../../src/core/mixedModel/browserClient'
import type { CohortModelEntityRows } from '../../../src/core/mixedModel/cohortModelEntity'
import { runCohortMixedModels } from '../../../src/core/mixedModel/cohortModelFit'
import type {
  MixedModelResult,
  MixedModelSuccess,
} from '../../../src/core/mixedModel/types'

function success(intercept: number): MixedModelSuccess {
  return {
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
    nPatients: 1,
    nMeasurements: 2,
    fixedEffects: { intercept, timeSinceBaseline: -2 },
    fixedEffectConfidenceIntervals: { timeSinceBaseline: [-2.5, -1.5] },
    randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
    residualSd: null,
  }
}

const cohortRows = [
  { patient_id: 'c1', eGFR: 70, time_since_baseline: 0 },
  { patient_id: 'c2', eGFR: 60, time_since_baseline: 1 },
]
const groupARows = [
  { patient_id: 'a1', eGFR: 70, time_since_baseline: 0 },
  { patient_id: 'a1', eGFR: 68, time_since_baseline: 1 },
]
const groupBRows = [
  { patient_id: 'b1', eGFR: 60, time_since_baseline: 0 },
  { patient_id: 'b1', eGFR: 57, time_since_baseline: 1 },
]

const entities: CohortModelEntityRows[] = [
  { entity: { kind: 'cohort' }, rows: cohortRows },
  { entity: { kind: 'group', value: 'A' }, rows: groupARows },
  { entity: { kind: 'group', value: 'B' }, rows: groupBRows },
]

const baseParams = {
  seriesIndex: 0,
  seriesKey: 'eGFR|ml/min/1.73m2',
  fitConfigHash: 'fit12345',
}

describe('runCohortMixedModels', () => {
  it('runs the job once per entity in array order with reuseWorker', async () => {
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(
      async () => success(62),
    )

    await runCohortMixedModels({ ...baseParams, entities, runJob })

    expect(runJob).toHaveBeenCalledTimes(3)
    expect(runJob.mock.calls[0][0].rows).toBe(cohortRows)
    expect(runJob.mock.calls[1][0].rows).toBe(groupARows)
    expect(runJob.mock.calls[2][0].rows).toBe(groupBRows)
    for (const call of runJob.mock.calls) {
      expect(call[0].reuseWorker).toBe(true)
      expect(call[0].fitConfigHash).toBe('fit12345')
    }
  })

  it('keys results by entity and stamps the right groupValue (undefined for cohort)', async () => {
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(
      async () => success(62),
    )

    const out = await runCohortMixedModels({ ...baseParams, entities, runJob })

    expect(Object.keys(out)).toEqual(['cohort', 'group:A', 'group:B'])
    expect(out.cohort.identity.groupValue).toBeUndefined()
    expect(out['group:A'].identity.groupValue).toBe('A')
    expect(out['group:B'].identity.groupValue).toBe('B')
    expect(out['group:A'].identity.nMeasurements).toBe(2)
    expect(out['group:A'].identity.nPatients).toBe(1)
  })

  it('isolates per-entity failures: a rejecting entity still yields the others', async () => {
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(
      async (options) => {
        if (options.rows === groupARows) throw new Error('group A blew up')
        return success(62)
      },
    )

    const out = await runCohortMixedModels({ ...baseParams, entities, runJob })

    expect(Object.keys(out)).toEqual(['cohort', 'group:A', 'group:B'])
    expect(out.cohort.result.status).toBe('success')
    expect(out['group:B'].result.status).toBe('success')
    expect(out['group:A'].result.status).toBe('runtime-error')
    if (out['group:A'].result.status === 'runtime-error') {
      expect(out['group:A'].result.code).toBe('MIXED_MODEL_JOB_FAILED')
      expect(out['group:A'].result.message).toBe('group A blew up')
    }
  })

  it('also records a returned failure result without aborting the others', async () => {
    const failure: MixedModelResult = {
      status: 'unsupported',
      engine: 'webr-lme4',
      stage: 'package-load',
      code: 'PACKAGE_UNAVAILABLE',
      message: 'lme4 unavailable',
      warnings: [],
      metadata: { engine: 'webr-lme4' },
    }
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(
      async (options) => (options.rows === groupARows ? failure : success(62)),
    )

    const out = await runCohortMixedModels({ ...baseParams, entities, runJob })

    expect(out['group:A'].result.status).toBe('unsupported')
    expect(out.cohort.result.status).toBe('success')
    expect(out['group:B'].result.status).toBe('success')
  })

  it('runs entities strictly sequentially in array order', async () => {
    const order: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(
      async (options) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        order.push(options.rows[0].patient_id)
        await new Promise((resolve) => setTimeout(resolve, 0))
        inFlight -= 1
        return success(62)
      },
    )

    await runCohortMixedModels({ ...baseParams, entities, runJob })

    expect(order).toEqual(['c1', 'a1', 'b1'])
    expect(maxInFlight).toBe(1)
  })

  it('reports simple completed entity progress after each fit attempt', async () => {
    const onProgress = vi.fn()
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(
      async (options) => {
        if (options.rows === groupARows) throw new Error('group A blew up')
        return success(62)
      },
    )

    await runCohortMixedModels({ ...baseParams, entities, runJob, onProgress })

    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { completed: 1, total: 3, key: 'cohort' },
      { completed: 2, total: 3, key: 'group:A' },
      { completed: 3, total: 3, key: 'group:B' },
    ])
  })

  it('stops launching further entities once the signal is aborted', async () => {
    const controller = new AbortController()
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(
      async (options) => {
        if (options.rows === cohortRows) controller.abort()
        return success(62)
      },
    )

    const out = await runCohortMixedModels({
      ...baseParams,
      entities,
      runJob,
      signal: controller.signal,
    })

    expect(runJob).toHaveBeenCalledTimes(1)
    expect(Object.keys(out)).toEqual(['cohort'])
  })

  it('launches nothing when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const runJob = vi.fn<(options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>>(
      async () => success(62),
    )

    const out = await runCohortMixedModels({
      ...baseParams,
      entities,
      runJob,
      signal: controller.signal,
    })

    expect(runJob).not.toHaveBeenCalled()
    expect(out).toEqual({})
  })
})
