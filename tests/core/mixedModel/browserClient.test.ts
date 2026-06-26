import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MIXED_MODEL_CONFIG, mixedModelFormula, mixedModelFormulaKey } from '../../../src/core/mixedModel/config'
import { disposeMixedModelWorker, runMixedModelWorkerJob } from '../../../src/core/mixedModel/browserClient'
import { syntheticMixedModelRows } from '../../../src/core/mixedModel/syntheticData'

type FakeWorkerMode = 'success' | 'never' | 'error' | 'malformed' | 'post-error'

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  lastMessage: { requestId?: string } | null = null

  constructor(private readonly mode: FakeWorkerMode, private readonly requestId = 'req-1') {}

  postMessage(message: { requestId?: string }) {
    this.lastMessage = message
    if (this.mode === 'post-error') {
      throw new Error('structured clone failed')
    }

    const responseRequestId = message.requestId ?? this.requestId
    if (this.mode === 'success') {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'mixed-model-result',
            requestId: responseRequestId,
            result: {
              status: 'unsupported',
              engine: 'webr-lme4',
              stage: 'package-load',
              code: 'PACKAGE_UNAVAILABLE',
              message: 'lme4 unavailable',
              warnings: [],
              metadata: { engine: 'webr-lme4' },
            },
          },
        } as MessageEvent)
      })
    }
    if (this.mode === 'error') {
      queueMicrotask(() => this.onerror?.(new ErrorEvent('error', { message: 'worker failed' })))
    }
    if (this.mode === 'malformed') {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'mixed-model-result',
            requestId: responseRequestId,
            result: {
              status: 'definitely-not-a-mixed-model-status',
            },
          },
        } as MessageEvent)
      })
    }
  }

  terminate() {
    this.terminated = true
  }
}

describe('runMixedModelWorkerJob', () => {
  afterEach(() => {
    vi.useRealTimers()
    disposeMixedModelWorker()
  })

  it('resolves worker results and terminates the worker', async () => {
    const workerRef: { current: FakeWorker | null } = { current: null }
    const result = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker: () => {
        workerRef.current = new FakeWorker('success')
        return workerRef.current as unknown as Worker
      },
      timeoutMs: 1000,
    })
    expect(result.status).toBe('unsupported')
    expect(workerRef.current?.terminated).toBe(true)
  })

  it('posts default mixed-model config identity to the worker', async () => {
    const workerRef: { current: FakeWorker | null } = { current: null }
    await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker: () => {
        workerRef.current = new FakeWorker('success')
        return workerRef.current as unknown as Worker
      },
      timeoutMs: 1000,
    })

    expect(workerRef.current?.lastMessage).toMatchObject({
      config: DEFAULT_MIXED_MODEL_CONFIG,
      formula: mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG),
      formulaKey: mixedModelFormulaKey(DEFAULT_MIXED_MODEL_CONFIG),
    })
  })

  it('returns a structured timeout failure and terminates the worker', async () => {
    vi.useFakeTimers()
    const workerRef: { current: FakeWorker | null } = { current: null }
    const promise = runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      datasetId: 'dataset-1',
      fitConfigHash: 'fit-hash-1',
      createWorker: () => {
        workerRef.current = new FakeWorker('never')
        return workerRef.current as unknown as Worker
      },
      timeoutMs: 10,
    })
    await vi.advanceTimersByTimeAsync(11)
    await expect(promise).resolves.toMatchObject({
      status: 'timeout',
      stage: 'fit',
      code: 'WORKER_TIMEOUT',
      metadata: { datasetId: 'dataset-1', fitConfigHash: 'fit-hash-1' },
    })
    expect(workerRef.current?.terminated).toBe(true)
  })

  it('returns a structured cancellation failure and terminates the worker', async () => {
    const controller = new AbortController()
    const workerRef: { current: FakeWorker | null } = { current: null }
    const promise = runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      datasetId: 'dataset-2',
      fitConfigHash: 'fit-hash-2',
      createWorker: () => {
        workerRef.current = new FakeWorker('never')
        return workerRef.current as unknown as Worker
      },
      timeoutMs: 1000,
      signal: controller.signal,
    })
    controller.abort()
    await expect(promise).resolves.toMatchObject({
      status: 'cancelled',
      stage: 'fit',
      code: 'WORKER_CANCELLED',
      metadata: { datasetId: 'dataset-2', fitConfigHash: 'fit-hash-2' },
    })
    expect(workerRef.current?.terminated).toBe(true)
  })

  it('returns a structured worker-load failure and terminates the worker', async () => {
    const workerRef: { current: FakeWorker | null } = { current: null }
    const result = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      datasetId: 'dataset-3',
      fitConfigHash: 'fit-hash-3',
      createWorker: () => {
        workerRef.current = new FakeWorker('error')
        return workerRef.current as unknown as Worker
      },
      timeoutMs: 1000,
    })
    expect(result).toMatchObject({
      status: 'runtime-error',
      stage: 'worker-load',
      code: 'WORKER_ERROR',
      metadata: { datasetId: 'dataset-3', fitConfigHash: 'fit-hash-3' },
    })
    expect(workerRef.current?.terminated).toBe(true)
  })

  it('returns a structured worker construction failure', async () => {
    const result = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      datasetId: 'dataset-4',
      fitConfigHash: 'fit-hash-4',
      createWorker: () => {
        throw new Error('worker constructor blocked')
      },
      timeoutMs: 1000,
    })
    expect(result).toMatchObject({
      status: 'runtime-error',
      stage: 'worker-load',
      code: 'WORKER_CONSTRUCTION_FAILED',
      metadata: { datasetId: 'dataset-4', fitConfigHash: 'fit-hash-4' },
    })
  })

  it('returns a structured worker-load failure and terminates when postMessage throws', async () => {
    const workerRef: { current: FakeWorker | null } = { current: null }
    const result = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      datasetId: 'dataset-5',
      fitConfigHash: 'fit-hash-5',
      createWorker: () => {
        workerRef.current = new FakeWorker('post-error')
        return workerRef.current as unknown as Worker
      },
      timeoutMs: 1000,
    })
    expect(result).toMatchObject({
      status: 'runtime-error',
      stage: 'worker-load',
      code: 'WORKER_POST_MESSAGE_FAILED',
      metadata: { datasetId: 'dataset-5', fitConfigHash: 'fit-hash-5' },
    })
    expect(workerRef.current?.terminated).toBe(true)
  })

  it('rejects malformed worker responses addressed to the job instead of hanging', async () => {
    const workerRef: { current: FakeWorker | null } = { current: null }
    const result = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker: () => {
        workerRef.current = new FakeWorker('malformed')
        return workerRef.current as unknown as Worker
      },
      timeoutMs: 1000,
    })
    expect(result).toMatchObject({
      status: 'runtime-error',
      stage: 'result-extraction',
      code: 'WORKER_MALFORMED_RESPONSE',
    })
    expect(workerRef.current?.terminated).toBe(true)
  })

  it('reuses one worker across jobs and tears it down via disposeMixedModelWorker', async () => {
    let created = 0
    const workerRef: { current: FakeWorker | null } = { current: null }
    const createWorker = () => {
      created += 1
      workerRef.current = new FakeWorker('success')
      return workerRef.current as unknown as Worker
    }

    const first = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker,
      reuseWorker: true,
      timeoutMs: 1000,
    })
    const second = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker,
      reuseWorker: true,
      timeoutMs: 1000,
    })

    expect(first.status).toBe('unsupported')
    expect(second.status).toBe('unsupported')
    expect(created).toBe(1)
    expect(workerRef.current?.terminated).toBe(false)

    disposeMixedModelWorker()
    expect(workerRef.current?.terminated).toBe(true)
  })

  it('rebuilds the reusable worker after a cancellation tears it down', async () => {
    let created = 0
    const createWorker = () => {
      created += 1
      return new FakeWorker('never') as unknown as Worker
    }

    const controller = new AbortController()
    const promise = runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker,
      reuseWorker: true,
      timeoutMs: 1000,
      signal: controller.signal,
    })
    controller.abort()
    await expect(promise).resolves.toMatchObject({ status: 'cancelled' })

    // The cancelled worker was discarded, so the next job builds a fresh one.
    await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker: () => new FakeWorker('success') as unknown as Worker,
      reuseWorker: true,
      timeoutMs: 1000,
    })
    expect(created).toBe(1)
  })
})
