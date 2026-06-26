# Browser Mixed Model Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only technical spike that can prepare model-ready cohort rows, run a webR mixed-model attempt in a Web Worker, and return typed success/failure results without affecting existing patient-level fit behavior.

**Architecture:** Add `src/core/mixedModel/` as an isolated spike boundary. Core files define row/result contracts, deterministic validation, synthetic datasets, and cohort-row adapters; browser files define a worker protocol and webR worker. A feature-gated debug panel can call the worker, but existing cohort tables, overlays, and patient fits remain unchanged.

**Tech Stack:** TypeScript, React, Vite Web Workers, Vitest, `webr` npm package, existing cohort/fit pipeline helpers.

---

## File Structure

- Create `src/core/mixedModel/types.ts`: discriminated result contracts, engine IDs, metadata, input-row types, approximation result type.
- Create `src/core/mixedModel/validation.ts`: deterministic row validation, duplicate policy, dataset/config hashing helpers.
- Create `src/core/mixedModel/syntheticData.ts`: synthetic random-intercept/random-slope fixture used by tests and debug panel.
- Create `src/core/mixedModel/cohortDataset.ts`: adapter from raw cohort rows plus `CohortSeriesSpec` to `MixedModelSpikeRow[]`, reusing event/AKI exclusions and time balancing.
- Create `src/core/mixedModel/workerProtocol.ts`: request/response message types, timeout constants, type guards.
- Create `src/core/mixedModel/browserClient.ts`: main-thread worker wrapper with timeout/cancellation/error normalization.
- Create `src/core/mixedModel/webr.worker.ts`: minimal worker stub first, then webR runtime loader, package probe, hard-coded first model, result normalization.
- Create `src/ui/cohort/MixedModelDebugPanel.tsx`: feature-gated exploratory panel.
- Modify `src/ui/cohort/CohortView.tsx`: render debug panel only when `import.meta.env.VITE_MIXED_MODEL_SPIKE === 'true'`.
- Create tests under `tests/core/mixedModel/` and `tests/ui/MixedModelDebugPanel.test.tsx`.
- Modify `package.json` and lockfile by installing `webr`.

## Task 1: Core Mixed-Model Contracts

**Files:**
- Create: `src/core/mixedModel/types.ts`
- Test: `tests/core/mixedModel/types.test.ts`

- [ ] **Step 1: Write the failing type/shape tests**

Create `tests/core/mixedModel/types.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run tests/core/mixedModel/types.test.ts
```

Expected: FAIL because `src/core/mixedModel/types.ts` does not exist.

- [ ] **Step 3: Add the core contracts**

Create `src/core/mixedModel/types.ts`:

```ts
export type MixedModelEngine = 'webr-lme4' | 'webr-nlme' | 'pyodide-statsmodels'

export interface MixedModelSpikeRow {
  patient_id: string
  eGFR: number
  time_since_baseline: number
}

export interface MixedModelProductionRow extends MixedModelSpikeRow {
  age?: number
  source_row_index: number
  included: true
}

export interface MixedModelMetadata {
  engine: MixedModelEngine
  formula: string
  runtimeVersion: string | null
  packageVersions: Record<string, string>
  browserUserAgent: string
  wasmAssetSource: 'cdn' | 'self-hosted' | 'local-dev'
  optimizer: string | null
  reml: boolean
  tolerance: number | null
  datasetId: string
  datasetHash: string
  randomSeed: number | null
  fitConfigHash: string
}

export interface MixedModelSuccess {
  status: 'success'
  metadata: MixedModelMetadata
  converged: boolean
  warnings: string[]
  nPatients: number
  nMeasurements: number
  fixedEffects: {
    intercept: number
    timeSinceBaseline: number
  }
  randomEffects: {
    interceptSd: number | null
    slopeSd: number | null
    interceptSlopeCorrelation: number | null
  }
  residualSd: number | null
}

export type MixedModelFailureStatus = 'unsupported' | 'runtime-error' | 'fit-error' | 'timeout' | 'cancelled'
export type MixedModelFailureStage = 'worker-load' | 'runtime-load' | 'package-load' | 'data-validation' | 'fit' | 'result-extraction'

export interface MixedModelFailure {
  status: MixedModelFailureStatus
  engine: MixedModelEngine
  stage: MixedModelFailureStage
  code: string
  message: string
  warnings: string[]
  metadata: Partial<MixedModelMetadata>
}

export type MixedModelResult = MixedModelSuccess | MixedModelFailure

export interface CohortSlopeApproximationResult {
  status: 'success' | 'insufficient-data'
  method: 'patient-slope-weighted-summary'
  label: 'Cohort slope summary (not a mixed model)'
  nPatients: number
  nMeasurements: number
  meanSlope: number | null
  confidenceInterval: [number, number] | null
  warnings: string[]
}

export const MIXED_MODEL_FORMULA = 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)'
export const MIXED_MODEL_TOLERANCE = 1e-6
export const MIXED_MODEL_TIMEOUT_MS = 30_000
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm vitest run tests/core/mixedModel/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/mixedModel/types.ts tests/core/mixedModel/types.test.ts
git commit -m "feat: add mixed model result contracts"
```

## Task 2: Validation, Hashing, and Synthetic Data

**Files:**
- Create: `src/core/mixedModel/validation.ts`
- Create: `src/core/mixedModel/syntheticData.ts`
- Test: `tests/core/mixedModel/validation.test.ts`
- Test: `tests/core/mixedModel/syntheticData.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/core/mixedModel/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hashMixedModelInput, validateMixedModelRows } from '../../../src/core/mixedModel/validation'
import type { MixedModelSpikeRow } from '../../../src/core/mixedModel/types'

const rows: MixedModelSpikeRow[] = [
  { patient_id: '1', eGFR: 60, time_since_baseline: 0 },
  { patient_id: '1', eGFR: 58, time_since_baseline: 1 },
  { patient_id: '2', eGFR: 62, time_since_baseline: 0 },
  { patient_id: '2', eGFR: 59, time_since_baseline: 1 },
  { patient_id: '3', eGFR: 57, time_since_baseline: 0 },
  { patient_id: '3', eGFR: 54, time_since_baseline: 1 },
]

describe('validateMixedModelRows', () => {
  it('accepts at least 3 patients with repeated finite measurements and time variation', () => {
    expect(validateMixedModelRows(rows)).toEqual({ ok: true, warnings: [] })
  })

  it('rejects non-finite values before fitting', () => {
    expect(validateMixedModelRows([{ ...rows[0], eGFR: Number.NaN }, ...rows.slice(1)])).toMatchObject({
      ok: false,
      code: 'NON_FINITE_VALUE',
      stage: 'data-validation',
    })
  })

  it('rejects fewer than 3 patients', () => {
    expect(validateMixedModelRows(rows.filter((row) => row.patient_id !== '3'))).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_PATIENTS',
    })
  })

  it('rejects patients with fewer than 2 rows', () => {
    expect(validateMixedModelRows(rows.filter((row) => !(row.patient_id === '3' && row.time_since_baseline === 1)))).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_REPEATED_MEASURES',
    })
  })

  it('rejects duplicate patient/time rows', () => {
    expect(validateMixedModelRows([...rows, rows[0]])).toMatchObject({
      ok: false,
      code: 'DUPLICATE_PATIENT_TIME',
    })
  })

  it('produces stable hashes independent of input row order', () => {
    expect(hashMixedModelInput(rows)).toBe(hashMixedModelInput([...rows].reverse()))
  })
})
```

- [ ] **Step 2: Write failing synthetic-data tests**

Create `tests/core/mixedModel/syntheticData.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MIXED_MODEL_SYNTHETIC_DATASET_ID, syntheticMixedModelRows } from '../../../src/core/mixedModel/syntheticData'
import { validateMixedModelRows } from '../../../src/core/mixedModel/validation'

describe('syntheticMixedModelRows', () => {
  it('provides a deterministic valid random-slope fixture', () => {
    const rows = syntheticMixedModelRows()
    expect(MIXED_MODEL_SYNTHETIC_DATASET_ID).toBe('synthetic-random-slope-v1')
    expect(rows).toHaveLength(16)
    expect(new Set(rows.map((row) => row.patient_id))).toEqual(new Set(['p1', 'p2', 'p3', 'p4']))
    expect(validateMixedModelRows(rows)).toEqual({ ok: true, warnings: [] })
    expect(rows.slice(0, 4)).toEqual([
      { patient_id: 'p1', eGFR: 65, time_since_baseline: 0 },
      { patient_id: 'p1', eGFR: 62.7, time_since_baseline: 1 },
      { patient_id: 'p1', eGFR: 60.4, time_since_baseline: 2 },
      { patient_id: 'p1', eGFR: 58.1, time_since_baseline: 3 },
    ])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm vitest run tests/core/mixedModel/validation.test.ts tests/core/mixedModel/syntheticData.test.ts
```

Expected: FAIL because validation and synthetic modules do not exist.

- [ ] **Step 4: Implement validation**

Create `src/core/mixedModel/validation.ts`:

```ts
import type { MixedModelFailureStage, MixedModelSpikeRow } from './types'

export type MixedModelValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; stage: MixedModelFailureStage; code: string; message: string; warnings: string[] }

export function validateMixedModelRows(rows: readonly MixedModelSpikeRow[]): MixedModelValidationResult {
  if (rows.length === 0) {
    return fail('EMPTY_DATASET', 'Mixed-model dataset has no rows.')
  }

  const byPatient = new Map<string, MixedModelSpikeRow[]>()
  const seenPatientTimes = new Set<string>()

  for (const row of rows) {
    if (!row.patient_id.trim()) return fail('EMPTY_PATIENT_ID', 'Mixed-model row has an empty patient_id.')
    if (!Number.isFinite(row.eGFR) || !Number.isFinite(row.time_since_baseline)) {
      return fail('NON_FINITE_VALUE', 'Mixed-model rows must contain finite eGFR and time_since_baseline values.')
    }
    const duplicateKey = `${row.patient_id}\u0000${row.time_since_baseline}`
    if (seenPatientTimes.has(duplicateKey)) {
      return fail('DUPLICATE_PATIENT_TIME', `Duplicate row for patient ${row.patient_id} at time ${row.time_since_baseline}.`)
    }
    seenPatientTimes.add(duplicateKey)
    byPatient.set(row.patient_id, [...(byPatient.get(row.patient_id) ?? []), row])
  }

  if (byPatient.size < 3) {
    return fail('INSUFFICIENT_PATIENTS', 'Mixed models require at least 3 patients in this spike.')
  }

  for (const [patientId, patientRows] of byPatient) {
    if (patientRows.length < 2) {
      return fail('INSUFFICIENT_REPEATED_MEASURES', `Patient ${patientId} has fewer than 2 included measurements.`)
    }
    if (new Set(patientRows.map((row) => row.time_since_baseline)).size < 2) {
      return fail('NO_WITHIN_PATIENT_TIME_VARIATION', `Patient ${patientId} has no within-patient time variation.`)
    }
  }

  return { ok: true, warnings: [] }
}

function fail(code: string, message: string): MixedModelValidationResult {
  return { ok: false, stage: 'data-validation', code, message, warnings: [] }
}

export function hashMixedModelInput(rows: readonly MixedModelSpikeRow[]): string {
  const canonical = [...rows]
    .map((row) => ({
      patient_id: row.patient_id,
      eGFR: roundForHash(row.eGFR),
      time_since_baseline: roundForHash(row.time_since_baseline),
    }))
    .sort((a, b) => a.patient_id.localeCompare(b.patient_id) || a.time_since_baseline - b.time_since_baseline || a.eGFR - b.eGFR)
  return hashString(JSON.stringify(canonical))
}

export function hashString(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function roundForHash(value: number): number {
  return Number(value.toFixed(10))
}
```

- [ ] **Step 5: Implement synthetic data**

Create `src/core/mixedModel/syntheticData.ts`:

```ts
import type { MixedModelSpikeRow } from './types'

export const MIXED_MODEL_SYNTHETIC_DATASET_ID = 'synthetic-random-slope-v1'

const patients = [
  { id: 'p1', intercept: 65, slope: -2.3 },
  { id: 'p2', intercept: 58, slope: -1.4 },
  { id: 'p3', intercept: 72, slope: -3.1 },
  { id: 'p4', intercept: 61, slope: -2.0 },
]

export function syntheticMixedModelRows(): MixedModelSpikeRow[] {
  const rows: MixedModelSpikeRow[] = []
  for (const patient of patients) {
    for (const time of [0, 1, 2, 3]) {
      rows.push({
        patient_id: patient.id,
        eGFR: Number((patient.intercept + patient.slope * time).toFixed(1)),
        time_since_baseline: time,
      })
    }
  }
  return rows
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
pnpm vitest run tests/core/mixedModel/validation.test.ts tests/core/mixedModel/syntheticData.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/mixedModel/validation.ts src/core/mixedModel/syntheticData.ts tests/core/mixedModel/validation.test.ts tests/core/mixedModel/syntheticData.test.ts
git commit -m "feat: validate mixed model spike datasets"
```

## Task 3: Cohort Dataset Adapter

**Files:**
- Create: `src/core/mixedModel/cohortDataset.ts`
- Test: `tests/core/mixedModel/cohortDataset.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `tests/core/mixedModel/cohortDataset.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mixedModelRowsFromCohortInputs } from '../../../src/core/mixedModel/cohortDataset'
import type { CohortSeriesSpec } from '../../../src/core/cohort/screening'
import { generalExplorationConfig } from '../../../src/core/fitPipeline/types'
import type { LabRow } from '../../../src/core/types'

const d = (s: string) => new Date(s)

function row(p: Partial<LabRow>): LabRow {
  return {
    patientId: 7,
    labDatum: d('2020-01-01T00:00:00Z'),
    bezeichnung: 'eGFR',
    einheit: 'ml/min/1.73m2',
    wert: '60',
    wertNum: 60,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    patientAgeAtLab: null,
    ...p,
  }
}

describe('mixedModelRowsFromCohortInputs', () => {
  it('uses included raw fit points and years since first included point', () => {
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global' }
    const rows = [
      row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60 }),
      row({ labDatum: d('2020-07-01T00:00:00Z'), wertNum: 59 }),
      row({ labDatum: d('2021-01-01T00:00:00Z'), wertNum: 58 }),
    ]

    expect(mixedModelRowsFromCohortInputs(rows, [7], spec)).toEqual([
      { patient_id: '7', eGFR: 60, time_since_baseline: 0 },
      { patient_id: '7', eGFR: 59, time_since_baseline: 0.4982888433 },
      { patient_id: '7', eGFR: 58, time_since_baseline: 1.0020533881 },
    ])
  })

  it('applies selected time balancing before producing model rows', () => {
    const fitConfig = generalExplorationConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    fitConfig.timeBalancing = 'monthly-median'
    const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global', fitConfig }
    const rows = [
      row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60 }),
      row({ labDatum: d('2020-01-20T00:00:00Z'), wertNum: 58 }),
      row({ labDatum: d('2020-02-01T00:00:00Z'), wertNum: 56 }),
    ]

    expect(mixedModelRowsFromCohortInputs(rows, [7], spec)).toEqual([
      { patient_id: '7', eGFR: 59, time_since_baseline: 0 },
      { patient_id: '7', eGFR: 56, time_since_baseline: 0.0848733744 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/core/mixedModel/cohortDataset.test.ts
```

Expected: FAIL because `cohortDataset.ts` does not exist.

- [ ] **Step 3: Implement the adapter**

Create `src/core/mixedModel/cohortDataset.ts`:

```ts
import type { CohortSeriesSpec } from '../cohort/screening'
import type { AkiEpisode } from '../aki/kdigo'
import { episodesForSeries, fitAkiAware } from '../aki/akiAware'
import { filterFitPointsByClinicalEvents } from '../events/fitExclusions'
import { balanceSeriesPoints } from '../stats/timeBalancing'
import { comparePatientIds, patientIdKey, type LabRow, type PatientId } from '../types'
import type { MixedModelSpikeRow } from './types'

const MS_PER_YEAR = 365.25 * 86_400_000

export function mixedModelRowsFromCohortInputs(allRows: readonly LabRow[], patientIds: readonly PatientId[], spec: CohortSeriesSpec): MixedModelSpikeRow[] {
  const out: MixedModelSpikeRow[] = []
  const ids = [...new Set(patientIds)].sort(comparePatientIds)
  for (const patientId of ids) {
    const patientRows = allRows.filter((row) => row.patientId === patientId)
    const patientKey = patientIdKey(patientId)
    const clinicalEvents = spec.clinicalEventsByPatient?.[patientKey] ?? spec.clinicalEvents ?? []
    const seriesRows = patientRows
      .filter((row) => row.bezeichnung === spec.bezeichnung && (row.einheit ?? null) === (spec.einheit ?? null) && row.wertNum !== null && row.labDatum !== null)
      .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    const points = seriesRows.map((row) => ({ date: row.labDatum!, value: row.wertNum! }))
    const eventExcluded = new Set(filterFitPointsByClinicalEvents(points, clinicalEvents, spec.fitConfig?.censoring).excludedIdx)
    let included = points.filter((_, index) => !eventExcluded.has(index))
    if ((spec.mode === 'aki-aware' || spec.fitConfig?.exclusions.excludeAkiWindows) && included.length > 0) {
      const episodes: AkiEpisode[] = episodesForSeries(patientRows, patientId, spec.bezeichnung, spec.einheit ?? null)
      const kept = new Set(fitAkiAware(included, spec.exclusionDays ?? spec.fitConfig?.exclusions.akiExclusionDays ?? 30, episodes).keptIdx)
      included = included.filter((_, index) => kept.has(index))
    }
    const balanced = balanceSeriesPoints(included, spec.fitConfig?.timeBalancing)
    if (balanced.length === 0) continue
    const baseline = balanced[0].date.getTime()
    for (const point of balanced) {
      out.push({ patient_id: patientKey, eGFR: point.value, time_since_baseline: roundYears((point.date.getTime() - baseline) / MS_PER_YEAR) })
    }
  }
  return out
}

function roundYears(value: number): number {
  return Number(value.toFixed(10))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/core/mixedModel/cohortDataset.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/mixedModel/cohortDataset.ts tests/core/mixedModel/cohortDataset.test.ts
git commit -m "feat: derive mixed model rows from cohort data"
```

## Task 4: Worker Protocol and Browser Client

**Files:**
- Create: `src/core/mixedModel/workerProtocol.ts`
- Create: `src/core/mixedModel/browserClient.ts`
- Create: `src/core/mixedModel/webr.worker.ts`
- Test: `tests/core/mixedModel/browserClient.test.ts`

- [ ] **Step 1: Write failing browser-client tests**

Create `tests/core/mixedModel/browserClient.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { runMixedModelWorkerJob } from '../../../src/core/mixedModel/browserClient'
import { syntheticMixedModelRows } from '../../../src/core/mixedModel/syntheticData'

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false

  constructor(private readonly mode: 'success' | 'never' | 'error', private readonly requestId = 'req-1') {}

  postMessage(message: { requestId?: string }) {
    const responseRequestId = message.requestId ?? this.requestId
    if (this.mode === 'success') {
      queueMicrotask(() => {
        this.onmessage?.({ data: {
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
        } } as MessageEvent)
      })
    }
    if (this.mode === 'error') {
      queueMicrotask(() => this.onerror?.(new ErrorEvent('error', { message: 'worker failed' })))
    }
  }

  terminate() {
    this.terminated = true
  }
}

describe('runMixedModelWorkerJob', () => {
  it('resolves worker results and terminates the worker', async () => {
    let worker: FakeWorker | null = null
    const result = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker: () => {
        worker = new FakeWorker('success')
        return worker as unknown as Worker
      },
      timeoutMs: 1000,
    })
    expect(result.status).toBe('unsupported')
    expect(worker?.terminated).toBe(true)
  })

  it('returns a structured timeout failure', async () => {
    vi.useFakeTimers()
    const promise = runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker: () => new FakeWorker('never') as unknown as Worker,
      timeoutMs: 10,
    })
    await vi.advanceTimersByTimeAsync(11)
    await expect(promise).resolves.toMatchObject({ status: 'timeout', stage: 'fit', code: 'WORKER_TIMEOUT' })
    vi.useRealTimers()
  })

  it('returns a structured cancellation failure', async () => {
    const controller = new AbortController()
    const promise = runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker: () => new FakeWorker('never') as unknown as Worker,
      timeoutMs: 1000,
      signal: controller.signal,
    })
    controller.abort()
    await expect(promise).resolves.toMatchObject({ status: 'cancelled', stage: 'fit', code: 'WORKER_CANCELLED' })
  })

  it('returns a structured worker-load failure', async () => {
    const result = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker: () => new FakeWorker('error') as unknown as Worker,
      timeoutMs: 1000,
    })
    expect(result).toMatchObject({ status: 'runtime-error', stage: 'worker-load', code: 'WORKER_ERROR' })
  })

  it('returns a structured worker construction failure', async () => {
    const result = await runMixedModelWorkerJob({
      rows: syntheticMixedModelRows(),
      engine: 'webr-lme4',
      createWorker: () => {
        throw new Error('worker constructor blocked')
      },
      timeoutMs: 1000,
    })
    expect(result).toMatchObject({ status: 'runtime-error', stage: 'worker-load', code: 'WORKER_CONSTRUCTION_FAILED' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/core/mixedModel/browserClient.test.ts
```

Expected: FAIL because worker protocol/client modules do not exist.

- [ ] **Step 3: Implement worker protocol**

Create `src/core/mixedModel/workerProtocol.ts`:

```ts
import type { MixedModelEngine, MixedModelResult, MixedModelSpikeRow } from './types'

export interface MixedModelWorkerRequest {
  type: 'run-mixed-model'
  requestId: string
  engine: MixedModelEngine
  rows: MixedModelSpikeRow[]
  datasetId: string
  fitConfigHash: string
  wasmAssetSource: 'cdn' | 'self-hosted' | 'local-dev'
}

export interface MixedModelWorkerResponse {
  type: 'mixed-model-result'
  requestId: string
  result: MixedModelResult
}

export function isMixedModelWorkerResponse(value: unknown): value is MixedModelWorkerResponse {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.type !== 'mixed-model-result' || typeof record.requestId !== 'string') return false
  if (typeof record.result !== 'object' || record.result === null) return false
  const result = record.result as Record<string, unknown>
  return typeof result.status === 'string'
}
```

- [ ] **Step 4: Create the minimal worker stub**

Create `src/core/mixedModel/webr.worker.ts` so Task 4 can build before the real webR implementation exists:

```ts
import { MIXED_MODEL_FORMULA, type MixedModelFailure } from './types'
import type { MixedModelWorkerRequest, MixedModelWorkerResponse } from './workerProtocol'

self.onmessage = (event: MessageEvent<MixedModelWorkerRequest>) => {
  const request = event.data
  if (request.type !== 'run-mixed-model') return
  const result: MixedModelFailure = {
    status: 'unsupported',
    engine: request.engine,
    stage: 'runtime-load',
    code: 'WEBR_WORKER_STUB',
    message: 'webR worker implementation is added in the next task.',
    warnings: [],
    metadata: {
      engine: request.engine,
      formula: MIXED_MODEL_FORMULA,
      datasetId: request.datasetId,
      fitConfigHash: request.fitConfigHash,
      wasmAssetSource: request.wasmAssetSource,
    },
  }
  const response: MixedModelWorkerResponse = { type: 'mixed-model-result', requestId: request.requestId, result }
  self.postMessage(response)
}
```

- [ ] **Step 5: Implement browser client**

Create `src/core/mixedModel/browserClient.ts`:

```ts
import { MIXED_MODEL_FORMULA, MIXED_MODEL_TIMEOUT_MS, type MixedModelEngine, type MixedModelFailure, type MixedModelResult, type MixedModelSpikeRow } from './types'
import { isMixedModelWorkerResponse, type MixedModelWorkerRequest } from './workerProtocol'

export interface RunMixedModelWorkerJobOptions {
  rows: MixedModelSpikeRow[]
  engine: MixedModelEngine
  datasetId?: string
  fitConfigHash?: string
  timeoutMs?: number
  signal?: AbortSignal
  wasmAssetSource?: 'cdn' | 'self-hosted' | 'local-dev'
  createWorker?: () => Worker
}

export function runMixedModelWorkerJob(options: RunMixedModelWorkerJobOptions): Promise<MixedModelResult> {
  const timeoutMs = options.timeoutMs ?? MIXED_MODEL_TIMEOUT_MS
  const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = options.createWorker?.() ?? new Worker(new URL('./webr.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      resolve(failure(options.engine, 'runtime-error', 'worker-load', 'WORKER_CONSTRUCTION_FAILED', error instanceof Error ? error.message : String(error), options.wasmAssetSource ?? 'cdn'))
      return
    }

    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (result: MixedModelResult) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      worker.terminate()
      resolve(result)
    }

    const onAbort = () => {
      finish(failure(options.engine, 'cancelled', 'fit', 'WORKER_CANCELLED', 'Mixed-model worker job was cancelled.'))
    }

    if (options.signal?.aborted) {
      finish(failure(options.engine, 'cancelled', 'fit', 'WORKER_CANCELLED', 'Mixed-model worker job was cancelled.'))
      return
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    timer = setTimeout(() => {
      finish(failure(options.engine, 'timeout', 'fit', 'WORKER_TIMEOUT', `Mixed-model worker exceeded ${timeoutMs} ms.`))
    }, timeoutMs)

    worker.onmessage = (event: MessageEvent) => {
      if (!isMixedModelWorkerResponse(event.data) || event.data.requestId !== requestId) return
      finish(event.data.result)
    }

    worker.onerror = (event: ErrorEvent) => {
      finish(failure(options.engine, 'runtime-error', 'worker-load', 'WORKER_ERROR', event.message || 'Mixed-model worker failed.'))
    }

    const request: MixedModelWorkerRequest = {
      type: 'run-mixed-model',
      requestId,
      engine: options.engine,
      rows: options.rows,
      datasetId: options.datasetId ?? 'ad-hoc',
      fitConfigHash: options.fitConfigHash ?? 'unknown',
      wasmAssetSource: options.wasmAssetSource ?? 'cdn',
    }
    worker.postMessage(request)
  })
}

function failure(
  engine: MixedModelEngine,
  status: MixedModelFailure['status'],
  stage: MixedModelFailure['stage'],
  code: string,
  message: string,
  wasmAssetSource: 'cdn' | 'self-hosted' | 'local-dev' = 'cdn',
): MixedModelFailure {
  return {
    status,
    engine,
    stage,
    code,
    message,
    warnings: [],
    metadata: {
      engine,
      formula: MIXED_MODEL_FORMULA,
      browserUserAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
      wasmAssetSource,
    },
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
pnpm vitest run tests/core/mixedModel/browserClient.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/mixedModel/workerProtocol.ts src/core/mixedModel/browserClient.ts src/core/mixedModel/webr.worker.ts tests/core/mixedModel/browserClient.test.ts
git commit -m "feat: add mixed model worker client"
```

## Task 5: webR Worker Spike

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/core/mixedModel/webr.worker.ts`
- Test: `tests/core/mixedModel/workerProtocol.test.ts`

- [ ] **Step 1: Install webR**

Run:

```bash
pnpm add webr
```

Expected: `package.json` includes `"webr": "^0.6.0"` or newer, and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Write failing protocol guard tests**

Create `tests/core/mixedModel/workerProtocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isMixedModelWorkerResponse } from '../../../src/core/mixedModel/workerProtocol'

describe('isMixedModelWorkerResponse', () => {
  it('accepts mixed-model worker responses and rejects unrelated messages', () => {
    expect(isMixedModelWorkerResponse({
      type: 'mixed-model-result',
      requestId: 'req-1',
      result: { status: 'unsupported' },
    })).toBe(true)
    expect(isMixedModelWorkerResponse({ type: 'other', requestId: 'req-1', result: {} })).toBe(false)
    expect(isMixedModelWorkerResponse(null)).toBe(false)
  })
})
```

- [ ] **Step 3: Replace the worker stub with the webR worker**

Create `src/core/mixedModel/webr.worker.ts`:

```ts
import { WebR } from 'webr'
import { hashMixedModelInput, validateMixedModelRows } from './validation'
import { MIXED_MODEL_FORMULA, MIXED_MODEL_TOLERANCE, type MixedModelEngine, type MixedModelFailure, type MixedModelMetadata, type MixedModelResult, type MixedModelSpikeRow } from './types'
import type { MixedModelWorkerRequest, MixedModelWorkerResponse } from './workerProtocol'

let webRPromise: Promise<WebR> | null = null

self.onmessage = async (event: MessageEvent<MixedModelWorkerRequest>) => {
  const request = event.data
  if (request.type !== 'run-mixed-model') return
  const result = await runWebRMixedModel(request).catch((error: unknown) => failure(
    request.engine,
    'runtime-error',
    'fit',
    'UNHANDLED_WORKER_ERROR',
    error instanceof Error ? error.message : String(error),
    request.rows,
    request.datasetId,
    request.fitConfigHash,
    [],
    request.wasmAssetSource,
  ))
  const response: MixedModelWorkerResponse = { type: 'mixed-model-result', requestId: request.requestId, result }
  self.postMessage(response)
}

async function runWebRMixedModel(request: MixedModelWorkerRequest): Promise<MixedModelResult> {
  const validation = validateMixedModelRows(request.rows)
  if (!validation.ok) {
    return failure(request.engine, 'fit-error', validation.stage, validation.code, validation.message, request.rows, request.datasetId, request.fitConfigHash, validation.warnings, request.wasmAssetSource)
  }

  if (request.engine !== 'webr-lme4' && request.engine !== 'webr-nlme') {
    return failure(request.engine, 'unsupported', 'runtime-load', 'ENGINE_NOT_IMPLEMENTED', `${request.engine} is not implemented by the webR worker.`, request.rows, request.datasetId, request.fitConfigHash, [], request.wasmAssetSource)
  }

  const webR = await loadWebR()
    .catch((error: unknown) => null)
  if (!webR) {
    return failure(request.engine, 'runtime-error', 'runtime-load', 'WEBR_RUNTIME_LOAD_FAILED', 'webR runtime failed to load.', request.rows, request.datasetId, request.fitConfigHash, [], request.wasmAssetSource)
  }

  const packageName = request.engine === 'webr-lme4' ? 'lme4' : 'nlme'
  try {
    await webR.installPackages([packageName, 'jsonlite'])
    await webR.evalR(`library(${packageName})`)
  } catch (error) {
    return failure(request.engine, 'unsupported', 'package-load', 'PACKAGE_UNAVAILABLE', `${packageName} is unavailable in this webR environment: ${error instanceof Error ? error.message : String(error)}`, request.rows, request.datasetId, request.fitConfigHash, [], request.wasmAssetSource)
  }

  await webR.objs.globalEnv.bind('mm_patient_id', request.rows.map((row) => row.patient_id))
  await webR.objs.globalEnv.bind('mm_egfr', request.rows.map((row) => row.eGFR))
  await webR.objs.globalEnv.bind('mm_time', request.rows.map((row) => row.time_since_baseline))

  const rCode = request.engine === 'webr-lme4' ? lme4Code() : nlmeCode()
  const json = await webR.evalRString(rCode)
    .catch((error: unknown) => failure(request.engine, 'fit-error', 'fit', 'MODEL_FIT_FAILED', error instanceof Error ? error.message : String(error), request.rows, request.datasetId, request.fitConfigHash, [], request.wasmAssetSource))
  if (typeof json !== 'string') return json

  const parsed = parseResultJson(json)
  if (!parsed.ok) {
    return failure(request.engine, 'runtime-error', 'result-extraction', 'RESULT_EXTRACTION_FAILED', parsed.message, request.rows, request.datasetId, request.fitConfigHash, [], request.wasmAssetSource)
  }
  if (!isPayloadShape(parsed.value)) {
    return failure(request.engine, 'runtime-error', 'result-extraction', 'RESULT_SCHEMA_INVALID', 'Mixed-model worker received JSON without the expected result fields.', request.rows, request.datasetId, request.fitConfigHash, [], request.wasmAssetSource)
  }
  const payload = parsed.value as {
    converged: boolean
    warnings: string[]
    fixed_intercept: number
    fixed_time: number
    random_intercept_sd: number | null
    random_slope_sd: number | null
    random_corr: number | null
    residual_sd: number | null
    package_version: string
    runtime_version: string | null
    optimizer: string | null
  }

  return {
    status: 'success',
    metadata: metadata(request, { [packageName]: payload.package_version }, payload.optimizer, payload.runtime_version),
    converged: payload.converged,
    warnings: payload.warnings,
    nPatients: new Set(request.rows.map((row) => row.patient_id)).size,
    nMeasurements: request.rows.length,
    fixedEffects: { intercept: payload.fixed_intercept, timeSinceBaseline: payload.fixed_time },
    randomEffects: {
      interceptSd: payload.random_intercept_sd,
      slopeSd: payload.random_slope_sd,
      interceptSlopeCorrelation: payload.random_corr,
    },
    residualSd: payload.residual_sd,
  }
}

async function loadWebR(): Promise<WebR> {
  if (!webRPromise) {
    webRPromise = (async () => {
      const webR = new WebR()
      await webR.init()
      return webR
    })()
  }
  return webRPromise
}

function lme4Code(): string {
  return `
    df <- data.frame(patient_id = as.factor(mm_patient_id), eGFR = mm_egfr, time_since_baseline = mm_time)
    warnings_seen <- character()
    fit <- withCallingHandlers(
      lme4::lmer(eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id), data = df, REML = TRUE),
      warning = function(w) { warnings_seen <<- c(warnings_seen, conditionMessage(w)); invokeRestart("muffleWarning") }
    )
    vc <- as.data.frame(lme4::VarCorr(fit))
    singular <- lme4::isSingular(fit)
    intercept_sd <- vc$sdcor[vc$grp == "patient_id" & vc$var1 == "(Intercept)" & is.na(vc$var2)][1]
    slope_sd <- vc$sdcor[vc$grp == "patient_id" & vc$var1 == "time_since_baseline" & is.na(vc$var2)][1]
    corr <- vc$sdcor[vc$grp == "patient_id" & vc$var1 == "(Intercept)" & vc$var2 == "time_since_baseline"][1]
    fixed <- lme4::fixef(fit)
    out <- list(
      converged = length(fit@optinfo$conv$lme4$messages) == 0,
      warnings = c(warnings_seen, fit@optinfo$conv$lme4$messages, if (singular) "singular random-effects fit" else character()),
      fixed_intercept = unname(fixed["(Intercept)"]),
      fixed_time = unname(fixed["time_since_baseline"]),
      random_intercept_sd = ifelse(is.na(intercept_sd), NA, intercept_sd),
      random_slope_sd = ifelse(is.na(slope_sd), NA, slope_sd),
      random_corr = ifelse(is.na(corr), NA, corr),
      residual_sd = sigma(fit),
      package_version = as.character(utils::packageVersion("lme4")),
      runtime_version = paste0("R ", getRversion()),
      optimizer = "lmer-default"
    )
    jsonlite::toJSON(out, auto_unbox = TRUE, na = "null")
  `
}

function nlmeCode(): string {
  return `
    df <- data.frame(patient_id = as.factor(mm_patient_id), eGFR = mm_egfr, time_since_baseline = mm_time)
    warnings_seen <- character()
    fit <- withCallingHandlers(
      nlme::lme(eGFR ~ time_since_baseline, random = ~ time_since_baseline | patient_id, data = df, method = "REML"),
      warning = function(w) { warnings_seen <<- c(warnings_seen, conditionMessage(w)); invokeRestart("muffleWarning") }
    )
    fixed <- nlme::fixef(fit)
    vc <- nlme::VarCorr(fit)
    intercept_sd <- as.numeric(vc["(Intercept)", "StdDev"])
    slope_sd <- as.numeric(vc["time_since_baseline", "StdDev"])
    boundary_warnings <- c(
      if (is.finite(intercept_sd) && intercept_sd < 1e-8) "near-zero random intercept SD" else character(),
      if (is.finite(slope_sd) && slope_sd < 1e-8) "near-zero random slope SD" else character()
    )
    out <- list(
      converged = TRUE,
      warnings = c(warnings_seen, boundary_warnings),
      fixed_intercept = unname(fixed["(Intercept)"]),
      fixed_time = unname(fixed["time_since_baseline"]),
      random_intercept_sd = intercept_sd,
      random_slope_sd = slope_sd,
      random_corr = suppressWarnings(as.numeric(vc["time_since_baseline", "Corr"])),
      residual_sd = as.numeric(vc["Residual", "StdDev"]),
      package_version = as.character(utils::packageVersion("nlme")),
      runtime_version = paste0("R ", getRversion()),
      optimizer = "lme-default"
    )
    jsonlite::toJSON(out, auto_unbox = TRUE, na = "null")
  `
}

function metadata(
  request: MixedModelWorkerRequest,
  packageVersions: Record<string, string>,
  optimizer: string | null,
  runtimeVersion: string | null,
): MixedModelMetadata {
  return {
    engine: request.engine,
    formula: MIXED_MODEL_FORMULA,
    runtimeVersion,
    packageVersions: { jsonlite: 'loaded', ...packageVersions },
    browserUserAgent: typeof navigator === 'undefined' ? 'worker' : navigator.userAgent,
    wasmAssetSource: request.wasmAssetSource,
    optimizer,
    reml: true,
    tolerance: MIXED_MODEL_TOLERANCE,
    datasetId: request.datasetId,
    datasetHash: hashMixedModelInput(request.rows),
    randomSeed: null,
    fitConfigHash: request.fitConfigHash,
  }
}

function parseResultJson(json: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(json) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function isPayloadShape(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.converged === 'boolean'
    && Array.isArray(record.warnings)
    && typeof record.fixed_intercept === 'number'
    && typeof record.fixed_time === 'number'
    && typeof record.package_version === 'string'
}

function failure(
  engine: MixedModelEngine,
  status: MixedModelFailure['status'],
  stage: MixedModelFailure['stage'],
  code: string,
  message: string,
  rows: readonly MixedModelSpikeRow[],
  datasetId: string,
  fitConfigHash: string,
  warnings: string[],
  wasmAssetSource: MixedModelMetadata['wasmAssetSource'] = 'cdn',
): MixedModelFailure {
  return {
    status,
    engine,
    stage,
    code,
    message,
    warnings,
    metadata: {
      engine,
      formula: MIXED_MODEL_FORMULA,
      packageVersions: {},
      browserUserAgent: typeof navigator === 'undefined' ? 'worker' : navigator.userAgent,
      wasmAssetSource,
      datasetId,
      datasetHash: hashMixedModelInput(rows),
      fitConfigHash,
    },
  }
}
```

- [ ] **Step 4: Run protocol and build checks**

Run:

```bash
pnpm vitest run tests/core/mixedModel/workerProtocol.test.ts
pnpm build
```

Expected: protocol test PASS and build PASS. If `jsonlite` or the selected mixed-model package is unavailable in webR at runtime later, keep this build-passing worker and let runtime return `PACKAGE_UNAVAILABLE`, `MODEL_FIT_FAILED`, or `RESULT_EXTRACTION_FAILED`; do not block the app.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/core/mixedModel/webr.worker.ts tests/core/mixedModel/workerProtocol.test.ts
git commit -m "feat: add webR mixed model worker spike"
```

## Task 6: Feature-Gated Debug Panel

**Files:**
- Create: `src/ui/cohort/MixedModelDebugPanel.tsx`
- Modify: `src/ui/cohort/CohortView.tsx`
- Test: `tests/ui/MixedModelDebugPanel.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `tests/ui/MixedModelDebugPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MixedModelDebugPanel } from '../../src/ui/cohort/MixedModelDebugPanel'
import { syntheticMixedModelRows } from '../../src/core/mixedModel/syntheticData'

describe('MixedModelDebugPanel', () => {
  it('runs the injected mixed-model job and renders structured failure output', async () => {
    const runJob = vi.fn().mockResolvedValue({
      status: 'unsupported',
      engine: 'webr-lme4',
      stage: 'package-load',
      code: 'PACKAGE_UNAVAILABLE',
      message: 'lme4 unavailable',
      warnings: [],
      metadata: { engine: 'webr-lme4' },
    })

    render(<MixedModelDebugPanel rows={syntheticMixedModelRows()} runJob={runJob} />)
    await userEvent.click(screen.getByRole('button', { name: /run browser mixed model/i }))

    expect(runJob).toHaveBeenCalledWith(expect.objectContaining({ engine: 'webr-lme4' }))
    expect(await screen.findByText(/PACKAGE_UNAVAILABLE/)).toBeInTheDocument()
    expect(screen.getByText(/lme4 unavailable/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/ui/MixedModelDebugPanel.test.tsx
```

Expected: FAIL because `MixedModelDebugPanel.tsx` does not exist.

- [ ] **Step 3: Implement debug panel**

Create `src/ui/cohort/MixedModelDebugPanel.tsx`:

```tsx
import { useState } from 'react'
import { runMixedModelWorkerJob, type RunMixedModelWorkerJobOptions } from '../../core/mixedModel/browserClient'
import { mixedModelRowsFromCohortInputs } from '../../core/mixedModel/cohortDataset'
import { hashMixedModelInput } from '../../core/mixedModel/validation'
import type { CohortSeriesSpec } from '../../core/cohort/screening'
import type { LabRow, PatientId } from '../../core/types'
import type { MixedModelResult, MixedModelSpikeRow } from '../../core/mixedModel/types'

interface MixedModelDebugPanelProps {
  rows?: MixedModelSpikeRow[]
  sourceRows?: LabRow[]
  patientIds?: PatientId[]
  spec?: CohortSeriesSpec
  runJob?: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
}

export function MixedModelDebugPanel({ rows, sourceRows, patientIds, spec, runJob = runMixedModelWorkerJob }: MixedModelDebugPanelProps) {
  const [result, setResult] = useState<MixedModelResult | null>(null)
  const [running, setRunning] = useState(false)
  const modelRows = rows ?? (sourceRows && patientIds && spec ? mixedModelRowsFromCohortInputs(sourceRows, patientIds, spec) : [])

  async function run() {
    setRunning(true)
    try {
      setResult(await runJob({
        rows: modelRows,
        engine: 'webr-lme4',
        datasetId: 'cohort-debug',
        fitConfigHash: hashMixedModelInput(modelRows),
      }))
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="cohort-card" aria-label="Browser mixed model spike">
      <div className="cohort-exports">
        <button onClick={run} disabled={running || modelRows.length === 0}>
          {running ? 'Running browser mixed model...' : 'Run browser mixed model'}
        </button>
        <span className="export-hint">{modelRows.length} model row(s), exploratory spike only</span>
      </div>
      {result && (
        <pre className="export-hint" data-testid="mixed-model-result">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Wire panel behind env flag**

Modify `src/ui/cohort/CohortView.tsx`.

Change the React import:

```ts
import { lazy, Suspense, useMemo } from 'react'
```

Add imports:

```ts
import { isEgfrUnit } from '../../core/analysis/rapidEgfrDeclineModule'
```

Add this module-level lazy import below the type declarations:

```ts
const MixedModelDebugPanel = lazy(() =>
  import('./MixedModelDebugPanel').then((module) => ({ default: module.MixedModelDebugPanel })),
)
```

Inside `CohortView`, after `sorted` is defined, add:

```ts
  const mixedModelSeriesIndex = useMemo(
    () => specs.findIndex((spec) => spec.bezeichnung.toLowerCase().includes('egfr') || isEgfrUnit(spec.einheit)),
    [specs],
  )
```

In the table display branch, directly after the cohort export button block, render:

```tsx
          {import.meta.env.VITE_MIXED_MODEL_SPIKE === 'true' && (
            <Suspense fallback={null}>
              {mixedModelSeriesIndex >= 0 && (
                <MixedModelDebugPanel sourceRows={displayRows} patientIds={patientIds} spec={specs[mixedModelSeriesIndex]} />
              )}
            </Suspense>
          )}
```

- [ ] **Step 5: Run UI tests**

Run:

```bash
pnpm vitest run tests/ui/MixedModelDebugPanel.test.tsx tests/ui/CohortView.test.tsx
```

Expected: PASS. Existing `CohortView` tests should not see the panel because the env flag is not set.

- [ ] **Step 6: Commit**

```bash
git add src/ui/cohort/MixedModelDebugPanel.tsx src/ui/cohort/CohortView.tsx tests/ui/MixedModelDebugPanel.test.tsx
git commit -m "feat: add mixed model spike debug panel"
```

## Task 7: Spike Verification and Documentation Update

**Files:**
- Modify: `docs/superpowers/specs/2026-06-25-browser-mixed-model-spike-design.md`
- Test: full test/build commands

- [ ] **Step 1: Run focused mixed-model tests**

Run:

```bash
pnpm vitest run tests/core/mixedModel tests/ui/MixedModelDebugPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run broader regression tests**

Run:

```bash
pnpm vitest run tests/core/cohort/screening.test.ts tests/ui/CohortView.test.tsx tests/ui/exports.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test
pnpm build
```

Expected: both commands PASS.

- [ ] **Step 4: Manual browser spike check**

Run:

```bash
VITE_MIXED_MODEL_SPIKE=true pnpm dev
```

Open the printed local URL, load the test dataset, switch to the cohort table, and click `Run browser mixed model`.

Expected acceptable outcomes:

- `status: "success"` with fixed effects, random-effect SDs, residual SD, metadata, and warnings; or
- `status: "unsupported"` / `status: "runtime-error"` with structured `stage`, `code`, `message`, and metadata.

Expected unacceptable outcomes:

- app crash
- frozen UI
- patient/cohort state cleared by worker failure
- unhandled promise rejection in console

- [ ] **Step 5: Record measured outcome in the spec**

Append a completed `## Spike Result` section to `docs/superpowers/specs/2026-06-25-browser-mixed-model-spike-design.md`. The section must contain these exact labels with measured values from Step 4:

```md
## Spike Result

Measured on: Safari 18, laptop-class development machine

- Engine attempted: webR + lme4
- Runtime/package load result: PACKAGE_UNAVAILABLE
- Runtime cold-load time: not measured
- Package-load time: not measured
- Fit time after package load: not measured
- Approximate downloaded asset size: not measured
- Result status: unsupported
- Product-gate assessment: not viable for product default

No model-ready patient rows or patient identifiers were sent to a remote analysis service during this check.
```

If Step 4 produces a different actual browser, status, timing, or gate result, replace the value after the colon while keeping every label. If package loading fails before timing can be read, use `not measured` for timing values that did not occur.

- [ ] **Step 6: Commit verification notes**

```bash
git add docs/superpowers/specs/2026-06-25-browser-mixed-model-spike-design.md
git commit -m "docs: record browser mixed model spike result"
```

## Self-Review Checklist

- Spec coverage: contracts, validation, worker failures, privacy, reproducibility metadata, feature gate, and decision gates are covered by Tasks 1-7.
- Placeholder scan: this plan must not contain open placeholder markers, deferred-work phrasing, or unnamed files.
- Type consistency: `MixedModelSpikeRow`, `MixedModelResult`, `MixedModelFailure`, `MixedModelMetadata`, and `CohortSlopeApproximationResult` match the design spec.
- Existing behavior: existing patient-level fit models are not modified; the debug panel is hidden unless `VITE_MIXED_MODEL_SPIKE=true`.
