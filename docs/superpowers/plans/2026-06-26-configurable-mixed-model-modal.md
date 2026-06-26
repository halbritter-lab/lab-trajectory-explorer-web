# Configurable Mixed Model Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a constrained `Configure...` modal for the cohort mixed model, supporting baseline-age adjustment and random-effect selection while keeping `time_since_baseline` as the only model time axis.

**Architecture:** Add typed mixed-model config/formula helpers first, then extend model-ready rows and validation to carry `baseline_age`, then update the worker protocol/result normalization, then wire state and UI. The modal edits a draft config; applying or fitting writes config to store, invalidates stale results, and keeps the overlay line tied to matching model identity.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Testing Library, Observable Plot, webR/lme4 worker.

---

## Files

- Create: `src/core/mixedModel/config.ts`
  - Owns `MixedModelConfig`, defaults, formula builder, formula labels, config validation, and config hash input.
- Create: `tests/core/mixedModel/config.test.ts`
  - Covers allowed formulas, unsupported age-axis config, and config hashing inputs.
- Modify: `src/core/mixedModel/types.ts`
  - Adds `baseline_age` to model rows, optional `baselineAge` fixed effect, config metadata, and worker request types.
- Modify: `src/core/mixedModel/resultIdentity.ts`
  - Includes mixed-model config in `mixedModelFitConfigHash(spec, config)` and `baseline_age` values in dataset identity/hash when selected.
- Modify: `tests/core/mixedModel/resultIdentity.test.ts`
  - Adds baseline-age hash and config-hash regressions.
- Modify: `src/core/mixedModel/cohortDataset.ts`
  - Builds configurable production rows with `baseline_age`.
- Modify: `src/core/mixedModel/syntheticData.ts`
  - Adds deterministic `baseline_age` values to synthetic mixed-model rows so default config validation keeps passing.
- Modify: `tests/core/mixedModel/cohortDataset.test.ts`
  - Verifies baseline age comes from first included point after policy filtering.
- Modify: `src/core/mixedModel/validation.ts`
  - Validates selected config, required baseline age, and unsupported age time axis.
- Modify: `tests/core/mixedModel/validation.test.ts`
  - Adds config-aware validation cases.
- Modify: `src/core/mixedModel/browserClient.ts`, `src/core/mixedModel/workerProtocol.ts`, `src/core/mixedModel/webr.worker.ts`, `src/core/mixedModel/webrResultNormalization.ts`
  - Sends config/generated formula, builds allowed R formulas, extracts optional `baselineAge`.
- Modify tests under `tests/core/mixedModel/*worker*` and `tests/core/mixedModel/browserClient.test.ts`
  - Covers protocol, generated formula, baseline-age coefficient, and unsupported config failure.
- Modify: `src/ui/state/store.ts`
  - Adds `mixedModelConfig`, setter, invalidation, and fit-request intent if needed.
- Modify: `tests/ui/state/store.test.ts`
  - Covers config default/update/invalidation.
- Create: `src/ui/cohort/CohortMixedModelConfigModal.tsx`
  - Modal for draft settings and formula/data-policy preview.
- Create: `tests/ui/CohortMixedModelConfigModal.test.tsx`
  - Covers modal draft/cancel/apply/fit behaviors.
- Modify: `src/ui/cohort/CohortMixedModelPanel.tsx`
  - Adds `Configure...`, formula summary, config props, and modal integration hooks.
- Modify: `tests/ui/CohortMixedModelPanel.test.tsx`
  - Covers formula summary, configure action, and fit with applied config.
- Modify: `src/ui/cohort/CohortView.tsx`
  - Passes mixed-model config and configurable rows/hash into panel.
- Modify: `tests/ui/CohortView.test.tsx`
  - Covers modal entry from cohort view.
- Modify: `src/ui/cohort/CohortTrajectoryOverlay.tsx`
  - Uses baseline-age-adjusted fixed-effect line with patient-weighted mean baseline age.
- Modify: `tests/ui/CohortTrajectoryOverlay.test.tsx`
  - Covers compatible overlay line and baseline-age adjusted identity.
- Modify: `src/ui/app.css`
  - Adds modal styles.

## Task 1: Mixed Model Config And Formula Builder

**Files:**
- Create: `src/core/mixedModel/config.ts`
- Create: `tests/core/mixedModel/config.test.ts`
- Modify: `src/core/mixedModel/types.ts`

- [ ] **Step 1: Write failing config tests**

Create `tests/core/mixedModel/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MIXED_MODEL_CONFIG,
  mixedModelConfigLabel,
  mixedModelFormula,
  mixedModelFormulaKey,
  mixedModelConfigHashInput,
  validateMixedModelConfig,
  type MixedModelConfig,
} from '../../../src/core/mixedModel/config'

describe('mixed model config', () => {
  it('uses baseline-age adjusted random slope as the default', () => {
    expect(DEFAULT_MIXED_MODEL_CONFIG).toEqual({
      timeAxis: 'time_since_baseline',
      covariates: ['baseline_age'],
      randomEffects: 'intercept_slope',
    })
    expect(mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG)).toBe(
      'eGFR ~ time_since_baseline + baseline_age + (1 + time_since_baseline | patient_id)',
    )
  })

  it('builds every first-phase allowed formula', () => {
    const configs: Array<[MixedModelConfig, string, string]> = [
      [
        { timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept' },
        'time_since_baseline__none__intercept',
        'eGFR ~ time_since_baseline + (1 | patient_id)',
      ],
      [
        { timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept_slope' },
        'time_since_baseline__none__intercept_slope',
        'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
      ],
      [
        { timeAxis: 'time_since_baseline', covariates: ['baseline_age'], randomEffects: 'intercept' },
        'time_since_baseline__baseline_age__intercept',
        'eGFR ~ time_since_baseline + baseline_age + (1 | patient_id)',
      ],
      [
        { timeAxis: 'time_since_baseline', covariates: ['baseline_age'], randomEffects: 'intercept_slope' },
        'time_since_baseline__baseline_age__intercept_slope',
        'eGFR ~ time_since_baseline + baseline_age + (1 + time_since_baseline | patient_id)',
      ],
    ]

    for (const [config, key, formula] of configs) {
      expect(validateMixedModelConfig(config).ok).toBe(true)
      expect(mixedModelFormulaKey(config)).toBe(key)
      expect(mixedModelFormula(config)).toBe(formula)
    }
  })

  it('rejects age time axis until the age-axis phase is designed', () => {
    const validation = validateMixedModelConfig({
      timeAxis: 'age',
      covariates: [],
      randomEffects: 'intercept',
    })

    expect(validation).toEqual({
      ok: false,
      code: 'UNSUPPORTED_TIME_AXIS',
      message: 'Age as the mixed-model time axis is not supported yet.',
    })
  })

  it('builds a compact user-facing label', () => {
    expect(mixedModelConfigLabel(DEFAULT_MIXED_MODEL_CONFIG)).toBe(
      'eGFR ~ time_since_baseline + baseline_age + random patient intercept/slope',
    )
  })

  it('hash input changes for model config but is independent of endpoint-only settings', () => {
    expect(mixedModelConfigHashInput(DEFAULT_MIXED_MODEL_CONFIG)).toEqual({
      formulaKey: 'time_since_baseline__baseline_age__intercept_slope',
      formula: 'eGFR ~ time_since_baseline + baseline_age + (1 + time_since_baseline | patient_id)',
      config: DEFAULT_MIXED_MODEL_CONFIG,
    })
  })
})
```

- [ ] **Step 2: Run failing config tests**

Run:

```bash
pnpm vitest run tests/core/mixedModel/config.test.ts
```

Expected: FAIL because `src/core/mixedModel/config.ts` does not exist.

- [ ] **Step 3: Implement config helpers**

Create `src/core/mixedModel/config.ts`:

```ts
export type MixedModelTimeAxis = 'time_since_baseline' | 'age'
export type MixedModelCovariate = 'baseline_age'
export type MixedModelRandomEffects = 'intercept' | 'intercept_slope'

export interface MixedModelConfig {
  timeAxis: MixedModelTimeAxis
  covariates: MixedModelCovariate[]
  randomEffects: MixedModelRandomEffects
}

export type MixedModelConfigValidation =
  | { ok: true }
  | { ok: false; code: 'UNSUPPORTED_TIME_AXIS' | 'UNSUPPORTED_CONFIG'; message: string }

export const DEFAULT_MIXED_MODEL_CONFIG: MixedModelConfig = {
  timeAxis: 'time_since_baseline',
  covariates: ['baseline_age'],
  randomEffects: 'intercept_slope',
}

export function validateMixedModelConfig(config: MixedModelConfig): MixedModelConfigValidation {
  if (config.timeAxis !== 'time_since_baseline') {
    return { ok: false, code: 'UNSUPPORTED_TIME_AXIS', message: 'Age as the mixed-model time axis is not supported yet.' }
  }
  const covariates = [...config.covariates].sort()
  const unsupportedCovariate = covariates.find((covariate) => covariate !== 'baseline_age')
  if (unsupportedCovariate) {
    return { ok: false, code: 'UNSUPPORTED_CONFIG', message: `Unsupported mixed-model covariate: ${unsupportedCovariate}.` }
  }
  if (config.randomEffects !== 'intercept' && config.randomEffects !== 'intercept_slope') {
    return { ok: false, code: 'UNSUPPORTED_CONFIG', message: 'Unsupported mixed-model random-effects setting.' }
  }
  return { ok: true }
}

export function mixedModelFormulaKey(config: MixedModelConfig): string {
  const validation = validateMixedModelConfig(config)
  if (!validation.ok) return `unsupported__${config.timeAxis}`
  const covariateKey = config.covariates.includes('baseline_age') ? 'baseline_age' : 'none'
  return `${config.timeAxis}__${covariateKey}__${config.randomEffects}`
}

export function mixedModelFormula(config: MixedModelConfig): string {
  const validation = validateMixedModelConfig(config)
  if (!validation.ok) return ''
  const fixed = config.covariates.includes('baseline_age')
    ? 'time_since_baseline + baseline_age'
    : 'time_since_baseline'
  const random = config.randomEffects === 'intercept_slope'
    ? '(1 + time_since_baseline | patient_id)'
    : '(1 | patient_id)'
  return `eGFR ~ ${fixed} + ${random}`
}

export function mixedModelConfigLabel(config: MixedModelConfig): string {
  const covariate = config.covariates.includes('baseline_age') ? ' + baseline_age' : ''
  const random = config.randomEffects === 'intercept_slope'
    ? 'random patient intercept/slope'
    : 'random patient intercept'
  return `eGFR ~ time_since_baseline${covariate} + ${random}`
}

export function mixedModelConfigHashInput(config: MixedModelConfig) {
  return {
    formulaKey: mixedModelFormulaKey(config),
    formula: mixedModelFormula(config),
    config,
  }
}
```

Modify `src/core/mixedModel/types.ts` imports:

```ts
import type { MixedModelConfig } from './config'
```

Add to `MixedModelMetadata`:

```ts
  modelConfig?: MixedModelConfig
```

Add optional fixed effect:

```ts
    baselineAge?: number
```

- [ ] **Step 4: Run config tests**

Run:

```bash
pnpm vitest run tests/core/mixedModel/config.test.ts tests/core/mixedModel/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/mixedModel/config.ts src/core/mixedModel/types.ts tests/core/mixedModel/config.test.ts
git commit -m "feat: add mixed model config formulas"
```

## Task 2: Baseline-Age Model Rows, Validation, And Identity

**Files:**
- Modify: `src/core/mixedModel/cohortDataset.ts`
- Modify: `src/core/mixedModel/syntheticData.ts`
- Modify: `src/core/mixedModel/validation.ts`
- Modify: `src/core/mixedModel/resultIdentity.ts`
- Modify: `tests/core/mixedModel/cohortDataset.test.ts`
- Modify: `tests/core/mixedModel/validation.test.ts`
- Modify: `tests/core/mixedModel/resultIdentity.test.ts`

- [ ] **Step 1: Write failing core tests**

Add to `tests/core/mixedModel/cohortDataset.test.ts`:

```ts
it('adds patient baseline age from the first included model point', () => {
  const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global' }
  const rows = [
    lab('p1', '2020-01-01', 70, 50),
    lab('p1', '2021-01-01', 68, 51),
    lab('p2', '2020-01-01', 60, 60),
    lab('p2', '2021-01-01', 58, 61),
    lab('p3', '2020-01-01', 55, 70),
    lab('p3', '2021-01-01', 53, 71),
  ]

  const modelRows = mixedModelRowsFromCohortInputs(rows, ['p1', 'p2', 'p3'], spec)

  expect(modelRows.filter((row) => row.patient_id === 'p1').map((row) => row.baseline_age)).toEqual([50, 50])
  expect(modelRows.filter((row) => row.patient_id === 'p2').map((row) => row.baseline_age)).toEqual([60, 60])
})
```

Add this minimal helper in that test file:

```ts
function lab(patientId: string, date: string, value: number, age: number | null): LabRow {
  return {
    patientId,
    bezeichnung: 'eGFR',
    einheit: 'ml/min/1.73m2',
    wert: String(value),
    wertNum: value,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    labDatum: new Date(date),
    patientAgeAtLab: age,
  }
}
```

Add to `tests/core/mixedModel/validation.test.ts`:

```ts
it('requires baseline age when baseline_age covariate is selected', () => {
  const result = validateMixedModelRows([
    { patient_id: 'p1', eGFR: 70, time_since_baseline: 0 },
    { patient_id: 'p1', eGFR: 68, time_since_baseline: 1 },
    { patient_id: 'p2', eGFR: 60, time_since_baseline: 0, baseline_age: 60 },
    { patient_id: 'p2', eGFR: 58, time_since_baseline: 1, baseline_age: 60 },
    { patient_id: 'p3', eGFR: 55, time_since_baseline: 0, baseline_age: 70 },
    { patient_id: 'p3', eGFR: 53, time_since_baseline: 1, baseline_age: 70 },
  ], DEFAULT_MIXED_MODEL_CONFIG)

  expect(result).toMatchObject({
    ok: false,
    code: 'MISSING_BASELINE_AGE',
  })
})
```

Add to `tests/core/mixedModel/resultIdentity.test.ts`:

```ts
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
```

Add a fit-config hash regression in `tests/core/mixedModel/resultIdentity.test.ts`:

```ts
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
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm vitest run tests/core/mixedModel/cohortDataset.test.ts tests/core/mixedModel/validation.test.ts tests/core/mixedModel/resultIdentity.test.ts
```

Expected: FAIL because rows, validation, and hash do not handle `baseline_age`.

- [ ] **Step 3: Extend row type, dataset builder, validation, and hashing**

Modify `src/core/mixedModel/types.ts`:

```ts
export interface MixedModelSpikeRow {
  patient_id: string
  eGFR: number
  time_since_baseline: number
  baseline_age?: number
}
```

Modify `mixedModelRowsFromCohortInputs` in `src/core/mixedModel/cohortDataset.ts` so after included/balanced points are known per patient:

```ts
const baselineAge = Number.isFinite(included[0]?.source.patientAgeAtLab)
  ? included[0].source.patientAgeAtLab as number
  : null
```

Then include:

```ts
baseline_age: baselineAge ?? undefined,
```

If the local point type does not retain the source row, add `age: row.patientAgeAtLab` to the intermediate point before filtering and use the first included point's age.

Modify `validateMixedModelRows` signature:

```ts
export function validateMixedModelRows(
  rows: readonly MixedModelSpikeRow[],
  config: MixedModelConfig = { timeAxis: 'time_since_baseline', covariates: [], randomEffects: 'intercept_slope' },
): MixedModelValidationResult
```

Add validation code:

```ts
const configValidation = validateMixedModelConfig(config)
if (!configValidation.ok) {
  return failure('UNSUPPORTED_CONFIG', configValidation.message)
}
if (config.covariates.includes('baseline_age')) {
  const missingPatients = [...patientRows.entries()]
    .filter(([, rowsForPatient]) => rowsForPatient.some((row) => !Number.isFinite(row.baseline_age)))
    .map(([patientId]) => patientId)
  if (missingPatients.length > 0) {
    return failure(
      'MISSING_BASELINE_AGE',
      `Baseline age is required for this model but is unavailable for ${missingPatients.length} modeled patient${missingPatients.length === 1 ? '' : 's'}.`,
    )
  }
}
```

Add validation code union values:

```ts
  | 'UNSUPPORTED_CONFIG'
  | 'MISSING_BASELINE_AGE'
```

Modify `hashMixedModelInput` in `src/core/mixedModel/validation.ts` to include:

```ts
baseline_age: row.baseline_age === undefined ? null : roundTo10Decimals(row.baseline_age),
```

Modify `mixedModelFitConfigHash` in `src/core/mixedModel/resultIdentity.ts` to accept config:

```ts
export function mixedModelFitConfigHash(spec: CohortSeriesSpec, config: MixedModelConfig = DEFAULT_MIXED_MODEL_CONFIG): string {
  return hashString(JSON.stringify({
    engine: 'webr-lme4',
    formula: MIXED_MODEL_FORMULA,
    reml: true,
    tolerance: MIXED_MODEL_TOLERANCE,
    model: mixedModelConfigHashInput(config),
    series: {
      bezeichnung: spec.bezeichnung,
      einheit: spec.einheit ?? null,
    },
    legacyPolicy: {
      mode: spec.mode,
      gapDays: spec.gapDays ?? null,
      windowDays: spec.windowDays ?? null,
      stepDays: spec.stepDays ?? null,
      cutoffDays: spec.cutoffDays ?? null,
      exclusionDays: spec.exclusionDays ?? null,
    },
    fitConfig: spec.fitConfig
      ? {
          xAxis: spec.fitConfig.xAxis,
          censoring: spec.fitConfig.censoring,
          exclusions: spec.fitConfig.exclusions,
          timeBalancing: spec.fitConfig.timeBalancing,
          fitModel: spec.fitConfig.fitModel,
        }
      : null,
  }))
}
```

Modify `src/core/mixedModel/syntheticData.ts` patient parameters:

```ts
const PATIENT_PARAMETERS = [
  { patient_id: 'p1', intercept: 65, slope: -2.3, baseline_age: 50 },
  { patient_id: 'p2', intercept: 58, slope: -1.4, baseline_age: 60 },
  { patient_id: 'p3', intercept: 72, slope: -3.1, baseline_age: 70 },
  { patient_id: 'p4', intercept: 61, slope: -2.0, baseline_age: 80 },
] as const
```

and include `baseline_age` in each synthetic row.

- [ ] **Step 4: Run core tests**

Run:

```bash
pnpm vitest run tests/core/mixedModel/cohortDataset.test.ts tests/core/mixedModel/validation.test.ts tests/core/mixedModel/resultIdentity.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/mixedModel/cohortDataset.ts src/core/mixedModel/syntheticData.ts src/core/mixedModel/types.ts src/core/mixedModel/validation.ts tests/core/mixedModel/cohortDataset.test.ts tests/core/mixedModel/validation.test.ts tests/core/mixedModel/resultIdentity.test.ts
git commit -m "feat: add baseline age to mixed model rows"
```

## Task 3: Worker Protocol And Result Normalization

**Files:**
- Modify: `src/core/mixedModel/browserClient.ts`
- Modify: `src/core/mixedModel/workerProtocol.ts`
- Modify: `src/core/mixedModel/webr.worker.ts`
- Modify: `src/core/mixedModel/webrResultNormalization.ts`
- Modify: `tests/core/mixedModel/browserClient.test.ts`
- Modify: `tests/core/mixedModel/workerProtocol.test.ts`
- Modify: `tests/core/mixedModel/webrWorkerExtraction.test.ts`
- Modify: `tests/core/mixedModel/webrWorkerRuntime.test.ts`

- [ ] **Step 1: Write failing protocol and normalization tests**

In `tests/core/mixedModel/workerProtocol.test.ts`, add a response guard regression for optional `baselineAge`:

```ts
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
      randomEffects: { interceptSd: 1, slopeSd: 0.2, interceptSlopeCorrelation: null },
      residualSd: 4,
    },
  })).toBe(true)
})
```

In `tests/core/mixedModel/webrWorkerExtraction.test.ts`, add a normalization test for raw fixed effects:

```ts
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
```

Add an unsupported-config worker runtime test in `tests/core/mixedModel/webrWorkerRuntime.test.ts` that sends:

```ts
{
  ...request,
  config: { timeAxis: 'age', covariates: [], randomEffects: 'intercept' },
  formula: '',
  formulaKey: 'unsupported__age',
}
```

and expects a structured failure:

```ts
expect(result).toMatchObject({
  status: 'unsupported',
  stage: 'data-validation',
  code: 'UNSUPPORTED_MIXED_MODEL_CONFIG',
})
```

- [ ] **Step 2: Run failing worker tests**

Run:

```bash
pnpm vitest run tests/core/mixedModel/workerProtocol.test.ts tests/core/mixedModel/webrWorkerExtraction.test.ts
```

Expected: FAIL because protocol and normalization do not include config/formula/baselineAge.

- [ ] **Step 3: Implement protocol, R formula generation, and extraction**

Modify worker request types to include:

```ts
config: MixedModelConfig
formula: string
formulaKey: string
```

Update existing request fixtures in `tests/core/mixedModel/webrWorkerExtraction.test.ts`, `tests/core/mixedModel/webrWorkerRuntime.test.ts`, and `tests/core/mixedModel/browserClient.test.ts` so every `MixedModelWorkerRequest` literal includes config fields.

For existing legacy success fixtures whose extracted JSON does not include `fixedEffects.baselineAge`, use a no-covariate config:

```ts
const LEGACY_MIXED_MODEL_CONFIG: MixedModelConfig = {
  timeAxis: 'time_since_baseline',
  covariates: [],
  randomEffects: 'intercept_slope',
}
```

and set:

```ts
config: LEGACY_MIXED_MODEL_CONFIG,
formula: mixedModelFormula(LEGACY_MIXED_MODEL_CONFIG),
formulaKey: mixedModelFormulaKey(LEGACY_MIXED_MODEL_CONFIG),
```

For new baseline-age-specific tests, use:

```ts
config: DEFAULT_MIXED_MODEL_CONFIG,
formula: mixedModelFormula(DEFAULT_MIXED_MODEL_CONFIG),
formulaKey: mixedModelFormulaKey(DEFAULT_MIXED_MODEL_CONFIG),
```

Modify browser client request construction so `runMixedModelWorkerJob` options include `config`, `formula`, and `formulaKey`. Existing callers will be updated in later UI tasks; tests can use defaults temporarily:

```ts
config = DEFAULT_MIXED_MODEL_CONFIG,
formula = mixedModelFormula(config),
formulaKey = mixedModelFormulaKey(config),
```

In `webr.worker.ts`, pass baseline age vector into R:

```ts
const mmBaselineAge = rows.map((row) => row.baseline_age ?? null)
```

Add to R data frame:

```r
baseline_age = as.numeric(mm_baseline_age)
```

Validate the config/formula pair before fitting:

```ts
if (mixedModelFormulaKey(request.config) !== request.formulaKey || mixedModelFormula(request.config) !== request.formula) {
  return {
    status: 'unsupported',
    engine: request.engine,
    stage: 'data-validation',
    code: 'UNSUPPORTED_MIXED_MODEL_CONFIG',
    message: 'Mixed model config and generated formula do not match a supported formula.',
    warnings: [],
    metadata: baseMetadata,
  }
}
```

Build model call from validated config/formula key. For lme4:

```ts
function lme4ModelCall(formulaKey: string): string | null {
  if (formulaKey === 'time_since_baseline__none__intercept') {
    return 'lme4::lmer(eGFR ~ time_since_baseline + (1 | patient_id), data = mm_data, REML = TRUE)'
  }
  if (formulaKey === 'time_since_baseline__none__intercept_slope') {
    return 'lme4::lmer(eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id), data = mm_data, REML = TRUE)'
  }
  if (formulaKey === 'time_since_baseline__baseline_age__intercept') {
    return 'lme4::lmer(eGFR ~ time_since_baseline + baseline_age + (1 | patient_id), data = mm_data, REML = TRUE)'
  }
  if (formulaKey === 'time_since_baseline__baseline_age__intercept_slope') {
    return 'lme4::lmer(eGFR ~ time_since_baseline + baseline_age + (1 + time_since_baseline | patient_id), data = mm_data, REML = TRUE)'
  }
  return null
}
```

If the model call is null, return the same structured `UNSUPPORTED_MIXED_MODEL_CONFIG` failure instead of throwing.

Extract baseline age:

```r
mm_baseline_age <- if ("baseline_age" %in% names(mm_fixed)) as.numeric(mm_fixed[["baseline_age"]]) else NA_real_
```

Add to output fixed effects as nullable:

```r
baselineAge = mm_nullable_number(mm_baseline_age)
```

In `normalizeExtractedFitResult`, accept optional `fixedEffects.baselineAge` as finite nullable number. If `request.config.covariates` includes `baseline_age` and the extracted result lacks a finite `baselineAge`, throw `ResultExtractionError('webR fit result field fixedEffects.baselineAge must be a finite number.')`; the worker already maps extraction errors to structured `result-extraction` failures.

- [ ] **Step 4: Run worker tests**

Run:

```bash
pnpm vitest run tests/core/mixedModel/browserClient.test.ts tests/core/mixedModel/workerProtocol.test.ts tests/core/mixedModel/webrWorkerExtraction.test.ts tests/core/mixedModel/webrWorkerRuntime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/mixedModel/browserClient.ts src/core/mixedModel/workerProtocol.ts src/core/mixedModel/webr.worker.ts src/core/mixedModel/webrResultNormalization.ts tests/core/mixedModel/browserClient.test.ts tests/core/mixedModel/workerProtocol.test.ts tests/core/mixedModel/webrWorkerExtraction.test.ts tests/core/mixedModel/webrWorkerRuntime.test.ts
git commit -m "feat: pass mixed model config to worker"
```

## Task 4: Store Config State

**Files:**
- Modify: `src/ui/state/store.ts`
- Modify: `tests/ui/state/store.test.ts`

- [ ] **Step 1: Write failing store tests**

Add to `tests/ui/state/store.test.ts`:

```ts
it('stores mixed model config and invalidates current result', () => {
  const identity = {
    seriesIndex: 0,
    seriesKey: 'eGFR|ml/min/1.73m2',
    patientIdsHash: 'patients',
    datasetHash: 'dataset',
    fitConfigHash: 'fit',
    nPatients: 3,
    nMeasurements: 6,
  }
  const result = {
    status: 'success' as const,
    metadata: {
      engine: 'webr-lme4' as const,
      formula: 'eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)',
      runtimeVersion: '4.6.0',
      packageVersions: {},
      browserUserAgent: 'test',
      wasmAssetSource: 'cdn' as const,
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
  const state = useAppStore.getState()
  state.setMixedModelResult({ result, identity })
  state.setShowCohortMixedModelLine(true)

  useAppStore.getState().setMixedModelConfig({
    timeAxis: 'time_since_baseline',
    covariates: [],
    randomEffects: 'intercept',
  })

  expect(useAppStore.getState().mixedModelConfig).toEqual({
    timeAxis: 'time_since_baseline',
    covariates: [],
    randomEffects: 'intercept',
  })
  expect(useAppStore.getState().mixedModelResult).toBeNull()
  expect(useAppStore.getState().showCohortMixedModelLine).toBe(false)
})
```

- [ ] **Step 2: Run failing store test**

Run:

```bash
pnpm vitest run tests/ui/state/store.test.ts
```

Expected: FAIL because `mixedModelConfig` and `setMixedModelConfig` do not exist.

- [ ] **Step 3: Implement store config**

Modify `src/ui/state/store.ts`:

```ts
import { DEFAULT_MIXED_MODEL_CONFIG, type MixedModelConfig } from '../../core/mixedModel/config'
```

Add to `AppState`:

```ts
mixedModelConfig: MixedModelConfig
setMixedModelConfig: (config: MixedModelConfig) => void
```

Add to `AppData` and `initialState()`:

```ts
mixedModelConfig: DEFAULT_MIXED_MODEL_CONFIG,
```

Add action:

```ts
setMixedModelConfig: (config) => set({
  mixedModelConfig: config,
  mixedModelResult: null,
  showCohortMixedModelLine: false,
}),
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
git commit -m "feat: store mixed model config"
```

## Task 5: Configure Modal Component

**Files:**
- Create: `src/ui/cohort/CohortMixedModelConfigModal.tsx`
- Create: `tests/ui/CohortMixedModelConfigModal.test.tsx`
- Modify: `src/ui/app.css`

- [ ] **Step 1: Write failing modal tests**

Create `tests/ui/CohortMixedModelConfigModal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CohortMixedModelConfigModal } from '../../src/ui/cohort/CohortMixedModelConfigModal'
import { DEFAULT_MIXED_MODEL_CONFIG } from '../../src/core/mixedModel/config'

describe('CohortMixedModelConfigModal', () => {
  it('shows formula preview and applies draft settings', async () => {
    const onApply = vi.fn()
    render(
      <CohortMixedModelConfigModal
        open
        seriesLabel="eGFR (ml/min/1.73m2)"
        config={DEFAULT_MIXED_MODEL_CONFIG}
        dataPolicySummary="12 selected patients, monthly median, AKI exclusions"
        validateConfig={() => null}
        onCancel={vi.fn()}
        onApply={onApply}
        onFit={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: /configure cohort mixed model/i })).toBeInTheDocument()
    expect(screen.getByText(/eGFR ~ time_since_baseline \+ baseline_age/)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/patient intercept$/i))
    await userEvent.click(screen.getByRole('button', { name: /apply settings/i }))

    expect(onApply).toHaveBeenCalledWith({
      timeAxis: 'time_since_baseline',
      covariates: ['baseline_age'],
      randomEffects: 'intercept',
    })
  })

  it('cancel discards draft settings', async () => {
    const onCancel = vi.fn()
    const onApply = vi.fn()
    render(
      <CohortMixedModelConfigModal
        open
        seriesLabel="eGFR"
        config={DEFAULT_MIXED_MODEL_CONFIG}
        dataPolicySummary="policy"
        validateConfig={() => null}
        onCancel={onCancel}
        onApply={onApply}
        onFit={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByLabelText(/patient intercept$/i))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('blocks apply and fit when validation message is present', () => {
    render(
      <CohortMixedModelConfigModal
        open
        seriesLabel="eGFR"
        config={DEFAULT_MIXED_MODEL_CONFIG}
        dataPolicySummary="policy"
        validateConfig={() => 'Baseline age is unavailable.'}
        onCancel={vi.fn()}
        onApply={vi.fn()}
        onFit={vi.fn()}
      />,
    )

    expect(screen.getByText('Baseline age is unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apply settings/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /fit model/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run failing modal tests**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelConfigModal.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement modal**

Create `src/ui/cohort/CohortMixedModelConfigModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import {
  mixedModelFormula,
  type MixedModelConfig,
} from '../../core/mixedModel/config'

interface Props {
  open: boolean
  seriesLabel: string
  config: MixedModelConfig
  dataPolicySummary: string
  validateConfig: (config: MixedModelConfig) => string | null
  onCancel: () => void
  onApply: (config: MixedModelConfig) => void
  onFit: (config: MixedModelConfig) => void
}

export function CohortMixedModelConfigModal({
  open,
  seriesLabel,
  config,
  dataPolicySummary,
  validateConfig,
  onCancel,
  onApply,
  onFit,
}: Props) {
  const [draft, setDraft] = useState(config)

  useEffect(() => {
    if (open) setDraft(config)
  }, [open, config])

  if (!open) return null
  const validationMessage = validateConfig(draft)
  const canSubmit = validationMessage === null

  function setBaselineAge(enabled: boolean) {
    setDraft((current) => ({
      ...current,
      covariates: enabled ? ['baseline_age'] : [],
    }))
  }

  return (
    <div className="mixed-model-modal-backdrop">
      <section className="mixed-model-modal" role="dialog" aria-modal="true" aria-label="Configure cohort mixed model">
        <div className="mixed-model-modal-header">
          <h3>Configure cohort mixed model</h3>
          <button aria-label="Close" onClick={onCancel}>x</button>
        </div>

        <div className="mixed-model-modal-section">
          <h4>Outcome</h4>
          <p>{seriesLabel}</p>
        </div>

        <div className="mixed-model-modal-section">
          <h4>Time</h4>
          <p>Years since baseline</p>
        </div>

        <div className="mixed-model-modal-section">
          <h4>Covariates</h4>
          <label>
            <input
              type="checkbox"
              checked={draft.covariates.includes('baseline_age')}
              onChange={(event) => setBaselineAge(event.currentTarget.checked)}
            />
            Baseline age
          </label>
        </div>

        <div className="mixed-model-modal-section">
          <h4>Random effects</h4>
          <label>
            <input
              type="radio"
              name="mixed-model-random-effects"
              checked={draft.randomEffects === 'intercept'}
              onChange={() => setDraft((current) => ({ ...current, randomEffects: 'intercept' }))}
            />
            Patient intercept
          </label>
          <label>
            <input
              type="radio"
              name="mixed-model-random-effects"
              checked={draft.randomEffects === 'intercept_slope'}
              onChange={() => setDraft((current) => ({ ...current, randomEffects: 'intercept_slope' }))}
            />
            Patient intercept + patient slope
          </label>
        </div>

        <div className="mixed-model-modal-section">
          <h4>Data policy</h4>
          <p>{dataPolicySummary}</p>
        </div>

        <div className="mixed-model-modal-section">
          <h4>Formula preview</h4>
          <code>{mixedModelFormula(draft)}</code>
        </div>

        {validationMessage && <p className="mixed-model-failure">{validationMessage}</p>}

        <div className="mixed-model-modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button disabled={!canSubmit} onClick={() => onApply(draft)}>Apply settings</button>
          <button disabled={!canSubmit} onClick={() => onFit(draft)}>Fit model</button>
        </div>
      </section>
    </div>
  )
}
```

Add modal CSS in `src/ui/app.css` near mixed model styles:

```css
.mixed-model-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(15, 23, 42, 0.34);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.mixed-model-modal {
  width: min(680px, 100%);
  max-height: min(760px, calc(100vh - 2rem));
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 1rem;
}
.mixed-model-modal-header,
.mixed-model-modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.mixed-model-modal-section {
  border-top: 1px solid var(--border-soft);
  padding-top: 0.75rem;
  margin-top: 0.75rem;
}
.mixed-model-modal-section h4 {
  margin: 0 0 0.35rem;
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mixed-model-modal-section label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.3rem 0;
}
```

- [ ] **Step 4: Run modal tests**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelConfigModal.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/cohort/CohortMixedModelConfigModal.tsx tests/ui/CohortMixedModelConfigModal.test.tsx src/ui/app.css
git commit -m "feat: add mixed model config modal"
```

## Task 6: Panel And CohortView Integration

**Files:**
- Modify: `src/ui/cohort/CohortMixedModelPanel.tsx`
- Modify: `src/ui/cohort/CohortView.tsx`
- Modify: `tests/ui/CohortMixedModelPanel.test.tsx`
- Modify: `tests/ui/CohortView.test.tsx`

- [ ] **Step 1: Write failing UI integration tests**

Add to `tests/ui/CohortMixedModelPanel.test.tsx`:

```tsx
it('opens configure modal and applies a new formula summary', async () => {
  const onConfigChange = vi.fn()
  renderPanel({ onConfigChange })

  await userEvent.click(screen.getByRole('button', { name: /configure/i }))
  expect(screen.getByRole('dialog', { name: /configure cohort mixed model/i })).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText(/patient intercept$/i))
  await userEvent.click(screen.getByRole('button', { name: /apply settings/i }))

  expect(onConfigChange).toHaveBeenCalledWith({
    timeAxis: 'time_since_baseline',
    covariates: ['baseline_age'],
    randomEffects: 'intercept',
  })
})
```

Add a result-details assertion to the existing successful-result test:

```tsx
expect(screen.getByText(/Baseline age coefficient/i)).toBeInTheDocument()
expect(screen.getByText('-0.40')).toBeInTheDocument()
```

Use a mocked success result whose fixed effects include:

```ts
fixedEffects: { intercept: 59.9364, timeSinceBaseline: -3.2675, baselineAge: -0.4 }
```

Add to `tests/ui/CohortView.test.tsx`:

```tsx
it('opens the mixed model configuration modal from the cohort panel', async () => {
  vi.stubEnv('VITE_MIXED_MODEL_SPIKE', 'true')
  seedValidEgfrCohort()
  render(<CohortView />)

  await userEvent.click(await screen.findByRole('button', { name: /configure/i }))

  expect(screen.getByRole('dialog', { name: /configure cohort mixed model/i })).toBeInTheDocument()
})
```

Add this local helper in `tests/ui/CohortView.test.tsx` if the file does not already have an equivalent valid eGFR cohort helper:

```tsx
function seedValidEgfrCohort() {
  useAppStore.getState().setDataset([
    { patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '60', wertNum: 60, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2020-01-01'), patientAgeAtLab: 50 },
    { patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '58', wertNum: 58, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2021-01-01'), patientAgeAtLab: 51 },
    { patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '62', wertNum: 62, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2020-01-01'), patientAgeAtLab: 52 },
    { patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '59', wertNum: 59, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2021-01-01'), patientAgeAtLab: 53 },
    { patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '55', wertNum: 55, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2020-01-01'), patientAgeAtLab: 54 },
    { patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '51', wertNum: 51, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2021-01-01'), patientAgeAtLab: 55 },
  ])
  useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
}
```

- [ ] **Step 2: Run failing panel/cohort tests**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelPanel.test.tsx tests/ui/CohortView.test.tsx
```

Expected: FAIL because panel does not open modal and props do not exist.

- [ ] **Step 3: Wire panel props and modal**

Modify `CohortMixedModelPanelProps`:

```ts
config: MixedModelConfig
formula: string
formulaLabel: string
dataPolicySummary: string
validateConfig: (config: MixedModelConfig) => string | null
onConfigChange: (config: MixedModelConfig) => void
onConfigFit: (config: MixedModelConfig) => void
```

Add state:

```ts
const [configOpen, setConfigOpen] = useState(false)
```

Render:

```tsx
<button onClick={() => setConfigOpen(true)}>Configure...</button>
<p className="mixed-model-message">Model: {formulaLabel}</p>
<CohortMixedModelConfigModal
  open={configOpen}
  seriesLabel={seriesLabel}
  config={config}
  dataPolicySummary={dataPolicySummary}
  validateConfig={validateConfig}
  onCancel={() => setConfigOpen(false)}
  onApply={(nextConfig) => {
    onConfigChange(nextConfig)
    setConfigOpen(false)
  }}
  onFit={(nextConfig) => {
    onConfigFit(nextConfig)
    setConfigOpen(false)
  }}
/>
```

Modify `run()` to use `config`, `formula`, and `formulaKey` from helpers.

In `SuccessResult`, show the optional baseline-age coefficient in details:

```tsx
{result.fixedEffects.baselineAge !== undefined && (
  <div>
    <dt>Baseline age coefficient</dt>
    <dd>{result.fixedEffects.baselineAge.toFixed(2)}</dd>
  </div>
)}
```

Modify `CohortView.tsx`:

```ts
const mixedModelConfig = useAppStore((s) => s.mixedModelConfig)
const setMixedModelConfig = useAppStore((s) => s.setMixedModelConfig)
const mixedModelFormulaText = mixedModelFormula(mixedModelConfig)
const mixedModelFormulaLabelText = mixedModelConfigLabel(mixedModelConfig)
const validateMixedModelDraftConfig = (config: MixedModelConfig) => {
  const configValidation = validateMixedModelConfig(config)
  if (!configValidation.ok) return configValidation.message
  const rowValidation = validateMixedModelRows(mixedModelRows, config)
  return rowValidation.ok ? null : rowValidation.message
}
```

For `onConfigFit`, use a panel-local fit-after-apply flag so the panel waits until the parent has applied the new config:

```ts
const [pendingFitConfig, setPendingFitConfig] = useState<MixedModelConfig | null>(null)

useEffect(() => {
  if (!pendingFitConfig) return
  if (JSON.stringify(config) !== JSON.stringify(pendingFitConfig)) return
  setPendingFitConfig(null)
  void run()
}, [config, pendingFitConfig])
```

Use it in the modal callback:

```tsx
onFit={(nextConfig) => {
  setPendingFitConfig(nextConfig)
  onConfigFit(nextConfig)
  setConfigOpen(false)
}}
```

- [ ] **Step 4: Run UI tests**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelPanel.test.tsx tests/ui/CohortView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/cohort/CohortMixedModelPanel.tsx src/ui/cohort/CohortView.tsx tests/ui/CohortMixedModelPanel.test.tsx tests/ui/CohortView.test.tsx
git commit -m "feat: wire mixed model configuration modal"
```

## Task 7: Overlay Baseline-Age Adjusted Line

**Files:**
- Modify: `src/core/mixedModel/resultIdentity.ts`
- Modify: `tests/core/mixedModel/resultIdentity.test.ts`
- Modify: `src/ui/cohort/CohortTrajectoryOverlay.tsx`
- Modify: `tests/ui/CohortTrajectoryOverlay.test.tsx`

- [ ] **Step 1: Write failing overlay tests**

Add to `tests/ui/CohortTrajectoryOverlay.test.tsx`:

```tsx
import type { LabRow } from '../../src/core/types'

it('uses patient-weighted mean baseline age for adjusted mixed model overlay line', () => {
  const rows: LabRow[] = [
    { patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '60', wertNum: 60, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2020-01-01'), patientAgeAtLab: 50 },
    { patientId: '1', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '58', wertNum: 58, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2021-01-01'), patientAgeAtLab: 51 },
    { patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '62', wertNum: 62, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2020-01-01'), patientAgeAtLab: 60 },
    { patientId: '2', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '59', wertNum: 59, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2021-01-01'), patientAgeAtLab: 61 },
    { patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '55', wertNum: 55, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2020-01-01'), patientAgeAtLab: 70 },
    { patientId: '3', bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', wert: '51', wertNum: 51, wertOperator: '=', loinc: null, patientSex: null, labDatum: new Date('2021-01-01'), patientAgeAtLab: 71 },
  ]
  useAppStore.getState().setDataset(rows)
  useAppStore.getState().setSeriesConfig(0, { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2' })
  useAppStore.getState().setMixedModelConfig(DEFAULT_MIXED_MODEL_CONFIG)
  const analysisResult = useAppStore.getState().analysisResult()
  const config = useAppStore.getState().seriesConfigs[0]
  const spec = {
    bezeichnung: 'eGFR',
    einheit: 'ml/min/1.73m2',
    mode: config.mode,
    gapDays: config.gapDays,
    windowDays: config.windowDays,
    stepDays: config.stepDays,
    cutoffDays: config.cutoffDays,
    exclusionDays: config.exclusionDays,
    fitConfig: config.fitConfig,
    fitInputs: analysisResult.fitInputs,
    clinicalEventsByPatient: {},
  }
  const modelRows = mixedModelRowsFromCohortInputs(analysisResult.rows, ['1', '2', '3'], spec)
  const fitConfigHash = mixedModelFitConfigHash(spec, DEFAULT_MIXED_MODEL_CONFIG)
  const identity = buildMixedModelResultIdentity({
    seriesIndex: 0,
    seriesKey: 'eGFR|ml/min/1.73m2',
    patientIds: ['1', '2', '3'],
    rows: modelRows,
    fitConfigHash,
  })
  useAppStore.getState().setMixedModelResult({
    identity,
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
        datasetHash: identity.datasetHash,
        randomSeed: null,
        fitConfigHash,
      },
      converged: true,
      warnings: [],
      nPatients: 3,
      nMeasurements: modelRows.length,
      fixedEffects: { intercept: 100, timeSinceBaseline: -2, baselineAge: -0.5 },
      randomEffects: { interceptSd: null, slopeSd: null, interceptSlopeCorrelation: null },
      residualSd: null,
    },
  })
  useAppStore.getState().setShowCohortMixedModelLine(true)
  useAppStore.getState().setCohortOverlayXAxis('time_since_baseline')

  render(<CohortTrajectoryOverlay />)

  expect(screen.getByTestId('cohort-mixed-model-line')).toBeInTheDocument()
  expect(screen.getByTestId('cohort-trajectory-overlay')).toHaveTextContent('Mixed model mean')
})
```

Add to `tests/core/mixedModel/resultIdentity.test.ts`:

```ts
it('adds patient-weighted baseline age adjustment to mean line points', () => {
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
    { patient_id: 'p1', eGFR: 70, time_since_baseline: 0, baseline_age: 50 },
    { patient_id: 'p1', eGFR: 68, time_since_baseline: 1, baseline_age: 50 },
    { patient_id: 'p2', eGFR: 60, time_since_baseline: 0, baseline_age: 60 },
    { patient_id: 'p2', eGFR: 58, time_since_baseline: 1, baseline_age: 60 },
    { patient_id: 'p3', eGFR: 55, time_since_baseline: 0, baseline_age: 70 },
    { patient_id: 'p3', eGFR: 53, time_since_baseline: 1, baseline_age: 70 },
  ], { baselineAge: 60 })).toEqual([
    { time_since_baseline: 0, eGFR: 70 },
    { time_since_baseline: 1, eGFR: 68 },
  ])
})
```

- [ ] **Step 2: Run failing overlay tests**

Run:

```bash
pnpm vitest run tests/ui/CohortTrajectoryOverlay.test.tsx
```

Expected: FAIL until the mean-line helper and overlay add the baseline-age term.

- [ ] **Step 3: Implement adjusted line calculation**

In `CohortTrajectoryOverlay.tsx`, compute:

```ts
const meanBaselineAge = useMemo(() => {
  const byPatient = new Map<string, number>()
  for (const row of activeMixedModelRows) {
    if (Number.isFinite(row.baseline_age) && !byPatient.has(row.patient_id)) {
      byPatient.set(row.patient_id, row.baseline_age as number)
    }
  }
  if (byPatient.size === 0) return null
  return [...byPatient.values()].reduce((sum, value) => sum + value, 0) / byPatient.size
}, [activeMixedModelRows])
```

Extend `mixedModelMeanLinePoints` in `resultIdentity.ts` to accept an optional covariate context:

```ts
export function mixedModelMeanLinePoints(
  result: MixedModelSuccess,
  rows: readonly MixedModelSpikeRow[],
  context: { baselineAge?: number | null } = {},
): MixedModelMeanLinePoint[] {
  // existing min/max time code
  const baselineAgeAdjustment =
    result.fixedEffects.baselineAge !== undefined && context.baselineAge !== null && context.baselineAge !== undefined
      ? result.fixedEffects.baselineAge * context.baselineAge
      : 0
  return [minTime, maxTime].map((time) => ({
    time_since_baseline: roundTo10Decimals(time),
    eGFR: roundTo10Decimals(result.fixedEffects.intercept + baselineAgeAdjustment + result.fixedEffects.timeSinceBaseline * time),
  }))
}
```

Call it from overlay as:

```ts
mixedModelMeanLinePoints(mixedModelResult.result, activeMixedModelRows, { baselineAge: meanBaselineAge })
```

- [ ] **Step 4: Run overlay tests**

Run:

```bash
pnpm vitest run tests/ui/CohortTrajectoryOverlay.test.tsx tests/core/mixedModel/resultIdentity.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/cohort/CohortTrajectoryOverlay.tsx tests/ui/CohortTrajectoryOverlay.test.tsx src/core/mixedModel/resultIdentity.ts tests/core/mixedModel/resultIdentity.test.ts
git commit -m "feat: adjust mixed model overlay for baseline age"
```

## Task 8: Full Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run mixed-model core tests**

Run:

```bash
pnpm vitest run tests/core/mixedModel
```

Expected: PASS.

- [ ] **Step 2: Run relevant UI tests**

Run:

```bash
pnpm vitest run tests/ui/CohortMixedModelConfigModal.test.tsx tests/ui/CohortMixedModelPanel.test.tsx tests/ui/CohortView.test.tsx tests/ui/CohortTrajectoryOverlay.test.tsx tests/ui/state/store.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full suite**

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

- [ ] **Step 5: Manual browser verification**

Run:

```bash
VITE_MIXED_MODEL_SPIKE=true pnpm dev
```

Expected manual checks:

- Cohort panel shows `Configure...`.
- Modal opens and shows default formula with `baseline_age`.
- `Cancel` discards draft changes.
- `Apply settings` updates formula summary and invalidates previous result.
- `Fit model` applies settings and starts worker fit.
- Missing baseline age blocks baseline-age model with a clear message.
- Overlay line appears only on `Years since baseline`.
