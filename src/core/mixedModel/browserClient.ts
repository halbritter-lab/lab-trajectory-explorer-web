import { isRecord } from './guards'
import {
  DEFAULT_MIXED_MODEL_CONFIG,
  mixedModelFormula,
  mixedModelFormulaKey,
  type MixedModelConfig,
} from './config'
import {
  MIXED_MODEL_TIMEOUT_MS,
  type MixedModelEngine,
  type MixedModelFailure,
  type MixedModelResult,
  type MixedModelSpikeRow,
} from './types'
import { isMixedModelWorkerResponse, type MixedModelWorkerRequest } from './workerProtocol'

export interface RunMixedModelWorkerJobOptions {
  rows: MixedModelSpikeRow[]
  engine: MixedModelEngine
  config?: MixedModelConfig
  formula?: string
  formulaKey?: string
  datasetId?: string
  fitConfigHash?: string
  timeoutMs?: number
  signal?: AbortSignal
  wasmAssetSource?: 'cdn' | 'self-hosted' | 'local-dev'
  createWorker?: () => Worker
  /** Reuse a single module-scoped worker across jobs so the webR runtime and R
   * packages (lme4 is large) load once instead of on every job. The worker is
   * torn down only on timeout/cancel/error or via disposeMixedModelWorker(). */
  reuseWorker?: boolean
}

let sharedWorker: Worker | null = null

function defaultWorkerFactory(): Worker {
  return new Worker(new URL('./webr.worker.ts', import.meta.url), { type: 'module' })
}

/** Terminate and forget the shared reusable worker. Call on teardown so the
 * webR runtime is not leaked once the feature is no longer mounted. */
export function disposeMixedModelWorker(): void {
  if (sharedWorker) {
    sharedWorker.terminate()
    sharedWorker = null
  }
}

export function runMixedModelWorkerJob(options: RunMixedModelWorkerJobOptions): Promise<MixedModelResult> {
  const timeoutMs = options.timeoutMs ?? MIXED_MODEL_TIMEOUT_MS
  const config = options.config ?? DEFAULT_MIXED_MODEL_CONFIG
  const formula = options.formula ?? mixedModelFormula(config)
  const formulaKey = options.formulaKey ?? mixedModelFormulaKey(config)
  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return new Promise((resolve) => {
    const factory = options.createWorker ?? defaultWorkerFactory
    let worker: Worker
    try {
      worker = options.reuseWorker ? (sharedWorker ??= factory()) : factory()
    } catch (error) {
      if (options.reuseWorker) sharedWorker = null
      resolve(
        failure(
          options,
          'runtime-error',
          'worker-load',
          'WORKER_CONSTRUCTION_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      )
      return
    }

    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    // terminate=true tears the worker down (used when its state is unknown or
    // unusable: timeout, cancel, error, malformed). A clean result on a
    // reusable worker keeps it alive for the next job.
    const finish = (result: MixedModelResult, terminate: boolean) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      worker.onmessage = null
      worker.onerror = null
      if (terminate || !options.reuseWorker) {
        worker.terminate()
        if (sharedWorker === worker) sharedWorker = null
      }
      resolve(result)
    }

    const onAbort = () => {
      finish(failure(options, 'cancelled', 'fit', 'WORKER_CANCELLED', 'Mixed-model worker job was cancelled.'), true)
    }

    if (options.signal?.aborted) {
      finish(failure(options, 'cancelled', 'fit', 'WORKER_CANCELLED', 'Mixed-model worker job was cancelled.'), true)
      return
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    timer = setTimeout(() => {
      finish(failure(options, 'timeout', 'fit', 'WORKER_TIMEOUT', `Mixed-model worker exceeded ${timeoutMs} ms.`), true)
    }, timeoutMs)

    worker.onmessage = (event: MessageEvent) => {
      const data: unknown = event.data
      // Ignore messages addressed to a different job (e.g. a stale response
      // arriving on a reused worker).
      if (!isRecord(data) || data.requestId !== requestId) return
      // The message is ours but does not satisfy the result contract: surface
      // it immediately instead of hanging until the timeout.
      if (!isMixedModelWorkerResponse(data)) {
        finish(
          failure(
            options,
            'runtime-error',
            'result-extraction',
            'WORKER_MALFORMED_RESPONSE',
            'Mixed-model worker returned a malformed response.',
          ),
          true,
        )
        return
      }
      finish(data.result, false)
    }

    worker.onerror = (event: ErrorEvent) => {
      finish(
        failure(
          options,
          'runtime-error',
          'worker-load',
          'WORKER_ERROR',
          event.message || 'Mixed-model worker failed.',
        ),
        true,
      )
    }

    const request: MixedModelWorkerRequest = {
      type: 'run-mixed-model',
      requestId,
      engine: options.engine,
      config,
      formula,
      formulaKey,
      rows: options.rows,
      datasetId: options.datasetId ?? 'ad-hoc',
      fitConfigHash: options.fitConfigHash ?? 'unknown',
      wasmAssetSource: options.wasmAssetSource ?? 'cdn',
    }
    try {
      worker.postMessage(request)
    } catch (error) {
      finish(
        failure(
          options,
          'runtime-error',
          'worker-load',
          'WORKER_POST_MESSAGE_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
        true,
      )
    }
  })
}

function failure(
  options: Pick<
    RunMixedModelWorkerJobOptions,
    'config' | 'datasetId' | 'engine' | 'fitConfigHash' | 'formula' | 'wasmAssetSource'
  >,
  status: MixedModelFailure['status'],
  stage: MixedModelFailure['stage'],
  code: string,
  message: string,
): MixedModelFailure {
  const config = options.config ?? DEFAULT_MIXED_MODEL_CONFIG
  return {
    status,
    engine: options.engine,
    stage,
    code,
    message,
    warnings: [],
    metadata: {
      engine: options.engine,
      formula: options.formula ?? mixedModelFormula(config),
      modelConfig: config,
      browserUserAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
      datasetId: options.datasetId ?? 'ad-hoc',
      fitConfigHash: options.fitConfigHash ?? 'unknown',
      wasmAssetSource: options.wasmAssetSource ?? 'cdn',
    },
  }
}
