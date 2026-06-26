# Browser Mixed Model Spike Design

## Goal

Prove whether Lab Trajectory Explorer can fit a linear mixed-effects cohort model fully in the browser, without a backend, using the same filtered fit points that already drive visible cohort and patient analyses.

The first useful model is:

```text
eGFR_ij = beta0 + beta1 * time_since_baseline_ij
        + b0_j + b1_j * time_since_baseline_ij + epsilon_ij
```

Equivalent formula:

```text
eGFR ~ time_since_baseline + (1 + time_since_baseline | patient_id)
```

## Context

The current app is a browser-only Vite/React/TypeScript application. It supports patient-level fit models (`none`, `ols`, `theil-sen`, `rolling-ols`, `segmented-ols`) and cohort summaries built from the shared fit configuration.

Mixed models are not another patient plot fit. They are a cohort-level statistical analysis that estimates the mean cohort trajectory while allowing each patient to have their own intercept and slope.

The earlier fit-pipeline design explicitly excluded mixed cohort models from that phase. This spike is the next isolated step.

## Non-Goals

- Do not add a backend.
- Do not implement a hand-written production LMM optimizer in TypeScript.
- Do not add clinical treatment recommendations.
- Do not expose complex event-effect model formulas in the first UI.
- Do not replace existing patient-level OLS/Theil-Sen/rolling/segmented fits.
- Do not silently use a different data policy than the selected fit configuration.
- Do not load patient rows, patient identifiers, or model-ready datasets into any remote analysis service.

## Candidate Approaches

### Recommended: webR With R Mixed Model Package

Use webR in a Web Worker and call an R mixed-model package from the browser. Preferred package order:

1. `lme4`, if available and stable under WebAssembly.
2. `nlme`, if `lme4` is not viable and the needed random intercept/slope model works.

Advantages:

- Closest to common biostatistical workflow.
- Formula syntax maps directly to the model we want.
- Good fit for reproducible methodology documentation.

Risks:

- Large runtime and package download.
- Package availability depends on WebAssembly builds.
- `lme4` has compiled dependencies, so this must be tested before product work.
- Package licenses and redistribution constraints must be checked before product integration.

### Alternative: Pyodide With statsmodels

Use Pyodide in a Web Worker and call `statsmodels.MixedLM`.

Advantages:

- Mature Python statistics package.
- Browser-only is feasible through Pyodide.
- DataFrame handling may be convenient for JSON-to-table conversion.

Risks:

- Large runtime and package download.
- Need to verify current Pyodide support for `statsmodels` and its dependencies.
- MixedLM output and warnings differ from `lme4`, so methodology text must be explicit.
- Package licenses and redistribution constraints must be checked before product integration.

### Fallback: Browser-Friendly Approximation

If both WASM runtimes are too heavy or unstable, provide a non-mixed-model cohort slope summary:

```text
patient-level slope -> weighted cohort summary -> bootstrap interval
```

This must not be labelled as a mixed model.

Advantages:

- Simple, fast, and fully TypeScript-native.
- Useful as an exploratory cohort summary.

Risks:

- No partial pooling.
- Not equivalent to a random intercept/random slope model.

## Spike Architecture

Add an isolated browser mixed-model spike behind an internal entry point or debug panel, not the main clinical workflow.

```text
Current fit pipeline
-> model-ready rows
-> Web Worker
-> webR or Pyodide runtime
-> mixed model fit
-> typed result object
-> debug rendering / test assertion
```

The worker boundary is required so fitting and package loading do not block the React UI.

The debug entry point must be feature-gated and excluded from normal user workflows until one engine passes the spike gates below. Worker jobs must support timeout and cancellation. A worker load, package load, fit, crash, or timeout failure must return a structured error result and leave the main app usable.

Production integration must decide whether webR/Pyodide assets are self-hosted or CDN-loaded. The spike may use CDN loading for speed, but it must record that choice. Product integration requires either self-hosted assets or an explicit privacy review of dependency-fetch metadata. In all cases, model-ready patient data and patient identifiers must stay in the browser process and must not be sent to third-party services.

## Data Contract

The browser runtime receives rows with only analysis-ready fields:

```ts
interface MixedModelSpikeRow {
  patient_id: string
  eGFR: number
  time_since_baseline: number
}
```

`time_since_baseline` is measured in years from each patient's first included measurement for the selected series after event/AKI exclusions and optional time balancing. It is uncentered in the first spike so the intercept means expected eGFR at first included measurement. If convergence is poor, a later production design may add a centered time variant, but the transformation must be recorded in result metadata.

The selected fit configuration contributes only data policy to the mixed-model dataset:

- selected outcome series
- x-axis source needed to derive `time_since_baseline`
- event and AKI exclusions
- unknown-dialysis policy
- time balancing

The selected patient-level `fitModel` value does not change the mixed-model formula.

The eventual production adapter may also include:

```ts
interface MixedModelProductionRow {
  patient_id: string
  eGFR: number
  time_since_baseline: number
  age?: number
  source_row_index: number
  included: true
}
```

Excluded points stay out of the model dataset. The export/result metadata must record the active fit config so the model can be reproduced.

## Result Contract

The spike should normalize runtime-specific output into a discriminated union:

```ts
type MixedModelEngine = 'webr-lme4' | 'webr-nlme' | 'pyodide-statsmodels'

interface MixedModelMetadata {
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

interface MixedModelSuccess {
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

interface MixedModelFailure {
  status: 'unsupported' | 'runtime-error' | 'fit-error' | 'timeout' | 'cancelled'
  engine: 'webr-lme4' | 'webr-nlme' | 'pyodide-statsmodels'
  stage: 'worker-load' | 'runtime-load' | 'package-load' | 'data-validation' | 'fit' | 'result-extraction'
  code: string
  message: string
  warnings: string[]
  metadata: Partial<MixedModelMetadata>
}

type MixedModelResult = MixedModelSuccess | MixedModelFailure
```

The first spike does not need p-values. It should capture coefficients, variance components, convergence state, and warnings.

Fallback approximation output must use a separate type and label:

```ts
interface CohortSlopeApproximationResult {
  status: 'success' | 'insufficient-data'
  method: 'patient-slope-weighted-summary'
  label: 'Cohort slope summary (not a mixed model)'
  nPatients: number
  nMeasurements: number
  meanSlope: number | null
  confidenceInterval: [number, number] | null
  warnings: string[]
}
```

## UI Behavior

The spike UI, if added, should be clearly marked as exploratory. It should expose:

- selected engine
- load/runtime status
- model formula
- fixed effect for time since baseline
- random intercept/slope SDs
- residual SD
- warnings

No result should be shown as clinically actionable.

Failure results should show a concise user-facing status and a developer-facing detail block. Cancelling or timing out a worker must not clear the loaded dataset or change existing cohort/patient fit state.

## Validation

Use small deterministic synthetic datasets with known patient-level intercept and slope differences. Each dataset should have a stable `datasetId`, hash, and expected-output tolerance.

Acceptance checks:

- The browser runtime loads in a Web Worker.
- The model fits without freezing the UI.
- The normalized result includes fixed slope, random-effect SDs, residual SD, convergence flag, and warnings.
- The same dataset can be run through the chosen engine twice with fixed-effect estimates stable within absolute tolerance `1e-6` for deterministic engines, or a documented looser tolerance if the engine cannot guarantee bit-level repeatability.
- If the preferred engine cannot load or fit, the spike reports a clear unsupported-engine result instead of failing the app.
- Insufficient data returns `fit-error` or `unsupported` with a clear code when there are fewer than 3 patients, fewer than 2 included measurements for any modelled patient, or no within-patient time variation.
- Non-finite eGFR or time values are rejected before fitting with `stage: 'data-validation'`.
- Duplicate patient/time rows are either rejected or aggregated before fitting; the spike must document which policy is used.
- Singular or boundary random-effect fits are allowed only as `success` with a warning if the engine explicitly reports convergence; otherwise they are `fit-error`.
- Worker timeout, cancellation, package-load failure, and result-extraction failure each return a structured `MixedModelFailure`.

The spike should record coarse performance metrics:

- runtime cold-load time
- package-load time
- fit time
- approximate downloaded asset size
- browser and device class used for the measurement

## Decision Rule

Choose the engine after the spike:

1. Prefer webR plus `lme4` if it passes all gates below.
2. Use webR plus `nlme` if `lme4` fails availability/performance gates but `nlme` passes all gates and supports the required random intercept/random slope model.
3. Use Pyodide plus `statsmodels` if Python passes more gates than the R options and result extraction is reliable.
4. If none are acceptable, ship only model-ready export plus the non-mixed approximation, clearly labelled.

Minimum gates for product consideration:

- current Chrome, Firefox, and Safari can load the runtime and return either success or structured failure without crashing the app
- cold runtime plus package load finishes within 30 seconds on a current laptop-class machine
- fitting the small synthetic dataset finishes within 5 seconds after packages are loaded
- repeated-run fixed-effect differences stay within the validation tolerance
- convergence warnings and singular-fit warnings are captured in `warnings`
- runtime/package versions and dataset/config hashes are present in metadata
- no patient data leaves the browser process
- license and redistribution review is documented for all runtime and package dependencies

If an engine misses one performance gate but is otherwise technically strong, the implementation plan may keep it as an experimental hidden path, but it must not become the default product path.

## Implementation Boundary

The first implementation plan should build a technical spike only:

- add runtime dependency for one engine at a time
- run fitting in a worker
- use synthetic data first
- normalize one model result
- avoid adding persistent app settings
- avoid changing existing fit models

Product UI integration should wait until one browser engine proves viable.

## Spike Result

Measured on: Chrome 149 via Playwright, laptop-class development machine

- Engine attempted: webR + lme4
- Runtime/package load result: success
- Runtime cold-load time: not separately measured
- Package-load time: not separately measured
- Fit time after package load: not separately measured
- Approximate downloaded asset size: not measured
- Result status: success
- Product-gate assessment: not viable for product default

Observed click-to-result time was approximately 4.8 seconds on the synthetic cohort eGFR dataset after Vite dependency optimization had completed. The fit returned fixed effects, random-effect SDs, residual SD, runtime/package metadata, and a captured singular-fit warning. The result reported `converged: false`, so this remains an experimental hidden path rather than a product default.

No model-ready patient rows or patient identifiers were sent to a remote analysis service during this check.
