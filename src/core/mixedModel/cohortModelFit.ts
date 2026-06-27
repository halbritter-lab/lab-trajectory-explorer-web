import type { RunMixedModelWorkerJobOptions } from './browserClient'
import { entityGroupValue, entityKey, type CohortModelEntityRows } from './cohortModelEntity'
import type { MixedModelConfig } from './config'
import {
  buildMixedModelResultIdentity,
  type MixedModelResultIdentity,
} from './resultIdentity'
import type {
  MixedModelEngine,
  MixedModelFailure,
  MixedModelResult,
} from './types'

export interface CohortModelStoredResult {
  result: MixedModelResult
  identity: MixedModelResultIdentity
}

export interface RunCohortMixedModelsParams {
  /** Entities to fit (pooled cohort and/or groups), iterated in array order. */
  entities: CohortModelEntityRows[]
  seriesIndex: number
  seriesKey: string
  fitConfigHash: string
  /** The same engine/config/formula/datasetId are forwarded to every entity;
   * only the rows differ. */
  engine?: MixedModelEngine
  config?: MixedModelConfig
  formula?: string
  formulaKey?: string
  datasetId?: string
  runJob: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
  signal?: AbortSignal
  onProgress?: (progress: { completed: number; total: number; key: string }) => void
}

/** Fit one mixed model per entity, sequentially, reusing a single worker so the
 * (large) webR runtime loads once. Per-entity failures are isolated: a thrown
 * error or a failure result is recorded for that entity and does not abort the
 * others. When `signal` aborts, no further entities are launched. The pooled
 * cohort is just an entity with no group value. */
export async function runCohortMixedModels({
  entities,
  seriesIndex,
  seriesKey,
  fitConfigHash,
  engine = 'webr-lme4',
  config,
  formula,
  formulaKey,
  datasetId = 'cohort',
  runJob,
  signal,
  onProgress,
}: RunCohortMixedModelsParams): Promise<Record<string, CohortModelStoredResult>> {
  const results: Record<string, CohortModelStoredResult> = {}
  const total = entities.length
  let completed = 0

  for (const { entity, rows } of entities) {
    if (signal?.aborted) break
    const key = entityKey(entity)

    const identity = buildMixedModelResultIdentity({
      seriesIndex,
      seriesKey,
      patientIds: rows.map((row) => row.patient_id),
      rows,
      fitConfigHash,
      groupValue: entityGroupValue(entity),
    })

    let result: MixedModelResult
    try {
      result = await runJob({
        rows,
        engine,
        config,
        formula,
        formulaKey,
        datasetId,
        fitConfigHash,
        reuseWorker: true,
        signal,
      })
    } catch (error) {
      result = jobFailure(engine, formula, config, datasetId, fitConfigHash, error)
    }

    results[key] = { result, identity }
    completed += 1
    onProgress?.({ completed, total, key })
  }

  return results
}

/** Mirrors the cohort panel's catch-block failure shape so a thrown job error
 * surfaces as a structured per-entity result instead of rejecting the run. */
function jobFailure(
  engine: MixedModelEngine,
  formula: string | undefined,
  config: MixedModelConfig | undefined,
  datasetId: string,
  fitConfigHash: string,
  error: unknown,
): MixedModelFailure {
  return {
    status: 'runtime-error',
    engine,
    stage: 'fit',
    code: 'MIXED_MODEL_JOB_FAILED',
    message: error instanceof Error ? error.message : String(error),
    warnings: [],
    metadata: {
      engine,
      formula,
      modelConfig: config,
      datasetId,
      fitConfigHash,
    },
  }
}
