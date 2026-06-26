# Mixed Model Product Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden browser mixed-model debug panel with a clear cohort result block and an optional overlay model line.

**Architecture:** Keep one shared model-ready dataset path and one shared current result identity. The cohort result block owns fitting and display; the store holds the current mixed-model result and overlay toggle so `CohortTrajectoryOverlay` can draw the same result only when it still matches the active dataset identity.

**Tech Stack:** React, TypeScript, Zustand, Observable Plot, Vitest, Testing Library, existing browser worker/webR mixed-model engine.

---

## Files

- Create: `src/core/mixedModel/resultIdentity.ts`
  - Owns stable identity construction, hash comparison, and overlay line point derivation.
- Create: `tests/core/mixedModel/resultIdentity.test.ts`
  - Tests result identity and fixed-effect line derivation.
- Create: `src/ui/cohort/CohortMixedModelPanel.tsx`
  - Product-facing cohort mixed-model panel. Replaces raw JSON display.
- Create: `tests/ui/CohortMixedModelPanel.test.tsx`
  - Tests formatted success, validation disabled state, warning display, failure display, abort-on-unmount.
- Modify: `src/ui/state/store.ts`
  - Adds current mixed-model result state, identity, overlay toggle, and clearing behavior.
- Modify: `src/ui/cohort/CohortView.tsx`
  - Replaces `MixedModelDebugPanel` usage with `CohortMixedModelPanel`, feature-gated for now.
- Modify: `src/ui/cohort/CohortTrajectoryOverlay.tsx`
  - Adds optional current mixed-model mean line when active series/data identity matches.
- Modify: `src/ui/app.css`
  - Adds compact styles for the result block and overlay line controls.
- Modify: `tests/ui/CohortTrajectoryOverlay.test.tsx`
  - Tests overlay line visibility and invalidation behavior.
- Modify: `tests/ui/state/store.test.ts`
  - Tests mixed-model result storage, toggle, and clearing.
- Delete after replacement: `src/ui/cohort/MixedModelDebugPanel.tsx`
- Delete after replacement: `tests/ui/MixedModelDebugPanel.test.tsx`

## Task 1: Core Result Identity And Mean Line

**Files:**
- Create: `src/core/mixedModel/resultIdentity.ts`
- Test: `tests/core/mixedModel/resultIdentity.test.ts`

- [ ] **Step 1: Write the failing result identity tests**

Create `tests/core/mixedModel/resultIdentity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildMixedModelResultIdentity,
  mixedModelIdentityEquals,
  mixedModelMeanLinePoints,
} from '../../src/core/mixedModel/resultIdentity'
import type { MixedModelSpikeRow, MixedModelSuccess } from '../../src/core/mixedModel/types'

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

  it('detects changed fit config or series identity', () => {
    const current = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['p1', 'p2', 'p3'],
      rows,
      fitConfigHash: 'fit12345',
    })
    const changed = buildMixedModelResultIdentity({
      seriesIndex: 1,
      seriesKey: 'Creatinine|mg/dl',
      patientIds: ['p1', 'p2', 'p3'],
      rows,
      fitConfigHash: 'fit12345',
    })

    expect(mixedModelIdentityEquals(current, changed)).toBe(false)
  })

  it('derives fixed-effect mean line points over the model row time range', () => {
    expect(mixedModelMeanLinePoints(success, rows)).toEqual([
      { time_since_baseline: 0, eGFR: 62 },
      { time_since_baseline: 2, eGFR: 57 },
    ])
  })
})
```

- [ ] **Step 2: Run the failing core test**

Run:

```bash
pnpm vitest run tests/core/mixedModel/resultIdentity.test.ts
```

Expected: FAIL because `src/core/mixedModel/resultIdentity.ts` does not exist.

- [ ] **Step 3: Implement result identity helpers**

Create `src/core/mixedModel/resultIdentity.ts`:

```ts
import { comparePatientIds } from '../types'
import { hashMixedModelInput, hashString, roundTo10Decimals } from './validation'
import type { MixedModelSpikeRow, MixedModelSuccess } from './types'

export interface MixedModelResultIdentity {
  seriesIndex: number
  seriesKey: string
  patientIdsHash: string
  datasetHash: string
  fitConfigHash: string
  nPatients: number
  nMeasurements: number
}

export interface MixedModelResultIdentityInput {
  seriesIndex: number
  seriesKey: string
  patientIds: readonly string[]
  rows: readonly MixedModelSpikeRow[]
  fitConfigHash: string
}

export interface MixedModelMeanLinePoint {
  time_since_baseline: number
  eGFR: number
}

export function buildMixedModelResultIdentity({
  seriesIndex,
  seriesKey,
  patientIds,
  rows,
  fitConfigHash,
}: MixedModelResultIdentityInput): MixedModelResultIdentity {
  const sortedPatientIds = [...new Set(patientIds)].sort(comparePatientIds)
  const modelPatientIds = new Set(rows.map((row) => row.patient_id))
  return {
    seriesIndex,
    seriesKey,
    patientIdsHash: hashString(JSON.stringify(sortedPatientIds)),
    datasetHash: hashMixedModelInput(rows),
    fitConfigHash,
    nPatients: modelPatientIds.size,
    nMeasurements: rows.length,
  }
}

export function mixedModelIdentityEquals(
  a: MixedModelResultIdentity | null,
  b: MixedModelResultIdentity | null,
): boolean {
  return Boolean(
    a &&
    b &&
    a.seriesIndex === b.seriesIndex &&
    a.seriesKey === b.seriesKey &&
    a.patientIdsHash === b.patientIdsHash &&
    a.datasetHash === b.datasetHash &&
    a.fitConfigHash === b.fitConfigHash &&
    a.nPatients === b.nPatients &&
    a.nMeasurements === b.nMeasurements,
  )
}

export function mixedModelMeanLinePoints(
  result: MixedModelSuccess,
  rows: readonly MixedModelSpikeRow[],
): MixedModelMeanLinePoint[] {
  if (rows.length === 0) return []
  const times = rows.map((row) => row.time_since_baseline)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || minTime === maxTime) return []
  const { intercept, timeSinceBaseline } = result.fixedEffects
  return [minTime, maxTime].map((time) => ({
    time_since_baseline: roundTo10Decimals(time),
    eGFR: roundTo10Decimals(intercept + timeSinceBaseline * time),
  }))
}
```

- [ ] **Step 4: Run the core test**

Run:

```bash
pnpm vitest run tests/core/mixedModel/resultIdentity.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/mixedModel/resultIdentity.ts tests/core/mixedModel/resultIdentity.test.ts
git commit -m "feat: add mixed model result identity"
```

## Task 2: Store Current Mixed-Model Result

**Files:**
- Modify: `src/ui/state/store.ts`
- Test: `tests/ui/state/store.test.ts`

- [ ] **Step 1: Write failing store tests**

Append to `tests/ui/state/store.test.ts`:

```ts
import type { MixedModelResult } from '../../../src/core/mixedModel/types'
import type { MixedModelResultIdentity } from '../../../src/core/mixedModel/resultIdentity'
```

Add these tests inside the existing store `describe` block:

```ts
  it('stores and clears the current mixed model result', () => {
    const identity: MixedModelResultIdentity = {
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIdsHash: 'patients',
      datasetHash: 'dataset',
      fitConfigHash: 'fit',
      nPatients: 3,
      nMeasurements: 6,
    }
    const result: MixedModelResult = {
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
      randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
      residualSd: null,
    }

    useAppStore.getState().setMixedModelResult({ result, identity })

    expect(useAppStore.getState().mixedModelResult?.result).toBe(result)
    expect(useAppStore.getState().mixedModelResult?.identity).toEqual(identity)

    useAppStore.getState().clearMixedModelResult()

    expect(useAppStore.getState().mixedModelResult).toBeNull()
  })

  it('toggles the cohort mixed model overlay line', () => {
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
    useAppStore.getState().setShowCohortMixedModelLine(true)
    expect(useAppStore.getState().showCohortMixedModelLine).toBe(true)
  })
```

- [ ] **Step 2: Run the failing store tests**

Run:

```bash
pnpm vitest run tests/ui/state/store.test.ts
```

Expected: FAIL because `mixedModelResult`, `setMixedModelResult`, `clearMixedModelResult`, and `showCohortMixedModelLine` are not defined.

- [ ] **Step 3: Add mixed-model state and actions**

Modify `src/ui/state/store.ts` imports:

```ts
import type { MixedModelResult } from '../../core/mixedModel/types'
import type { MixedModelResultIdentity } from '../../core/mixedModel/resultIdentity'
```

Add near `Notice`:

```ts
export interface StoredMixedModelResult {
  result: MixedModelResult
  identity: MixedModelResultIdentity
}
```

Add to `AppState`:

```ts
  mixedModelResult: StoredMixedModelResult | null
  showCohortMixedModelLine: boolean
  setMixedModelResult: (value: StoredMixedModelResult) => void
  clearMixedModelResult: () => void
  setShowCohortMixedModelLine: (value: boolean) => void
```

Add both fields to the `AppData` pick and `initialState()`:

```ts
    mixedModelResult: null,
    showCohortMixedModelLine: false,
```

Add actions inside `create<AppState>`:

```ts
  setMixedModelResult: (value) => set({ mixedModelResult: value }),
  clearMixedModelResult: () => set({ mixedModelResult: null, showCohortMixedModelLine: false }),
  setShowCohortMixedModelLine: (value) => set({ showCohortMixedModelLine: value }),
```

Clear stale results in state-changing actions that affect model identity:

```ts
  setDataset: (rows, fileName) => {
    const ids = [...new Set(rows.map((r) => r.patientId))].sort(comparePatientIds)
    set((s) => ({
      rows,
      fileName: fileName ?? null,
      selectedPatientId: ids[0] ?? null,
      selectedPatientIds: ids,
      view: 'cohort',
      returnToCohort: false,
      events: [],
      mixedModelResult: null,
      showCohortMixedModelLine: false,
      ...analysisSettingsState({ ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, source: null } }),
    }))
    if (get().persist) void saveDataset(rows, fileName ?? null)
  },
```

Update these setters to clear the current result:

```ts
  setSelectedPatientIds: (ids) => set({
    selectedPatientIds: [...new Set(ids)].sort(comparePatientIds),
    mixedModelResult: null,
    showCohortMixedModelLine: false,
  }),
  setSeriesConfig: (index, cfg) =>
    set((s) => ({
      mixedModelResult: null,
      showCohortMixedModelLine: false,
      seriesConfigs: s.seriesConfigs.map((c, i) => {
        if (i !== index) return c
        const next = { ...c, ...cfg }
        if ('bezeichnung' in cfg || 'einheit' in cfg) {
          next.fitConfig = { ...next.fitConfig, parameter: parameterForSeries(next) }
        }
        return next
      }),
    })),
  removeSeries: (index) =>
    set((s) => (s.seriesConfigs.length <= 1 ? s : {
      mixedModelResult: null,
      showCohortMixedModelLine: false,
      seriesConfigs: s.seriesConfigs.filter((_, i) => i !== index),
    })),
  setEvents: (events) => set({ events, mixedModelResult: null, showCohortMixedModelLine: false }),
  setSeriesFitPreset: (index, preset) =>
    set((s) => ({
      mixedModelResult: null,
      showCohortMixedModelLine: false,
      seriesConfigs: s.seriesConfigs.map((c, i) => {
        if (i !== index) return c
        const fitConfig = fitConfigForPreset(preset, parameterForSeries(c))
        return {
          ...c,
          fitConfig,
          mode: modeForFitModel(fitConfig.fitModel),
          exclusionDays: fitConfig.exclusions.akiExclusionDays,
        }
      }),
    })),
  setSeriesFitConfig: (index, patch) =>
    set((s) => ({
      mixedModelResult: null,
      showCohortMixedModelLine: false,
      seriesConfigs: s.seriesConfigs.map((c, i) => {
        if (i !== index) return c
        const fitConfig = patchedFitConfig(c.fitConfig, patch)
        return {
          ...c,
          fitConfig,
          mode: patch.fitModel ? modeForFitModel(patch.fitModel) : c.mode,
          exclusionDays: fitConfig.exclusions.akiExclusionDays,
        }
      }),
    })),
```

Also clear on analysis settings that can change eGFR or AKI fit inputs:

```ts
  setEgfrFormula: (f) => set((s) => ({
    ...analysisSettingsState({ ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, formula: f } }),
    mixedModelResult: null,
    showCohortMixedModelLine: false,
  })),
  setEgfrSource: (src) => set((s) => ({
    ...analysisSettingsState({ ...s.analysisSettings, egfr: { ...s.analysisSettings.egfr, source: src } }),
    mixedModelResult: null,
    showCohortMixedModelLine: false,
  })),
  setManualDemographics: (patientId, demo) => set((s) => ({
    manualDemographics: { ...s.manualDemographics, [patientId]: demo },
    mixedModelResult: null,
    showCohortMixedModelLine: false,
  })),
  setShowAki: (v) => set((s) => ({
    ...analysisSettingsState({
      ...s.analysisSettings,
      aki: { ...s.analysisSettings.aki, showOverlays: v },
    }),
    mixedModelResult: null,
    showCohortMixedModelLine: false,
  })),
```

- [ ] **Step 4: Run store tests**

Run:

```bash
pnpm vitest run tests/ui/state/store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/state/store.ts tests/ui/state/store.test.ts
git commit -m "feat: store current mixed model result"
```

## Task 3: Product Cohort Mixed-Model Panel

**Files:**
- Create: `src/ui/cohort/CohortMixedModelPanel.tsx`
- Test: `tests/ui/CohortMixedModelPanel.test.tsx`
- Delete: `src/ui/cohort/MixedModelDebugPanel.tsx`
- Delete: `tests/ui/MixedModelDebugPanel.test.tsx`

- [ ] **Step 1: Write failing panel tests**

Create `tests/ui/CohortMixedModelPanel.test.tsx`:

```tsx
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CohortMixedModelPanel } from '../../src/ui/cohort/CohortMixedModelPanel'
import { syntheticMixedModelRows } from '../../src/core/mixedModel/syntheticData'
import type { RunMixedModelWorkerJobOptions } from '../../src/core/mixedModel/browserClient'
import type { MixedModelResult, MixedModelSpikeRow } from '../../src/core/mixedModel/types'

const successResult: MixedModelResult = {
  status: 'success',
  metadata: {
    engine: 'webr-lme4',
    formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
    runtimeVersion: '4.6.0',
    packageVersions: { lme4: '2.0.1' },
    browserUserAgent: 'test-agent',
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
  warnings: ['boundary (singular) fit'],
  nPatients: 4,
  nMeasurements: 16,
  fixedEffects: { intercept: 59.9364, timeSinceBaseline: -3.2675 },
  randomEffects: { interceptSd: 14.5951, slopeSd: 11.0274, interceptSlopeCorrelation: -0.7383 },
  residualSd: 4.8844,
}

describe('CohortMixedModelPanel', () => {
  it('runs the injected job and renders formatted success metrics', async () => {
    const runJob = vi.fn().mockResolvedValue(successResult)
    const onResult = vi.fn()

    render(
      <CohortMixedModelPanel
        rows={syntheticMixedModelRows()}
        seriesIndex={0}
        seriesLabel="eGFR (ml/min/1.73m2)"
        seriesUnit="ml/min/1.73m2"
        seriesKey="eGFR|ml/min/1.73m2"
        patientIds={['p1', 'p2', 'p3', 'p4']}
        runJob={runJob}
        onResult={onResult}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /fit cohort model/i }))

    expect(runJob).toHaveBeenCalledWith(expect.objectContaining({ engine: 'webr-lme4' }))
    expect(await screen.findByText('-3.27 ml/min/1.73m2/yr')).toBeInTheDocument()
    expect(screen.getByText('59.94 ml/min/1.73m2')).toBeInTheDocument()
    expect(screen.getByText('4 / 16')).toBeInTheDocument()
    expect(screen.getByText(/random intercept \+ random slope/i)).toBeInTheDocument()
    expect(screen.getByText(/boundary \(singular\) fit/i)).toBeInTheDocument()
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ result: successResult }))
  })

  it('disables fitting and explains validation failures', () => {
    const tooFewPatients: MixedModelSpikeRow[] = [
      { patient_id: 'p1', eGFR: 60, time_since_baseline: 0 },
      { patient_id: 'p1', eGFR: 58, time_since_baseline: 1 },
    ]

    render(
      <CohortMixedModelPanel
        rows={tooFewPatients}
        seriesIndex={0}
        seriesLabel="eGFR"
        seriesUnit={null}
        seriesKey="eGFR|"
        patientIds={['p1']}
        runJob={vi.fn()}
        onResult={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /fit cohort model/i })).toBeDisabled()
    expect(screen.getByText(/requires at least 3 patients/i)).toBeInTheDocument()
  })

  it('renders concise failure details when the worker rejects', async () => {
    const runJob = vi.fn().mockRejectedValue(new Error('worker crashed'))

    render(
      <CohortMixedModelPanel
        rows={syntheticMixedModelRows()}
        seriesIndex={0}
        seriesLabel="eGFR"
        seriesUnit={null}
        seriesKey="eGFR|"
        patientIds={['p1', 'p2', 'p3', 'p4']}
        runJob={runJob}
        onResult={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /fit cohort model/i }))

    expect(await screen.findByText(/Fit failed/i)).toBeInTheDocument()
    expect(screen.getByText(/worker crashed/i)).toBeInTheDocument()
  })

  it('aborts the active job on unmount', async () => {
    let signal: AbortSignal | undefined
    const runJob = vi.fn((options: RunMixedModelWorkerJobOptions) => {
      signal = options.signal
      return new Promise<never>(() => undefined)
    })

    const { unmount } = render(
      <CohortMixedModelPanel
        rows={syntheticMixedModelRows()}
        seriesIndex={0}
        seriesLabel="eGFR"
        seriesUnit={null}
        seriesKey="eGFR|"
        patientIds={['p1', 'p2', 'p3', 'p4']}
        runJob={runJob}
        onResult={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /fit cohort model/i }))
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('recovers the button after StrictMode effect replay', async () => {
    const runJob = vi.fn().mockResolvedValue(successResult)

    render(
      <StrictMode>
        <CohortMixedModelPanel
          rows={syntheticMixedModelRows()}
          seriesIndex={0}
          seriesLabel="eGFR"
          seriesUnit={null}
          seriesKey="eGFR|"
          patientIds={['p1', 'p2', 'p3', 'p4']}
          runJob={runJob}
          onResult={vi.fn()}
        />
      </StrictMode>,
    )

    await userEvent.click(screen.getByRole('button', { name: /fit cohort model/i }))
    expect(await screen.findByText(/Converged/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fit cohort model/i })).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run failing panel tests**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelPanel.test.tsx
```

Expected: FAIL because `CohortMixedModelPanel` does not exist.

- [ ] **Step 3: Implement `CohortMixedModelPanel`**

Create `src/ui/cohort/CohortMixedModelPanel.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  disposeMixedModelWorker,
  runMixedModelWorkerJob,
  type RunMixedModelWorkerJobOptions,
} from '../../core/mixedModel/browserClient'
import {
  MIXED_MODEL_FORMULA,
  MIXED_MODEL_TOLERANCE,
  type MixedModelFailure,
  type MixedModelResult,
  type MixedModelSpikeRow,
} from '../../core/mixedModel/types'
import {
  buildMixedModelResultIdentity,
  mixedModelIdentityEquals,
  type MixedModelResultIdentity,
} from '../../core/mixedModel/resultIdentity'
import { hashString, validateMixedModelRows } from '../../core/mixedModel/validation'
import type { StoredMixedModelResult } from '../state/store'

const FIT_CONFIG_HASH = hashString(
  JSON.stringify({ engine: 'webr-lme4', formula: MIXED_MODEL_FORMULA, reml: true, tolerance: MIXED_MODEL_TOLERANCE }),
)

interface CohortMixedModelPanelProps {
  rows: MixedModelSpikeRow[]
  seriesIndex: number
  seriesLabel: string
  seriesUnit: string | null
  seriesKey: string
  patientIds: string[]
  currentIdentity?: MixedModelResultIdentity | null
  currentResult?: MixedModelResult | null
  showOverlayLine?: boolean
  onResult: (value: StoredMixedModelResult) => void
  onToggleOverlayLine?: (value: boolean) => void
  runJob?: (options: RunMixedModelWorkerJobOptions) => Promise<MixedModelResult>
}

export function CohortMixedModelPanel({
  rows,
  seriesIndex,
  seriesLabel,
  seriesUnit,
  seriesKey,
  patientIds,
  currentIdentity,
  currentResult,
  showOverlayLine = false,
  onResult,
  onToggleOverlayLine,
  runJob = runMixedModelWorkerJob,
}: CohortMixedModelPanelProps) {
  const [localResult, setLocalResult] = useState<MixedModelResult | null>(currentResult ?? null)
  const [running, setRunning] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const validation = useMemo(() => validateMixedModelRows(rows), [rows])
  const identity = useMemo(
    () => buildMixedModelResultIdentity({ seriesIndex, seriesKey, patientIds, rows, fitConfigHash: FIT_CONFIG_HASH }),
    [seriesIndex, seriesKey, patientIds, rows],
  )
  const displayedResult = mixedModelIdentityEquals(currentIdentity ?? null, identity) ? currentResult ?? localResult : localResult

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      disposeMixedModelWorker()
    }
  }, [])

  async function run() {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setRunning(true)
    try {
      const nextResult = await runJob({
        rows,
        engine: 'webr-lme4',
        datasetId: 'cohort',
        fitConfigHash: FIT_CONFIG_HASH,
        reuseWorker: true,
        signal: controller.signal,
      })
      if (!mountedRef.current || controller.signal.aborted || abortControllerRef.current !== controller) return
      setLocalResult(nextResult)
      onResult({ result: nextResult, identity })
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted || abortControllerRef.current !== controller) return
      const failure: MixedModelFailure = {
        status: 'runtime-error',
        engine: 'webr-lme4',
        stage: 'fit',
        code: 'MIXED_MODEL_JOB_FAILED',
        message: error instanceof Error ? error.message : String(error),
        warnings: [],
        metadata: {
          engine: 'webr-lme4',
          datasetId: 'cohort',
          fitConfigHash: FIT_CONFIG_HASH,
        },
      }
      setLocalResult(failure)
      onResult({ result: failure, identity })
    } finally {
      if (mountedRef.current && abortControllerRef.current === controller) {
        abortControllerRef.current = null
        setRunning(false)
      }
    }
  }

  return (
    <section className="mixed-model-panel" aria-label="Cohort mixed model">
      <div className="mixed-model-panel-header">
        <div>
          <h3>Cohort mixed model</h3>
          <p>{seriesLabel}: {rows.length} model row(s), {identity.nPatients} patient(s)</p>
        </div>
        <button onClick={run} disabled={running || !validation.ok}>
          {running ? 'Fitting cohort model...' : 'Fit cohort model'}
        </button>
      </div>

      {!validation.ok && <p className="mixed-model-message">{validation.message}</p>}
      {validation.ok && !displayedResult && (
        <p className="mixed-model-message">
          Uses selected patients, active series, clinical event censoring, AKI exclusions, and time balancing.
        </p>
      )}

      {displayedResult?.status === 'success' && (
        <>
          <dl className="mixed-model-metrics">
            <div>
              <dt>Mean eGFR slope</dt>
              <dd>{formatNumber(displayedResult.fixedEffects.timeSinceBaseline)} {slopeUnit(seriesUnit)}</dd>
            </div>
            <div>
              <dt>Baseline estimate</dt>
              <dd>{formatNumber(displayedResult.fixedEffects.intercept)} {seriesUnit ?? 'value units'}</dd>
            </div>
            <div>
              <dt>Patients / measurements</dt>
              <dd>{displayedResult.nPatients} / {displayedResult.nMeasurements}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{displayedResult.converged ? 'Converged' : 'Not converged'}</dd>
            </div>
          </dl>
          <p className="mixed-model-message">Model: random intercept + random slope by patient.</p>
          {displayedResult.warnings.length > 0 && (
            <div className="mixed-model-warnings" role="status">
              {displayedResult.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}
          {onToggleOverlayLine && (
            <label className="mixed-model-toggle">
              <input
                type="checkbox"
                checked={showOverlayLine}
                onChange={(event) => onToggleOverlayLine(event.currentTarget.checked)}
              />
              Cohort model line
            </label>
          )}
          <details className="mixed-model-details">
            <summary>Model details</summary>
            <dl>
              <div><dt>Engine</dt><dd>{displayedResult.metadata.engine}</dd></div>
              <div><dt>Formula</dt><dd>{displayedResult.metadata.formula}</dd></div>
              <div><dt>Dataset hash</dt><dd>{displayedResult.metadata.datasetHash}</dd></div>
              <div><dt>Fit config hash</dt><dd>{displayedResult.metadata.fitConfigHash}</dd></div>
              <div><dt>Optimizer</dt><dd>{displayedResult.metadata.optimizer ?? 'unknown'}</dd></div>
            </dl>
          </details>
        </>
      )}

      {displayedResult && displayedResult.status !== 'success' && (
        <div className="mixed-model-failure" role="alert">
          <strong>{failureTitle(displayedResult.status)}</strong>
          <p>{displayedResult.message}</p>
          <p>{displayedResult.code}</p>
        </div>
      )}
    </section>
  )
}

function formatNumber(value: number): string {
  return value.toFixed(2)
}

function slopeUnit(unit: string | null): string {
  return unit ? `${unit}/yr` : 'value units/yr'
}

function failureTitle(status: MixedModelFailure['status']): string {
  if (status === 'timeout') return 'Fit timed out'
  if (status === 'cancelled') return 'Fit cancelled'
  if (status === 'unsupported') return 'Model unsupported'
  return 'Fit failed'
}
```

- [ ] **Step 4: Delete old debug panel files**

```bash
rm src/ui/cohort/MixedModelDebugPanel.tsx tests/ui/MixedModelDebugPanel.test.tsx
```

- [ ] **Step 5: Run panel tests**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/cohort/CohortMixedModelPanel.tsx tests/ui/CohortMixedModelPanel.test.tsx src/ui/cohort/MixedModelDebugPanel.tsx tests/ui/MixedModelDebugPanel.test.tsx
git commit -m "feat: show cohort mixed model result panel"
```

## Task 4: Wire Panel Into Cohort View

**Files:**
- Modify: `src/ui/cohort/CohortView.tsx`
- Test: `tests/ui/CohortView.test.tsx`

- [ ] **Step 1: Write a failing cohort integration test**

Add to `tests/ui/CohortView.test.tsx`:

```tsx
  it('shows the product mixed model panel for an eGFR-like cohort series when enabled', async () => {
    vi.stubEnv('VITE_MIXED_MODEL_SPIKE', 'true')
    useAppStore.getState().setDataset([
      { patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '60', wertNum: 60, labDatum: new Date('2020-01-01'), patientAgeAtLab: 50 },
      { patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '58', wertNum: 58, labDatum: new Date('2021-01-01'), patientAgeAtLab: 51 },
      { patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '62', wertNum: 62, labDatum: new Date('2020-01-01'), patientAgeAtLab: 52 },
      { patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '59', wertNum: 59, labDatum: new Date('2021-01-01'), patientAgeAtLab: 53 },
      { patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '55', wertNum: 55, labDatum: new Date('2020-01-01'), patientAgeAtLab: 54 },
      { patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '51', wertNum: 51, labDatum: new Date('2021-01-01'), patientAgeAtLab: 55 },
    ])
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })

    render(<CohortView />)

    expect(await screen.findByRole('region', { name: /cohort mixed model/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fit cohort model/i })).toBeInTheDocument()

    vi.unstubAllEnvs()
  })
```

- [ ] **Step 2: Run failing cohort test**

Run:

```bash
pnpm vitest run tests/ui/CohortView.test.tsx
```

Expected: FAIL because `CohortView` still imports and renders `MixedModelDebugPanel`.

- [ ] **Step 3: Replace debug panel usage**

Modify `src/ui/cohort/CohortView.tsx` imports:

```tsx
import { lazy, Suspense, useMemo } from 'react'
import { hashString } from '../../core/mixedModel/validation'
import { MIXED_MODEL_FORMULA, MIXED_MODEL_TOLERANCE } from '../../core/mixedModel/types'
import { mixedModelRowsFromCohortInputs } from '../../core/mixedModel/cohortDataset'
```

Replace lazy import:

```tsx
const CohortMixedModelPanel = lazy(() =>
  import('./CohortMixedModelPanel').then((module) => ({ default: module.CohortMixedModelPanel })),
)
```

Add store selectors inside `CohortView()`:

```tsx
  const mixedModelResult = useAppStore((s) => s.mixedModelResult)
  const showCohortMixedModelLine = useAppStore((s) => s.showCohortMixedModelLine)
  const setMixedModelResult = useAppStore((s) => s.setMixedModelResult)
  const setShowCohortMixedModelLine = useAppStore((s) => s.setShowCohortMixedModelLine)
```

Add constants and helpers near `mixedModelSeriesIndex`:

```tsx
  const mixedModelRows = useMemo(
    () => mixedModelSeriesIndex >= 0
      ? mixedModelRowsFromCohortInputs(displayRows, patientIds, specs[mixedModelSeriesIndex])
      : [],
    [displayRows, patientIds, specs, mixedModelSeriesIndex],
  )
  const mixedModelSeriesKey = mixedModelSeriesIndex >= 0
    ? `${specs[mixedModelSeriesIndex].bezeichnung}|${specs[mixedModelSeriesIndex].einheit ?? ''}`
    : ''
```

Pass props where the old panel rendered:

```tsx
          {import.meta.env.VITE_MIXED_MODEL_SPIKE === 'true' && (
            <Suspense fallback={null}>
              {mixedModelSeriesIndex >= 0 && (
                <CohortMixedModelPanel
                  rows={mixedModelRows}
                  seriesIndex={mixedModelSeriesIndex}
                  seriesLabel={seriesLabel(specs[mixedModelSeriesIndex])}
                  seriesUnit={specs[mixedModelSeriesIndex].einheit}
                  seriesKey={mixedModelSeriesKey}
                  patientIds={patientIds.map(String)}
                  currentIdentity={mixedModelResult?.identity ?? null}
                  currentResult={mixedModelResult?.result ?? null}
                  showOverlayLine={showCohortMixedModelLine}
                  onResult={setMixedModelResult}
                  onToggleOverlayLine={setShowCohortMixedModelLine}
                />
              )}
            </Suspense>
          )}
```

- [ ] **Step 4: Run cohort tests**

Run:

```bash
pnpm vitest run tests/ui/CohortView.test.tsx tests/ui/CohortMixedModelPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/cohort/CohortView.tsx tests/ui/CohortView.test.tsx
git commit -m "feat: wire mixed model panel into cohort view"
```

## Task 5: Overlay Mean Line

**Files:**
- Modify: `src/ui/cohort/CohortTrajectoryOverlay.tsx`
- Modify: `tests/ui/CohortTrajectoryOverlay.test.tsx`

- [ ] **Step 1: Write failing overlay line test**

Add these imports to `tests/ui/CohortTrajectoryOverlay.test.tsx`:

```tsx
import { buildMixedModelResultIdentity } from '../../src/core/mixedModel/resultIdentity'
import { mixedModelRowsFromCohortInputs } from '../../src/core/mixedModel/cohortDataset'
import { hashString } from '../../src/core/mixedModel/validation'
import { MIXED_MODEL_FORMULA, MIXED_MODEL_TOLERANCE } from '../../src/core/mixedModel/types'
```

Add to `tests/ui/CohortTrajectoryOverlay.test.tsx`:

```tsx
  it('draws the current mixed model mean line when enabled for the active eGFR series', () => {
    const rows = [
      { patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '60', wertNum: 60, labDatum: new Date('2020-01-01'), patientAgeAtLab: 50 },
      { patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '58', wertNum: 58, labDatum: new Date('2021-01-01'), patientAgeAtLab: 51 },
      { patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '62', wertNum: 62, labDatum: new Date('2020-01-01'), patientAgeAtLab: 52 },
      { patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '59', wertNum: 59, labDatum: new Date('2021-01-01'), patientAgeAtLab: 53 },
      { patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '55', wertNum: 55, labDatum: new Date('2020-01-01'), patientAgeAtLab: 54 },
      { patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '51', wertNum: 51, labDatum: new Date('2021-01-01'), patientAgeAtLab: 55 },
    ]
    useAppStore.getState().setDataset(rows)
    useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
    useAppStore.getState().setCohortOverlayXAxis('time_since_baseline')
    const state = useAppStore.getState()
    const analysisResult = state.analysisResult()
    const spec = {
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      mode: state.seriesConfigs[0].mode,
      gapDays: state.seriesConfigs[0].gapDays,
      windowDays: state.seriesConfigs[0].windowDays,
      stepDays: state.seriesConfigs[0].stepDays,
      cutoffDays: state.seriesConfigs[0].cutoffDays,
      exclusionDays: state.seriesConfigs[0].exclusionDays,
      fitConfig: state.seriesConfigs[0].fitConfig,
      fitInputs: analysisResult.fitInputs,
      clinicalEventsByPatient: {},
    }
    const modelRows = mixedModelRowsFromCohortInputs(analysisResult.rows, ['1', '2', '3'], spec)
    const identity = buildMixedModelResultIdentity({
      seriesIndex: 0,
      seriesKey: 'eGFR|ml/min/1.73m2',
      patientIds: ['1', '2', '3'],
      rows: modelRows,
      fitConfigHash: hashString(JSON.stringify({ engine: 'webr-lme4', formula: MIXED_MODEL_FORMULA, reml: true, tolerance: MIXED_MODEL_TOLERANCE })),
    })
    useAppStore.getState().setMixedModelResult({
      identity,
      result: {
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
          datasetHash: identity.datasetHash,
          randomSeed: null,
          fitConfigHash: identity.fitConfigHash,
        },
        converged: true,
        warnings: [],
        nPatients: 3,
        nMeasurements: 6,
        fixedEffects: { intercept: 60, timeSinceBaseline: -3 },
        randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
        residualSd: null,
      },
    })
    useAppStore.getState().setShowCohortMixedModelLine(true)

    render(<CohortTrajectoryOverlay />)

    const plot = screen.getByTestId('cohort-trajectory-overlay')
    expect(plot.querySelector('[data-testid="cohort-mixed-model-line"]')).toBeInTheDocument()
    expect(plot.textContent).toContain('Mixed model mean')
  })
```

- [ ] **Step 2: Run the failing overlay test**

Run:

```bash
pnpm vitest run tests/ui/CohortTrajectoryOverlay.test.tsx
```

Expected: FAIL because the overlay does not draw mixed-model lines.

- [ ] **Step 3: Implement the overlay line**

Modify imports in `src/ui/cohort/CohortTrajectoryOverlay.tsx`:

```tsx
import { buildMixedModelResultIdentity, mixedModelIdentityEquals, mixedModelMeanLinePoints } from '../../core/mixedModel/resultIdentity'
import { mixedModelRowsFromCohortInputs } from '../../core/mixedModel/cohortDataset'
import { hashString } from '../../core/mixedModel/validation'
import { MIXED_MODEL_FORMULA, MIXED_MODEL_TOLERANCE } from '../../core/mixedModel/types'
```

Add store selectors:

```tsx
  const mixedModelResult = useAppStore((s) => s.mixedModelResult)
  const showCohortMixedModelLine = useAppStore((s) => s.showCohortMixedModelLine)
```

Add clinical events grouping and active model rows:

```tsx
  const clinicalEventsByPatient = useMemo(() => {
    const grouped: Record<string, typeof events> = {}
    for (const event of events) {
      const key = String(event.patientId)
      grouped[key] = [...(grouped[key] ?? []), event]
    }
    return grouped
  }, [events])
  const activeSpec = useMemo(() => activeConfig?.bezeichnung ? {
    bezeichnung: activeConfig.bezeichnung,
    einheit: activeConfig.einheit,
    mode: activeConfig.mode,
    gapDays: activeConfig.gapDays,
    windowDays: activeConfig.windowDays,
    stepDays: activeConfig.stepDays,
    cutoffDays: activeConfig.cutoffDays,
    exclusionDays: activeConfig.exclusionDays,
    fitConfig: activeConfig.fitConfig,
    fitInputs: analysisResult.fitInputs,
    clinicalEventsByPatient,
  } : null, [activeConfig, analysisResult.fitInputs, clinicalEventsByPatient])
  const activeMixedModelRows = useMemo(
    () => activeSpec ? mixedModelRowsFromCohortInputs(rows, scopedPatientIds, activeSpec) : [],
    [rows, scopedPatientIds, activeSpec],
  )
  const activeMixedModelIdentity = useMemo(
    () => activeSpec
      ? buildMixedModelResultIdentity({
        seriesIndex: activeEntry.index,
        seriesKey: `${activeSpec.bezeichnung}|${activeSpec.einheit ?? ''}`,
        patientIds: scopedPatientIds.map(String),
        rows: activeMixedModelRows,
        fitConfigHash: hashString(JSON.stringify({ engine: 'webr-lme4', formula: MIXED_MODEL_FORMULA, reml: true, tolerance: MIXED_MODEL_TOLERANCE })),
      })
      : null,
    [activeSpec, activeEntry?.index, scopedPatientIds, activeMixedModelRows],
  )
  const mixedModelLine = useMemo(
    () => showCohortMixedModelLine &&
      axis === 'time_since_baseline' &&
      mixedModelResult?.result.status === 'success' &&
      mixedModelIdentityEquals(mixedModelResult.identity, activeMixedModelIdentity)
        ? mixedModelMeanLinePoints(mixedModelResult.result, activeMixedModelRows).map((point) => ({
          x: point.time_since_baseline,
          value: point.eGFR,
        }))
        : [],
    [showCohortMixedModelLine, axis, mixedModelResult, activeMixedModelIdentity, activeMixedModelRows],
  )
```

Inside the plotting effect, before `Plot.dot(points, ...)`, add:

```tsx
    if (mixedModelLine.length > 0) {
      marks.push(Plot.line(mixedModelLine, {
        x: 'x',
        y: 'value',
        stroke: '#111827',
        strokeWidth: 2.8,
        strokeDasharray: '6 4',
      }))
      marks.push(Plot.text([{ ...mixedModelLine[mixedModelLine.length - 1], label: 'Mixed model mean' }], {
        x: 'x',
        y: 'value',
        text: 'label',
        dx: 6,
        dy: -6,
        fill: '#111827',
        fontSize: 11,
      }))
    }
```

After `const linePaths = ...`, tag the model path before patient path wiring:

```tsx
    const hasMixedModelLine = mixedModelLine.length > 0
    const modelLinePath = hasMixedModelLine ? linePaths[connectPoints ? 1 : 0] : null
    if (modelLinePath) {
      modelLinePath.dataset.testid = 'cohort-mixed-model-line'
      modelLinePath.setAttribute('aria-label', 'Mixed model mean line')
      modelLinePath.style.pointerEvents = 'none'
    }
```

Then adjust trajectory path slicing so the model path is not treated as a patient path. Keep this exact order:

```tsx
    const patientLinePaths = hasMixedModelLine
      ? linePaths.filter((path) => path !== modelLinePath)
      : linePaths
    const nExclusionSegments = new Set(exclusionSegments.map((segment) => segment.segmentId)).size
    const trajectoryPaths = nExclusionSegments > 0 ? patientLinePaths.slice(0, -nExclusionSegments) : patientLinePaths
    const exclusionPaths = nExclusionSegments > 0 ? patientLinePaths.slice(-nExclusionSegments) : []
```

Add `mixedModelLine` to the plotting effect dependency array.

- [ ] **Step 4: Run overlay tests**

Run:

```bash
pnpm vitest run tests/ui/CohortTrajectoryOverlay.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/cohort/CohortTrajectoryOverlay.tsx tests/ui/CohortTrajectoryOverlay.test.tsx
git commit -m "feat: draw mixed model mean in cohort overlay"
```

## Task 6: Styling And Copy Polish

**Files:**
- Modify: `src/ui/app.css`
- Test: `tests/ui/CohortMixedModelPanel.test.tsx`

- [ ] **Step 1: Add style-sensitive assertions**

Append to the first success test in `tests/ui/CohortMixedModelPanel.test.tsx`:

```tsx
    expect(screen.getByRole('region', { name: /cohort mixed model/i })).toHaveClass('mixed-model-panel')
    expect(screen.getByText(/Uses selected patients/i)).toBeInTheDocument()
```

- [ ] **Step 2: Run the targeted UI test**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelPanel.test.tsx
```

Expected: PASS if the component already renders the class and data-policy text, otherwise FAIL until Step 3 is applied.

- [ ] **Step 3: Add CSS**

Append to the cohort section in `src/ui/app.css`:

```css
.mixed-model-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 0.9rem 1rem;
  margin-bottom: 0.75rem;
  max-width: 960px;
}
.mixed-model-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.mixed-model-panel h3 {
  margin: 0;
  font-size: 15px;
}
.mixed-model-panel p {
  margin: 0.25rem 0 0;
}
.mixed-model-message {
  color: var(--text-2);
  font-size: 13px;
}
.mixed-model-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.6rem;
  margin: 0.85rem 0 0;
}
.mixed-model-metrics div,
.mixed-model-details dl div {
  min-width: 0;
}
.mixed-model-metrics dt,
.mixed-model-details dt {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mixed-model-metrics dd,
.mixed-model-details dd {
  margin: 0.15rem 0 0;
  font-variant-numeric: tabular-nums;
}
.mixed-model-warnings,
.mixed-model-failure {
  margin-top: 0.75rem;
  border: 1px solid var(--danger-border);
  background: var(--danger-bg);
  color: var(--danger);
  border-radius: var(--radius);
  padding: 0.5rem 0.65rem;
  font-size: 13px;
}
.mixed-model-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.75rem;
  font-size: 13px;
  color: var(--text-2);
}
.mixed-model-details {
  margin-top: 0.75rem;
  font-size: 12px;
  color: var(--text-2);
}
.mixed-model-details dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.5rem 0.8rem;
}
```

- [ ] **Step 4: Run targeted UI test**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app.css tests/ui/CohortMixedModelPanel.test.tsx
git commit -m "style: polish mixed model result display"
```

## Task 7: Full Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run mixed-model core tests**

Run:

```bash
pnpm vitest run tests/core/mixedModel
```

Expected: PASS.

- [ ] **Step 2: Run cohort UI tests**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelPanel.test.tsx tests/ui/CohortView.test.tsx tests/ui/CohortTrajectoryOverlay.test.tsx tests/ui/state/store.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Manual browser check**

Run:

```bash
VITE_MIXED_MODEL_SPIKE=true pnpm dev
```

Expected:

- The cohort view shows `Cohort mixed model`.
- `Fit cohort model` produces formatted metrics instead of raw JSON.
- Warnings appear in the result block.
- `Cohort model line` can be toggled after success.
- In overlay mode with `Years since baseline`, the `Mixed model mean` line is visible and distinct.
- Changing selected patients or fit settings clears the previous result.

- [ ] **Step 6: Commit verification notes if docs changed**

If manual verification uncovers a doc correction, update:

```bash
docs/superpowers/specs/2026-06-25-mixed-model-product-integration-design.md
```

Then commit:

```bash
git add docs/superpowers/specs/2026-06-25-mixed-model-product-integration-design.md
git commit -m "docs: update mixed model integration verification notes"
```

If no docs change is needed, do not create an empty commit.
